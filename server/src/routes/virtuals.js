import { Router } from 'express';
import { z } from 'zod';
import { randomInt, randomUUID } from 'node:crypto';
import { tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';

// Instant Football: the server creates a round (fixtures + prices), the player
// picks and stakes, and the server plays the round and settles it in one call.
// Results come from a CSPRNG and are decided only after the stake is taken.
const r = Router();
const TEAMS = ['Lagos Lions', 'Accra Hearts', 'Kano Pillars', 'Kumasi Kings', 'Enugu Rangers', 'Tamale Eagles', 'Ibadan Stars', 'Cape Coast United',
  'Abuja City', 'Takoradi Sharks', 'Port Harcourt FC', 'Tema Mariners', 'Benin Arsenal', 'Sunyani Chelsea', 'Jos Plateau', 'Ho Volta', 'Warri Wolves', 'Obuasi Goldfields', 'Owerri Heartland', 'Koforidua Royals'];
const MARGIN = 0.92;
const rounds = new Map(); // id -> { at, userId|null, matches }
const TTL = 15 * 60 * 1000;
const MIN = { NG: 100, GH: 1 };
const rnd = () => randomInt(0, 2 ** 31) / 2 ** 31;
const pois = (l, n = 10) => { const a = []; let p = Math.exp(-l); for (let k = 0; k <= n; k++) { a.push(p); p *= l / (k + 1); } return a; };
const sample = l => { let k = 0, p = Math.exp(-l), s = p; const u = rnd(); while (u > s && k < 10) { k++; p *= l / k; s += p; } return k; };
const price = p => Math.max(1.05, Math.round(MARGIN / p * 100) / 100);

function makeRound() {
  const t = [...TEAMS].sort(() => rnd() - 0.5);
  const matches = Array.from({ length: 10 }, (_, i) => {
    const lh = 0.7 + rnd() * 1.6, la = 0.5 + rnd() * 1.4, ph = pois(lh), pa = pois(la);
    let H = 0, D = 0, A = 0;
    ph.forEach((x, a) => pa.forEach((y, b) => { if (a > b) H += x * y; else if (a === b) D += x * y; else A += x * y; }));
    return { i, home: t[i * 2], away: t[i * 2 + 1], lh, la, odds: { 1: price(H), X: price(D), 2: price(A) } };
  });
  const id = randomUUID();
  rounds.set(id, { at: Date.now(), matches });
  for (const [k, v] of rounds) if (Date.now() - v.at > TTL) rounds.delete(k);
  return { id, matches: matches.map(({ i, home, away, odds }) => ({ i, home, away, odds })) };
}
function play(m) {
  const h = sample(m.lh), a = sample(m.la);
  const goals = [...Array(h).fill(0), ...Array(a).fill(1)].map(side => ({ side, min: 1 + randomInt(0, 90) })).sort((x, y) => x.min - y.min);
  return { i: m.i, score: [h, a], goals };
}
const outcome = s => (s[0] > s[1] ? '1' : s[0] === s[1] ? 'X' : '2');

r.get('/instant/round', (_req, res) => res.json(makeRound()));

r.post('/instant/play', requireUser, async (req, res, next) => {
  const p = z.object({
    roundId: z.string().uuid(),
    type: z.enum(['single', 'multiple']),
    stake: z.number().positive(),
    picks: z.array(z.object({ i: z.number().int().min(0).max(9), o: z.enum(['1', 'X', '2']) })).min(1).max(10),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { roundId, type, stake, picks } = p.data;
  const round = rounds.get(roundId);
  if (!round) return res.status(410).json({ error: 'round_expired' });
  if (new Set(picks.map(x => x.i)).size !== picks.length) return res.status(400).json({ error: 'one_pick_per_match' });
  if (stake < MIN[req.user.country]) return res.status(400).json({ error: 'min_stake' });
  rounds.delete(roundId); // one play per round
  const total = type === 'single' ? stake * picks.length : stake;
  const ref = 'VI' + Date.now().toString(36).toUpperCase();
  try {
    const out = await tx(async c => {
      await debit(c, req.user.id, 'virtual_bet', total, ref, { game: 'instant_football', type, picks });
      const results = round.matches.map(play);
      const won = picks.map(x => outcome(results[x.i].score) === x.o);
      const odds = picks.map(x => round.matches[x.i].odds[x.o]);
      const payout = Math.round((type === 'single'
        ? picks.reduce((s, _x, k) => s + (won[k] ? stake * odds[k] : 0), 0)
        : won.every(Boolean) ? stake * odds.reduce((a, b) => a * b, 1) : 0) * 100) / 100;
      let balance;
      if (payout > 0) balance = await move(c, req.user.id, 'virtual_win', payout, ref, { game: 'instant_football' });
      else { const { rows } = await c.query('SELECT balance FROM users WHERE id=$1', [req.user.id]); balance = Number(rows[0].balance); }
      return { ref, results, won, payout, stake: total, balance };
    });
    res.json(out);
  } catch (e) { next(e); }
});

export default r;
