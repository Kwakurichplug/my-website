// Promo codes. An admin creates a code (country, bonus amount, wagering, limits); a player types it on Me → Bonuses.
// Each player can redeem a code once, never more than max_uses players in total (the code row is locked while a
// redemption is checked), only in the code's country and dates, and – unless the admin turns it off – only after a
// first real deposit (stops throw-away accounts farming codes). The reward is a locked bonus released by
// bonus.addTurnover() like the welcome bonus, or cash at once when the wagering multiple is 0.
import { q, tx } from '../db/pool.js';
import { move } from './wallet.js';

const r2 = n => Math.round(n * 100) / 100;
export const CODE_RE = /^[A-Z0-9]{4,20}$/;
export const normalize = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const fail = (status, error, extra) => Object.assign(new Error(error), { status, expose: true, body: { error, ...extra } });

/** Redeem `raw` for `user`. Returns { code, amount, released, required, expiresAt, balance }. Throws with .body. */
export async function redeem(user, raw) {
  const code = normalize(raw);
  if (!CODE_RE.test(code)) throw fail(400, 'invalid_code');
  return tx(async c => {
    const { rows } = await c.query('SELECT * FROM promo_codes WHERE code=$1 FOR UPDATE', [code]);
    const p = rows[0], now = new Date();
    if (!p || !p.active || p.country !== user.country) throw fail(404, 'invalid_code');
    if (new Date(p.starts_at) > now) throw fail(410, 'not_started');
    if (p.ends_at && new Date(p.ends_at) <= now) throw fail(410, 'expired');
    if (p.max_uses != null && p.uses >= p.max_uses) throw fail(410, 'used_up');
    if (p.new_players_only && new Date(user.created_at) < new Date(p.created_at)) throw fail(403, 'new_players_only');
    if (p.requires_deposit) {
      const d = await c.query(`SELECT 1 FROM transactions WHERE user_id=$1 AND type='deposit' LIMIT 1`, [user.id]);
      if (!d.rowCount) throw fail(403, 'deposit_first');
    }
    const amount = r2(Number(p.amount)), required = r2(amount * Number(p.times));
    const ins = await c.query(`INSERT INTO promo_redemptions (code, user_id, amount) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING code`, [code, user.id, amount]);
    if (!ins.rowCount) throw fail(409, 'already_used');
    await c.query('UPDATE promo_codes SET uses = uses + 1 WHERE code=$1', [code]);
    if (!(required > 0)) {
      const balance = await move(c, user.id, 'bonus', amount, 'PC-' + code, { kind: 'promo', code });
      return { code, amount, released: true, required: 0, balance };
    }
    const b = await c.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))
      ON CONFLICT (user_id, kind) DO NOTHING RETURNING id, expires_at`, [user.id, 'promo:' + code, amount, required, p.days]);
    if (!b.rowCount) throw fail(409, 'already_used');
    await c.query('UPDATE promo_redemptions SET bonus_id=$3 WHERE code=$1 AND user_id=$2', [code, user.id, b.rows[0].id]);
    return { code, amount, released: false, required, expiresAt: b.rows[0].expires_at, balance: Number((await c.query('SELECT balance FROM users WHERE id=$1', [user.id])).rows[0].balance) };
  });
}

/** Admin list: every code with its uses and how much was released / still locked. */
export async function list() {
  const { rows } = await q(`SELECT p.*, (SELECT coalesce(sum(r.amount),0) FROM promo_redemptions r WHERE r.code=p.code) AS given,
      (SELECT coalesce(sum(b.amount),0) FROM bonuses b WHERE b.kind='promo:'||p.code AND b.status='released') +
      (SELECT coalesce(sum(t.amount),0) FROM transactions t WHERE t.type='bonus' AND t.ref='PC-'||p.code) AS released
    FROM promo_codes p ORDER BY p.created_at DESC LIMIT 500`);
  return rows.map(x => ({ ...x, amount: Number(x.amount), times: Number(x.times), given: Number(x.given), released: Number(x.released) }));
}
