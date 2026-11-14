// Rocket Crash – shared rounds for every player, decided by the server.
// Each round is fixed before betting opens: a random seed is drawn and hash = sha256(seed) is stored with it;
//   point = crashPoint( first 52 bits of HMAC-SHA256(key = seed, "LetBetAfrika Rocket Crash") / 2^52 )
// with crashPoint() from betting/game-logic.js (3% house edge, cap 200x).
// Players only ever see round ids, phases and crash points. The seed/hash audit is admin-only:
// GET /api/admin/games/crash/verify/:id (for disputes and regulator checks).
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { move, debit } from '../lib/wallet.js';
import { getSetting } from '../lib/settings.js';
import { GL, r2 } from './rng.js';

const { CRASH, crashPoint, crashMult, crashFlyMs } = GL;
const WAIT = CRASH.waitMs, AFTER = CRASH.crashedMs;
const err = (m, status = 409, detail) => Object.assign(new Error(m), { status, detail });

export const hashSeed = seed => createHash('sha256').update(seed).digest('hex');
export function pointFromSeed(seed) {
  const h = createHmac('sha256', seed).update('LetBetAfrika Rocket Crash').digest('hex');
  return crashPoint(parseInt(h.slice(0, 13), 16) / 2 ** 52);
}

/* ---------------- scheduler (leader only) ---------------- */
let cur = null;
async function newRound() {
  const seed = randomBytes(32).toString('hex'), point = pointFromSeed(seed), now = Date.now(), starts = now + WAIT;
  const { rows } = await q(`INSERT INTO crash_rounds (hash, seed, point, bet_from, starts_at, crash_at) VALUES ($1,$2,$3,to_timestamp($4/1000.0),to_timestamp($5/1000.0),to_timestamp($6/1000.0)) RETURNING *`,
    [hashSeed(seed), seed, point, now, starts, starts + crashFlyMs(point)]);
  return rows[0];
}
const maxPay = async () => (await getSetting('max_payout')) || { NG: 50000000, GH: 500000 };

/** Pay auto cash-outs whose target the rocket has reached (and, at the crash, settle the rest). */
async function settle(round, uptoMult, final) {
  const mp = await maxPay();
  await tx(async c => {
    const { rows } = await c.query(`UPDATE game_bets g SET status = CASE WHEN g.auto IS NOT NULL AND g.auto <= $2 AND g.auto <= $3 THEN 'cashed' ELSE 'lost' END,
        mult = CASE WHEN g.auto IS NOT NULL AND g.auto <= $2 AND g.auto <= $3 THEN g.auto ELSE 0 END,
        payout = CASE WHEN g.auto IS NOT NULL AND g.auto <= $2 AND g.auto <= $3 THEN LEAST(round(g.stake * g.auto, 2), CASE u.country WHEN 'GH' THEN $5::numeric ELSE $4::numeric END) ELSE 0 END,
        result = jsonb_build_object('point', $3::numeric), settled_at = now()
      FROM users u WHERE u.id = g.user_id AND g.game = 'crash' AND g.round = $1 AND g.status = 'open' AND ($6 OR (g.auto IS NOT NULL AND g.auto <= $2 AND g.auto <= $3))
      RETURNING g.id, g.user_id, g.payout, g.status`, [round.id, uptoMult, round.point, mp.NG, mp.GH, final]);
    for (const b of rows) if (b.status === 'cashed' && b.payout > 0) await move(c, b.user_id, 'game_win', b.payout, b.id, { game: 'crash', round: Number(round.id), auto: true });
    if (final) await c.query('UPDATE crash_rounds SET settled = true WHERE id = $1', [round.id]);
  });
  cache.t = 0;
}

export async function tick() {
  const now = Date.now();
  if (!cur) cur = (await q('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1')).rows[0] || null;
  if (cur && !cur.settled) {
    const s = +cur.starts_at, c = +cur.crash_at;
    if (now >= c) { await settle(cur, cur.point, true); cur.settled = true; }
    else if (now >= s) await settle(cur, crashMult(now - s), false);
  }
  if (!cur || (cur.settled && now >= +cur.crash_at + AFTER)) { cur = await newRound(); cache.t = 0; }
}

/* ---------------- player actions (any replica) ---------------- */
const latest = async () => (await q('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1')).rows[0];

export async function placeBet(user, stake, auto) {
  const round = await latest();
  if (!round || Date.now() >= +round.starts_at) throw err('betting_closed');
  const id = 'C' + randomBytes(5).toString('hex').toUpperCase();
  const out = await tx(async c => {
    const balance = await debit(c, user.id, 'game_bet', stake, id, { game: 'crash', round: Number(round.id) });
    try {
      const { rowCount } = await c.query(`INSERT INTO game_bets (id, user_id, game, round, stake, auto, status)
        SELECT $1,$2,'crash',$3,$4,$5,'open' WHERE now() < (SELECT starts_at FROM crash_rounds WHERE id = $3)`, [id, user.id, round.id, stake, auto || null]);
      if (!rowCount) throw err('betting_closed');
    } catch (e) { if (e.code === '23505') throw err('already_in_round'); throw e; }
    return { id, round: Number(round.id), stake, auto: auto || null, balance };
  });
  cache.t = 0;
  return out;
}

export async function cashOut(user) {
  const round = await latest(), now = Date.now();
  if (!round || now < +round.starts_at) throw err('not_started');
  if (now >= +round.crash_at) throw err('crashed', 409, { point: round.point });
  const m = crashMult(now - +round.starts_at), mp = await maxPay();
  const out = await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM game_bets WHERE game='crash' AND round=$1 AND user_id=$2 AND status='open' FOR UPDATE`, [round.id, user.id]);
    const b = rows[0]; if (!b) throw err('no_open_bet');
    const mult = b.auto && b.auto <= m ? Number(b.auto) : m;
    const payout = Math.min(mp[user.country] ?? Infinity, r2(Number(b.stake) * mult));
    const u = await c.query(`UPDATE game_bets SET status='cashed', mult=$2, payout=$3, settled_at=now() WHERE id=$1 AND status='open' AND now() < (SELECT crash_at FROM crash_rounds WHERE id=$4)`, [b.id, mult, payout, round.id]);
    if (!u.rowCount) throw err('crashed', 409, { point: round.point });
    const balance = await move(c, user.id, 'game_win', payout, b.id, { game: 'crash', round: Number(round.id) });
    return { id: b.id, round: Number(round.id), mult, payout, balance };
  });
  cache.t = 0;
  return out;
}

export async function cancel(user) {
  const round = await latest();
  const out = await tx(async c => {
    const { rows } = await c.query(`UPDATE game_bets SET status='void', settled_at=now() WHERE game='crash' AND round=$1 AND user_id=$2 AND status='open'
      AND now() < (SELECT starts_at FROM crash_rounds WHERE id=$1) RETURNING id, stake`, [round?.id ?? 0, user.id]);
    if (!rows[0]) throw err('cannot_cancel');
    const balance = await move(c, user.id, 'refund', rows[0].stake, rows[0].id, { game: 'crash', round: Number(round.id) });
    return { id: rows[0].id, refunded: Number(rows[0].stake), balance };
  });
  cache.t = 0;
  return out;
}

/* ---------------- public state (shared, cached) ---------------- */
const cache = { t: 0, v: null };
// players are shown masked: 080****45 for a phone, ad**** for an email-only account
const mask = (phone, email) => (phone ? ('0' + phone).slice(0, 3) + '****' + String(phone).slice(-2) : email ? String(email).split('@')[0].slice(0, 2) + '****' : 'Player');
export async function state() {
  if (cache.v && Date.now() - cache.t < 150) return { ...cache.v, now: Date.now() };
  const round = await latest(), now = Date.now();
  let v = { round: null, history: [], bets: [] };
  if (round) {
    const phase = now < +round.starts_at ? 'betting' : now < +round.crash_at ? 'flying' : 'crashed';
    const [hist, bets] = await Promise.all([
      q(`SELECT id, point FROM crash_rounds WHERE settled ORDER BY id DESC LIMIT 15`),
      q(`SELECT g.id, g.stake, g.auto, g.mult, g.payout, g.status, u.country, u.phone, u.email FROM game_bets g JOIN users u ON u.id = g.user_id
         WHERE g.game='crash' AND g.round=$1 AND g.status <> 'void' ORDER BY g.stake DESC LIMIT 60`, [round.id]),
    ]);
    v = {
      round: { id: Number(round.id), betFrom: +round.bet_from, startsAt: +round.starts_at, phase,
        ...(phase === 'crashed' ? { point: Number(round.point), crashAt: +round.crash_at } : {}) },
      history: hist.rows.map(h => ({ id: Number(h.id), point: Number(h.point) })),
      bets: bets.rows.map(b => ({ id: b.id, name: mask(b.phone, b.email), cc: b.country, stake: Number(b.stake), auto: b.auto == null ? null : Number(b.auto),
        out: b.status === 'cashed' ? Number(b.mult) : null, payout: Number(b.payout), status: b.status })),
    };
  }
  cache.v = v; cache.t = Date.now();
  return { ...v, now: Date.now() };
}

export async function verify(id) {
  const { rows } = await q('SELECT id, hash, seed, point, crash_at FROM crash_rounds WHERE id=$1', [id]);
  const r = rows[0]; if (!r || Date.now() < +r.crash_at) throw err('not_finished', 404);   // only once the rocket has crashed
  return { id: Number(r.id), hash: r.hash, seed: r.seed, point: Number(r.point), check: { hashOk: hashSeed(r.seed) === r.hash, point: pointFromSeed(r.seed) } };
}
