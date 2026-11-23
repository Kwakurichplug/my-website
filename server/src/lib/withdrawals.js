// Withdrawal review. No withdrawal is ever paid automatically: it waits in the admin queue until an admin opens
// Review, looks at these account checks and approves it (send through the payment API, or mark it paid after paying
// by hand) or rejects it (the money goes back). The checks:
//   - the name registered on the MoMo wallet (asked from Moolre) against the player's name
//   - ID check, account status and age
//   - money: deposits, paid withdrawals, other pending withdrawals, how much was staked (money in and straight out
//     without playing is a laundering pattern), and that the balance equals the ledger
//   - the number: did this player deposit from it, and is it used by any other account (several accounts, one wallet)
// Red flags block "Approve & send" unless the admin ticks that they checked them (recorded with the approval).
import { q } from '../db/pool.js';
import * as gateway from '../payments/gateway.js';
import { NETWORKS } from './payments.js';
import { payoutResult } from '../payments/flows.js';
import { setSetting } from './settings.js';
/** Whether payouts through the payment API work: the last attempt (the admin portal warns while they fail). */
const payoutHealth = (ok, message) => setSetting('payout_health', { ok, at: new Date().toISOString(), ...(message ? { message: String(message).slice(0, 200) } : {}) }).catch(() => {});

/** Send a pending Mobile Money withdrawal through the payment API – the admin's "Approve & send", and agents' withdrawals
 *  automatically. Locked to the API first so it can never be paid twice; if the provider refuses, it goes back to the
 *  admin queue (manual) with the provider's message. */
export async function sendMomo(p, meta = {}) {
  const gw = gateway.active(); if (!gw) throw Object.assign(new Error('api_not_configured'), { status: 400 });
  const d = p.details || {};
  if (!d.phone || !NETWORKS[d.network]) throw Object.assign(new Error('momo_details'), { status: 400 });
  // a new reference for every attempt: an attempt the provider refused never blocks the next one
  const reference = 'lbw-' + String(p.id).replace(/-/g, '').slice(0, 20) + '-' + Date.now().toString(36);
  const u = await q(`UPDATE payments SET provider=$4, provider_ref=$2, updated_at=now(), details = details || $3::jsonb WHERE id=$1 AND status='pending' AND NOT (coalesce(provider,'manual') = ANY($5))`,
    [p.id, reference, JSON.stringify({ ...meta, sentAt: new Date().toISOString(), via: gw.label }), gw.name, gateway.API_PROVIDERS]);
  if (!u.rowCount) throw Object.assign(new Error('already_sent'), { status: 409 });
  let t;
  try { t = await gw.payout({ reference, amount: Number(p.amount), phone: d.phone, network: d.network, name: d.name || 'LetBetAfrika player' }); }
  catch (e) {
    await q(`UPDATE payments SET provider='manual', provider_ref=NULL, details = details || $2::jsonb WHERE id=$1 AND provider=$3 AND provider_ref=$4 AND status='pending'`, [p.id, JSON.stringify({ apiError: e.message }), gw.name, reference]);
    payoutHealth(false, e.message);
    throw Object.assign(new Error('payout_failed'), { status: 502, detail: e.message });
  }
  payoutHealth(true);
  if (t.status === 'success') await payoutResult(reference, true);
  return { status: t.status, reference };
}

const NAME_TTL = 10 * 60000;
const words = s => String(s || '').toUpperCase().normalize('NFKD').replace(/[^A-Z ]+/g, ' ').split(/\s+/).filter(w => w.length > 1);

/** How well two names agree: match (2+ shared words, or every word of the shorter name) | partial | mismatch | unknown */
export function nameMatch(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return 'unknown';
  const shared = A.filter(w => B.includes(w)).length, shorter = Math.min(new Set(A).size, new Set(B).size);
  if (shared >= 2 || (shared >= 1 && shared === shorter)) return 'match';
  return shared ? 'partial' : 'mismatch';
}

async function registeredName(p, refresh) {
  const d = p.details || {}, gw = gateway.active();
  if (p.method !== 'mobile_money' || !d.phone || !d.network) return null;
  if (!gw || !gw.validateName) return { status: 'unavailable', reason: 'Name lookup needs the Moolre API' };
  const c = d.nameCheck;
  if (!refresh && c && Date.now() - new Date(c.at).getTime() < NAME_TTL) return c;
  let out;
  try {
    const r = await gw.validateName({ phone: d.phone, network: d.network });
    out = r.ok ? { status: 'found', name: r.name, at: new Date().toISOString() } : { status: r.notFound ? 'not_found' : 'error', reason: r.reason, at: new Date().toISOString() };
  } catch (e) { out = { status: 'error', reason: e.message, at: new Date().toISOString() }; }
  if (out.status !== 'error') await q(`UPDATE payments SET details = details || jsonb_build_object('nameCheck', $2::jsonb) WHERE id=$1`, [p.id, JSON.stringify(out)]);
  return out;
}

/** Everything an admin needs before paying withdrawal `id`. */
export async function checks(id, { refresh = false } = {}) {
  const p = (await q(`SELECT * FROM payments WHERE id=$1 AND kind='withdrawal'`, [id])).rows[0];
  if (!p) return null;
  const u = (await q('SELECT * FROM users WHERE id=$1', [p.user_id])).rows[0];
  const d = p.details || {}, phone = d.phone || null, uid = u.id;
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const [dep, paid, pend, sports, games, lastDep, ledger, fromNumber, shared] = await Promise.all([
    one(`SELECT coalesce(sum(amount),0)::float AS s, count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='deposit'`, [uid]),
    one(`SELECT coalesce(sum(amount),0)::float AS s, count(*)::int AS n FROM payments WHERE user_id=$1 AND kind='withdrawal' AND status='success'`, [uid]),
    one(`SELECT coalesce(sum(amount),0)::float AS s, count(*)::int AS n FROM payments WHERE user_id=$1 AND kind='withdrawal' AND status='pending' AND id<>$2`, [uid, p.id]),
    one(`SELECT coalesce(sum(stake),0)::float AS s FROM bets WHERE user_id=$1 AND status <> 'void'`, [uid]),
    one(`SELECT coalesce(sum(stake),0)::float AS s FROM game_bets WHERE user_id=$1 AND status <> 'void'`, [uid]),
    one(`SELECT max(created_at) AS at FROM transactions WHERE user_id=$1 AND type='deposit'`, [uid]),
    one(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [uid]),
    phone ? one(`SELECT count(*)::int AS n FROM payments WHERE user_id=$1 AND kind='deposit' AND status='success' AND details->>'phone'=$2`, [uid, phone]) : { n: 0 },
    phone ? q(`SELECT DISTINCT u.uid FROM users u LEFT JOIN payments x ON x.user_id=u.id AND x.method='mobile_money' AND x.details->>'phone'=$2
      WHERE u.id<>$1 AND (u.phone=$2 OR x.id IS NOT NULL) LIMIT 10`, [uid, phone]).then(r => r.rows.map(x => x.uid)) : [],
  ]);
  const since = lastDep.at ? await one(`SELECT (SELECT coalesce(sum(stake),0) FROM bets WHERE user_id=$1 AND status <> 'void' AND placed_at >= $2)::float
      + (SELECT coalesce(sum(stake),0) FROM game_bets WHERE user_id=$1 AND status <> 'void' AND created_at >= $2)::float AS s`, [uid, lastDep.at]) : { s: 0 };
  const name = await registeredName(p, refresh);
  const playerName = u.full_name || d.name || '';
  const match = name && name.status === 'found' ? nameMatch(name.name, playerName) : 'unknown';
  const kyc = u.verified ? 'verified' : (u.limits && u.limits.kyc && u.limits.kyc.status) || 'none';
  const staked = Math.round((sports.s + games.s) * 100) / 100, ageH = (Date.now() - new Date(u.created_at).getTime()) / 3600e3;
  const money = n => Math.round(n * 100) / 100;

  const flags = [];
  const flag = (level, text) => flags.push({ level, text });
  if (u.status !== 'active') flag('bad', `Account is ${u.status.replace('_', ' ')}`);
  if (Math.round(ledger.b * 100) !== Math.round(ledger.s * 100)) flag('bad', 'Balance does not match the ledger – do not pay, investigate');
  if (name) {
    if (name.status === 'not_found') flag('bad', 'No MoMo wallet is registered on this number');
    else if (match === 'mismatch') flag('bad', `MoMo name "${name.name}" does not match the player's name "${playerName || '–'}"`);
    else if (match === 'partial') flag('warn', `MoMo name "${name.name}" only partly matches "${playerName}"`);
    else if (name.status === 'error' || name.status === 'unavailable') flag('warn', 'Could not look up the MoMo name: ' + (name.reason || 'unknown'));
  }
  if (shared.length) flag('bad', `This number is also used by ${shared.length === 10 ? '10+' : shared.length} other account${shared.length === 1 ? '' : 's'} (ID ${shared.join(', ')})`);
  if (kyc !== 'verified') flag((process.env.REQUIRE_KYC || 'false') === 'true' ? 'bad' : 'warn', kyc === 'pending' ? 'ID check is waiting for a decision' : kyc === 'rejected' ? 'ID check was rejected' : 'ID not verified');
  if (!dep.n) flag('warn', 'Never deposited – the money came only from bonuses, referrals or transfers');
  else if (since.s < Math.min(Number(p.amount), dep.s) * 0.5) flag('warn', `Staked only ${money(since.s)} since the last deposit – money in and straight out`);
  if (phone && !fromNumber.n && p.method === 'mobile_money') flag('warn', 'The player never deposited from this number');
  if (ageH < 24) flag('warn', `Account opened ${ageH < 1 ? 'less than an hour' : Math.floor(ageH) + ' hours'} ago`);
  if (pend.n) flag('warn', `${pend.n} other withdrawal${pend.n === 1 ? '' : 's'} waiting (${money(pend.s)})`);

  return {
    payment: { id: p.id, amount: Number(p.amount), method: p.method, status: p.status, provider: p.provider, createdAt: p.created_at, details: { phone, network: d.network, name: d.name, account: d.account, bank: d.bank, acct: d.acct } },
    player: { id: uid, uid: u.uid, name: playerName, phone: u.phone, email: u.email, country: u.country, status: u.status, kyc, createdAt: u.created_at },
    momo: name ? { ...name, match } : null,
    money: { balance: money(ledger.b), ledgerOk: Math.round(ledger.b * 100) === Math.round(ledger.s * 100), deposits: money(dep.s), depositCount: dep.n, withdrawn: money(paid.s), withdrawCount: paid.n,
      pending: money(pend.s), pendingCount: pend.n, staked, stakedSinceDeposit: money(since.s), lastDepositAt: lastDep.at },
    number: phone ? { depositsFromIt: fromNumber.n, otherAccounts: shared } : null,
    flags, bad: flags.filter(f => f.level === 'bad').length,
  };
}
