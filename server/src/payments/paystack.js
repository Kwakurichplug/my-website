// Paystack (paystack.com) – Ghana Mobile Money deposits and payouts. Turned on by PAYSTACK_SECRET_KEY
// (sk_test_… for Paystack's test mode, sk_live_… for real money). Set the webhook URL in the Paystack dashboard to
//   https://<site>/api/payments/paystack/webhook
//
// Deposits: Charge API with mobile_money → the player approves the prompt on their phone (MTN, AirtelTigo) or types
//           the code Telecel sends them → Paystack's webhook (charge.success, signature checked) or our own verify
//           call credits the deposit, once.
// Payouts:  transfer recipient (mobile_money) + transfer from the Paystack balance → webhook transfer.success /
//           transfer.failed / transfer.reversed (a failed payout goes back to the player's balance).
import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE = () => process.env.PAYSTACK_BASE || 'https://api.paystack.co';   // override for tests (mock server)
const KEY = () => process.env.PAYSTACK_SECRET_KEY || '';
export const name = 'paystack', label = 'Paystack', webhookPath = '/api/payments/paystack/webhook';
export const enabled = () => !!KEY();
export const testMode = () => KEY().startsWith('sk_test_');

// our network ids → Paystack's codes
const PROVIDER = { mtn: 'mtn', telecel: 'vod', at: 'atl' };
const BANK = { mtn: 'MTN', telecel: 'VOD', at: 'ATL' };

async function call(method, path, body) {
  const res = await fetch(BASE() + path, {
    method, headers: { authorization: 'Bearer ' + KEY(), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === false) throw Object.assign(new Error(j.message || `Paystack error ${res.status}`), { status: 502, provider: true, data: j.data || null });
  return j.data;
}

/** Start a Mobile Money charge. status: success | pay_offline (approve on phone) | send_otp | pending | failed */
export async function chargeMomo({ reference, amount, email, phone, network }) {
  const d = await call('POST', '/charge', {
    email, amount: Math.round(amount * 100), currency: 'GHS', reference,
    mobile_money: { phone: '0' + phone, provider: PROVIDER[network] || network }, metadata: { source: 'letbetafrika' },
  });
  return { status: d.status, display: d.display_text || d.gateway_response || '' };
}
/** `p` is our payment row (or its reference). */
export async function submitOtp(p, otp) {
  const reference = typeof p === 'string' ? p : p.provider_ref;
  const d = await call('POST', '/charge/submit_otp', { otp, reference });
  return { status: d.status, display: d.display_text || d.gateway_response || '' };
}
/** The charge's final state, straight from Paystack (amount back in cedis). */
export async function verify(reference) {
  const d = await call('GET', '/transaction/verify/' + encodeURIComponent(reference));
  return { status: d.status, amount: Number(d.amount) / 100, currency: d.currency };
}
/** Send a payout to a Mobile Money wallet. status: success | pending | otp | failed */
export async function payout({ reference, amount, phone, network, name }) {
  const r = await call('POST', '/transferrecipient', { type: 'mobile_money', name, account_number: '0' + phone, bank_code: BANK[network] || network, currency: 'GHS' });
  const t = await call('POST', '/transfer', { source: 'balance', amount: Math.round(amount * 100), recipient: r.recipient_code, reason: 'LetBetAfrika withdrawal', reference });
  return { status: t.status, code: t.transfer_code };
}
/** Paystack balance (admin status check). */
export async function balance() {
  const d = await call('GET', '/balance');
  return (d || []).map(b => ({ currency: b.currency, balance: Number(b.balance) / 100 }));
}
/** Webhooks are signed: HMAC-SHA512 of the raw body with the secret key, hex, in x-paystack-signature. */
export function validSignature(raw, sig) {
  if (!enabled() || !raw || !sig) return false;
  const want = Buffer.from(createHmac('sha512', KEY()).update(raw).digest('hex')), got = Buffer.from(String(sig));
  return want.length === got.length && timingSafeEqual(want, got);
}
