import { readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { classify, retryDelay, batchDue } from './reliability.js';
export function createSync({ directory = 'data', url = process.env.API_URL, key = process.env.INGEST_API_KEY, request = fetch, now = Date.now } = {}) {
  let lastFlush = now(), nextRetry = 0, attempts = 0, imported = 0;
  return async function sync(results, { force = false, shouldStop = () => false, budget = 15000 } = {}) {
    if (!url || !key) return { imported, disabled: true };
    let lock;
    try { lock = await open(`${directory}/sync.lock`, 'wx'); }
    catch (e) { if (e.code === 'EEXIST') return { imported, locked: true }; throw e; }
    try {
      const read = async name => { try { return JSON.parse(await readFile(`${directory}/${name}`, 'utf8')); } catch(e) { if(e.code==='ENOENT')return {}; throw e; } };
      const synced = await read('synced.json'), rejected = await read('sync-rejected.json');
      const retry = await read('sync-retry.json');
      nextRetry = Math.max(nextRetry, retry.nextRetry || 0);
      attempts = Math.max(attempts, retry.attempts || 0);
      const pending = Object.entries(results).map(([place_key,row])=>({place_key,row,hash:createHash('sha256').update(JSON.stringify(row)).digest('hex')})).filter(x=>synced[x.place_key]!==x.hash && rejected[x.place_key]?.hash!==x.hash);
      if(now()<nextRetry || !batchDue(pending.length,now()-lastFlush,force)) return { imported,pending:pending.length,rejected:Object.keys(rejected).length,next_retry_at:nextRetry||null };
      const deadline=now()+budget;lastFlush=now();
      let sent=0;
      for(const item of pending.slice(0,force?pending.length:25)) {
        if(now()>=deadline || shouldStop())break;
        const {place_key,row,hash}=item;
        try {
          const response=await request(new URL('/api/internal/leads/upsert',url),{method:'POST',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({...row,place_key}),signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-now())))});
          if(!response.ok){const e=new Error(`HTTP ${response.status}`);e.status=response.status;e.retryAfter=response.headers.get('retry-after');throw e;}
          const ack=await response.json();
          if(ack.ok!==true)throw new Error('Invalid API acknowledgement');
          synced[place_key]=hash;sent++;if(ack.id)imported++;attempts=0;nextRetry=0;
          await writeFile(`${directory}/sync-retry.json.tmp`,JSON.stringify({nextRetry,attempts}));await rename(`${directory}/sync-retry.json.tmp`,`${directory}/sync-retry.json`);
          await writeFile(`${directory}/synced.json.tmp`,JSON.stringify(synced));await rename(`${directory}/synced.json.tmp`,`${directory}/synced.json`);
        } catch(e) {
          if (e.code) throw e;
          const category=classify(e);
          if(category.fatal)throw e;
          if(category.retryable){nextRetry=now()+retryDelay(attempts++,e.retryAfter);await writeFile(`${directory}/sync-retry.json.tmp`,JSON.stringify({nextRetry,attempts}));await rename(`${directory}/sync-retry.json.tmp`,`${directory}/sync-retry.json`);console.error(`Sync tertunda: ${category.code}; retry ${new Date(nextRetry).toISOString()}`);break;}
          rejected[place_key]={hash,error_code:category.code,at:new Date().toISOString()};
          await writeFile(`${directory}/sync-rejected.json.tmp`,JSON.stringify(rejected));await rename(`${directory}/sync-rejected.json.tmp`,`${directory}/sync-rejected.json`);
        }
      }
      return {imported,pending:pending.filter(x=>synced[x.place_key]!==x.hash&&rejected[x.place_key]?.hash!==x.hash).length,rejected:Object.keys(rejected).length,next_retry_at:nextRetry||null};
    } finally {await lock.close();await unlink(`${directory}/sync.lock`);}
  };
}
export const syncResults=createSync();
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(!process.env.API_URL||!process.env.INGEST_API_KEY)throw new Error('API_URL dan INGEST_API_KEY diperlukan');
 const state=JSON.parse(await readFile('data/state.json','utf8'));
 const result=await syncResults(state.results,{force:true,budget:60000});
 console.log(JSON.stringify(result));if(result.pending||result.locked||result.rejected)process.exitCode=1;
}
