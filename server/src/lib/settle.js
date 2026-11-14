// Grades a leg against a finished event, settles bets, and prices cashouts.
import { q, tx } from '../db/pool.js';
import { move } from './wallet.js';
import { sendEmail } from '../emails/index.js';

const r3 = (x, y) => (x > y ? '1' : x === y ? 'X' : '2');
const ou = (v, k) => { const L = parseFloat(k.slice(1)); return k[0] === 'o' ? v > L : v < L; };

/** Returns 'won' | 'lost' | 'void' for a leg given the event's final state. */
export function gradeLeg(leg, ev) {
  const h = ev.score_home, a = ev.score_away, d = h - a, t = h + a, ok = leg.outcome_key || leg.outcome;
  const mk = leg.market_key || leg.market;
  const st = ev.stats || {};
  const ht = [ev.ht_home ?? 0, ev.ht_away ?? 0];
  let w;
  switch (mk) {
    case '1x2': w = r3(h, a) === ok; break;
    case 'dc': w = ok.includes(r3(h, a)); break;
    case 'dnb': if (d === 0) return 'void'; w = r3(h, a) === ok; break;
    case 'gg': w = (h > 0 && a > 0) === (ok === 'gg'); break;
    case 'ou': w = ou(t, ok); break;
    case 'hou': w = ou(h, ok); break;
    case 'aou': w = ou(a, ok); break;
    case 'oe': w = (t % 2 === 1) === (ok === 'odd'); break;
    case '1h1x2': w = r3(ht[0], ht[1]) === ok; break;
    case '1hou': w = ou(ht[0] + ht[1], ok); break;
    case 'htft': w = r3(ht[0], ht[1]) + '/' + r3(h, a) === ok; break;
    case 'cs': w = ok === 'oth' ? (h > 4 || a > 4) : ok === `${h}-${a}`; break;
    case 'eh-1': w = (d >= 2 ? '1' : d === 1 ? 'X' : '2') === ok; break;
    case 'eh+1': w = (d >= 0 ? '1' : d === -1 ? 'X' : '2') === ok; break;
    case 'cor': { const c = st.corners ? st.corners[0] + st.corners[1] : null; if (c == null) return 'void'; w = ou(c, ok); break; }
    case 'next': { const n = +((leg.market_name || '').match(/\((\d+)\)/) || [0, 1])[1]; const g = (st.goals || [])[n - 1]; w = g ? (g.side ? '2' : '1') === ok : ok === 'none'; break; }
    case 'win': if (d === 0) return 'void'; w = (d > 0 ? '1' : '2') === ok; break;
    case 'hcp': { const hl = st.handicapLines || [-1.5, -3.5, -7.5]; const cover = d + hl[+ok[1]] > 0; w = ok.endsWith('1') ? cover : !cover; break; }
    case 'tot': { const tot = st.total ?? t; w = ou(tot, ok); break; }
    default: return 'void';
  }
  return w ? 'won' : 'lost';
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
    await tx(async c => {
      const { rows } = await c.query('SELECT * FROM bets WHERE id=$1 AND status=\'open\' FOR UPDATE', [id]);
      const b = rows[0]; if (!b) return;
      const ls = (await c.query('SELECT * FROM bet_legs WHERE bet_id=$1', [id])).rows;
      if (ls.some(l => l.result === 'lost')) {
        await c.query(`UPDATE bets SET status='lost', paid=0, settled_at=now() WHERE id=$1`, [id]); settled++; notify(b, ls, 'lost', 0); return;
      }
      if (!ls.every(l => l.result)) return;
      const odds = ls.reduce((acc, l) => acc * (l.result === 'void' ? 1 : Number(l.odd)), 1);
      const base = Number(b.stake) * odds;
      const allWon = ls.every(l => l.result === 'won');
      const paid = Math.min(Number(b.potential) || Infinity, allWon && b.boost_pct ? base + (base - Number(b.stake)) * b.boost_pct / 100 : base);
      const status = ls.every(l => l.result === 'void') ? 'void' : 'won';
      await c.query(`UPDATE bets SET status=$2, paid=$3, settled_at=now() WHERE id=$1`, [id, status, Math.round(paid * 100) / 100]);
      const balance = await move(c, b.user_id, status === 'won' ? 'win' : 'refund', paid, id);
      settled++;
      notify(b, ls, status, paid, balance);
    });
  }
  return settled;
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
