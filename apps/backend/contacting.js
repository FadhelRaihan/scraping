import {z} from 'zod';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {normalizePhone} from '../scraper/quality.js';
const variables=['nama','kategori','kota','rating','website'];
export const templateSchema=z.object({name:z.string().trim().min(1).max(100),body:z.string().trim().min(1).max(2000).refine(s=>{const rest=s.replace(/\{\{\s*(\w+)\s*\}\}/g,(match,key)=>variables.includes(key)?'':match);return !/[{}]/.test(rest)},'Variabel template tidak dikenal atau format kurung tidak valid'),is_active:z.boolean().default(true)});
export const renderTemplate=(body,lead)=>body.replace(/\{\{\s*(\w+)\s*\}\}/g,(_,key)=>String(lead[key]??''));
export async function migrateContacting(db){await db.query(await readFile(new URL('./migrations/004_contacting.sql',import.meta.url),'utf8'));}
const id=z.string().regex(/^[1-9]\d{0,17}$/);
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode});}
export function registerContacting(app,pool,config){
 const sign=s=>createHmac('sha256',config.SESSION_SECRET).update(s).digest('base64url');
 app.get('/api/message-templates',async()=> (await pool.query('SELECT * FROM message_templates ORDER BY updated_at DESC,id DESC')).rows);
 app.post('/api/message-templates',async r=>{const t=templateSchema.parse(r.body);return (await pool.query('INSERT INTO message_templates(name,body,is_active) VALUES($1,$2,$3) RETURNING *',[t.name,t.body,t.is_active])).rows[0]});
 app.put('/api/message-templates/:id',async r=>{const t=templateSchema.parse(r.body);const row=(await pool.query('UPDATE message_templates SET name=$2,body=$3,is_active=$4,updated_at=now() WHERE id=$1 RETURNING *',[id.parse(r.params.id),t.name,t.body,t.is_active])).rows[0];if(!row)fail('Template tidak ditemukan',404);return row;});
 app.delete('/api/message-templates/:id',async r=>{if(r.body?.confirm!==true)fail('Konfirmasi hapus permanen diperlukan');const result=await pool.query('DELETE FROM message_templates WHERE id=$1',[id.parse(r.params.id)]);if(!result.rowCount)fail('Template tidak ditemukan',404);return {ok:true};});
 app.get('/api/leads/:id/contact-preview',async r=>{
  const lead=(await pool.query('SELECT * FROM leads WHERE id=$1',[id.parse(r.params.id)])).rows[0];if(!lead)fail('Lead tidak ditemukan',404);
  if(lead.opted_out_at||lead.status==='do_not_contact')fail('Lead tidak boleh dihubungi',409);
  const t=(await pool.query('SELECT * FROM message_templates WHERE id=$1 AND is_active',[id.parse(r.query.template_id)])).rows[0];if(!t)fail('Template tidak tersedia',404);
  const phone=normalizePhone(lead.telepon)?.slice(1);if(!phone)fail('Nomor telepon tidak valid');
  const message=renderTemplate(t.body,lead);if(message.length>4000)fail('Pesan hasil render terlalu panjang');
  const snapshot={id:randomUUID(),lead_id:lead.id,template_id:t.id,template_name:t.name,phone,message,expires:Date.now()+86400000};
  const payload=Buffer.from(JSON.stringify(snapshot)).toString('base64url');return {...snapshot,token:`${payload}.${sign(payload)}`,url:`https://wa.me/${phone}?text=${encodeURIComponent(message)}`};
 });
 app.get('/api/leads/:id/contact-history',async r=>(await pool.query('SELECT * FROM lead_contacts WHERE lead_id=$1 ORDER BY contacted_at DESC',[id.parse(r.params.id)])).rows);
 app.post('/api/leads/:id/contacted',async r=>{
  const body=z.object({token:z.string().max(24000),note:z.string().trim().max(2000).default(''),confirmed:z.literal(true)}).parse(r.body);
  const [payload,signature,...rest]=body.token.split('.');const expected=Buffer.from(sign(payload));const actual=Buffer.from(signature||'');if(rest.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))fail('Preview tidak valid');
  let s;try{s=JSON.parse(Buffer.from(payload,'base64url').toString())}catch{fail('Preview tidak valid')}
  if(s.lead_id!==id.parse(r.params.id)||s.expires<Date.now())fail('Preview kedaluwarsa atau lead berbeda');
  const c=await pool.connect();try{await c.query('BEGIN');const lead=(await c.query('SELECT * FROM leads WHERE id=$1 FOR UPDATE',[s.lead_id])).rows[0];if(!lead)fail('Lead tidak ditemukan',404);if(lead.opted_out_at||lead.status==='do_not_contact')fail('Lead tidak boleh dihubungi',409);
   await c.query('INSERT INTO lead_contacts(id,lead_id,template_id,template_name_snapshot,phone_snapshot,message_snapshot,note) VALUES($1,$2,(SELECT id FROM message_templates WHERE id=$3 FOR KEY SHARE),$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[s.id,s.lead_id,s.template_id,s.template_name,s.phone,s.message,body.note]);
   if(['new','qualified'].includes(lead.status)){await c.query("UPDATE leads SET status='contacted',updated_at=now() WHERE id=$1",[s.lead_id]);await c.query("INSERT INTO lead_status_history(lead_id,old_status,new_status) VALUES($1,$2,'contacted')",[s.lead_id,lead.status]);}
   await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 });
 app.post('/api/leads/:id/opt-out',async r=>{const leadId=id.parse(r.params.id);const c=await pool.connect();try{await c.query('BEGIN');const lead=(await c.query('SELECT status FROM leads WHERE id=$1 FOR UPDATE',[leadId])).rows[0];if(!lead)fail('Lead tidak ditemukan',404);await c.query("UPDATE leads SET opted_out_at=COALESCE(opted_out_at,now()),status='do_not_contact',updated_at=now() WHERE id=$1",[leadId]);if(lead.status!=='do_not_contact')await c.query("INSERT INTO lead_status_history(lead_id,old_status,new_status) VALUES($1,$2,'do_not_contact')",[leadId,lead.status]);await c.query('COMMIT');return {ok:true}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}});
}
