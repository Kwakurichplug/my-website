// Sending. EMAIL_PROVIDER =
//   console  – prints the subject to the log (outside production sign-up codes are shown on screen instead)
//   smtp     – SMTP_HOST, SMTP_PORT (465 = TLS, 587 = STARTTLS), SMTP_USER, SMTP_PASS, optional SMTP_SECURE=true
//   resend   – RESEND_API_KEY        sendgrid – SENDGRID_API_KEY
// EMAIL_FROM sets the sender. The live site uses the Spacemail mailbox info@letbetafrika.online
// (smtp, host mail.spacemail.com, port 465). Railway allows outbound SMTP only on its Pro plan.
// Sends from request handlers are fire-and-forget: a failed email never fails a bet or a payment. Every send is
// recorded in email_log (sent / logged / failed). The SMTP connection is checked at boot and every 10 minutes
// until it works (emailStatus(), GET /api/admin/email/status).
import { render } from './templates.js';
import { q } from '../db/pool.js';

const env = k => (process.env[k] || '').trim();
const FROM = env('EMAIL_FROM') || 'LetBetAfrika <info@letbetafrika.online>';
export const emailProvider = () => env('EMAIL_PROVIDER') || 'console';
const smtpPort = () => Number(env('SMTP_PORT') || 587);

/** Has the chosen provider everything it needs to send? */
export function emailConfigured() {
  const p = emailProvider();
  if (p === 'smtp') return !!(env('SMTP_HOST') && env('SMTP_USER') && process.env.SMTP_PASS);
  if (p === 'resend') return !!env('RESEND_API_KEY');
  if (p === 'sendgrid') return !!env('SENDGRID_API_KEY');
  return false;
}
/** Development / staging without a provider: emails go to the log and sign-up codes are shown on screen. */
export const emailTestMode = () => emailProvider() === 'console' && process.env.NODE_ENV !== 'production';

const STATUS = { ok: null, reachable: null, error: null, checkedAt: null };
/** Can an email (for example a sign-up code) reach a player right now? */
export const emailReady = () => emailTestMode() || (emailConfigured() && STATUS.ok !== false);
export const emailStatus = () => ({
  provider: emailProvider(), from: FROM, configured: emailConfigured(), testMode: emailTestMode(), ready: emailReady(),
  ...(emailProvider() === 'smtp' ? { server: `${env('SMTP_HOST') || '(SMTP_HOST missing)'}:${smtpPort()}` } : {}), ...STATUS,
});

const NETWORK = new Set(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ENOTFOUND', 'EAI_AGAIN']);
const describe = e => (e && e.code ? e.code + ': ' : '') + (e && e.message ? e.message : String(e));
const fail = e => { STATUS.ok = false; STATUS.error = describe(e); STATUS.checkedAt = new Date().toISOString(); };

async function smtpTransport(withAuth) {
  const { default: nodemailer } = await import('nodemailer');
  const port = smtpPort();
  return nodemailer.createTransport({
    host: env('SMTP_HOST'), port, secure: env('SMTP_SECURE') === 'true' || port === 465,
    auth: withAuth && env('SMTP_USER') ? { user: env('SMTP_USER'), pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}

let smtp = null;
/** Send one message. Returns 'sent', or 'logged' for the console provider. Throws on failure. */
export async function deliver({ to, subject, html, text }) {
  const provider = emailProvider();
  if (provider === 'smtp') {
    if (!emailConfigured()) throw Object.assign(new Error('SMTP is not fully configured (needs SMTP_HOST, SMTP_USER and SMTP_PASS)'), { code: 'ENOCONFIG' });
    if (!smtp) smtp = await smtpTransport(true);
    try { await smtp.sendMail({ from: FROM, to, subject, html, text }); }
    catch (e) { if (NETWORK.has(e.code) || e.code === 'EAUTH') { fail(e); smtp = null; } throw e; }
    Object.assign(STATUS, { ok: true, reachable: true, error: null });
    return 'sent';
  }
  if (provider === 'resend' || provider === 'sendgrid') {
    const r = provider === 'resend'
      ? await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html, text }) })
      : await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { authorization: `Bearer ${env('SENDGRID_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: FROM.replace(/.*<|>/g, ''), name: 'LetBetAfrika' }, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] }) });
    if (!r.ok) { const e = new Error(`${provider} ${r.status}`); if (r.status === 401 || r.status === 403) fail(e); throw e; }
    Object.assign(STATUS, { ok: true, reachable: true, error: null });
    return 'sent';
  }
  console.log(`[email → ${to}] ${subject}`);
  return 'logged';
}

/** Record a send in email_log (codes are never stored). */
export function logEmail(userId, template, subject, status, error) {
  return q('INSERT INTO email_log (user_id, template, subject, status, error) VALUES ($1,$2,$3,$4,$5)',
    [userId || null, template, String(subject).replace(/\b\d{6}\b/g, '••••••'), status, error || null]).catch(() => {});
}

/** Send a template to a user record (needs user.email). Never throws. */
export async function sendEmail(name, user, data = {}) {
  if (!user?.email) return false;
  let m = null;
  try {
    const u = { country: user.country, uid: user.uid, phone: user.phone, fullName: user.full_name ?? user.fullName, email: user.email };
    m = render(name, { user: u, ...data });
    const status = await deliver({ to: user.email, subject: m.subject, html: m.html, text: m.text });
    logEmail(user.id, name, m.subject, status);
    return true;
  } catch (e) {
    console.error('[email]', name, describe(e));
    logEmail(user.id, name, m ? m.subject : name, 'failed', describe(e));
    return false;
  }
}

/** Check the SMTP connection (and login, once SMTP_PASS is set). Safe to call any time. */
export async function checkEmail() {
  if (emailProvider() !== 'smtp' || !env('SMTP_HOST')) return emailStatus();
  const t = await smtpTransport(emailConfigured());
  try {
    await t.verify();
    STATUS.reachable = true;
    STATUS.ok = emailConfigured() ? true : null;
    STATUS.error = emailConfigured() ? null : 'SMTP_PASS is not set yet';
  } catch (e) {
    STATUS.reachable = !NETWORK.has(e.code);
    STATUS.ok = false; STATUS.error = describe(e);
  } finally { t.close(); STATUS.checkedAt = new Date().toISOString(); }
  return emailStatus();
}

export function startEmailChecks() {
  const run = () => checkEmail().then(s => {
    if (s.provider !== 'smtp') return console.log(`[email] provider ${s.provider}${s.testMode ? ' (test mode – codes are shown on screen)' : s.configured ? '' : ' – not configured, emails are only logged'}`);
    console.log(`[email] smtp ${s.server} as ${s.from} – ${s.ok ? 'ready'
      : s.reachable === false ? `NOT reachable (${s.error}). Railway allows outbound SMTP only on the Pro plan – upgrade the plan, or use EMAIL_PROVIDER=resend`
      : s.error || 'not configured'}`);
  }).catch(e => console.error('[email] check failed', e.message));
  run();
  setInterval(() => { if (emailProvider() === 'smtp' && STATUS.ok !== true) run(); }, 10 * 60e3).unref();
}

export { render };
