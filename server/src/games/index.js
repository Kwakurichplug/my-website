// Game schedulers. Only the leader replica (Postgres advisory lock) runs them; every replica serves the API.
import { isLeader } from '../lib/leader.js';
import * as crash from './crash.js';
import * as virtual from './virtual.js';
import * as jackpot from './jackpot.js';

export function startGames() {
  if (process.env.GAMES === 'off') return console.log('[games] schedulers off (GAMES=off)');
  const loop = (name, fn, ms) => {
    let busy = false;
    setInterval(async () => {
      if (busy) return; busy = true;
      try { if (await isLeader()) await fn(); } catch (e) { console.error(`[games:${name}]`, e.message); } finally { busy = false; }
    }, ms);
  };
  loop('crash', crash.tick, 200);
  loop('virtual', virtual.tick, 1000);
  loop('jackpot', jackpot.tick, 30000);
  console.log('[games] schedulers started');
}
