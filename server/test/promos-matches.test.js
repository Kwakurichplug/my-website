// Integration: promo codes (admin creates, players redeem once, limits hold under concurrency, bonus unlocks by
// turnover or is cash at once) and matches the manager adds by hand (priced from the 1X2, betting closes at
// kick-off, settled only with a result after kick-off, cancel refunds). Runs on the Moolre test server
// (see moolre-api.test.js) started with MANUAL_TICK_MS=1000:
//   MOOLRE_API_URL=http://127.0.0.1:8097 MOCK_MOOLRE=http://127.0.0.1:9099 DATABASE_URL=… node --test test/promos-matches.test.js
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
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ...j };
}
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7));
const tag = () => Math.random().toString(36).slice(2, 8).toUpperCase();
async function player(cc = 'GH', opts = {}) {
  const phone = cc === 'GH' ? '24' + rnd().slice(0, 7) : '80' + rnd();
  const o = await api('/auth/otp', { country: cc, phone, purpose: 'register' });
  const r = await api('/auth/register', { country: cc, phone, code: o.devCode, password: 'Strong123', fullName: 'Ama Test' });
  assert.ok(r.token, JSON.stringify(r));
  if (opts.admin) await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [r.user.id]);
  return { token: r.token, user: r.user, phone };
}
const bal = async t => (await api('/wallet', null, t)).balance;
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(150); } return v; };
async function deposit(p, amount) {
  const before = await bal(p.token);
  const d = await api('/wallet/deposit', { amount, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  const ref = (await db.query('SELECT provider_ref FROM payments WHERE id=$1', [d.paymentId])).rows[0].provider_ref;
  await fetch(`${MOCK}/__approve/${ref}`, { method: 'POST' });
  assert.ok(await until(async () => (await bal(p.token)) === before + amount), 'deposit credited');
}
const ledgerOk = async uid => { const { rows } = await db.query(`SELECT u.balance::float AS b, (SELECT coalesce(sum(amount),0)::float FROM transactions WHERE user_id=u.id) AS s FROM users u WHERE u.id=$1`, [uid]); assert.equal(Math.round(rows[0].b * 100), Math.round(rows[0].s * 100), 'ledger = balance'); };
const soon = (min = 10) => new Date(Date.now() + min * 60000).toISOString();

let ADMIN;
before(async () => { if (!skip) ADMIN = (await player('GH', { admin: true })).token; });
after(() => db.end());

test('promo codes: admin validation, deposit first, once per player, country, use limit, pause', { skip }, async () => {
  const code = 'GH' + tag();
  assert.equal((await api('/admin/promos', { code: 'BAD-CODE!', country: 'GH', amount: 10 }, ADMIN)).error, 'invalid');
  assert.equal((await api('/admin/promos', { code, country: 'GH', amount: 99999 }, ADMIN)).error, 'amount_too_high');
  assert.equal((await api('/admin/promos', { code: code.toLowerCase(), country: 'GH', amount: 20, times: 5, days: 7, maxUses: 2, note: 'test' }, ADMIN)).code, code, 'codes are upper-cased');
  assert.equal((await api('/admin/promos', { code, country: 'GH', amount: 5 }, ADMIN)).error, 'code_taken');
  const p = await player();
  assert.equal((await api('/admin/promos', null, p.token)).status, 403, 'players cannot see the codes');
  const r0 = await api('/wallet/promo', { code }, p.token);
  assert.equal(r0.status, 403); assert.equal(r0.error, 'deposit_first');
  await deposit(p, 50);
  const r1 = await api('/wallet/promo', { code: ' ' + code.toLowerCase() + ' ' }, p.token);
  assert.equal(r1.released, false); assert.equal(r1.amount, 20); assert.equal(r1.required, 100);
  assert.equal(await bal(p.token), 50, 'a locked bonus is not cash');
  const b = (await api('/wallet/bonuses', null, p.token)).bonuses.find(x => x.kind === 'promo:' + code);
  assert.ok(b); assert.equal(b.status, 'active'); assert.equal(b.required, 100);
  assert.equal((await api('/wallet/promo', { code }, p.token)).error, 'already_used');
  assert.equal((await api('/wallet/promo', { code: 'NOPE' + tag() }, p.token)).error, 'invalid_code');
  const ng = await player('NG');
  assert.equal((await api('/wallet/promo', { code }, ng.token)).error, 'invalid_code', 'a Ghana code does not work in Nigeria');
  const p2 = await player(); await deposit(p2, 20);
  assert.equal((await api('/wallet/promo', { code }, p2.token)).amount, 20);
  const p3 = await player(); await deposit(p3, 20);
  assert.equal((await api('/wallet/promo', { code }, p3.token)).error, 'used_up', 'max 2 players');
  const list = (await api('/admin/promos', null, ADMIN)).promos.find(x => x.code === code);
  assert.equal(list.uses, 2); assert.equal(list.given, 40);
  const c2 = 'P' + tag();
  await api('/admin/promos', { code: c2, country: 'GH', amount: 5 }, ADMIN);
  assert.equal((await api('/admin/promos/' + c2, { active: false }, ADMIN)).ok, true);
  assert.equal((await api('/wallet/promo', { code: c2 }, p3.token)).error, 'invalid_code', 'paused');
  await api('/admin/promos/' + c2, { active: true }, ADMIN);
  assert.equal((await api('/wallet/promo', { code: c2 }, p3.token)).amount, 5);
  await ledgerOk(p.user.id);
});

test('promo codes: last use cannot be taken twice at once; cash codes pay at once', { skip }, async () => {
  const code = 'ONE' + tag();
  await api('/admin/promos', { code, country: 'GH', amount: 15, times: 0, maxUses: 1, requiresDeposit: false }, ADMIN);
  const ps = await Promise.all([player(), player(), player(), player()]);
  const rs = await Promise.all(ps.map(p => api('/wallet/promo', { code }, p.token)));
  assert.equal(rs.filter(r => r.amount === 15).length, 1, 'exactly one player got it');
  assert.equal(rs.filter(r => r.error === 'used_up').length, 3);
  const winner = ps[rs.findIndex(r => r.amount === 15)];
  assert.equal(rs.find(r => r.amount === 15).released, true);
  assert.equal(await bal(winner.token), 15, 'cash code: straight into the balance');
  const tx = (await db.query(`SELECT type, amount::float, ref FROM transactions WHERE user_id=$1`, [winner.user.id])).rows;
  assert.deepEqual(tx, [{ type: 'bonus', amount: 15, ref: 'PC-' + code }]);
  await ledgerOk(winner.user.id);
});

test('manual matches: priced from the 1X2, refused when unsafe, listed for players', { skip }, async () => {
  const lg = await api('/admin/leagues', null, ADMIN);
  assert.ok(Array.isArray(lg.leagues));
  const pv = await api('/admin/events/preview', { odds: { home: 2.1, draw: 3.3, away: 3.4 } }, ADMIN);
  assert.ok(pv.margin > 5 && pv.margin < 9, 'margin ' + pv.margin); assert.ok(pv.markets >= 30);
  assert.equal((await api('/admin/events/preview', { odds: { home: 3, draw: 3.5, away: 3.5 } }, ADMIN)).error, 'odds_too_high', 'odds that pay out more than staked are refused');
  const L = { name: 'Test Division ' + tag(), country: 'Ghana', flag: 'gh' }, home = 'Accra Lions ' + tag(), away = 'Tema Youth ' + tag();
  assert.equal((await api('/admin/events', { league: L, home, away, kickoff: soon(2), odds: { home: 2.1, draw: 3.3, away: 3.4 } }, ADMIN)).error, 'kickoff_too_soon');
  assert.equal((await api('/admin/events', { league: L, home, away: home, kickoff: soon(), odds: { home: 2.1, draw: 3.3, away: 3.4 } }, ADMIN)).error, 'same_teams');
  const m = await api('/admin/events', { league: L, home, away, kickoff: soon(), odds: { home: 2.1, draw: 3.3, away: 3.4 } }, ADMIN);
  assert.ok(m.id > 0); assert.ok(m.markets >= 30);
  assert.equal((await api('/admin/events', { league: L, home, away, kickoff: soon(20), odds: { home: 2.1, draw: 3.3, away: 3.4 } }, ADMIN)).error, 'duplicate');
  const ev = await api('/events/' + m.id);
  const e = ev.event || ev;
  assert.equal(e.home, home);
  const mk = (await db.query(`SELECT key, outcomes FROM markets WHERE event_id=$1`, [m.id])).rows;
  const x12 = mk.find(k => k.key === '1x2').outcomes;
  assert.deepEqual([x12['1'].o, x12.X.o, x12['2'].o], [2.1, 3.3, 3.4], 'the 1X2 keeps the admin’s prices');
  assert.ok(!mk.some(k => /corner|card|book/i.test(k.key)), 'no corner / card markets (cannot be settled from the score)');
  const listed = await api('/events?sport=football&limit=500');
  assert.ok((listed.events || listed).some(x => Number(x.id) === m.id), 'players see it');
  const lg2 = await api('/admin/leagues', null, ADMIN);
  assert.ok(lg2.leagues.some(l => l.name === L.name && l.manual), 'the new league can be picked next time');
});

test('manual matches: bets close at kick-off, result only after kick-off, settles and unlocks a promo bonus; cancel refunds', { skip }, async () => {
  const L = { name: 'Cup ' + tag(), country: 'Ghana', flag: 'gh' };
  // live betting off for these (it is on by default; manual-live.test.js covers that): betting closes at kick-off
  const mk = async () => (await api('/admin/events', { league: L, home: 'Home ' + tag(), away: 'Away ' + tag(), kickoff: soon(), odds: { home: 1.9, draw: 3.4, away: 4.2 }, inplay: false }, ADMIN)).id;
  const [a, b, c] = [await mk(), await mk(), await mk()];
  const p = await player(); await deposit(p, 200);
  const code = 'BET' + tag();
  await api('/admin/promos', { code, country: 'GH', amount: 10, times: 5, days: 7 }, ADMIN);
  assert.equal((await api('/wallet/promo', { code }, p.token)).required, 50);
  const placed = await api('/bets/place', { type: 'multiple', stake: 60, selections: [{ eventId: a, market: '1x2', outcome: '1', odd: 1.9 }, { eventId: b, market: '1x2', outcome: '1', odd: 1.9 }] }, p.token);
  assert.ok(placed.bets || placed.bet || placed.ok || placed.balance != null, 'multiple placed: ' + JSON.stringify(placed).slice(0, 200));
  const single = await api('/bets/place', { type: 'single', stakes: [20], selections: [{ eventId: c, market: '1x2', outcome: '2', odd: 4.2 }] }, p.token);
  assert.ok(single.status !== 400, JSON.stringify(single).slice(0, 200));
  assert.equal(await bal(p.token), 120);
  assert.equal((await api(`/admin/events/${a}/result`, { home: 2, away: 0 }, ADMIN)).error, 'not_started', 'no result before kick-off');

  await db.query(`UPDATE events SET kickoff = now() - interval '1 minute' WHERE id = ANY($1)`, [[a, b, c]]);   // the matches kick off
  assert.ok(await until(async () => (await db.query(`SELECT count(*)::int AS n FROM events WHERE id = ANY($1) AND status='live'`, [[a, b, c]])).rows[0].n === 3), 'shown as started');
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM markets WHERE event_id = ANY($1) AND NOT suspended`, [[a, b, c]])).rows[0].n, 0, 'markets closed');
  const late = await api('/bets/place', { type: 'single', stakes: [10], selections: [{ eventId: a, market: '1x2', outcome: '1', odd: 1.9 }] }, p.token);
  assert.ok(late.status >= 400, 'no bets after kick-off');
  assert.equal((await api(`/admin/events/${a}/suspend`, { suspended: false }, ADMIN)).error, 'started', 'cannot reopen after kick-off');
  assert.equal((await api(`/admin/markets/${a}/1x2`, { suspended: false }, ADMIN)).error, 'started');

  await api(`/admin/events/${a}/result`, { home: 2, away: 0 }, ADMIN);
  await api(`/admin/events/${b}/result`, { home: 1, away: 0 }, ADMIN);
  const won = Math.round(60 * 1.9 * 1.9 * 100) / 100;
  assert.ok(await until(async () => (await bal(p.token)) >= 120 + won + 10 - 0.01), 'multiple won and the promo bonus unlocked (60 staked ≥ 50 needed)');
  const pb = (await api('/wallet/bonuses', null, p.token)).bonuses.find(x => x.kind === 'promo:' + code);
  assert.equal(pb.status, 'released');
  await api(`/admin/events/${c}/result`, { home: 0, away: 0, cancelled: true }, ADMIN);
  assert.ok(await until(async () => Math.abs((await bal(p.token)) - (120 + won + 10 + 20)) < 0.01), 'cancelled match: stake refunded');
  await ledgerOk(p.user.id);
});

test('crests and live scoring for hand-added matches', { skip }, async () => {
  const L = { name: 'Crest Cup ' + tag(), country: 'Ghana', flag: 'gh' }, home = 'Tema Rovers ' + tag(), away = 'Ho Rangers ' + tag();
  assert.ok((await api('/admin/flags', null, ADMIN)).flags.includes('gh'));
  assert.equal((await api('/admin/teams/crest-flag', { name: home, flag: 'zz' }, ADMIN)).error, 'bad_flag');
  assert.equal((await api('/admin/teams/crest-flag', { name: home, flag: 'gh' }, ADMIN)).logo, '/img/flags/gh.svg');
  assert.equal((await api('/admin/teams/crest-link', { name: away, url: 'http://insecure.example/x.png' }, ADMIN)).error, 'bad_link');
  assert.equal((await api('/admin/teams/crest', { name: away, image: 'data:image/gif;base64,R0lGOD' }, ADMIN)).error, 'bad_image');
  const png = 'data:image/png;base64,' + Buffer.alloc(300, 7).toString('base64');
  const up = await api('/admin/teams/crest', { name: away, image: png }, ADMIN);
  assert.match(up.logo, /^\/api\/crests\/\d+$/);
  const img = await fetch(BASE + up.logo); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png'); assert.match(img.headers.get('cache-control'), /immutable/);
  const teams = (await api('/admin/teams?q=' + encodeURIComponent(home.slice(0, 8)), null, ADMIN)).teams;
  assert.ok(teams.some(t => t.name === home && t.logo === '/img/flags/gh.svg'), 'known teams come with their crest');
  const m = await api('/admin/events', { league: L, home, away, kickoff: soon(), odds: { home: 2, draw: 3.3, away: 3.6 } }, ADMIN);
  assert.equal(m.homeLogo, '/img/flags/gh.svg'); assert.equal(m.awayLogo, up.logo, 'a new match picks up the remembered crests');
  const ev = (await api('/events/' + m.id)); const e = ev.event || ev;
  assert.equal(e.homeLogo, '/img/flags/gh.svg');
  assert.equal((await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'H1' }, ADMIN)).error, 'not_started', 'no live score before kick-off');
  await db.query(`UPDATE events SET kickoff = now() - interval '30 minutes' WHERE id=$1`, [m.id]);
  const l1 = await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'H1' }, ADMIN);
  assert.equal(l1.home, 1); assert.equal(l1.period, 'H1'); assert.ok(l1.minute >= 30 && l1.minute <= 45);
  await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'HT' }, ADMIN);
  await api(`/admin/events/${m.id}/live`, { home: 1, away: 1, period: 'H2' }, ADMIN);
  await api(`/admin/events/${m.id}/live`, { home: 2, away: 1, period: 'H2' }, ADMIN);
  await api(`/admin/events/${m.id}/live`, { home: 1, away: 1, period: 'H2' }, ADMIN);   // a goal taken back
  const row = (await db.query(`SELECT status, score_home, score_away, period, ht_home, ht_away, stats FROM events WHERE id=$1`, [m.id])).rows[0];
  assert.equal(row.status, 'live'); assert.deepEqual([row.score_home, row.score_away, row.period, row.ht_home, row.ht_away], [1, 1, 'H2', 1, 0]);
  assert.deepEqual(row.stats.goals.map(g => g.side), [0, 1], 'the corrected goal is gone from the timeline');
  assert.equal(row.stats.noScore, false);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM markets WHERE event_id=$1 AND NOT suspended`, [m.id])).rows[0].n, 0, 'betting stays closed');
  const pub = await api(`/events/${m.id}?fresh=${Date.now()}`); const pe = pub.event || pub;   // past the 2-second match cache
  assert.deepEqual(pe.score, [1, 1]); assert.equal(pe.period, 'H2');
  assert.equal((await api(`/admin/events/${m.id}/live`, { home: -1, away: 0, period: 'H2' }, ADMIN)).error, 'invalid');
  const feedEv = (await db.query(`SELECT id FROM events WHERE ext_id NOT LIKE 'man:%' LIMIT 1`)).rows[0];
  if (feedEv) assert.equal((await api(`/admin/events/${feedEv.id}/live`, { home: 1, away: 0, period: 'H1' }, ADMIN)).error, 'not_found', 'only hand-added matches');
  assert.equal((await api(`/admin/events/${m.id}/result`, { home: 1, away: 1, htHome: 1, htAway: 0 }, ADMIN)).ok, true);
});
