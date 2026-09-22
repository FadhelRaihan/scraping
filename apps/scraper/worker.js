import { createPool } from '../backend/db.js';
import { persistHistory } from '../backend/history.js';
import { readFile } from 'node:fs/promises';
const pool = createPool();
const client = await pool.connect();
const id = process.env.SCRAPE_JOB_ID;
let timer, checking = false, locked = false;
let logs = [], progress = {}, dbFailed = false;
let lastHistory='';
const original = { log: console.log, error: console.error };
for (const level of ['log', 'error']) console[level] = (...args) => {
  const message = args.map(String).join(' ').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 1500);
  logs.push({ at: new Date().toISOString(), level, message }); logs = logs.slice(-150);
};
globalThis.scrapeProgress = value => { progress = value; };
async function tick() {
  if (checking) return;
  checking = true;
  try {
    try {const raw=await readFile(`data/history-${id}.json`,'utf8');if(raw!==lastHistory){await persistHistory(client,id,JSON.parse(raw));lastHistory=raw;}}catch(e){if(e.code!=='ENOENT')throw e;}
    const result = await client.query("UPDATE scrape_jobs SET last_heartbeat=now(),progress=$2,logs=$3 WHERE id=$1 RETURNING status", [id, JSON.stringify(progress), JSON.stringify(logs)]);
    if (result.rows[0]?.status === 'stopping') globalThis.requestScrapeStop?.('user_request');
  } catch { dbFailed = true; globalThis.requestScrapeStop?.('database_lost'); }
  finally { checking = false; }
}
try {
  locked = (await client.query('SELECT pg_try_advisory_lock(7319402) AS acquired')).rows[0].acquired;
  if (!locked) throw new Error('worker_lock_conflict');
  client.on('error', () => { dbFailed = true; globalThis.requestScrapeStop?.('database_lost'); });
  await client.query("UPDATE scrape_jobs SET status=CASE WHEN status='stopping' THEN status ELSE 'running' END,pid=$2,last_heartbeat=now() WHERE id=$1", [id, process.pid]);
  timer = setInterval(() => void tick(), 3000);
  await import('./index.js');
  clearInterval(timer);
  while (checking) await new Promise(resolve => setTimeout(resolve, 20));
  await tick();
  await client.query("UPDATE scrape_jobs SET status=CASE WHEN $2 THEN 'failed' WHEN status='stopping' THEN 'stopped' ELSE 'completed' END,finished_at=now(),stop_reason=$3 WHERE id=$1", [id, Boolean(process.exitCode || dbFailed), dbFailed ? 'database_lost' : progress.stop_reason || (process.exitCode ? 'worker_error' : 'queue_finished')]);
} catch (e) {
  await client.query("UPDATE scrape_jobs SET status='failed',finished_at=now(),stop_reason=$2 WHERE id=$1", [id, e.message]).catch(() => {});
} finally {
  clearInterval(timer);
  while (checking) await new Promise(resolve => setTimeout(resolve, 20));
  if (locked) await client.query('SELECT pg_advisory_unlock(7319402)').catch(() => {});
  client.release(); await pool.end(); Object.assign(console, original);
}
