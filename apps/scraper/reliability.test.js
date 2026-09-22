import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSync } from './sync.js';
import { classify, retryDelay } from './reliability.js';
test('batch threshold, acknowledgement, retry-after and dedup survive restart', async () => {
 const directory=await mkdtemp(join(tmpdir(),'projectadmin-check-'));let clock=0,calls=0,limited=false;
 const request=async()=>{calls++;return limited?new Response('{}',{status:429,headers:{'retry-after':'59'}}):Response.json({ok:true,id:'1'})};
 const opts={directory,url:'http://localhost',key:'test',request,now:()=>clock};
 const sync=createSync(opts);const rows={a:{nama:'A'}};
 try{
  await sync(rows);assert.equal(calls,0);
  clock=30000;await sync(rows);assert.equal(calls,1);
  await createSync(opts)(rows,{force:true});assert.equal(calls,1);
  limited=true;rows.b={nama:'B'};await sync(rows,{force:true});assert.equal(calls,2);
  clock+=1000;await sync(rows,{force:true});assert.equal(calls,2);
  clock+=61000;limited=false;await sync(rows,{force:true});assert.equal(calls,3);
  assert.equal(Object.keys(JSON.parse(await readFile(join(directory,'synced.json'),'utf8'))).length,2);
  assert.equal(classify({status:401}).fatal,true);assert.equal(classify(new Error('CAPTCHA')).fatal,true);
  assert.equal(retryDelay(0,'59',0,()=>0),59000);
 }finally{await rm(directory,{recursive:true,force:true})}
});
