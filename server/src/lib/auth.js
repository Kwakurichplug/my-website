import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { q } from '../db/pool.js';

const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const TTL = '7d';

export const hash = pw => bcrypt.hash(pw, 10);
export const verifyHash = (pw, h) => bcrypt.compare(pw, h);

export const sign = user => jwt.sign({ sub: user.id, role: user.role, cc: user.country }, SECRET, { expiresIn: TTL });

/** Attach req.user when a valid bearer token is present; never fails on its own. */
export async function attachUser(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, SECRET);
    const { rows } = await q('SELECT id, uid, country, phone, email, full_name, verified, role, status, balance, limits FROM users WHERE id = $1', [sub]);
    if (rows[0] && rows[0].status !== 'suspended') req.user = rows[0];
  } catch { /* bad token = anonymous */ }
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'login_required' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'admin_only' });
  next();
}

export const publicUser = u => ({
  id: u.id, uid: u.uid, country: u.country, phone: u.phone, email: u.email, fullName: u.full_name,
  verified: u.verified, role: u.role, status: u.status, balance: Number(u.balance), limits: u.limits || {},
});
