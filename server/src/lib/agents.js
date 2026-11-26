// Sub-agents. An admin makes a player an agent (admin portal → player → Make agent); the agent gets a unique code
// and link (…/?agent=AG7K2QX). Players who sign up with it are the agent's players (users.agent_id, same country).
// Earnings: agents.pct % (default 70) of each player's FIRST deposit – once per player, recorded when the deposit is
// credited. It becomes requestable ("available") once that player has staked agents.turnover × the deposit
// (default 1×) on settled sports bets or games, so a deposit made only to be withdrawn again earns nothing.
// Payouts: the agent requests everything available and says where to send it (Ghana: Mobile Money number + network +
// name; Nigeria: bank account); the request waits on the admin screen; the admin sends the money there and marks it
// paid; rejecting it puts the earnings back to available. The agent's screen counts days from 6 AM Ghana time.
import { randomInt } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { getSetting } from './settings.js';
import { move } from './wallet.js';

const r2 = n => Math.round(Number(n) * 100) / 100;
const fail = (status, error, extra) => Object.assign(new Error(error), { status, body: { error, ...extra } });
export async function rules() {
  const s = (await getSetting('agents')) || {};
  return { pct: Number(s.pct ?? 70), turnover: Number(s.turnover ?? 1), minPayout: { NG: 1000, GH: 10, ...(s.minPayout || {}) } };
}
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => 'AG' + Array.from({ length: 6 }, () => ALPHA[randomInt(ALPHA.length)]).join('');
export const normalizeCode = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const siteUrl = () => String(process.env.SITE_URL || '').replace(/\/$/, '');
export const linkOf = code => `${siteUrl()}/?agent=${code}`;

/** Admin: make a player an agent (keeps their code if they had one) or stop it (their players stay linked). */
export async function setAgent(userId, on) {
  for (let i = 0; i < 5; i++) {
    try {
      const { rows } = await q(`UPDATE users SET is_agent=$2, agent_code = CASE WHEN $2 AND agent_code IS NULL THEN $3 ELSE agent_code END WHERE id=$1 RETURNING id, is_agent, agent_code`, [userId, !!on, newCode()]);
      if (!rows[0]) throw fail(404, 'not_found');
      return rows[0];
    } catch (e) { if (e.code !== '23505') throw e; }   // a code clash: draw again
  }
  throw new Error('could not draw a unique agent code');
}

/** At sign-up: the agent behind a code (active agent, same country), or null. */
export async function agentForCode(c, code, country) {
  const k = normalizeCode(code); if (!/^AG[A-Z0-9]{6}$/.test(k)) return null;
  const { rows } = await c.query(`SELECT id FROM users WHERE agent_code=$1 AND is_agent AND country=$2 AND status='active'`, [k, country]);
  return rows[0] ? rows[0].id : null;
}

/** Inside the deposit transaction, on the player's first deposit only. */
export async function onFirstDeposit(c, userId, amount, paymentId) {
  const { rows } = await c.query(`SELECT u.agent_id FROM users u JOIN users a ON a.id=u.agent_id WHERE u.id=$1 AND a.is_agent`, [userId]);
  if (!rows[0]) return;
  const R = await rules(), pay = r2(Number(amount) * R.pct / 100);
  if (!(pay > 0)) return;
  await c.query(`INSERT INTO agent_earnings (agent_id, player_id, payment_id, deposit, amount, status, available_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (player_id) DO NOTHING`,
    [rows[0].agent_id, userId, typeof paymentId === 'string' && /^[0-9a-f-]{36}$/i.test(paymentId) ? paymentId : null, r2(amount), pay, R.turnover > 0 ? 'pending' : 'available', R.turnover > 0 ? null : new Date()]);
}

/** Leader, every minute: earnings whose player has now played their deposit become requestable. */
// An earning becomes requestable when the player has (1) played the deposit (turnover) AND (2) actually LOST at least
// the commission on settled bets and games since (stakes minus what came back). Betting both sides of a match, or
// cashing straight back out, earns the agent nothing – the house only pays commission out of real player losses.
export async function release() {
  const R = await rules();
  await q(`UPDATE agent_earnings e SET status='available', available_at=now() WHERE e.status='pending' AND
    (SELECT coalesce(sum(b.stake),0) FROM bets b WHERE b.user_id=e.player_id AND b.status IN ('won','lost','cashout') AND b.placed_at >= e.created_at)
    + (SELECT coalesce(sum(g.stake),0) FROM game_bets g WHERE g.user_id=e.player_id AND g.status IN ('won','lost','cashed') AND g.created_at >= e.created_at)
    >= e.deposit * $1
    AND (SELECT coalesce(sum(b.stake - coalesce(b.paid,0)),0) FROM bets b WHERE b.user_id=e.player_id AND b.status IN ('won','lost','cashout','void') AND b.placed_at >= e.created_at)
      + (SELECT coalesce(sum(g.stake - g.payout),0) FROM game_bets g WHERE g.user_id=e.player_id AND g.status IN ('won','lost','cashed','void') AND g.created_at >= e.created_at)
    >= e.amount`, [R.turnover]);
}

const mask = n => { const s = String(n || '').trim(); if (!s) return 'Player'; return s.split(/\s+/).map((w, i) => (i ? w[0] + '.' : w)).join(' '); };
const sums = rows => rows.reduce((o, r) => { o[r.status] = r2((o[r.status] || 0) + Number(r.amount)); return o; }, { pending: 0, available: 0, requested: 0, paid: 0 });

// The agent's day runs from 6:00 AM to 6:00 AM Ghana time (Africa/Accra, GMT all year): at 6 AM the "Today" figures
// start again from zero and the day before moves into the daily history.
export const DAY_START_SQL = `(date_trunc('day', (now() AT TIME ZONE 'Africa/Accra') - interval '6 hours') + interval '6 hours') AT TIME ZONE 'Africa/Accra'`;
const dayKey = col => `to_char((${col} AT TIME ZONE 'Africa/Accra') - interval '6 hours', 'YYYY-MM-DD')`;
const DAYS = 14;
export const NETWORKS = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AirtelTigo Money' };
const accountOf = d => !d ? null : d.method === 'mobile_money' ? `${NETWORKS[d.network] || d.network} · 0${d.phone}` : `${d.bank} · ${d.acct}`;

/** Where the agent wants to be paid: Ghana – Mobile Money (number, network, name); Nigeria – a bank account. */
export function payoutDetails(agent, body) {
  const b = body || {}, name = String(b.name || agent.full_name || '').trim().slice(0, 80);
  if (agent.country === 'GH') {
    const phone = String(b.phone || '').replace(/\D/g, '').replace(/^233/, '').replace(/^0/, ''), network = String(b.network || '').toLowerCase();
    if (phone.length !== 9 || !NETWORKS[network]) throw fail(400, 'momo_details');
    if (name.length < 3) throw fail(400, 'name_required');
    return { method: 'mobile_money', phone, network, name };
  }
  const acct = String(b.acct || '').replace(/\D/g, ''), bank = String(b.bank || '').trim().slice(0, 60);
  if (!bank || acct.length < 10 || acct.length > 16 || name.length < 3) throw fail(400, 'bank_details');
  return { method: 'bank_transfer', bank, acct, name };
}

/** The agent's own screen: today (since 6 AM Ghana time), the last 14 days, every player with their deposits. */
export async function dashboard(agent) {
  if (!agent.is_agent) throw fail(403, 'not_agent');
  const R = await rules();
  const t0 = (await q(`SELECT ${DAY_START_SQL} AS t0`)).rows[0].t0, from = new Date(new Date(t0).getTime() - (DAYS - 1) * 864e5);
  const [players, earn, payouts, joins, deps, firsts, last] = await Promise.all([
    q(`SELECT u.id, u.uid, u.full_name, u.created_at, e.deposit, e.amount, e.status, d.n, d.total, d.last, d.today
       FROM users u LEFT JOIN agent_earnings e ON e.player_id=u.id
       LEFT JOIN LATERAL (SELECT count(*)::int AS n, coalesce(sum(t.amount),0) AS total, max(t.created_at) AS last,
         coalesce(sum(t.amount) FILTER (WHERE t.created_at >= $2),0) AS today FROM transactions t WHERE t.user_id=u.id AND t.type='deposit') d ON true
       WHERE u.agent_id=$1 ORDER BY coalesce(d.last, u.created_at) DESC LIMIT 300`, [agent.id, t0]),
    q(`SELECT status, amount FROM agent_earnings WHERE agent_id=$1`, [agent.id]),
    q(`SELECT id, amount, status, reason, details, created_at, decided_at FROM agent_payouts WHERE agent_id=$1 ORDER BY id DESC LIMIT 50`, [agent.id]),
    q(`SELECT ${dayKey('created_at')} AS d, count(*)::int AS n FROM users WHERE agent_id=$1 AND created_at >= $2 GROUP BY 1`, [agent.id, from]),
    q(`SELECT ${dayKey('t.created_at')} AS d, count(*)::int AS n, count(DISTINCT t.user_id)::int AS players, coalesce(sum(t.amount),0) AS amount
       FROM transactions t JOIN users u ON u.id=t.user_id WHERE u.agent_id=$1 AND t.type='deposit' AND t.created_at >= $2 GROUP BY 1`, [agent.id, from]),
    q(`SELECT ${dayKey('created_at')} AS d, count(*)::int AS n, coalesce(sum(amount),0) AS earned FROM agent_earnings WHERE agent_id=$1 AND created_at >= $2 GROUP BY 1`, [agent.id, from]),
    q(`SELECT details FROM agent_payouts WHERE agent_id=$1 AND details IS NOT NULL ORDER BY id DESC LIMIT 1`, [agent.id]),
  ]);
  const by = rows => Object.fromEntries(rows.map(r => [r.d, r]));
  const J = by(joins.rows), D = by(deps.rows), F = by(firsts.rows);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const start = new Date(new Date(t0).getTime() - i * 864e5), k = start.toISOString().slice(0, 10);
    return { day: k, from: start.toISOString(), to: new Date(start.getTime() + 864e5).toISOString(), joined: J[k]?.n || 0,
      deposits: D[k]?.n || 0, depositors: D[k]?.players || 0, amount: r2(D[k]?.amount || 0), firstDeposits: F[k]?.n || 0, earned: r2(F[k]?.earned || 0) };
  });
  const s = sums(earn.rows);
  return { code: agent.agent_code, link: linkOf(agent.agent_code), pct: R.pct, turnover: R.turnover, minPayout: R.minPayout[agent.country] ?? 0,
    dayStartsAt: '06:00 Ghana time', today: days[0], days, payTo: last.rows[0] ? last.rows[0].details : null,
    totals: { players: players.rows.length, deposited: players.rows.filter(p => p.n > 0).length, ...s, earned: r2(s.pending + s.available + s.requested + s.paid),
      allDeposits: r2(players.rows.reduce((a, p) => a + Number(p.total || 0), 0)) },
    players: players.rows.map(p => ({ uid: p.uid, name: mask(p.full_name), joined: p.created_at, deposit: p.deposit == null ? null : Number(p.deposit), earning: p.amount == null ? null : Number(p.amount),
      status: p.status || 'no_deposit', deposits: p.n || 0, totalDeposited: r2(p.total || 0), today: r2(p.today || 0), lastDeposit: p.last || null })),
    payouts: payouts.rows.map(p => ({ id: Number(p.id), amount: Number(p.amount), status: p.status, reason: p.reason, to: accountOf(p.details), at: p.created_at, decidedAt: p.decided_at })) };
}

/** The agent asks for everything available to be paid to their Mobile Money (Ghana) or bank account (Nigeria). */
export async function requestPayout(agent, body) {
  if (!agent.is_agent) throw fail(403, 'not_agent');
  const details = payoutDetails(agent, body);
  const R = await rules(), min = R.minPayout[agent.country] ?? 0;
  return tx(async c => {
    await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [agent.id]);   // one request at a time per agent
    const { rows } = await c.query(`SELECT id, amount FROM agent_earnings WHERE agent_id=$1 AND status='available' FOR UPDATE`, [agent.id]);
    const total = r2(rows.reduce((a, r) => a + Number(r.amount), 0));
    if (!(total > 0)) throw fail(400, 'nothing_available');
    if (total < min) throw fail(400, 'below_minimum', { min });
    const p = (await c.query(`INSERT INTO agent_payouts (agent_id, amount, details) VALUES ($1,$2,$3) RETURNING *`, [agent.id, total, details])).rows[0];
    await c.query(`UPDATE agent_earnings SET status='requested', payout_id=$2 WHERE id = ANY($1)`, [rows.map(r => r.id), p.id]);
    return { id: Number(p.id), amount: total, status: 'pending', earnings: rows.length, to: accountOf(details) };
  });
}

/* ---------- admin ---------- */
export async function listAgents() {
  const { rows } = await q(`SELECT a.id, a.uid, a.full_name, a.phone, a.email, a.country, a.agent_code, a.is_agent, a.created_at,
      (SELECT count(*)::int FROM users u WHERE u.agent_id=a.id) AS players,
      (SELECT count(*)::int FROM agent_earnings e WHERE e.agent_id=a.id) AS deposited,
      (SELECT coalesce(sum(e.deposit),0) FROM agent_earnings e WHERE e.agent_id=a.id) AS deposits,
      (SELECT coalesce(sum(e.amount),0) FROM agent_earnings e WHERE e.agent_id=a.id AND e.status='pending') AS pending,
      (SELECT coalesce(sum(e.amount),0) FROM agent_earnings e WHERE e.agent_id=a.id AND e.status IN ('available','requested')) AS owed,
      (SELECT coalesce(sum(e.amount),0) FROM agent_earnings e WHERE e.agent_id=a.id AND e.status='paid') AS paid
    FROM users a WHERE a.is_agent OR a.agent_code IS NOT NULL ORDER BY a.is_agent DESC, a.created_at DESC LIMIT 500`);
  return rows.map(r => ({ ...r, link: r.agent_code ? linkOf(r.agent_code) : null, deposits: Number(r.deposits), pending: Number(r.pending), owed: Number(r.owed), paid: Number(r.paid) }));
}
export async function payoutQueue(status = 'pending') {
  const { rows } = await q(`SELECT p.*, a.uid, a.full_name, a.phone, a.email, a.country, a.agent_code FROM agent_payouts p JOIN users a ON a.id=p.agent_id
    ${status === 'all' ? '' : 'WHERE p.status=$1'} ORDER BY p.id DESC LIMIT 200`, status === 'all' ? [] : [status]);
  const ids = rows.map(r => r.id);
  const players = ids.length ? (await q(`SELECT e.payout_id, u.uid, u.full_name, e.deposit, e.amount FROM agent_earnings e JOIN users u ON u.id=e.player_id WHERE e.payout_id = ANY($1)`, [ids])).rows : [];
  return rows.map(r => ({ ...r, id: Number(r.id), amount: Number(r.amount), to: accountOf(r.details), players: players.filter(x => String(x.payout_id) === String(r.id)).map(x => ({ uid: x.uid, name: x.full_name, deposit: Number(x.deposit), earning: Number(x.amount) })) }));
}
/** Approve: the amount goes into the agent's balance (ledger) – once. Reject: earnings back to available. */
export async function decide(payoutId, approve, adminId, reason) {
  return tx(async c => {
    const { rows } = await c.query(`SELECT * FROM agent_payouts WHERE id=$1 FOR UPDATE`, [payoutId]);
    const p = rows[0]; if (!p) throw fail(404, 'not_found');
    if (p.status !== 'pending') throw fail(409, 'not_pending');
    if (approve) {
      await c.query(`UPDATE agent_payouts SET status='paid', decided_by=$2, decided_at=now() WHERE id=$1`, [p.id, adminId]);
      await c.query(`UPDATE agent_earnings SET status='paid' WHERE payout_id=$1 AND status='requested'`, [p.id]);
      // a request with Mobile Money / bank details: the admin sent the money there – nothing goes into the balance
      if (p.details) return { ok: true, status: 'paid', sentTo: accountOf(p.details), agentId: p.agent_id, amount: Number(p.amount) };
      // older requests (before 2026-11-25) had no details: paid into the agent's balance as before
      const balance = await move(c, p.agent_id, 'agent_commission', Number(p.amount), 'AGP' + p.id, { payout: Number(p.id) });
      return { ok: true, status: 'paid', balance, agentId: p.agent_id, amount: Number(p.amount) };
    }
    await c.query(`UPDATE agent_payouts SET status='rejected', reason=$3, decided_by=$2, decided_at=now() WHERE id=$1`, [p.id, adminId, reason || null]);
    await c.query(`UPDATE agent_earnings SET status='available', payout_id=NULL WHERE payout_id=$1 AND status='requested'`, [p.id]);
    return { ok: true, status: 'rejected', agentId: p.agent_id, amount: Number(p.amount) };
  });
}
