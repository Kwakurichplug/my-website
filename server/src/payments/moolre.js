// Moolre (moolre.com) – Ghana Mobile Money deposits and payouts. Turned on when all four are set (Railway variables
// only, never in git): MOOLRE_USER (the Moolre username), MOOLRE_PUBLIC_KEY, MOOLRE_PRIVATE_KEY,
// MOOLRE_ACCOUNT_NUMBER (the wallet's account number). MOOLRE_WEBHOOK_SECRET checks the webhook signatures;
// `node scripts/moolre-setup.js` registers our webhook URL on the wallet and prints that secret.
// MOOLRE_BASE=https://sandbox.moolre.com for the sandbox (or the mock in tests).
//
// Deposits: POST /open/transact/payment. TR099 = the USSD prompt is on the player's phone (they approve with their
//           MoMo PIN). TP14 = Moolre first verifies the number: it texts a code, we repeat the request with it
//           (otpcode), get TP17, then repeat it once more without the code to send the prompt.
// Payouts:  POST /open/transact/transfer from the Moolre wallet. The server's outbound IP must be whitelisted in
//           Moolre (API Services → Security → Whitelist IP for Disbursement).
// Results:  only Moolre's status call (POST /open/transact/status, data.txstatus 1 / 2 / 0) decides that a payment
//           succeeded or failed. A webhook just tells us to ask now.
import { createHmac, timingSafeEqual } from 'node:crypto';

const env = k => String(process.env[k] || '').trim();
const BASE = () => (env('MOOLRE_BASE') || 'https://api.moolre.com').replace(/\/$/, '');
const USER = () => env('MOOLRE_USER'), PUB = () => env('MOOLRE_PUBLIC_KEY'), PRIV = () => env('MOOLRE_PRIVATE_KEY'), ACCT = () => env('MOOLRE_ACCOUNT_NUMBER');

export const name = 'moolre', label = 'Moolre', webhookPath = '/api/payments/moolre/webhook';
export const enabled = () => !!(USER() && PUB() && PRIV() && ACCT());
export const testMode = () => !/^https:\/\/api\.moolre\.com$/.test(BASE());
export const webhookSecret = () => env('MOOLRE_WEBHOOK_SECRET');

// our network ids → Moolre channel names (accepted for collections and payouts)
const CHANNEL = { mtn: 'MTN', telecel: 'TELECEL', at: 'AT' };
const amountOf = n => (Math.round(Number(n) * 100) / 100).toFixed(2);
const text = m => Array.isArray(m) ? m.filter(Boolean).join(' ') : m == null ? '' : String(m);

/** One API call. Moolre answers HTTP 200 even for failures, so the result is read from status / code / data.
 *  A call that gets no readable answer throws with `unknown: true`: the request may still have gone through. */
async function call(path, body, key, headers = {}) {
  // 'pub' = X-API-PUBKEY (collections, payment status); 'pubkey' = the public key in X-API-KEY (name lookup); else private
  const auth = key === 'pub' ? { 'x-api-pubkey': PUB() } : key === 'pubkey' ? { 'x-api-key': PUB() } : { 'x-api-key': PRIV() };
  let res;
  try {
    res = await fetch(BASE() + path, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-user': USER(), ...auth, ...headers },
      body: JSON.stringify({ type: 1, accountnumber: ACCT(), ...body }), signal: AbortSignal.timeout(25000),
    });
  } catch (e) { throw Object.assign(new Error('Moolre did not answer (' + e.message + ')'), { status: 502, provider: true, unknown: true }); }
  const j = await res.json().catch(() => null);
  if (!j || typeof j !== 'object') throw Object.assign(new Error(`Moolre error ${res.status}`), { status: 502, provider: true, unknown: true });
  return { ok: Number(j.status) === 1, code: String(j.code || ''), message: text(j.message), data: j.data };
}

/* ---------- deposits ---------- */
const OTP_NEEDED = new Set(['TP14', 'TP19', '200_OTP_REQ']);
const OTP_OK = new Set(['TP17', '200_OTP_SUCCESS']);
const OTP_BAD = new Set(['TP15', '400_INVALID_OTP']);
const PROMPT_SENT = new Set(['TR099', '200_PAYMENT_REQ']);
// the prompt may or may not have gone out: never resend, the status check decides
const MAYBE_SENT = new Set(['TP18', 'TP11', 'TR01', 'TR02', 'TP13', '400_NON_UNIQUE_REF', 'IDEM02']);
// our side is not set up (keys, wallet): the player cannot fix it
const SETUP = /^(TP00|TP03|TP04|AIN\d+|TP10)$/;
const APPROVE = 'Approve the payment prompt on your phone with your MoMo PIN.';

const charge = (p, otpcode, headers) => call('/open/transact/payment', {
  channel: CHANNEL[p.network] || String(p.network || '').toUpperCase(), currency: 'GHS', payer: '0' + p.phone,
  amount: amountOf(p.amount), externalref: p.reference, reference: 'LetBetAfrika deposit', ...(otpcode ? { otpcode } : {}),
}, 'pub', headers);

/** Moolre's answer → status: pay_offline (prompt on the phone) | send_otp | pending | failed */
export function chargeState(r) {
  if (PROMPT_SENT.has(r.code)) return { status: 'pay_offline', display: APPROVE };
  if (OTP_NEEDED.has(r.code)) return { status: 'send_otp', display: 'Enter the verification code we sent to your phone by SMS. You only do this once for this number.' };
  if (MAYBE_SENT.has(r.code) || r.ok) return { status: 'pending', display: APPROVE };
  if (SETUP.test(r.code)) return { status: 'failed', display: 'Mobile Money deposits are unavailable right now. Please try again later.', reason: `${r.code} ${r.message}`.trim() };
  return { status: 'failed', display: r.message || 'The payment could not be started. Check the number and network and try again.', reason: `${r.code} ${r.message}`.trim() };
}

export async function chargeMomo({ reference, amount, phone, network }) {
  try { return chargeState(await charge({ reference, amount, phone, network })); }
  catch (e) { if (e.unknown) return { status: 'pending', display: APPROVE }; throw e; }
}

/** The code Moolre texted to verify the number. Then the real prompt goes out. `p` is our payment row. */
export async function submitOtp(p, otp) {
  const req = { reference: p.provider_ref, amount: p.amount, phone: p.details?.phone, network: p.details?.network };
  const r = await charge(req, otp);
  if (OTP_BAD.has(r.code)) throw Object.assign(new Error(r.message || 'That code is not right'), { status: 400 });
  if (r.code === 'OTP429') throw Object.assign(new Error('Too many codes were requested. Wait a few minutes and try again.'), { status: 429 });
  // number verified: send the original request once more, now with Idempotency-Key = externalref (Moolre's guide)
  if (OTP_OK.has(r.code)) {
    try { return chargeState(await charge(req, null, { 'idempotency-key': p.provider_ref })); }
    catch (e) { if (e.unknown) return { status: 'pending', display: APPROVE }; throw e; }
  }
  return chargeState(r);
}

/** One transaction's state at Moolre: success (with the amount paid) | failed | pending | not_found */
async function status(reference, key) {
  const r = await call('/open/transact/status', { idtype: '1', id: reference }, key);
  const d = r.data && typeof r.data === 'object' ? r.data : {};
  if (r.code === 'SS07' || r.code === '200_NOT_FOUND') return { status: 'not_found' };
  // Moolre refused the check itself (keys, account, …): still pending, but say why so it can be fixed
  if (!r.ok && d.txstatus == null) return { status: 'pending', error: `${r.code} ${r.message}`.trim() || 'no answer' };
  if (d.externalref != null && String(d.externalref) !== String(reference)) return { status: 'pending' };
  const tx = Number(d.txstatus), amount = Number(d.amount);
  if (r.ok && tx === 1) return { status: 'success', amount: Number.isFinite(amount) && amount > 0 ? amount : undefined, currency: 'GHS', id: d.transactionid };
  if (tx === 2) return { status: 'failed', reason: d.reason || r.message };
  return { status: 'pending' };
}
export const verify = reference => status(reference, 'pub');

/* ---------- payouts ---------- */
const PAID = new Set(['OBGH01', 'OTGH01', 'OBNG01', 'OM03', 'TR08', 'GHQ03']);
// refused before any money moved: safe to pay another way
const NOT_SENT = new Set(['APY21', 'APY04', 'APY05', 'APY06', 'APY01', 'APY08', 'APY09', 'APY11', 'APY12', 'APY13', 'APY14', 'APY22',
  'TR09', 'OM12', 'OM16', 'TK01', '400_INVALID_ACCOUNT', '400_INSUFFICIENT_BALANCE']);
const PAYOUT_ERROR = { APY21: 'Not enough money in the Moolre wallet', '400_INSUFFICIENT_BALANCE': 'Not enough money in the Moolre wallet',
  TK01: 'This server is not whitelisted for payouts in Moolre (API Services → Security → Whitelist IP for Disbursement)',
  APY14: 'Moolre account not found – check MOOLRE_ACCOUNT_NUMBER', '400_INVALID_ACCOUNT': 'The MoMo number was not found on that network' };

/** Pay a withdrawal to a MoMo wallet. success = paid now; pending = Moolre is working on it (webhook / status check).
 *  Throws only when Moolre refused it before any money moved. */
export async function payout({ reference, amount, phone, network }) {
  let r;
  try {
    r = await call('/open/transact/transfer', {
      channel: CHANNEL[network] || String(network || '').toUpperCase(), currency: 'GHS', amount: amountOf(amount), receiver: '0' + phone,
      externalref: reference, reference: 'LetBetAfrika withdrawal', sendername: 'LetBetAfrika',
    }, 'priv', { 'idempotency-key': reference });
  } catch (e) { if (e.unknown) return { status: 'pending', unknown: true }; throw e; }
  if (r.ok && PAID.has(r.code)) return { status: 'success', code: r.data?.transactionid, name: r.data?.receivername };
  if (NOT_SENT.has(r.code) || (!r.ok && /^(AIN|AVD00|TP00|SS00)/.test(r.code)))
    throw Object.assign(new Error(PAYOUT_ERROR[r.code] || `${r.message || 'Moolre refused the payout'} (${r.code})`), { status: 502, provider: true });
  return { status: 'pending' };
}
export const payoutStatus = reference => status(reference, 'priv');

/** The name registered on a MoMo wallet (POST /open/transact/validate). { ok: true, name } or
 *  { ok: false, notFound, reason } – notFound when the network says there is no such wallet. */
export async function validateName({ phone, network }) {
  // the name lookup accepts the public key in X-API-KEY, so it works even while the private key is being changed
  const r = await call('/open/transact/validate', { receiver: '0' + phone, channel: CHANNEL[network] || String(network || '').toUpperCase(), currency: 'GHS' }, 'pubkey');
  if (r.ok && typeof r.data === 'string' && r.data.trim()) return { ok: true, name: r.data.trim() };
  return { ok: false, notFound: ['AVD02', 'AVD05', '400_INVALID_ACCOUNT'].includes(r.code), reason: `${r.message || 'Name check failed'} (${r.code})` };
}

/* ---------- account ---------- */
/** Wallet balance, name, whether API access is on, and the callback URL set on it. */
export async function account() {
  const r = await call('/open/account/status', {}, 'priv');
  if (!r.ok) throw new Error(`${r.message || 'Moolre account check failed'} (${r.code})`);
  const d = r.data || {};
  return { balance: Number(d.balance), name: d.accountname || '', activated: String(d.activated) === '1', callback: d.callback || '' };
}
export async function balance() { return [{ currency: 'GHS', balance: (await account()).balance }]; }

/** Set the wallet's webhook URL. Moolre answers with the secret that signs the webhooks. */
export async function setCallback(url) {
  // the update call also requires the wallet's account name: send the current one, unchanged
  const accountname = (await account()).name;
  const r = await call('/open/account/update', { currency: 'GHS', callback: url, accountname }, 'priv');
  if (!r.ok) throw new Error(`${r.message || 'Moolre did not save the callback'} (${r.code})`);
  return { callback: r.data?.callback || url, secret: r.data?.secret || '' };
}

/* ---------- webhooks ---------- */
/** X-Moolre-Signature: "t=<unix seconds>,v1=<hex>"; v1 = HMAC-SHA256(secret, "<t>.<raw body>"), at most 5 minutes old. */
export function validSignature(raw, header, secret = webhookSecret(), now = Date.now()) {
  if (!secret || !raw || !header) return false;
  let t = 0; const sigs = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = Number(v); else if (k === 'v1') sigs.push(v);
  }
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > 300) return false;
  const want = Buffer.from(createHmac('sha256', secret).update(`${t}.`).update(raw).digest('hex'));
  return sigs.some(s => { const got = Buffer.from(s); return got.length === want.length && timingSafeEqual(got, want); });
}
/** Older webhooks carry the secret in data.secret (Moolre retires it after 2027-03-31). */
export function sameSecret(given, secret = webhookSecret()) {
  if (!secret || !given) return false;
  const a = Buffer.from(String(given)), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
