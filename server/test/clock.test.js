// Match clock rules (server side). betting/app.js clockOf() runs the same rules to the second – keep them in step.
//   DATABASE_URL=… node --test test/clock.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveClock } from '../src/feeds/oddsapi.js';
import { clockAt } from '../src/games/virtual.js';

const lab = c => (c.awaiting ? 'AR' : c.over ? 'FT' : c.period === 'HT' ? 'HT' : `${c.minute}${c.plus ? '+' + c.plus : ''}`);

test('real fixtures: TV-style clock, added time in both halves, then awaiting the result', () => {
  const K = Date.UTC(2026, 0, 1, 15), at = mins => lab(liveClock(new Date(K), K + mins * 60000));
  const marks = [0.5, 30.2, 44.9, 45.1, 46.5, 47.9, 48, 62.9, 63, 89.5, 106.9, 107, 114.9, 115, 140];
  assert.deepEqual(marks.map(at), ['1', '30', '44', '45+1', '45+2', '45+3', 'HT', 'HT', '46', '72', '89', '90+1', '90+8', 'AR', 'AR']);
  assert.equal(liveClock(new Date(K), K + 115 * 60000).awaiting, true, 'markets close once the match should be over');
});

test('Virtual League: one speed for every match; each half ends after its own added time', () => {
  const add = [2, 4], at = f => lab(clockAt(f, add));
  assert.deepEqual([0, 0.2, 0.455, 0.4699, 0.5, 0.53, 0.75, 0.97, 0.9999].map(at), ['1', '21', '45+2', 'HT', 'HT', '46', '69', '90+2', 'FT']);
  // minutes never go backwards over the whole play-out
  // two matches at the same moment show the same minute, whatever their added time
  assert.equal(lab(clockAt(0.3, [1, 2])), lab(clockAt(0.3, [3, 5])));
  assert.equal(lab(clockAt(0.8, [1, 2])), lab(clockAt(0.8, [3, 5])));
  let last = 0;
  for (let f = 0; f < 1; f += 0.001) { const c = clockAt(f, add), v = c.half * 1000 + c.t; assert.ok(v >= last, `at ${f.toFixed(3)}`); last = v; }
});
