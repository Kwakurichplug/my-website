// Sending. EMAIL_PROVIDER = console (dev, prints subject) | smtp | resend | sendgrid.
// smtp: SMTP_HOST, SMTP_PORT (587 STARTTLS / 465 TLS), SMTP_USER, SMTP_PASS, optional SMTP_SECURE=true; EMAIL_FROM sets the sender.
// Sends are fire-and-forget from request handlers: a failed email never fails a bet or a payment.
import { render } from './templates.js';
import { q } from '../db/pool.js';

const FROM = process.env.EMAIL_FROM || 'LetBetAfrika <no-reply@letbetafrika.com>';

let smtp = null;
export const emailProvider = () => process.env.EMAIL_PROVIDER || 'console';
export async function deliver({ to, subject, html, text }) {
  const provider = emailProvider();
  if (provider === 'smtp') {
    if (!smtp) {
      const { default: nodemailer } = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      smtp = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
    }
    await smtp.sendMail({ from: FROM, to, subject, html, text });
    return;
  }
  if (provider === 'resend') {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: FROM, to, subject, html, text }) });
    if (!r.ok) throw new Error(`resend ${r.status}`);
    return;
  }
  if (provider === 'sendgrid') {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: FROM.replace(/.*<|>/g, ''), name: 'LetBetAfrika' }, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] }) });
    if (!r.ok) throw new Error(`sendgrid ${r.status}`);
    return;
  }
  console.log(`[email → ${to}] ${subject}`);
}

/** Send a template to a user record (needs user.email). Never throws. */
export async function sendEmail(name, user, data = {}) {
  try {
    if (!user?.email) return false;
    const u = { country: user.country, uid: user.uid, phone: user.phone, fullName: user.full_name ?? user.fullName, email: user.email };
    const m = render(name, { user: u, ...data });
    await deliver({ to: user.email, subject: m.subject, html: m.html, text: m.text });
    await q('INSERT INTO email_log (user_id, template, subject) VALUES ($1,$2,$3)', [user.id || null, name, m.subject]).catch(() => {});
    return true;
  } catch (e) {
    console.error('[email]', name, e.message);
    return false;
  }
}

export { render };
