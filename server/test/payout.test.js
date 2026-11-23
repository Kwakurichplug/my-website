// Integration test: real money flow through the API and the ledger.
// Needs a running server (API_URL, default http://127.0.0.1:8081) on a TEST database (DATABASE_URL).
// Run: API_URL=… DATABASE_URL=… node --test test/payout.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const API = (process.env.API_URL || 'http://127.0.0.1:8081') + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/letbet_oa' });
let token, events = [];
const r2 = n => Math.round(n * 100) / 100;
async function api(path, body, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || res.status), { body: j });
  return j;
}
const balance = async () => (await api('/wallet')).balance;
const oddOf = (ev, mk = '1x2', ok = '1') => ev.markets.find(m => m.key === mk).outcomes[ok].o;
// a result is only accepted after kick-off (admin.js): the match "kicks off" first, like a real one
const result = async (id, home, away, cancelled) => { if (!cancelled) await db.query(`UPDATE events SET kickoff = least(kickoff, now() - interval '1 second') WHERE id=$1`, [id]); return api(`/admin/events/${id}/result`, { home, away, cancelled }); };
const bet = async (type, sels, stake) => (await api('/bets/place', { type, selections: sels.map(([ev, mk = '1x2', ok = '1']) => ({ eventId: ev.id, market: mk, outcome: ok, odd: oddOf(ev, mk, ok) })), ...(type === 'single' ? { stakes: sels.map(() => stake) } : { stake }), acceptChanges: false })).bets;
const betRow = async id => (await db.query('SELECT status, paid::float FROM bets WHERE id=$1', [id])).rows[0];

before(async () => {
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123' });
  token = r.token;
  await db.query(`UPDATE users SET role='admin' WHERE phone=$1 AND country='NG'`, [phone]);
  await api('/wallet/deposit', { amount: 100000, method: 'card' });
  events = (await api('/events?status=scheduled&sport=football&limit=200')).events.filter(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended));
  assert.ok(events.length >= 12, 'need 12 open fixtures, have ' + events.length);
});
after(() => db.end());

test('single win pays stake × odd', async () => {
  const [A] = events; const b0 = await balance();
  const [b] = await bet('single', [[A]], 1000);
  assert.equal(await balance(), r2(b0 - 1000));
  await result(A.id, 2, 0);
  const row = await betRow(b.id);
  assert.equal(row.status, 'won'); assert.equal(row.paid, r2(1000 * oddOf(A)));
  assert.equal(await balance(), r2(b0 - 1000 + 1000 * oddOf(A)));
});

test('3-leg multiple with win boost', async () => {
  const [, B, C, D] = events; const b0 = await balance();
  const [b] = await bet('multiple', [[B], [C], [D]], 500);
  assert.equal(b.boost, 5, 'boost for 3 legs is 5%');
  for (const e of [B, C, D]) await result(e.id, 3, 1);
  const base = 500 * oddOf(B) * oddOf(C) * oddOf(D), want = r2(base + (base - 500) * 0.05);
  const row = await betRow(b.id);
  assert.equal(row.status, 'won'); assert.ok(Math.abs(row.paid - want) <= 0.01, `paid ${row.paid} want ${want}`);
  assert.ok(Math.abs(await balance() - (b0 - 500 + row.paid)) <= 0.01);
});

test('void leg drops out of a multiple, no boost', async () => {
  const E = events[4], F = events[5]; const b0 = await balance();
  const [b] = await bet('multiple', [[E], [F]], 500);
  await result(E.id, 0, 0, true);   // cancelled → void
  await result(F.id, 1, 0);
  const row = await betRow(b.id);
  assert.equal(row.status, 'won'); assert.equal(row.paid, r2(500 * oddOf(F)));
  assert.ok(Math.abs(await balance() - (b0 - 500 + row.paid)) <= 0.01);
});

test('one losing leg loses the multiple; no payout', async () => {
  const G = events[6], H = events[7]; const b0 = await balance();
  const [b] = await bet('multiple', [[G], [H]], 400);
  await result(G.id, 0, 1);         // home pick loses
  const row = await betRow(b.id);
  assert.equal(row.status, 'lost'); assert.equal(row.paid, 0);
  assert.equal(await balance(), r2(b0 - 400));
});

test('all legs void refunds the stake', async () => {
  const I = events[8]; const b0 = await balance();
  const [b] = await bet('single', [[I]], 700);
  await result(I.id, 0, 0, true);
  const row = await betRow(b.id);
  assert.equal(row.status, 'void'); assert.equal(row.paid, 700);
  assert.equal(await balance(), b0);
});

test('cashout with a void leg is priced on the remaining leg only', async () => {
  const J = events[9], K = events[10]; const b0 = await balance();
  const [b] = await bet('multiple', [[J], [K]], 500);
  await result(J.id, 0, 0, true);   // void
  const { bets } = await api('/bets?status=open');
  const open = bets.find(x => x.id === b.id);
  // fair value = stake × (placed odd K / current odd K) × 0.92 margin = 460 when K's price is unchanged
  assert.ok(open.cashout > 400 && open.cashout <= 500, `cashout offer ${open.cashout} should be ~460`);
  const r = await api(`/bets/${b.id}/cashout`, {});
  assert.equal(r.paid, open.cashout);
  assert.ok(Math.abs(await balance() - (b0 - 500 + r.paid)) <= 0.01);
  assert.equal((await betRow(b.id)).status, 'cashout');
});

test('settling the same match twice never pays twice', async () => {
  const L = events[11]; const b0 = await balance();
  const [b] = await bet('single', [[L]], 300);
  await result(L.id, 1, 0);
  const after1 = await balance();
  await result(L.id, 1, 0);
  await Promise.all([result(L.id, 1, 0), result(L.id, 1, 0)]);
  assert.equal(await balance(), after1);
  assert.equal(after1, r2(b0 - 300 + 300 * oddOf(L)));
  assert.equal((await betRow(b.id)).status, 'won');
});

test('ledger balance equals the sum of transactions', async () => {
  const { rows } = await db.query(`SELECT u.balance::float b, coalesce(sum(t.amount),0)::float s FROM users u LEFT JOIN transactions t ON t.user_id=u.id WHERE u.role='admin' GROUP BY u.id ORDER BY max(t.created_at) DESC LIMIT 1`);
  assert.ok(Math.abs(rows[0].b - rows[0].s) < 0.005, `balance ${rows[0].b} vs ledger ${rows[0].s}`);
});
