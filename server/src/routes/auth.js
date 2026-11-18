import { Router } from 'express';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { hash, verifyHash, sign, requireUser, publicUser } from '../lib/auth.js';
import { issueOtp, checkOtp } from '../lib/otp.js';
import { sendEmail } from '../emails/index.js';

const r = Router();
const phoneSchema = z.string().transform(s => s.replace(/\D/g, '').replace(/^0/, '')).refine(s => s.length >= 9 && s.length <= 10, 'bad_phone');
const base = { country: z.enum(['NG', 'GH']), phone: phoneSchema };

const bad = (res, e) => res.status(400).json({ error: 'invalid', details: e.flatten?.().fieldErrors });

// Step 1 of register: send a code
r.post('/otp', async (req, res, next) => {
  const p = z.object({ ...base, purpose: z.enum(['register', 'reset']).default('register') }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country, phone, purpose } = p.data;
  try {
    const { rows } = await q('SELECT 1 FROM users WHERE country=$1 AND phone=$2', [country, phone]);
    if (purpose === 'register' && rows[0]) return res.status(409).json({ error: 'phone_taken' });
    if (purpose === 'reset' && !rows[0]) return res.status(404).json({ error: 'no_account' });
    const devCode = await issueOtp(country, phone, purpose);
    res.json({ ok: true, ...(devCode ? { devCode } : {}) });
  } catch (e) { next(e); }
});

// Step 2 of register: code + password → account
r.post('/register', async (req, res, next) => {
  const p = z.object({ ...base, code: z.string().length(6), password: z.string().min(6).max(72), fullName: z.string().max(80).optional(), email: z.string().email().max(120).optional() }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country, phone, code, password, fullName, email } = p.data;
  try {
    if (!(await checkOtp(country, phone, 'register', code))) return res.status(400).json({ error: 'bad_code' });
    const user = await tx(async c => {
      const { rows } = await c.query(
        `INSERT INTO users (uid, country, phone, password_hash, full_name, email) VALUES (nextval('users_uid_seq'), $1, $2, $3, $4, $5) RETURNING *`,
        [country, phone, await hash(password), fullName || null, email || null],
      );
      return rows[0];
    });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
    sendEmail('welcome', user);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'phone_taken' });
    next(e);
  }
});

r.post('/login', async (req, res, next) => {
  const p = z.object({ ...base, password: z.string() }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country, phone, password } = p.data;
  try {
    const { rows } = await q('SELECT * FROM users WHERE country=$1 AND phone=$2', [country, phone]);
    const u = rows[0];
    if (!u || !(await verifyHash(password, u.password_hash))) return res.status(401).json({ error: 'bad_login' });
    if (u.status === 'suspended') return res.status(403).json({ error: 'suspended' });
    res.json({ token: sign(u), user: publicUser(u) });
  } catch (e) { next(e); }
});

r.post('/reset', async (req, res, next) => {
  const p = z.object({ ...base, code: z.string().length(6), password: z.string().min(6).max(72) }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country, phone, code, password } = p.data;
  try {
    if (!(await checkOtp(country, phone, 'reset', code))) return res.status(400).json({ error: 'bad_code' });
    await q('UPDATE users SET password_hash=$3 WHERE country=$1 AND phone=$2', [country, phone, await hash(password)]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

r.post('/password', requireUser, async (req, res, next) => {
  const p = z.object({ current: z.string(), password: z.string().min(6).max(72) }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  try {
    const { rows } = await q('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!(await verifyHash(p.data.current, rows[0].password_hash))) return res.status(401).json({ error: 'bad_password' });
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, await hash(p.data.password)]);
    res.json({ ok: true });
    sendEmail('passwordChanged', req.user, { when: new Date(), ip: req.ip });
  } catch (e) { next(e); }
});

r.post('/verify', requireUser, async (req, res, next) => {
  // KYC placeholder: stores the submission; a KYC provider (Smile ID etc.) will set verified=true later.
  const p = z.object({ fullName: z.string().min(3).max(80), dob: z.string(), idType: z.string(), idNumber: z.string().min(5).max(30) }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  try {
    await q(`UPDATE users SET full_name=$2, limits = limits || jsonb_build_object('kyc', $3::jsonb) WHERE id=$1`, [req.user.id, p.data.fullName, JSON.stringify({ ...p.data, submittedAt: new Date().toISOString(), status: 'pending' })]);
    res.json({ ok: true, status: 'pending' });
    sendEmail('kycSubmitted', req.user);
  } catch (e) { next(e); }
});

r.post('/limits', requireUser, async (req, res, next) => {
  const p = z.object({ period: z.enum(['Daily', 'Weekly', 'Monthly']).optional(), amount: z.number().min(0).optional(), reminder: z.string().optional(), selfExclude: z.string().optional() }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  try {
    const patch = { deposit: { period: p.data.period, amount: p.data.amount }, reminder: p.data.reminder };
    if (p.data.selfExclude) patch.selfExclude = { until: p.data.selfExclude, at: new Date().toISOString() };
    await q('UPDATE users SET limits = limits || $2::jsonb WHERE id=$1', [req.user.id, JSON.stringify(patch)]);
    res.json({ ok: true });
    if (p.data.selfExclude) sendEmail('selfExclusion', req.user, { until: p.data.selfExclude }); else sendEmail('limitsUpdated', req.user, { period: p.data.period, limit: p.data.amount, reminder: p.data.reminder });
  } catch (e) { next(e); }
});

export default r;
