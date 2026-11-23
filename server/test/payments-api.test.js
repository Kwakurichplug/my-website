// Integration: real-money payments with no demo shortcuts – Nigeria manual bank deposits confirmed by an admin,
// withdrawals paid or refunded, ID checks, and Ghana Mobile Money through the payment API (mock Paystack).
// Needs a server WITHOUT PAYMENTS_MODE=demo, on a TEST database, pointed at tools/qa/mock_paystack.js:
//   node tools/qa/mock_paystack.js 9098 http://127.0.0.1:8096 &
//   PORT=8096 PAYSTACK_BASE=http://127.0.0.1:9098 PAYSTACK_SECRET_KEY=sk_test_mock DATABASE_URL=… node src/index.js
//   PAY_API_URL=http://127.0.0.1:8096 MOCK_PAYSTACK=http://127.0.0.1:9098 DATABASE_URL=… node --test test/payments-api.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const ID_PHOTO = 'data:image/jpeg;base64,' + Buffer.alloc(9000, 7).toString('base64');   // front / back of the ID

const BASE = process.env.PAY_API_URL, MOCK = process.env.MOCK_PAYSTACK || 'http://127.0.0.1:9098';
const skip = !BASE && 'set PAY_API_URL (a server without demo payments) to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/letbet_pay' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
async function player(cc, opts = {}) {
  const phone = opts.phone || (cc === 'GH' ? '24' : '80') + rnd().slice(0, cc === 'GH' ? 7 : 8);
  const o = await api('/auth/otp', { country: cc, phone, purpose: 'register' });
  const r = await api('/auth/register', { country: cc, phone, code: o.devCode, password: 'Strong123', fullName: opts.name || 'Ada Test' });
  if (opts.admin) await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [r.user.id]);
  return { token: r.token, user: r.user, phone };
}
const bal = async t => (await api('/wallet', null, t)).balance;
const payment = async id => (await db.query('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
const ledgerOk = async uid => { const { rows } = await db.query(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [uid]); assert.equal(Math.round(rows[0].b * 100), Math.round(rows[0].s * 100), 'ledger = balance'); };

let ADMIN;
const SETTINGS = {
  NG: { bank: { bank: 'Test Bank', number: '0123456789', name: 'LETBETAFRIKA LTD', note: 'Use your reference' }, minDeposit: 1000, maxDeposit: 5000000, minWithdraw: 1000, maxWithdraw: 2000000, payoutTime: 'within 24 hours' },
  GH: { momo: { network: 'mtn', number: '0241234567', name: 'LETBETAFRIKA GH', note: '' }, minDeposit: 10, maxDeposit: 50000, minWithdraw: 10, maxWithdraw: 20000, payoutTime: 'within 24 hours' },
};
before(async () => { if (!skip) ADMIN = (await player('NG', { admin: true })).token; });
after(() => db.end());

test('Nigeria: no bank account set → no deposit method; admin sets it (validated) → bank transfer opens', { skip }, async () => {
  await db.query(`DELETE FROM settings WHERE key='payments'`);
  const p = await player('NG');
  let o = await api('/wallet/options', null, p.token);
  assert.equal(o.deposit.length, 0, 'nothing to deposit with until the admin sets the bank account');
  assert.deepEqual(o.withdraw.map(x => x.method), ['bank_transfer']);
  assert.equal((await api('/admin/payment-settings', { ...SETTINGS, NG: { ...SETTINGS.NG, bank: { ...SETTINGS.NG.bank, number: '12AB' } } }, ADMIN, 'PUT')).error, 'invalid');
  assert.equal((await api('/admin/payment-settings', SETTINGS, p.token, 'PUT')).status, 403, 'players cannot change payment details');
  const saved = await api('/admin/payment-settings', SETTINGS, ADMIN, 'PUT');
  assert.equal(saved.settings.NG.bank.number, '0123456789');
  o = await api('/wallet/options', null, p.token);
  assert.equal(o.deposit[0].method, 'bank_transfer'); assert.equal(o.deposit[0].mode, 'manual');
  assert.equal(o.deposit[0].account.name, 'LETBETAFRIKA LTD');
  assert.match(o.reference, /^LB\d{6,}$/);
  const log = await api('/admin/log', null, ADMIN);
  assert.ok(log.log.some(l => /payment-settings/.test(l.action) && l.meta && l.meta.NG), 'the change is in the admin log');
});

test('Nigeria: bank deposit waits for an admin, who credits what arrived (welcome bonus included)', { skip }, async () => {
  const p = await player('NG');
  assert.equal((await api('/wallet/deposit', { amount: 5000, method: 'bank_transfer', details: {} }, p.token)).error, 'sender_required');
  assert.equal((await api('/wallet/deposit', { amount: 5000, method: 'card' }, p.token)).error, 'method_closed', 'cards are off');
  assert.equal((await api('/wallet/deposit', { amount: 500, method: 'bank_transfer', details: { sender: 'Ada Test' } }, p.token)).error, 'below_minimum');
  const d = await api('/wallet/deposit', { amount: 5000, method: 'bank_transfer', details: { sender: 'Ada Test' } }, p.token);
  assert.equal(d.status, 'pending'); assert.match(d.reference, /^LB\d+/);
  assert.equal(await bal(p.token), 0, 'nothing credited before the admin confirms');
  const q = await api('/admin/payments?status=pending&kind=deposit', null, ADMIN);
  const row = q.payments.find(x => x.id === d.paymentId);
  assert.ok(row && row.details.sender === 'Ada Test' && row.provider_ref === d.reference, 'admin sees sender and reference');
  // the bank shows ₦4,500 arrived: the admin credits that
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, { amount: 4500 }, ADMIN)).ok, true);
  assert.equal(await bal(p.token), 4500);
  const pay = await payment(d.paymentId);
  assert.equal(pay.status, 'success'); assert.equal(Number(pay.amount), 4500); assert.equal(pay.details.claimed, 5000);
  const bonus = await api('/wallet/bonuses', null, p.token);
  assert.ok(bonus.bonuses.length === 1 && Number(bonus.bonuses[0].amount) === 9000, 'welcome bonus on the first confirmed deposit');
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, {}, ADMIN)).status, 409, 'cannot be credited twice');
  await ledgerOk(p.user.id);
});

test('Nigeria: rejected with a reason; at most 3 waiting at once', { skip }, async () => {
  const p = await player('NG');
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await api('/wallet/deposit', { amount: 2000, method: 'bank_transfer', details: { sender: 'Ada Test' } }, p.token)).paymentId);
  assert.equal((await api('/wallet/deposit', { amount: 2000, method: 'bank_transfer', details: { sender: 'Ada Test' } }, p.token)).error, 'too_many_pending');
  assert.equal((await api(`/admin/payments/${ids[0]}/reject`, {}, ADMIN)).error, 'reason_required');
  assert.equal((await api(`/admin/payments/${ids[0]}/reject`, { reason: 'No transfer received' }, ADMIN)).ok, true);
  const mine = await api('/wallet/payments', null, p.token);
  assert.equal(mine.payments.find(x => x.id === ids[0]).status, 'rejected');
  assert.equal(mine.payments.find(x => x.id === ids[0]).reason, 'No transfer received');
  assert.equal(await bal(p.token), 0);
});

test('withdrawals: held at request, paid by the admin or refunded on rejection', { skip }, async () => {
  const p = await player('NG');
  const d = await api('/wallet/deposit', { amount: 20000, method: 'bank_transfer', details: { sender: 'Ada Test' } }, p.token);
  await api(`/admin/payments/${d.paymentId}/approve`, {}, ADMIN);
  await db.query('UPDATE users SET playthrough_left=0 WHERE id=$1', [p.user.id]);   // deposit played through (test/playthrough.test.js)
  assert.equal((await api('/wallet/withdraw', { amount: 3000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '123' } }, p.token)).error, 'bank_details');
  assert.equal((await api('/wallet/withdraw', { amount: 3000, method: 'mobile_money', details: {} }, p.token)).error, 'method_closed', 'no MoMo payouts in Nigeria');
  const w1 = await api('/wallet/withdraw', { amount: 3000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Ada Test' } }, p.token);
  assert.equal(w1.status, 'pending'); assert.equal(await bal(p.token), 17000);
  const w2 = await api('/wallet/withdraw', { amount: 2000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Ada Test' } }, p.token);
  const q = await api('/admin/payments?status=pending&kind=withdrawal', null, ADMIN);
  assert.ok(q.payments.some(x => x.id === w1.paymentId && x.details.acct === '0123456789'));
  await api(`/admin/payments/${w1.paymentId}/approve`, { reference: 'NIP-778899' }, ADMIN);
  assert.equal((await payment(w1.paymentId)).details.payoutRef, 'NIP-778899');
  await api(`/admin/payments/${w2.paymentId}/reject`, { reason: 'Account name does not match' }, ADMIN);
  assert.equal(await bal(p.token), 17000, 'the rejected withdrawal came back');
  await ledgerOk(p.user.id);
});

test('ID checks: rejected with a reason (player sees it), resubmitted, approved', { skip }, async () => {
  const p = await player('NG');
  await api('/auth/verify', { fullName: 'Ada Test', dob: '1990-01-01', idType: 'NIN', idNumber: '12345678901', front: ID_PHOTO, back: ID_PHOTO }, p.token);
  assert.ok((await api('/admin/kyc', null, ADMIN)).users.some(u => u.id === p.user.id));
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: false }, ADMIN)).error, 'invalid', 'a rejection needs a reason');
  await api(`/admin/users/${p.user.id}/kyc`, { approve: false, reason: 'Photo unreadable' }, ADMIN);
  let me = (await api('/auth/me', null, p.token));
  me = me.user || me;
  assert.equal(me.verified, false); assert.equal(me.limits.kyc.status, 'rejected'); assert.equal(me.limits.kyc.reason, 'Photo unreadable');
  await api('/auth/verify', { fullName: 'Ada Test', dob: '1990-01-01', idType: 'NIN', idNumber: '12345678901', front: ID_PHOTO, back: ID_PHOTO }, p.token);
  await api(`/admin/users/${p.user.id}/kyc`, { approve: true }, ADMIN);
  me = (await api('/auth/me', null, p.token)); me = me.user || me;
  assert.equal(me.verified, true);
  const detail = await api(`/admin/users/${p.user.id}`, null, ADMIN);
  assert.equal(detail.user.limits.kyc.status, 'verified');
});

test('Ghana: Mobile Money through the payment API – approve on the phone, webhook credits once', { skip }, async () => {
  const p = await player('GH');
  const o = await api('/wallet/options', null, p.token);
  assert.equal(o.deposit[0].method, 'mobile_money'); assert.equal(o.deposit[0].mode, 'api');
  assert.equal((await api('/wallet/deposit', { amount: 50, method: 'mobile_money', details: { phone: p.phone } }, p.token)).error, 'momo_details', 'network needed');
  const d = await api('/wallet/deposit', { amount: 50, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  assert.equal(d.status, 'pending'); assert.ok(d.next.poll, 'approve the prompt on the phone');
  const ref = (await payment(d.paymentId)).provider_ref;
  // a forged webhook is refused
  const forged = await fetch(API + '/payments/paystack/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': 'bad' }, body: JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: 5000, currency: 'GHS' } }) });
  assert.equal(forged.status, 401);
  assert.equal(await bal(p.token), 0);
  await fetch(`${MOCK}/__approve/${ref}`, { method: 'POST' }); await sleep(400);
  assert.equal(await bal(p.token), 50);
  await fetch(`${MOCK}/__replay`, { method: 'POST', body: JSON.stringify({ event: 'charge.success', data: { reference: ref, amount: 5000, currency: 'GHS' } }) }); await sleep(300);
  assert.equal(await bal(p.token), 50, 'a repeated webhook never credits twice');
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, {}, ADMIN)).status, 409, 'admins cannot credit API payments by hand');
  await ledgerOk(p.user.id);
});

test('Ghana: Telecel code step, a late webhook (our own check credits), a declined charge', { skip }, async () => {
  const p = await player('GH');
  const t = await api('/wallet/deposit', { amount: 20, method: 'mobile_money', details: { phone: p.phone, network: 'telecel' } }, p.token);
  assert.ok(t.next.otp, 'Telecel asks for the code');
  assert.equal((await api(`/wallet/deposit/${t.paymentId}/otp`, { otp: '000000' }, p.token)).error, 'bad_code');
  const ok = await api(`/wallet/deposit/${t.paymentId}/otp`, { otp: '123456' }, p.token);
  assert.equal(ok.status, 'success'); assert.equal(await bal(p.token), 20);
  // approved but no webhook: polling the payment asks Paystack and credits it
  const d = await api('/wallet/deposit', { amount: 30, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await fetch(`${MOCK}/__approve_silent/${(await payment(d.paymentId)).provider_ref}`, { method: 'POST' });
  const st = await api(`/wallet/payments/${d.paymentId}`, null, p.token);
  assert.equal(st.payment.status, 'success'); assert.equal(st.balance, 50);
  // declined at once (the mock declines numbers ending 0000)
  const dphone = '24' + rnd().slice(0, 3) + '0000';   // a fresh number each run (the mock declines numbers ending 0000)
  const g = await player('GH', { phone: dphone });
  const f = await api('/wallet/deposit', { amount: 20, method: 'mobile_money', details: { phone: dphone, network: 'mtn' } }, g.token);
  assert.equal(f.status, 'failed'); assert.equal((await payment(f.paymentId)).status, 'failed');
});

test('Ghana: payout through the API – paid by webhook, or refunded when it fails', { skip }, async () => {
  const p = await player('GH');
  const d = await api('/wallet/deposit', { amount: 200, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await fetch(`${MOCK}/__approve/${(await payment(d.paymentId)).provider_ref}`, { method: 'POST' }); await sleep(400);
  await db.query('UPDATE users SET playthrough_left=0 WHERE id=$1', [p.user.id]);   // deposit played through (test/playthrough.test.js)
  const w = await api('/wallet/withdraw', { amount: 50, method: 'mobile_money', details: { phone: p.phone, network: 'mtn', name: 'Ada Test' } }, p.token);
  assert.equal(w.status, 'pending');
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, { reviewed: true }, ADMIN)).ok, true);
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, { reviewed: true }, ADMIN)).error, 'already_sent', 'cannot be sent twice');
  await sleep(900);
  assert.equal((await payment(w.paymentId)).status, 'success');
  await fetch(`${MOCK}/__state`, { method: 'POST', body: JSON.stringify({ failTransfers: true }) });
  const w2 = await api('/wallet/withdraw', { amount: 40, method: 'mobile_money', details: { phone: p.phone, network: 'mtn', name: 'Ada Test' } }, p.token);
  await api(`/admin/payments/${w2.paymentId}/payout`, { reviewed: true }, ADMIN); await sleep(900);
  await fetch(`${MOCK}/__state`, { method: 'POST', body: JSON.stringify({ failTransfers: false }) });
  assert.equal((await payment(w2.paymentId)).status, 'failed');
  assert.equal(await bal(p.token), 150, 'the failed payout went back to the balance');
  await ledgerOk(p.user.id);
  const s = await api('/admin/payment-settings', null, ADMIN);
  assert.equal(s.api.enabled, true); assert.equal(s.api.test, true); assert.equal(s.api.balance[0].currency, 'GHS');
});

test('admin pages are admin-only', { skip }, async () => {
  const p = await player('NG');
  for (const path of ['/admin/payments', '/admin/kyc', '/admin/payment-settings', '/admin/log', '/admin/overview']) assert.equal((await api(path, null, p.token)).status, 403, path);
  const ov = await api('/admin/overview', null, ADMIN);
  assert.ok('pending_deposits' in ov && 'pending_kyc' in ov && 'pending_withdrawals' in ov);
});
