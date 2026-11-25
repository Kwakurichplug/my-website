// Ways to pay, per country. Nothing is offered that cannot complete:
//   Nigeria – bank transfer to the account the admin sets in the admin portal. The player sends the money with
//             their reference in the narration and taps "I have sent it"; an admin confirms it arrived and the
//             deposit is credited (creditDeposit: welcome bonus included).
//   Ghana   – Mobile Money through the payment API (Moolre when its keys are set, else Paystack): confirmed by the
//             provider and credited automatically. Without an API, and only if the admin has entered a MoMo number,
//             a manual MoMo transfer confirmed by an admin.
//   Withdrawals – Nigeria to a bank account, Ghana to Mobile Money; the balance is held at request time and an
//             admin pays (manually, or for Ghana through the API) or rejects (the money goes back).
// PAYMENTS_MODE=demo credits deposits instantly for automated tests; it is ignored when NODE_ENV=production.
import { getSetting, setSetting } from './settings.js';
import * as gateway from '../payments/gateway.js';
import { q } from '../db/pool.js';
import { ladderOf } from './bonus.js';

/** Can this player take money out (withdraw, or send it to another player)? null = yes, else why not:
 *  withdrawals_suspended – the admin paused all withdrawals (settings 'withdrawals'.suspended – an emergency switch);
 *  deposits_first        – Deposit 1, 2, 3 are not all done yet (with the ladder on and requireDeposits). A new member who
 *                          has not deposited yet is not held by it (newMembersOpen): the rule starts with the first
 *                          deposit, and the deposit page says so before they pay. `lad` may be passed in when the caller
 *                          already has the player's ladder. */
export async function withdrawBlock(user, lad) { return (await withdrawCheck(user, lad)).block; }

/** The same decision with its reason: `block` (null = open) and `newMember` – open only because no deposit of theirs
 *  has been credited yet (the deposit page then tells them the rule starts with their first deposit). Before money
 *  moves, the route confirms that with stillNewMember() inside its transaction. */
export async function withdrawCheck(user, lad) {
  const w = (await getSetting('withdrawals')) || {};
  if (w.suspended) return { block: { error: 'withdrawals_suspended', message: w.message || null }, newMember: false };
  // agents withdraw their earnings without the Deposit 1, 2, 3 rule (as without play-through, Nov 22 rules)
  if (user.is_agent) return { block: null, newMember: false };
  if (w.requireDeposits !== false) {
    const L = lad === undefined ? await ladderOf(user) : lad;
    if (L && L.left > 0) {
      if (w.newMembersOpen !== false && !(await hasDeposited(user.id))) return { block: null, newMember: true };
      return { block: { error: 'deposits_first', left: L.left, next: L.next, done: L.done, unlocked: L.unlocked }, newMember: false };
    }
  }
  return { block: null, newMember: false };
}
/** Has the player ever had a deposit credited? (before that, a new member's withdrawals are open) – `c`: a transaction */
export async function hasDeposited(userId, c) {
  const sql = `SELECT EXISTS (SELECT 1 FROM payments WHERE user_id=$1 AND kind='deposit' AND status='success') AS d`;
  return (await (c ? c.query(sql, [userId]) : q(sql, [userId]))).rows[0].d;
}
/** Inside the transaction that takes the money out, for a player let through as a new member: lock their balance row
 *  first, then check again. Every deposit is credited through that row (wallet.move), so one credited at this very
 *  moment is either already visible here (→ the 1·2·3 rule applies) or not yet in the balance being debited. */
export async function stillNewMember(c, userId) {
  await c.query('SELECT 1 FROM users WHERE id=$1 FOR UPDATE', [userId]);
  return !(await hasDeposited(userId, c));
}

export const demoMode = () => process.env.PAYMENTS_MODE === 'demo' && process.env.NODE_ENV !== 'production';

export const METHOD_NAME = { bank_transfer: 'Bank transfer', mobile_money: 'Mobile money', card: 'Card', ussd: 'USSD', opay: 'OPay', palmpay: 'PalmPay' };
export const methodName = m => METHOD_NAME[m] || m;
export const CURRENCY = { NG: 'NGN', GH: 'GHS' };
export const NETWORKS = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AirtelTigo Money' };

/** Admin-editable payment details (settings key "payments"), merged over defaults. The first bank account / MoMo
 *  number can come from the environment (NG_BANK_NAME, NG_BANK_ACCOUNT, NG_BANK_HOLDER; GH_MOMO_NETWORK,
 *  GH_MOMO_NUMBER, GH_MOMO_NAME) so it never sits in the code; once an admin saves the payment settings, theirs win. */
const env = k => String(process.env[k] || '').trim();
export const DEFAULTS = () => ({
  NG: { bank: { bank: env('NG_BANK_NAME'), number: env('NG_BANK_ACCOUNT').replace(/\D/g, ''), name: env('NG_BANK_HOLDER'), note: '' }, minDeposit: 1000, maxDeposit: 5000000, minWithdraw: 1000, maxWithdraw: 2000000, payoutTime: 'within 24 hours' },
  GH: { momo: { network: env('GH_MOMO_NETWORK') || 'mtn', number: env('GH_MOMO_NUMBER').replace(/\D/g, '').replace(/^0/, ''), name: env('GH_MOMO_NAME'), note: '' },
    // manual deposit by USSD (e.g. *203*0778606#): the player dials it, pays, and types the transaction ID; an admin confirms
    ussd: { code: env('GH_DEPOSIT_USSD'), name: env('GH_DEPOSIT_USSD_NAME'), note: '' }, minDeposit: 10, maxDeposit: 50000, minWithdraw: 10, maxWithdraw: 20000, payoutTime: 'within 24 hours' },
});
export async function config() {
  const s = (await getSetting('payments')) || {}, D = DEFAULTS();
  const out = {};
  for (const cc of ['NG', 'GH']) {
    const d = D[cc], v = s[cc] || {};
    out[cc] = { ...d, ...v, ...(d.bank ? { bank: { ...d.bank, ...(v.bank || {}) } } : {}), ...(d.momo ? { momo: { ...d.momo, ...(v.momo || {}) } } : {}),
      ...(d.ussd ? { ussd: { ...d.ussd, ...Object.fromEntries(Object.entries(v.ussd || {}).filter(([k, x]) => k !== 'code' || x)) } } : {}) };   // an empty code in Settings keeps the one from the environment
  }
  return out;
}
export async function saveConfig(next) { await setSetting('payments', next); return config(); }

const bankReady = b => !!(b && b.bank && b.number && b.name);
const momoReady = m => !!(m && m.number && m.name);
export const USSD_CODE = /^\*\d{2,6}(\*\d{1,15})*#$/;
const ussdReady = u => !!(u && USSD_CODE.test(String(u.code || '')));

/** What a player in `cc` can use right now. `reference` goes in the transfer narration for manual deposits. */
export async function options(user) {
  const cc = user.country, c = (await config())[cc], demo = demoMode();
  const deposit = [], withdraw = [];
  if (cc === 'NG') {
    if (bankReady(c.bank) || demo) deposit.push({ method: 'bank_transfer', mode: demo ? 'demo' : 'manual', account: c.bank, eta: 'usually within 15 minutes' });
    withdraw.push({ method: 'bank_transfer', eta: c.payoutTime });
  } else {
    if (gateway.enabled()) deposit.push({ method: 'mobile_money', mode: 'api', eta: 'instant' });
    else if (momoReady(c.momo) || demo) deposit.push({ method: 'mobile_money', mode: demo ? 'demo' : 'manual', account: { ...c.momo, networkName: NETWORKS[c.momo.network] || c.momo.network }, eta: 'usually within 15 minutes' });
    if (ussdReady(c.ussd)) deposit.push({ method: 'ussd', mode: 'manual', account: { code: c.ussd.code, name: c.ussd.name || '', note: c.ussd.note || '' }, eta: 'usually within 15 minutes' });
    withdraw.push({ method: 'mobile_money', eta: c.payoutTime, api: gateway.enabled() });   // every withdrawal is reviewed by an admin first
  }
  return { country: cc, currency: CURRENCY[cc], reference: referenceOf(user), deposit, withdraw,
    limits: { minDeposit: c.minDeposit, maxDeposit: c.maxDeposit, minWithdraw: c.minWithdraw, maxWithdraw: c.maxWithdraw } };
}
/** A player's deposit reference (narration): the same every time, so the admin can match transfers to accounts. */
export const referenceOf = user => 'LB' + String(user.uid).padStart(6, '0');
