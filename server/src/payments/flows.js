// Money in and out through the payment APIs (Moolre, Paystack), exactly once: webhooks repeat and our own checks
// can race them, so every change locks the payment row and only acts while it is still pending.
import { q, tx } from '../db/pool.js';
import { creditDeposit } from '../lib/bonus.js';
import { move } from '../lib/wallet.js';
import { sendEmail } from '../emails/index.js';
import { methodName } from '../lib/payments.js';
import { API_PROVIDERS, byName } from './gateway.js';
import { setSetting } from '../lib/settings.js';

const userOf = async (c, id) => (await c.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
const ageMin = at => (Date.now() - new Date(at).getTime()) / 60000;
// Can we confirm deposits with the provider? Shown to the admin (Overview, Payments) when the status check is refused.
let lastHealth = null;
function depositHealth(ok, message) {
  const key = ok ? 'ok' : 'bad:' + message;
  if (key === lastHealth?.key && Date.now() - lastHealth.at < 600000) return;   // write on a change, else every 10 min
  lastHealth = { key, at: Date.now() };
  setSetting('deposit_health', { ok, at: new Date().toISOString(), ...(message ? { message: String(message).slice(0, 200) } : {}) }).catch(() => {});
}
const NOT_APPROVED = 'The payment was not approved';
const PAYOUT_FAILED = 'The transfer did not go through. The money is back in your balance.';

/** A provider's failure reason in words a player understands (the raw reason is kept for the admin). */
export function reasonText(raw) {
  const s = String(raw || '').toUpperCase();
  if (/BALANCE|INSUFFICIENT|FUNDS/.test(s)) return 'Not enough money in the MoMo wallet, or a MoMo limit was reached';
  if (/LIMIT/.test(s)) return 'A MoMo limit was reached';
  if (/PIN/.test(s)) return 'The MoMo PIN was not correct';
  if (/EXPIRE|TIMEOUT|TIMED/.test(s)) return 'The prompt expired before it was approved';
  if (/NOT.?REGISTERED|NOT.?FOUND/.test(s)) return 'This number is not registered for Mobile Money on that network';
  if (/DECLIN|CANCEL|REJECT/.test(s)) return 'The payment was declined on the phone';
  return NOT_APPROVED;
}

/** A charge succeeded: credit the deposit (never more than asked, never another currency). */
export async function creditApi(reference, paid) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM payments WHERE provider = ANY($2) AND provider_ref=$1 AND kind='deposit' FOR UPDATE`, [reference, API_PROVIDERS]);
    const p = rows[0];
    if (!p || p.status !== 'pending' || (paid.currency && paid.currency !== 'GHS')) return;
    const amount = Math.round(Math.min(Number(p.amount), paid.amount ?? Number(p.amount)) * 100) / 100;
    if (!(amount > 0)) return;
    await c.query(`UPDATE payments SET status='success', amount=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1`,
      [p.id, amount, JSON.stringify({ confirmedAt: new Date().toISOString(), via: paid.via || 'webhook', ...(paid.id ? { providerTx: String(paid.id) } : {}) })]);
    const user = await userOf(c, p.user_id);
    out = { payment: p, user, amount, balance: await creditDeposit(c, user, amount, p.id, { method: p.method }) };
  });
  if (out) sendEmail('depositSuccess', out.user, { amount: out.amount, method: methodName(out.payment.method), paymentId: out.payment.id, balance: out.balance, when: new Date() });
  return out;
}

/** A charge failed or was abandoned: close it (no money was taken). */
export async function failApi(reference, reason, raw) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`UPDATE payments SET status='failed', updated_at=now(), details = details || $3::jsonb
      WHERE provider = ANY($2) AND provider_ref=$1 AND kind='deposit' AND status='pending' RETURNING *`,
      [reference, API_PROVIDERS, JSON.stringify({ reason, ...(raw && raw !== reason ? { providerReason: String(raw).slice(0, 200) } : {}) })]);
    if (rows[0]) out = { payment: rows[0], user: await userOf(c, rows[0].user_id) };
  });
  if (out) sendEmail('depositFailed', out.user, { amount: Number(out.payment.amount), method: methodName(out.payment.method), paymentId: out.payment.id, reason });
  return out;
}

/** Ask the provider about a pending deposit (the webhook may be late or missed). */
export async function checkApi(p) {
  const gw = byName(p.provider);
  if (!gw || !gw.enabled() || p.status !== 'pending' || p.kind !== 'deposit') return null;
  const v = await gw.verify(p.provider_ref);
  if (v.error) { console.warn(`[payments] ${p.provider} ${p.provider_ref} status check refused: ${v.error}`); depositHealth(false, v.error); return null; }
  depositHealth(true);
  if (v.status !== 'pending') console.log(`[payments] ${p.provider} ${p.provider_ref} status ${v.status}${v.reason ? ' (' + v.reason + ')' : ''}`);   // monitoring
  if (v.status === 'success') return creditApi(p.provider_ref, { amount: v.amount, currency: v.currency, via: 'verify', id: v.id });
  if (['failed', 'abandoned', 'reversed'].includes(v.status)) await failApi(p.provider_ref, reasonText(v.reason), v.reason);
  // never reached the provider (e.g. the number check was not finished): close it after 30 minutes
  else if (v.status === 'not_found' && ageMin(p.created_at) > 30) await failApi(p.provider_ref, 'The payment was not completed');
  return null;
}

/** A payout finished: paid, or failed and the money goes back to the player. */
export async function payoutResult(reference, ok, reason) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM payments WHERE provider = ANY($2) AND provider_ref=$1 AND kind='withdrawal' FOR UPDATE`, [reference, API_PROVIDERS]);
    const p = rows[0]; if (!p || p.status !== 'pending') return;
    await c.query(`UPDATE payments SET status=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1`,
      [p.id, ok ? 'success' : 'failed', JSON.stringify(ok ? { paidAt: new Date().toISOString() } : { reason })]);
    if (!ok) await move(c, p.user_id, 'refund', Number(p.amount), p.id, { reason: 'payout_failed' });
    out = { payment: p, user: await userOf(c, p.user_id), ok };
  });
  if (out) {
    const d = { amount: Number(out.payment.amount), method: methodName(out.payment.method), paymentId: out.payment.id, account: out.payment.details?.account, when: new Date(), balance: Number(out.user.balance) };
    sendEmail(ok ? 'withdrawalPaid' : 'withdrawalRejected', out.user, ok ? d : { ...d, reason: reason || PAYOUT_FAILED });
  }
  return out;
}

/** Ask the provider about a payout we sent (providers with a status call: Moolre). A payout the provider has no
 *  record of 15 minutes later was never sent: it goes back to the admin queue as a manual payout. */
export async function checkPayout(p) {
  const gw = byName(p.provider);
  if (!gw || !gw.enabled() || !gw.payoutStatus || p.status !== 'pending' || p.kind !== 'withdrawal') return null;
  const v = await gw.payoutStatus(p.provider_ref);
  if (v.status === 'success') return payoutResult(p.provider_ref, true);
  if (v.status === 'failed') return payoutResult(p.provider_ref, false, PAYOUT_FAILED);
  if (v.status === 'not_found' && ageMin(p.details?.sentAt || p.created_at) > 15)
    await q(`UPDATE payments SET provider='manual', provider_ref=NULL, updated_at=now(), details = details || $3::jsonb WHERE id=$1 AND provider=$2 AND status='pending'`,
      [p.id, p.provider, JSON.stringify({ apiError: `${gw.label} has no record of this payout – it was not sent. Pay it again or reject it.` })]);
  return null;
}

/** Leader-only, every minute: settle API payments whose webhook was missed (deposits and payouts up to 3 days old). */
export async function sweepApi() {
  const on = API_PROVIDERS.filter(n => byName(n).enabled());
  if (!on.length) return;
  const age = Number(process.env.PAYMENTS_SWEEP_AGE_SEC) || 60;   // leave fresh payments to the webhook and the player's screen
  const { rows } = await q(`SELECT * FROM payments WHERE status='pending' AND provider = ANY($1) AND provider_ref IS NOT NULL
    AND updated_at < now() - make_interval(secs => $2) AND created_at > now() - interval '3 days' ORDER BY updated_at LIMIT 20`, [on, age]);
  for (const p of rows) {
    try { await (p.kind === 'deposit' ? checkApi(p) : checkPayout(p)); }
    catch (e) { console.error('[payments] check', p.id, e.message); }
    await q(`UPDATE payments SET updated_at=now() WHERE id=$1 AND status='pending'`, [p.id]);   // next look in a minute or more
  }
}

// older names
export { creditApi as creditPaystack, failApi as failPaystack, checkApi as checkPaystack };
