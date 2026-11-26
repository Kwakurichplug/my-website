// Real matches in play. (1) Unit: pairing the two feeds' team names. (2) With the live-score feed (mock API-Football on
// the Moolre test server: APIFOOTBALL_KEY, APIFOOTBALL_BASE, APIFOOTBALL_POLL_SEC=5): real minute and score, a goal
// pauses then re-prices, closes at 80', bets wait the in-play delay. (3) Without a live score ("blind"): open with the
// per-player stake cap per match, longer delay, closed at 80' – run with the odds feed's live tick in this process.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { sameTeam, pair } from '../src/feeds/livescores.js';

const BASE = process.env.MOOLRE_API_URL, MOCK = process.env.MOCK_APIFOOTBALL || 'http://127.0.0.1:9101';
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { http: res.status, ...(await res.json().catch(() => ({}))) };
}
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(300); } return v; };
const tag = () => Math.random().toString(36).slice(2, 7);
async function realMatch(home, away, minsAgo) {
  const lg = (await db.query(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ('football','Test League','England','gb-eng',false,$1) RETURNING id`, ['oa:test_' + tag()])).rows[0].id;
  const { rows } = await db.query(`INSERT INTO events (id, ext_id, sport, league_id, home, away, kickoff, status, minute, score_home, score_away, stats, model)
    VALUES ($6,$1,'football',$2,$3,$4, now() - make_interval(mins => $5),'live',1,0,0,'{}'::jsonb,'{"lh":1.5,"la":1.0}'::jsonb) RETURNING id, kickoff`, ['oa:' + tag(), lg, home, away, minsAgo, 800000000 + Math.floor(Math.random() * 9e6)]);
  await db.query(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended) VALUES ($1,'1x2','1X2','Main',3,'{"1":{"l":"Home","o":1.8},"X":{"l":"Draw","o":3.4},"2":{"l":"Away","o":4.5}}',true)`, [rows[0].id]);
  return rows[0];
}
const x12 = async id => (await db.query(`SELECT suspended, outcomes FROM markets WHERE event_id=$1 AND key='1x2'`, [id])).rows[0];
async function player(cc = 'GH') {
  const phone = '24' + String(Math.floor(1e6 + Math.random() * 9e6)), r = await api('/auth/register', { country: cc, phone, password: 'Strong123', fullName: 'Live Player' });
  await db.query('UPDATE users SET balance=500 WHERE id=$1', [r.user.id]); return r;
}
after(() => db.end());

test('pairing team names across the two feeds', () => {
  assert.equal(sameTeam('Wolverhampton Wanderers', 'Wolves'), 1);
  assert.equal(sameTeam('Manchester United', 'Manchester Utd'), 1);
  assert.equal(sameTeam('Brighton and Hove Albion', 'Brighton'), 1);
  assert.equal(sameTeam('Tottenham Hotspur', 'Spurs'), 1);
  assert.ok(sameTeam('Atlético Madrid', 'Atletico Madrid') === 1);
  assert.equal(sameTeam('Manchester City', 'Manchester United'), 0, 'two clubs of one city');
  assert.equal(sameTeam('Sheffield United', 'Sheffield Wednesday'), 0);
  assert.ok(sameTeam('Real Madrid', 'Real Betis') < 0.75, 'a shared generic word is not enough');
  assert.equal(sameTeam('Inter', 'Inter Milan'), 1);
  const ko = new Date(), fx = (h, a, mins) => ({ fixture: { id: Math.random(), date: new Date(ko.getTime() + mins * 60000).toISOString() }, teams: { home: { name: h }, away: { name: a } } });
  const list = [fx('Chelsea', 'Arsenal', 0), fx('Wolves', 'Fulham', 0), fx('Wolves', 'Everton', 90)];
  assert.equal(pair({ home: 'Wolverhampton Wanderers', away: 'Fulham', kickoff: ko }, list).teams.away.name, 'Fulham');
  assert.equal(pair({ home: 'Wolverhampton Wanderers', away: 'Everton', kickoff: ko }, list), null, 'kick-off must agree');
  assert.equal(pair({ home: 'Liverpool', away: 'Arsenal', kickoff: ko }, list), null, 'both teams must agree');
});

test('with the live-score feed: real minute and score, goal pause, re-price, closed at 80\'', { skip: skip || (!process.env.MOCK_APIFOOTBALL && 'set MOCK_APIFOOTBALL') }, async () => {
  const H = 'Wolverhampton Wanderers ' + tag(), Aw = 'Manchester United ' + tag();
  const e = await realMatch(H, Aw, 30);
  const fixture = (el, short, gh, ga) => ({ fixture: { id: 777000 + (e.id % 1000), date: new Date(e.kickoff).toISOString(), status: { short, elapsed: el, extra: null } },
    teams: { home: { name: H.replace('Wolverhampton Wanderers', 'Wolves') }, away: { name: Aw.replace('Manchester United', 'Manchester Utd') } }, goals: { home: gh, away: ga }, score: { halftime: { home: null, away: null } } });
  await fetch(MOCK + '/__state', { method: 'POST', body: JSON.stringify({ fixtures: [fixture(31, '1H', 0, 0)] }) });
  assert.ok(await until(async () => { const r = (await db.query('SELECT minute, stats FROM events WHERE id=$1', [e.id])).rows[0]; return r.minute === 31 && r.stats.liveSource === 'apifootball'; }, 12000), 'real minute from the feed');
  const k0 = await until(async () => { const k = await x12(e.id); return !k.suspended && k; });
  assert.ok(k0, 'open while the score is fresh');
  // an in-play bet waits the delay
  const p = await player(), t0 = Date.now();
  const b = await api('/bets/place', { type: 'single', stakes: [10], selections: [{ eventId: e.id, market: '1x2', outcome: 'X', odd: k0.outcomes.X.o }] }, p.token);
  assert.ok(b.bets, JSON.stringify(b)); assert.ok(Date.now() - t0 >= 4500, 'confirmed after the in-play delay');
  // goal → paused, then re-priced with the scorers shorter
  await fetch(MOCK + '/__state', { method: 'POST', body: JSON.stringify({ fixtures: [fixture(34, '1H', 1, 0)] }) });
  assert.ok(await until(async () => (await db.query('SELECT score_home FROM events WHERE id=$1', [e.id])).rows[0].score_home === 1, 12000), 'goal');
  assert.ok((await x12(e.id)).suspended, 'paused right after the goal');
  const k1 = await until(async () => { const k = await x12(e.id); return !k.suspended && k; }, 16000);
  assert.ok(k1 && k1.outcomes['1'].o < k0.outcomes['1'].o, 'reopened, home shorter');
  // 81st minute → closed for the rest of the match
  await fetch(MOCK + '/__state', { method: 'POST', body: JSON.stringify({ fixtures: [fixture(81, '2H', 1, 0)] }) });
  assert.ok(await until(async () => (await x12(e.id)).suspended, 12000), 'closed at 80\'');
  await fetch(MOCK + '/__state', { method: 'POST', body: JSON.stringify({ fixtures: [] }) });
});

test('without a live score: open with the stake cap per player, longer delay, closed at 80\'', { skip }, async () => {
  const { liveTick } = await import('../src/feeds/oddsapi.js');
  const e = await realMatch('Blind Home ' + tag(), 'Blind Away ' + tag(), 30);
  await liveTick();
  const k = await x12(e.id);
  assert.equal(k.suspended, false, 'open without a score (blind)');
  assert.equal((await db.query('SELECT stats FROM events WHERE id=$1', [e.id])).rows[0].stats.blind, true);
  const p = await player();
  const over = await api('/bets/place', { type: 'single', stakes: [25], selections: [{ eventId: e.id, market: '1x2', outcome: '1', odd: k.outcomes['1'].o }] }, p.token);
  assert.equal(over.error, 'inplay_max_stake'); assert.equal(over.detail.max, 20);
  const t0 = Date.now();
  const ok = await api('/bets/place', { type: 'single', stakes: [15], selections: [{ eventId: e.id, market: '1x2', outcome: '1', odd: k.outcomes['1'].o }] }, p.token);
  assert.ok(ok.bets, JSON.stringify(ok)); assert.ok(Date.now() - t0 >= 7500, 'longer delay without a live score');
  assert.equal((await api('/bets/place', { type: 'single', stakes: [10], selections: [{ eventId: e.id, market: '1x2', outcome: '1', odd: k.outcomes['1'].o }] }, p.token)).error, 'inplay_max_stake', 'the cap is per match, all bets together');
  // past 80' → closed
  await db.query(`UPDATE events SET kickoff = now() - interval '100 minutes' WHERE id=$1`, [e.id]);
  await liveTick();
  assert.ok((await x12(e.id)).suspended, 'closed at 80\'');
  await db.query(`UPDATE events SET status='cancelled' WHERE id=$1`, [e.id]);
});
