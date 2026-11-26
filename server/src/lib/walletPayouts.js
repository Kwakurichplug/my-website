// Send money (admin portal): an admin sends money out of the Moolre wallet to any Mobile Money number – e.g. to pay
// someone by hand, or to move takings to the business's own wallet. No player balance moves.
// Safeguards: admin only; the admin's password is asked again for every send (routes/admin.js); the name registered
// on the number is looked up first; a per-transfer and a per-24-hours limit (settings key 'wallet_payouts', checked
// under a lock so two sends at once cannot pass it); every send is in admin_log and in this table with who sent it.
// Results: like player payouts – final at once, or pending until Moolre's webhook / status call says paid or failed;
// a send Moolre refused before any money moved is marked failed with the reason.
import { q, tx } from '../db/pool.js';
import { getSetting } from './settings.js';
import * as gateway from '../payments/gateway.js';

const fail = (status, error, extra) => Object.assign(new Error(error), { status, body: { error, ...extra } });
export const NETWORKS = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AirtelTigo Money' };
export const phone9 = s => String(s || '').replace(/\D/g, '').replace(/^233/, '').replace(/^0/, '');
const ageMin = at => (Date.now() - new Date(at).getTime()) / 60000;

export async function limits() {
  const s = (await getSetting('wallet_payouts')) || {};
  return { maxPerTransfer: Number(s.maxPerTransfer) || 20000, maxPerDay: Number(s.maxPerDay) || 50000 };
}
const payoutApi = () => { const gw = gateway.active(); return gw && gw.payout && gw.payoutStatus ? gw : null; };

/** The name registered on a MoMo number. */
export async function lookup({ phone, network }) {
  const gw = payoutApi(); if (!gw || !gw.validateName) throw fail(400, 'api_not_configured');
  const p = phone9(phone); if (p.length !== 9 || !NETWORKS[network]) throw fail(400, 'momo_details');
  const r = await gw.validateName({ phone: p, network });
  return r.ok ? { status: 'found', name: r.name } : { status: r.notFound ? 'not_found' : 'error', reason: r.reason };
}

/** Send `amount` GHS to a MoMo number from the payment API wallet. */
export async function send({ phone, network, amount, reason, adminId }) {
  const gw = payoutApi(); if (!gw) throw fail(400, 'api_not_configured');
  const p = phone9(phone); if (p.length !== 9 || !NETWORKS[network]) throw fail(400, 'momo_details');
  amount = Math.round(Number(amount) * 100) / 100;
  if (!(amount >= 1)) throw fail(400, 'invalid');
  const lim = await limits();
  if (amount > lim.maxPerTransfer) throw fail(400, 'over_transfer_limit', { max: lim.maxPerTransfer });
  let name = null;
  try { const n = await lookup({ phone: p, network }); if (n.status === 'not_found') throw fail(400, 'no_wallet'); name = n.name || null; }
  catch (e) { if (e.body && e.body.error === 'no_wallet') throw e; }   // a lookup that could not run does not block the send
  const row = await tx(async c => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('wallet_payouts'))`);   // one send at a time against the daily limit
    const { rows } = await c.query(`SELECT coalesce(sum(amount),0)::float AS s FROM wallet_payouts WHERE status <> 'failed' AND created_at > now() - interval '24 hours'`);
    if (rows[0].s + amount > lim.maxPerDay) throw fail(400, 'over_daily_limit', { max: lim.maxPerDay, left: Math.max(0, Math.round((lim.maxPerDay - rows[0].s) * 100) / 100) });
    const ins = await c.query(`INSERT INTO wallet_payouts (provider, amount, phone, network, name, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [gw.name, amount, p, network, name, reason, adminId]);
    const r = ins.rows[0], ref = 'lbo-' + r.id + '-' + Date.now().toString(36);
    await c.query('UPDATE wallet_payouts SET provider_ref=$2 WHERE id=$1', [r.id, ref]);
    return { ...r, provider_ref: ref };
  });
  let t;
  try { t = await gw.payout({ reference: row.provider_ref, amount, phone: p, network, name: name || 'LetBetAfrika' }); }
  catch (e) {
    await q(`UPDATE wallet_payouts SET status='failed', error=$2, updated_at=now() WHERE id=$1 AND status='pending'`, [row.id, String(e.message).slice(0, 300)]);
    throw fail(502, 'payout_failed', { message: e.message, id: Number(row.id) });
  }
  if (t.status === 'success') await q(`UPDATE wallet_payouts SET status='success', updated_at=now(), details = details || $2::jsonb WHERE id=$1 AND status='pending'`, [row.id, JSON.stringify({ providerTx: t.code || null })]);
  return { id: Number(row.id), status: t.status === 'success' ? 'success' : 'pending', reference: row.provider_ref, name };
}

/** Ask the provider about a pending send (webhook missed or late). */
export async function check(row) {
  if (!row || row.status !== 'pending' || !row.provider_ref) return row;
  const gw = gateway.byName(row.provider); if (!gw || !gw.enabled() || !gw.payoutStatus) return row;
  const v = await gw.payoutStatus(row.provider_ref);
  if (v.status === 'success') await q(`UPDATE wallet_payouts SET status='success', updated_at=now(), details = details || $2::jsonb WHERE id=$1 AND status='pending'`, [row.id, JSON.stringify({ providerTx: v.id || null })]);
  else if (v.status === 'failed') await q(`UPDATE wallet_payouts SET status='failed', error=$2, updated_at=now() WHERE id=$1 AND status='pending'`, [row.id, v.reason || 'The transfer did not go through']);
  else if (v.status === 'not_found' && ageMin(row.created_at) > 15) await q(`UPDATE wallet_payouts SET status='failed', error=$2, updated_at=now() WHERE id=$1 AND status='pending'`, [row.id, 'Moolre has no record of this transfer – it was not sent']);
  return (await q('SELECT * FROM wallet_payouts WHERE id=$1', [row.id])).rows[0];
}
export async function checkByRef(ref) {
  const { rows } = await q(`SELECT * FROM wallet_payouts WHERE provider_ref=$1 AND status='pending'`, [ref]);
  return rows[0] ? check(rows[0]) : null;
}
/** Leader sweep (with the payments sweep): pending sends older than a minute, up to 3 days. */
export async function sweep() {
  const { rows } = await q(`SELECT * FROM wallet_payouts WHERE status='pending' AND updated_at < now() - interval '1 minute' AND created_at > now() - interval '3 days' ORDER BY updated_at LIMIT 10`);
  for (const r of rows) {
    try { await check(r); } catch (e) { console.error('[wallet-payouts] check', r.id, e.message); }
    await q(`UPDATE wallet_payouts SET updated_at=now() WHERE id=$1 AND status='pending'`, [r.id]);
  }
}

/** The Send money page: provider, balance, limits, what went out in the last 24 hours, recent sends. */
export async function overview() {
  const gw = payoutApi(), lim = await limits();
  let balance = null;
  if (gw && gw.account) { try { const a = await gw.account(); balance = { amount: a.balance, name: a.name, activated: a.activated }; } catch (e) { balance = { error: e.message }; } }
  const day = (await q(`SELECT coalesce(sum(amount),0)::float AS s FROM wallet_payouts WHERE status <> 'failed' AND created_at > now() - interval '24 hours'`)).rows[0].s;
  const { rows } = await q(`SELECT w.*, u.full_name AS by_name, u.uid AS by_uid FROM wallet_payouts w JOIN users u ON u.id=w.created_by ORDER BY w.created_at DESC LIMIT 100`);
  return { provider: gw ? gw.name : 'none', label: gw ? gw.label : '', enabled: !!gw, balance, limits: lim, sentToday: day, leftToday: Math.max(0, Math.round((lim.maxPerDay - day) * 100) / 100),
    payouts: rows.map(r => ({ id: Number(r.id), amount: Number(r.amount), phone: r.phone, network: r.network, name: r.name, reason: r.reason, status: r.status, error: r.error, reference: r.provider_ref, by: r.by_name || ('ID ' + r.by_uid), at: r.created_at })) };
}
