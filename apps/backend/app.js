import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { randomBytes, timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import { statuses, leadSchema, filtersSchema, whereFilters, orderBy, csvCell, cityFromAddress } from './core.js';
import { registerJobs } from './jobs.js';
import { quality } from '../scraper/quality.js';
import { registerHistory } from './history.js';
import { registerContacting } from './contacting.js';
const derive = promisify(scrypt);
function equal(a, b) { const x = Buffer.from(a ?? ''); const y = Buffer.from(b ?? ''); return x.length === y.length && timingSafeEqual(x, y); }
const idSchema = z.string().regex(/^[1-9]\d{0,17}$/);
export async function buildApp(pool, config = process.env) {
  for (const key of ['ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'INGEST_API_KEY']) if (!config[key]) throw new Error(`${key} belum diatur`);
  const app = Fastify({ logger: true, bodyLimit: 32768 });
  const sessions = new Map(); // ponytail: one admin, sessions reset on restart; use DB sessions for multiple instances.
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: error.issues.map(i => i.message).join('; ') });
    if (error.statusCode && error.statusCode < 500) return reply.code(error.statusCode).send({ error: error.message });
    request.log.error(error);
    reply.code(500).send({ error: 'Operasi gagal. Periksa koneksi database atau log backend.' });
  });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    if (request.url.startsWith('/api/internal/')) {
      if (!equal(request.headers['x-api-key'], config.INGEST_API_KEY)) return reply.code(401).send({ error: 'API key tidak valid' });
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        const allowed = config.APP_ORIGIN || 'http://127.0.0.1:5173';
        if (origin !== allowed) {
          return reply.code(403).send({ error: 'Origin tidak diizinkan' });
        }
      }
    }
    if (request.url === '/api/auth/login') return;
    const signed = request.cookies.session && request.unsignCookie(request.cookies.session);
    const expires = signed?.valid && sessions.get(signed.value);
    if (!expires || expires < Date.now()) return reply.code(401).send({ error: 'Silakan login' });
    request.sessionId = signed.value;
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) }).parse(request.body);
    const [salt, hash] = config.ADMIN_PASSWORD_HASH.split(':');
    const computed = (await derive(body.password, salt, 64)).toString('hex');
    if (!equal(computed, hash) || body.email.toLowerCase() !== config.ADMIN_EMAIL.toLowerCase()) return reply.code(401).send({ error: 'Email atau password salah' });
    const token = randomBytes(32).toString('hex');
    sessions.clear();
    sessions.set(token, Date.now() + 12 * 3600000);
    reply.setCookie('session', token, { signed: true, httpOnly: true, sameSite: 'strict', secure: config.COOKIE_SECURE === '1', path: '/', maxAge: 12 * 3600 });
    return { email: config.ADMIN_EMAIL };
  });
  app.get('/api/auth/me', async () => ({ email: config.ADMIN_EMAIL }));
  registerJobs(app, pool, config);
  registerHistory(app, pool);
  registerContacting(app,pool,config);
  app.post('/api/auth/logout', async (request, reply) => { sessions.delete(request.sessionId); reply.clearCookie('session', { path: '/' }); return { ok: true }; });
  app.post('/api/internal/leads/upsert', { config: { rateLimit: false } }, async request => {
    const d = leadSchema.parse(request.body);
    const metadata={...quality(d),jumlah_ulasan:d.jumlah_ulasan??null,kategori_maps:d.kategori_maps??[],status_operasional:d.status_operasional??'unknown',jam_buka_raw:d.jam_buka_raw??null,latitude:d.latitude??null,longitude:d.longitude??null};
    if(metadata.google_maps_place_id){const existing=await pool.query("SELECT place_key FROM leads WHERE quality->>'google_maps_place_id'=$1",[metadata.google_maps_place_id]);if(existing.rows[0])d.place_key=existing.rows[0].place_key;}
    const values = [d.place_key, d.nama, d.alamat, cityFromAddress(d.alamat), d.rating === '' || d.rating == null ? null : d.rating, d.telepon, d.website, d.label_pencarian.split(' di ')[0], d.label_pencarian, d.url_maps, d.ulasan_terbaru, d.diambil_pada];
    values.push(JSON.stringify(metadata));
    const result = await pool.query(`INSERT INTO leads (place_key,nama,alamat,kota,rating,telepon,website,kategori,label_pencarian,url_maps,ulasan_terbaru,scraped_at,quality)
      VALUES (${values.map((_, i) => `$${i + 1}`).join(',')})
      ON CONFLICT (place_key) DO UPDATE SET nama=EXCLUDED.nama,alamat=EXCLUDED.alamat,kota=EXCLUDED.kota,rating=EXCLUDED.rating,telepon=EXCLUDED.telepon,website=EXCLUDED.website,kategori=EXCLUDED.kategori,label_pencarian=EXCLUDED.label_pencarian,url_maps=EXCLUDED.url_maps,ulasan_terbaru=EXCLUDED.ulasan_terbaru,scraped_at=EXCLUDED.scraped_at,updated_at=now(),quality=EXCLUDED.quality || jsonb_build_object('kategori_pencarian',(SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements(COALESCE(leads.quality->'kategori_pencarian','[]') || EXCLUDED.quality->'kategori_pencarian') x))
      WHERE EXCLUDED.scraped_at >= leads.scraped_at RETURNING id`, values);
    return { ok: true, id: result.rows[0]?.id ?? null };
  });
  app.get('/api/leads', async request => {
    const f = filtersSchema.parse(request.query); const { sql, values } = whereFilters(f);
    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM leads ${sql} ORDER BY ${orderBy[f.sort]} LIMIT 25 OFFSET $${values.length + 1}`, [...values, (f.page - 1) * 25]),
      pool.query(`SELECT count(*)::int AS total FROM leads ${sql}`, values)
    ]);
    return { items: rows.rows, total: count.rows[0].total, page: f.page, pageSize: 25 };
  });
  app.get('/api/leads/export', async (request, reply) => {
    const f = filtersSchema.parse(request.query); const { sql, values } = whereFilters(f);
    const client = await pool.connect();
    const fields = ['nama','alamat','kota','rating','telepon','website','kategori','status','ulasan_terbaru','scraped_at','url_maps'];
    fields.push('quality');
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`DECLARE export_rows NO SCROLL CURSOR FOR SELECT * FROM leads ${sql} ORDER BY ${orderBy[f.sort]}`, values);
      const { Readable } = await import('node:stream');
      async function* chunks() {
        try {
          yield '\ufeff' + fields.join(',') + '\r\n';
          while (true) {
            const { rows } = await client.query('FETCH 500 FROM export_rows');
            if (!rows.length) break;
            yield rows.map(row => fields.map(field => csvCell(field==='quality'?JSON.stringify(row.quality):row[field] instanceof Date ? row[field].toISOString() : row[field])).join(',')).join('\r\n') + '\r\n';
          }
        } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
      }
      return reply.header('Content-Disposition', 'attachment; filename="prospek-leads.csv"').type('text/csv; charset=utf-8').send(Readable.from(chunks()));
    } catch (error) { try { await client.query('ROLLBACK'); } finally { client.release(); } throw error; }
  });
  app.get('/api/leads/:id', async (request, reply) => {
    const id = idSchema.parse(request.params.id);
    const [lead, notes, history] = await Promise.all([
      pool.query('SELECT * FROM leads WHERE id=$1', [id]),
      pool.query('SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC,id DESC', [id]),
      pool.query('SELECT * FROM lead_status_history WHERE lead_id=$1 ORDER BY created_at DESC,id DESC', [id])
    ]);
    if (!lead.rows.length) return reply.code(404).send({ error: 'Lead tidak ditemukan' });
    return { ...lead.rows[0], notes: notes.rows, history: history.rows };
  });
  app.patch('/api/leads/:id/status', async (request, reply) => {
    const id = idSchema.parse(request.params.id); const { status } = z.object({ status: z.enum(statuses) }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT status FROM leads WHERE id=$1 FOR UPDATE', [id]);
      if (!current.rows.length) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Lead tidak ditemukan' }); }
      if (current.rows[0].status !== status) {
        await client.query('UPDATE leads SET status=$2,updated_at=now() WHERE id=$1', [id, status]);
        await client.query('INSERT INTO lead_status_history(lead_id,old_status,new_status) VALUES($1,$2,$3)', [id, current.rows[0].status, status]);
      }
      await client.query('COMMIT'); return { ok: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  app.post('/api/leads/:id/notes', async (request, reply) => {
    const id = idSchema.parse(request.params.id); const { content } = z.object({ content: z.string().trim().min(1).max(5000) }).parse(request.body);
    const result = await pool.query('INSERT INTO lead_notes(lead_id,content) SELECT id,$2 FROM leads WHERE id=$1 RETURNING *', [id, content]);
    if (!result.rows.length) return reply.code(404).send({ error: 'Lead tidak ditemukan' });
    return result.rows[0];
  });
  app.get('/api/stats/overview', async () => {
    const [summary, cities, pipeline, ratings, categories] = await Promise.all([
      pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='new')::int new,count(*) FILTER(WHERE website='')::int without_website,count(*) FILTER(WHERE status='won')::int won,max(scraped_at) last_scraped FROM leads"),
      pool.query('SELECT kota label,count(*)::int count FROM leads GROUP BY kota ORDER BY count DESC,kota'),
      pool.query('SELECT status label,count(*)::int count FROM leads GROUP BY status'),
      pool.query("SELECT CASE WHEN rating>=4 THEN '4–5' WHEN rating>=3 THEN '3–3,9' WHEN rating IS NULL THEN 'Belum ada' ELSE '< 3' END label,count(*)::int count FROM leads GROUP BY 1 ORDER BY 1"),
      pool.query('SELECT DISTINCT kategori FROM leads ORDER BY kategori')
    ]);
    return { ...summary.rows[0], cities: cities.rows, pipeline: pipeline.rows, ratings: ratings.rows, categories: categories.rows.map(r => r.kategori) };
  });
  const root = fileURLToPath(new URL('../frontend/dist', import.meta.url));
  try {
    const index = await readFile(`${root}/index.html`);
    for (const path of ['/', '/templates', '/overview', '/leads', '/web-opportunities', '/scraping','/scraping/history','/scraping/coverage','/scraping/compare']) app.get(path, async (_, reply) => reply.type('text/html').send(index));
    for (const name of await readdir(`${root}/assets`)) {
      if (!/^[\w.-]+\.(js|css)$/.test(name)) continue;
      const data = await readFile(`${root}/assets/${name}`);
      app.get(`/assets/${name}`, async (_, reply) => reply.type(name.endsWith('.js') ? 'application/javascript' : 'text/css').send(data));
    }
  }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return app;
}
