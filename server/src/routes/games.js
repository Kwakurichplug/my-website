// Casino-style games, all decided on the server with a CSPRNG after the stake is taken.
//   POST /api/games/:game/play   dice | spin | penalty | rush | keno | scratch | hilo
//   POST /api/games/hilo/deal    first card for Hi-Lo (signed, single use, 10 min)
//   GET  /api/games/history      the player's last plays
//   Rocket Crash: GET crash/state · POST crash/bet · POST crash/cashout · POST crash/cancel   (round audit: /api/admin/games/crash/verify/:id)
import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';
import { getSetting } from '../lib/settings.js';
import { GL, rng, r2 } from '../games/rng.js';
import * as crash from '../games/crash.js';

const r = Router();
const INSTANT = ['dice', 'spin', 'penalty', 'rush', 'keno', 'scratch', 'hilo'];
const SECRET = (process.env.JWT_SECRET || 'dev-only-change-me') + ':hilo';
const fail = (res, status, error, detail) => res.status(status).json({ error, ...(detail ? { detail } : {}) });
// limit plays per PLAYER (many players share one mobile-carrier IP); the crash state feed is cached and not limited
const playLimit = rateLimit({ windowMs: 60 * 1000, limit: 150, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => (req.user ? 'u:' + req.user.id : ipKeyGenerator(req.ip)), message: { error: 'too_many_requests' } });

async function limits(user, stake) {
  if (user.status === 'self_excluded') return ['self_excluded', 403];
  const g = (await getSetting('games'))?.[user.country] || { min: 1, max: 1e6 };
  if (!(stake >= g.min)) return ['min_stake', 400, { min: g.min }];
  if (stake > g.max) return ['max_stake', 400, { max: g.max }];
  return null;
}

/* ---------- Hi-Lo deal token: the first card, bound to the player, usable once ---------- */
function makeDeal(userId) {
  const card = GL.deal(rng), n = randomBytes(6).toString('hex').toUpperCase();
  const payload = Buffer.from(JSON.stringify({ u: userId, r: card.rank, s: card.suit, n, e: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  return { deal: payload + '.' + createHmac('sha256', SECRET).update(payload).digest('base64url'), card, odds: GL.hiloOdds(card.rank) };
}
function readDeal(tok, userId) {
  const [payload, sig] = String(tok || '').split('.');
  if (!payload || !sig) return null;
  const want = Buffer.from(createHmac('sha256', SECRET).update(payload).digest('base64url'));
  if (want.length !== Buffer.byteLength(sig) || !timingSafeEqual(want, Buffer.from(sig))) return null;
  const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return d.u === userId && d.e > Date.now() ? d : null;
}
r.post('/hilo/deal', playLimit, requireUser, (req, res) => res.json(makeDeal(req.user.id)));

/* ---------- instant games ---------- */
r.post('/:game/play', playLimit, requireUser, async (req, res, next) => {
  const game = req.params.game;
  if (!INSTANT.includes(game)) return fail(res, 404, 'unknown_game');
  const p = z.object({ stake: z.number().positive().max(1e9), choice: z.any().optional(), deal: z.string().max(600).optional() }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'invalid');
  const stake = r2(p.data.stake), bad = await limits(req.user, stake);
  if (bad) return fail(res, bad[1], bad[0], bad[2]);
  let id = 'G' + randomBytes(5).toString('hex').toUpperCase(), extra;
  if (game === 'hilo') {
    const d = readDeal(p.data.deal, req.user.id);
    if (!d) return fail(res, 400, 'deal_expired');
    id = 'H' + d.n; extra = { rank: d.r, suit: d.s };
  }
  // validate the choice before any money moves (a throw-away draw: a constant random number would loop forever in Scratch Cards)
  try { GL.play(game, rng, p.data.choice, extra); } catch { return fail(res, 400, 'bad_choice'); }
  try {
    const maxPay = (await getSetting('max_payout'))?.[req.user.country] ?? Infinity;
    const out = await tx(async c => {
      let balance = await debit(c, req.user.id, 'game_bet', stake, id, { game });
      const o = GL.play(game, rng, p.data.choice, extra);
      const payout = Math.min(maxPay, r2(stake * o.mult));
      if (payout > 0) balance = await move(c, req.user.id, 'game_win', payout, id, { game, mult: o.mult });
      await c.query(`INSERT INTO game_bets (id, user_id, game, stake, choice, result, mult, payout, status, settled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
        [id, req.user.id, game, stake, JSON.stringify(p.data.choice ?? null), o.result, o.mult, payout, payout > 0 ? 'won' : 'lost']);
      return { id, game, stake, choice: p.data.choice ?? null, mult: o.mult, payout, result: o.result, balance };
    });
    res.json(out);
  } catch (e) {
    if (e.code === '23505') return fail(res, 409, 'already_played');
    next(e);
  }
});

r.get('/history', requireUser, async (req, res, next) => {
  const game = typeof req.query.game === 'string' ? req.query.game : null;
  try {
    const { rows } = await q(`SELECT id, game, round, stake, choice, result, auto, mult, payout, status, created_at FROM game_bets
      WHERE user_id=$1 ${game ? 'AND game=$2' : ''} ORDER BY created_at DESC LIMIT 30`, game ? [req.user.id, game] : [req.user.id]);
    res.json({ plays: rows.map(x => ({ id: x.id, game: x.game, round: x.round, stake: Number(x.stake), choice: x.choice, result: x.result, auto: x.auto, mult: x.mult == null ? null : Number(x.mult), payout: Number(x.payout), status: x.status, at: x.created_at })) });
  } catch (e) { next(e); }
});

/* ---------- Rocket Crash ---------- */
r.get('/crash/state', async (_req, res, next) => { try { res.set('cache-control', 'no-store'); res.json(await crash.state()); } catch (e) { next(e); } });
r.post('/crash/bet', playLimit, requireUser, async (req, res, next) => {
  const p = z.object({ stake: z.number().positive().max(1e9), auto: z.number().min(1.01).max(200).nullable().optional() }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'invalid');
  const stake = r2(p.data.stake), bad = await limits(req.user, stake);
  if (bad) return fail(res, bad[1], bad[0], bad[2]);
  try { res.json(await crash.placeBet(req.user, stake, p.data.auto ? r2(p.data.auto) : null)); } catch (e) { next(e); }
});
r.post('/crash/cashout', playLimit, requireUser, async (req, res, next) => { try { res.json(await crash.cashOut(req.user)); } catch (e) { next(e); } });
r.post('/crash/cancel', playLimit, requireUser, async (req, res, next) => { try { res.json(await crash.cancel(req.user)); } catch (e) { next(e); } });

export default r;
