// Moolre one-time setup: checks the keys and the wallet, then registers our webhook URL on the wallet and prints the
// secret that signs the webhooks (set it as MOOLRE_WEBHOOK_SECRET in Railway).
//   MOOLRE_USER=… MOOLRE_PUBLIC_KEY=… MOOLRE_PRIVATE_KEY=… MOOLRE_ACCOUNT_NUMBER=… SITE_URL=https://letbetafrika.online \
//     node scripts/moolre-setup.js            (add --check to only check, without changing the callback)
import * as moolre from '../src/payments/moolre.js';

const site = String(process.env.SITE_URL || '').replace(/\/$/, '');
if (!moolre.enabled()) { console.error('Set MOOLRE_USER, MOOLRE_PUBLIC_KEY, MOOLRE_PRIVATE_KEY and MOOLRE_ACCOUNT_NUMBER.'); process.exit(1); }
if (!/^https:\/\//.test(site) && !process.argv.includes('--check')) { console.error('Set SITE_URL to the live https address.'); process.exit(1); }

const acct = await moolre.account().catch(e => { console.error('Account check failed:', e.message); process.exit(2); });
console.log(`Wallet: ${acct.name || '(no name)'} · balance GH₵${acct.balance} · API access ${acct.activated ? 'ON' : 'OFF'} · callback ${acct.callback || '(none)'}`);
const want = site + moolre.webhookPath;
if (process.argv.includes('--check')) process.exit(0);
const r = await moolre.setCallback(want).catch(e => { console.error('Could not set the callback:', e.message); process.exit(3); });
console.log('Callback set to', r.callback);
if (r.secret) console.log('Webhook secret (set MOOLRE_WEBHOOK_SECRET to this in Railway):', r.secret);
else console.log('Moolre did not return a secret – find it in the Moolre app (wallet settings).');
