// Admin API – powers the admin portal. Every route needs role=admin.
import { Router } from 'express';
import { readdirSync } from 'node:fs';
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
import { creditDeposit, ladderOf, bonusRules, buildLadder, LADDER_ROWS_SQL, PENDING_SQL, LADDER_KINDS } from '../lib/bonus.js';
import { config as payConfig, saveConfig as savePayConfig, methodName, NETWORKS, referenceOf, options as payOptions } from '../lib/payments.js';
import * as gateway from '../payments/gateway.js';
import { payoutResult, checkApi, checkPayout } from '../payments/flows.js';
import * as promos from '../lib/promos.js';
import * as manual from '../lib/manual.js';
import { checks as withdrawalChecks, sendMomo as sendWithdrawal } from '../lib/withdrawals.js';
import * as walletPay from '../lib/walletPayouts.js';
import * as agents from '../lib/agents.js';
import * as support from '../lib/support.js';
import { verifyHash } from '../lib/auth.js';
import { notify, closeDepositRequests } from '../lib/notices.js';

const r = Router();
const DB = { query: (t, p) => q(t, p) };
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
  const days = Math.min(60, Math.max(7, +req.query.days || 14)), cc = ['NG', 'GH'].includes(req.query.cc) ? req.query.cc : null;
  const U = cc ? `AND user_id IN (SELECT id FROM users WHERE country='${cc}')` : '';   // money adds up per currency
  try {
    const [pay, bet, usr, game] = await Promise.all([
      q(`SELECT created_at::date AS d, kind, coalesce(sum(amount),0) AS amt, count(*)::int AS n FROM payments WHERE status='success' ${U} AND created_at > now() - ($1 || ' days')::interval GROUP BY 1,2`, [days]),
      q(`SELECT placed_at::date AS d, coalesce(sum(stake),0) AS staked, coalesce(sum(paid) FILTER (WHERE status IN ('won','cashout')),0) AS paid, count(*)::int AS n FROM bets WHERE true ${U} AND placed_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
      q(`SELECT created_at::date AS d, count(*)::int AS n FROM users WHERE true ${cc ? `AND country='${cc}'` : ''} AND created_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
      q(`SELECT created_at::date AS d, coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid, count(*)::int AS n FROM game_bets WHERE status <> 'void' ${U} AND created_at > now() - ($1 || ' days')::interval GROUP BY 1`, [days]),
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

r.get('/users/:id', async (req, res, next) => {
  try {
    const u = (await q('SELECT id, uid, country, phone, email, full_name, verified, role, status, balance, limits, created_at FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!u) return res.status(404).json({ error: 'not_found' });
    const [pay, bets, tx, games, sums, reqs] = await Promise.all([
      q('SELECT id, kind, amount, method, provider, provider_ref, status, details, created_at, updated_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [u.id]),
      q('SELECT id, type, stake, odds, potential, status, paid, placed_at, settled_at FROM bets WHERE user_id=$1 ORDER BY placed_at DESC LIMIT 30', [u.id]),
      q('SELECT id, type, amount, balance_after, ref, meta, created_at FROM transactions WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [u.id]),
      q(`SELECT game, count(*)::int AS plays, coalesce(sum(stake),0) AS staked, coalesce(sum(payout),0) AS paid FROM game_bets WHERE user_id=$1 AND status <> 'void' GROUP BY game ORDER BY staked DESC`, [u.id]),
      q(`SELECT coalesce(sum(amount) FILTER (WHERE kind='deposit' AND status='success'),0) AS deposited, coalesce(sum(amount) FILTER (WHERE kind='withdrawal' AND status='success'),0) AS withdrawn,
          (SELECT coalesce(sum(stake),0) FROM bets WHERE user_id=$1) AS staked, (SELECT coalesce(sum(paid),0) FROM bets WHERE user_id=$1 AND status IN ('won','cashout')) AS won FROM payments WHERE user_id=$1`, [u.id]),
      q(`SELECT id, data, created_at, expires_at FROM notices WHERE user_id=$1 AND kind='deposit_request' AND done_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`, [u.id]),
    ]);
    res.json({ user: { ...u, balance: Number(u.balance) }, payments: pay.rows.map(x => ({ ...x, amount: Number(x.amount), methodName: methodName(x.method) })), bets: bets.rows, transactions: tx.rows, games: games.rows, totals: sums.rows[0], requests: reqs.rows, ladder: await ladderOf(u) });
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
  try {
    const off = !!(req.body && req.body.suspended);
    // a hand-added match has no in-play prices: once it has kicked off its markets stay closed until the result
    if (!off && (await q(`SELECT 1 FROM events WHERE id=$1 AND ext_id LIKE 'man:%' AND kickoff <= now()`, [+req.params.id])).rowCount) return res.status(409).json({ error: 'started' });
    await q('UPDATE markets SET suspended=$2, updated_at=now() WHERE event_id=$1', [+req.params.id, off]); res.json({ ok: true });
  } catch (e) { next(e); }
});

// Matches added by hand (lib/manual.js): leagues to pick from, a price preview, and create
r.get('/leagues', async (_req, res, next) => { try { res.json({ leagues: await manual.leagues() }); } catch (e) { next(e); } });
// Country / region flags the site has (betting/img/flags) – for leagues and for national teams' crests
const FLAG_CODES = (() => { try { return readdirSync(new URL('../../../betting/img/flags/', import.meta.url)).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4)).sort(); } catch { return []; } })();
r.get('/flags', (_req, res) => res.json({ flags: FLAG_CODES }));
// Teams and their crests: pick from known teams; set a crest by upload, link, automatic lookup or a country flag
r.get('/teams', async (req, res, next) => { try { res.json({ teams: await manual.teams(req.query.q || '') }); } catch (e) { next(e); } });
const crestDone = (res, next) => [x => res.json(x), e => (e.body ? res.status(e.status).json(e.body) : next(e))];
r.post('/teams/crest', (req, res, next) => { manual.uploadCrest(req.body && req.body.name, req.body && req.body.image).then(...crestDone(res, next)); });
r.post('/teams/crest-link', (req, res, next) => { manual.linkCrest(req.body && req.body.name, req.body && req.body.url).then(...crestDone(res, next)); });
r.post('/teams/crest-find', (req, res, next) => { manual.findCrest(req.body && req.body.name).then(...crestDone(res, next)); });
r.post('/teams/crest-flag', (req, res, next) => {
  const f = String((req.body && req.body.flag) || '').toLowerCase();
  if (!FLAG_CODES.includes(f)) return res.status(400).json({ error: 'bad_flag' });
  manual.linkCrest(req.body && req.body.name, `/img/flags/${f}.svg`, true).then(...crestDone(res, next));
});
// Live betting on / off for one of your own matches (before kick-off: whether it opens at kick-off)
r.post('/events/:id/inplay', async (req, res, next) => {
  const p = z.object({ on: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    const { rows } = await q(`UPDATE events SET stats = stats || jsonb_build_object('inplay', $2::boolean), updated_at=now() WHERE id=$1 AND ext_id LIKE 'man:%' AND status IN ('scheduled','live') RETURNING id, status`, [req.params.id, p.data.on]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    if (rows[0].status === 'live' && !p.data.on) await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [req.params.id]);
    res.json({ ok: true, inplay: p.data.on });
  } catch (e) { next(e); }
});
// Live desk: every hand-added match in play (or kicking off within 30 min) with its live-betting state
r.get('/live-desk', async (_req, res, next) => { try { res.json({ matches: await manual.liveDesk(), freshSec: manual.LIVE_FRESH_SEC() }); } catch (e) { next(e); } });
// Live scoring of a hand-added match that has kicked off: the real score and the half; inplay turns live betting on/off
r.post('/events/:id/live', async (req, res, next) => {
  const p = z.object({ home: z.number().int().min(0).max(40), away: z.number().int().min(0).max(40), period: z.enum(['H1', 'HT', 'H2']), inplay: z.boolean().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try { res.json(await manual.liveUpdate(+req.params.id, p.data)); } catch (e) { if (e.body) return res.status(e.status).json(e.body); next(e); }
});
const oddsSchema = z.object({ home: z.number().min(1.01).max(100), draw: z.number().min(1.01).max(100), away: z.number().min(1.01).max(100) });
const matchSchema = z.object({
  league: z.union([z.object({ id: z.number().int().positive() }),
    z.object({ name: z.string().trim().min(2).max(60), country: z.string().trim().min(2).max(40), flag: z.string().trim().toLowerCase().regex(/^([a-z]{2,6}(-[a-z]{2,4})?|world)$/) })]),
  home: z.string().trim().min(2).max(60), away: z.string().trim().min(2).max(60),
  kickoff: z.coerce.date(), odds: oddsSchema, hot: z.boolean().optional(), inplay: z.boolean().optional(),
});
r.post('/events/preview', (req, res) => {
  const p = oddsSchema.safeParse(req.body && req.body.odds);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try { const x = manual.priceMatch(p.data); res.json({ margin: x.margin, markets: x.markets.length, model: x.model, sample: x.markets.filter(m => ['dc', 'ou', 'gg'].includes(m.key)) }); }
  catch (e) { res.status(e.status || 500).json(e.body || { error: e.message }); }
});
r.post('/events', async (req, res, next) => {
  const p = matchSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid', details: p.error.flatten().fieldErrors });
  try { res.json(await manual.createMatch(p.data, req.user.id)); }
  catch (e) { if (e.body) return res.status(e.status).json(e.body); next(e); }
});

// Promo codes (lib/promos.js)
r.get('/promos', async (_req, res, next) => { try { res.json({ promos: await promos.list() }); } catch (e) { next(e); } });
const promoSchema = z.object({
  code: z.string().transform(promos.normalize).pipe(z.string().regex(promos.CODE_RE)),
  country: z.enum(['NG', 'GH']), amount: z.number().positive(), times: z.number().min(0).max(50).default(5), days: z.number().int().min(1).max(90).default(7),
  maxUses: z.number().int().positive().max(1e6).nullable().default(null), endsAt: z.coerce.date().nullable().default(null),
  requiresDeposit: z.boolean().default(true), newPlayersOnly: z.boolean().default(false), note: z.string().trim().max(200).default(''),
});
const PROMO_MAX = { NG: 500000, GH: 5000 };
r.post('/promos', async (req, res, next) => {
  const p = promoSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid', details: p.error.flatten().fieldErrors });
  const v = p.data;
  if (v.amount > PROMO_MAX[v.country]) return res.status(400).json({ error: 'amount_too_high', max: PROMO_MAX[v.country] });
  if (v.endsAt && v.endsAt <= new Date()) return res.status(400).json({ error: 'ends_in_past' });
  try {
    const { rowCount } = await q(`INSERT INTO promo_codes (code, country, amount, times, days, max_uses, ends_at, requires_deposit, new_players_only, note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (code) DO NOTHING`,
      [v.code, v.country, Math.round(v.amount * 100) / 100, v.times, v.days, v.maxUses, v.endsAt, v.requiresDeposit, v.newPlayersOnly, v.note || null, req.user.id]);
    if (!rowCount) return res.status(409).json({ error: 'code_taken' });
    res.json({ ok: true, code: v.code });
  } catch (e) { next(e); }
});
// pause / resume, change the use limit or the end date (amount and wagering stay as players were told)
r.post('/promos/:code', async (req, res, next) => {
  const p = z.object({ active: z.boolean().optional(), maxUses: z.number().int().positive().max(1e6).nullable().optional(), endsAt: z.coerce.date().nullable().optional() }).safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    const v = p.data, sets = [], params = [promos.normalize(req.params.code)];
    if (v.active !== undefined) { params.push(v.active); sets.push(`active=$${params.length}`); }
    if (v.maxUses !== undefined) { params.push(v.maxUses); sets.push(`max_uses=$${params.length}`); }
    if (v.endsAt !== undefined) { params.push(v.endsAt); sets.push(`ends_at=$${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_change' });
    const { rowCount } = await q(`UPDATE promo_codes SET ${sets.join(', ')} WHERE code=$1`, params);
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
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

r.get('/overview', async (req, res, next) => {
  const cc = ['NG', 'GH'].includes(req.query.cc) ? req.query.cc : null;   // money adds up per currency
  const U = cc ? `AND u.country='${cc}'` : '';
  try {
    const [u, b, p, t, g, k] = await Promise.all([
      q(`SELECT count(*)::int AS users, count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today, coalesce(sum(balance),0)::float AS liabilities FROM users u WHERE true ${U}`),
      q(`SELECT count(*) FILTER (WHERE b.status='open')::int AS open, coalesce(sum(b.stake) FILTER (WHERE b.placed_at > now() - interval '1 day'),0)::float AS staked_today,
          coalesce(sum(b.paid) FILTER (WHERE b.settled_at > now() - interval '1 day'),0)::float AS paid_today, coalesce(sum(b.potential) FILTER (WHERE b.status='open'),0)::float AS open_liability,
          count(*) FILTER (WHERE b.placed_at > now() - interval '1 day')::int AS bets_today FROM bets b JOIN users u ON u.id=b.user_id WHERE true ${U}`),
      q(`SELECT count(*) FILTER (WHERE p.kind='withdrawal' AND p.status='pending')::int AS pending_withdrawals, count(*) FILTER (WHERE p.kind='deposit' AND p.status='pending')::int AS pending_deposits,
          coalesce(sum(p.amount) FILTER (WHERE p.kind='deposit' AND p.status='success' AND p.updated_at > now() - interval '1 day'),0)::float AS deposits_today,
          count(*) FILTER (WHERE p.kind='deposit' AND p.status='success' AND p.updated_at > now() - interval '1 day')::int AS deposit_count_today,
          coalesce(sum(p.amount) FILTER (WHERE p.kind='withdrawal' AND p.status='success' AND p.updated_at > now() - interval '1 day'),0)::float AS withdrawals_today
        FROM payments p JOIN users u ON u.id=p.user_id WHERE true ${U}`),
      q(`SELECT count(*) FILTER (WHERE status='live')::int AS live, count(*) FILTER (WHERE status='scheduled')::int AS upcoming FROM events`),
      q(`SELECT coalesce(sum(g.stake) FILTER (WHERE g.created_at > now() - interval '1 day'),0)::float AS game_staked_today, coalesce(sum(g.payout) FILTER (WHERE g.created_at > now() - interval '1 day'),0)::float AS game_paid_today,
          count(*) FILTER (WHERE g.created_at > now() - interval '1 day')::int AS plays_today FROM game_bets g JOIN users u ON u.id=g.user_id WHERE g.status <> 'void' ${U}`),
      q(`SELECT count(*) FILTER (WHERE NOT u.verified AND u.role='user')::int AS unverified, count(*) FILTER (WHERE u.limits->'kyc'->>'status' = 'pending' AND NOT u.verified)::int AS pending_kyc FROM users u WHERE true ${U}`),
    ]);
    res.json({ cc, ...u.rows[0], ...b.rows[0], ...p.rows[0], ...t.rows[0], ...g.rows[0], ...k.rows[0] });
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

// Support: ask a player to deposit (they messaged support that their deposit does not go through). They get a pop-up
// when they open the app – how to pay in their country and a button to the deposit page with the amount filled in –
// and an email. One open request per player (a new one replaces it); it closes when they deposit, or after 7 days.
r.post('/users/:id/deposit-request', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive().max(1e8).optional(), note: z.string().trim().max(300).optional() }).safeParse(req.body || {});
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    const u = (await q('SELECT * FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!u) return res.status(404).json({ error: 'not_found' });
    const amount = p.data.amount ? Math.round(p.data.amount * 100) / 100 : null;
    const n = await tx(async c => { await closeDepositRequests(c, u.id); return notify(c, u.id, 'deposit_request', { amount, note: p.data.note || null }, req.user.id, 7); });
    res.status(201).json({ notice: n });
    const opt = await payOptions(u);
    sendEmail('depositRequest', u, { amount, note: p.data.note, way: opt.deposit[0] || null, reference: opt.reference });
  } catch (e) { next(e); }
});
r.post('/notices/:id/cancel', async (req, res, next) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid' });
  try { await q('UPDATE notices SET done_at=now() WHERE id=$1 AND done_at IS NULL', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// Support: add a deposit for a player who messaged support (their money arrived but no request shows, or the app could
// not complete it). credit=true → credited now as a real deposit (creditDeposit: welcome bonus on the first one, receipt
// email); otherwise it waits in Payments → Pending like the player's own "I have sent it". A bank / MoMo transfer
// reference can be credited only once (unique index payments_transfer_ref_key).
r.post('/users/:id/deposits', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive().max(1e8), method: z.enum(['bank_transfer', 'mobile_money']).optional(),
    sender: z.string().trim().max(80).optional(), reference: z.string().trim().max(80).optional(), note: z.string().trim().max(200).optional(),
    credit: z.boolean().default(false) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const d = p.data, amount = Math.round(d.amount * 100) / 100, now = new Date().toISOString();
  if (d.credit && !(d.reference || '').length) return res.status(400).json({ error: 'reference_required' });   // credited once per transfer reference
  try {
    const out = await tx(async c => {
      const u = (await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!u) throw Object.assign(new Error('not_found'), { status: 404 });
      const method = d.method || (u.country === 'GH' ? 'mobile_money' : 'bank_transfer');
      const details = { source: 'support', addedBy: req.user.id, addedAt: now, ...(d.sender ? { sender: d.sender } : {}),
        ...(d.reference ? { transferRef: d.reference } : {}), ...(d.note ? { note: d.note } : {}), ...(d.credit ? { by: req.user.id, at: now } : {}) };
      const { rows } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, provider, provider_ref, status, details) VALUES ($1,'deposit',$2,$3,'manual',$4,$5,$6) RETURNING id`,
        [u.id, amount, method, referenceOf(u), d.credit ? 'success' : 'pending', details]);
      const balance = d.credit ? await creditDeposit(c, u, amount, rows[0].id, { method }) : Number(u.balance);
      if (d.credit) { await notify(c, u.id, 'deposit_credited', { amount, method: methodName(method), paymentId: rows[0].id, support: true }, req.user.id); await closeDepositRequests(c, u.id); }
      return { u, id: rows[0].id, method, balance };
    });
    res.status(201).json({ paymentId: out.id, status: d.credit ? 'success' : 'pending', balance: out.balance });
    if (d.credit) sendEmail('depositSuccess', out.u, { amount, method: methodName(out.method), paymentId: out.id, balance: out.balance, when: new Date() });
    else sendEmail('depositReceived', out.u, { amount, method: methodName(out.method), paymentId: out.id, reference: referenceOf(out.u), when: new Date() });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'duplicate_reference' });
    next(e);
  }
});

r.get('/payments', async (req, res, next) => {
  const st = req.query.status || 'pending', kind = ['deposit', 'withdrawal'].includes(req.query.kind) ? req.query.kind : null;
  try {
    const params = [], where = [];
    if (st === 'done') where.push("p.status <> 'pending'");
    else if (st !== 'all') { params.push(String(st)); where.push(`p.status=$${params.length}`); }
    if (kind) { params.push(kind); where.push(`p.kind=$${params.length}`); }
    const { rows } = await q(`SELECT p.*, u.phone, u.email, u.full_name, u.country, u.uid, u.verified, u.balance AS user_balance,
        EXISTS (SELECT 1 FROM payment_proofs x WHERE x.payment_id = p.id) AS has_proof, u.limits->'kyc'->>'status' AS kyc
      FROM payments p JOIN users u ON u.id=p.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${st === 'pending' ? 'p.created_at' : 'p.updated_at DESC'} LIMIT 200`, params);
    res.json({ payments: rows.map(x => ({ ...x, amount: Number(x.amount), user_balance: Number(x.user_balance), methodName: methodName(x.method) })) });
  } catch (e) { next(e); }
});

// Deposit 1, 2, 3 tracker: every player whose ID is approved, each step marked (✓ amount and date, being checked,
// next, later) – so the admin sees who has deposits left. Filtering and sorting happen in the portal.
r.get('/ladder', async (req, res, next) => {
  const cc = ['NG', 'GH'].includes(req.query.cc) ? req.query.cc : null, s = String(req.query.q || '').trim().slice(0, 60);
  try {
    const R = await bonusRules();
    if (!R.ladder) return res.json({ enabled: false, players: [], counts: {} });
    const params = [], where = [`u.role <> 'admin'`, R.ladder.requireId === false ? 'true' : 'u.verified'];
    if (cc) { params.push(cc); where.push(`u.country = $${params.length}`); }
    if (s) { params.push('%' + s + '%'); where.push(`(u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.uid::text LIKE $${params.length} OR u.full_name ILIKE $${params.length})`); }
    const { rows: users } = await q(`SELECT u.id, u.uid, u.full_name, u.phone, u.email, u.country, u.verified, u.balance, u.limits->'kyc'->>'decidedAt' AS verified_at
      FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC LIMIT 2000`, params);
    const ids = users.map(u => u.id);
    const [{ rows: bon }, { rows: pend }, { rows: last }] = await Promise.all([q(LADDER_ROWS_SQL, [ids, LADDER_KINDS]), q(PENDING_SQL, [ids]),
      q(`SELECT user_id, max(updated_at) AS at FROM payments WHERE user_id = ANY($1::uuid[]) AND kind='deposit' AND status='success' GROUP BY user_id`, [ids])]);
    const B = new Map(); for (const b of bon) { if (!B.has(b.user_id)) B.set(b.user_id, []); B.get(b.user_id).push(b); }
    const P = new Map(pend.map(x => [x.user_id, x])), L = new Map(last.map(x => [x.user_id, x.at]));
    const players = users.map(u => {
      const lad = buildLadder(R, u, B.get(u.id) || [], P.get(u.id) || null);
      return { id: u.id, uid: u.uid, full_name: u.full_name, phone: u.phone, email: u.email, country: u.country, balance: Number(u.balance), verified_at: u.verified_at,
        last_deposit: L.get(u.id) || null, done: lad.done, left: lad.left, next: lad.next, checking: lad.steps.some(x => x.status === 'checking'), steps: lad.steps };
    });
    const n = d => players.filter(p => p.done === d).length;
    res.json({ enabled: true, players, counts: { all: players.length, left: players.filter(p => p.left > 0).length, checking: players.filter(p => p.checking).length, s0: n(0), s1: n(1), s2: n(2), s3: n(3) },
      rules: { times: R.times, min_odds: R.min_odds, days: R.days } });
  } catch (e) { next(e); }
});

// the transfer screenshot a player added to a deposit
r.get('/payments/:id/proof', async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await q('SELECT mime, data FROM payment_proofs WHERE payment_id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.set({ 'content-type': rows[0].mime, 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' }).send(rows[0].data);
  } catch (e) { next(e); }
});

r.post('/payments/:id/:action', async (req, res, next) => {
  const action = req.params.action; // approve | reject (payout and check have their own routes below)
  if (action === 'payout' || action === 'check') return next();
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'bad_action' });
  const b = z.object({ amount: z.number().positive().max(1e8).optional(), reason: z.string().trim().max(200).optional(), reference: z.string().trim().max(80).optional(), note: z.string().trim().max(200).optional(),
    reviewed: z.boolean().optional(), override: z.boolean().optional() }).safeParse(req.body || {});
  if (!b.success) return res.status(400).json({ error: 'invalid' });
  if (action === 'reject' && !(b.data.reason || '').length) return res.status(400).json({ error: 'reason_required' });
  try {
    await tx(async c => {
      const { rows } = await c.query('SELECT * FROM payments WHERE id=$1 AND status=\'pending\' FOR UPDATE', [req.params.id]);
      const p = rows[0]; if (!p) throw Object.assign(new Error('not_pending'), { status: 409 });
      // the payment API settles these itself: a deposit is credited only when the provider confirms it, and a payout
      // already sent cannot be marked paid or refunded by hand (it would pay twice)
      if (gateway.isApi(p.provider)) throw Object.assign(new Error('api_payment'), { status: 409 });
      if (p.kind === 'deposit' && action === 'approve' && !(b.data.reference || '').length) throw Object.assign(new Error('reference_required'), { status: 400 });   // a manual deposit is credited once per transfer reference
      const ok = action === 'approve';
      // a deposit is credited with what actually arrived (the admin may correct the amount the player typed)
      const amount = p.kind === 'deposit' && ok && b.data.amount ? Math.round(b.data.amount * 100) / 100 : Number(p.amount);
      const note = { by: req.user.id, at: new Date().toISOString(), ...(b.data.reason ? { reason: b.data.reason } : {}), ...(b.data.reference ? (p.kind === 'deposit' ? { transferRef: b.data.reference } : { payoutRef: b.data.reference }) : {}), ...(b.data.note ? { note: b.data.note } : {}), ...(amount !== Number(p.amount) ? { claimed: Number(p.amount) } : {}),
        ...(p.kind === 'withdrawal' && ok ? { review: { by: req.user.id, at: new Date().toISOString(), reviewed: !!b.data.reviewed, override: !!b.data.override } } : {}) };
      await c.query(`UPDATE payments SET status=$2, amount=$4, updated_at=now(), details = details || $3::jsonb WHERE id=$1`, [p.id, ok ? 'success' : 'rejected', JSON.stringify(note), amount]);
      p.amount = amount;
      if (p.kind === 'withdrawal' && !ok) await move(c, p.user_id, 'refund', Number(p.amount), p.id, { reason: 'withdrawal_rejected' });
      if (p.kind === 'deposit' && ok) await creditDeposit(c, { id: p.user_id, country: (await c.query('SELECT country FROM users WHERE id=$1', [p.user_id])).rows[0].country }, Number(p.amount), p.id, { method: p.method });
      const u = (await c.query('SELECT * FROM users WHERE id=$1', [p.user_id])).rows[0];
      p.method = methodName(p.method); req.body = { ...req.body, reason: b.data.reason };
      if (p.kind === 'withdrawal') sendEmail(ok ? 'withdrawalPaid' : 'withdrawalRejected', u, { amount: Number(p.amount), method: p.method, paymentId: p.id, account: p.details?.account, when: new Date(), reason: req.body?.reason, balance: Number(u.balance) });
      else sendEmail(ok ? 'depositSuccess' : 'depositFailed', u, { amount: Number(p.amount), method: p.method, paymentId: p.id, balance: Number(u.balance), when: new Date(), reason: req.body?.reason, manual: p.provider === 'manual' });
      if (p.kind === 'withdrawal') await notify(c, p.user_id, ok ? 'withdrawal_paid' : 'withdrawal_rejected', { amount: Number(p.amount), method: p.method, account: p.details?.account || null, reference: b.data.reference || null, reason: b.data.reason || null, paymentId: p.id }, req.user.id);
      else { await notify(c, p.user_id, ok ? 'deposit_credited' : 'deposit_rejected', { amount: Number(p.amount), method: p.method, reason: b.data.reason || null, paymentId: p.id }, req.user.id); if (ok) await closeDepositRequests(c, p.user_id); }
    });
    res.json({ ok: true });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'duplicate_reference' }); next(e); }
});

// Ghana: pay a withdrawal to Mobile Money through the payment API (its webhook / status check marks it paid, or
// refunds it). A payout the provider refused before any money moved goes back to the queue as a manual payout.
// Sub-agents (lib/agents.js): make / stop an agent, the agents list, payout requests to approve or reject
r.get('/agents', async (_req, res, next) => { try { res.json({ agents: await agents.listAgents(), rules: await agents.rules() }); } catch (e) { next(e); } });
r.post('/users/:id/agent', async (req, res, next) => {
  const p = z.object({ on: z.boolean() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try { const a = await agents.setAgent(req.params.id, p.data.on); res.json({ ok: true, isAgent: a.is_agent, code: a.agent_code, link: a.agent_code ? agents.linkOf(a.agent_code) : null }); }
  catch (e) { if (e.body) return res.status(e.status).json(e.body); next(e); }
});
r.get('/agent-payouts', async (req, res, next) => { try { res.json({ payouts: await agents.payoutQueue(['pending', 'paid', 'rejected', 'all'].includes(req.query.status) ? req.query.status : 'pending') }); } catch (e) { next(e); } });
r.post('/agent-payouts/:id/:action', async (req, res, next) => {
  const approve = req.params.action === 'approve';
  if (!approve && req.params.action !== 'reject') return res.status(400).json({ error: 'bad_action' });
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
  if (!approve && !reason) return res.status(400).json({ error: 'reason_required' });
  try { res.json(await agents.decide(+req.params.id || 0, approve, req.user.id, reason)); }
  catch (e) { if (e.body) return res.status(e.status).json(e.body); next(e); }
});

// Send money: from the payment API wallet to any MoMo number (lib/walletPayouts.js). The admin's password is asked
// again for every send; wrong passwords are counted per admin (5 per 15 minutes).
const sendTries = new Map();
const walletErr = (res, e, next) => (e.body ? res.status(e.status).json(e.body) : next(e));
r.get('/wallet', async (_req, res, next) => { try { res.json(await walletPay.overview()); } catch (e) { next(e); } });
r.post('/wallet/lookup', async (req, res, next) => {
  const p = z.object({ phone: z.string().max(20), network: z.enum(['mtn', 'telecel', 'at']) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'momo_details' });
  try { res.json(await walletPay.lookup(p.data)); } catch (e) { walletErr(res, e, next); }
});
r.post('/wallet/send', async (req, res, next) => {
  const p = z.object({ phone: z.string().max(20), network: z.enum(['mtn', 'telecel', 'at']), amount: z.number().positive().max(1e7),
    reason: z.string().trim().min(3).max(200), password: z.string().min(1).max(200) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const tries = (sendTries.get(req.user.id) || []).filter(t => Date.now() - t < 15 * 60000);
  if (tries.length >= 5) return res.status(429).json({ error: 'too_many_attempts' });
  try {
    const { rows } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0] || !(await verifyHash(p.data.password, rows[0].password_hash))) { tries.push(Date.now()); sendTries.set(req.user.id, tries); return res.status(403).json({ error: 'bad_password' }); }
    sendTries.delete(req.user.id);
    res.json(await walletPay.send({ phone: p.data.phone, network: p.data.network, amount: p.data.amount, reason: p.data.reason, adminId: req.user.id }));
  } catch (e) { walletErr(res, e, next); }
});
r.post('/wallet/:id/check', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT * FROM wallet_payouts WHERE id=$1', [+req.params.id || 0]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    const x = await walletPay.check(rows[0]); res.json({ id: Number(x.id), status: x.status, error: x.error });
  } catch (e) { next(e); }
});

// The account checks an admin reviews before paying a withdrawal (lib/withdrawals.js); ?refresh=1 asks Moolre again
r.get('/payments/:id/checks', async (req, res, next) => {
  try {
    const c = await withdrawalChecks(req.params.id, { refresh: req.query.refresh === '1' });
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json(c);
  } catch (e) { next(e); }
});

r.post('/payments/:id/payout', async (req, res, next) => {
  const gw = gateway.active();
  if (!gw) return res.status(400).json({ error: 'api_not_configured' });
  const b = z.object({ reviewed: z.boolean().optional(), override: z.boolean().optional() }).safeParse(req.body || {});
  if (!b.success) return res.status(400).json({ error: 'invalid' });
  // nothing is sent without the admin having opened the account checks; red flags need an explicit override
  if (!b.data.reviewed) return res.status(400).json({ error: 'review_required' });
  try {
    const { rows } = await q(`SELECT * FROM payments WHERE id=$1 AND kind='withdrawal' AND status='pending' AND method='mobile_money'`, [req.params.id]);
    const p = rows[0]; if (!p) return res.status(409).json({ error: 'not_pending' });
    if (gateway.isApi(p.provider)) return res.status(409).json({ error: 'already_sent' });
    const chk = await withdrawalChecks(p.id);
    if (chk.bad && !b.data.override) return res.status(409).json({ error: 'checks_failed', flags: chk.flags.filter(f => f.level === 'bad') });
    await q(`UPDATE payments SET details = details || jsonb_build_object('review', $2::jsonb) WHERE id=$1`,
      [p.id, JSON.stringify({ by: req.user.id, at: new Date().toISOString(), reviewed: true, override: !!b.data.override, flags: chk.flags.map(f => `${f.level}: ${f.text}`), momoName: chk.momo && chk.momo.name || null })]);
    try { const t = await sendWithdrawal(p, { sentBy: req.user.id }); res.json({ ok: true, status: t.status }); }
    catch (e) { if (!e.status) throw e; res.status(e.status).json({ error: e.message, ...(e.detail ? { message: e.detail } : {}) }); }
  } catch (e) { next(e); }
});

/* ---------- Live support: the team's inbox (lib/support.js) ---------- */
const sfail = (res, e, next) => (e.status ? res.status(e.status).json({ error: e.message }) : next(e));
// GET /admin/support?status=active|closed|all – also marks the team as online for players
r.get('/support', async (req, res, next) => {
  try { await support.touchPresence(req.user); res.json({ threads: await support.inbox(String(req.query.status || 'active')), waiting: await support.waitingCount(), online: true }); }
  catch (e) { sfail(res, e, next); }
});
r.get('/support/count', async (req, res, next) => { try { res.json({ waiting: await support.waitingCount() }); } catch (e) { sfail(res, e, next); } });
r.get('/support/:id', async (req, res, next) => {
  try {
    await support.touchPresence(req.user);
    const t = await support.thread(Number(req.params.id), Number(req.query.after) || 0);
    if (!t) return res.status(404).json({ error: 'not_found' });
    if (t.thread.unread) await support.staffRead(t.thread.id);
    res.json(t);
  } catch (e) { sfail(res, e, next); }
});
r.post('/support/:id/message', async (req, res, next) => {
  try { res.json(await support.reply(Number(req.params.id), req.user, req.body && req.body.text)); } catch (e) { sfail(res, e, next); }
});
r.post('/support/:id/close', async (req, res, next) => {
  try { res.json(await support.close(Number(req.params.id), req.user)); } catch (e) { sfail(res, e, next); }
});

// Do payouts through the payment API work? (the last attempt; set by lib/withdrawals.js sendMomo)
r.get('/payout-health', async (_req, res, next) => {
  try { res.json({ ok: true, ...((await getSetting('payout_health')) || {}), deposits: (await getSetting('deposit_health')) || { ok: true } }); } catch (e) { next(e); }
});

// Ask the provider now about a payout that was sent (otherwise the webhook or the minute sweep does it)
r.post('/payments/:id/check', async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT * FROM payments WHERE id=$1`, [req.params.id]);
    const p = rows[0]; if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.status === 'pending' && gateway.isApi(p.provider)) await (p.kind === 'deposit' ? checkApi(p) : checkPayout(p));
    res.json({ payment: (await q(`SELECT id, kind, status, provider, amount FROM payments WHERE id=$1`, [p.id])).rows[0] });
  } catch (e) { next(e); }
});

// ID checks waiting for a decision
r.get('/kyc', async (_req, res, next) => {
  try {
    const { rows } = await q(`SELECT id, uid, country, phone, email, full_name, verified, limits->'kyc' AS kyc, created_at FROM users
      WHERE limits->'kyc'->>'status' = 'pending' AND NOT verified ORDER BY limits->'kyc'->>'submittedAt' LIMIT 200`);
    res.json({ users: rows });
  } catch (e) { next(e); }
});
// the player's ID photos (only admins can see them; never cached)
r.get('/users/:id/kyc-photo/:side', async (req, res, next) => {
  try {
    if (!['front', 'back'].includes(req.params.side)) return res.status(404).end();
    const { rows } = await q('SELECT mime, data FROM kyc_documents WHERE user_id=$1 AND side=$2 ORDER BY id DESC LIMIT 1', [req.params.id, req.params.side]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.set('cache-control', 'private, no-store').type(rows[0].mime).send(rows[0].data);
  } catch (e) { next(e); }
});
// approve | reject (the player can send it again) | resubmit: ask for the ID again with a reason, at any time – also
// after it was approved (a wrong or unclear ID found later). The player is told in the app and by email.
r.post('/users/:id/kyc', async (req, res, next) => {
  const p = z.object({ approve: z.boolean(), resubmit: z.boolean().optional(), reason: z.string().trim().max(200).optional() }).safeParse(req.body);
  if (!p.success || (!p.data.approve && !(p.data.reason || '').length)) return res.status(400).json({ error: 'invalid' });
  try {
    const st = p.data.approve ? 'verified' : p.data.resubmit ? 'resubmit' : 'rejected', now = new Date().toISOString();
    const { rows } = await q(`UPDATE users SET verified=$2, limits = jsonb_set(coalesce(limits,'{}'::jsonb), '{kyc}', coalesce(limits->'kyc','{}'::jsonb) || $3::jsonb) WHERE id=$1 RETURNING *`,
      [req.params.id, p.data.approve, JSON.stringify({ status: st, decidedAt: now, by: req.user.id, ...(st === 'resubmit' ? { requestedAt: now } : {}), ...(p.data.reason ? { reason: p.data.reason } : {}) })]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await q(`UPDATE notices SET done_at=now() WHERE user_id=$1 AND kind IN ('kyc_approved','kyc_rejected') AND done_at IS NULL`, [rows[0].id]);
    await notify(DB, rows[0].id, p.data.approve ? 'kyc_approved' : 'kyc_rejected', p.data.approve ? {} : { reason: p.data.reason }, req.user.id);
    res.json({ ok: true, status: st });
    sendEmail(p.data.approve ? 'kycVerified' : st === 'resubmit' ? 'kycResubmit' : 'kycRejected', rows[0], { reason: p.data.reason });
  } catch (e) { next(e); }
});

// Payment details players see (Nigeria bank account, Ghana MoMo number, limits) + payment API status
const money = z.number().min(1).max(1e8);
const paySchema = z.object({
  NG: z.object({ bank: z.object({ bank: z.string().trim().max(60), number: z.string().trim().regex(/^\d{10}$|^$/), name: z.string().trim().max(80), note: z.string().trim().max(200).default('') }),
    minDeposit: money, maxDeposit: money, minWithdraw: money, maxWithdraw: money, payoutTime: z.string().trim().max(40) }),
  GH: z.object({ momo: z.object({ network: z.enum(['mtn', 'telecel', 'at']), number: z.string().trim().regex(/^0?\d{9}$|^$/), name: z.string().trim().max(80), note: z.string().trim().max(200).default('') }),
    ussd: z.object({ code: z.string().trim().regex(/^\*\d{2,6}(\*\d{1,15})*#$|^$/), name: z.string().trim().max(80).default(''), note: z.string().trim().max(200).default('') }).optional(),
    minDeposit: money, maxDeposit: money, minWithdraw: money, maxWithdraw: money, payoutTime: z.string().trim().max(40) }),
});
r.get('/payment-settings', async (_req, res, next) => {
  try {
    const gw = gateway.active(), site = (process.env.SITE_URL || '').replace(/\/$/, '');
    let api = { provider: gw ? gw.name : 'none', label: gw ? gw.label : '', enabled: !!gw, test: gw ? gw.testMode() : false, webhook: gw ? site + gw.webhookPath : '' };
    if (gw && gw.name === 'moolre') {
      const acct = await gw.account().catch(e => ({ error: e.message }));
      api = { ...api, signed: !!gw.webhookSecret(), balance: acct.error ? { error: acct.error } : [{ currency: 'GHS', balance: acct.balance }],
        account: acct.error ? null : { name: acct.name, activated: acct.activated, callback: acct.callback, callbackOk: acct.callback === api.webhook } };
    } else if (gw) api = { ...api, balance: await gw.balance().catch(e => ({ error: e.message })) };
    res.json({ settings: await payConfig(), api, withdrawals: (await getSetting('withdrawals')) || { suspended: false, requireDeposits: true, newMembersOpen: true, message: '' } });
  } catch (e) { next(e); }
});
r.put('/payment-settings', async (req, res, next) => {
  const p = paySchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid', details: p.error.flatten().fieldErrors });
  for (const cc of ['NG', 'GH']) { const c = p.data[cc]; if (c.minDeposit > c.maxDeposit || c.minWithdraw > c.maxWithdraw) return res.status(400).json({ error: 'min_over_max', country: cc }); }
  const v = p.data; v.GH.momo.number = v.GH.momo.number.replace(/^0/, '');
  try { const saved = await savePayConfig(v); res.json({ settings: saved }); } catch (e) { next(e); }
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
    if (p.data.suspended === false && (await q(`SELECT 1 FROM events WHERE id=$1 AND ext_id LIKE 'man:%' AND kickoff <= now()`, [+req.params.eventId])).rowCount) return res.status(409).json({ error: 'started' });
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
    // a result can only be entered for a match that has started (cancelling – refund everything – is always allowed)
    if (!p.data.cancelled && (await q('SELECT 1 FROM events WHERE id=$1 AND kickoff > now()', [+req.params.id])).rowCount) return res.status(409).json({ error: 'not_started' });
    await q(`UPDATE events SET status=$2, score_home=$3, score_away=$4, ht_home=coalesce($5, ht_home), ht_away=coalesce($6, ht_away), updated_at=now() WHERE id=$1`,
      [+req.params.id, p.data.cancelled ? 'cancelled' : 'finished', p.data.home, p.data.away, p.data.htHome ?? null, p.data.htAway ?? null]);
    const settled = await settleEvent(+req.params.id);
    res.json({ ok: true, settled });
  } catch (e) { next(e); }
});

r.get('/settings', async (_req, res, next) => {
  try { const { rows } = await q('SELECT key, value FROM settings'); res.json(Object.fromEntries(rows.map(x => [x.key, x.value]))); } catch (e) { next(e); }
});
const LADDER = z.object({ enabled: z.boolean(), requireId: z.boolean(),
  NG: z.array(z.object({ pct: z.number().min(0).max(500), max: z.number().min(0).max(1e7) })).length(3),
  GH: z.array(z.object({ pct: z.number().min(0).max(500), max: z.number().min(0).max(1e5) })).length(3),
  times: z.number().min(1).max(50), min_odds: z.number().min(1.01).max(10), days: z.number().int().min(1).max(90) });
r.put('/settings/:key', async (req, res, next) => {
  if (req.params.key === 'deposit_bonuses' && !LADDER.safeParse(req.body.value).success) return res.status(400).json({ error: 'invalid' });
  if (req.params.key === 'withdrawals' && !z.object({ suspended: z.boolean(), requireDeposits: z.boolean(), newMembersOpen: z.boolean().default(true), message: z.string().trim().max(200).default('') }).safeParse(req.body.value).success) return res.status(400).json({ error: 'invalid' });
  try { await setSetting(req.params.key, req.body.value); res.json({ ok: true, value: await getSetting(req.params.key) }); } catch (e) { next(e); }
});

export default r;
