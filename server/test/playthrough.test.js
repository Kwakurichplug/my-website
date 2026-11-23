// Play-through: a deposit must be staked once before it can be withdrawn; winnings never locked; a transfer to a
// friend takes the lock with it. Plus: the admin can ask for the ID again at any time.
// Needs a running server on a TEST database with PAYMENTS_MODE=demo:
//   API_URL=… DATABASE_URL=… node --test test/playthrough.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const API = (process.env.API_URL || 'http://127.0.0.1:8081') + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/letbet_oa' });
const r2 = n => Math.round(n * 100) / 100;
async function api(path, body, tok) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { http: res.status, ...j };
}
async function newUser(deposit, admin) {
  const phone = '70' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123', fullName: 'Play Through' });
  if (admin) await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [r.user.id]);
  if (deposit) assert.equal((await api('/wallet/deposit', { amount: deposit, method: 'card' }, r.token)).status, 'success');
  return { ...r, phone };
}
const me = async t => (await api('/auth/me', null, t)).user;
const bank = { bank: 'GTBank', acct: '0123456789', name: 'Play Through' };
const withdraw = (t, amount) => api('/wallet/withdraw', { amount, method: 'bank_transfer', details: bank }, t);
// This suite tests the play-through rule on its own: the 3-deposit withdrawal rule (payments-api.test.js) is switched
// off while it runs, then restored.
let ADMIN, RULE;
const put = (path, value, tok) => fetch(API + path, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: JSON.stringify({ value }) });
before(async () => {
  ADMIN = (await newUser(0, true)).token;
  RULE = (await db.query(`SELECT value FROM settings WHERE key='withdrawals'`)).rows[0]?.value;
  await put('/admin/settings/withdrawals', { ...(RULE || {}), suspended: false, requireDeposits: false, newMembersOpen: true, message: '' }, ADMIN);
});
after(async () => { if (RULE) await put('/admin/settings/withdrawals', RULE, ADMIN); await db.end(); });

test('a deposit must be staked once before it can be withdrawn; winnings are never locked', async () => {
  const p = await newUser(5000);
  let u = await me(p.token);
  assert.equal(u.playLeft, 5000, 'the whole deposit is locked');
  const w0 = await withdraw(p.token, 1000);
  assert.equal(w0.http, 400); assert.equal(w0.error, 'play_through'); assert.deepEqual(w0.detail, { left: 5000, withdrawable: 0 });

  // stakes take the lock down, win or lose
  let staked = 0;
  while (staked < 2000) { const g = await api('/games/dice/play', { stake: 500, choice: 'over' }, p.token); assert.ok(g.balance != null, JSON.stringify(g)); staked += 500; }
  u = await me(p.token);
  assert.equal(u.playLeft, Math.min(3000, u.balance), '2,000 staked: 3,000 left (never above the balance)');
  const free = r2(u.balance - u.playLeft);
  if (free >= 1000) {
    assert.ok((await withdraw(p.token, free)).paymentId, 'what is above the lock (winnings) can be withdrawn');
    assert.equal((await withdraw(p.token, 1000)).error, 'play_through', 'but not the locked part');
  }

  // play the rest through: then everything can go
  for (let i = 0; i < 40 && (u = await me(p.token)).playLeft > 0 && u.balance >= 500; i++) await api('/games/dice/play', { stake: 500, choice: 'over' }, p.token);
  u = await me(p.token);
  if (u.playLeft === 0 && u.balance >= 1000) assert.ok((await withdraw(p.token, Math.floor(u.balance))).paymentId, 'played through: all of it');
  else assert.equal(u.playLeft, Math.min(u.playLeft, u.balance), 'the lock never passes the balance');
});

test('a second deposit adds to the lock; a transfer to a friend takes the lock with it', async () => {
  const a = await newUser(3000), b = await newUser(0);
  await api('/wallet/deposit', { amount: 2000, method: 'card' }, a.token);
  assert.equal((await me(a.token)).playLeft, 5000);
  const t = await api('/wallet/transfer', { phone: b.phone, amount: 1500 }, a.token);
  assert.ok(t.ok, JSON.stringify(t));
  assert.equal((await me(a.token)).playLeft, 3500, 'the sender keeps the rest of the lock');
  assert.equal((await me(b.token)).playLeft, 1500, 'the money sent stays locked for the friend');
  assert.equal((await withdraw(b.token, 1500)).error, 'play_through', 'no way round it through a friend');
});

test('the admin can ask for the ID again, with a reason, also after approving it', async () => {
  const admin = await newUser(0, true), p = await newUser(0);
  await db.query(`UPDATE users SET verified=true, limits = limits || '{"kyc":{"status":"verified"}}'::jsonb WHERE id=$1`, [p.user.id]);
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: false, resubmit: true }, admin.token)).error, 'invalid', 'a reason is required');
  const r = await api(`/admin/users/${p.user.id}/kyc`, { approve: false, resubmit: true, reason: 'This is not your ID – please upload your own ID' }, admin.token);
  assert.equal(r.status, 'resubmit');
  const u = await me(p.token);
  assert.equal(u.verified, false); assert.equal(u.limits.kyc.status, 'resubmit'); assert.match(u.limits.kyc.reason, /not your ID/); assert.ok(u.limits.kyc.requestedAt);
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: false, resubmit: true, reason: 'x' }, p.token)).http, 403, 'admins only');
});
