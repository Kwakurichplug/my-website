// Money in and out through the payment API, exactly once: webhooks repeat and our own checks can race them, so
// every change locks the payment row and only acts while it is still pending.
import { tx } from '../db/pool.js';
import { creditDeposit } from '../lib/bonus.js';
import { move } from '../lib/wallet.js';
import { sendEmail } from '../emails/index.js';
import { methodName } from '../lib/payments.js';
import * as paystack from './paystack.js';
import { notify, closeDepositRequests } from '../lib/notices.js';

const userOf = async (c, id) => (await c.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];

/** A charge succeeded: credit the deposit (never more than asked, never another currency). */
export async function creditPaystack(reference, paid) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM payments WHERE provider='paystack' AND provider_ref=$1 AND kind='deposit' FOR UPDATE`, [reference]);
    const p = rows[0];
    if (!p || p.status !== 'pending' || (paid.currency && paid.currency !== 'GHS')) return;
    const amount = Math.round(Math.min(Number(p.amount), paid.amount ?? Number(p.amount)) * 100) / 100;
    if (!(amount > 0)) return;
    await c.query(`UPDATE payments SET status='success', amount=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1`,
      [p.id, amount, JSON.stringify({ confirmedAt: new Date().toISOString(), via: paid.via || 'webhook' })]);
    const user = await userOf(c, p.user_id);
    out = { payment: p, user, amount, balance: await creditDeposit(c, user, amount, p.id, { method: p.method }) };
    await closeDepositRequests(c, p.user_id);
  });
  if (out) sendEmail('depositSuccess', out.user, { amount: out.amount, method: methodName(out.payment.method), paymentId: out.payment.id, balance: out.balance, when: new Date() });
  return out;
}

/** A charge failed or was abandoned: close it (no money was taken). */
export async function failPaystack(reference, reason) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`UPDATE payments SET status='failed', updated_at=now(), details = details || $2::jsonb
      WHERE provider='paystack' AND provider_ref=$1 AND kind='deposit' AND status='pending' RETURNING *`, [reference, JSON.stringify({ reason })]);
    if (rows[0]) out = { payment: rows[0], user: await userOf(c, rows[0].user_id) };
  });
  if (out) sendEmail('depositFailed', out.user, { amount: Number(out.payment.amount), method: methodName(out.payment.method), paymentId: out.payment.id, reason });
  return out;
}

/** Ask Paystack about a pending charge (the webhook may be late or missed). */
export async function checkPaystack(p) {
  const v = await paystack.verify(p.provider_ref);
  if (v.status === 'success') return creditPaystack(p.provider_ref, { amount: v.amount, currency: v.currency, via: 'verify' });
  if (['failed', 'abandoned', 'reversed'].includes(v.status)) await failPaystack(p.provider_ref, 'The payment was not approved');
  return null;
}

/** A payout finished: paid, or failed and the money goes back to the player. */
export async function payoutResult(reference, ok, reason) {
  let out = null;
  await tx(async c => {
    const { rows } = await c.query(`SELECT * FROM payments WHERE provider='paystack' AND provider_ref=$1 AND kind='withdrawal' FOR UPDATE`, [reference]);
    const p = rows[0]; if (!p || p.status !== 'pending') return;
    await c.query(`UPDATE payments SET status=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1`,
      [p.id, ok ? 'success' : 'failed', JSON.stringify(ok ? { paidAt: new Date().toISOString() } : { reason })]);
    if (!ok) await move(c, p.user_id, 'refund', Number(p.amount), p.id, { reason: 'payout_failed' });
    await notify(c, p.user_id, ok ? 'withdrawal_paid' : 'withdrawal_rejected', { amount: Number(p.amount), method: methodName(p.method), account: p.details?.account || null,
      reason: ok ? null : 'The transfer did not go through. The money is back in your balance.', paymentId: p.id });
    out = { payment: p, user: await userOf(c, p.user_id), ok };
  });
  if (out) {
    const d = { amount: Number(out.payment.amount), method: methodName(out.payment.method), paymentId: out.payment.id, account: out.payment.details?.account, when: new Date(), balance: Number(out.user.balance) };
    sendEmail(ok ? 'withdrawalPaid' : 'withdrawalRejected', out.user, ok ? d : { ...d, reason: reason || 'The transfer did not go through. The money is back in your balance.' });
  }
  return out;
}
