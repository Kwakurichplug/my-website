import { q } from '../db/pool.js';

const cache = new Map();
export async function getSetting(key) {
  const hit = cache.get(key);
  if (hit && hit.t > Date.now() - 30000) return hit.v;
  const { rows } = await q('SELECT value FROM settings WHERE key=$1', [key]);
  const v = rows[0]?.value;
  cache.set(key, { v, t: Date.now() });
  return v;
}
export async function setSetting(key, value) {
  await q('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
  cache.delete(key);
}
