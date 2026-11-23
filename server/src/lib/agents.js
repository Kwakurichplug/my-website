// Sub-agents. An admin makes a player an agent with a commission rate and a basis:
//   revenue  – % of the net revenue from the agent's players: stakes − winnings − bonuses released (never below 0)
//   deposits – % of their players' deposits
//   stakes   – % of their players' stakes (turnover)
// Players belong to an agent when they signed up with the agent's referral code or link (users.referred_by).
// Only settled play counts (an open bet counts when it is settled; void bets and cancelled games not at all), from
// the start of the unpaid period. An admin pays the commission into the agent's balance (ledger type 'commission')
// – the amount is theirs to decide – and every payout starts a new period. Agents earn this instead of the flat
// Refer & Earn reward.
import { move } from './wallet.js';

export const BASES = { revenue: 'Net revenue', deposits: 'Deposits', stakes: 'Stakes' };
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const err = (code, status) => Object.assign(new Error(code), { status });

/** The agent's players with what each did between `from` and `to`. `db` = anything with .query (pool or client). */
export async function playerStats(db, agentId, from, to) {
  const { rows } = await db.query(`WITH pl AS (SELECT id, uid, full_name, phone, email, country, status, created_at FROM users WHERE referred_by=$1),
    sp AS (SELECT b.user_id, sum(b.stake) AS st, sum(coalesce(b.paid, 0)) AS rt FROM bets b JOIN pl ON pl.id=b.user_id
      WHERE b.status IN ('won','lost','cashout') AND b.settled_at >= $2 AND b.settled_at < $3 GROUP BY b.user_id),
    gm AS (SELECT g.user_id, sum(g.stake) AS st, sum(g.payout) AS rt FROM game_bets g JOIN pl ON pl.id=g.user_id
      WHERE g.status IN ('won','lost','cashed') AND coalesce(g.settled_at, g.created_at) >= $2 AND coalesce(g.settled_at, g.created_at) < $3 GROUP BY g.user_id),
    lg AS (SELECT t.user_id, sum(-t.amount) FILTER (WHERE t.type IN ('virtual_bet','jackpot')) AS st,
        sum(t.amount) FILTER (WHERE t.type IN ('virtual_win','jackpot_win')) AS rt,
        sum(t.amount) FILTER (WHERE t.type = 'bonus') AS bonus, sum(t.amount) FILTER (WHERE t.type = 'deposit') AS dep
      FROM transactions t JOIN pl ON pl.id=t.user_id WHERE t.created_at >= $2 AND t.created_at < $3 GROUP BY t.user_id)
    SELECT pl.*, coalesce(sp.st,0) + coalesce(gm.st,0) + coalesce(lg.st,0) AS staked, coalesce(sp.rt,0) + coalesce(gm.rt,0) + coalesce(lg.rt,0) AS returned,
      coalesce(lg.bonus,0) AS bonus, coalesce(lg.dep,0) AS deposits
    FROM pl LEFT JOIN sp ON sp.user_id=pl.id LEFT JOIN gm ON gm.user_id=pl.id LEFT JOIN lg ON lg.user_id=pl.id
    ORDER BY pl.created_at DESC`, [agentId, from, to]);
  return rows.map(r => {
    const staked = r2(r.staked), returned = r2(r.returned), bonus = r2(r.bonus);
    return { ...r, staked, returned, bonus, deposits: r2(r.deposits), revenue: r2(staked - returned - bonus) };
  });
}

/** The unpaid period of agent row `a` (from agents): totals, the base for its basis and the commission due. */
export async function period(db, a, to) {
  const end = to || (await db.query('SELECT now() AS t')).rows[0].t;
  const players = await playerStats(db, a.user_id, a.period_start, end);
  const t = { staked: 0, returned: 0, bonus: 0, deposits: 0, revenue: 0, active: 0 };
  for (const p of players) { for (const k of ['staked', 'returned', 'bonus', 'deposits', 'revenue']) t[k] += p[k]; if (p.staked || p.deposits) t.active++; }
  for (const k of ['staked', 'returned', 'bonus', 'deposits', 'revenue']) t[k] = r2(t[k]);
  const base = a.basis === 'deposits' ? t.deposits : a.basis === 'stakes' ? t.staked : t.revenue;
  return { from: a.period_start, to: end, players, totals: t, base: r2(base), commission: Math.max(0, r2(base * Number(a.rate) / 100)) };
}

/** Pay an agent's commission (inside the caller's transaction). `amount` defaults to the commission due; 0 closes
 *  the period without paying. The period ends a few seconds ago, so play still being committed lands in the next one. */
export async function pay(c, agentId, adminId, { amount, note } = {}) {
  const { rows } = await c.query('SELECT * FROM agents WHERE user_id=$1 FOR UPDATE', [agentId]);
  const a = rows[0]; if (!a) throw err('not_agent', 404);
  const { rows: [{ t }] } = await c.query(`SELECT greatest($1::timestamptz, now() - interval '5 seconds') AS t`, [a.period_start]);
  const p = await period(c, a, t);
  const paid = amount == null ? p.commission : r2(amount);
  if (!(paid >= 0)) throw err('invalid', 400);
  const { rows: po } = await c.query(`INSERT INTO agent_payouts (agent_id, period_start, period_end, basis, rate, base, commission, amount, note, paid_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [agentId, a.period_start, t, a.basis, a.rate, p.base, p.commission, paid, note || null, adminId]);
  const balance = paid > 0 ? await move(c, agentId, 'commission', paid, 'AG' + po[0].id, { from: a.period_start, to: t, basis: a.basis, rate: Number(a.rate), base: p.base }) : null;
  await c.query('UPDATE agents SET period_start=$2, updated_at=now() WHERE user_id=$1', [agentId, t]);
  return { payout: { ...po[0], amount: paid, base: p.base, commission: p.commission }, balance };
}
