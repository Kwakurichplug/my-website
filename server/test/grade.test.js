// Unit tests: grading every market the feed offers from the final score.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/letbet_oa';
const { gradeLeg } = await import('../src/lib/settle.js');
const ev = (h, a, extra = {}) => ({ score_home: h, score_away: a, ht_home: null, ht_away: null, stats: {}, ...extra });
const g = (mk, ok, e) => gradeLeg({ market_key: mk, outcome_key: ok }, e);

test('1X2', () => {
  assert.equal(g('1x2', '1', ev(2, 1)), 'won'); assert.equal(g('1x2', 'X', ev(2, 1)), 'lost');
  assert.equal(g('1x2', 'X', ev(1, 1)), 'won'); assert.equal(g('1x2', '2', ev(0, 3)), 'won');
});
test('double chance', () => {
  assert.equal(g('dc', '1X', ev(1, 1)), 'won'); assert.equal(g('dc', '1X', ev(0, 1)), 'lost');
  assert.equal(g('dc', '12', ev(1, 1)), 'lost'); assert.equal(g('dc', 'X2', ev(0, 2)), 'won');
});
test('draw no bet voids on a draw', () => {
  assert.equal(g('dnb', '1', ev(1, 1)), 'void'); assert.equal(g('dnb', '1', ev(2, 0)), 'won'); assert.equal(g('dnb', '2', ev(2, 0)), 'lost');
});
test('both teams to score', () => {
  assert.equal(g('gg', 'gg', ev(1, 1)), 'won'); assert.equal(g('gg', 'ng', ev(1, 1)), 'lost'); assert.equal(g('gg', 'ng', ev(3, 0)), 'won');
});
test('over/under lines and team totals', () => {
  assert.equal(g('ou', 'o2.5', ev(2, 1)), 'won'); assert.equal(g('ou', 'o2.5', ev(1, 1)), 'lost');
  assert.equal(g('ou', 'u0.5', ev(0, 0)), 'won'); assert.equal(g('ou', 'u5.5', ev(3, 3)), 'lost');
  assert.equal(g('hou', 'o1.5', ev(2, 0)), 'won'); assert.equal(g('aou', 'u0.5', ev(2, 0)), 'won');
});
test('odd/even', () => { assert.equal(g('oe', 'odd', ev(2, 1)), 'won'); assert.equal(g('oe', 'even', ev(0, 0)), 'won'); });
test('correct score incl. Other', () => {
  assert.equal(g('cs', '2-1', ev(2, 1)), 'won'); assert.equal(g('cs', '2-1', ev(1, 2)), 'lost');
  assert.equal(g('cs', 'oth', ev(5, 0)), 'won'); assert.equal(g('cs', 'oth', ev(4, 4)), 'lost');
});
test('European handicaps', () => {
  assert.equal(g('eh-1', '1', ev(2, 0)), 'won'); assert.equal(g('eh-1', 'X', ev(2, 1)), 'won'); assert.equal(g('eh-1', '2', ev(1, 1)), 'won');
  assert.equal(g('eh+1', '1', ev(1, 1)), 'won'); assert.equal(g('eh+1', 'X', ev(0, 1)), 'won'); assert.equal(g('eh+1', '2', ev(0, 2)), 'won');
});
test('two-way winner voids on a tie', () => { assert.equal(g('win', '1', ev(100, 100)), 'void'); assert.equal(g('win', '2', ev(98, 101)), 'won'); });
test('unknown market is void, never paid', () => { assert.equal(g('nope', '1', ev(1, 0)), 'void'); });
