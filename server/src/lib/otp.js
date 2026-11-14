// One-time codes for sign-up and password reset, by SMS or by email.
//   SMS_PROVIDER=console  -> logs the code; outside production it is also shown on screen (test mode)
//   SMS_PROVIDER=termii   -> Termii (Nigeria/Ghana) – needs TERMII_API_KEY, TERMII_SENDER
//   Email codes go through the email provider (src/emails/index.js – Spacemail SMTP on the live site).
// A channel that cannot deliver is not offered (GET /api/auth/methods) and its requests answer 503.
// Codes are hashed at rest, expire in 10 minutes, allow 5 attempts, max 3 per 10 minutes per number / address.
import { createHash, randomInt } from 'node:crypto';
import { q } from '../db/pool.js';
import { deliver, render, emailReady, emailTestMode, logEmail } from '../emails/index.js';

const DIAL = { NG: '234', GH: '233' };
const hashCode = c => createHash('sha256').update(String(c)).digest('hex');
const err = (m, status) => Object.assign(new Error(m), { status });
const smsProvider = () => process.env.SMS_PROVIDER || 'console';
const smsTestMode = () => smsProvider() === 'console' && process.env.NODE_ENV !== 'production';
/** Can a code reach a phone right now? (a real SMS provider, or test mode where the code is shown on screen) */
export const smsReady = () => (smsProvider() === 'termii' ? !!process.env.TERMII_API_KEY : smsTestMode());
export { emailReady };

async function sendSms(country, phone, text) {
  const to = DIAL[country] + phone;
  if (smsProvider() === 'termii') {
    const r = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, from: process.env.TERMII_SENDER || 'LetBet', sms: text, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
    });
    if (!r.ok) throw err('sms_failed', 502);
    return;
  }
  console.log(`[sms:${to}] ${text}`);
}

/** Code by SMS. Returns the code only in test mode (no SMS provider outside production). */
export async function issueOtp(country, phone, purpose) {
  if (!smsReady()) throw err('sms_unavailable', 503);
  const { rows } = await q(`SELECT count(*)::int AS n FROM otps WHERE country=$1 AND phone=$2 AND created_at > now() - interval '10 minutes'`, [country, phone]);
  if (rows[0].n >= 3) throw err('too_many_codes', 429);
  const code = String(randomInt(100000, 999999));
  await q(`INSERT INTO otps (country, phone, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4, now() + interval '10 minutes')`, [country, phone, hashCode(code), purpose]);
  await sendSms(country, phone, `Your LetBetAfrika code is ${code}. It expires in 10 minutes.`);
  return smsTestMode() ? code : undefined;
}

/** Code by email (address already lower-cased). Returns the code only in test mode (no email provider outside production). */
export async function issueEmailOtp(country, email, purpose, userId = null) {
  if (!emailReady()) throw err('email_unavailable', 503);
  const { rows } = await q(`SELECT count(*)::int AS n FROM otps WHERE email=$1 AND created_at > now() - interval '10 minutes'`, [email]);
  if (rows[0].n >= 3) throw err('too_many_codes', 429);
  const code = String(randomInt(100000, 999999));
  await q(`INSERT INTO otps (country, email, user_id, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '10 minutes')`, [country, email, userId, hashCode(code), purpose]);
  const m = render('otp', { user: { country, email }, code, purpose });
  try {
    const status = await deliver({ to: email, subject: m.subject, html: m.html, text: m.text });
    logEmail(userId, 'otp', m.subject, status);
  } catch (e) {
    logEmail(userId, 'otp', m.subject, 'failed', e.message);
    console.error('[email] otp', e.code || '', e.message);
    throw err('email_failed', 502);
  }
  return emailTestMode() ? code : undefined;
}

async function check(where, params, code) {
  const { rows } = await q(`SELECT id, code_hash, attempts FROM otps WHERE ${where} AND used=false AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, params);
  const o = rows[0];
  if (!o || o.attempts >= 5) return false;
  if (o.code_hash !== hashCode(code)) { await q('UPDATE otps SET attempts = attempts + 1 WHERE id=$1', [o.id]); return false; }
  await q('UPDATE otps SET used=true WHERE id=$1', [o.id]);
  return true;
}
export const checkOtp = (country, phone, purpose, code) => check('country=$1 AND phone=$2 AND purpose=$3', [country, phone, purpose], code);
export const checkEmailOtp = (email, purpose, code, userId) => (userId
  ? check('email=$1 AND purpose=$2 AND user_id=$3', [email, purpose, userId], code)    // email change: only the player who asked
  : check('email=$1 AND purpose=$2', [email, purpose], code));
