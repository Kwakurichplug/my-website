// Admin API – powers the admin portal. Every route needs role=admin.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireAdmin } from '../lib/auth.js';
import { move } from '../lib/wallet.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { settleEvent } from '../lib/settle.js';
import { sendEmail, deliver, emailProvider, render } from '../emails/index.js';
import { feedStatus } from '../feeds/index.js';
import { settleRound } from '../games/jackpot.js';
import * as crash from '../games/crash.js';
import { creditDeposit } from '../lib/bonus.js';

const r = Router();
r.use(requireAdmin);

// odds feed health: provider, credits left, today's allowance
r.get('/feed', async (_req, res, next) => { try { res.json(await feedStatus()); } catch (e) { next(e); } });

// email: send a test message through the configured provider (to check SMTP / API keys after setting them)
r.post('/email/test', async (req, res) => {
  const to = String((req.body && req.body.to) || req.user.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'invalid_email' });
  try {
    const m = render('welcome', { user: { country: req.user.country, uid: req.user.uid, phone: req.user.phone, fullName: req.user.full_name, email: to } });
    await deliver({ to, subject: '[Test] ' + m.subject, html: m.html, text: m.text });
    res.json({ ok: true, provider: emailProvider(), to });
  } catch (e) { res.status(502).json({ ok: false, provider: emailProvider(), error: e.message }); }
});

// games: today's turnover and payouts per game (house view)
r.get('/games', async (_req, res, next) => {
  try {
    const { rows } = await q(`SELECT game, count(*)::int AS plays, coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid
      FROM game_bets WHERE created_at > now() - interval '1 day' AND status <> 'void' GROUP BY game ORDER BY staked DESC`);
    res.json({ games: rows.map(g => ({ ...g, staked: Number(g.staked), paid: Number(g.paid), margin: Number(g.staked) ? 1 - Number(g.paid) / Number(g.staked) : null })) });
  } catch (e) { next(e); }
});
// Rocket Crash round audit (disputes / regulator): the stored seed, its hash and the crash point recomputed from the seed
r.get('/games/crash/verify/:id', async (req, res, next) => { try { res.json(await crash.verify(+req.params.id)); } catch (e) { next(e); } });
// jackpot: settle now (a given round once all its games are over; default = every closed round)
r.post('/jackpot/settle', async (req, res, next) => {
  try {
    const code = req.body && req.body.round ? String(req.body.round) : null;
    const { rows } = await q(`SELECT * FROM jackpot_rounds WHERE status='open' ${code ? 'AND code=$1' : 'AND closes_at <= now()'}`, code ? [code] : []);
    const settled = [];
    for (const rd of rows) if (await settleRound(rd)) settled.push(rd.code);
    res.json({ settled });
  } catch (e) { next(e); }
});

r.get('/overview', async (_req, res, next) => {
  try {
    const [u, b, p, t] = await Promise.all([
      q(`SELECT count(*)::int AS users, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today, coalesce(sum(balance),0) AS liabilities FROM users`),
      q(`SELECT count(*) FILTER (WHERE status='open')::int AS open, coalesce(sum(stake) FILTER (WHERE placed_at > now() - interval '1 day'),0) AS staked_today, coalesce(sum(paid) FILTER (WHERE settled_at > now() - interval '1 day'),0) AS paid_today FROM bets`),
      q(`SELECT count(*) FILTER (WHERE kind='withdrawal' AND status='pending')::int AS pending_withdrawals, coalesce(sum(amount) FILTER (WHERE kind='deposit' AND status='success' AND created_at > now() - interval '1 day'),0) AS deposits_today FROM payments`),
      q(`SELECT count(*) FILTER (WHERE status='live')::int AS live, count(*) FILTER (WHERE status='scheduled')::int AS upcoming FROM events`),
    ]);
    res.json({ ...u.rows[0], ...b.rows[0], ...p.rows[0], ...t.rows[0] });
  } catch (e) { next(e); }
});

r.get('/users', async (req, res, next) => {
  const s = String(req.query.q || '');
  try {
    const { rows } = await q(`SELECT id, uid, country, phone, full_name, verified, role, status, balance, created_at FROM users ${s ? 'WHERE phone ILIKE $1 OR uid::text LIKE $1 OR full_name ILIKE $1' : ''} ORDER BY created_at DESC LIMIT 100`, s ? ['%' + s + '%'] : []);
    res.json({ users: rows });
  } catch (e) { next(e); }
});

r.patch('/users/:id', async (req, res, next) => {
  const p = z.object({ status: z.enum(['active', 'suspended', 'self_excluded']).optional(), verified: z.boolean().optional(), role: z.enum(['user', 'admin']).optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    const sets = Object.entries(p.data).map(([k], i) => `${k}=$${i + 2}`);
    if (!sets.length) return res.json({ ok: true });
    await q(`UPDATE users SET ${sets.join(',')} WHERE id=$1`, [req.params.id, ...Object.values(p.data)]);
    res.json({ ok: true });
    if (p.data.verified != null) { const u = (await q('SELECT * FROM users WHERE id=$1', [req.params.id])).rows[0]; sendEmail(p.data.verified ? 'kycVerified' : 'kycRejected', u, { reason: req.body?.reason }); }
  } catch (e) { next(e); }
});

r.post('/users/:id/adjust', async (req, res, next) => {
  const p = z.object({ amount: z.number(), reason: z.string().min(3), type: z.enum(['adjustment', 'bonus']).default('adjustment') }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    const balance = await tx(c => move(c, req.params.id, p.data.type, p.data.amount, null, { reason: p.data.reason, by: req.user.id }));
    res.json({ balance });
  } catch (e) { next(e); }
});

r.get('/payments', async (req, res, next) => {
  const st = req.query.status || 'pending';
  try {
    const { rows } = await q(`SELECT p.*, u.phone, u.country, u.uid FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status=$1 ORDER BY p.created_at LIMIT 200`, [st]);
    res.json({ payments: rows });
  } catch (e) { next(e); }
});

r.post('/payments/:id/:action', async (req, res, next) => {
  const action = req.params.action; // approve | reject
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'bad_action' });
  try {
    await tx(async c => {
      const { rows } = await c.query('SELECT * FROM payments WHERE id=$1 AND status=\'pending\' FOR UPDATE', [req.params.id]);
      const p = rows[0]; if (!p) throw Object.assign(new Error('not_pending'), { status: 409 });
      const ok = action === 'approve';
      await c.query(`UPDATE payments SET status=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1`, [p.id, ok ? 'success' : 'rejected', JSON.stringify({ by: req.user.id, at: new Date().toISOString() })]);
      if (p.kind === 'withdrawal' && !ok) await move(c, p.user_id, 'refund', Number(p.amount), p.id, { reason: 'withdrawal_rejected' });
      if (p.kind === 'deposit' && ok) await creditDeposit(c, { id: p.user_id, country: (await c.query('SELECT country FROM users WHERE id=$1', [p.user_id])).rows[0].country }, Number(p.amount), p.id, { method: p.method });
      const u = (await c.query('SELECT * FROM users WHERE id=$1', [p.user_id])).rows[0];
      if (p.kind === 'withdrawal') sendEmail(ok ? 'withdrawalPaid' : 'withdrawalRejected', u, { amount: Number(p.amount), method: p.method, paymentId: p.id, account: p.details?.account, when: new Date(), reason: req.body?.reason, balance: Number(u.balance) });
      else sendEmail(ok ? 'depositSuccess' : 'depositFailed', u, { amount: Number(p.amount), method: p.method, paymentId: p.id, balance: Number(u.balance), when: new Date(), reason: req.body?.reason });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get('/bets', async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT b.*, u.phone, u.uid FROM bets b JOIN users u ON u.id=b.user_id ${req.query.status ? 'WHERE b.status=$1' : ''} ORDER BY b.placed_at DESC LIMIT 200`, req.query.status ? [req.query.status] : []);
    res.json({ bets: rows });
  } catch (e) { next(e); }
});

r.post('/bets/:id/void', async (req, res, next) => {
  try {
    await tx(async c => {
      const { rows } = await c.query('SELECT * FROM bets WHERE id=$1 AND status=\'open\' FOR UPDATE', [req.params.id]);
      const b = rows[0]; if (!b) throw Object.assign(new Error('not_open'), { status: 409 });
      await c.query(`UPDATE bets SET status='void', paid=stake, settled_at=now() WHERE id=$1`, [b.id]);
      await move(c, b.user_id, 'refund', Number(b.stake), b.id, { reason: 'voided_by_admin', by: req.user.id });
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Markets: suspend / reopen / set a price
r.post('/markets/:eventId/:key', async (req, res, next) => {
  const p = z.object({ suspended: z.boolean().optional(), outcome: z.string().optional(), price: z.number().min(1.01).nullable().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    if (p.data.suspended != null) await q('UPDATE markets SET suspended=$3, updated_at=now() WHERE event_id=$1 AND key=$2', [+req.params.eventId, req.params.key, p.data.suspended]);
    if (p.data.outcome) await q(`UPDATE markets SET outcomes = jsonb_set(outcomes, $3, (outcomes->$4) || jsonb_build_object('o', $5::numeric), false), updated_at=now() WHERE event_id=$1 AND key=$2`, [+req.params.eventId, req.params.key, `{${p.data.outcome}}`, p.data.outcome, p.data.price]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Manually finish an event (feed fallback) and settle it
r.post('/events/:id/result', async (req, res, next) => {
  const p = z.object({ home: z.number().int().min(0), away: z.number().int().min(0), htHome: z.number().int().optional(), htAway: z.number().int().optional(), cancelled: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    await q(`UPDATE events SET status=$2, score_home=$3, score_away=$4, ht_home=coalesce($5, ht_home), ht_away=coalesce($6, ht_away), updated_at=now() WHERE id=$1`,
      [+req.params.id, p.data.cancelled ? 'cancelled' : 'finished', p.data.home, p.data.away, p.data.htHome ?? null, p.data.htAway ?? null]);
    const settled = await settleEvent(+req.params.id);
    res.json({ ok: true, settled });
  } catch (e) { next(e); }
});

r.get('/settings', async (_req, res, next) => {
  try { const { rows } = await q('SELECT key, value FROM settings'); res.json(Object.fromEntries(rows.map(x => [x.key, x.value]))); } catch (e) { next(e); }
});
r.put('/settings/:key', async (req, res, next) => {
  try { await setSetting(req.params.key, req.body.value); res.json({ ok: true, value: await getSetting(req.params.key) }); } catch (e) { next(e); }
});

export default r;
