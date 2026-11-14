import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// numeric → number so money maths works in JS (we keep 2dp everywhere)
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, v => (v === null ? null : Number(v))); // bigint

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') || process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export const q = (text, params) => pool.query(text, params);

/** Run fn inside a transaction with a client. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
