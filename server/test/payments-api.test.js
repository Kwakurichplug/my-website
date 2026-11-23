// Integration: real-money payments with no demo shortcuts – Nigeria manual bank deposits confirmed by an admin,
// withdrawals paid or refunded, ID checks, and Ghana Mobile Money through the payment API (mock Paystack).
// Needs a server WITHOUT PAYMENTS_MODE=demo, on a TEST database, pointed at tools/qa/mock_paystack.js:
//   node tools/qa/mock_paystack.js 9098 http://127.0.0.1:8096 &
//   PORT=8096 PAYSTACK_BASE=http://127.0.0.1:9098 PAYSTACK_SECRET_KEY=sk_test_mock DATABASE_URL=… node src/index.js
//   PAY_API_URL=http://127.0.0.1:8096 MOCK_PAYSTACK=http://127.0.0.1:9098 DATABASE_URL=… node --test test/payments-api.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

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
  await api('/auth/verify', { fullName: 'Ada Test', dob: '1990-01-01', idType: 'NIN', idNumber: '12345678901' }, p.token);
  assert.ok((await api('/admin/kyc', null, ADMIN)).users.some(u => u.id === p.user.id));
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: false }, ADMIN)).error, 'invalid', 'a rejection needs a reason');
  await api(`/admin/users/${p.user.id}/kyc`, { approve: false, reason: 'Photo unreadable' }, ADMIN);
  let me = (await api('/auth/me', null, p.token));
  me = me.user || me;
  assert.equal(me.verified, false); assert.equal(me.limits.kyc.status, 'rejected'); assert.equal(me.limits.kyc.reason, 'Photo unreadable');
  await api('/auth/verify', { fullName: 'Ada Test', dob: '1990-01-01', idType: 'NIN', idNumber: '12345678901' }, p.token);
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
  const g = await player('GH', { phone: '241230000' });
  const f = await api('/wallet/deposit', { amount: 20, method: 'mobile_money', details: { phone: '241230000', network: 'mtn' } }, g.token);
  assert.equal(f.status, 'failed'); assert.equal((await payment(f.paymentId)).status, 'failed');
});

test('Ghana: payout through the API – paid by webhook, or refunded when it fails', { skip }, async () => {
  const p = await player('GH');
  const d = await api('/wallet/deposit', { amount: 200, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await fetch(`${MOCK}/__approve/${(await payment(d.paymentId)).provider_ref}`, { method: 'POST' }); await sleep(400);
  const w = await api('/wallet/withdraw', { amount: 50, method: 'mobile_money', details: { phone: p.phone, network: 'mtn', name: 'Ada Test' } }, p.token);
  assert.equal(w.status, 'pending');
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, {}, ADMIN)).ok, true);
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, {}, ADMIN)).error, 'already_sent', 'cannot be sent twice');
  await sleep(900);
  assert.equal((await payment(w.paymentId)).status, 'success');
  await fetch(`${MOCK}/__state`, { method: 'POST', body: JSON.stringify({ failTransfers: true }) });
  const w2 = await api('/wallet/withdraw', { amount: 40, method: 'mobile_money', details: { phone: p.phone, network: 'mtn', name: 'Ada Test' } }, p.token);
  await api(`/admin/payments/${w2.paymentId}/payout`, {}, ADMIN); await sleep(900);
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
