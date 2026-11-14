import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { debit } from '../lib/wallet.js';

// Weekly 12-game jackpot. A ticket picks one or more outcomes per game; every
// combination is a line, and each line costs the line price. Tickets are paid
// through the ledger (type 'jackpot') and kept in the transaction's meta.
const r = Router();
r.use(requireUser);
const PRICE = { NG: 100, GH: 1 };

r.post('/tickets', async (req, res, next) => {
  const p = z.object({
    round: z.string().max(20),
    picks: z.array(z.object({ eventId: z.number().int(), outcomes: z.array(z.enum(['1', 'X', '2'])).min(1).max(3) })).length(12),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { round, picks } = p.data;
  if (new Set(picks.map(x => x.eventId)).size !== 12) return res.status(400).json({ error: 'invalid' });
  const lines = picks.reduce((n, x) => n * new Set(x.outcomes).size, 1);
  if (lines > 2048) return res.status(400).json({ error: 'too_many_lines' });
  const cost = lines * PRICE[req.user.country];
  const ref = 'JP' + Date.now().toString(36).toUpperCase();
  try {
    const balance = await tx(c => debit(c, req.user.id, 'jackpot', cost, ref, { round, lines, picks }));
    res.status(201).json({ ref, lines, cost, balance });
  } catch (e) { next(e); }
});

r.get('/tickets', async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT ref, amount, meta, created_at FROM transactions WHERE user_id=$1 AND type='jackpot' ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ tickets: rows.map(t => ({ ref: t.ref, cost: -Number(t.amount), round: t.meta.round, lines: t.meta.lines, picks: t.meta.picks, at: t.created_at })) });
  } catch (e) { next(e); }
});

export default r;
