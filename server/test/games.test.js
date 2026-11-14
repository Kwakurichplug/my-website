// Game maths – no server or database needed:  node --test test/games.test.js
// Exact return to player of every pay table, a Monte Carlo cross-check of the real play() code with the
// server's CSPRNG, Rocket Crash commit–reveal, and jackpot line counting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GL, rng } from '../src/games/rng.js';
import { pointFromSeed, hashSeed } from '../src/games/crash.js';
import { tiers } from '../src/games/jackpot.js';

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${x} not in [${lo}, ${hi}]`);

test('every pay table returns 94–97% to the player (exact)', () => {
  for (const k of ['under', 'seven', 'over']) between(GL.rtp('dice', k), 0.94, 0.97, 'dice ' + k);
  for (let p = 1; p <= 5; p++) between(GL.rtp('keno', p), 0.94, 0.97, `keno ${p} picks`);
  for (const g of ['spin', 'penalty', 'rush', 'scratch', 'hilo']) between(GL.rtp(g), 0.94, 0.97, g);
  for (let r = 0; r < 13; r++) { const o = GL.hiloOdds(r); if (o.higher) between(o.higher * (12 - r) / 13, 0.93, 0.97, `hilo higher on ${r}`); if (o.lower) between(o.lower * r / 13, 0.93, 0.97, `hilo lower on ${r}`); }
});

test('play() pays what the tables say (Monte Carlo with the server CSPRNG)', () => {
  const N = 120000, sim = (fn) => { let s = 0; for (let i = 0; i < N; i++) s += fn(); return s / N; };
  const cases = {
    dice: [() => GL.play('dice', rng, 'over').mult, GL.rtp('dice', 'over')],
    spin: [() => GL.play('spin', rng).mult, GL.rtp('spin')],
    penalty: [() => GL.play('penalty', rng, 'left').mult, GL.rtp('penalty')],
    rush: [() => GL.play('rush', rng).mult, GL.rtp('rush')],
    keno3: [() => GL.play('keno', rng, [3, 17, 29]).mult, GL.rtp('keno', 3)],
    scratch: [() => GL.play('scratch', rng).mult, GL.rtp('scratch')],
    hilo: [() => { const c = GL.deal(rng), o = GL.hiloOdds(c.rank), ch = o.higher && (!o.lower || rng() < 0.5) ? 'higher' : 'lower'; return GL.play('hilo', rng, ch, c).mult / (ch === 'higher' ? o.higher * (12 - c.rank) / 13 : o.lower * c.rank / 13) * 0.95; }, 0.95],
  };
  for (const [g, [fn, exact]] of Object.entries(cases)) { const m = sim(fn); assert.ok(Math.abs(m - exact) < (g === 'rush' || g === 'scratch' ? 0.06 : 0.03), `${g}: simulated ${m.toFixed(4)} vs exact ${exact.toFixed(4)}`); }
});

test('bad choices are rejected before any money could move', () => {
  assert.throws(() => GL.play('dice', rng, 'banana'));
  assert.throws(() => GL.play('penalty', rng, 'up'));
  assert.throws(() => GL.play('keno', rng, []));
  assert.throws(() => GL.play('keno', rng, [1, 2, 3, 4, 5, 6]));
  assert.throws(() => GL.play('hilo', rng, 'higher', { rank: 12, suit: 0 }), 'no "higher" on an ace');
  assert.throws(() => GL.play('nope', rng));
});

test('scratch cards: nine panels, the prize appears exactly three times, no other triple', () => {
  for (let i = 0; i < 20000; i++) {
    const o = GL.play('scratch', rng), c = {};
    o.result.cells.forEach(k => { c[k] = (c[k] || 0) + 1; });
    assert.equal(o.result.cells.length, 9);
    const triples = Object.entries(c).filter(([, n]) => n >= 3).map(([k]) => +k);
    if (o.mult) assert.deepEqual(triples, [o.mult]); else assert.equal(triples.length, 0);
  }
  for (const r of [() => 0, () => 0.5, () => 0.999999]) assert.equal(GL.play('scratch', r).result.cells.length, 9, 'no endless loop with a stuck random source');
});

test('Rocket Crash: 3% edge at every cash-out target, cap 200x', () => {
  for (const x of [1.01, 1.5, 2, 3.33, 10, 50, 100]) between(x * 97 / Math.ceil(100 * x - 1e-9), 0.965, 0.9701, `RTP cashing out at ${x}x`);
  let n2 = 0; const M = 200000;
  for (let i = 0; i < M; i++) { const p = GL.crashPoint((i + 0.5) / M); between(p, 1, 200, 'point'); if (p >= 2) n2++; }
  assert.ok(Math.abs(n2 / M - 0.485) < 0.002, 'P(point ≥ 2x) = 48.5%');
  for (const p of [1.01, 1.5, 2, 7.77, 199]) { const ms = GL.crashFlyMs(p); assert.ok(GL.crashMult(ms) >= p && GL.crashMult(ms - 120) < p, `flight time for ${p}x`); }
});

test('Rocket Crash is provably fair: hash = SHA-256(seed), point comes only from the seed', () => {
  const seed = 'a'.repeat(64);
  assert.equal(hashSeed(seed), createHash('sha256').update(seed).digest('hex'));
  assert.equal(pointFromSeed(seed), pointFromSeed(seed));
  const seen = new Set(); for (let i = 0; i < 50; i++) seen.add(pointFromSeed('seed-' + i));
  assert.ok(seen.size > 30, 'different seeds give different points');
});

test('jackpot: lines with 12, 11 and 10 correct', () => {
  const ids = Array.from({ length: 12 }, (_, i) => 100 + i), oc = Object.fromEntries(ids.map(id => [id, { o: '1' }]));
  const pick = (over = {}) => ids.map(id => ({ eventId: id, outcomes: over[id] || ['1'] }));
  assert.deepEqual(tiers(pick(), oc), { 12: 1, 11: 0, 10: 0 });
  assert.deepEqual(tiers(pick({ 100: ['X'] }), oc), { 12: 0, 11: 1, 10: 0 });
  assert.deepEqual(tiers(pick({ 100: ['X'], 101: ['2'] }), oc), { 12: 0, 11: 0, 10: 1 });
  assert.deepEqual(tiers(pick({ 100: ['1', 'X'] }), oc), { 12: 1, 11: 1, 10: 0 }, 'a double covers the result and adds a losing line');
  assert.deepEqual(tiers(pick({ 100: ['1', 'X', '2'], 101: ['1', 'X', '2'] }), oc), { 12: 1, 11: 4, 10: 4 }, '9 lines: 1 + 4 + 4');
});

test('CSPRNG gives uniform numbers in [0, 1)', () => {
  let s = 0, min = 1, max = 0; const N = 100000;
  for (let i = 0; i < N; i++) { const u = rng(); s += u; min = Math.min(min, u); max = Math.max(max, u); }
  assert.ok(min >= 0 && max < 1 && Math.abs(s / N - 0.5) < 0.01);
});
