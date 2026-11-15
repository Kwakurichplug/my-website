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
