// The first admins: accounts whose email is listed in ADMIN_EMAILS (comma list) get the admin role – at start-up
// and when they sign up or log in. More admins can then be added from the admin portal (Players → Make admin).
// ADMIN_PASSWORD (Railway variable, optional): the first ADMIN_EMAILS account is created with it if it does not exist,
// so the owner can sign in to /admin.html straight away. It is applied again only when ADMIN_PASSWORD itself changes,
// so a password changed later in the app (Me → Email & Password) is kept across restarts.
import { createHmac } from 'node:crypto';
import { q } from '../db/pool.js';
import { hash } from './auth.js';
import { getSetting, setSetting } from './settings.js';

export const adminEmails = () => String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export async function ensureAdmins(userId) {
  const list = adminEmails(); if (!list.length) return 0;
  const { rowCount } = await q(`UPDATE users SET role='admin' WHERE role <> 'admin' AND lower(email) = ANY($1::text[]) ${userId ? 'AND id=$2' : ''}`, userId ? [list, userId] : [list]);
  return rowCount;
}

export async function bootstrapAdmin() {
  const email = adminEmails()[0], pw = String(process.env.ADMIN_PASSWORD || '');
  if (!email || pw.length < 8) return 'off';
  const mark = createHmac('sha256', String(process.env.JWT_SECRET || 'letbet')).update(email + '\n' + pw).digest('hex');
  const { rows } = await q('SELECT id FROM users WHERE lower(email)=$1 ORDER BY created_at LIMIT 1', [email]);
  if (!rows[0]) {
    const cc = String(process.env.ADMIN_COUNTRY || 'GH').toUpperCase() === 'NG' ? 'NG' : 'GH';
    await q(`INSERT INTO users (uid, country, phone, password_hash, full_name, email, role) VALUES (nextval('users_uid_seq'), $1, NULL, $2, 'LetBetAfrika Admin', $3, 'admin')`, [cc, await hash(pw), email]);
  } else if (((await getSetting('admin_bootstrap')) || {}).mark !== mark) {
    await q(`UPDATE users SET password_hash=$2, role='admin', status='active' WHERE id=$1`, [rows[0].id, await hash(pw)]);
  } else return 'kept';
  await setSetting('admin_bootstrap', { mark, at: new Date().toISOString() });
  return rows[0] ? 'password set' : 'created';
}
