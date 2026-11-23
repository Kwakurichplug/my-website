// Payment provider callbacks (public, signature-checked). Answer 200 at once; the work is idempotent.
import { Router } from 'express';
import { q } from '../db/pool.js';
import * as paystack from '../payments/paystack.js';
import * as moolre from '../payments/moolre.js';
import { creditApi, failApi, checkApi, checkPayout, payoutResult } from '../payments/flows.js';
import { checkByRef as checkWalletPayout } from '../lib/walletPayouts.js';

const r = Router();

r.post('/paystack/webhook', async (req, res) => {
  if (!paystack.validSignature(req.rawBody, req.headers['x-paystack-signature'])) return res.status(401).json({ error: 'bad_signature' });
  res.sendStatus(200);
  const { event, data = {} } = req.body || {};
  try {
    if (event === 'charge.success') await creditApi(data.reference, { amount: Number(data.amount) / 100, currency: data.currency, via: 'webhook' });
    else if (event === 'charge.failed') await failApi(data.reference, 'The payment was not approved', data.gateway_response);
    else if (event === 'transfer.success') await payoutResult(data.reference, true);
    else if (event === 'transfer.failed' || event === 'transfer.reversed') await payoutResult(data.reference, false, data.reason || 'The transfer did not go through. The money is back in your balance.');
  } catch (e) { req.log?.error(e, 'paystack webhook'); }
});

// Moolre: payment.succeeded / payment.failed / payout.succeeded / payout.failed (+ webhook.test). Signed with the
// wallet's secret (X-Moolre-Signature; older deliveries carry data.secret). Even a signed webhook never credits
// anything by itself: it makes us ask Moolre's status call about that payment, and only that answer counts.
r.post('/moolre/webhook', async (req, res) => {
  const body = req.body || {}, data = body.data && typeof body.data === 'object' ? body.data : {};
  const secret = moolre.webhookSecret();
  if (secret && !moolre.validSignature(req.rawBody, req.get('x-moolre-signature'), secret) && !moolre.sameSecret(data.secret, secret))
    return res.status(401).json({ error: 'bad_signature' });
  res.sendStatus(200);
  const ref = data.externalref != null ? String(data.externalref).slice(0, 80) : '';
  if (!ref || !moolre.enabled()) return;
  try {
    const { rows } = await q(`SELECT * FROM payments WHERE provider='moolre' AND provider_ref=$1 AND status='pending'`, [ref]);
    const p = rows[0];
    if (!p) { if (ref.startsWith('lbo-')) await checkWalletPayout(ref); return; }   // an admin's Send money transfer
    if (p.kind === 'deposit') await checkApi(p); else await checkPayout(p);
  } catch (e) { req.log?.error(e, 'moolre webhook'); }
});

export default r;
