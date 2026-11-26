// Integration: sub-agents. Admin makes an agent → players sign up with the agent's link / code → the agent earns
// 70% of each player's FIRST deposit, requestable once the player has played it → request → admin rejects
// (back to available) or approves (credited to the agent's balance through the ledger).
// Runs on the Moolre test server (see moolre-api.test.js) started with MANUAL_TICK_MS=1000 AGENTS_TICK_MS=1000.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.MOOLRE_API_URL, MOCK = process.env.MOCK_MOOLRE || 'http://127.0.0.1:9099';
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
const tag = () => Math.random().toString(36).slice(2, 6).toUpperCase();
async function player(cc = 'GH', extra = {}) {
  const phone = cc === 'GH' ? '24' + rnd().slice(0, 7) : '80' + rnd();
  const o = await api('/auth/otp', { country: cc, phone, purpose: 'register' });
  const r = await api('/auth/register', { country: cc, phone, code: o.devCode, password: 'Strong123', fullName: extra.name || 'Kwame Player', ...extra });
  assert.ok(r.token, JSON.stringify(r));
  return { token: r.token, user: r.user, phone };
}
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(200); } return v; };
const bal = async t => (await api('/wallet', null, t)).balance;
async function deposit(p, amount) {
  const before = await bal(p.token);
  const d = await api('/wallet/deposit', { amount, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  const ref = (await db.query('SELECT provider_ref FROM payments WHERE id=$1', [d.paymentId])).rows[0].provider_ref;
  await fetch(`${MOCK}/__approve/${ref}`, { method: 'POST' });
  assert.ok(await until(async () => (await bal(p.token)) === before + amount), 'deposit credited');
}
const ledgerOk = async uid => { const { rows } = await db.query(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [uid]); assert.equal(Math.round(rows[0].b * 100), Math.round(rows[0].s * 100), 'ledger = balance'); };

let ADMIN;
// This suite tests the Nov 22 rules. The 3-deposit withdrawal rule and the Deposit 1·2·3 bonuses (payments-api.test.js)
// are switched off while it runs – withdrawals open for every player, the welcome bonus on the first deposit – then restored.
const RULES = {};
async function nov22Rules(admin) {
  for (const k of ['withdrawals', 'deposit_bonuses']) RULES[k] = (await db.query('SELECT value FROM settings WHERE key=$1', [k])).rows[0]?.value;
  await api('/admin/settings/withdrawals', { value: { ...(RULES.withdrawals || {}), suspended: false, requireDeposits: false, newMembersOpen: true, message: '' } }, admin, 'PUT');
  if (RULES.deposit_bonuses) await api('/admin/settings/deposit_bonuses', { value: { ...RULES.deposit_bonuses, enabled: false } }, admin, 'PUT');
}
async function restoreRules(admin) {
  for (const [k, v] of Object.entries(RULES)) if (v) await api('/admin/settings/' + k, { value: v }, admin, 'PUT');
}
before(async () => { if (skip) return; const a = await player('GH', { name: 'Admin Agents' }); await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.user.id]); ADMIN = a.token; await nov22Rules(ADMIN); });
after(async () => { if (!skip) await restoreRules(ADMIN); await db.end(); });

test('agents: link sign-up, 70% of the first deposit only, released after play, request, reject, approve', { skip }, async () => {
  const ag = await player('GH', { name: 'Ama Agent' });
  assert.equal((await api('/agent', null, ag.token)).status, 403, 'not an agent yet');
  const made = await api(`/admin/users/${ag.user.id}/agent`, { on: true }, ADMIN);
  assert.equal(made.isAgent, true); assert.match(made.code, /^AG[A-Z0-9]{6}$/); assert.match(made.link, /\?agent=AG/);
  assert.equal((await api(`/admin/users/${ag.user.id}/agent`, { on: true }, ADMIN)).code, made.code, 'the code stays the same');
  const me = await api('/auth/me', null, ag.token); assert.equal((me.user || me).isAgent, true);

  const p1 = await player('GH', { agent: made.code.toLowerCase() });            // the link (?agent=…)
  const p2 = await player('GH', { ref: made.code });                              // the code typed as referral code
  const ng = await player('NG', { agent: made.code });                            // another country: not linked
  const link = async u => (await db.query('SELECT agent_id, referred_by FROM users WHERE id=$1', [u.user.id])).rows[0];
  assert.equal((await link(p1)).agent_id, ag.user.id); assert.equal((await link(p2)).agent_id, ag.user.id);
  assert.equal((await link(p2)).referred_by, null, 'an agent code is not also a Refer & Earn referral');
  assert.equal((await link(ng)).agent_id, null);

  await deposit(p1, 100); await deposit(p1, 50);   // only the first deposit counts
  let d = await api('/agent', null, ag.token);
  assert.equal(d.pct, 70); assert.equal(d.totals.players, 2); assert.equal(d.totals.deposited, 1);
  assert.equal(d.totals.pending, 70); assert.equal(d.totals.available, 0);
  assert.equal(d.players.find(x => x.uid === p1.user.uid).status, 'pending');
  assert.equal(d.players.find(x => x.uid === p2.user.uid).status, 'no_deposit');
  assert.ok(!/Kwame Player/.test(JSON.stringify(d.players)), 'player names are masked'); assert.ok(d.players.some(x => x.name === 'Kwame P.'));
  assert.equal((await api('/agent/payout', {}, ag.token)).error, 'momo_details', 'a Ghana agent must give a MoMo number');
  assert.equal((await api('/agent/payout', { phone: ag.phone, network: 'mtn', name: 'Ama Agent' }, ag.token)).error, 'nothing_available', 'nothing before the player has played');
  assert.equal(d.today.joined, 2, 'today (since 6 AM Ghana time): two new members'); assert.equal(d.today.deposits, 2); assert.equal(d.today.amount, 150);
  assert.equal(d.today.firstDeposits, 1); assert.equal(d.today.earned, 70); assert.equal(d.days.length, 14);
  assert.equal(d.players.find(x => x.uid === p1.user.uid).totalDeposited, 150); assert.equal(d.players.find(x => x.uid === p1.user.uid).today, 150);

  // the player plays their deposit: a GH₵100 single on a match that is then settled
  const m = await api('/admin/events', { league: { name: 'Agent Cup ' + tag(), country: 'Ghana', flag: 'gh' }, home: 'Home ' + tag(), away: 'Away ' + tag(), kickoff: new Date(Date.now() + 600000).toISOString(), odds: { home: 2, draw: 3.3, away: 3.6 } }, ADMIN);
  const placed = await api('/bets/place', { type: 'single', stakes: [100], selections: [{ eventId: m.id, market: '1x2', outcome: '2', odd: 3.6 }] }, p1.token);
  assert.ok(placed.bets, JSON.stringify(placed));
  assert.equal((await api('/agent', null, ag.token)).totals.available, 0, 'an open bet does not count');
  await db.query(`UPDATE events SET kickoff = now() - interval '2 hours' WHERE id=$1`, [m.id]);
  await api(`/admin/events/${m.id}/result`, { home: 2, away: 0 }, ADMIN);
  assert.ok(await until(async () => (await api('/agent', null, ag.token)).totals.available === 70), 'released once the deposit was played');

  const req1 = await api('/agent/payout', { phone: ag.phone, network: 'mtn', name: 'Ama Agent' }, ag.token);
  assert.equal(req1.amount, 70); assert.match(req1.to, /MTN MoMo · 0/); assert.equal(req1.status, 'pending');
  assert.equal((await api('/agent/payout', { phone: ag.phone, network: 'mtn', name: 'Ama Agent' }, ag.token)).error, 'nothing_available', 'no double request');
  const q = (await api('/admin/agent-payouts?status=pending', null, ADMIN)).payouts.find(x => x.id === req1.id);
  assert.ok(q); assert.equal(q.details.method, 'mobile_money'); assert.equal(q.details.name, 'Ama Agent'); assert.equal(q.players.length, 1); assert.equal(q.players[0].deposit, 100);
  assert.equal((await api(`/admin/agent-payouts/${req1.id}/reject`, {}, ADMIN)).error, 'reason_required');
  assert.equal((await api(`/admin/agent-payouts/${req1.id}/reject`, { reason: 'Please confirm the player' }, ADMIN)).status, 'rejected');
  d = await api('/agent', null, ag.token);
  assert.equal(d.totals.available, 70, 'back to available'); assert.equal(d.payouts[0].status, 'rejected'); assert.equal(d.payouts[0].reason, 'Please confirm the player');

  const req2 = await api('/agent/payout', { phone: ag.phone, network: 'mtn', name: 'Ama Agent' }, ag.token);
  const before = await bal(ag.token);
  assert.equal((await api(`/admin/agent-payouts/${req2.id}/approve`, {}, ADMIN)).status, 'paid');
  assert.equal((await api(`/admin/agent-payouts/${req2.id}/approve`, {}, ADMIN)).error, 'not_pending', 'paid once');
  assert.equal(await bal(ag.token), before, 'sent to the MoMo number by the admin – nothing goes into the balance');
  const tx = (await db.query(`SELECT type, amount::float FROM transactions WHERE user_id=$1 AND type='agent_commission'`, [ag.user.id])).rows;
  assert.deepEqual(tx, []);
  assert.equal((await api('/agent', null, ag.token)).payouts[0].to, req2.to);
  d = await api('/agent', null, ag.token);
  assert.equal(d.totals.paid, 70); assert.equal(d.totals.available, 0);
  await ledgerOk(ag.user.id);

  const list = (await api('/admin/agents', null, ADMIN)).agents.find(a => a.id === ag.user.id);
  assert.equal(list.players, 2); assert.equal(list.deposited, 1); assert.equal(list.paid, 70);
  assert.equal((await api('/admin/agents', null, p1.token)).status, 403, 'players cannot see agents');

  await deposit(ag, 50);   // money of their own to withdraw
  // agents withdraw without an ID check and without waiting for an admin: sent through the payment API at once
  const wa = await api('/wallet/withdraw', { amount: 20, method: 'mobile_money', details: { phone: ag.phone, network: 'mtn', name: 'Ama Agent' } }, ag.token);
  assert.ok(['sent', 'paid'].includes(wa.auto), JSON.stringify(wa));
  const pa = (await db.query('SELECT provider, provider_ref, details FROM payments WHERE id=$1', [wa.paymentId])).rows[0];
  assert.notEqual(pa.provider, 'manual', 'handed to the payment API'); assert.equal(pa.details.auto, 'agent');
  assert.ok((await (await fetch(`${MOCK}/__transfers/${pa.provider_ref}`)).json()).data, 'the transfer reached the provider');
  // …a normal player's withdrawal still waits for the admin's review
  await db.query('UPDATE users SET playthrough_left=0 WHERE id=$1', [p1.user.id]);   // deposit played through (test/playthrough.test.js)
  const wp = await api('/wallet/withdraw', { amount: 20, method: 'mobile_money', details: { phone: p1.phone, network: 'mtn', name: 'Kwame Player' } }, p1.token);
  assert.equal(wp.auto, undefined);
  assert.equal((await db.query('SELECT provider FROM payments WHERE id=$1', [wp.paymentId])).rows[0].provider, 'manual');

  // a stopped agent's link no longer signs anyone up under them
  await api(`/admin/users/${ag.user.id}/agent`, { on: false }, ADMIN);
  const p3 = await player('GH', { agent: made.code });
  assert.equal((await link(p3)).agent_id, null);
});
