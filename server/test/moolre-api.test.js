// Integration: Ghana Mobile Money through Moolre with no demo shortcuts. Every deposit is credited automatically and
// only when Moolre's own status call says it was paid – never by a webhook alone, never twice, never by an admin.
// Needs a server on a TEST database pointed at tools/qa/mock_moolre.js:
//   node tools/qa/mock_moolre.js 9099 http://127.0.0.1:8097 &
//   PORT=8097 MOOLRE_BASE=http://127.0.0.1:9099 MOOLRE_USER=letbet MOOLRE_PUBLIC_KEY=pub_mock MOOLRE_PRIVATE_KEY=priv_mock \
//     MOOLRE_ACCOUNT_NUMBER=10000000001 MOOLRE_WEBHOOK_SECRET=whsec_mock PAYMENTS_SWEEP_MS=1500 PAYMENTS_SWEEP_AGE_SEC=2 \
//     SITE_URL=http://127.0.0.1:8097 DATABASE_URL=… node src/index.js
//   MOOLRE_API_URL=http://127.0.0.1:8097 MOCK_MOOLRE=http://127.0.0.1:9099 DATABASE_URL=… node --test test/moolre-api.test.js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.MOOLRE_API_URL, MOCK = process.env.MOCK_MOOLRE || 'http://127.0.0.1:9099';
const skip = !BASE && 'set MOOLRE_API_URL (a server using the Moolre mock) to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}
const mock = async (path, body) => (await fetch(MOCK + path, { method: /^\/__(charges|transfers)\//.test(path) ? 'GET' : 'POST', body: body ? JSON.stringify(body) : undefined })).json();
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
async function player(opts = {}) {
  const phone = opts.phone || '24' + rnd().slice(0, 7);
  const o = await api('/auth/otp', { country: 'GH', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'GH', phone, code: o.devCode, password: 'Strong123', fullName: 'Kofi Test' });
  assert.ok(r.token, 'registered ' + JSON.stringify(r));
  if (opts.admin) await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [r.user.id]);
  return { token: r.token, user: r.user, phone };
}
const bal = async t => (await api('/wallet', null, t)).balance;
const payment = async id => (await db.query('SELECT * FROM payments WHERE id=$1', [id])).rows[0];
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(150); } return v; };
const ledgerOk = async uid => { const { rows } = await db.query(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [uid]); assert.equal(Math.round(rows[0].b * 100), Math.round(rows[0].s * 100), 'ledger = balance'); };
const deposits = async uid => (await db.query(`SELECT count(*)::int AS n, coalesce(sum(amount),0)::float AS s FROM transactions WHERE user_id=$1 AND type='deposit'`, [uid])).rows[0];

let ADMIN;
// This suite tests the Nov 22 rules. The 3-deposit withdrawal rule and the Deposit 1·2·3 bonuses (payments-api.test.js)
// are switched off while it runs – withdrawals open for every player, the welcome bonus on the first deposit – then restored.
const RULES = {};
async function nov22Rules(admin) {
  for (const k of ['withdrawals', 'deposit_bonuses']) RULES[k] = (await db.query('SELECT value FROM settings WHERE key=$1', [k])).rows[0]?.value;
  await api('/admin/settings/withdrawals', { value: { ...(RULES.withdrawals || {}), suspended: false, requireDeposits: false, newMembersOpen: true, message: '' } }, admin, 'PUT');
  if (RULES.deposit_bonuses) await api('/admin/settings/deposit_bonuses', { value: { ...RULES.deposit_bonuses, enabled: false } }, admin, 'PUT');
}
async function restoreRules(admin) {
  for (const [k, v] of Object.entries(RULES)) if (v) await api('/admin/settings/' + k, { value: v }, admin, 'PUT');
}
before(async () => { if (skip) return; ADMIN = (await player({ admin: true })).token; await nov22Rules(ADMIN); });
after(async () => { if (!skip) await restoreRules(ADMIN); await db.end(); });

test('deposit: prompt on the phone → Moolre confirms → credited once; webhooks alone never credit', { skip }, async () => {
  const p = await player();
  const o = await api('/wallet/options', null, p.token);
  assert.equal(o.deposit.length, 1); assert.equal(o.deposit[0].method, 'mobile_money'); assert.equal(o.deposit[0].mode, 'api');
  assert.equal(o.withdraw[0].api, true);
  assert.equal((await api('/wallet/deposit', { amount: 50, method: 'mobile_money', details: { phone: p.phone } }, p.token)).error, 'momo_details', 'network needed');
  assert.equal((await api('/wallet/deposit', { amount: 5, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token)).error, 'below_minimum');
  const d = await api('/wallet/deposit', { amount: 50, method: 'mobile_money', details: { phone: '0' + p.phone, network: 'mtn' } }, p.token);
  assert.equal(d.status, 'pending'); assert.ok(d.next.poll, 'approve the prompt on the phone');
  const row = await payment(d.paymentId);
  assert.equal(row.provider, 'moolre'); assert.match(row.provider_ref, /^LB[0-9a-f]{32}$/);
  const c = (await mock('/__charges/' + row.provider_ref)).data;
  assert.equal(c.amount, '50.00'); assert.equal(c.payer, '0' + p.phone); assert.equal(c.channel, 'MTN');

  const fake = { txstatus: 1, externalref: row.provider_ref, amount: '50.00' };
  assert.equal((await mock('/__replay', { event: 'payment.succeeded', data: fake, sign: 'bad' })).data.webhook, 401, 'bad signature refused');
  assert.equal((await mock('/__replay', { event: 'payment.succeeded', data: fake, sign: false })).data.webhook, 401, 'unsigned refused');
  assert.equal((await mock('/__replay', { event: 'payment.succeeded', data: fake, sign: 'old' })).data.webhook, 401, 'stale signature refused');
  assert.equal((await mock('/__replay', { event: 'payment.succeeded', data: fake, sign: true })).data.webhook, 200, 'a signed webhook is accepted…');
  await sleep(400);
  assert.equal(await bal(p.token), 0, '…but nothing is credited while Moolre still says pending');
  assert.equal((await payment(d.paymentId)).status, 'pending');
  assert.equal((await api(`/admin/payments/${d.paymentId}/approve`, {}, ADMIN)).status, 409, 'admins cannot credit API deposits by hand');
  assert.equal((await api(`/admin/payments/${d.paymentId}/reject`, { reason: 'x' }, ADMIN)).status, 409);

  assert.equal((await mock('/__approve/' + row.provider_ref)).data.webhook, 200);
  assert.equal(await until(async () => (await bal(p.token)) === 50), true, 'credited after Moolre confirmed');
  const done = await payment(d.paymentId);
  assert.equal(done.status, 'success'); assert.equal(Number(done.amount), 50); assert.equal(done.details.via, 'verify'); assert.ok(done.details.providerTx);
  for (const sign of [true, 'legacy']) await mock('/__replay', { event: 'payment.succeeded', data: { ...fake, amount: '500.00' }, sign });
  await api(`/wallet/payments/${d.paymentId}`, null, p.token);
  await sleep(300);
  assert.equal(await bal(p.token), 50, 'repeated webhooks and checks never credit twice');
  assert.deepEqual(await deposits(p.user.id), { n: 1, s: 50 });
  const bonus = await api('/wallet/bonuses', null, p.token);
  assert.ok(bonus.bonuses.length >= 1, 'first deposit carries the welcome bonus');
  await ledgerOk(p.user.id);
});

test('deposit: first-time number check by SMS code, wrong code, then the prompt; poll credits a silent payment', { skip }, async () => {
  const p = await player({ phone: '20' + rnd().slice(0, 7) });
  const d = await api('/wallet/deposit', { amount: 20, method: 'mobile_money', details: { phone: p.phone, network: 'telecel' } }, p.token);
  assert.equal(d.status, 'pending'); assert.ok(d.next.otp, 'Moolre asks for the SMS code first'); assert.match(d.next.message, /code/i);
  const wrong = await api(`/wallet/deposit/${d.paymentId}/otp`, { otp: '000000' }, p.token);
  assert.equal(wrong.status, 400); assert.equal(wrong.error, 'bad_code');
  const ok = await api(`/wallet/deposit/${d.paymentId}/otp`, { otp: '123456' }, p.token);
  assert.equal(ok.status, 'pending'); assert.ok(ok.next.poll, 'number verified → the prompt goes out');
  const ref = (await payment(d.paymentId)).provider_ref;
  assert.equal((await mock('/__charges/' + ref)).data.channel, 'TELECEL');
  await mock('/__approve_silent/' + ref);   // paid, but Moolre's webhook never arrives
  const st = await api(`/wallet/payments/${d.paymentId}`, null, p.token);
  assert.equal(st.payment.status, 'success', 'the player screen check asks Moolre and credits'); assert.equal(st.balance, 20);
  const again = await api('/wallet/deposit', { amount: 15, method: 'mobile_money', details: { phone: p.phone, network: 'telecel' } }, p.token);
  assert.ok(again.next.poll, 'a verified number goes straight to the prompt');
  assert.equal((await api(`/wallet/deposit/${again.paymentId}/otp`, { otp: '123456' }, (await player()).token)).status, 404, 'cannot touch another player’s payment');
  await ledgerOk(p.user.id);
});

test('deposit: declined on the phone, refused at once, missed webhook settled by the sweep', { skip }, async () => {
  const p = await player();
  const d = await api('/wallet/deposit', { amount: 30, method: 'mobile_money', details: { phone: p.phone, network: 'at' } }, p.token);
  const ref = (await payment(d.paymentId)).provider_ref;
  await mock('/__decline/' + ref);
  const failed = await until(async () => { const x = await payment(d.paymentId); return x.status === 'failed' && x; });
  assert.ok(failed, 'declined → failed'); assert.match(failed.details.reason, /Not enough money/); assert.match(failed.details.providerReason, /LOW_BALANCE/);
  assert.equal(await bal(p.token), 0);
  await mock('/__approve_silent/' + ref);
  await api(`/wallet/payments/${d.paymentId}`, null, p.token);
  assert.equal(await bal(p.token), 0, 'a closed payment is never credited later');

  const g = await player({ phone: '24' + rnd().slice(0, 3) + '0000' });
  const f = await api('/wallet/deposit', { amount: 20, method: 'mobile_money', details: { phone: g.phone, network: 'mtn' } }, g.token);
  assert.equal(f.status, 'failed'); assert.ok(f.message); assert.equal((await payment(f.paymentId)).status, 'failed');

  const s = await api('/wallet/deposit', { amount: 25, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await mock('/__approve_silent/' + (await payment(s.paymentId)).provider_ref);   // no webhook and nobody polls
  assert.equal(await until(async () => (await bal(p.token)) === 25, 12000), true, 'the leader sweep asks Moolre and credits it');
  assert.equal((await payment(s.paymentId)).details.via, 'verify');
  await ledgerOk(p.user.id);
});

test('payouts: sent with one click, paid or refunded automatically, refused ones go back to the queue', { skip }, async () => {
  const p = await player();
  const d = await api('/wallet/deposit', { amount: 300, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await mock('/__approve/' + (await payment(d.paymentId)).provider_ref);
  assert.equal(await until(async () => (await bal(p.token)) === 300), true);
  await db.query('UPDATE users SET playthrough_left=0 WHERE id=$1', [p.user.id]);   // deposit played through (test/playthrough.test.js)
  const wd = amount => api('/wallet/withdraw', { amount, method: 'mobile_money', details: { phone: p.phone, network: 'mtn', name: 'Kofi Test' } }, p.token);

  const w = await wd(50);
  const sent = await api(`/admin/payments/${w.paymentId}/payout`, { reviewed: true }, ADMIN);
  assert.equal(sent.ok, true); assert.equal(sent.status, 'pending');
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, { reviewed: true }, ADMIN)).error, 'already_sent', 'cannot be sent twice');
  assert.equal((await api(`/admin/payments/${w.paymentId}/reject`, { reason: 'x' }, ADMIN)).status, 409, 'a sent payout cannot be refunded by hand');
  const t = (await mock('/__transfers/' + (await payment(w.paymentId)).provider_ref)).data;
  assert.equal(t.amount, '50.00'); assert.equal(t.receiver, '0' + p.phone); assert.equal(t.sendername, 'LetBetAfrika');
  assert.ok(await until(async () => (await payment(w.paymentId)).status === 'success'), 'paid when Moolre confirms');

  await mock('/__state', { instantPayout: true });
  const w2 = await wd(10);
  assert.equal((await api(`/admin/payments/${w2.paymentId}/payout`, { reviewed: true }, ADMIN)).status, 'success');
  assert.equal((await payment(w2.paymentId)).status, 'success');
  await mock('/__state', { instantPayout: false, failTransfers: true });
  const w3 = await wd(40);
  await api(`/admin/payments/${w3.paymentId}/payout`, { reviewed: true }, ADMIN);
  assert.ok(await until(async () => (await payment(w3.paymentId)).status === 'failed'), 'failed payout');
  await mock('/__state', { failTransfers: false, lowBalance: true });
  const w4 = await wd(15);
  const refused = await api(`/admin/payments/${w4.paymentId}/payout`, { reviewed: true }, ADMIN);
  assert.equal(refused.status, 502); assert.match(refused.message, /Not enough money in the Moolre wallet/);
  const r4 = await payment(w4.paymentId);
  assert.equal(r4.status, 'pending'); assert.equal(r4.provider, 'manual'); assert.match(r4.details.apiError, /Moolre wallet/);
  await mock('/__state', { lowBalance: false });
  assert.equal((await api(`/admin/payments/${w4.paymentId}/payout`, { reviewed: true }, ADMIN)).ok, true, 'can be sent again once topped up (new reference)');
  assert.ok(await until(async () => (await payment(w4.paymentId)).status === 'success'));
  await mock('/__state', { dropTransferResponse: true });
  const w5 = await wd(12);
  const lost = await api(`/admin/payments/${w5.paymentId}/payout`, { reviewed: true }, ADMIN);
  await mock('/__state', { dropTransferResponse: false });
  assert.equal(lost.status, 'pending', 'no answer = maybe sent: it stays with Moolre, never back to manual');
  assert.equal((await payment(w5.paymentId)).provider, 'moolre');
  assert.ok(await until(async () => (await payment(w5.paymentId)).status === 'success'), 'settled by the webhook');

  assert.equal(await bal(p.token), 300 - 50 - 10 - 15 - 12, 'the failed payout went back to the balance');
  await ledgerOk(p.user.id);

  const s = await api('/admin/payment-settings', null, ADMIN);
  assert.equal(s.api.provider, 'moolre'); assert.equal(s.api.enabled, true); assert.equal(s.api.test, true); assert.equal(s.api.signed, true);
  assert.equal(s.api.balance[0].currency, 'GHS'); assert.equal(s.api.account.activated, true);
  await mock('/__state', { callback: s.api.webhook });
  assert.equal((await api('/admin/payment-settings', null, ADMIN)).api.account.callbackOk, true);
});

test('withdrawal review: nothing is sent without it; the MoMo name, shared numbers and red flags are checked', { skip }, async () => {
  const p = await player();
  const d = await api('/wallet/deposit', { amount: 100, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  await mock('/__approve/' + (await payment(d.paymentId)).provider_ref);
  assert.equal(await until(async () => (await bal(p.token)) === 100), true);
  await db.query('UPDATE users SET playthrough_left=0 WHERE id=$1', [p.user.id]);   // deposit played through (test/playthrough.test.js)
  const wd = (amount, phone = p.phone) => api('/wallet/withdraw', { amount, method: 'mobile_money', details: { phone, network: 'mtn', name: 'Kofi Test' } }, p.token);

  const w = await wd(20);
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, {}, ADMIN)).error, 'review_required', 'no payout without the review');
  const c = await api(`/admin/payments/${w.paymentId}/checks`, null, ADMIN);
  assert.equal(c.momo.status, 'found'); assert.equal(c.momo.name, 'KOFI TEST'); assert.equal(c.momo.match, 'match');
  assert.equal(c.player.kyc, 'none'); assert.equal(c.money.deposits, 100); assert.equal(c.money.ledgerOk, true);
  assert.equal(c.number.depositsFromIt, 1); assert.deepEqual(c.number.otherAccounts, []);
  assert.equal(c.bad, 0, JSON.stringify(c.flags));
  assert.ok(!c.flags.some(f => /ID/.test(f.text)) && c.flags.some(f => /Staked only/.test(f.text)), 'warnings shown');
  assert.equal((await api(`/admin/payments/${w.paymentId}/payout`, { reviewed: true }, ADMIN)).ok, true);
  assert.equal((await payment(w.paymentId)).details.review.reviewed, true, 'the review is recorded');

  // the wallet is registered to someone else → red flag, refused unless the admin overrides
  await mock('/__state', { names: { ['0' + p.phone]: 'JOHN MENSAH' } });
  const w2 = await wd(15);
  const c2 = await api(`/admin/payments/${w2.paymentId}/checks?refresh=1`, null, ADMIN);
  assert.equal(c2.momo.match, 'mismatch'); assert.ok(c2.bad >= 1);
  const refused = await api(`/admin/payments/${w2.paymentId}/payout`, { reviewed: true }, ADMIN);
  assert.equal(refused.status, 409); assert.equal(refused.error, 'checks_failed'); assert.match(refused.flags[0].text, /JOHN MENSAH/);
  assert.equal((await payment(w2.paymentId)).provider, 'manual', 'nothing was sent');
  assert.equal((await api(`/admin/payments/${w2.paymentId}/reject`, { reason: 'The MoMo account is not in your name' }, ADMIN)).ok, true);
  assert.equal(await until(async () => (await bal(p.token)) === 80), true, 'rejected → money back (100 − 20 sent)');
  await mock('/__state', { names: {} });

  // a number with no wallet, and a number another account uses
  const w3 = await wd(10, '24' + rnd().slice(0, 3) + '9999');
  assert.equal((await api(`/admin/payments/${w3.paymentId}/checks`, null, ADMIN)).momo.status, 'not_found');
  const other = await player();
  const w4 = await api('/wallet/withdraw', { amount: 10, method: 'mobile_money', details: { phone: other.phone, network: 'mtn', name: 'Kofi Test' } }, p.token);
  const c4 = await api(`/admin/payments/${w4.paymentId}/checks`, null, ADMIN);
  assert.ok(c4.flags.some(f => f.level === 'bad' && /also used by 1 other account/.test(f.text)), JSON.stringify(c4.flags));
  assert.equal((await api(`/admin/payments/${w4.paymentId}/payout`, { reviewed: true, override: true }, ADMIN)).ok, true, 'an admin can override after checking');
  assert.equal((await payment(w4.paymentId)).details.review.override, true);
  assert.equal((await api(`/admin/payments/${w3.paymentId}/check`, {}, ADMIN)).payment.status, 'pending', 'POST /check reaches its own route');
  await ledgerOk(p.user.id);
});

test('Send money: admin password every time, name lookup, limits, settled by webhook, refusals recorded', { skip }, async () => {
  const w0 = await api('/admin/wallet', null, ADMIN);
  assert.equal(w0.enabled, true); assert.equal(w0.provider, 'moolre'); assert.equal(w0.balance.amount, 1234.5);
  const to = '24' + rnd().slice(0, 7);
  const look = await api('/admin/wallet/lookup', { phone: '0' + to, network: 'mtn' }, ADMIN);
  assert.equal(look.status, 'found'); assert.equal(look.name, 'KOFI TEST');
  const send = (d, pw = 'Strong123') => api('/admin/wallet/send', { phone: '0' + to, network: 'mtn', reason: 'Test transfer', ...d, password: pw }, ADMIN);
  assert.equal((await send({ amount: 10 }, 'wrong-password')).error, 'bad_password');
  assert.equal((await api('/admin/wallet/send', { phone: '0' + to, network: 'mtn', amount: 10, reason: 'x', password: 'Strong123' }, (await player()).token)).status, 403, 'players cannot send');
  assert.equal((await send({ amount: 20001 })).error, 'over_transfer_limit');
  assert.equal((await send({ amount: 10, phone: '0' + to.slice(0, 5) + '9999' })).error, 'no_wallet');
  const s1 = await send({ amount: 25 });
  assert.equal(s1.status, 'pending'); assert.equal(s1.name, 'KOFI TEST'); assert.match(s1.reference, /^lbo-/);
  const t = (await mock('/__transfers/' + s1.reference)).data;
  assert.equal(t.amount, '25.00'); assert.equal(t.receiver, '0' + to);
  const row = async id => (await db.query('SELECT * FROM wallet_payouts WHERE id=$1', [id])).rows[0];
  assert.ok(await until(async () => (await row(s1.id)).status === 'success'), 'settled by the webhook');
  // the 24-hour limit holds
  const sent = (await api('/admin/wallet', null, ADMIN)).sentToday;
  await api('/admin/settings/wallet_payouts', { value: { maxPerTransfer: 100, maxPerDay: sent + 150 } }, ADMIN, 'PUT');
  assert.equal((await send({ amount: 100 })).status, 'pending');
  const over = await send({ amount: 60 });
  assert.equal(over.error, 'over_daily_limit'); assert.equal(over.left, 50);
  await api('/admin/settings/wallet_payouts', { value: { maxPerTransfer: 20000, maxPerDay: 50000 } }, ADMIN, 'PUT');
  // refused by Moolre before any money moved → failed with the reason, and it does not count against the limit
  await mock('/__state', { lowBalance: true });
  const bad = await send({ amount: 30 });
  await mock('/__state', { lowBalance: false });
  assert.equal(bad.status, 502); assert.equal(bad.error, 'payout_failed'); assert.match(bad.message, /Not enough money/);
  assert.equal((await row(bad.id)).status, 'failed');
  const list = (await api('/admin/wallet', null, ADMIN)).payouts;
  assert.ok(list.some(x => x.id === s1.id && x.status === 'success' && x.by));
  const log = (await api('/admin/log', null, ADMIN)).log.find(l => /wallet\/send/.test(l.action));
  assert.ok(log, 'in the audit log'); assert.equal(log.meta.password, undefined, 'the password is never logged');
});
