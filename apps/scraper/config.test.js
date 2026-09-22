import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseConfig,defaults,queriesFor,compatible} from './config.js';
import {newCheckpoint} from './checkpoint.js';
test('config subset, duration bounds, compatibility and lossless archive',async()=>{
 const c=parseConfig({hours:.25,cities:[defaults.cities[0]],keywords:[defaults.keywords[0]],mode:'new'});
 assert.equal(queriesFor(c).length,1);assert.equal(compatible({config:c},c),true);assert.equal(compatible({},c),false);
 for(const bad of [{hours:0},{hours:.3},{hours:25},{cities:[]},{keywords:['unknown']}])assert.throws(()=>parseConfig(bad));
 const dir=await mkdtemp(join(tmpdir(),'projectadmin-config-'));
 try{await writeFile(`${dir}/state.json`,'old-checkpoint');await writeFile(`${dir}/hasil.csv`,'old-csv');await newCheckpoint(c,dir);const [archive]=await readdir(`${dir}/archive`);assert.equal(await readFile(`${dir}/archive/${archive}/state.json`,'utf8'),'old-checkpoint');assert.equal(JSON.parse(await readFile(`${dir}/state.json`,'utf8')).config.hours,.25);}finally{await rm(dir,{recursive:true,force:true});}
});
