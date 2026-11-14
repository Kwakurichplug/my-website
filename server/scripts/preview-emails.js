// Renders every template with sample data to an output folder, plus index.html.
// usage: node scripts/preview-emails.js [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, templates } from '../src/emails/templates.js';

const out = process.argv[2] || 'email-preview';
mkdirSync(out, { recursive: true });
const user = { country: 'NG', uid: 10000042, phone: '8012345678', fullName: 'Tunde Okafor', email: 'tunde@example.com' };
const gh = { ...user, country: 'GH', phone: '241234567', fullName: 'Ama Mensah' };
const now = new Date();
const legs = [
  { match: 'Arsenal vs Chelsea', market: '1X2', pick: 'Home', odd: 1.95 },
  { match: 'Enyimba vs Rangers Intl', market: 'Over/Under 2.5', pick: 'Over 2.5', odd: 2.1 },
  { match: 'Real Madrid vs Barcelona', market: 'Both Teams To Score', pick: 'GG (Yes)', odd: 1.62 },
];
const bet = { id: 'T7F3A9C2', type: 'multiple', stake: 1000, odds: 6.63, boost: 5, potential: 6914.5, placedAt: now, settledAt: now, legs };
const samples = {
  welcome: { user },
  otp: { user, code: '482913', purpose: 'register' },
  passwordChanged: { user, when: now, ip: 'Lagos, Nigeria' },
  newDevice: { user, when: now, device: 'iPhone · Safari', ip: 'Abuja, Nigeria' },
  kycSubmitted: { user },
  kycVerified: { user },
  kycRejected: { user, reason: 'The photo of your NIN slip was blurred.' },
  depositSuccess: { user, amount: 5000, method: 'OPay', paymentId: 'c9f1e2a0-7b1c', balance: 29866, when: now },
  depositFailed: { user, amount: 5000, method: 'Card', paymentId: 'a11b22c3-9d8e', reason: 'Your bank declined the payment (insufficient funds).' },
  withdrawalRequested: { user: gh, amount: 350, method: 'MTN MoMo', paymentId: '77aa88bb-11cc', account: 'MTN MoMo · 024 123 4567', when: now },
  withdrawalPaid: { user: gh, amount: 350, method: 'MTN MoMo', paymentId: '77aa88bb-11cc', account: 'MTN MoMo · 024 123 4567', when: now },
  withdrawalRejected: { user, amount: 20000, paymentId: '55dd66ee-22ff', reason: 'The account name does not match the name on your profile.', balance: 44866 },
  betPlaced: { user, bet },
  betWon: { user, bet: { ...bet, paid: 6914.5, legs: legs.map(l => ({ ...l, result: 'won' })) }, balance: 36780.5 },
  betSettled: { user, bet: { ...bet, status: 'lost', paid: 0, legs: legs.map((l, i) => ({ ...l, result: i === 1 ? 'lost' : 'won' })) } },
  cashout: { user, bet, paid: 2410, balance: 32276 },
  jackpotTicket: { user, ticketId: 'J4K8M2', prize: 50000000, draw: new Date(Date.now() + 2 * 864e5), picks: Array.from({ length: 12 }, (_, i) => ({ match: ['Arsenal vs Chelsea', 'Inter vs Milan', 'PSG vs Lyon', 'Enyimba vs Rangers', 'Kotoko vs Hearts'][i % 5], pick: ['1', 'X', '2'][i % 3] })) },
  bonusCredited: { user, amount: 10000, name: '200% Welcome Bonus', balance: 39866, terms: 'Bet the bonus 5 times on odds of 1.5 or more within 14 days to withdraw winnings.' },
  limitsUpdated: { user, period: 'Weekly', limit: 50000, reminder: 'Every hour' },
  selfExclusion: { user, until: new Date(Date.now() + 30 * 864e5) },
  weeklySummary: { user, from: new Date(Date.now() - 7 * 864e5), to: now, stats: { bets: 14, staked: 12500, won: 18240, deposits: 10000, withdrawals: 15000, balance: 29866 } },
};
const rows = [];
for (const name of Object.keys(templates)) {
  const m = render(name, samples[name]);
  writeFileSync(join(out, `${name}.html`), m.html);
  writeFileSync(join(out, `${name}.txt`), m.text);
  rows.push(`<li><a href="${name}.html">${name}</a> – <b>${m.subject}</b><br><small>${m.preheader}</small></li>`);
}
writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:sans-serif;max-width:720px;margin:40px auto"><h1>LetBetAfrika emails (${rows.length})</h1><ol>${rows.join('')}</ol>`);
console.log(`${rows.length} emails rendered to ${out}/`);
