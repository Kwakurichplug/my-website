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
