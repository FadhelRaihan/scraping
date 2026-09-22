import { z } from 'zod';
import { reviewStatus } from '../scraper/review.js';
import { reviewMetadata } from '../scraper/quality.js';
export const statuses = ['new', 'qualified', 'contacted', 'replied', 'meeting', 'proposal_sent', 'won', 'lost', 'do_not_contact'];
const text = z.string().trim().max(2000);
const url = z.string().url().max(8000).refine(v => /^https?:\/\//i.test(v), 'URL harus HTTP/HTTPS');
export const leadSchema = z.object({
  place_key: z.string().min(1).max(2000), nama: text.min(1), alamat: text.min(1),
  rating: z.union([z.literal(''), z.coerce.number().min(0).max(5)]).optional(),
  telepon: text.default(''), website: z.union([z.literal(''), url]).default(''),
  label_pencarian: text.default(''), url_maps: url,
  ulasan_terbaru: text.min(1), diambil_pada: z.string().datetime({ offset: true }),
  latest_review_at: z.string().date().nullable().optional(),
  jumlah_ulasan:z.number().int().min(0).max(100000000).nullable().optional(),
  kategori_maps:z.array(text).max(20).optional(),kategori_pencarian:z.array(text).max(100).optional(),
  status_operasional:z.enum(['open','temporarily_closed','permanently_closed','unknown']).optional(),
  jam_buka_raw:text.nullable().optional(),latitude:z.number().min(-90).max(90).nullable().optional(),longitude:z.number().min(-180).max(180).nullable().optional()
}).superRefine((lead, ctx) => {
  if (!/Jawa Barat|West Java/i.test(lead.alamat)) ctx.addIssue({ code: 'custom', message: 'Wilayah bukan Jawa Barat' });
  if (Date.parse(lead.diambil_pada) > Date.now() + 300000) ctx.addIssue({ code: 'custom', message: 'Waktu scraping di masa depan' });
  if (reviewMetadata(lead.ulasan_terbaru,lead.latest_review_at,new Date(lead.diambil_pada)).review_filter_status !== 'recent') ctx.addIssue({ code: 'custom', message: 'Ulasan tidak memenuhi filter' });
});
export const filtersSchema = z.object({
  q: z.string().trim().max(200).default(''), kota: text.default(''), kategori: text.default(''),
  status: z.enum(['', ...statuses]).default(''), website: z.enum(['', 'yes', 'no']).default(''),
  phone: z.enum(['', 'yes', 'no']).default(''),
  contact:z.enum(['','not_contacted','contacted','opted_out']).default(''),
  rating: z.coerce.number().min(0).max(5).default(0),
  from: z.string().date().optional(), to: z.string().date().optional(),
  sort: z.enum(['latest', 'oldest', 'name', 'rating']).default('latest'),
  page: z.coerce.number().int().min(1).max(1000000).default(1)
  ,precision:z.enum(['','exact','relative','ambiguous','unknown']).default(''),website_status:z.enum(['','listed','missing','invalid','unknown']).default(''),operational:z.enum(['','open','temporarily_closed','permanently_closed','unknown']).default(''),min_reviews:z.coerce.number().int().min(0).max(100000000).default(0),maps_category:text.default('')
}).refine(f => !f.from || !f.to || f.from <= f.to, 'Rentang tanggal tidak valid');
export function whereFilters(f) {
  const values = [];
  const parts = [];
  const add = (sql, value) => { values.push(value); parts.push(sql.replace('?', `$${values.length}`)); };
  if (f.q) add("(nama ILIKE ? OR alamat ILIKE $1)", `%${f.q.replace(/[\\%_]/g, '\\$&')}%`);
  for (const field of ['kota', 'kategori', 'status']) if (f[field]) add(`${field} = ?`, f[field]);
  for (const [filter, column] of [['website', 'website'], ['phone', 'telepon']]) if (f[filter]) parts.push(`${column} ${f[filter] === 'yes' ? '<>' : '='} ''`);
  if (f.rating) add('rating >= ?', f.rating);
  if(f.contact==='opted_out')parts.push("(opted_out_at IS NOT NULL OR status='do_not_contact')");
  if(f.contact==='not_contacted')parts.push("opted_out_at IS NULL AND status<>'do_not_contact' AND NOT EXISTS(SELECT 1 FROM lead_contacts c WHERE c.lead_id=leads.id)");
  if(f.contact==='contacted')parts.push('EXISTS(SELECT 1 FROM lead_contacts c WHERE c.lead_id=leads.id)');
  for(const [field,key] of [['precision','review_date_precision'],['website_status','website_status'],['operational','status_operasional']])if(f[field])add(`quality->>'${key}' = ?`,f[field]);
  if(f.min_reviews)add("(quality->>'jumlah_ulasan')::int >= ?",f.min_reviews);
  if(f.maps_category)add("quality->'kategori_maps' @> ?::jsonb",JSON.stringify([f.maps_category]));
  if (f.from) add('scraped_at >= ?::date', f.from);
  if (f.to) add("scraped_at < ?::date + interval '1 day'", f.to);
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', values };
}
export const orderBy = { latest: 'scraped_at DESC, id DESC', oldest: 'scraped_at ASC, id ASC', name: 'nama ASC, id ASC', rating: 'rating DESC NULLS LAST, id DESC' };
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]|^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function cityFromAddress(address) {
  return address.match(/(?:Kota|Kabupaten|Kab\.)\s+[^,\d]+/i)?.[0].trim().replace(/^Kab\./i, 'Kabupaten') ?? '';
}
