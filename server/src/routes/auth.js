import { Router } from 'express';
import { ensureAdmins } from '../lib/admins.js';
import { openFor as openNotices } from '../lib/notices.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { getSetting } from '../lib/settings.js';
import { z } from 'zod';
import { q, tx } from '../db/pool.js';
import { hash, verifyHash, sign, requireUser, publicUser } from '../lib/auth.js';
import { issueOtp, checkOtp, issueEmailOtp, checkEmailOtp, smsReady, emailReady } from '../lib/otp.js';
import { sendEmail, notifyAdmins } from '../emails/index.js';
import { agentForCode } from '../lib/agents.js';

// Accounts sign up with a mobile number OR an email address (both verified by a 6-digit code) and log in with
// either. Emails are unique across the site (case-insensitive); phone numbers are unique per country.
const r = Router();
const phoneSchema = z.string().transform(s => s.replace(/\D/g, '').replace(/^0/, '')).refine(s => s.length >= 9 && s.length <= 10, 'bad_phone');
const emailField = z.string().trim().toLowerCase().pipe(z.email().max(120));
const country = z.enum(['NG', 'GH']);
// exactly one of phone / email identifies the player in sign-up, login and reset
const who = { phone: phoneSchema.optional(), email: emailField.optional() };
const oneOf = d => !!d.phone !== !!d.email;

const bad = (res, e) => res.status(400).json({ error: 'invalid', details: e.flatten?.().fieldErrors });
const taken = e => (String(e.constraint || '').includes('email') ? 'email_taken' : 'phone_taken');

// Guessing protection on the signed-out endpoints (codes, passwords). Tight per PHONE NUMBER / EMAIL, generous per IP:
// many players share one mobile-carrier IP, so an IP cap must never block normal sign-ins. Signed-in routes are not
// capped here (the app polls /auth/me). Each route has its own counters.
const idKey = req => {
  const b = req.body || {};
  if (b.email) return 'e:' + String(b.email).trim().toLowerCase();
  return 'p:' + String(b.country || '') + ':' + String(b.phone || '').replace(/\D/g, '').replace(/^(234|233)/, '').replace(/^0/, '');
};
const guard = perId => [
  rateLimit({ windowMs: 15 * 60e3, limit: 1000, keyGenerator: req => ipKeyGenerator(req.ip), standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } }),
  rateLimit({ windowMs: 15 * 60e3, limit: perId, keyGenerator: idKey, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_attempts' } }),
];
const findByEmail = email => q('SELECT * FROM users WHERE lower(email)=$1', [email]).then(r => r.rows[0]);
const findByPhone = (cc, phone) => q('SELECT * FROM users WHERE country=$1 AND phone=$2', [cc, phone]).then(r => r.rows[0]);

// Which sign-up / reset channels can deliver a code right now (the app only offers those)
// Sign-up without a code (default): players open an account with their phone or email and a password straight away.
// SIGNUP_CODE=on brings back the 6-digit code at sign-up. Password resets and email changes always need a code.
export const signupCode = () => String(process.env.SIGNUP_CODE || 'off').toLowerCase() === 'on';
// phone / email: channels that can deliver a code (resets); signup: whether sign-up asks for one
r.get('/methods', (_req, res) => res.json({ phone: smsReady(), email: emailReady(), signupCode: signupCode() }));

// Step 1 of register (or reset): send a code to the phone or the email address
r.post('/otp', guard(6), async (req, res, next) => {
  const p = z.object({ country, ...who, purpose: z.enum(['register', 'reset']).default('register') }).refine(oneOf).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country: cc, phone, email, purpose } = p.data;
  try {
    const u = email ? await findByEmail(email) : await findByPhone(cc, phone);
    if (purpose === 'register' && u) return res.status(409).json({ error: email ? 'email_taken' : 'phone_taken' });
    if (purpose === 'reset' && !u) return res.status(404).json({ error: 'no_account' });
    const devCode = email ? await issueEmailOtp(cc, email, purpose, u ? u.id : null) : await issueOtp(cc, phone, purpose);
    res.json({ ok: true, ...(devCode ? { devCode } : {}) });
  } catch (e) { next(e); }
});

// Step 2 of register: code + password → account
r.post('/register', guard(10), async (req, res, next) => {
  const p = z.object({ country, ...who, code: z.string().length(6).optional(), password: z.string().min(6).max(72), fullName: z.string().max(80).optional(), ref: z.string().max(20).optional(),
    agent: z.string().max(20).optional() }).refine(oneOf).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country: cc, phone, email, code, password, fullName, ref, agent } = p.data;
  try {
    if (signupCode()) {
      const ok = code && (email ? await checkEmailOtp(email, 'register', code) : await checkOtp(cc, phone, 'register', code));
      if (!ok) return res.status(400).json({ error: 'bad_code' });
    }
    const user = await tx(async c => {
      // Sub-agent link (?agent=AG…) or an agent code typed as the referral code: the player is that agent's player
      const agentId = await agentForCode(c, agent || (ref && /^AG/i.test(ref) ? ref : ''), cc);
      // Refer & Earn: a referral code is the friend's public id ("LB10000123" or just the digits), same country only
      const refUid = !agentId && ref && /^\d{6,12}$/.test(ref.replace(/^LB/i, '')) ? Number(ref.replace(/^LB/i, '')) : null;
      const referrer = refUid ? (await c.query('SELECT id FROM users WHERE uid=$1 AND country=$2', [refUid, cc])).rows[0] : null;
      const { rows } = await c.query(
        `INSERT INTO users (uid, country, phone, password_hash, full_name, email, referred_by, agent_id) VALUES (nextval('users_uid_seq'), $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [cc, phone || null, await hash(password), fullName || null, email || null, referrer ? referrer.id : null, agentId],
      );
      return rows[0];
    });
    if (await ensureAdmins(user.id)) user.role = 'admin';   // ADMIN_EMAILS
    res.status(201).json({ token: sign(user), user: publicUser(user) });
    sendEmail('welcome', user);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: taken(e) });
    next(e);
  }
});

// Refer & Earn: the player's code and what it has earned
r.get('/referrals', requireUser, async (req, res, next) => {
  try {
    const [{ rows: f }, { rows: e }, reward] = await Promise.all([
      q(`SELECT count(*)::int AS joined, count(*) FILTER (WHERE ref_paid)::int AS qualified FROM users WHERE referred_by=$1`, [req.user.id]),
      q(`SELECT coalesce(sum(amount),0)::float AS earned FROM transactions WHERE user_id=$1 AND type='referral'`, [req.user.id]),
      getSetting('referral'),
    ]);
    res.json({ code: 'LB' + req.user.uid, joined: f[0].joined, qualified: f[0].qualified, earned: e[0].earned, reward: reward?.[req.user.country] ?? 0 });
  } catch (err) { next(err); }
});

// Pop-ups for the player (lib/notices.js): support's deposit requests and payment outcomes; close one after showing it
r.get('/notices', requireUser, async (req, res, next) => {
  try { res.json({ notices: await openNotices({ query: (t, v) => q(t, v) }, req.user.id) }); } catch (e) { next(e); }
});
r.post('/notices/:id/close', requireUser, async (req, res, next) => {
  if (!/^\d{1,18}$/.test(req.params.id)) return res.status(400).json({ error: 'invalid' });
  try { await q('UPDATE notices SET done_at=now() WHERE id=$1 AND user_id=$2 AND done_at IS NULL', [req.params.id, req.user.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

// Login with mobile number + password (country from the site) or email + password (any country)
r.post('/login', guard(10), async (req, res, next) => {
  const p = z.object({ country: country.optional(), ...who, password: z.string() }).refine(oneOf).refine(d => d.email || d.country).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country: cc, phone, email, password } = p.data;
  try {
    const u = email ? await findByEmail(email) : await findByPhone(cc, phone);
    if (!u || !(await verifyHash(password, u.password_hash))) return res.status(401).json({ error: 'bad_login' });
    if (u.status === 'suspended') return res.status(403).json({ error: 'suspended' });
    if (await ensureAdmins(u.id)) u.role = 'admin';   // ADMIN_EMAILS
    res.json({ token: sign(u), user: publicUser(u) });
  } catch (e) { next(e); }
});

r.post('/reset', guard(10), async (req, res, next) => {
  const p = z.object({ country: country.optional(), ...who, code: z.string().length(6), password: z.string().min(6).max(72) }).refine(oneOf).refine(d => d.email || d.country).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { country: cc, phone, email, code, password } = p.data;
  try {
    const ok = email ? await checkEmailOtp(email, 'reset', code) : await checkOtp(cc, phone, 'reset', code);
    if (!ok) return res.status(400).json({ error: 'bad_code' });
    const { rows } = email
      ? await q('UPDATE users SET password_hash=$2 WHERE lower(email)=$1 RETURNING *', [email, await hash(password)])
      : await q('UPDATE users SET password_hash=$3 WHERE country=$1 AND phone=$2 RETURNING *', [cc, phone, await hash(password)]);
    res.json({ ok: true });
    if (rows[0]) sendEmail('passwordChanged', rows[0], { when: new Date(), ip: req.ip });
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

// Add or change the account email (Me → Email & Password): a code goes to the NEW address and must be
// confirmed, so nobody can claim an email that is not theirs. Used for login, receipts and notifications.
r.post('/email', requireUser, guard(6), async (req, res, next) => {
  const p = z.object({ email: emailField }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid_email' });
  const { email } = p.data;
  try {
    if (email === (req.user.email || '').toLowerCase()) return res.json({ ok: true, unchanged: true, user: publicUser(req.user) });
    const other = await findByEmail(email);
    if (other && other.id !== req.user.id) return res.status(409).json({ error: 'email_taken' });
    const devCode = await issueEmailOtp(req.user.country, email, 'email', req.user.id);
    res.json({ ok: true, sent: true, ...(devCode ? { devCode } : {}) });
  } catch (e) { next(e); }
});
r.post('/email/confirm', requireUser, guard(10), async (req, res, next) => {
  const p = z.object({ email: emailField, code: z.string().length(6) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    if (!(await checkEmailOtp(p.data.email, 'email', p.data.code, req.user.id))) return res.status(400).json({ error: 'bad_code' });
    const { rows } = await q('UPDATE users SET email=$2 WHERE id=$1 RETURNING *', [req.user.id, p.data.email]);
    res.json({ user: publicUser(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_taken' });
    next(e);
  }
});

// ID verification: the player's details + photos of the FRONT and BACK of the ID (back not needed for a passport).
// An admin compares them with the account (admin portal → ID checks) and approves or rejects with a reason.
const PHOTO = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const photo = (dataUrl, side) => {
  const m = PHOTO.exec(String(dataUrl || '')); if (!m) return null;
  const data = Buffer.from(m[2], 'base64');
  if (data.length < 2000 || data.length > 1800000) throw Object.assign(new Error('bad_photo'), { status: 400, side });
  return { side, mime: m[1], data };
};
r.post('/verify', requireUser, async (req, res, next) => {
  const p = z.object({ fullName: z.string().trim().min(3).max(80), dob: z.string().max(20), idType: z.string().max(40), idNumber: z.string().trim().min(5).max(30),
    front: z.string().max(2600000), back: z.string().max(2600000).optional() }).safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { front, back, ...kyc } = p.data;
  try {
    const docs = [photo(front, 'front'), back ? photo(back, 'back') : null].filter(Boolean);
    if (!docs.find(d => d.side === 'front')) return res.status(400).json({ error: 'photo_front' });
    if (!/passport/i.test(kyc.idType) && !docs.find(d => d.side === 'back')) return res.status(400).json({ error: 'photo_back' });
    await tx(async c => {
      await c.query('DELETE FROM kyc_documents WHERE user_id=$1', [req.user.id]);
      for (const d of docs) await c.query('INSERT INTO kyc_documents (user_id, side, mime, data) VALUES ($1,$2,$3,$4)', [req.user.id, d.side, d.mime, d.data]);
      await c.query(`UPDATE users SET full_name=$2, limits = limits || jsonb_build_object('kyc', $3::jsonb) WHERE id=$1`,
        [req.user.id, kyc.fullName, JSON.stringify({ ...kyc, photos: docs.map(d => d.side), submittedAt: new Date().toISOString(), status: 'pending' })]);
    });
    res.json({ ok: true, status: 'pending' });
    sendEmail('kycSubmitted', { ...req.user, full_name: kyc.fullName });
    notifyAdmins('kyc', { id: req.user.id, amount: 0, method: kyc.idType }, { ...req.user, full_name: kyc.fullName }, { account: kyc.idType }).catch(() => {});
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message, side: e.side }); next(e); }
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
