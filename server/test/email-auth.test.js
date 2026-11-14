// Integration test: sign up, log in and reset the password with an EMAIL address; verified email change.
// Needs a running server (API_URL) on a TEST database (DATABASE_URL) with the console email provider outside
// production (test mode: the API returns the code as devCode) and PAYMENTS_MODE=demo.
//   API_URL=… DATABASE_URL=… node --test test/email-auth.test.js
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const API = (process.env.API_URL || 'http://127.0.0.1:8081') + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/letbet_oa' });
after(() => db.end());
async function api(path, body, tok) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || String(res.status)), { status: res.status, body: j });
  return j;
}
// emails are sent just after the response: poll the log briefly
const logged = async (uid, template) => { for (let i = 0; i < 40; i++) { const { rows } = await db.query('SELECT status FROM email_log WHERE user_id=$1 AND template=$2', [uid, template]); if (rows.length) return rows[0].status; await new Promise(r => setTimeout(r, 100)); } return null; };
const fails = async (p, error) => { try { await p; } catch (e) { assert.equal(e.message, error); return; } assert.fail('expected ' + error); };
const tag = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mail = n => `player.${n}.${tag}@example.com`;
async function emailUser(email, country = 'NG') {
  const o = await api('/auth/otp', { country, email, purpose: 'register' });
  assert.match(String(o.devCode), /^\d{6}$/, 'test mode returns the code');
  return api('/auth/register', { country, email, code: o.devCode, password: 'Strong123' });
}

test('the app is told which sign-up methods can deliver a code', async () => {
  const m = await api('/auth/methods');
  assert.equal(typeof m.phone, 'boolean'); assert.equal(typeof m.email, 'boolean');
  assert.ok(m.email, 'email codes work in test mode');
});

test('sign up with email: code to the address, account without a phone number, welcome email', async () => {
  const email = mail('a');
  const r = await emailUser(email.toUpperCase().replace('@EXAMPLE.COM', '@Example.com'));
  assert.equal(r.user.email, email, 'stored lower-case');
  assert.equal(r.user.phone, null);
  assert.equal(r.user.country, 'NG');
  assert.ok(await logged(r.user.id, 'welcome'), 'welcome email sent to the new address');
  // the same address cannot register twice, in any letter case or country
  await fails(api('/auth/otp', { country: 'GH', email: email.toUpperCase(), purpose: 'register' }), 'email_taken');
  // a wrong code is refused
  const other = mail('b'), o = await api('/auth/otp', { country: 'NG', email: other, purpose: 'register' });
  await fails(api('/auth/register', { country: 'NG', email: other, code: o.devCode === '000000' ? '111111' : '000000', password: 'Strong123' }), 'bad_code');
});

test('log in with email from either country site; wrong password refused', async () => {
  const email = mail('c'); await emailUser(email, 'GH');
  const l1 = await api('/auth/login', { email: email.toUpperCase(), password: 'Strong123' });
  assert.equal(l1.user.country, 'GH');
  const l2 = await api('/auth/login', { country: 'NG', email, password: 'Strong123' });
  assert.equal(l2.user.email, email, 'an NG site login finds the GH account (the app then switches country)');
  await fails(api('/auth/login', { email, password: 'Wrong123' }), 'bad_login');
  await fails(api('/auth/login', { email: mail('nobody'), password: 'Strong123' }), 'bad_login');
});

test('reset the password with an email code', async () => {
  const email = mail('d'); await emailUser(email);
  await fails(api('/auth/otp', { country: 'NG', email: mail('ghost'), purpose: 'reset' }), 'no_account');
  const o = await api('/auth/otp', { country: 'NG', email, purpose: 'reset' });
  await api('/auth/reset', { email, code: o.devCode, password: 'Newpass123' });
  await fails(api('/auth/login', { email, password: 'Strong123' }), 'bad_login');
  const l = await api('/auth/login', { email, password: 'Newpass123' });
  assert.ok(await logged(l.user.id, 'passwordChanged'), 'password-changed email sent');
  await fails(api('/auth/reset', { email, code: o.devCode, password: 'Again12345' }), 'bad_code');   // single use
});

test('changing the email needs a code sent to the new address', async () => {
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token, user } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123' });
  assert.equal(user.email, null);
  const want = mail('e');
  const s = await api('/auth/email', { email: want }, token);
  assert.ok(s.sent && /^\d{6}$/.test(s.devCode));
  assert.equal((await api('/auth/me', null, token)).user.email, null, 'nothing changes before the code is confirmed');
  // another player cannot confirm with this player's code
  const b = await emailUser(mail('f'));
  await fails(api('/auth/email/confirm', { email: want, code: s.devCode }, b.token), 'bad_code');
  await fails(api('/auth/email/confirm', { email: want, code: s.devCode === '000000' ? '111111' : '000000' }, token), 'bad_code');
  const c = await api('/auth/email/confirm', { email: want, code: s.devCode }, token);
  assert.equal(c.user.email, want);
  // the phone player can now log in with the email too; nobody else can take it
  await api('/auth/login', { email: want, password: 'Strong123' });
  await fails(api('/auth/email', { email: want.toUpperCase() }, b.token), 'email_taken');
  // sign-up codes are never stored in the email log
  const { rows } = await db.query(`SELECT subject FROM email_log WHERE template='otp' ORDER BY id DESC LIMIT 20`);
  assert.ok(rows.length && rows.every(x => !/\d{6}/.test(x.subject)), 'codes are redacted');
});

test('an email-only player can deposit and play', async () => {
  const { token } = await emailUser(mail('g'));
  await api('/wallet/deposit', { amount: 5000, method: 'card' }, token);
  const r = await api('/games/dice/play', { stake: 100, choice: 'over' }, token);
  assert.ok(r.balance === 4900 || r.balance > 4900);
  const tx = await api('/wallet/transactions', null, token);
  assert.ok(tx.transactions.some(t => t.type === 'deposit'));
});
