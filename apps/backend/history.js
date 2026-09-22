import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { csvCell } from './core.js';
export async function migrateHistory(db){await db.query(await readFile(new URL('./migrations/003_scrape_history.sql',import.meta.url),'utf8'));}
export async function persistHistory(db,id,history){
 if(!history)return;
 await db.query('UPDATE scrape_jobs SET config_snapshot=COALESCE(config_snapshot,$2) WHERE id=$1',[id,JSON.stringify(history.config)]);
 for(const q of Object.values(history.queries))await db.query(`INSERT INTO scrape_job_queries(job_id,query,city,keyword,status,started_at,finished_at,scroll_count,result_count,reached_end,error_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(job_id,query) DO UPDATE SET status=EXCLUDED.status,finished_at=EXCLUDED.finished_at,scroll_count=EXCLUDED.scroll_count,result_count=EXCLUDED.result_count,reached_end=EXCLUDED.reached_end,error_code=EXCLUDED.error_code`,[id,q.query,q.city,q.keyword,q.status,q.started_at,q.finished_at||null,q.scroll_count,q.result_count,q.reached_end,q.error_code||null]);
 for(const [key,p] of Object.entries(history.places))await db.query(`INSERT INTO scrape_job_places(job_id,place_key,queries,discovered_at,processed_at,result_status,error_code,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(job_id,place_key) DO UPDATE SET queries=EXCLUDED.queries,processed_at=EXCLUDED.processed_at,result_status=EXCLUDED.result_status,error_code=EXCLUDED.error_code,snapshot=EXCLUDED.snapshot`,[id,key,JSON.stringify(p.queries),p.discovered_at||null,p.processed_at||null,p.result_status,p.error_code||null,p.snapshot?JSON.stringify(p.snapshot):null]);
}
export function comparePlaces(base,latest){
 const a=new Map(base.map(x=>[x.place_key,x])),b=new Map(latest.map(x=>[x.place_key,x]));
 const fields=['nama','alamat','telepon','website','rating','ulasan_terbaru'];
 return [...new Set([...a.keys(),...b.keys()])].map(key=>{const before=a.get(key),after=b.get(key);const changed=before?.snapshot&&after?.snapshot?fields.filter(f=>JSON.stringify(before.snapshot[f]??null)!==JSON.stringify(after.snapshot[f]??null)):[];return {place_key:key,nama:after?.snapshot?.nama||before?.snapshot?.nama||key,status:!before?'new':!after?'missing_from_latest':changed.length?'changed':'returning',changed_fields:changed,before:before?.snapshot||null,after:after?.snapshot||null};});
}
export function registerHistory(app,pool){
 const id=z.string().regex(/^[1-9]\d{0,17}$/);
 const send=(request,reply,rows)=>{if(request.query.format!=='csv')return rows;const fields=rows.length?Object.keys(rows[0]):['status'];return reply.type('text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="ProjectAdmin-history.csv"').send('\ufeff'+[fields.join(','),...rows.map(r=>fields.map(f=>csvCell(typeof r[f]==='object'?JSON.stringify(r[f]):r[f])).join(','))].join('\r\n'));};
 app.get('/api/scraping/jobs',async request=>{const page=z.coerce.number().int().min(1).default(1).parse(request.query.page);return (await pool.query('SELECT id,status,started_at,finished_at,stop_reason,config_snapshot IS NOT NULL AS detailed FROM scrape_jobs ORDER BY id DESC LIMIT 25 OFFSET $1',[(page-1)*25])).rows;});
 app.get('/api/scraping/jobs/:id',async(request,reply)=>{const job=(await pool.query('SELECT * FROM scrape_jobs WHERE id=$1',[id.parse(request.params.id)])).rows[0];return job||reply.code(404).send({error:'Job tidak ditemukan'});});
 app.get('/api/scraping/jobs/:id/queries',async(request,reply)=>send(request,reply,(await pool.query('SELECT * FROM scrape_job_queries WHERE job_id=$1 ORDER BY started_at,query',[id.parse(request.params.id)])).rows));
 app.get('/api/scraping/jobs/:id/coverage',async(request,reply)=>send(request,reply,(await pool.query(`SELECT city,count(*)::int queries,count(*) FILTER(WHERE status='completed')::int completed,count(*) FILTER(WHERE status='incomplete')::int incomplete,count(*) FILTER(WHERE status IN ('failed','blocked'))::int failed,sum(result_count)::int visible_results FROM scrape_job_queries WHERE job_id=$1 GROUP BY city ORDER BY city`,[id.parse(request.params.id)])).rows));
 app.get('/api/scraping/jobs/:id/places',async(request)=>{const page=z.coerce.number().int().min(1).default(1).parse(request.query.page);return (await pool.query('SELECT p.*,l.id AS lead_id FROM scrape_job_places p LEFT JOIN leads l USING(place_key) WHERE job_id=$1 ORDER BY p.place_key LIMIT 100 OFFSET $2',[id.parse(request.params.id),(page-1)*100])).rows;});
 app.get('/api/scraping/compare',async(request,reply)=>{const a=id.parse(request.query.base_id),b=id.parse(request.query.compare_id);if(a===b)return reply.code(400).send({error:'Pilih dua sesi berbeda'});const [base,latest]=await Promise.all([pool.query('SELECT place_key,snapshot FROM scrape_job_places WHERE job_id=$1',[a]),pool.query('SELECT place_key,snapshot FROM scrape_job_places WHERE job_id=$1',[b])]);return send(request,reply,comparePlaces(base.rows,latest.rows));});
}
