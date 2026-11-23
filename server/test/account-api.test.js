// Integration: deposit bonuses 1 · 2 · 3, Refer & Earn, Code Hub feed and the Acca Win Boost rule – real money through the API.
// Needs a running server on a TEST database with PAYMENTS_MODE=demo:
//   API_URL=… DATABASE_URL=… node --test test/account-api.test.js
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
  if (!res.ok) throw Object.assign(new Error(j.error || String(res.status)), { status: res.status, body: j });
  return j;
}
async function newUser({ deposit, admin, ref } = {}) {
  const phone = '70' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token, user } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123', ...(ref ? { ref } : {}) });
  if (admin) await db.query(`UPDATE users SET role='admin' WHERE phone=$1 AND country='NG'`, [phone]);
  if (deposit) await api('/wallet/deposit', { amount: deposit, method: 'card' }, token);
  return { token, user };
}
const balance = async t => (await api('/wallet', null, t)).balance;
let ADMIN, events = [];
const open1x2 = () => events.filter(e => e.status === 'scheduled' && !e.used);
const pick = (e, min = 1.5) => { const o = e.markets.find(m => m.key === '1x2').outcomes; const k = ['1', 'X', '2'].find(x => o[x] && o[x].o >= min); return k ? { eventId: e.id, market: '1x2', outcome: k, odd: o[k].o } : null; };
const multiple = (tok, sels, stake) => api('/bets/place', { type: 'multiple', selections: sels, stake, acceptChanges: true }, tok);
const finish = async (e, home, away) => { e.used = true; await api(`/admin/events/${e.id}/result`, { home, away }, ADMIN); };

before(async () => {
  ADMIN = (await newUser({ admin: true })).token;
  events = (await api('/events?status=scheduled&sport=football&limit=200')).events.filter(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended));
  assert.ok(events.length >= 10, 'need 10 open football fixtures, have ' + events.length);
});
after(() => db.end());

test('deposit bonuses 1 · 2 · 3: only after the ID check, three bonuses, locked; a stake counts towards one bonus at a time', async () => {
  const { token, user } = await newUser({ deposit: 1000 });   // deposited before the ID check: no bonus
  let b = await api('/wallet/bonuses', null, token);
  assert.equal(b.bonuses.length, 0, 'no bonus before the ID is approved');
  assert.equal(b.ladder.unlocked, false); assert.equal(b.ladder.steps[0].status, 'locked');
  await db.query('UPDATE users SET verified=true WHERE id=$1', [user.id]);
  b = await api('/wallet/bonuses', null, token);
  assert.equal(b.ladder.unlocked, true); assert.equal(b.ladder.next, 1);
  const opts = await api('/wallet/options', null, token);
  assert.deepEqual(opts.ladder.steps.map(x => x.pct), [200, 100, 50], 'the deposit page gets the ladder');
  for (const amount of [1000, 2000, 4000, 5000]) await api('/wallet/deposit', { amount, method: 'card' }, token);
  b = await api('/wallet/bonuses', null, token);
  const k = kind => b.bonuses.find(x => x.kind === kind);
  assert.deepEqual(['deposit1', 'deposit2', 'deposit3'].map(x => k(x) && k(x).amount), [2000, 2000, 2000], '200% of 1,000 · 100% of 2,000 · 50% of 4,000');
  assert.equal(b.bonuses.length, 3, 'the 4th deposit earns nothing');
  assert.equal(k('deposit1').required, 10000); assert.equal(k('deposit1').status, 'active');
  assert.equal(await balance(token), 13000, 'bonuses are locked, not in the balance');
  assert.deepEqual(b.ladder.steps.map(x => x.status), ['active', 'active', 'active']);

  // a multiple with a leg under 1.50 does not count; two 1.50+ multiples of 5,000 release deposit 1 only
  const [e1, e2, e3, e4, e5, e6] = open1x2();
  const low = (() => { const o = e5.markets.find(m => m.key === '1x2').outcomes; const x = ['1', 'X', '2'].sort((a, c) => o[a].o - o[c].o)[0]; return { eventId: e5.id, market: '1x2', outcome: x, odd: o[x].o }; })();
  const s1 = [pick(e1), pick(e2)], s2 = [pick(e3), pick(e4)];
  assert.ok(s1.every(Boolean) && s2.every(Boolean), 'fixtures with a price of 1.50+');
  await multiple(token, s1, 5000); await multiple(token, s2, 5000);
  if (low.odd < 1.5) await multiple(token, [low, pick(e6)], 1000);
  const before = await balance(token);
  for (const e of [e1, e2, e3, e4, e5, e6]) await finish(e, 1, 0);
  await sleep(300);
  b = await api('/wallet/bonuses', null, token);
  assert.equal(k('deposit1') && b.bonuses.find(x => x.kind === 'deposit1').status, 'released', 'deposit 1 released once 10,000 was staked on qualifying multiples');
  assert.equal(b.bonuses.find(x => x.kind === 'deposit2').wagered, 0, 'the same stake never counts towards two bonuses');
  assert.equal(b.bonuses.find(x => x.kind === 'deposit3').wagered, 0);
  const tx = (await api('/wallet/transactions', null, token)).transactions.filter(t => t.type === 'bonus');
  assert.ok(tx.length === 1 && tx[0].amount === 2000, 'only deposit 1 is paid into the balance');
  const bets = (await api('/bets?status=settled', null, token)).bets, won = bets.reduce((sum, x) => sum + (x.status === 'won' ? +x.paid : 0), 0);
  assert.equal(await balance(token), r2(before + won + 2000));
});

test('Refer & Earn: the referrer is paid once, when the friend has staked the reward amount', async () => {
  const R = await newUser();
  const info = await api('/auth/referrals', null, R.token);
  assert.equal(info.code, 'LB' + R.user.uid); assert.equal(info.joined, 0); assert.equal(info.reward, 1000);
  const F = await newUser({ deposit: 5000, ref: info.code });
  assert.equal((await api('/auth/referrals', null, R.token)).joined, 1);
  const [e1, e2] = open1x2();
  await api('/bets/place', { type: 'single', selections: [pick(e1, 1.01)], stakes: [500], acceptChanges: true }, F.token);
  await sleep(300);
  assert.equal(await balance(R.token), 0, 'not yet: the friend has staked 500 of 1,000');
  await api('/bets/place', { type: 'single', selections: [pick(e2, 1.01)], stakes: [600], acceptChanges: true }, F.token);
  await sleep(400);
  assert.equal(await balance(R.token), 1000, 'paid once the friend has staked 1,100');
  await api('/bets/place', { type: 'single', selections: [pick(e2, 1.01)], stakes: [700], acceptChanges: true }, F.token);
  await sleep(400);
  assert.equal(await balance(R.token), 1000, 'paid only once');
  const after = await api('/auth/referrals', null, R.token);
  assert.deepEqual([after.joined, after.qualified, after.earned], [1, 1, 1000]);
  const X = await newUser({ ref: 'LB99999999' });
  assert.ok(X.token, 'an unknown code does not block sign-up');
});

test('Code Hub: booked multiples appear with real load counts; singles do not', async () => {
  const U = await newUser();
  const [e1, e2, e3] = open1x2();
  const { code } = await api('/bets/book', { selections: [pick(e1, 1.01), pick(e2, 1.01)].map(({ eventId, market, outcome }) => ({ eventId, market, outcome })) }, U.token);
  const { code: single } = await api('/bets/book', { selections: [pick(e3, 1.01)].map(({ eventId, market, outcome }) => ({ eventId, market, outcome })) }, U.token);
  let feed = await api('/bets/codes');
  const c = feed.codes.find(x => x.code === code);
  assert.ok(c && c.legs.length === 2 && c.uses === 0 && /^0\d{2}\*{4}\d{2}$/.test(c.by), 'listed with a masked booker');
  assert.ok(!feed.codes.some(x => x.code === single), 'singles are not listed');
  await api('/bets/book/' + code); await api('/bets/book/' + code);
  feed = await api('/bets/codes');
  assert.equal(feed.codes.find(x => x.code === code).uses, 2);
});

test('Acca Win Boost counts only selections at odds 1.20+', async () => {
  const { token } = await newUser({ deposit: 10000 });
  const ev = open1x2().slice(0, 4);
  const hi = ev.slice(0, 3).map(e => pick(e, 1.2));
  const a = (await multiple(token, hi, 100)).bets[0];
  assert.equal(a.boost, 5, '3 selections at 1.20+ → 5%');
  const lowEv = events.find(e => !e.used && e.markets.some(m => m.key === 'ou' && Object.values(m.outcomes).some(o => o.o && o.o < 1.2)));
  if (!lowEv) return;
  const ou = lowEv.markets.find(m => m.key === 'ou'), k = Object.keys(ou.outcomes).find(x => ou.outcomes[x].o && ou.outcomes[x].o < 1.2);
  const mixed = [...hi.slice(0, 2).filter(s => s.eventId !== lowEv.id), { eventId: lowEv.id, market: 'ou', outcome: k, odd: ou.outcomes[k].o }];
  if (mixed.length < 3) return;
  const b = (await multiple(token, mixed, 100)).bets[0];
  assert.equal(b.boost, 0, 'a selection under 1.20 does not count towards the boost');
});

test('no double bonus: a player who already had the old welcome bonus continues the ladder at Deposit 2', async () => {
  const { token, user } = await newUser();
  await db.query('UPDATE users SET verified=true WHERE id=$1', [user.id]);
  await db.query(`INSERT INTO bonuses (user_id, kind, amount, required, expires_at) VALUES ($1, 'welcome', 2000, 10000, now() + interval '14 days')`, [user.id]);
  let o = await api('/wallet/options', null, token);
  assert.equal(o.ladder.steps[0].status, 'active', 'the welcome bonus stands in for Deposit 1'); assert.equal(o.ladder.next, 2);
  for (const amount of [2000, 4000, 8000]) await api('/wallet/deposit', { amount, method: 'card' }, token);
  const b = (await api('/wallet/bonuses', null, token)).bonuses;
  assert.deepEqual(b.map(x => x.kind).sort(), ['deposit2', 'deposit3', 'welcome'], 'three bonuses in all – never four');
  assert.equal(b.find(x => x.kind === 'deposit2').amount, 2000, '100% of 2,000');
  assert.equal(b.find(x => x.kind === 'deposit3').amount, 2000, '50% of 4,000');
});
