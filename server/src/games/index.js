// Game schedulers. Only the leader replica (Postgres advisory lock) runs them; every replica serves the API.
import { isLeader } from '../lib/leader.js';
import * as crash from './crash.js';
import * as virtual from './virtual.js';
import * as vsports from './vsports.js';
import * as jackpot from './jackpot.js';
import { expireBonuses } from '../lib/bonus.js';
import { sweepApi } from '../payments/flows.js';
import { sweep as sweepWalletPayouts } from '../lib/walletPayouts.js';
import { tick as manualTick } from '../lib/manual.js';
import { tick as liveScoresTick } from '../feeds/livescores.js';
import { referralSweep } from '../routes/bets.js';
import { release as releaseAgentEarnings } from '../lib/agents.js';

/** Heartbeats for /health: last successful run of each scheduler on this replica (only the leader runs them). */
const STATUS = { leader: false, ok: {}, err: {} };
export const gamesStatus = () => STATUS;

export function startGames() {
  if (process.env.GAMES === 'off') return console.log('[games] schedulers off (GAMES=off)');
  const loop = (name, fn, ms) => {
    let busy = false;
    setInterval(async () => {
      if (busy) return; busy = true;
      try { STATUS.leader = await isLeader(); if (STATUS.leader) { await fn(); STATUS.ok[name] = new Date().toISOString(); delete STATUS.err[name]; } } catch (e) { STATUS.err[name] = e.message; console.error(`[games:${name}]`, e.message); } finally { busy = false; }
    }, ms);
  };
  loop('crash', crash.tick, 200);
  loop('virtual', virtual.tick, 1000);
  loop('vsports', vsports.tick, 1000);
  loop('jackpot', jackpot.tick, 30000);
  loop('bonuses', expireBonuses, 60000);
  loop('agents', releaseAgentEarnings, Number(process.env.AGENTS_TICK_MS) || 60000);   // agent earnings whose player has played their deposit
  loop('payments', async () => { await sweepApi(); await sweepWalletPayouts(); }, Number(process.env.PAYMENTS_SWEEP_MS) || 60000);   // API deposits / payouts / admin sends whose webhook was missed
  loop('manual', manualTick, Number(process.env.MANUAL_TICK_MS) || 5000);
  loop('livescores', liveScoresTick, 5000);
  loop('referrals', referralSweep, 60000);   // Refer & Earn: paid once the friend's settled bets have lost the reward   // real matches' live scores (API-Football) – idle without APIFOOTBALL_KEY        // hand-added matches: kick-off, clock, live betting (closes when the score is stale)
  console.log('[games] schedulers started');
}
