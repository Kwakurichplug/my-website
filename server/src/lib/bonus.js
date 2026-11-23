// Deposit bonuses, held as locked bonus funds and released into the balance once the player has staked `times` × the
// bonus on multiples where every selection is priced at `min_odds` or more, within `days` days. Void and cashed-out
// bets do not count, and a stake counts towards ONE bonus only (the oldest active one), so it is never counted twice.
//   Deposit 1, 2, 3 (settings 'deposit_bonuses', admin-set): a bonus on each of the first three deposits made once the
//     player's ID is approved – % and cap per step and country. While enabled it replaces the welcome bonus.
//   Welcome bonus (settings 'welcome_bonus'): 200% of the player's FIRST deposit – used only when the ladder is off.
// Every successful deposit must go through creditDeposit() – the admin's confirmation, support deposits and the payment
// API (webhook / status check) – so the bonuses work the same everywhere.
import { q } from '../db/pool.js';
import { move } from './wallet.js';
import { getSetting } from './settings.js';

const r2 = n => Math.round(n * 100) / 100;
export const LADDER_KINDS = ['deposit1', 'deposit2', 'deposit3'];

/** The rules in force: the Deposit 1-2-3 ladder when enabled, else the welcome bonus. */
export async function bonusRules() {
  const lad = await getSetting('deposit_bonuses');
  if (lad && lad.enabled) return { ladder: lad, times: Number(lad.times), min_odds: Number(lad.min_odds), days: Number(lad.days) };
  const wb = await getSetting('welcome_bonus');
  return { ladder: null, welcome: wb, times: Number(wb?.times), min_odds: Number(wb?.min_odds), days: Number(wb?.days) };
}

/** Credit a confirmed deposit (inside the caller's transaction) and grant the bonus it earns. move() locks the
 *  player's row first, so two deposits credited at once are counted one after the other (never the same step twice). */
export async function creditDeposit(c, user, amount, paymentId, meta = {}) {
  const balance = await move(c, user.id, 'deposit', amount, paymentId, meta);
  const R = await bonusRules();
  if (R.ladder) {
    const { rows: [u] } = await c.query('SELECT country, verified FROM users WHERE id=$1', [user.id]);
    if (R.ladder.requireId === false || u.verified) {
      // the steps used so far; an old first-deposit welcome bonus counts as Deposit 1 (never a 4th bonus)
      const { rows: [g] } = await c.query(`SELECT (count(*) FILTER (WHERE kind = ANY($2::text[])) + least(1, count(*) FILTER (WHERE kind = 'welcome')))::int AS n
        FROM bonuses WHERE user_id=$1`, [user.id, LADDER_KINDS]);
      const step = (R.ladder[u.country] || [])[g.n];
      const bonus = step ? r2(Math.min(Number(step.max), Number(amount) * Number(step.pct) / 100)) : 0;
      if (bonus > 0 && R.times > 0 && R.days > 0) {
        await c.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at, payment_id) VALUES ($1, $2, $3, $4, now() + make_interval(days => $5), $6)
          ON CONFLICT (user_id, kind) DO NOTHING`, [user.id, LADDER_KINDS[g.n], bonus, r2(bonus * R.times), R.days, paymentId]);
      }
    }
    return balance;
  }
  const cfg = R.welcome, k = cfg && cfg[user.country];
  if (k) {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [user.id]);
    const bonus = r2(Math.min(k.max, Number(amount) * k.pct / 100));
    if (rows[0].n === 1 && bonus > 0) {
      await c.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at, payment_id) VALUES ($1, 'welcome', $2, $3, now() + make_interval(days => $4), $5)
        ON CONFLICT (user_id, kind) DO NOTHING`, [user.id, bonus, r2(bonus * cfg.times), cfg.days, paymentId]);
    }
  }
  return balance;
}

/** Count a settled bet towards the player's oldest active bonus (inside the settlement transaction). */
export async function addTurnover(c, bet, legs) {
  const R = await bonusRules();
  const priced = legs.filter(l => l.result !== 'void');
  if (!(R.min_odds > 0) || bet.type !== 'multiple' || priced.length < 2 || !priced.every(l => Number(l.odd) >= R.min_odds)) return [];
  const { rows } = await c.query(`UPDATE bonuses SET wagered = least(required, wagered + $2)
      WHERE id = (SELECT id FROM bonuses WHERE user_id=$1 AND status='active' AND expires_at > now() AND created_at <= $3 ORDER BY created_at, id LIMIT 1)
      RETURNING id, kind, amount, required, wagered`, [bet.user_id, bet.stake, bet.placed_at]);
  const released = [];   // returned so the caller can email the player once the transaction has committed
  for (const b of rows) {
    if (Number(b.wagered) < Number(b.required)) continue;
    const u = await c.query(`UPDATE bonuses SET status='released', released_at=now() WHERE id=$1 AND status='active'`, [b.id]);
    if (u.rowCount) released.push({ amount: Number(b.amount), balance: await move(c, bet.user_id, 'bonus', Number(b.amount), 'WB' + b.id, { kind: b.kind }) });
  }
  return released;
}

/** Deposit 1, 2, 3 for one player, from their bonus rows and a deposit still being checked (if any). Each step:
 *  done (✓ deposit made, with the amount and date) and its bonus status (active / released / expired), or
 *  checking (their deposit is waiting for the admin), next, later, or locked (ID not approved yet).
 *  Used by the player's pages (ladderOf) and the admin's tracker (GET /api/admin/ladder). */
export function buildLadder(R, user, rows, pending) {
  if (!R.ladder) return null;
  const got = Object.fromEntries(rows.map(b => [b.kind, b]));
  // an old welcome bonus stands in for Deposit 1 (the ladder then continues with deposit2, deposit3)
  if (got.welcome && !got.deposit1) got.deposit1 = got.welcome;
  const unlocked = R.ladder.requireId === false || !!user.verified;
  let next = null, done = 0;
  const steps = (R.ladder[user.country] || []).slice(0, 3).map((s, i) => {
    const b = got[LADDER_KINDS[i]];
    if (b) done++;
    const status = b ? b.status : !unlocked ? 'locked' : next == null ? (next = i + 1, pending ? 'checking' : 'next') : 'later';
    const wait = status === 'checking' ? pending : null;
    return { n: i + 1, pct: Number(s.pct), max: Number(s.max), status, done: !!b, bonus: b ? Number(b.amount) : null,
      deposit: b ? (b.deposit != null ? Number(b.deposit) : null) : wait ? Number(wait.amount) : null,
      depositAt: b ? (b.deposit_at || b.created_at) : wait ? wait.created_at : null,
      wagered: b ? Number(b.wagered) : null, required: b ? Number(b.required) : null, releasedAt: b ? b.released_at || null : null };
  });
  return { requireId: R.ladder.requireId !== false, unlocked, next, done, left: steps.length - done, steps, times: R.times, min_odds: R.min_odds, days: R.days };
}
export const LADDER_ROWS_SQL = `SELECT b.user_id, b.kind, b.amount, b.required, b.wagered, b.status, b.created_at, b.released_at, p.amount AS deposit, p.updated_at AS deposit_at
  FROM bonuses b LEFT JOIN payments p ON p.id = b.payment_id WHERE b.user_id = ANY($1::uuid[]) AND (b.kind = ANY($2::text[]) OR b.kind = 'welcome')`;
export const PENDING_SQL = `SELECT DISTINCT ON (user_id) user_id, amount, created_at FROM payments
  WHERE user_id = ANY($1::uuid[]) AND kind='deposit' AND status='pending' ORDER BY user_id, created_at`;

/** Deposit 1, 2, 3 for a player (the deposit page, the pop-ups, the sticky "next deposit" bar). */
export async function ladderOf(user) {
  const R = await bonusRules();
  if (!R.ladder) return null;
  const [{ rows }, { rows: pend }] = await Promise.all([q(LADDER_ROWS_SQL, [[user.id], LADDER_KINDS]), q(PENDING_SQL, [[user.id]])]);
  return buildLadder(R, user, rows, pend[0] || null);
}

export const expireBonuses = () => q(`UPDATE bonuses SET status='expired' WHERE status='active' AND expires_at <= now()`);

export async function bonusesOf(userId) {
  await expireBonuses();
  const { rows } = await q(`SELECT id, kind, amount, required, wagered, status, created_at, expires_at, released_at FROM bonuses WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
  return rows.map(b => ({ id: b.id, kind: b.kind, amount: Number(b.amount), required: Number(b.required), wagered: Number(b.wagered), status: b.status, createdAt: b.created_at, expiresAt: b.expires_at, releasedAt: b.released_at }));
}
