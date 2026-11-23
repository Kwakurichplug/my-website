// Integration: sub-agents – an admin makes a player an agent with a commission rate and basis; the players who signed
// up with the agent's code earn the agent that commission on settled play; the admin pays it into the agent's balance
// and a new period starts. Needs a running server (API_URL, default http://127.0.0.1:8081) with PAYMENTS_MODE=demo on
// a TEST database (DATABASE_URL) with at least 4 open football fixtures.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const API = (process.env.API_URL || 'http://127.0.0.1:8081') + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/letbet_oa' });
const r2 = n => Math.round(n * 100) / 100;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  return { ...j, http: res.status };
}
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
async function player(name, ref) {
  const phone = '80' + rnd();
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123', fullName: name, ...(ref ? { ref } : {}) });
  assert.ok(r.token, 'registered: ' + JSON.stringify(r));
  return { token: r.token, user: r.user };
}
const bal = async t => (await api('/wallet', null, t)).balance;
const oddOf = ev => ev.markets.find(m => m.key === '1x2').outcomes['1'].o;
const bet = async (who, ev, stake) => {
  const r = await api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd: oddOf(ev) }], stakes: [stake], acceptChanges: true }, who.token);
  assert.equal(r.http, 201, 'bet placed: ' + JSON.stringify(r));
  return r.bets[0];
};
// what the players really did, straight from the database (settled sports bets of the agent's players)
const settled = async ids => (await db.query(`SELECT coalesce(sum(stake),0)::float AS st, coalesce(sum(paid),0)::float AS pd FROM bets WHERE id = ANY($1) AND status IN ('won','lost','cashout')`, [ids])).rows[0];

let admin, agent, p1, p2, other, events;
const A = path => '/admin/agents' + path;
before(async () => {
  admin = await player('Ops Admin');
  await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [admin.user.id]);
  agent = await player('Kunle Agent');
  p1 = await player('Player One', 'LB' + agent.user.uid);
  p2 = await player('Player Two', String(agent.user.uid));          // the code works with or without "LB"
  other = await player('Not Referred');
  events = (await api('/events?status=scheduled&sport=football&limit=200')).events
    .filter(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended && m.outcomes['1'] && m.outcomes['1'].o < 4));
  assert.ok(events.length >= 4, 'need 4 open fixtures, have ' + events.length);
  for (const [who, amt] of [[p1, 10000], [p2, 10000], [other, 5000]]) assert.equal((await api('/wallet/deposit', { amount: amt, method: 'card' }, who.token)).http < 300, true);
});
after(() => db.end());

test('only admins manage agents; the rate and basis are validated', async () => {
  assert.equal((await api(A(''), null, p1.token)).http, 403);
  assert.equal((await api(A('/' + agent.user.id), { rate: 20, basis: 'revenue' }, p1.token, 'PUT')).http, 403);
  for (const bad of [{ rate: 0, basis: 'revenue' }, { rate: 150, basis: 'revenue' }, { rate: 10, basis: 'profit' }])
    assert.equal((await api(A('/' + agent.user.id), bad, admin.token, 'PUT')).http, 400, JSON.stringify(bad));
  assert.equal((await api(A('/00000000-0000-0000-0000-000000000000'), { rate: 10, basis: 'revenue' }, admin.token, 'PUT')).http, 404);
  const r = await api(A('/' + agent.user.id), { rate: 25, basis: 'revenue', note: 'Ikeja shop' }, admin.token, 'PUT');
  assert.equal(r.http, 200); assert.equal(r.agent.rate, 25); assert.equal(r.agent.basis, 'revenue'); assert.equal(r.agent.players, 2);
  const list = await api(A(''), null, admin.token);
  assert.ok(list.agents.some(a => a.user_id === agent.user.id && a.active && a.players === 2));
  const found = (await api('/admin/users?q=' + agent.user.uid, null, admin.token)).users.find(u => u.id === agent.user.id);
  assert.equal(found.agent, true, 'players list flags the agent');
  const d = await api('/admin/users/' + p1.user.id, null, admin.token);
  assert.equal(d.referrer.uid, agent.user.uid); assert.equal(d.referrer.agent, true, 'player drawer shows who brought them in');
});

let openBet;
test('net revenue: settled bets of their players only (stakes − winnings); no flat referral reward for an agent', async () => {
  const [E0, E1, E2] = events;
  const b1 = await bet(p1, E0, 1000);          // wins
  const b2 = await bet(p2, E1, 5000);          // loses
  openBet = await bet(p1, E2, 700);            // still open: not counted yet
  await bet(other, E1, 3000);                  // not the agent's player: never counted
  await api(`/admin/events/${E0.id}/result`, { home: 2, away: 0 }, admin.token);
  await api(`/admin/events/${E1.id}/result`, { home: 0, away: 1 }, admin.token);
  const s = await settled([b1.id, b2.id]), revenue = r2(s.st - s.pd);
  assert.equal(s.st, 6000);
  const d = await api(A('/' + agent.user.id), null, admin.token);
  assert.equal(d.period.totals.staked, 6000, 'stakes of settled bets only');
  assert.equal(d.period.totals.revenue, revenue);
  assert.equal(d.period.base, revenue);
  assert.equal(d.period.commission, Math.max(0, r2(revenue * 0.25)));
  assert.equal(d.period.players.length, 2);
  assert.equal(d.period.players.find(x => x.id === p1.user.id).deposits, 0, 'deposits made before they became an agent do not count');
  // the agent's own view: totals only
  const me = await api('/auth/referrals', null, agent.token);
  assert.equal(me.agent.rate, 25); assert.equal(me.agent.players, 2); assert.equal(me.agent.commission, d.period.commission);
  assert.equal(me.agent.paid, 0); assert.ok(!('players_list' in me.agent) && typeof me.agent.players === 'number', 'no other players’ details');
  const ref = await db.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='referral'`, [agent.user.id]);
  assert.equal(ref.rows[0].n, 0, 'agents earn commission, not the flat Refer & Earn reward');
  // a normal player's referral is unchanged: not an agent → only the flat reward path (nothing to check here)
});

test('pay: the commission goes into the agent’s balance through the ledger and a new period starts', async () => {
  await sleep(6000);                           // a payout closes the period 5 s in the past (play still being committed goes to the next one)
  const due = (await api(A('/' + agent.user.id), null, admin.token)).period.commission;
  assert.ok(due > 0, 'commission due');
  const b0 = await bal(agent.token);
  const r = await api(A(`/${agent.user.id}/pay`), {}, admin.token);
  assert.equal(r.http, 200); assert.equal(r.payout.amount, due);
  assert.equal(await bal(agent.token), r2(b0 + due));
  const tx = (await db.query(`SELECT amount::float, ref FROM transactions WHERE user_id=$1 AND type='commission'`, [agent.user.id])).rows;
  assert.equal(tx.length, 1); assert.equal(tx[0].amount, due); assert.match(tx[0].ref, /^AG\d+$/);
  const after = await api(A('/' + agent.user.id), null, admin.token);
  assert.equal(after.period.base, 0, 'new period starts empty'); assert.equal(after.period.commission, 0);
  assert.equal(after.agent.paid_total, due); assert.equal(after.payouts.length, 1);
  assert.equal((await api('/auth/referrals', null, agent.token)).agent.paid, due);
  // the open bet settles now → counted in the new period
  await api(`/admin/events/${events[2].id}/result`, { home: 0, away: 3 }, admin.token);
  const n = await api(A('/' + agent.user.id), null, admin.token);
  assert.equal(n.period.totals.staked, 700); assert.equal(n.period.commission, r2(700 * 0.25));
  await sleep(6000);
  // the admin decides the amount: pay less, with a note; then close a period without paying
  const part = await api(A(`/${agent.user.id}/pay`), { amount: 100, note: 'Agreed with the agent' }, admin.token);
  assert.equal(part.payout.amount, 100); assert.equal(part.payout.commission, r2(700 * 0.25));
  assert.equal(await bal(agent.token), r2(b0 + due + 100));
  const zero = await api(A(`/${agent.user.id}/pay`), { amount: 0 }, admin.token);
  assert.equal(zero.http, 200); assert.equal(zero.balance, null, 'nothing moved');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM transactions WHERE user_id=$1 AND type='commission'`, [agent.user.id])).rows[0].n, 2);
  assert.equal((await api(A(`/${agent.user.id}/pay`), { amount: -5 }, admin.token)).http, 400);
  assert.ok(!openBet.paid, 'sanity');
});

test('deposits and stakes as the basis; removing and restoring an agent', async () => {
  let r = await api(A('/' + agent.user.id), { rate: 5, basis: 'deposits' }, admin.token, 'PUT');
  assert.equal(r.http, 200);
  await api('/wallet/deposit', { amount: 2000, method: 'card' }, p1.token);
  let d = await api(A('/' + agent.user.id), null, admin.token);
  assert.equal(d.period.base, 2000); assert.equal(d.period.commission, 100);
  r = await api(A('/' + agent.user.id), { rate: 2, basis: 'stakes' }, admin.token, 'PUT');
  const b = await bet(p2, events[3], 1500);
  await api(`/admin/events/${events[3].id}/result`, { home: 1, away: 1 }, admin.token);
  d = await api(A('/' + agent.user.id), null, admin.token);
  const s = await settled([b.id]);
  assert.equal(d.period.base, s.st); assert.equal(d.period.commission, r2(s.st * 0.02));
  // remove: the agent view disappears; restore: a fresh period (play while not an agent earns nothing)
  r = await api(A('/' + agent.user.id), { rate: 2, basis: 'stakes', active: false }, admin.token, 'PUT');
  assert.equal(r.agent.active, false);
  assert.equal((await api('/auth/referrals', null, agent.token)).agent, null);
  r = await api(A('/' + agent.user.id), { rate: 2, basis: 'stakes', active: true }, admin.token, 'PUT');
  d = await api(A('/' + agent.user.id), null, admin.token);
  assert.equal(d.agent.active, true); assert.equal(d.period.base, 0, 'restored with a new period');
  const log = (await api('/admin/log', null, admin.token)).log;
  assert.ok(log.some(l => /agents\/:id\/pay/.test(l.action)) && log.some(l => /PUT \/agents/.test(l.action)), 'every change is in the audit log');
});
