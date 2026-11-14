// Welcome bonus, as advertised: 200% of the player's FIRST deposit (capped per country), held as locked bonus
// funds. It is released into the balance once the player has staked `times` × the bonus on multiples where every
// selection is priced at `min_odds` or more, within `days` days. Void and cashed-out bets do not count.
// Settings key 'welcome_bonus'. Every successful deposit must go through creditDeposit() – including the payment
// provider's webhook when it is connected (PROVIDER:), so the bonus keeps working unchanged.
import { q } from '../db/pool.js';
import { move } from './wallet.js';
import { getSetting } from './settings.js';

const r2 = n => Math.round(n * 100) / 100;

/** Credit a confirmed deposit (inside the caller's transaction) and grant the welcome bonus on the first one. */
export async function creditDeposit(c, user, amount, paymentId, meta = {}) {
  const balance = await move(c, user.id, 'deposit', amount, paymentId, meta);
  const cfg = await getSetting('welcome_bonus'), k = cfg && cfg[user.country];
  if (k) {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [user.id]);
    const bonus = r2(Math.min(k.max, Number(amount) * k.pct / 100));
    if (rows[0].n === 1 && bonus > 0) {
      await c.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at) VALUES ($1, 'welcome', $2, $3, now() + make_interval(days => $4))
        ON CONFLICT (user_id, kind) DO NOTHING`, [user.id, bonus, r2(bonus * cfg.times), cfg.days]);
    }
  }
  return balance;
}

/** Count a settled bet towards the active welcome bonus (inside the settlement transaction). */
export async function addTurnover(c, bet, legs) {
  const cfg = await getSetting('welcome_bonus');
  const priced = legs.filter(l => l.result !== 'void');
  if (!cfg || bet.type !== 'multiple' || priced.length < 2 || !priced.every(l => Number(l.odd) >= cfg.min_odds)) return [];
  const { rows } = await c.query(`UPDATE bonuses SET wagered = least(required, wagered + $2)
      WHERE user_id=$1 AND kind='welcome' AND status='active' AND expires_at > now() AND created_at <= $3
      RETURNING id, amount, required, wagered`, [bet.user_id, bet.stake, bet.placed_at]);
  const released = [];   // returned so the caller can email the player once the transaction has committed
  for (const b of rows) {
    if (Number(b.wagered) < Number(b.required)) continue;
    const u = await c.query(`UPDATE bonuses SET status='released', released_at=now() WHERE id=$1 AND status='active'`, [b.id]);
    if (u.rowCount) released.push({ amount: Number(b.amount), balance: await move(c, bet.user_id, 'bonus', Number(b.amount), 'WB' + b.id, { kind: 'welcome' }) });
  }
  return released;
}

export const expireBonuses = () => q(`UPDATE bonuses SET status='expired' WHERE status='active' AND expires_at <= now()`);

export async function bonusesOf(userId) {
  await expireBonuses();
  const { rows } = await q(`SELECT id, kind, amount, required, wagered, status, created_at, expires_at, released_at FROM bonuses WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
  return rows.map(b => ({ id: b.id, kind: b.kind, amount: Number(b.amount), required: Number(b.required), wagered: Number(b.wagered), status: b.status, createdAt: b.created_at, expiresAt: b.expires_at, releasedAt: b.released_at }));
}
