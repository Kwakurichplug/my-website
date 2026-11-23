// Unit tests: demo payments can never run in production; payment-API webhook signatures; deposit references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
process.env.DATABASE_URL ||= 'postgres://postgres@127.0.0.1:5433/letbet_oa';
const { demoMode, referenceOf, methodName } = await import('../src/lib/payments.js');
const paystack = await import('../src/payments/paystack.js');

test('demo payments (instant credit) are impossible in production', () => {
  const keep = { m: process.env.PAYMENTS_MODE, e: process.env.NODE_ENV };
  process.env.PAYMENTS_MODE = 'demo'; process.env.NODE_ENV = 'production'; assert.equal(demoMode(), false);
  process.env.NODE_ENV = 'development'; assert.equal(demoMode(), true);
  process.env.PAYMENTS_MODE = 'live'; assert.equal(demoMode(), false);
  delete process.env.PAYMENTS_MODE; assert.equal(demoMode(), false, 'off unless asked for');
  if (keep.m == null) delete process.env.PAYMENTS_MODE; else process.env.PAYMENTS_MODE = keep.m;
  if (keep.e == null) delete process.env.NODE_ENV; else process.env.NODE_ENV = keep.e;
});
test('webhook signatures: HMAC-SHA512 of the exact body with the secret key', () => {
  const keep = process.env.PAYSTACK_SECRET_KEY; process.env.PAYSTACK_SECRET_KEY = 'sk_test_unit';
  const body = Buffer.from('{"event":"charge.success","data":{"reference":"LB1"}}'), sig = createHmac('sha512', 'sk_test_unit').update(body).digest('hex');
  assert.equal(paystack.validSignature(body, sig), true);
  assert.equal(paystack.validSignature(Buffer.from(body.toString().replace('LB1', 'LB2')), sig), false, 'a changed body fails');
  assert.equal(paystack.validSignature(body, 'abc'), false);
  delete process.env.PAYSTACK_SECRET_KEY; assert.equal(paystack.validSignature(body, sig), false, 'no key, no webhooks');
  if (keep != null) process.env.PAYSTACK_SECRET_KEY = keep;
});
test('references and names', () => {
  assert.equal(referenceOf({ uid: 52 }), 'LB000052'); assert.equal(referenceOf({ uid: 10000123 }), 'LB10000123');
  assert.equal(methodName('bank_transfer'), 'Bank transfer'); assert.equal(methodName('mobile_money'), 'Mobile money');
});

const moolre = await import('../src/payments/moolre.js');
const gateway = await import('../src/payments/gateway.js');
const { reasonText } = await import('../src/payments/flows.js');
const MOOLRE_ENV = { MOOLRE_USER: 'u', MOOLRE_PUBLIC_KEY: 'pub', MOOLRE_PRIVATE_KEY: 'priv', MOOLRE_ACCOUNT_NUMBER: '1' };
const withEnv = (vars, fn) => {
  const keep = Object.fromEntries(Object.keys(vars).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) if (v == null) delete process.env[k]; else process.env[k] = v;
  try { return fn(); } finally { for (const [k, v] of Object.entries(keep)) if (v == null) delete process.env[k]; else process.env[k] = v; }
};

test('Moolre webhook signatures: HMAC-SHA256 of "<t>.<raw body>", at most 5 minutes old, constant-time', () => {
  const body = Buffer.from('{"event":"payment.succeeded","data":{"externalref":"LB1","txstatus":1}}'), now = Date.now(), t = Math.floor(now / 1000);
  const sig = (secret, ts = t, b = body) => createHmac('sha256', secret).update(`${ts}.${b}`).digest('hex');
  assert.equal(moolre.validSignature(body, `t=${t},v1=${sig('whsec')}`, 'whsec', now), true);
  assert.equal(moolre.validSignature(body, `t=${t}, v1=deadbeef, v1=${sig('whsec')}`, 'whsec', now), true, 'any v1 may match (secret rotation)');
  assert.equal(moolre.validSignature(Buffer.from(body.toString().replace('LB1', 'LB2')), `t=${t},v1=${sig('whsec')}`, 'whsec', now), false, 'a changed body fails');
  assert.equal(moolre.validSignature(body, `t=${t},v1=${sig('other')}`, 'whsec', now), false, 'another secret fails');
  assert.equal(moolre.validSignature(body, `t=${t - 301},v1=${sig('whsec', t - 301)}`, 'whsec', now), false, 'older than 5 minutes fails');
  assert.equal(moolre.validSignature(body, `v1=${sig('whsec')}`, 'whsec', now), false, 'no timestamp fails');
  assert.equal(moolre.validSignature(body, `t=${t},v1=${sig('whsec')}`, '', now), false, 'no secret, no trust');
  assert.equal(moolre.sameSecret('whsec', 'whsec'), true); assert.equal(moolre.sameSecret('whsex', 'whsec'), false); assert.equal(moolre.sameSecret('', 'whsec'), false);
});

test('Moolre collection codes: prompt, number check, unknown outcome, refused', () => {
  assert.equal(moolre.chargeState({ ok: true, code: 'TR099' }).status, 'pay_offline');
  assert.equal(moolre.chargeState({ ok: false, code: 'TP14' }).status, 'send_otp');
  assert.equal(moolre.chargeState({ ok: false, code: 'TP19' }).status, 'send_otp');
  for (const code of ['TP18', 'TP11', 'TR01', 'TR02', 'TP13']) assert.equal(moolre.chargeState({ ok: false, code }).status, 'pending', code + ' may have gone out: wait for the status');
  const setup = moolre.chargeState({ ok: false, code: 'TP00', message: 'Authentication failed' });
  assert.equal(setup.status, 'failed'); assert.doesNotMatch(setup.display, /Authentication/, 'players never see our setup errors');
  const refused = moolre.chargeState({ ok: false, code: 'TP05', message: 'Amount must be greater than 0.01' });
  assert.equal(refused.status, 'failed'); assert.match(refused.reason, /TP05/);
});

test('provider: Moolre when its four keys are set, else Paystack, else none; player-facing reasons', () => {
  withEnv({ ...MOOLRE_ENV, PAYSTACK_SECRET_KEY: 'sk_test_x' }, () => assert.equal(gateway.active().name, 'moolre'));
  withEnv({ ...MOOLRE_ENV, MOOLRE_ACCOUNT_NUMBER: null, PAYSTACK_SECRET_KEY: 'sk_test_x' }, () => assert.equal(gateway.active().name, 'paystack', 'Moolre needs all four'));
  withEnv({ ...MOOLRE_ENV, MOOLRE_USER: null, PAYSTACK_SECRET_KEY: null }, () => assert.equal(gateway.active(), null));
  withEnv({ ...MOOLRE_ENV, MOOLRE_BASE: null }, () => assert.equal(moolre.testMode(), false, 'api.moolre.com is live'));
  withEnv({ ...MOOLRE_ENV, MOOLRE_BASE: 'https://sandbox.moolre.com' }, () => assert.equal(moolre.testMode(), true));
  assert.equal(gateway.isApi('moolre'), true); assert.equal(gateway.isApi('manual'), false);
  assert.match(reasonText('LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED'), /Not enough money/);
  assert.match(reasonText('WRONG_PIN'), /PIN/); assert.match(reasonText('PROMPT_EXPIRED'), /expired/); assert.equal(reasonText(''), 'The payment was not approved');
});
