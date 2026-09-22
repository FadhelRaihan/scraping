import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { defaults,parseConfig,queriesFor,compatible } from '../scraper/config.js';
import { readCheckpoint } from '../scraper/checkpoint.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function recoverJobs(pool) {
  // A worker owns its DB connection lock. PID alone cannot prove process ownership.
  const c = await pool.connect();
  try {
    const { rows } = await c.query('SELECT pg_try_advisory_lock(7319402) AS acquired');
    if (rows[0].acquired) {
      try { await c.query("UPDATE scrape_jobs SET status='failed',finished_at=now(),stop_reason='worker_lost' WHERE status IN ('queued','running','stopping') AND last_heartbeat < now()-interval '2 minutes'"); }
      finally { await c.query('SELECT pg_advisory_unlock(7319402)'); }
    }
  } finally { c.release(); }
}
export function registerJobs(app, pool, config) {
  app.get('/api/scraping/config/defaults',async()=>({defaults,checkpoint:(await readCheckpoint(`${root}/data`))?.config||defaults}));
  app.post('/api/scraping/preview',async request=>{const c=parseConfig(request.body);const state=await readCheckpoint(`${root}/data`);if(c.mode==='resume'&&state&&!compatible(state,c))throw Object.assign(Error('Konfigurasi berbeda dari checkpoint. Pilih Sesi baru.'),{statusCode:409});return {config:c,queries:queriesFor(c),pending:state?Object.values(state.places).filter(p=>p.status==='pending').length:0};});
  app.get('/api/scraping/status', async () => {
    await recoverJobs(pool);
    return (await pool.query('SELECT * FROM scrape_jobs ORDER BY id DESC LIMIT 1')).rows[0] ?? null;
  });
  app.get('/api/scraping/logs', async () => (await pool.query('SELECT logs FROM scrape_jobs ORDER BY id DESC LIMIT 1')).rows[0]?.logs ?? []);
  app.post('/api/scraping/start', async (request, reply) => {
    const c=parseConfig(request.body||{});
    if(c.mode==='new'&&request.body?.confirmNew!==true)return reply.code(400).send({error:'Konfirmasi arsip sesi lama diperlukan'});
    const state=await readCheckpoint(`${root}/data`);
    if(c.mode==='resume'&&state&&!compatible(state,c))return reply.code(409).send({error:'Konfigurasi berbeda dari checkpoint. Pilih Sesi baru.'});
    await recoverJobs(pool);
    try { await access(`${root}/data/session.lock`); return reply.code(409).send({ error: 'Checkpoint terkunci. Pastikan scraper terminal sudah berhenti.' }); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    let job;
    try { job = (await pool.query('INSERT INTO scrape_jobs(requested_hours,config_snapshot) VALUES($1,$2) RETURNING *',[c.hours,JSON.stringify(c)])).rows[0]; }
    catch (e) { if (e.code === '23505') return reply.code(409).send({ error: 'Scraping masih aktif' }); throw e; }
    const child = spawn(process.execPath, ['apps/scraper/worker.js'], {
      cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, ...config, SCRAPE_JOB_ID: String(job.id), HOURS: String(c.hours),SCRAPE_CONFIG_JSON:JSON.stringify(c) }
    });
    child.on('error', e => { void pool.query("UPDATE scrape_jobs SET status='failed',finished_at=now(),stop_reason=$2 WHERE id=$1", [job.id, e.message]).catch(error => app.log.error(error)); });
    child.unref();
    return reply.code(202).send(job);
  });
  app.post('/api/scraping/stop', async (_, reply) => {
    const result = await pool.query("UPDATE scrape_jobs SET status='stopping',stop_reason='user_request' WHERE status IN ('queued','running','stopping') RETURNING *");
    if (!result.rows.length) return reply.code(409).send({ error: 'Tidak ada scraping aktif' });
    return result.rows[0];
  });
}
