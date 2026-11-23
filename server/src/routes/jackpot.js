import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { debit } from '../lib/wallet.js';
import { getSetting } from '../lib/settings.js';
import { currentRound, currentPot } from '../games/jackpot.js';
import { eventsWithMarkets } from './events.js';
import { sendEmail } from '../emails/index.js';

// ticket confirmation email with the 12 picks (after the purchase has committed)
async function ticketEmail(user, ref, round, picks) {
  const { rows } = await q('SELECT id, home, away FROM events WHERE id = ANY($1::bigint[])', [picks.map(x => x.eventId)]);
  const name = Object.fromEntries(rows.map(e => [String(e.id), `${e.home} vs ${e.away}`]));
  const prize = (await getSetting('jackpot'))?.[user.country]?.jackpot || 0;
  const pick = { 1: 'Home', X: 'Draw', 2: 'Away' };
  sendEmail('jackpotTicket', user, { ticketId: ref, prize, draw: round.closes_at,
    picks: picks.map(x => ({ match: name[String(x.eventId)] || 'Match', pick: x.outcomes.map(o => pick[o]).join(' / ') })) });
}

// Weekly 12-game jackpot. The server fixes the round's 12 games (games/jackpot.js); a ticket picks one or
// more outcomes per game; every combination is a line at the line price. Graded and paid automatically.
const r = Router();

r.get('/round', async (_req, res, next) => {
  try {
    const round = await currentRound(), cfg = await getSetting('jackpot');
    if (!round) return res.json({ round: null, prizes: cfg });
    const pot = await currentPot(round);
    const ids = round.event_ids.map(Number), evs = await eventsWithMarkets(ids, ['1x2']);
    evs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    res.json({ round: { code: round.code, closesAt: round.closes_at, events: evs }, prizes: cfg, pot, fund: round.rules ? round.rules.fund : null });
  } catch (e) { next(e); }
});

r.get('/results', async (_req, res, next) => {
  try {
    const { rows } = await q(`SELECT code, event_ids, outcomes, summary, settled_at FROM jackpot_rounds WHERE status='settled' ORDER BY id DESC LIMIT 6`);
    const ids = [...new Set(rows.flatMap(x => x.event_ids.map(Number)))];
    const names = ids.length ? (await q('SELECT id, home, away, score_home, score_away, status FROM events WHERE id = ANY($1)', [ids])).rows : [];
    res.json({ rounds: rows.map(x => ({ code: x.code, settledAt: x.settled_at, summary: x.summary,
      games: x.event_ids.map(Number).map(id => { const e = names.find(n => Number(n.id) === id); return { id, match: e ? `${e.home} vs ${e.away}` : `Event ${id}`, score: e && e.status === 'finished' ? [e.score_home, e.score_away] : null, ...(x.outcomes?.[id] || {}) }; }) })) });
  } catch (e) { next(e); }
});

r.post('/tickets', requireUser, async (req, res, next) => {
  const p = z.object({
    round: z.string().max(20),
    picks: z.array(z.object({ eventId: z.number().int(), outcomes: z.array(z.enum(['1', 'X', '2'])).min(1).max(3) })).length(12),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  if (req.user.status === 'self_excluded') return res.status(403).json({ error: 'self_excluded' });
  const { picks } = p.data;
  try {
    const round = await currentRound();
    if (!round || round.code !== p.data.round) return res.status(409).json({ error: 'round_closed' });
    const want = round.event_ids.map(Number);
    if (new Set(picks.map(x => x.eventId)).size !== 12 || !picks.every(x => want.includes(x.eventId))) return res.status(409).json({ error: 'round_changed' });
    const lines = picks.reduce((n, x) => n * new Set(x.outcomes).size, 1);
    if (lines > 2048) return res.status(400).json({ error: 'too_many_lines' });
    const cost = lines * (await getSetting('jackpot'))[req.user.country].line;
    const ref = 'JP' + randomBytes(4).toString('hex').toUpperCase();
    const clean = picks.map(x => ({ eventId: x.eventId, outcomes: [...new Set(x.outcomes)] }));
    const balance = await tx(async c => {
      const b = await debit(c, req.user.id, 'jackpot', cost, ref, { round: round.code, lines, picks: clean });
      const ok = await c.query(`INSERT INTO jackpot_tickets (ref, user_id, round_id, round_code, country, picks, lines, cost)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8 WHERE now() < (SELECT closes_at FROM jackpot_rounds WHERE id=$3)`, [ref, req.user.id, round.id, round.code, req.user.country, JSON.stringify(clean), lines, cost]);
      if (!ok.rowCount) throw Object.assign(new Error('round_closed'), { status: 409 });
      return b;
    });
    res.status(201).json({ ref, round: round.code, lines, cost, balance });
    ticketEmail(req.user, ref, round, clean).catch(() => {});
  } catch (e) { next(e); }
});

r.get('/tickets', requireUser, async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT ref, round_code, lines, cost, picks, status, hits, prize, created_at, settled_at FROM jackpot_tickets WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ tickets: rows.map(t => ({ ref: t.ref, round: t.round_code, cost: Number(t.cost), lines: t.lines, picks: t.picks, status: t.status, hits: t.hits, prize: Number(t.prize), at: t.created_at, settledAt: t.settled_at })) });
  } catch (e) { next(e); }
});

export default r;
