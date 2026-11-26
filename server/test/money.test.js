// Money safety (unit): the acca boost can never make a multiple return more than it takes on average.
//   DATABASE_URL=… node --test test/money.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeBoost } from '../src/routes/bets.js';

const TIERS = [[3, 5], [5, 15], [8, 40], [10, 60], [15, 120], [20, 200]];
const boostFor = (steps, n) => steps.reduce((b, [k, v]) => (n >= k ? v : b), 0);

test('acca boost: at most 97% back on average for any number of selections and any odds', () => {
  for (const margin of [0.9, 0.94, 0.96]) for (let n = 3; n <= 30; n++) {
    for (const tiers of [TIERS, [[3, 5], [5, 50], [10, 200], [15, 500], [20, 1000]]]) {   // the old tiers too
      const b = Math.min(boostFor(tiers, n), safeBoost(n, margin)) / 100;
      // worst case: long odds on every leg -> the multiple returns margin^n x (1 + boost)
      assert.ok(Math.pow(margin, n) * (1 + b) <= 0.971, `n=${n} margin=${margin} boost=${b}`);
    }
  }
  // the safe tiers are offered in full at the default margin
  for (const [n, pct] of TIERS) assert.ok(safeBoost(n, 0.94) >= pct, `tier ${n}: ${pct}% fits`);
  // the old 1000% at 20 selections is cut back
  assert.ok(safeBoost(20, 0.94) < 300);
});
