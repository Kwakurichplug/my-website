import { Router } from 'express';
import { z } from 'zod';
import { randomInt, randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';

// Instant Football: the server creates a round (fixtures + prices), the player picks and stakes, and the server
// plays the round and settles it in one call. Results come from a CSPRNG and are decided only after the stake is
// taken. A round is a sealed token (AES-256-GCM: opaque to the player, tamper-proof, no server memory), so any
// replica can serve the play; its nonce is the game_bets id, so a round can be played once.
const r = Router();
const TEAMS = ['Lagos Lions', 'Accra Hearts', 'Kano Pillars', 'Kumasi Kings', 'Enugu Rangers', 'Tamale Eagles', 'Ibadan Stars', 'Cape Coast United',
  'Abuja City', 'Takoradi Sharks', 'Port Harcourt FC', 'Tema Mariners', 'Benin Arsenal', 'Sunyani Chelsea', 'Jos Plateau', 'Ho Volta', 'Warri Wolves', 'Obuasi Goldfields', 'Owerri Heartland', 'Koforidua Royals'];
const MARGIN = 0.92;
const TTL = 15 * 60 * 1000;
const KEY = createHash('sha256').update((process.env.JWT_SECRET || 'dev-only-change-me') + ':instant').digest();
function signTok(obj) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
function readTok(tok) {
  try {
    const b = Buffer.from(String(tok || ''), 'base64url');
    if (b.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
    return o && o.e > Date.now() ? o : null;
  } catch { return null; }   // tampered, foreign or garbage
}
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
    return { i, home: t[i * 2], away: t[i * 2 + 1], lh: Math.round(lh * 1e4) / 1e4, la: Math.round(la * 1e4) / 1e4, odds: { 1: price(H), X: price(D), 2: price(A) } };
  });
  const id = signTok({ n: randomBytes(8).toString('hex').toUpperCase(), e: Date.now() + TTL, m: matches.map(x => [x.home, x.away, x.lh, x.la, x.odds[1], x.odds.X, x.odds[2]]) });
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
    roundId: z.string().max(4000),
    type: z.enum(['single', 'multiple']),
    stake: z.number().positive(),
    picks: z.array(z.object({ i: z.number().int().min(0).max(9), o: z.enum(['1', 'X', '2']) })).min(1).max(10),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { roundId, type, stake, picks } = p.data;
  const d = readTok(roundId);
  if (!d) return res.status(410).json({ error: 'round_expired' });
  if (req.user.status === 'self_excluded') return res.status(403).json({ error: 'self_excluded' });
  if (new Set(picks.map(x => x.i)).size !== picks.length) return res.status(400).json({ error: 'one_pick_per_match' });
  if (stake < MIN[req.user.country]) return res.status(400).json({ error: 'min_stake' });
  const matches = d.m.map(([home, away, lh, la, o1, oX, o2], i) => ({ i, home, away, lh, la, odds: { 1: o1, X: oX, 2: o2 } }));
  const total = type === 'single' ? stake * picks.length : stake;
  const ref = 'VI' + d.n;
  try {
    const out = await tx(async c => {
      await c.query(`INSERT INTO game_bets (id, user_id, game, stake, choice, status) VALUES ($1,$2,'instant',$3,$4,'open')`, [ref, req.user.id, total, JSON.stringify({ type, picks })]);
      await debit(c, req.user.id, 'virtual_bet', total, ref, { game: 'instant_football', type, picks });
      const results = matches.map(play);
      const won = picks.map(x => outcome(results[x.i].score) === x.o);
      const odds = picks.map(x => matches[x.i].odds[x.o]);
      const payout = Math.round((type === 'single'
        ? picks.reduce((s, _x, k) => s + (won[k] ? stake * odds[k] : 0), 0)
        : won.every(Boolean) ? stake * odds.reduce((a, b) => a * b, 1) : 0) * 100) / 100;
      let balance;
      if (payout > 0) balance = await move(c, req.user.id, 'virtual_win', payout, ref, { game: 'instant_football' });
      else { const { rows } = await c.query('SELECT balance FROM users WHERE id=$1', [req.user.id]); balance = Number(rows[0].balance); }
      await c.query(`UPDATE game_bets SET result=$2, mult=$3, payout=$4, status=$5, settled_at=now() WHERE id=$1`,
        [ref, { results: results.map(x => x.score) }, total ? Math.round(payout / total * 100) / 100 : 0, payout, payout > 0 ? 'won' : 'lost']);
      return { ref, results, won, payout, stake: total, balance };
    });
    res.json(out);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'round_expired' });   // that round was already played
    next(e);
  }
});

export default r;
