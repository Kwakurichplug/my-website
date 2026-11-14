// Integration test: every game moves money through the ledger correctly.
// Needs a running server (API_URL, default http://127.0.0.1:8081) on a TEST database (DATABASE_URL),
// with PAYMENTS_MODE=demo (instant test deposits) and the game schedulers on.
//   API_URL=… DATABASE_URL=… node --test test/games-api.test.js
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
const fails = async (p, error) => { try { await p; } catch (e) { assert.equal(e.message, error); return; } assert.fail('expected ' + error); };
async function newUser(deposit, admin) {
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123' });
  if (admin) await db.query(`UPDATE users SET role='admin' WHERE phone=$1 AND country='NG'`, [phone]);
  if (deposit) await api('/wallet/deposit', { amount: deposit, method: 'card' }, token);
  return token;
}
let T, T2;
const balance = async (t = T) => (await api('/wallet', null, t)).balance;
async function ledgerOk(t) {
  const me = (await api('/auth/me', null, t)).user;
  const { rows } = await db.query(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [me.id]);
  assert.equal(r2(rows[0].b), r2(rows[0].s), 'ledger total = cached balance');
}

before(async () => { T = await newUser(200000, true); T2 = await newUser(1000); });
after(() => db.end());

test('instant games: the balance moves by exactly stake and payout', async () => {
  const choice = { dice: 'under', spin: undefined, penalty: 'right', rush: undefined, keno: [5, 9, 23], scratch: undefined };
  for (const [g, ch] of Object.entries(choice)) {
    for (let i = 0; i < 6; i++) {
      const b0 = await balance(), r = await api(`/games/${g}/play`, { stake: 250, choice: ch }, T);
      assert.equal(r.payout, r2(250 * r.mult), `${g} payout = stake × multiplier`);
      assert.equal(r.balance, r2(b0 - 250 + r.payout), `${g} balance`);
      assert.equal(await balance(), r.balance);
    }
  }
  for (let i = 0; i < 6; i++) {
    const d = await api('/games/hilo/deal', {}, T), ch = d.odds.higher ? 'higher' : 'lower', b0 = await balance();
    const r = await api('/games/hilo/play', { stake: 250, choice: ch, deal: d.deal }, T);
    assert.deepEqual(r.result.first, d.card, 'Hi-Lo plays the card that was dealt');
    assert.equal(r.balance, r2(b0 - 250 + r.payout));
  }
  const { plays } = await api('/games/history', null, T);
  assert.ok(plays.length >= 30 && plays.every(p => ['won', 'lost'].includes(p.status)));
  await ledgerOk(T);
});

test('rejected plays move no money', async () => {
  const b0 = await balance();
  await fails(api('/games/dice/play', { stake: 250, choice: 'banana' }, T), 'bad_choice');
  await fails(api('/games/keno/play', { stake: 250, choice: [1, 2, 3, 4, 5, 6] }, T), 'bad_choice');
  await fails(api('/games/dice/play', { stake: 50, choice: 'over' }, T), 'min_stake');
  await fails(api('/games/dice/play', { stake: 600000, choice: 'over' }, T), 'max_stake');
  await fails(api('/games/roulette/play', { stake: 250 }, T), 'unknown_game');
  await fails(api('/games/dice/play', { stake: 250, choice: 'over' }), 'login_required');
  await fails(api('/games/spin/play', { stake: 5000 }, T2), 'insufficient_funds');
  assert.equal(await balance(), b0);
});

test('Hi-Lo deals are single use and belong to one player', async () => {
  const d = await api('/games/hilo/deal', {}, T), ch = d.odds.higher ? 'higher' : 'lower';
  await api('/games/hilo/play', { stake: 100, choice: ch, deal: d.deal }, T);
  await fails(api('/games/hilo/play', { stake: 100, choice: ch, deal: d.deal }, T), 'already_played');
  const d2 = await api('/games/hilo/deal', {}, T);
  await fails(api('/games/hilo/play', { stake: 100, choice: d2.odds.higher ? 'higher' : 'lower', deal: d2.deal }, T2), 'deal_expired');
  const [payload, sig] = d2.deal.split('.'), forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), r: 0 })).toString('base64url') + '.' + sig;
  await fails(api('/games/hilo/play', { stake: 100, choice: 'higher', deal: forged }, T), 'deal_expired');
});

async function bettingWindow(minLeft = 2500) {
  for (let i = 0; i < 400; i++) {
    const s = await api('/games/crash/state');
    if (s.round && s.round.phase === 'betting' && s.round.startsAt - s.now > minLeft) return s;
    await sleep(250);
  }
  throw new Error('no betting window');
}
async function roundOver(id) {
  for (let i = 0; i < 600; i++) { const s = await api('/games/crash/state'); if (s.round && (s.round.id > id || s.round.phase === 'crashed')) return s; await sleep(250); }
  throw new Error('round did not end');
}

test('Rocket Crash: bet, cancel, re-bet, cash out, auto cash-out, provably fair', { timeout: 240000 }, async () => {
  let s = await bettingWindow(), b0 = await balance();
  const a = await api('/games/crash/bet', { stake: 500 }, T);
  assert.equal(a.round, s.round.id); assert.equal(await balance(), r2(b0 - 500));
  await api('/games/crash/cancel', {}, T); assert.equal(await balance(), b0, 'cancel refunds the stake');
  const b = await api('/games/crash/bet', { stake: 500 }, T);
  await fails(api('/games/crash/bet', { stake: 500 }, T), 'already_in_round');
  while ((await api('/games/crash/state')).round.phase === 'betting') await sleep(100);
  await fails(api('/games/crash/cancel', {}, T), 'cannot_cancel');
  let cashed = null;
  try { cashed = await api('/games/crash/cashout', {}, T); } catch (e) { assert.equal(e.message, 'crashed', 'only a 1.00x bust can beat an instant cash-out'); }
  if (cashed) { assert.equal(cashed.payout, r2(500 * cashed.mult)); assert.equal(await balance(), r2(b0 - 500 + cashed.payout)); }
  const end = await roundOver(b.round);
  const v = await api('/games/crash/verify/' + b.round);
  assert.ok(v.check.hashOk && v.check.point === v.point, 'revealed seed matches the published hash and the crash point');
  let listed = end.history.some(h => h.id === b.round);
  for (let i = 0; i < 20 && !listed; i++) { await sleep(200); listed = (await api('/games/crash/state')).history.some(h => h.id === b.round); }
  assert.ok(listed, 'the settled round appears in the public history');

  // auto cash-out at 1.01x is paid by the server unless the round busts at 1.00x
  s = await bettingWindow(); b0 = await balance();
  const c = await api('/games/crash/bet', { stake: 300, auto: 1.01 }, T);
  await roundOver(c.round); await sleep(600);
  const play = (await api('/games/history?game=crash', null, T)).plays.find(p => p.id === c.id), pt = (await api('/games/crash/verify/' + c.round)).point;
  if (pt >= 1.01) { assert.equal(play.status, 'cashed'); assert.equal(play.payout, 303); assert.equal(await balance(), r2(b0 - 300 + 303)); }
  else { assert.equal(play.status, 'lost'); assert.equal(await balance(), r2(b0 - 300)); }
  await ledgerOk(T);
});

test('Weekly Jackpot: tickets must match the round; graded and paid automatically', { timeout: 60000 }, async t => {
  const { round, prizes } = await api('/jackpot/round');
  if (!round) return t.skip('fewer than 12 open football fixtures in this test database – a round cannot be formed');
  assert.equal(round.events.length, 12);
  const ids = round.events.map(e => e.id), pick = (over = {}) => ids.map(id => ({ eventId: id, outcomes: over[id] || ['1'] }));
  await fails(api('/jackpot/tickets', { round: 'old', picks: pick() }, T), 'round_closed');
  await fails(api('/jackpot/tickets', { round: round.code, picks: pick().map((p, i) => (i ? p : { ...p, eventId: 999999 })) }, T), 'round_changed');
  const b0 = await balance();
  const A = await api('/jackpot/tickets', { round: round.code, picks: pick() }, T);
  const B = await api('/jackpot/tickets', { round: round.code, picks: pick({ [ids[0]]: ['1', 'X'] }) }, T);
  assert.equal(A.cost, prizes.NG.line); assert.equal(B.cost, 2 * prizes.NG.line);
  assert.equal(await balance(), r2(b0 - A.cost - B.cost));
  // game 1 is a draw, the other 11 are home wins → A has 11 correct; B has one 12/12 line and one 11/12 line
  for (const [i, id] of ids.entries()) await api(`/admin/events/${id}/result`, i ? { home: 1, away: 0 } : { home: 1, away: 1 }, T);
  const b1 = await balance();
  const st = await api('/admin/jackpot/settle', { round: round.code }, T);
  assert.deepEqual(st.settled, [round.code]);
  const tk = (await api('/jackpot/tickets', null, T)).tickets, ta = tk.find(t => t.ref === A.ref), tb = tk.find(t => t.ref === B.ref);
  const sum = (await api('/jackpot/results')).rounds.find(x => x.code === round.code).summary.NG;
  assert.equal(ta.status, 'won'); assert.equal(ta.prize, prizes.NG.t11); assert.deepEqual(ta.hits, { 12: 0, 11: 1, 10: 0 });
  assert.equal(tb.status, 'won'); assert.equal(tb.prize, r2(sum.t12.prize + prizes.NG.t11)); assert.ok(sum.t12.lines >= 1);
  assert.equal(await balance(), r2(b1 + ta.prize + tb.prize));
  const next = await api('/jackpot/round');
  assert.ok(!next.round || next.round.code !== round.code, 'a settled round is not sold again');
  await ledgerOk(T);
});

test('no past-posting: a pre-match price disappears at kick-off', async t => {
  const ev = (await api('/events?status=scheduled&sport=football&limit=50')).events.find(e => e.markets.some(m => m.key === '1x2' && !m.suspended));
  if (!ev) return t.skip('no open football fixture in this test database');
  await db.query(`UPDATE events SET kickoff = now() - interval '1 minute' WHERE id=$1`, [ev.id]);
  const o = ev.markets.find(m => m.key === '1x2').outcomes['1'].o;
  await fails(api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd: o }], stakes: [100] }, T), 'selection_unavailable');
});

test('Virtual League: real bets, settled when the round is played', { timeout: 60000 }, async () => {
  const evs = (await api('/events?sport=vfootball&status=scheduled&limit=20')).events;
  assert.ok(evs.length >= 6, 'a round of six matches is open');
  const ev = evs[0], o = ev.markets.find(m => m.key === '1x2').outcomes['1'].o, b0 = await balance();
  const { bets } = await api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd: o }], stakes: [200] }, T);
  assert.equal(await balance(), r2(b0 - 200));
  await db.query(`UPDATE events SET kickoff = now() - interval '1 second' WHERE sport='vfootball' AND status='scheduled' AND kickoff = $1`, [ev.kickoff]);
  let bet;
  for (let i = 0; i < 40; i++) { bet = (await api('/bets?status=settled', null, T)).bets.find(x => x.id === bets[0].id); if (bet) break; await sleep(500); }
  assert.ok(bet && ['won', 'lost'].includes(bet.status), 'the virtual bet settled');
  assert.equal(await balance(), r2(b0 - 200 + (bet.status === 'won' ? 200 * o : 0)));
  let fresh = [];
  for (let i = 0; i < 15; i++) { fresh = (await api('/events?sport=vfootball&status=scheduled&limit=20')).events.filter(e => new Date(e.kickoff) > new Date()); if (fresh.length >= 6) break; await sleep(200); }
  assert.ok(fresh.length >= 6 && fresh[0].id !== ev.id, 'the next round is already open');
  await ledgerOk(T);
});
