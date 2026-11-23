import { closeDepositRequests } from '../lib/notices.js';
import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';
import { creditDeposit, bonusesOf, ladderOf } from '../lib/bonus.js';
import { getSetting } from '../lib/settings.js';
import { sendEmail } from '../emails/index.js';
import { options, demoMode, methodName, referenceOf, NETWORKS } from '../lib/payments.js';
import * as paystack from '../payments/paystack.js';
import { creditPaystack, failPaystack, checkPaystack } from '../payments/flows.js';

const r = Router();
r.use(requireUser);

const MIN = { NG: 100, GH: 1 };   // transfers between players
const METHODS = ['card', 'bank_transfer', 'ussd', 'mobile_money', 'opay', 'palmpay'];
const fail = (res, status, error, extra) => res.status(status).json({ error, ...extra });
const phone9 = z.string().transform(s => s.replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '')).refine(s => s.length === 9, 'bad_phone');

// what this player can use to pay in and out right now (country, limits, bank / MoMo details, their reference)
r.get('/options', async (req, res, next) => { try { res.json({ ...(await options(req.user)), ladder: await ladderOf(req.user) }); } catch (e) { next(e); } });

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

// Deposit – only through a way of paying that is open for the player's country (GET /options):
//   manual (Nigeria bank transfer, Ghana MoMo without the API): recorded as pending with the player's reference;
//          an admin confirms the money arrived and the deposit is credited (admin.js → approve).
//   api    (Ghana MoMo with PAYSTACK_SECRET_KEY): the charge starts now; the player approves it on their phone
//          (or types the code Telecel sends: POST /deposit/:id/otp); the webhook or GET /payments/:id credits it.
//   demo   (automated tests only, never in production): credited at once.
r.post('/deposit', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive().max(1e8), method: z.enum(METHODS),
    details: z.object({ phone: z.string().max(15).optional(), network: z.string().max(20).optional(), sender: z.string().trim().max(80).optional(), bank: z.string().max(60).optional() }).optional() }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'invalid');
  const { method } = p.data, amount = Math.round(p.data.amount * 100) / 100, details = p.data.details || {};
  try {
    const opt = await options(req.user), way = opt.deposit.find(x => x.method === method), demo = demoMode();
    if (!way && !demo) return fail(res, 400, 'method_closed');
    if (amount < opt.limits.minDeposit) return fail(res, 400, 'below_minimum', { min: opt.limits.minDeposit });
    if (amount > opt.limits.maxDeposit) return fail(res, 400, 'above_maximum', { max: opt.limits.maxDeposit });
    const lim = req.user.limits?.deposit?.amount;
    if (lim) {
      const { rows } = await q(`SELECT coalesce(sum(amount),0)::numeric AS s FROM payments WHERE user_id=$1 AND kind='deposit' AND status IN ('success','pending') AND created_at > now() - interval '1 day'`, [req.user.id]);
      if (Number(rows[0].s) + amount > lim) return fail(res, 400, 'deposit_limit', { limit: lim });
    }
    const momo = method === 'mobile_money';
    const ph = momo && phone9.safeParse(details.phone || req.user.phone || '');
    if (momo && !demo && (!ph.success || !NETWORKS[details.network])) return fail(res, 400, 'momo_details');
    const mode = demo ? 'demo' : way.mode;

    if (mode === 'demo') {
      const out = await tx(async c => {
        const { rows } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, provider, status, details) VALUES ($1,'deposit',$2,$3,'demo','success',$4) RETURNING id`, [req.user.id, amount, method, details]);
        await closeDepositRequests(c, req.user.id);
        return { paymentId: rows[0].id, balance: await creditDeposit(c, req.user, amount, rows[0].id, { method }), status: 'success' };
      });
      res.json(out);
      return sendEmail('depositSuccess', req.user, { amount, method: methodName(method), paymentId: out.paymentId, balance: out.balance, when: new Date() });
    }

    if (mode === 'manual') {
      if (!momo && (details.sender || '').length < 3) return fail(res, 400, 'sender_required');
      const { rows: open } = await q(`SELECT count(*)::int AS n FROM payments WHERE user_id=$1 AND kind='deposit' AND provider='manual' AND status='pending'`, [req.user.id]);
      if (open[0].n >= 3) return fail(res, 409, 'too_many_pending');
      const reference = referenceOf(req.user);
      const keep = momo ? { phone: ph.data, network: details.network, sender: details.sender || null } : { sender: details.sender };
      const { rows } = await q(`INSERT INTO payments (user_id, kind, amount, method, provider, provider_ref, status, details) VALUES ($1,'deposit',$2,$3,'manual',$4,'pending',$5) RETURNING id`,
        [req.user.id, amount, method, reference, keep]);
      await closeDepositRequests({ query: (t, v) => q(t, v) }, req.user.id);
      res.json({ status: 'pending', paymentId: rows[0].id, reference, balance: Number(req.user.balance), mode: 'manual',
        next: { message: `We are checking your ${momo ? 'MoMo transfer' : 'transfer'}. Your balance updates as soon as it is confirmed – ${way.eta}.`, rows: [['Reference', reference]] } });
      return sendEmail('depositReceived', req.user, { amount, method: methodName(method), paymentId: rows[0].id, reference, when: new Date() });
    }

    // api: Ghana Mobile Money through Paystack
    const { rows } = await q(`INSERT INTO payments (user_id, kind, amount, method, provider, status, details) VALUES ($1,'deposit',$2,$3,'paystack','pending',$4) RETURNING id`,
      [req.user.id, amount, method, { phone: ph.data, network: details.network }]);
    const id = rows[0].id, reference = 'LB' + String(id).replace(/-/g, '');
    await q('UPDATE payments SET provider_ref=$2 WHERE id=$1', [id, reference]);
    let ch;
    try { ch = await paystack.chargeMomo({ reference, amount, email: req.user.email || `player${req.user.uid}@letbetafrika.online`, phone: ph.data, network: details.network }); }
    catch (e) { await failPaystack(reference, e.message); return fail(res, 502, 'payment_failed', { message: e.message }); }
    return res.json(await chargeAnswer(req.user, id, reference, ch));
  } catch (e) { next(e); }
});

/** Turn a Paystack charge state into the app's answer: credited, approve on your phone, type the code, or failed. */
async function chargeAnswer(user, id, reference, ch) {
  if (ch.status === 'success') {
    const done = await creditPaystack(reference, { via: 'charge' });
    return { status: 'success', paymentId: id, balance: done ? done.balance : Number(user.balance) };
  }
  if (ch.status === 'failed') { await failPaystack(reference, ch.display || 'The payment was declined'); return { status: 'failed', paymentId: id, message: ch.display || 'The payment was declined' }; }
  if (ch.status === 'send_otp') return { status: 'pending', paymentId: id, balance: Number(user.balance), next: { otp: true, message: ch.display || 'Enter the code sent to your phone' } };
  return { status: 'pending', paymentId: id, balance: Number(user.balance), next: { poll: true, message: ch.display || 'Approve the payment prompt on your phone with your MoMo PIN.' } };
}

// Telecel Cash: the code the player receives
r.post('/deposit/:id/otp', async (req, res, next) => {
  const p = z.object({ otp: z.string().trim().min(3).max(12) }).safeParse(req.body);
  if (!p.success) return fail(res, 400, 'invalid');
  try {
    const { rows } = await q(`SELECT * FROM payments WHERE id=$1 AND user_id=$2 AND kind='deposit' AND provider='paystack'`, [req.params.id, req.user.id]);
    const pay = rows[0]; if (!pay) return fail(res, 404, 'not_found');
    if (pay.status !== 'pending') return res.json({ status: pay.status, paymentId: pay.id, balance: Number(req.user.balance) });
    let ch; try { ch = await paystack.submitOtp(pay.provider_ref, p.data.otp); } catch (e) { return fail(res, 400, 'bad_code', { message: e.message }); }
    res.json(await chargeAnswer(req.user, pay.id, pay.provider_ref, ch));
  } catch (e) { next(e); }
});

// One payment's status; a pending API charge is checked with Paystack (at most every 8 s) in case the webhook is late
const lastCheck = new Map();
r.get('/payments/:id', async (req, res, next) => {
  try {
    const one = async () => (await q('SELECT id, kind, amount, method, provider, status, created_at, updated_at FROM payments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    let pay = await one(); if (!pay) return fail(res, 404, 'not_found');
    if (pay.status === 'pending' && pay.provider === 'paystack' && paystack.enabled() && Date.now() - (lastCheck.get(pay.id) || 0) > 8000) {
      lastCheck.set(pay.id, Date.now());
      const full = (await q('SELECT * FROM payments WHERE id=$1', [pay.id])).rows[0];
      await checkPaystack(full).catch(() => {});
      pay = await one();
    }
    const bal = (await q('SELECT balance FROM users WHERE id=$1', [req.user.id])).rows[0].balance;
    res.json({ payment: pay, balance: Number(bal) });
  } catch (e) { next(e); }
});

r.get('/bonuses', async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [req.user.id]);
    res.json({ bonuses: await bonusesOf(req.user.id), rules: await getSetting('welcome_bonus'), eligible: rows[0].n === 0, ladder: await ladderOf(req.user) });
  } catch (e) { next(e); }
});

// Withdraw – Nigeria to a bank account, Ghana to Mobile Money. The money leaves the balance now and an admin pays it
// (manually, or for Ghana through the payment API) or rejects it (the money goes back).
r.post('/withdraw', async (req, res, next) => {
  const p = z.object({ amount: z.number().positive().max(1e8), method: z.enum(METHODS).default('bank_transfer'), details: z.record(z.string(), z.any()).default({}) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { method } = p.data, amount = Math.round(p.data.amount * 100) / 100;
  if (!req.user.verified && (process.env.REQUIRE_KYC || 'false') === 'true') return res.status(403).json({ error: 'kyc_required' });
  let details;
  try {
    const opt = await options(req.user);
    if (!opt.withdraw.some(x => x.method === method) && !demoMode()) return res.status(400).json({ error: 'method_closed' });
    if (amount < opt.limits.minWithdraw) return res.status(400).json({ error: 'below_minimum', min: opt.limits.minWithdraw });
    if (amount > opt.limits.maxWithdraw) return res.status(400).json({ error: 'above_maximum', max: opt.limits.maxWithdraw });
    const d = p.data.details, name = String(d.name || req.user.full_name || '').trim().slice(0, 80);
    if (method === 'mobile_money') {
      const ph = phone9.safeParse(String(d.phone || '')), net = String(d.network || '').toLowerCase();
      if (!ph.success || !NETWORKS[net]) return res.status(400).json({ error: 'momo_details' });
      details = { phone: ph.data, network: net, name, account: `${NETWORKS[net]} · 0${ph.data}` };
    } else {
      const acct = String(d.acct || '').replace(/\D/g, ''), bank = String(d.bank || '').trim().slice(0, 60);
      if (!bank || acct.length < 10 || acct.length > 16 || name.length < 3) return res.status(400).json({ error: 'bank_details' });
      details = { bank, acct, name, account: `${bank} · ${acct} · ${name}` };
    }
    // Funds leave the balance now; admin approves or rejects (rejection refunds).
    const out = await tx(async c => {
      const { rows } = await c.query(`INSERT INTO payments (user_id, kind, amount, method, provider, status, details) VALUES ($1,'withdrawal',$2,$3,'manual','pending',$4) RETURNING id`, [req.user.id, amount, method, details]);
      const balance = await debit(c, req.user.id, 'withdrawal', amount, rows[0].id, { method });
      return { paymentId: rows[0].id, balance, status: 'pending' };
    });
    res.json(out);
    sendEmail('withdrawalRequested', req.user, { amount, method: methodName(method), paymentId: out.paymentId, account: details.account, when: new Date() });
  } catch (e) { next(e); }
});

// Send money to another player in the same country (same currency), found by mobile number or email.
// Instant, free, both sides go through the ledger.
r.post('/transfer', async (req, res, next) => {
  const p = z.object({
    phone: z.string().transform(s => s.replace(/\D/g, '').replace(/^(234|233)/, '').replace(/^0/, '')).refine(s => s.length >= 9 && s.length <= 10, 'bad_phone').optional(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(120)).optional(),
    amount: z.number().positive(),
    note: z.string().max(40).optional(),
  }).refine(d => !!d.phone !== !!d.email).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  const { phone, email, amount, note } = p.data;
  if (amount < MIN[req.user.country]) return res.status(400).json({ error: 'below_minimum', min: MIN[req.user.country] });
  try {
    const { rows } = email
      ? await q('SELECT id, phone, email FROM users WHERE country=$1 AND lower(email)=$2 AND status=$3', [req.user.country, email, 'active'])
      : await q('SELECT id, phone, email FROM users WHERE country=$1 AND phone=$2 AND status=$3', [req.user.country, phone, 'active']);
    if (rows[0] && rows[0].id === req.user.id) return res.status(400).json({ error: 'self_transfer' });
    if (!rows[0]) return res.status(404).json({ error: 'no_account' });
    const ref = 'TF' + Date.now().toString(36).toUpperCase();
    const to = phone || email, from = req.user.phone || req.user.email;
    const balance = await tx(async c => {
      const b = await debit(c, req.user.id, 'transfer_out', amount, ref, { to, note });
      await move(c, rows[0].id, 'transfer_in', amount, ref, { from, note });
      return b;
    });
    res.json({ ok: true, ref, balance });
  } catch (e) { next(e); }
});

// A screenshot of the transfer for a manual deposit that is still being checked – the admin sees it before crediting.
// A data URL (JPEG / PNG / WebP, up to 2 MB – the app shrinks photos first); the file's own bytes must match its type.
const IMG = { 'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'image/png': b => b.subarray(1, 4).toString('latin1') === 'PNG',
  'image/webp': b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' };
r.post('/payments/:id/proof', async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return fail(res, 404, 'not_found');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body || {}).image || ''));
  const buf = m && Buffer.from(m[2], 'base64');
  if (!m || buf.length < 200 || buf.length > 2_000_000 || !IMG[m[1]](buf)) return fail(res, 400, 'bad_image');
  try {
    const { rows } = await q(`SELECT id FROM payments WHERE id=$1 AND user_id=$2 AND kind='deposit' AND provider='manual' AND status='pending'`, [req.params.id, req.user.id]);
    if (!rows[0]) return fail(res, 404, 'not_found');
    await q(`INSERT INTO payment_proofs (payment_id, user_id, mime, data, size) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (payment_id) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data, size=EXCLUDED.size, created_at=now()`, [rows[0].id, req.user.id, m[1], buf, buf.length]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get('/payments', async (req, res, next) => {
  try {
    const { rows } = await q(`SELECT id, kind, amount, method, provider, status, created_at, details->>'reason' AS reason,
      EXISTS (SELECT 1 FROM payment_proofs x WHERE x.payment_id = payments.id) AS proof FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
    res.json({ payments: rows });
  } catch (e) { next(e); }
});

export default r;
