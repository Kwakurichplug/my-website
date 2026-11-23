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
const OPEN = { suspended: false, requireDeposits: false, message: '' };
before(async () => {
  if (skip) return;
  ADMIN = (await player('NG', { admin: true })).token;
  await api('/admin/settings/withdrawals', { value: OPEN }, ADMIN, 'PUT');   // the payment tests below need withdrawals open
});
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

test('Nigeria: bank deposit waits for an admin, who credits what arrived', { skip }, async () => {
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
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, { amount: 4500, reference: 'TRF-001-' + Date.now() }, ADMIN)).ok, true);
  assert.equal(await bal(p.token), 4500);
  const pay = await payment(d.paymentId);
  assert.equal(pay.status, 'success'); assert.equal(Number(pay.amount), 4500); assert.equal(pay.details.claimed, 5000);
  const bonus = await api('/wallet/bonuses', null, p.token);
  assert.ok(bonus.bonuses.length === 0 && bonus.ladder.steps[0].status === 'locked', 'no deposit bonus before the ID check');
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, { reference: 'TRF-002-' + Date.now() }, ADMIN)).status, 409, 'cannot be credited twice');
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
  await api(`/admin/payments/${d.paymentId}/approve`, { reference: 'TRF-003-' + Date.now() }, ADMIN);
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
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, { reference: 'TRF-004-' + Date.now() }, ADMIN)).status, 409, 'admins cannot credit API payments by hand');
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

test('support: an admin adds a deposit from the player’s profile – credited now or left pending; a transfer reference is credited once', { skip }, async () => {
  const p = await player('NG', { name: 'Ngozi Support' });
  // credited now: a real deposit (ledger "deposit", welcome bonus on the first one), marked as added by support
  let r = await api(`/admin/users/${p.user.id}/deposits`, { amount: 7500, sender: 'NGOZI A.', reference: 'NIP-7788', note: 'Messaged support on WhatsApp', credit: true }, ADMIN);
  assert.equal(r.status, 'success'); assert.ok(r.paymentId);
  assert.equal(await bal(p.token), 7500);
  const row = await payment(r.paymentId);
  assert.equal(row.status, 'success'); assert.equal(row.provider, 'manual'); assert.equal(row.details.source, 'support'); assert.equal(row.details.transferRef, 'NIP-7788');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [p.user.id])).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM bonuses WHERE user_id=$1`, [p.user.id])).rows[0].n, 0, 'no bonus before the ID check (Deposit 1 · 2 · 3)');
  // the same transfer (any letter case) cannot be credited again – also not on another player
  r = await api(`/admin/users/${p.user.id}/deposits`, { amount: 7500, reference: 'nip-7788', credit: true }, ADMIN);
  assert.equal(r.status, 409); assert.equal(r.error, 'duplicate_reference');
  const q2 = await player('NG');
  assert.equal((await api(`/admin/users/${q2.user.id}/deposits`, { amount: 100, reference: 'NIP-7788', credit: false }, ADMIN)).error, 'duplicate_reference');
  assert.equal(await bal(p.token), 7500, 'nothing credited twice');
  // left pending: shows in the queue like the player's own request; confirming it with a reference blocks that reference too
  r = await api(`/admin/users/${p.user.id}/deposits`, { amount: 2000, sender: 'NGOZI A.', credit: false }, ADMIN);
  assert.equal(r.status, 'pending'); assert.equal(await bal(p.token), 7500);
  const queue = (await api('/admin/payments?status=pending&kind=deposit', null, ADMIN)).payments;
  assert.ok(queue.some(x => x.id === r.paymentId && x.details.source === 'support'));
  assert.equal((await api(`/admin/payments/${r.paymentId}/approve`, { reference: 'NIP-9900' }, ADMIN)).ok, true);
  assert.equal(await bal(p.token), 9500);
  assert.equal((await api(`/admin/users/${p.user.id}/deposits`, { amount: 2000, reference: 'NIP-9900', credit: true }, ADMIN)).error, 'duplicate_reference');
  // a rejected deposit frees its reference again
  r = await api(`/admin/users/${p.user.id}/deposits`, { amount: 500, reference: 'NIP-1111', credit: false }, ADMIN);
  await api(`/admin/payments/${r.paymentId}/reject`, { reason: 'No transfer received' }, ADMIN);
  assert.equal((await api(`/admin/users/${p.user.id}/deposits`, { amount: 500, reference: 'NIP-1111', credit: true }, ADMIN)).status, 'success');
  assert.equal(await bal(p.token), 10000);
  // admin-only, validated
  assert.equal((await api(`/admin/users/${p.user.id}/deposits`, { amount: 100, credit: true }, p.token)).status, 403);
  assert.equal((await api(`/admin/users/${p.user.id}/deposits`, { amount: 0, credit: true }, ADMIN)).status, 400);
  assert.equal((await api('/admin/users/00000000-0000-0000-0000-000000000000/deposits', { amount: 100, credit: true, reference: 'NIP-NOBODY' }, ADMIN)).status, 404);
});

test('pop-ups: support asks a player to deposit (Nigeria bank, Ghana MoMo); payment outcomes reach the player once', { skip }, async () => {
  const ng = await player('NG', { name: 'Ada Popup' }), gh = await player('GH', { name: 'Kofi Popup' });
  const open = async t => (await api('/auth/notices', null, t)).notices;
  // a request: the player sees it with the amount and support's message; a newer one replaces it
  let r = await api(`/admin/users/${ng.user.id}/deposit-request`, { amount: 5000, note: 'Please use the account below' }, ADMIN);
  assert.equal(r.notice.kind, 'deposit_request');
  await api(`/admin/users/${ng.user.id}/deposit-request`, { amount: 6000, note: 'Updated amount' }, ADMIN);
  let n = await open(ng.token);
  assert.equal(n.length, 1); assert.equal(n[0].kind, 'deposit_request'); assert.equal(Number(n[0].data.amount), 6000); assert.equal(n[0].data.note, 'Updated amount');
  assert.equal((await api('/admin/users/' + ng.user.id, null, ADMIN)).requests.length, 1, 'the profile shows the open request');
  // the player makes the deposit → the request closes
  const dep = await api('/wallet/deposit', { amount: 6000, method: 'bank_transfer', details: { sender: 'ADA POPUP' } }, ng.token);
  assert.equal(dep.status, 'pending');
  assert.equal((await open(ng.token)).length, 0, 'request closed once they deposit');
  // confirmed → "deposit confirmed" pop-up, once
  await api(`/admin/payments/${dep.paymentId}/approve`, { reference: 'TRF-005-' + Date.now() }, ADMIN);
  n = await open(ng.token);
  assert.equal(n.length, 1); assert.equal(n[0].kind, 'deposit_credited'); assert.equal(Number(n[0].data.amount), 6000);
  assert.equal((await api(`/auth/notices/${n[0].id}/close`, {}, gh.token)).ok, true);   // someone else's notice: nothing happens
  assert.equal((await open(ng.token)).length, 1);
  await api(`/auth/notices/${n[0].id}/close`, {}, ng.token);
  assert.equal((await open(ng.token)).length, 0, 'shown once');
  // rejected deposit → the reason; withdrawal paid → the reference
  const dep2 = await api('/wallet/deposit', { amount: 2000, method: 'bank_transfer', details: { sender: 'ADA POPUP' } }, ng.token);
  await api(`/admin/payments/${dep2.paymentId}/reject`, { reason: 'No transfer received' }, ADMIN);
  const w = await api('/wallet/withdraw', { amount: 1500, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Ada Popup' } }, ng.token);
  await api(`/admin/payments/${w.paymentId}/approve`, { reference: 'NIP-PAID-1' }, ADMIN);
  n = await open(ng.token);
  assert.deepEqual(n.map(x => x.kind), ['deposit_rejected', 'withdrawal_paid']);
  assert.equal(n[0].data.reason, 'No transfer received'); assert.equal(n[1].data.reference, 'NIP-PAID-1');
  // support credits a deposit → "your deposit was added" and any open request closes
  await api(`/admin/users/${ng.user.id}/deposit-request`, {}, ADMIN);
  await api(`/admin/users/${ng.user.id}/deposits`, { amount: 700, credit: true, reference: 'NIP-POPUP-' + Date.now() }, ADMIN);
  n = await open(ng.token);
  assert.ok(n.some(x => x.kind === 'deposit_credited' && x.data.support) && !n.some(x => x.kind === 'deposit_request'));
  // Ghana: a request without an amount; the admin can cancel it
  await api(`/admin/users/${gh.user.id}/deposit-request`, {}, ADMIN);
  n = await open(gh.token);
  assert.equal(n.length, 1); assert.equal(n[0].data.amount, null);
  await api(`/admin/notices/${n[0].id}/cancel`, {}, ADMIN);
  assert.equal((await open(gh.token)).length, 0);
  // admin-only, validated
  assert.equal((await api(`/admin/users/${gh.user.id}/deposit-request`, {}, gh.token)).status, 403);
  assert.equal((await api(`/admin/users/${gh.user.id}/deposit-request`, { amount: -1 }, ADMIN)).status, 400);
  assert.equal((await api('/auth/notices', null)).status, 401);
});

test('no leaks: a deposit is credited only with its transfer reference; the player’s screenshot reaches the admin', { skip }, async () => {
  const p = await player('NG', { name: 'Proof Player' }), other = await player('NG');
  const d = await api('/wallet/deposit', { amount: 3000, method: 'bank_transfer', details: { sender: 'PROOF PLAYER' } }, p.token);
  // no reference → refused, nothing credited
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, {}, ADMIN)).error, 'reference_required');
  assert.equal((await api(`/admin/users/${p.user.id}/deposits`, { amount: 3000, credit: true }, ADMIN)).error, 'reference_required');
  assert.equal(await bal(p.token), 0);
  // screenshot: a real JPEG (the bytes must match the type), only the owner, only while being checked
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 7), Buffer.from([0xff, 0xd9])]);
  const img = 'data:image/jpeg;base64,' + jpeg.toString('base64');
  assert.equal((await api(`/wallet/payments/${d.paymentId}/proof`, { image: 'data:image/png;base64,' + jpeg.toString('base64') }, p.token)).error, 'bad_image', 'a JPEG sent as PNG is refused');
  assert.equal((await api(`/wallet/payments/${d.paymentId}/proof`, { image: 'data:text/html;base64,PGh0bWw+' }, p.token)).error, 'bad_image');
  assert.equal((await api(`/wallet/payments/${d.paymentId}/proof`, { image: img }, other.token)).error, 'not_found', 'not someone else’s deposit');
  assert.equal((await api(`/wallet/payments/${d.paymentId}/proof`, { image: img }, p.token)).ok, true);
  assert.equal((await api('/wallet/payments', null, p.token)).payments.find(x => x.id === d.paymentId).proof, true);
  const q = (await api('/admin/payments?status=pending&kind=deposit', null, ADMIN)).payments.find(x => x.id === d.paymentId);
  assert.equal(q.has_proof, true, 'the queue shows there is a screenshot');
  let res = await fetch(`${API}/admin/payments/${d.paymentId}/proof`, { headers: { authorization: 'Bearer ' + ADMIN } });
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'image/jpeg'); assert.ok(Buffer.from(await res.arrayBuffer()).equals(jpeg), 'the admin gets the same picture');
  res = await fetch(`${API}/admin/payments/${d.paymentId}/proof`, { headers: { authorization: 'Bearer ' + p.token } });
  assert.equal(res.status, 403, 'players cannot open the admin view');
  // credited with its reference; the screenshot can no longer be changed
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, { reference: 'NIP-PROOF-1' }, ADMIN)).ok, true);
  assert.equal(await bal(p.token), 3000);
  assert.equal((await api(`/wallet/payments/${d.paymentId}/proof`, { image: img }, p.token)).error, 'not_found');
  // the same transfer can't be used again – not on a support deposit for another player either
  assert.equal((await api(`/admin/users/${other.user.id}/deposits`, { amount: 3000, reference: 'nip-proof-1', credit: true }, ADMIN)).error, 'duplicate_reference');
});

test('ID approved → the player’s Deposit 1 · 2 · 3 bonuses open, with a pop-up listing them', { skip }, async () => {
  const p = await player('NG', { name: 'Ladder Player' });
  let o = await api('/wallet/options', null, p.token);
  assert.equal(o.ladder.unlocked, false);
  await api('/auth/verify', { fullName: 'Ladder Player', dob: '1990-01-01', idType: 'NIN', idNumber: '98765432101' }, p.token);
  await api(`/admin/users/${p.user.id}/kyc`, { approve: true }, ADMIN);
  const n = (await api('/auth/notices', null, p.token)).notices;
  assert.ok(n.some(x => x.kind === 'kyc_approved'), 'pop-up for the player');
  o = await api('/wallet/options', null, p.token);
  assert.equal(o.ladder.unlocked, true); assert.equal(o.ladder.next, 1); assert.equal(o.ladder.steps.length, 3);
  // deposit 1 after the ID check earns the first bonus when the admin confirms it
  const d = await api('/wallet/deposit', { amount: 2000, method: 'bank_transfer', details: { sender: 'LADDER PLAYER' } }, p.token);
  await api(`/admin/payments/${d.paymentId}/approve`, { reference: 'NIP-LADDER-' + Date.now() }, ADMIN);
  o = await api('/wallet/options', null, p.token);
  assert.equal(o.ladder.steps[0].status, 'active'); assert.equal(o.ladder.steps[0].bonus, 4000, '200% of ₦2,000'); assert.equal(o.ladder.next, 2);
  assert.equal(await bal(p.token), 2000, 'the bonus is locked, not withdrawable');
  // the profile shows it; settings are validated
  assert.equal((await api('/admin/users/' + p.user.id, null, ADMIN)).ladder.steps[0].bonus, 4000);
  assert.equal((await api('/admin/settings/deposit_bonuses', { value: { enabled: true, requireId: true, NG: [{ pct: 9999, max: 1 }], GH: [], times: 0, min_odds: 1, days: 0 } }, ADMIN, 'PUT')).status, 400);
});

test('Deposit 1·2·3 tracker: every step marked (✓ amount, being checked, next, left); players with deposits left are easy to find', { skip }, async () => {
  const tag = 'Trk' + Math.random().toString(36).slice(2, 7);
  const mk = async name => { const p = await player('NG', { name }); await db.query('UPDATE users SET verified=true WHERE id=$1', [p.user.id]); return p; };
  const p0 = await mk(tag + ' None'), p1 = await mk(tag + ' One'), p2 = await mk(tag + ' Two'), pc = await mk(tag + ' Checking'), un = await player('NG', { name: tag + ' Unverified' });
  const credit = (p, amount) => api(`/admin/users/${p.user.id}/deposits`, { amount, credit: true, reference: `TRK-${p.user.uid}-${amount}-${Date.now()}` }, ADMIN);
  await credit(p1, 1000); await credit(p2, 1000); await credit(p2, 3000);
  await api('/wallet/deposit', { amount: 2500, method: 'bank_transfer', details: { sender: 'TRACKER CHECKING' } }, pc.token);
  // the player: Deposit 1 marked done with its amount and date; the next step; being checked
  let o = await api('/wallet/options', null, p1.token);
  assert.equal(o.ladder.done, 1); assert.equal(o.ladder.left, 2); assert.equal(o.ladder.next, 2);
  assert.equal(o.ladder.steps[0].done, true); assert.equal(o.ladder.steps[0].deposit, 1000); assert.ok(o.ladder.steps[0].depositAt);
  o = await api('/wallet/options', null, pc.token);
  assert.equal(o.ladder.steps[0].status, 'checking'); assert.equal(o.ladder.steps[0].deposit, 2500); assert.equal(o.ladder.next, 1);
  // the admin's tracker
  const t = await api('/admin/ladder?q=' + tag, null, ADMIN);
  const row = name => t.players.find(x => x.full_name === name);
  assert.ok(!row(tag + ' Unverified'), 'only players whose ID is approved');
  assert.equal(row(tag + ' None').done, 0); assert.equal(row(tag + ' None').next, 1); assert.equal(row(tag + ' None').left, 3);
  assert.deepEqual(row(tag + ' Two').steps.map(s => s.done), [true, true, false]); assert.equal(row(tag + ' Two').steps[1].deposit, 3000);
  assert.equal(row(tag + ' Two').steps[2].status, 'next');
  assert.equal(row(tag + ' Checking').checking, true);
  assert.equal(t.counts.s0, 2, 'not started: one has nothing yet, one is being checked'); assert.equal(t.counts.s1, 1); assert.equal(t.counts.s2, 1); assert.equal(t.counts.checking, 1); assert.equal(t.counts.left, 4);
  assert.equal((await api('/admin/ladder', null, p1.token)).status, 403, 'admins only');
  // the third deposit completes the ladder
  await credit(p2, 4000);
  assert.equal((await api('/admin/ladder?q=' + encodeURIComponent(tag + ' Two'), null, ADMIN)).players[0].left, 0);
  assert.equal((await api('/wallet/options', null, p2.token)).ladder.next, null, 'no next step: the sticky bar goes away');
  assert.ok(un);
});

test('withdrawals: suspended for everyone; then open only after Deposit 1·2·3 (sending to a friend too); a 0% step still counts', { skip }, async () => {
  const set = v => api('/admin/settings/withdrawals', { value: v }, ADMIN, 'PUT');
  const L0 = (await api('/admin/settings', null, ADMIN)).deposit_bonuses;
  const p = await player('NG', { name: 'Gate Player' }), friend = await player('NG');
  const credit = amount => api(`/admin/users/${p.user.id}/deposits`, { amount, credit: true, reference: `GATE-${p.user.uid}-${amount}-${Date.now()}` }, ADMIN);
  const wd = () => api('/wallet/withdraw', { amount: 1000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Gate Player' } }, p.token);
  const tf = () => api('/wallet/transfer', { phone: friend.phone, amount: 500 }, p.token);
  await credit(5000);                                                       // before the ID check: not a ladder step
  // 1) suspended for everyone (withdraw and send to a friend); the admin's message reaches the player
  assert.equal((await set({ suspended: true, requireDeposits: true, message: 'Back on Monday' })).ok, true);
  let r = await wd(); assert.equal(r.status, 403); assert.equal(r.error, 'withdrawals_suspended'); assert.equal(r.message, 'Back on Monday');
  assert.equal((await tf()).error, 'withdrawals_suspended');
  assert.equal((await api('/wallet/options', null, p.token)).withdrawBlock.error, 'withdrawals_suspended');
  assert.equal(await bal(p.token), 5000, 'nothing left the balance');
  assert.equal((await set({ suspended: 'yes' })).status, 400, 'the switch is validated');
  // 2) open, but only after Deposit 1, 2, 3 – Deposit 3 set to 0%: it still counts
  await set({ suspended: false, requireDeposits: true, message: '' });
  await api('/admin/settings/deposit_bonuses', { value: { ...L0, NG: [{ pct: 200, max: 100000 }, { pct: 100, max: 50000 }, { pct: 0, max: 0 }] } }, ADMIN, 'PUT');
  r = await wd(); assert.equal(r.error, 'deposits_first'); assert.equal(r.unlocked, false, 'ID not approved yet');
  await db.query('UPDATE users SET verified=true WHERE id=$1', [p.user.id]);
  r = await wd(); assert.equal(r.error, 'deposits_first'); assert.equal(r.left, 3); assert.equal(r.next, 1);
  assert.equal((await tf()).error, 'deposits_first', 'no way round it by sending money to a friend');
  await credit(1000); await credit(2000);
  r = await wd(); assert.equal(r.left, 1); assert.equal(r.next, 3);
  await credit(3000);                                                       // Deposit 3: 0% bonus, still a step
  const o = await api('/wallet/options', null, p.token);
  assert.equal(o.ladder.left, 0); assert.equal(o.withdrawBlock, null); assert.equal(o.ladder.steps[2].done, true); assert.equal(o.ladder.steps[2].bonus, null);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM deposit_steps WHERE user_id=$1', [p.user.id])).rows[0].n, 3);
  assert.deepEqual((await db.query(`SELECT kind FROM bonuses WHERE user_id=$1 ORDER BY kind`, [p.user.id])).rows.map(x => x.kind), ['deposit1', 'deposit2']);
  r = await wd(); assert.equal(r.status, 'pending', 'all three done → the withdrawal is accepted');
  assert.equal((await tf()).ok, true, 'and sending to a friend');
  assert.equal(await bal(p.token), 5000 + 1000 + 2000 + 3000 - 1000 - 500);
  // a 4th deposit is not a step
  await credit(4000);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM deposit_steps WHERE user_id=$1', [p.user.id])).rows[0].n, 3);
  await api('/admin/settings/deposit_bonuses', { value: L0 }, ADMIN, 'PUT');
  await set(OPEN);
});

test('withdrawals: a new member can withdraw before the first deposit (told on the deposit page); from the first deposit, only after Deposit 1·2·3', { skip }, async () => {
  const set = v => api('/admin/settings/withdrawals', { value: v }, ADMIN, 'PUT');
  await set({ suspended: false, requireDeposits: true, newMembersOpen: true, message: '' });
  const p = await player('NG', { name: 'New Member' }), friend = await player('NG');
  const wd = amount => api('/wallet/withdraw', { amount, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'New Member' } }, p.token);
  const tf = amount => api('/wallet/transfer', { phone: friend.phone, amount }, p.token);
  // money that did not come from a deposit of theirs (support credited it)
  assert.ok((await api(`/admin/users/${p.user.id}/adjust`, { amount: 3000, reason: 'Goodwill credit' }, ADMIN)).balance >= 3000);
  let o = await api('/wallet/options', null, p.token);
  assert.equal(o.withdrawBlock, null, 'no deposit yet → withdrawals open');
  assert.equal(o.withdrawRuleAhead, true, 'the deposit page tells them the rule starts with their first deposit');
  let r = await wd(1000); assert.equal(r.status, 'pending', 'a new member’s withdrawal is accepted');
  assert.equal((await tf(500)).ok, true, 'and sending to a friend');
  // a deposit still waiting for the admin does not start the rule
  const pend = await api(`/admin/users/${p.user.id}/deposits`, { amount: 2000, credit: false }, ADMIN);
  assert.equal(pend.status, 'pending');
  assert.equal((await api('/wallet/options', null, p.token)).withdrawBlock, null, 'pending deposit → still open');
  // the first credited deposit starts it: withdrawals (and sending) wait for Deposit 1, 2, 3
  await api(`/admin/users/${p.user.id}/deposits`, { amount: 5000, credit: true, reference: `NEW-${p.user.uid}-${Date.now()}` }, ADMIN);
  o = await api('/wallet/options', null, p.token);
  assert.equal(o.withdrawBlock && o.withdrawBlock.error, 'deposits_first'); assert.equal(o.withdrawRuleAhead, false, 'no longer “ahead”');
  r = await wd(500); assert.equal(r.status, 403); assert.equal(r.error, 'deposits_first');
  assert.equal((await tf(100)).error, 'deposits_first');
  assert.equal(await bal(p.token), 3000 - 1000 - 500 + 5000, 'nothing left the balance after the rule started');
  // with the switch off, a new member waits for Deposit 1, 2, 3 too
  const n2 = await player('NG');
  await set({ suspended: false, requireDeposits: true, newMembersOpen: false, message: '' });
  o = await api('/wallet/options', null, n2.token);
  assert.equal(o.withdrawBlock && o.withdrawBlock.error, 'deposits_first'); assert.equal(o.withdrawRuleAhead, false);
  // the emergency switch beats everything, new members included
  await set({ suspended: true, requireDeposits: true, newMembersOpen: true, message: '' });
  assert.equal((await api('/wallet/options', null, n2.token)).withdrawBlock.error, 'withdrawals_suspended');
  assert.equal((await api('/wallet/options', null, n2.token)).withdrawRuleAhead, false);
  // validated
  assert.equal((await set({ suspended: false, requireDeposits: true, newMembersOpen: 'yes' })).status, 400);
  await set(OPEN);
  await ledgerOk(p.user.id);
});

test('no leaks: a first deposit credited while a new member’s withdrawal (or transfer) is being made can’t be taken straight out', { skip }, async () => {
  await api('/admin/settings/withdrawals', { value: { suspended: false, requireDeposits: true, newMembersOpen: true, message: '' } }, ADMIN, 'PUT');
  const friend = await player('NG');
  const tries = [
    ['withdraw', tok => api('/wallet/withdraw', { amount: 8000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Race Player' } }, tok)],
    ['transfer', tok => api('/wallet/transfer', { phone: friend.phone, amount: 8000 }, tok)],
  ];
  for (const [what, take] of tries) {
    const p = await player('NG', { name: 'Race Player' });
    await api(`/admin/users/${p.user.id}/adjust`, { amount: 3000, reason: 'Goodwill credit' }, ADMIN);
    // their first deposit is being credited right now: that transaction holds the balance row and has not committed
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const { rows: [pay] } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, provider, status, details) VALUES ($1,'deposit',5000,'bank_transfer','manual','success','{}') RETURNING id`, [p.user.id]);
      const { rows: [u] } = await c.query('UPDATE users SET balance = balance + 5000 WHERE id=$1 RETURNING balance', [p.user.id]);
      await c.query(`INSERT INTO transactions (user_id, type, amount, balance_after, ref) VALUES ($1,'deposit',5000,$2,$3)`, [p.user.id, u.balance, pay.id]);
      // at that moment the player asks to take out everything, the deposit included
      const req = take(p.token);
      let waiting = 0;
      for (let i = 0; i < 60 && !waiting; i++) { await sleep(100); waiting = (await db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=current_database()`)).rows[0].n; }
      assert.ok(waiting, `the ${what} waits for the balance row`);
      await c.query('COMMIT');
      const r = await req;
      assert.equal(r.status, 403, what); assert.equal(r.error, 'deposits_first', `${what}: the deposit started the 1·2·3 rule before any money left`);
    } finally { c.release(); }
    assert.equal(await bal(p.token), 8000, `${what}: nothing left the balance`);
    await ledgerOk(p.user.id);
  }
  assert.equal(await bal(friend.token), 0, 'the friend received nothing');
  await api('/admin/settings/withdrawals', { value: OPEN }, ADMIN, 'PUT');
});

test('no leaks: half-cent amounts are rounded once, so both sides of a transfer and a ticket match the ledger', { skip }, async () => {
  const a = await player('NG'), b = await player('NG');
  await api(`/admin/users/${a.user.id}/deposits`, { amount: 10000, credit: true, reference: 'RND-' + a.user.uid + '-' + Date.now() }, ADMIN);
  const before = await bal(a.token);
  assert.equal((await api('/wallet/transfer', { phone: b.phone, amount: 100.005 }, a.token)).ok, true);
  const sent = before - await bal(a.token), got = await bal(b.token);
  assert.equal(r2c(sent), r2c(got), 'the receiver gets exactly what the sender paid – no cent made up');
  const ev = (await api('/events?status=scheduled&sport=football&limit=50', null)).events.find(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended));
  if (ev) {
    const odd = ev.markets.find(m => m.key === '1x2').outcomes['1'].o;
    const placed = await api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd }], stakes: [1000.005], acceptChanges: true }, a.token);
    const t = placed.bets[0];
    const row = (await db.query('SELECT stake::float AS stake FROM bets WHERE id=$1', [t.id])).rows[0];
    const led = (await db.query(`SELECT amount::float AS amount FROM transactions WHERE ref=$1 AND type='bet'`, [t.id])).rows[0];
    assert.equal(row.stake, -led.amount, 'the ticket keeps exactly what the balance paid');
  }
});
const r2c = n => Math.round(n * 100) / 100;
