// Payment provider callbacks (public, signature-checked). Answer 200 at once; the work is idempotent.
import { Router } from 'express';
import * as paystack from '../payments/paystack.js';
import { creditPaystack, failPaystack, payoutResult } from '../payments/flows.js';

const r = Router();

r.post('/paystack/webhook', async (req, res) => {
  if (!paystack.validSignature(req.rawBody, req.headers['x-paystack-signature'])) return res.status(401).json({ error: 'bad_signature' });
  res.sendStatus(200);
  const { event, data = {} } = req.body || {};
  try {
    if (event === 'charge.success') await creditPaystack(data.reference, { amount: Number(data.amount) / 100, currency: data.currency, via: 'webhook' });
    else if (event === 'charge.failed') await failPaystack(data.reference, data.gateway_response || 'The payment was not approved');
    else if (event === 'transfer.success') await payoutResult(data.reference, true);
    else if (event === 'transfer.failed' || event === 'transfer.reversed') await payoutResult(data.reference, false, data.reason || 'The transfer did not go through. The money is back in your balance.');
  } catch (e) { req.log?.error(e, 'paystack webhook'); }
});

export default r;
