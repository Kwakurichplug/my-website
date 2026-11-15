// Admin API – powers the admin portal. Every route needs role=admin.
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireAdmin } from '../lib/auth.js';
import { move } from '../lib/wallet.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { settleEvent } from '../lib/settle.js';
import { sendEmail, deliver, emailProvider, render, emailStatus, checkEmail, logEmail } from '../emails/index.js';
import { feedStatus } from '../feeds/index.js';
import { settleRound } from '../games/jackpot.js';
import * as crash from '../games/crash.js';
import { creditDeposit } from '../lib/bonus.js';

const r = Router();
r.use(requireAdmin);

// every change made from the portal is written to admin_log (who, what, on which record)
r.use((req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const body = { ...(req.body || {}) }; delete body.password;
    q('INSERT INTO admin_log (admin_id, action, target, meta) VALUES ($1,$2,$3,$4)', [req.user.id, `${req.method} ${req.route ? req.route.path : req.path}`, Object.values(req.params || {}).join('/') || null, body]).catch(() => {});
  });
  next();
});
r.get('/log', async (_req, res, next) => {
  try { res.json({ log: (await q(`SELECT l.id, l.action, l.target, l.meta, l.at, u.uid, u.phone, u.full_name FROM admin_log l JOIN users u ON u.id=l.admin_id ORDER BY l.id DESC LIMIT 200`)).rows }); } catch (e) { next(e); }
});

// 14-day series for the overview charts (per calendar day, UTC)
r.get('/series', async (req, res, next) => {
  const days = Math.min(60, Math.max(7, +req.query.days || 14));
  try {
    const [pay, bet, usr, game] = await Promise.all([
      q(`SELECT created_at::date AS d, kind, coalesce(sum(amount),0) AS amt, count(*)::int AS n FROM payments WHERE status='success' AND created_at > now() - ($1 || ' days')::interval GROUP BY 1,2`, [days]),
      q(`SELECT placed_at::date AS d, coalesce(sum(stake),0) AS staked, coalesce(sum(paid) FILTER (WHERE status IN ('won','cashout')),0) AS paid, count(*)::int AS n FROM bets WHERE placed_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
      q(`SELECT created_at::date AS d, count(*)::int AS n FROM users WHERE created_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
      q(`SELECT created_at::date AS d, coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid, count(*)::int AS n FROM game_bets WHERE status <> 'void' AND created_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
    ]);
    const out = {}; const day = d => { const k = new Date(d).toISOString().slice(0, 10); return out[k] ||= { d: k, deposits: 0, withdrawals: 0, staked: 0, paid: 0, bets: 0, signups: 0, gameStaked: 0, gamePaid: 0, plays: 0 }; };
    for (let i = days - 1; i >= 0; i--) day(Date.now() - i * 864e5);
    pay.rows.forEach(x => { const o = day(x.d); if (x.kind === 'deposit') o.deposits += Number(x.amt); else o.withdrawals += Number(x.amt); });
    bet.rows.forEach(x => { const o = day(x.d); o.staked += Number(x.staked); o.paid += Number(x.paid); o.bets += x.n; });
    usr.rows.forEach(x => { day(x.d).signups += x.n; });
    game.rows.forEach(x => { const o = day(x.d); o.gameStaked += Number(x.staked); o.gamePaid += Number(x.paid); o.plays += x.n; });
    res.json({ days: Object.values(out).sort((a, b) => a.d.localeCompare(b.d)) });
  } catch (e) { next(e); }
});

// one player: profile, money, recent activity
r.get('/users/:id', async (req, res, next) => {
  try {
    const u = (await q('SELECT id, uid, country, phone, email, full_name, verified, role, status, balance, limits, created_at FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!u) return res.status(404).json({ error: 'not_found' });
    const [pay, bets, tx, games, sums] = await Promise.all([
      q('SELECT id, kind, amount, method, status, details, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [u.id]),
      q('SELECT id, type, stake, odds, potential, status, paid, placed_at, settled_at FROM bets WHERE user_id=$1 ORDER BY placed_at DESC LIMIT 30', [u.id]),
      q('SELECT id, type, amount, balance_after, ref, meta, created_at FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]),
      q(`SELECT game, count(*)::int AS plays, coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid FROM game_bets WHERE user_id=$1 AND status <> 'void' GROUP BY game ORDER BY staked DESC`, [u.id]),
      q(`SELECT coalesce(sum(amount) FILTER (WHERE kind='deposit' AND status='success'),0) AS deposited, coalesce(sum(amount) FILTER (WHERE kind='withdrawal' AND status='success'),0) AS withdrawn,
          (SELECT coalesce(sum(stake),0) FROM bets WHERE user_id=$1) AS staked, (SELECT coalesce(sum(paid),0) FROM bets WHERE user_id=$1 AND status IN ('won','cashout')) AS won FROM payments WHERE user_id=$1`, [u.id]),
    ]);
    res.json({ user: u, payments: pay.rows, bets: bets.rows, transactions: tx.rows, games: games.rows, totals: sums.rows[0] });
  } catch (e) { next(e); }
});

// a bet with its legs
r.get('/bets/:id', async (req, res, next) => {
  try {
    const b = (await q('SELECT b.*, u.uid, u.phone, u.country FROM bets b JOIN users u ON u.id=b.user_id WHERE b.id=$1', [req.params.id])).rows[0];
    if (!b) return res.status(404).json({ error: 'not_found' });
    const legs = (await q('SELECT l.*, e.status AS ev_status, e.score_home, e.score_away, e.kickoff FROM bet_legs l JOIN events e ON e.id=l.event_id WHERE l.bet_id=$1 ORDER BY l.id', [b.id])).rows;
    res.json({ bet: b, legs });
  } catch (e) { next(e); }
});

// events for the trading desk: status filter, search, market counts, open liability
r.get('/events', async (req, res, next) => {
  const st = req.query.status || 'open', s = String(req.query.q || '');
  const where = st === 'open' ? "e.status IN ('scheduled','live')" : st === 'all' ? 'true' : 'e.status=$1';
  const params = st === 'open' || st === 'all' ? [] : [st];
  if (s) { params.push('%' + s + '%'); }
  try {
    const { rows } = await q(`SELECT e.id, e.sport, e.home, e.away, e.kickoff, e.status, e.minute, e.score_home, e.score_away, e.ht_home, e.ht_away, e.ext_id, l.name AS league, l.country,
        (SELECT count(*)::int FROM markets k WHERE k.event_id=e.id) AS markets, (SELECT count(*)::int FROM markets k WHERE k.event_id=e.id AND k.suspended) AS suspended,
        (SELECT count(*)::int FROM bet_legs g WHERE g.event_id=e.id AND g.result IS NULL) AS open_legs,
        (SELECT coalesce(sum(b.potential),0) FROM bet_legs g JOIN bets b ON b.id=g.bet_id WHERE g.event_id=e.id AND b.status='open') AS liability
      FROM events e JOIN leagues l ON l.id=e.league_id WHERE ${where} ${s ? `AND (e.home ILIKE $${params.length} OR e.away ILIKE $${params.length} OR l.name ILIKE $${params.length} OR e.id::text ILIKE $${params.length})` : ''}
      ORDER BY (e.status='live') DESC, e.kickoff ${st === 'finished' || st === 'cancelled' ? 'DESC' : 'ASC'} LIMIT 200`, params);
    res.json({ events: rows.map(e => ({ ...e, liability: Number(e.liability) })) });
  } catch (e) { next(e); }
});
r.get('/events/:id', async (req, res, next) => {
  try {
    const e = (await q('SELECT e.*, l.name AS league, l.country FROM events e JOIN leagues l ON l.id=e.league_id WHERE e.id=$1', [+req.params.id])).rows[0];
    if (!e) return res.status(404).json({ error: 'not_found' });
    const markets = (await q('SELECT key, name, grp, cols, outcomes, suspended, updated_at FROM markets WHERE event_id=$1', [e.id])).rows;
    const legs = (await q(`SELECT l.market_key, l.outcome_key, l.label, count(*)::int AS n, coalesce(sum(b.stake),0) AS staked, coalesce(sum(b.potential),0) AS liability FROM bet_legs l JOIN bets b ON b.id=l.bet_id WHERE l.event_id=$1 AND b.status='open' GROUP BY 1,2,3 ORDER BY liability DESC LIMIT 50`, [e.id])).rows;
    res.json({ event: e, markets, exposure: legs.map(x => ({ ...x, staked: Number(x.staked), liability: Number(x.liability) })) });
  } catch (e) { next(e); }
});
// suspend / reopen every market of an event in one go
r.post('/events/:id/suspend', async (req, res, next) => {
  try { await q('UPDATE markets SET suspended=$2, updated_at=now() WHERE event_id=$1', [+req.params.id, !!(req.body && req.body.suspended)]); res.json({ ok: true }); } catch (e) { next(e); }
});

// jackpot rounds with ticket totals
r.get('/jackpot', async (_req, res, next) => {
  try {
    const { rows } = await q(`SELECT r.id, r.code, r.closes_at, r.status, r.summary, r.settled_at, array_length(r.event_ids,1) AS games,
        (SELECT count(*)::int FROM jackpot_tickets t WHERE t.round_id=r.id) AS tickets, (SELECT coalesce(sum(lines),0)::int FROM jackpot_tickets t WHERE t.round_id=r.id) AS lines,
        (SELECT coalesce(sum(cost),0) FROM jackpot_tickets t WHERE t.round_id=r.id) AS sales, (SELECT coalesce(sum(prize),0) FROM jackpot_tickets t WHERE t.round_id=r.id) AS prizes
      FROM jackpot_rounds r ORDER BY r.id DESC LIMIT 30`);
    res.json({ rounds: rows.map(x => ({ ...x, sales: Number(x.sales), prizes: Number(x.prizes) })) });
  } catch (e) { next(e); }
});
// recent game plays (per game or all)
r.get('/games/plays', async (req, res, next) => {
  try {
    const g = req.query.game ? String(req.query.game) : null;
    const { rows } = await q(`SELECT p.id, p.game, p.round, p.stake, p.mult, p.payout, p.status, p.created_at, u.uid, u.phone FROM game_bets p JOIN users u ON u.id=p.user_id ${g ? 'WHERE p.game=$1' : ''} ORDER BY p.created_at DESC LIMIT 100`, g ? [g] : []);
    res.json({ plays: rows });
  } catch (e) { next(e); }
});
// ledger across players (type filter, search)
r.get('/transactions', async (req, res, next) => {
  const t = req.query.type ? String(req.query.type) : null, s = String(req.query.q || '');
  const params = []; const where = [];
  if (t) { params.push(t); where.push(`x.type=$${params.length}`); }
  if (s) { params.push('%' + s + '%'); where.push(`(u.phone ILIKE $${params.length} OR u.uid::text LIKE $${params.length} OR x.ref ILIKE $${params.length})`); }
  try {
    const { rows } = await q(`SELECT x.id, x.type, x.amount, x.balance_after, x.ref, x.meta, x.created_at, u.uid, u.phone, u.country FROM transactions x JOIN users u ON u.id=x.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY x.id DESC LIMIT 200`, params);
    res.json({ transactions: rows });
  } catch (e) { next(e); }
});

// odds feed health: provider, credits left, today's allowance
r.get('/feed', async (_req, res, next) => { try { res.json(await feedStatus()); } catch (e) { next(e); } });

// email: provider, sender, SMTP server, whether it is ready and the last error; ?check=1 tests the connection now
r.get('/email/status', async (req, res, next) => { try { res.json(req.query.check ? await checkEmail() : emailStatus()); } catch (e) { next(e); } });
// email: recent sends (sent / logged / failed with the reason)
r.get('/email/log', async (_req, res, next) => { try { res.json({ emails: (await q('SELECT l.id, l.template, l.subject, l.status, l.error, l.sent_at, u.uid, u.email FROM email_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100')).rows }); } catch (e) { next(e); } });
// email: send a test message through the configured provider (to check SMTP / API keys after setting them)
r.post('/email/test', async (req, res) => {
  const to = String((req.body && req.body.to) || req.user.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'invalid_email' });
  try {
    const m = render('welcome', { user: { country: req.user.country, uid: req.user.uid, phone: req.user.phone, fullName: req.user.full_name, email: to } });
    const status = await deliver({ to, subject: '[Test] ' + m.subject, html: m.html, text: m.text });
    logEmail(req.user.id, 'test', '[Test] ' + m.subject, status);
    res.json({ ok: true, provider: emailProvider(), status, to });
  } catch (e) { logEmail(req.user.id, 'test', 'Test email', 'failed', e.message); res.status(502).json({ ok: false, provider: emailProvider(), error: (e.code ? e.code + ': ' : '') + e.message }); }
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
    const [u, b, p, t, l, g, pp, k] = await Promise.all([
      q(`SELECT count(*)::int AS users, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today, coalesce(sum(balance),0) AS liabilities FROM users`),
      q(`SELECT count(*) FILTER (WHERE status='open')::int AS open, coalesce(sum(stake) FILTER (WHERE placed_at > now() - interval '1 day'),0) AS staked_today, coalesce(sum(paid) FILTER (WHERE settled_at > now() - interval '1 day'),0) AS paid_today FROM bets`),
      q(`SELECT count(*) FILTER (WHERE kind='withdrawal' AND status='pending')::int AS pending_withdrawals, coalesce(sum(amount) FILTER (WHERE kind='deposit' AND status='success' AND created_at > now() - interval '1 day'),0) AS deposits_today FROM payments`),
      q(`SELECT count(*) FILTER (WHERE status='live')::int AS live, count(*) FILTER (WHERE status='scheduled')::int AS upcoming FROM events`),
      q(`SELECT coalesce(sum(potential) FILTER (WHERE status='open'),0) AS open_liability, count(*) FILTER (WHERE placed_at > now() - interval '1 day')::int AS bets_today FROM bets`),
      q(`SELECT coalesce(sum(stake) FILTER (WHERE created_at > now() - interval '1 day'),0) AS game_staked_today, coalesce(sum(payout) FILTER (WHERE created_at > now() - interval '1 day'),0) AS game_paid_today, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS plays_today FROM game_bets WHERE status <> 'void'`),
      q(`SELECT count(*) FILTER (WHERE kind='deposit' AND status='pending')::int AS pending_deposits, coalesce(sum(amount) FILTER (WHERE kind='withdrawal' AND status='success' AND created_at > now() - interval '1 day'),0) AS withdrawals_today, count(*) FILTER (WHERE created_at > now() - interval '1 day' AND kind='deposit' AND status='success')::int AS deposit_count_today FROM payments`),
      q(`SELECT count(*)::int AS unverified FROM users WHERE NOT verified AND role='user'`),
    ]);
    const n = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]));
    res.json({ ...n(u.rows[0]), ...n(b.rows[0]), ...n(p.rows[0]), ...n(t.rows[0]), ...n(l.rows[0]), ...n(g.rows[0]), ...n(pp.rows[0]), ...n(k.rows[0]) });
  } catch (e) { next(e); }
});

r.get('/users', async (req, res, next) => {
  const s = String(req.query.q || '');
  try {
    const { rows } = await q(`SELECT id, uid, country, phone, email, full_name, verified, role, status, balance, created_at FROM users ${s ? 'WHERE phone ILIKE $1 OR email ILIKE $1 OR uid::text LIKE $1 OR full_name ILIKE $1' : ''} ORDER BY created_at DESC LIMIT 100`, s ? ['%' + s + '%'] : []);
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
  const st = req.query.status || 'pending', kind = req.query.kind ? String(req.query.kind) : null;
  try {
    const params = [], where = [];
    if (st !== 'all') { params.push(st); where.push(`p.status=$${params.length}`); }
    if (kind) { params.push(kind); where.push(`p.kind=$${params.length}`); }
    const { rows } = await q(`SELECT p.*, u.phone, u.country, u.uid, u.full_name FROM payments p JOIN users u ON u.id=p.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${st === 'pending' ? 'p.created_at' : 'p.created_at DESC'} LIMIT 200`, params);
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
    const params = [], where = [];
    if (req.query.status) { params.push(String(req.query.status)); where.push(`b.status=$${params.length}`); }
    if (req.query.q) { params.push('%' + req.query.q + '%'); where.push(`(b.id ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.uid::text LIKE $${params.length})`); }
    const { rows } = await q(`SELECT b.*, u.phone, u.uid, u.country, (SELECT count(*)::int FROM bet_legs l WHERE l.bet_id=b.id) AS legs FROM bets b JOIN users u ON u.id=b.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.placed_at DESC LIMIT 200`, params);
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
