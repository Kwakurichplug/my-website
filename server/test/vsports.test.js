// Unit tests: virtual sports – results are valid for each sport, every market is priced with the house margin,
// and the prices match the model that decides the match (each outcome returns ~94% over many draws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/letbet_oa';
const { card, VSPORTS, _test } = await import('../src/games/vsports.js');
const { gradeLeg } = await import('../src/lib/settle.js');
const { rng } = await import('../src/games/rng.js');
const { SPORTS, fast } = _test;

test('seven virtual sports, fictional names only', () => {
  assert.deepEqual(VSPORTS, ['vbasketball', 'vtennis', 'vicehockey', 'vvolleyball', 'vtabletennis', 'vhandball', 'vdarts']);
  for (const S of SPORTS) { assert.equal(new Set(S.teams).size, 12, S.id); assert.match(S.league, /^Virtual /); }
});

test('results are valid for each sport (CSPRNG draws)', () => {
  for (const S of SPORTS) {
    for (let i = 0; i < 400; i++) {
      const m = S.model(rng), r = S.sim(m, rng);
      if (!S.draw) assert.notEqual(r.h, r.a, `${S.id} never ends level`);
      if (S.id === 'vtennis') { assert.equal(Math.max(r.h, r.a), 2); assert.equal(r.total, r.sets.reduce((s, g) => s + g[0] + g[1], 0)); r.sets.forEach(([x, y]) => assert.ok(Math.max(x, y) >= 6 && Math.abs(x - y) >= 1)); }
      if (S.id === 'vvolleyball' || S.id === 'vtabletennis') {
        assert.equal(Math.max(r.h, r.a), 3);
        r.sets.forEach(([x, y], k) => { const to = S.id === 'vtabletennis' ? 11 : k === 4 ? 15 : 25; assert.ok(Math.max(x, y) >= to && Math.abs(x - y) >= 2, `${S.id} set ${x}-${y}`); });
        r.seq.forEach((w, k) => assert.equal(w === 1, r.sets[k][0] > r.sets[k][1], 'set winner matches its points'));
      }
      if (S.id === 'vdarts') assert.equal(Math.max(r.h, r.a), 6);
      if (S.id === "vbasketball") assert.ok(r.h > 60 && r.a > 60 && r.h < 190 && r.a < 190, `basketball ${r.h}-${r.a}`);
    }
  }
});

test('cards: Winner (1X2 for handball), Handicap, Total – half lines only, margin on every market', () => {
  for (const S of SPORTS) {
    const c = Object.fromEntries(card(S, S.model(rng), 7).map(m => [m.key, m]));
    assert.ok(c[S.draw ? '1x2' : 'win'] && c.spr && c.tot, `${S.id} markets ${Object.keys(c)}`);
    for (const m of Object.values(c)) {
      for (const k of Object.keys(m.outcomes)) { const L = parseFloat(m.key === 'spr' ? k : k.slice(1)); if (m.key !== 'win' && m.key !== '1x2') assert.equal(Math.abs(L % 1), 0.5, `${S.id} ${k} is a half line`); }
      const lines = m.key === 'spr' ? [...new Set(Object.keys(m.outcomes).map(k => k.split('|')[0]))] : m.key === 'tot' ? [...new Set(Object.keys(m.outcomes).map(k => k.slice(1)))] : [null];
      for (const L of lines) {
        const pair = Object.entries(m.outcomes).filter(([k]) => L == null || (m.key === 'spr' ? k.startsWith(L + '|') : k.slice(1) === L));
        const book = pair.reduce((s, [, o]) => s + 1 / o.o, 0);
        assert.ok(book > 1.05 && book < 1.085, `${S.id} ${m.key} ${L} overround ${book.toFixed(3)}`);
      }
    }
  }
});

test('prices match the model: every outcome returns ~94% of stakes', () => {
  const DRAWS = 40000;
  for (const S of SPORTS) {
    const model = S.model(fast(11)), c = card(S, model, 99), R = fast(12345);
    const res = Array.from({ length: DRAWS }, () => S.sim(model, R));
    for (const m of c) {
      for (const [k, o] of Object.entries(m.outcomes)) {
        const won = res.reduce((n, r) => n + (gradeLeg({ market_key: m.key, outcome_key: k }, { score_home: r.h, score_away: r.a, stats: { total: r.total ?? null } }) === 'won' ? 1 : 0), 0);
        const p = won / DRAWS, ret = p * o.o, se = o.o * Math.sqrt(p * (1 - p) * (1 / DRAWS + 1 / 30000)) + 0.006;
        assert.ok(Math.abs(ret - 0.94) < 4.5 * se, `${S.id} ${m.key} ${k} @${o.o}: returns ${ret.toFixed(3)} (±${(4.5 * se).toFixed(3)})`);
      }
    }
  }
});
