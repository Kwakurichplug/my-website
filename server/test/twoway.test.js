// Unit tests: basketball / ice hockey / American football / baseball from the live odds feed –
// bookmaker consensus, the stored card, and settlement on the final score (pushes refund).
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/letbet_oa';
const { gradeLeg } = await import('../src/lib/settle.js');
const { consensus2, twoWayCard, sportOf } = await import('../src/feeds/oddsapi.js');
const ev = (h, a) => ({ score_home: h, score_away: a, ht_home: null, ht_away: null, stats: {} });
const g = (mk, ok, e) => gradeLeg({ market_key: mk, outcome_key: ok }, e);

test('winner: overtime result decides, a level game is refunded', () => {
  assert.equal(g('win', '1', ev(110, 104)), 'won'); assert.equal(g('win', '2', ev(110, 104)), 'lost');
  assert.equal(g('win', '1', ev(20, 20)), 'void');
});
test('handicap keys carry the home line; a result on the line is refunded', () => {
  assert.equal(g('spr', '-5.5|1', ev(110, 104)), 'won');   // home -5.5, won by 6
  assert.equal(g('spr', '-5.5|1', ev(109, 104)), 'lost');  // won by 5
  assert.equal(g('spr', '-5.5|2', ev(109, 104)), 'won');   // away +5.5
  assert.equal(g('spr', '+3.5|1', ev(100, 103)), 'won');   // home underdog +3.5, lost by 3
  assert.equal(g('spr', '-3|1', ev(24, 21)), 'void'); assert.equal(g('spr', '-3|2', ev(24, 21)), 'void');
  assert.equal(g('spr', '0|2', ev(3, 4)), 'won');
  assert.equal(g('spr', 'junk', ev(3, 4)), 'void'); assert.equal(g('spr', '-1.5|3', ev(3, 1)), 'void');
});
test('totals include overtime; a total on the line is refunded', () => {
  assert.equal(g('tot', 'o224.5', ev(115, 110)), 'won'); assert.equal(g('tot', 'u224.5', ev(115, 110)), 'lost');
  assert.equal(g('tot', 'o44', ev(24, 20)), 'void'); assert.equal(g('tot', 'u6.5', ev(3, 2)), 'won');
});

const book = (h2h, spread, total) => ({ key: 'b', markets: [
  { key: 'h2h', outcomes: [{ name: 'Lakers', price: h2h[0] }, { name: 'Celtics', price: h2h[1] }] },
  spread && { key: 'spreads', outcomes: [{ name: 'Lakers', price: spread[1], point: spread[0] }, { name: 'Celtics', price: spread[2], point: -spread[0] }] },
  total && { key: 'totals', outcomes: [{ name: 'Over', price: total[1], point: total[0] }, { name: 'Under', price: total[2], point: total[0] }] },
].filter(Boolean) });
const game = books => ({ home_team: 'Lakers', away_team: 'Celtics', bookmakers: books });

test('consensus: de-vigged median, popular lines only', () => {
  const c = consensus2(game([book([1.8, 2.05], [-2.5, 1.91, 1.91], [224.5, 1.9, 1.9]), book([1.83, 2.0], [-2.5, 1.95, 1.87], [224.5, 1.87, 1.95]),
    book([1.78, 2.1], [-3, 1.95, 1.87], [225.5, 1.91, 1.91]), book([1.8, 2.05], [-2.5, 1.9, 1.92], [224.5, 1.9, 1.9])]));
  assert.ok(c.pH > 0.5 && c.pH < 0.56, 'home favourite ~53%');
  assert.deepEqual(c.spr.map(s => s.point), [-2.5]);          // -3 has 1 of 4 books (< 30% of 3, min 2)
  assert.deepEqual(c.tot.map(t => t.point), [224.5]);
  assert.equal(c.books, 4);
  assert.equal(consensus2(game([{ key: 'x', markets: [{ key: 'h2h', outcomes: [{ name: 'Lakers', price: 2 }, { name: 'Draw', price: 3 }, { name: 'Celtics', price: 3 }] }] }])), null);
});
test('card: winner, handicap, total with a margin on both sides', () => {
  const c = { pH: 0.6, books: 6, spr: [{ point: -4.5, p: 0.5 }], tot: [{ point: 6.5, p: 0.45 }] };
  const card = Object.fromEntries(twoWayCard(c, 'Goals').map(m => [m.key, m]));
  assert.deepEqual(Object.keys(card), ['win', 'spr', 'tot']);
  assert.deepEqual(Object.keys(card.spr.outcomes), ['-4.5|1', '-4.5|2']);
  assert.equal(card.spr.outcomes['-4.5|2'].l, 'Away (+4.5)');
  assert.equal(card.tot.name, 'Total Goals');
  for (const m of Object.values(card)) { const book = Object.values(m.outcomes).reduce((s, o) => s + 1 / o.o, 0); assert.ok(book > 1.01 && book < 1.15, `${m.key} overround ${book}`); }
  assert.equal(sportOf('basketball_nba'), 'basketball'); assert.equal(sportOf('soccer_epl'), 'football');
});
