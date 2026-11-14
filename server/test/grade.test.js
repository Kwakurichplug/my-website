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
test('European handicaps (incl. legacy keys)', () => {
  assert.equal(g('eh', '0:1|1', ev(2, 0)), 'won'); assert.equal(g('eh', '0:1|X', ev(2, 1)), 'won'); assert.equal(g('eh', '0:1|2', ev(1, 1)), 'won');
  assert.equal(g('eh', '1:0|1', ev(1, 1)), 'won'); assert.equal(g('eh', '2:0|X', ev(0, 2)), 'won'); assert.equal(g('eh', '0:3|2', ev(2, 0)), 'won');
  assert.equal(g('eh-1', '1', ev(2, 0)), 'won'); assert.equal(g('eh+1', 'X', ev(0, 1)), 'won');
});
test('Asian handicap, whole-number totals push', () => {
  assert.equal(g('ah', '-1.5|1', ev(2, 0)), 'won'); assert.equal(g('ah', '-1.5|1', ev(1, 0)), 'lost'); assert.equal(g('ah', '0.5|2', ev(1, 1)), 'lost'); assert.equal(g('ah', '0.5|1', ev(1, 1)), 'won');
  assert.equal(g('ou', 'o2', ev(1, 1)), 'void'); assert.equal(g('ou', 'u2', ev(1, 1)), 'void'); assert.equal(g('ou', 'o2', ev(2, 1)), 'won');
});
test('half markets need the half-time score', () => {
  assert.equal(g('1h1x2', '1', ev(2, 1)), 'void');
  const e = ev(2, 1, { ht_home: 1, ht_away: 0 });
  assert.equal(g('1h1x2', '1', e), 'won'); assert.equal(g('2h1x2', 'X', e), 'won'); assert.equal(g('htft', '1/1', e), 'won'); assert.equal(g('htft', 'X/1', e), 'lost');
  assert.equal(g('1hou', 'o0.5', e), 'won'); assert.equal(g('2hou', 'u1.5', e), 'lost'); assert.equal(g('1hcs', '1-0', e), 'won'); assert.equal(g('2hcs', '1-1', e), 'won');
  assert.equal(g('hsh', '2', e), 'won'); assert.equal(g('hwb', 'hwb:n', e), 'won'); assert.equal(g('hwe', 'hwe:y', e), 'won'); assert.equal(g('hgg', 'ny', e), 'won');
  assert.equal(g('bho05', 'bho05:y', e), 'won'); assert.equal(g('hsb', 'hsb:y', e), 'won'); assert.equal(g('asb', 'asb:n', e), 'won');
});
test('combos, margins, ranges, clean sheets', () => {
  const e = ev(2, 1);
  assert.equal(g('1x2ou2.5', '1&o2.5', e), 'won'); assert.equal(g('1x2ou2.5', '1&u2.5', e), 'lost'); assert.equal(g('1x2gg', '1&gg', e), 'won'); assert.equal(g('ougg', 'o2.5&gg', e), 'won');
  assert.equal(g('dcou', '1X&o2.5', e), 'won'); assert.equal(g('dcgg', 'X2&gg', e), 'lost'); assert.equal(g('hwtn', 'hwtn:n', e), 'won'); assert.equal(g('hwtn', 'hwtn:y', ev(2, 0)), 'won');
  assert.equal(g('wm', 'h1', e), 'won'); assert.equal(g('wm', 'a3', ev(0, 4)), 'won'); assert.equal(g('xg', '3', e), 'won'); assert.equal(g('xg', '6+', ev(4, 3)), 'won');
  assert.equal(g('gr', '2-3', e), 'won'); assert.equal(g('wts', 'both', e), 'won'); assert.equal(g('wts', 'home', ev(1, 0)), 'won'); assert.equal(g('mg', '2-4', e), 'won'); assert.equal(g('hmg', 'none', ev(0, 2)), 'won');
  assert.equal(g('hcs', 'hcs:y', ev(1, 0)), 'won'); assert.equal(g('acs', 'acs:n', ev(1, 0)), 'won'); assert.equal(g('hnb', '2', ev(2, 0)), 'void'); assert.equal(g('anb', '1', ev(2, 0)), 'won'); assert.equal(g('hxg', '3+', ev(3, 0)), 'won');
});
test('corners, cards and next goal need their data', () => {
  assert.equal(g('cor', 'o9.5', ev(1, 0)), 'void'); assert.equal(g('cor', 'o9.5', ev(1, 0, { stats: { corners: [6, 4] } })), 'won'); assert.equal(g('cor1x2', '1', ev(1, 0, { stats: { corners: [6, 4] } })), 'won');
  assert.equal(g('bk', 'u3.5', ev(1, 0, { stats: { cards: [1, 2] } })), 'won'); assert.equal(g('hbk', 'o1.5', ev(1, 0, { stats: { cards: [1, 2] } })), 'lost');
  const e = ev(2, 1, { stats: { goals: [{ min: 10, side: 0 }, { min: 50, side: 1 }, { min: 80, side: 0 }] } });
  assert.equal(gradeLeg({ market_key: 'next', outcome_key: '2', market_name: 'Next Goal (2)' }, e), 'won'); assert.equal(gradeLeg({ market_key: 'next', outcome_key: 'none', market_name: 'Next Goal (4)' }, e), 'won');
});
test('two-way winner voids on a tie', () => { assert.equal(g('win', '1', ev(100, 100)), 'void'); assert.equal(g('win', '2', ev(98, 101)), 'won'); });
test('unknown market is void, never paid', () => { assert.equal(g('nope', '1', ev(1, 0)), 'void'); });
