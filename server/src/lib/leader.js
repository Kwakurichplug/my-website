// One replica runs the game schedulers (Rocket Crash rounds, Virtual League, jackpot settlement).
// Leadership = a Postgres advisory lock held on a dedicated connection; if that connection dies the
// lock is released by Postgres and another replica takes over within a few seconds.
import { pool } from '../db/pool.js';

const KEY = 74202611;
let client = null, leader = false, nextTry = 0;

export async function isLeader() {
  if (leader) return true;
  if (Date.now() < nextTry) return false;
  nextTry = Date.now() + 5000;
  try {
    client = await pool.connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [KEY]);
    if (rows[0].ok) {
      leader = true;
      client.on('error', () => { leader = false; client = null; });
      return true;
    }
    client.release(); client = null;
  } catch { if (client) { try { client.release(); } catch {} } client = null; }
  return false;
}

/** On shutdown (a deploy): give the lock back at once, so the new replica takes the schedulers over without waiting. */
export async function resign() {
  if (!client) return;
  try { if (leader) await client.query('SELECT pg_advisory_unlock($1)', [KEY]); } catch {}
  try { client.release(); } catch {}
  client = null; leader = false;
}
