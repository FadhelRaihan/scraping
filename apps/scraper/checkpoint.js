import { readFile,mkdir,copyFile,rename,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
export async function readCheckpoint(directory='data'){
 try{const s=JSON.parse(await readFile(`${directory}/state.json`,'utf8'));if(s.version!==1||!s.places||!s.results||!Number.isInteger(s.queryIndex))throw Error('Checkpoint tidak valid');return s;}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function newCheckpoint(config,directory='data'){
 const archive=`${directory}/archive/${Date.now()}-${randomUUID()}`;
 await mkdir(archive,{recursive:true});
 // Copy first: interruption never removes the active checkpoint or its sync ledger.
 for(const name of ['state.json','hasil.csv','synced.json','sync-retry.json','sync-rejected.json']){
  try{await copyFile(`${directory}/${name}`,`${archive}/${name}`);}catch(e){if(e.code!=='ENOENT')throw e;}
 }
 const state={version:1,config,queryIndex:0,places:{},results:{},queryErrors:[]};
 await writeFile(`${directory}/state.json.tmp`,JSON.stringify(state));await rename(`${directory}/state.json.tmp`,`${directory}/state.json`);
 return state;
}
