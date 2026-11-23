// Weekly Jackpot – the server fixes the 12 games of each round, tickets must cover exactly those games,
// and when every game is over the round is graded and paid automatically.
//   Prizes come from the round's prize fund (settings 'jackpot_fund', share of the round's ticket sales per country):
//   12 correct share t12 of sales + the carry-over from rounds nobody won (settings 'jackpot_pool'), at most the
//   advertised jackpot; 11 / 10 correct share t11 / t10 of sales, at most the advertised amount per line.
//   Rounds opened before the fund keep their fixed prizes (rules = null).
// A cancelled game, or one not finished 48 h after kick-off, gets its result drawn at random,
// weighted by the 1X2 prices (CSPRNG) – as the rules on the Jackpot page say.
import { q, tx } from '../db/pool.js';
import { move } from '../lib/wallet.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { rng, r2 } from './rng.js';

const outcome = (h, a) => (h > a ? '1' : h === a ? 'X' : '2');
const KEYS = ['1', 'X', '2'];
const draw = oc => { const p = KEYS.map(k => (oc?.[k]?.o ? 1 / oc[k].o : 1 / 3)); let u = rng() * p.reduce((a, b) => a + b, 0); for (let i = 0; i < 3; i++) if ((u -= p[i]) < 0) return KEYS[i]; return '2'; };

/** The round open for tickets now (created on demand from the next 12 football fixtures with prices). */
export async function currentRound() {
  const open = await q(`SELECT * FROM jackpot_rounds WHERE status='open' AND closes_at > now() ORDER BY id DESC LIMIT 1`);
  if (open.rows[0]) return open.rows[0];
  return tx(async c => {
    await c.query('SELECT pg_advisory_xact_lock(5512026)');
    const again = await c.query(`SELECT * FROM jackpot_rounds WHERE status='open' AND closes_at > now() ORDER BY id DESC LIMIT 1`);
    if (again.rows[0]) return again.rows[0];
    const { rows: evs } = await c.query(`SELECT e.id, e.kickoff FROM events e JOIN markets m ON m.event_id = e.id AND m.key = '1x2' AND NOT m.suspended
      WHERE e.sport = 'football' AND e.status = 'scheduled' AND e.kickoff > now() + interval '20 minutes' ORDER BY e.kickoff, e.id LIMIT 12`);
    if (evs.length < 12) return null;
    const rules = { fund: (await getSetting('jackpot_fund')) || { t12: 0.35, t11: 0.15, t10: 0.10 }, caps: await getSetting('jackpot') };
    const { rows } = await c.query(`INSERT INTO jackpot_rounds (code, event_ids, closes_at, rules)
      VALUES ((SELECT coalesce(max(id), 0) + 1001 FROM jackpot_rounds)::text, $1, $2, $3) RETURNING *`, [evs.map(e => e.id), evs[0].kickoff, rules]);
    return rows[0];
  });
}

/** Final 1X2 outcome per game, or null while any game is still to finish. */
export async function outcomesFor(ids) {
  const { rows } = await q(`SELECT e.id, e.status, e.score_home, e.score_away, e.kickoff, m.outcomes FROM events e
    LEFT JOIN markets m ON m.event_id = e.id AND m.key = '1x2' WHERE e.id = ANY($1)`, [ids]);
  const out = {};
  for (const id of ids) {
    const e = rows.find(x => Number(x.id) === Number(id));
    if (e && e.status === 'finished') out[id] = { o: outcome(e.score_home, e.score_away) };
    else if (!e || e.status === 'cancelled' || +e.kickoff < Date.now() - 48 * 3600e3) out[id] = { o: draw(e?.outcomes), drawn: true };
    else return null;
  }
  return out;
}

/** Lines with exactly k correct picks, for k = 12, 11, 10 (product of per-game polynomials). */
export function tiers(picks, oc) {
  let poly = [1];
  for (const p of picks) {
    const S = [...new Set(p.outcomes)], c = S.includes(oc[p.eventId]?.o) ? 1 : 0, w = S.length - c, next = new Array(poly.length + 1).fill(0);
    poly.forEach((v, k) => { next[k] += v * w; next[k + 1] += v * c; });
    poly = next;
  }
  return { 12: poly[12] || 0, 11: poly[11] || 0, 10: poly[10] || 0 };
}

async function pay(c, tickets, summary, code) {
  for (const { t, h } of tickets) {
    const s = summary[t.country];
    const prize = r2(h[12] * s.t12.prize + h[11] * s.t11.prize + h[10] * s.t10.prize);
    await c.query(`UPDATE jackpot_tickets SET status=$2, hits=$3, prize=$4, settled_at=now() WHERE ref=$1`, [t.ref, prize > 0 ? 'won' : 'lost', h, prize]);
    if (prize > 0) await move(c, t.user_id, 'jackpot_win', prize, t.ref, { round: code, hits: h });
  }
}

export async function settleRound(r) {
  const oc = await outcomesFor(r.event_ids.map(Number));
  if (!oc) return false;
  const cfg = await getSetting('jackpot');
  await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM jackpot_tickets WHERE round_id=$1 AND status='open' FOR UPDATE`, [r.id]);
    const per = rows.map(t => ({ t, h: tiers(t.picks, oc) })), summary = {};
    const pool = r.rules ? { NG: 0, GH: 0, ...((await getSetting('jackpot_pool')) || {}) } : null;
    for (const cc of ['NG', 'GH']) {
      const mine = per.filter(x => x.t.country === cc), sum = k => mine.reduce((s, x) => s + x.h[k], 0);
      const w12 = sum(12), w11 = sum(11), w10 = sum(10);
      if (!r.rules) {   // a round opened before the prize fund: its fixed prizes
        const k = cfg[cc];
        summary[cc] = { t12: { lines: w12, prize: w12 ? r2(k.jackpot / w12) : 0 }, t11: { lines: w11, prize: k.t11 }, t10: { lines: w10, prize: k.t10 } };
        continue;
      }
      const f = r.rules.fund, k = (r.rules.caps || cfg)[cc], sales = mine.reduce((s, x) => s + Number(x.t.cost), 0);
      const jp = Math.max(Number((f.seed || {})[cc]) || 0, Number(pool[cc] || 0) + sales * f.t12);   // the pot: share of sales + carry-over (at least the optional seed)
      const p12 = w12 ? r2(Math.min(k.jackpot, jp) / w12) : 0;
      pool[cc] = r2(Math.max(0, jp - p12 * w12));            // nobody won (or the cap was reached): it carries over
      const share = (frac, lines, cap) => (lines ? r2(Math.min(cap, (sales * frac) / lines)) : 0);
      summary[cc] = { sales: r2(sales), t12: { lines: w12, prize: p12 }, t11: { lines: w11, prize: share(f.t11, w11, k.t11) }, t10: { lines: w10, prize: share(f.t10, w10, k.t10) }, carryOver: pool[cc] };
    }
    if (pool) await setSetting('jackpot_pool', pool);
    await pay(c, per, summary, r.code);
    await c.query(`UPDATE jackpot_rounds SET status='settled', outcomes=$2, summary=$3, settled_at=now() WHERE id=$1`, [r.id, oc, summary]);
  });
  return true;
}

/** The jackpot pot of the open round now, per country: its share of the sales so far + the carry-over (for the page). */
export async function currentPot(round) {
  if (!round || !round.rules) return null;
  const pool = (await getSetting('jackpot_pool')) || {}, f = round.rules.fund, caps = round.rules.caps || {};
  const { rows } = await q(`SELECT country, coalesce(sum(cost),0)::float AS s FROM jackpot_tickets WHERE round_id=$1 GROUP BY country`, [round.id]);
  const out = {};
  for (const cc of ['NG', 'GH']) { const s = (rows.find(x => x.country === cc) || {}).s || 0; out[cc] = { pot: r2(Math.min((caps[cc] || {}).jackpot || Infinity, Math.max(Number((f.seed || {})[cc]) || 0, Number(pool[cc] || 0) + s * f.t12))), cap: (caps[cc] || {}).jackpot, sales: r2(s) }; }
  return out;
}

export async function tick() {
  const { rows } = await q(`SELECT * FROM jackpot_rounds WHERE status='open' AND closes_at <= now() ORDER BY id`);
  for (const r of rows) await settleRound(r);
  // tickets bought before server rounds existed: graded on their own 12 games, jackpot not shared
  const { rows: legacy } = await q(`SELECT * FROM jackpot_tickets WHERE round_id IS NULL AND status='open' ORDER BY created_at LIMIT 100`);
  if (legacy.length) {
    const cfg = await getSetting('jackpot');
    for (const t of legacy) {
      const oc = await outcomesFor(t.picks.map(p => p.eventId)); if (!oc) continue;
      const k = cfg[t.country], summary = { [t.country]: { t12: { prize: k.jackpot }, t11: { prize: k.t11 }, t10: { prize: k.t10 } } };
      await tx(c => pay(c, [{ t, h: tiers(t.picks, oc) }], summary, t.round_code));
    }
  }
}
