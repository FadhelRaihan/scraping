import { readFile } from 'node:fs/promises';
import { createPool } from './db.js';
import { quality } from '../scraper/quality.js';
import { migrateHistory } from './history.js';
import { migrateContacting } from './contacting.js';
const pool = createPool();
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('./migrations/002_quality_fields.sql', import.meta.url), 'utf8'));
  const old = await client.query("SELECT * FROM leads WHERE quality='{}'::jsonb");
  for(const row of old.rows){const q=quality({...row,diambil_pada:row.scraped_at.toISOString()});q.google_maps_place_id=null;await client.query('UPDATE leads SET quality=$2 WHERE id=$1',[row.id,JSON.stringify(q)]);}
  await client.query('COMMIT');
  await migrateHistory(client);
  await migrateContacting(client);
  console.log('Schema database siap.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
