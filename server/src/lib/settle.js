// Grades a leg against a finished event, settles bets, and prices cashouts.
import { createRequire } from 'node:module';
import { q, tx } from '../db/pool.js';
import { move } from './wallet.js';
import { addTurnover } from './bonus.js';
import { sendEmail } from '../emails/index.js';

const r3 = (x, y) => (x > y ? '1' : x === y ? 'X' : '2');
const ou = (v, k) => { const L = parseFloat(k.slice(1)); return k[0] === 'o' ? v > L : v < L; };

const M = createRequire(import.meta.url)('../../../betting/markets.js');

/** Returns 'won' | 'lost' | 'void' for a leg given the event's final state. */
export function gradeLeg(leg, ev) {
  const h = ev.score_home, a = ev.score_away, d = h - a, t = h + a, ok = leg.outcome_key || leg.outcome;
  const mk = leg.market_key || leg.market;
  const st = ev.stats || {};
  // two-way sports (basketball, tennis…)
  if (mk === 'win') return d === 0 ? 'void' : (d > 0 ? '1' : '2') === ok ? 'won' : 'lost';
  if (mk === 'spr') { const [line, pick] = String(ok).split('|'), v = d + parseFloat(line); if (!Number.isFinite(v) || !['1', '2'].includes(pick)) return 'void'; return v === 0 ? 'void' : (pick === '1' ? v > 0 : v < 0) ? 'won' : 'lost'; }
  if (mk === 'hcp') { const hl = st.handicapLines || [-1.5, -3.5, -7.5]; const cover = d + hl[+ok[1]] > 0; return (ok.endsWith('1') ? cover : !cover) ? 'won' : 'lost'; }
  if (mk === 'tot') { const tot = st.total ?? t, L = parseFloat(ok.slice(1)); if (tot === L) return 'void'; return (ok[0] === 'o' ? tot > L : tot < L) ? 'won' : 'lost'; }
  // football: every market key the engine offers (unknown keys are void, never paid)
  return M.grade(mk, ok, { h, a, ht: ev.ht_home != null && ev.ht_away != null ? [ev.ht_home, ev.ht_away] : null,
    corners: st.corners || null, cards: st.cards || null, goals: st.goals || null, marketName: leg.market_name || leg.marketName });
}

/** Settle every open leg on a finished event, then every bet that is now fully graded. */
export async function settleEvent(eventId) {
  const { rows: evs } = await q('SELECT * FROM events WHERE id=$1', [eventId]);
  const ev = evs[0];
  if (!ev || ev.status !== 'finished' && ev.status !== 'cancelled') return 0;
  const { rows: legs } = await q('SELECT * FROM bet_legs WHERE event_id=$1 AND result IS NULL', [eventId]);
  for (const l of legs) {
    const result = ev.status === 'cancelled' ? 'void' : gradeLeg(l, ev);
    await q('UPDATE bet_legs SET result=$2 WHERE id=$1', [l.id, result]);
  }
  const betIds = [...new Set(legs.map(l => l.bet_id))];
  let settled = 0;
  for (const id of betIds) {
    let released = [], owner = null;
    await tx(async c => {
      const { rows } = await c.query('SELECT * FROM bets WHERE id=$1 AND status=\'open\' FOR UPDATE', [id]);
      const b = rows[0]; if (!b) return;
      const ls = (await c.query('SELECT * FROM bet_legs WHERE bet_id=$1', [id])).rows;
      if (ls.some(l => l.result === 'lost')) {
        await c.query(`UPDATE bets SET status='lost', paid=0, settled_at=now() WHERE id=$1`, [id]); released = await addTurnover(c, b, ls); owner = b.user_id; settled++; notify(b, ls, 'lost', 0); return;
      }
      if (!ls.every(l => l.result)) return;
      const odds = ls.reduce((acc, l) => acc * (l.result === 'void' ? 1 : Number(l.odd)), 1);
      const base = Number(b.stake) * odds;
      const allWon = ls.every(l => l.result === 'won');
      const paid = Math.min(Number(b.potential) || Infinity, allWon && b.boost_pct ? base + (base - Number(b.stake)) * b.boost_pct / 100 : base);
      const status = ls.every(l => l.result === 'void') ? 'void' : 'won';
      await c.query(`UPDATE bets SET status=$2, paid=$3, settled_at=now() WHERE id=$1`, [id, status, Math.round(paid * 100) / 100]);
      const balance = await move(c, b.user_id, status === 'won' ? 'win' : 'refund', paid, id);
      if (status === 'won') { released = await addTurnover(c, b, ls); owner = b.user_id; }
      settled++;
      notify(b, ls, status, paid, balance);
    });
    if (released.length) bonusReleased(owner, released);
  }
  return settled;
}

// the welcome bonus turned into cash: tell the player (after the settlement has committed)
async function bonusReleased(userId, list) {
  const { rows } = await q('SELECT * FROM users WHERE id=$1', [userId]);
  for (const x of list) sendEmail('bonusCredited', rows[0], { amount: x.amount, name: x.promo ? `Promo bonus ${x.promo}` : 'Welcome Bonus', balance: x.balance,
    terms: `You reached the wagering target, so your ${x.promo ? 'promo' : 'welcome'} bonus is now cash in your balance. Bet with it or withdraw it.` });
}

async function notify(b, ls, status, paid, balance) {
  const { rows } = await q('SELECT * FROM users WHERE id=$1', [b.user_id]);
  const bet = { id: b.id, type: b.type, stake: b.stake, odds: b.odds, boost: b.boost_pct, potential: b.potential, status, paid, placedAt: b.placed_at, settledAt: new Date(), legs: ls.map(l => ({ match: l.match_name, market: l.market_name, pick: l.label, odd: l.odd, result: l.result })) };
  if (status === 'won') sendEmail('betWon', rows[0], { bet, balance }); else sendEmail('betSettled', rows[0], { bet });
}

/** Cashout = stake × (original odds / current odds) × 0.92, capped below potential. Null if any leg is unpriced. */
export async function cashoutValue(bet, legs) {
  let cur = 1;
  for (const l of legs) {
    if (l.result === 'lost') return null;
    // a won leg is banked (contributes its full odd); a void leg drops out, so remove its odd from the bet odds
    if (l.result === 'won' || l.result === 'void') { cur *= l.result === 'won' ? 1 : Number(l.odd); continue; }
    const { rows } = await q('SELECT outcomes, suspended FROM markets WHERE event_id=$1 AND key=$2', [l.eventId ?? l.event_id, l.market ?? l.market_key]);
    const o = rows[0]?.outcomes?.[l.outcome ?? l.outcome_key];
    if (!rows[0] || rows[0].suspended || !o || o.o == null) return null;
    cur *= o.o;
  }
  const v = Number(bet.stake) * (Number(bet.odds) / cur) * 0.92;
  return Math.round(Math.min(Number(bet.potential) * 0.97, v) * 100) / 100;
}
