// One-time codes by SMS. Provider is chosen by env:
//   SMS_PROVIDER=console  -> logs the code (development)
//   SMS_PROVIDER=termii   -> Termii (Nigeria/Ghana) – needs TERMII_API_KEY, TERMII_SENDER
// Codes are hashed at rest and expire in 10 minutes.
import { createHash, randomInt } from 'node:crypto';
import { q } from '../db/pool.js';

const DIAL = { NG: '234', GH: '233' };
const hashCode = c => createHash('sha256').update(String(c)).digest('hex');

async function send(country, phone, text) {
  const to = DIAL[country] + phone;
  const provider = process.env.SMS_PROVIDER || 'console';
  if (provider === 'termii') {
    const r = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, from: process.env.TERMII_SENDER || 'LetBet', sms: text, type: 'plain', channel: 'generic', api_key: process.env.TERMII_API_KEY }),
    });
    if (!r.ok) throw new Error('sms_failed');
    return;
  }
  console.log(`[sms:${to}] ${text}`);
}

export async function issueOtp(country, phone, purpose) {
  // throttle: max 3 codes per 10 minutes per number
  const { rows } = await q(`SELECT count(*)::int AS n FROM otps WHERE country=$1 AND phone=$2 AND created_at > now() - interval '10 minutes'`, [country, phone]);
  if (rows[0].n >= 3) { const e = new Error('too_many_codes'); e.status = 429; throw e; }
  const code = String(randomInt(100000, 999999));
  await q(`INSERT INTO otps (country, phone, code_hash, purpose, expires_at) VALUES ($1,$2,$3,$4, now() + interval '10 minutes')`, [country, phone, hashCode(code), purpose]);
  await send(country, phone, `Your LetBetAfrika code is ${code}. It expires in 10 minutes.`);
  return process.env.NODE_ENV === 'production' ? undefined : code; // returned to the client only in dev
}

export async function checkOtp(country, phone, purpose, code) {
  const { rows } = await q(`SELECT id, code_hash, attempts FROM otps WHERE country=$1 AND phone=$2 AND purpose=$3 AND used=false AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [country, phone, purpose]);
  const o = rows[0];
  if (!o || o.attempts >= 5) return false;
  if (o.code_hash !== hashCode(code)) { await q('UPDATE otps SET attempts = attempts + 1 WHERE id=$1', [o.id]); return false; }
  await q('UPDATE otps SET used=true WHERE id=$1', [o.id]);
  return true;
}
