import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().then(() => { console.log('schema applied'); return pool.end(); })
    .catch(e => { console.error(e); process.exit(1); });
}
