// Unit: how the odds feed spreads its credits – the reserve kept for results, and spending until a date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/letbet_oa';
const oa = await import('../src/feeds/oddsapi.js');

const withEnv = (vars, fn) => {
  const keep = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v == null) delete process.env[k]; else process.env[k] = v;
  try { return fn(); } finally { for (const [k, v] of Object.entries(keep)) if (v == null) delete process.env[k]; else process.env[k] = v; }
};
const NOW = Date.parse('2026-11-20T11:30:00Z');

test('default: the credits left are spread over the rest of the month, nothing reserved', () => withEnv({ ODDS_RESERVE: null, ODDS_SPEND_UNTIL: null }, () => {
  assert.equal(oa.reserve(), 0);
  assert.ok(oa.spreadDays(NOW) >= 1);
}));

test('spend until a date: the spare credits (above the reserve) go over the days up to it', () => withEnv({ ODDS_RESERVE: '100', ODDS_SPEND_UNTIL: '2026-11-23T00:00:00Z' }, () => {
  assert.equal(oa.reserve(), 100);
  assert.equal(oa.spreadDays(NOW), 3, 'Thursday 11:30 → Monday 00:00 = 3 days (rounded up)');
  assert.equal(Math.round(oa.dailyAllowance(372, NOW)), Math.round(272 / 3));
  assert.equal(oa.dailyAllowance(90, NOW), 0, 'never spends into the reserve');
}));

test('after the date: back to the monthly spread of what is above the reserve', () => withEnv({ ODDS_RESERVE: '100', ODDS_SPEND_UNTIL: '2026-11-19T00:00:00Z' }, () => {
  assert.ok(oa.spreadDays(NOW) > 3);
  assert.ok(oa.dailyAllowance(150, NOW) < 50 / 3 + 1);
}));

test('a bad date or a negative reserve is ignored', () => withEnv({ ODDS_RESERVE: '-5', ODDS_SPEND_UNTIL: 'next weekend' }, () => {
  assert.equal(oa.reserve(), 0);
  assert.ok(oa.spreadDays(NOW) >= 1);
}));
