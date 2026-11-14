import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';
import { sendEmail } from '../emails/index.js';

const r = Router();
r.use(requireUser);

const MIN = { NG: 100, GH: 1 };
const METHODS = ['card', 'bank_transfer', 'ussd', 'mobile_money', 'opay', 'palmpay'];

r.get('/', (req, res) => res.json({ balance: Number(req.user.balance), currency: req.user.country === 'GH' ? 'GHS' : 'NGN' }));

r.get('/transactions', async (req, res, next) => {
  const filter = req.query.filter; // in | out
  try {
    const { rows } = await q(
      `SELECT id, type, amount, balance_after, ref, created_at FROM transactions WHERE user_id=$1
       ${filter === 'in' ? 'AND amount > 0' : filter === 'out' ? 'AND amount < 0' : ''} ORDER BY created_at DESC LIMIT 200`, [req.user.id]);
    res.json({ transactions: rows.map(t => ({ id: t.id, type: t.type, amount: t.amount, balance: t.balance_after, ref: t.ref, at: t.created_at })) });
  } catch (e) { next(e); }
});

// Deposit. Until a payment provider is wired (Paystack/Flutterwave), PAYMENTS_MODE=demo credits instantly.
r.post('/deposit', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive(), method: z.enum(METHODS).default('card') }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { amount, method } = p.data;
  if (amount < MIN[req.user.country]) return res.status(400).json({ error: 'below_minimum', min: MIN[req.user.country] });
  const lim = req.user.limits?.deposit?.amount;
  try {
    if (lim) {
      const { rows } = await q(`SELECT coalesce(sum(amount),0)::numeric AS s FROM transactions WHERE user_id=$1 AND type='deposit' AND created_at > now() - interval '1 day'`, [req.user.id]);
      if (Number(rows[0].s) + amount > lim) return res.status(400).json({ error: 'deposit_limit', limit: lim });
    }
    const demo = (process.env.PAYMENTS_MODE || 'demo') === 'demo';
    const out = await tx(async c => {
      const { rows } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, provider, status) VALUES ($1,'deposit',$2,$3,$4,$5) RETURNING id`,
        [req.user.id, amount, method, demo ? 'demo' : 'pending', demo ? 'success' : 'pending']);
      const pid = rows[0].id;
      const balance = demo ? await move(c, req.user.id, 'deposit', amount, pid, { method }) : Number(req.user.balance);
      return { paymentId: pid, balance, status: demo ? 'success' : 'pending' };
    });
    res.json(out);
    if (out.status === 'success') sendEmail('depositSuccess', req.user, { amount, method, paymentId: out.paymentId, balance: out.balance, when: new Date() });
  } catch (e) { next(e); }
});

r.post('/withdraw', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive(), method: z.enum(METHODS).default('bank_transfer'), details: z.record(z.string(), z.any()).default({}) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { amount, method, details } = p.data;
  if (amount < MIN[req.user.country]) return res.status(400).json({ error: 'below_minimum', min: MIN[req.user.country] });
  if (!req.user.verified && (process.env.REQUIRE_KYC || 'false') === 'true') return res.status(403).json({ error: 'kyc_required' });
  try {
    // Funds leave the balance now; admin approves or rejects (rejection refunds).
    const out = await tx(async c => {
      const { rows } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, status, details) VALUES ($1,'withdrawal',$2,$3,'pending',$4) RETURNING id`, [req.user.id, amount, method, details]);
      const balance = await debit(c, req.user.id, 'withdrawal', amount, rows[0].id, { method });
      return { paymentId: rows[0].id, balance, status: 'pending' };
    });
    res.json(out);
    sendEmail('withdrawalRequested', req.user, { amount, method, paymentId: out.paymentId, account: details.account, when: new Date() });
  } catch (e) { next(e); }
});

r.get('/payments', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT id, kind, amount, method, status, created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
    res.json({ payments: rows });
  } catch (e) { next(e); }
});

export default r;
