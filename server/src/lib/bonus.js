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
import { onFirstDeposit } from './agents.js';

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
  const { rows } = await c.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [user.id]);
  const first = rows[0].n === 1;
  if (first) await onFirstDeposit(c, user.id, amount, paymentId);   // the player's agent earns their share (lib/agents.js)
  const R = await bonusRules();
  if (R.ladder) {
    const { rows: [u] } = await c.query('SELECT country FROM users WHERE id=$1', [user.id]);
    {   // no ID check: every player's Deposit 1, 2, 3 earn their bonus straight away
      // steps used: Deposit 1, 2, 3 already made; an old first-deposit welcome bonus counts as Deposit 1 (never a 4th)
      const { rows: [g] } = await c.query(`SELECT (SELECT count(*)::int FROM deposit_steps WHERE user_id=$1) AS n,
          EXISTS (SELECT 1 FROM bonuses WHERE user_id=$1 AND kind='welcome') AND NOT EXISTS (SELECT 1 FROM deposit_steps WHERE user_id=$1 AND step=1) AS w`, [user.id]);
      const used = g.n + (g.w ? 1 : 0), step = (R.ladder[u.country] || [])[used];
      if (step && used < 3) {
        await c.query(`INSERT INTO deposit_steps (user_id, step, payment_id, amount) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [user.id, used + 1, paymentId, Number(amount)]);
        const bonus = r2(Math.min(Number(step.max), Number(amount) * Number(step.pct) / 100));
        if (bonus > 0 && R.times > 0 && R.days > 0) {
          await c.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at, payment_id) VALUES ($1, $2, $3, $4, now() + make_interval(days => $5), $6)
            ON CONFLICT (user_id, kind) DO NOTHING`, [user.id, LADDER_KINDS[used], bonus, r2(bonus * R.times), R.days, paymentId]);
        }
      }
    }
    return balance;
  }
  const cfg = R.welcome, k = cfg && cfg[user.country];
  if (k) {
    const bonus = r2(Math.min(k.max, Number(amount) * k.pct / 100));
    if (first && bonus > 0) {
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
    const promo = b.kind.startsWith('promo:') ? b.kind.slice(6) : null;
    if (u.rowCount) released.push({ amount: Number(b.amount), kind: b.kind, promo, balance: await move(c, bet.user_id, 'bonus', Number(b.amount), (promo ? 'PB' : 'WB') + b.id, promo ? { kind: 'promo', code: promo } : { kind: b.kind }) });
  }
  return released;
}

/** Deposit 1, 2, 3 for one player, from their bonus rows and a deposit still being checked (if any). Each step:
 *  done (✓ deposit made, with the amount and date) and its bonus status (active / released / expired), or
 *  checking (their deposit is waiting for the admin), next or later.
 *  Used by the player's pages (ladderOf) and the admin's tracker (GET /api/admin/ladder). */
export function buildLadder(R, user, rows, pending) {
  if (!R.ladder) return null;
  const byStep = {}; let welcome = null;
  for (const r of rows) { if (r.step === 0) welcome = r; else byStep[r.step] = r; }
  // an old welcome bonus stands in for Deposit 1 (the ladder then continues with Deposit 2, 3)
  if (welcome && !byStep[1]) byStep[1] = welcome;
  const unlocked = true;   // no ID check: Deposit 1, 2, 3 are open from sign-up
  let next = null, done = 0;
  const steps = (R.ladder[user.country] || []).slice(0, 3).map((s, i) => {
    const d = byStep[i + 1];
    if (d) done++;
    const status = d ? (d.status || 'nobonus') : !unlocked ? 'locked' : next == null ? (next = i + 1, pending ? 'checking' : 'next') : 'later';
    const wait = status === 'checking' ? pending : null;
    return { n: i + 1, pct: Number(s.pct), max: Number(s.max), status, done: !!d, bonus: d && d.amount != null ? Number(d.amount) : null,
      deposit: d ? (d.deposit != null ? Number(d.deposit) : null) : wait ? Number(wait.amount) : null,
      depositAt: d ? d.deposit_at : wait ? wait.created_at : null,
      wagered: d && d.wagered != null ? Number(d.wagered) : null, required: d && d.required != null ? Number(d.required) : null, releasedAt: d ? d.released_at || null : null };
  });
  return { requireId: false, unlocked, next, done, left: steps.length - done, steps, times: R.times, min_odds: R.min_odds, days: R.days };
}
// each step made (with its bonus, if one was paid), plus an old welcome bonus as step 0
export const LADDER_ROWS_SQL = `SELECT s.user_id, s.step, s.amount AS deposit, s.created_at AS deposit_at, b.amount, b.required, b.wagered, b.status, b.released_at
    FROM deposit_steps s LEFT JOIN bonuses b ON b.user_id = s.user_id AND b.kind = 'deposit' || s.step WHERE s.user_id = ANY($1::uuid[])
  UNION ALL
  SELECT b.user_id, 0 AS step, NULL, b.created_at, b.amount, b.required, b.wagered, b.status, b.released_at FROM bonuses b
    WHERE b.user_id = ANY($1::uuid[]) AND b.kind = 'welcome' AND $2::text[] IS NOT NULL`;
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
