// Integration: live betting on a hand-added match, run by the admin. Off by default; on, its markets are open only
// while the admin keeps the score fresh; a goal pauses betting; a stale score closes it (at the leader AND at bet time).
// Runs on the Moolre test server started with MANUAL_TICK_MS=1000 (see agents.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.MOOLRE_API_URL;
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { http: res.status, ...(await res.json().catch(() => ({}))) };
}
async function player(name) {
  const phone = '24' + String(Math.floor(1e6 + Math.random() * 9e6));
  const r = await api('/auth/register', { country: 'GH', phone, password: 'Strong123', fullName: name });
  assert.ok(r.token, JSON.stringify(r)); return { token: r.token, user: r.user, phone };
}
const tag = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; let v; while (Date.now() < end) { v = await fn(); if (v) return v; await sleep(250); } return v; };
let ADMIN;
before(async () => { if (skip) return; const a = await player('Admin Live'); await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.user.id]); ADMIN = a.token; });
after(() => db.end());

test('admin-run live betting on a hand-added match: fresh score only, goal pause, stale closes', { skip }, async () => {
  const m = await api('/admin/events', { league: { name: 'Live Cup ' + tag(), country: 'Ghana', flag: 'gh' }, home: 'Hearts ' + tag(), away: 'Kotoko ' + tag(), kickoff: new Date(Date.now() + 600000).toISOString(), odds: { home: 2.1, draw: 3.3, away: 3.4 }, inplay: false }, ADMIN);
  assert.ok(m.id, JSON.stringify(m));
  await db.query(`UPDATE events SET kickoff = now() - interval '20 minutes' WHERE id=$1`, [m.id]);
  const p = await player('Live Punter');
  await db.query('UPDATE users SET balance = 100 WHERE id=$1', [p.user.id]);
  await db.query(`INSERT INTO transactions (user_id, type, amount, ref) VALUES ($1,'adjust',100,'test')`, [p.user.id]).catch(() => {});
  const x12 = async () => (await api(`/events/${m.id}?fresh=${Date.now()}`)).event || (await api(`/events/${m.id}?fresh=${Date.now()}`));
  const mk = e => (e.markets || []).find(k => k.key === '1x2');
  const bet = async (o, ok) => api('/bets/place', { type: 'single', stakes: [5], selections: [{ eventId: m.id, market: '1x2', outcome: ok, odd: o }] }, p.token);

  // live scoring without live betting: closed, as before
  let r = await api(`/admin/events/${m.id}/live`, { home: 0, away: 0, period: 'H1' }, ADMIN);
  assert.equal(r.inplay, false); assert.equal(r.open, false);
  assert.ok(mk(await x12()).suspended, 'closed while live betting is off');

  // the admin turns live betting on → open, priced from the score and the clock (draw shorter than before kick-off)
  r = await api(`/admin/events/${m.id}/live`, { home: 0, away: 0, period: 'H1', inplay: true }, ADMIN);
  assert.equal(r.open, true);
  let e = await x12(), k = mk(e);
  assert.equal(k.suspended, false); assert.ok(k.outcomes.X.o < 3.3, 'the draw shortens after 20 minutes at 0-0: ' + k.outcomes.X.o);
  const b1 = await bet(k.outcomes.X.o, 'X'); assert.ok(b1.bets, JSON.stringify(b1));

  // a goal → betting paused, then reopened at the new prices by the leader
  r = await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'H1' }, ADMIN);
  assert.equal(r.open, false, 'goal stop');
  assert.equal((await bet(k.outcomes['1'].o, '1')).error, 'selection_unavailable', 'no bets during the goal stop');
  e = await until(async () => { const v = await x12(); return !mk(v).suspended && v; }, 14000);
  assert.ok(e, 'reopened after the goal stop'); assert.ok(mk(e).outcomes['1'].o < k.outcomes['1'].o, 'home shorter after their goal');

  // the score goes stale → closed at bet time at once, and by the leader
  await db.query(`UPDATE events SET stats = stats || jsonb_build_object('scoreAt', (now() - interval '4 minutes')::text, 'openUntil', (now() - interval '1 minute')::text) WHERE id=$1`, [m.id]);
  assert.equal((await bet(mk(e).outcomes['2'].o, '2')).error, 'selection_unavailable', 'a stale score never takes a bet');
  assert.ok(await until(async () => mk(await x12()).suspended), 'the leader closes the markets');
  // confirming the score reopens it
  r = await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'H1' }, ADMIN);
  assert.equal(r.open, true);
  // turning it off closes it
  r = await api(`/admin/events/${m.id}/live`, { home: 1, away: 0, period: 'H1', inplay: false }, ADMIN);
  assert.equal(r.open, false); assert.ok(mk(await x12()).suspended);
});

test('created matches: live betting opens by itself at kick-off and shows on the Live desk; can be switched off before', { skip }, async () => {
  const mk = async id => ((await api(`/events/${id}?fresh=${Date.now()}`)).event || {}).markets?.find(k => k.key === '1x2');
  const add = async extra => api('/admin/events', { league: { name: 'Auto Cup ' + tag(), country: 'Ghana', flag: 'gh' }, home: 'Aduana ' + tag(), away: 'Medeama ' + tag(), kickoff: new Date(Date.now() + 600000).toISOString(), odds: { home: 2.4, draw: 3.1, away: 2.9 }, ...extra }, ADMIN);
  const a = await add({}), b = await add({});
  assert.equal((await api(`/admin/events/${b.id}/inplay`, { on: false }, ADMIN)).inplay, false, 'switched off before kick-off');
  await db.query(`UPDATE events SET kickoff = now() - interval '2 minutes' WHERE id = ANY($1)`, [[a.id, b.id]]);
  // the leader kicks them off: A opens by itself (score 0-0), B stays closed
  const status = async id => ((await api(`/events/${id}?fresh=${Date.now()}`)).event || {}).status;
  assert.ok(await until(async () => (await status(a.id)) === 'live' && (await status(b.id)) === 'live', 8000), 'kicked off');
  assert.ok(await until(async () => { const k = await mk(a.id); return k && !k.suspended; }, 8000), 'opened at kick-off');
  assert.ok((await mk(b.id)).suspended, 'off = closed');
  const desk = await api('/admin/live-desk', null, ADMIN);
  const d = desk.matches.find(x => x.id == a.id);
  assert.ok(d && d.status === 'live' && d.stats.inplay && d.open && d.stats.liveScoring, JSON.stringify(d)); assert.ok(desk.freshSec >= 60);
  assert.equal((await api('/admin/live-desk', null, (await player('Nosy')).token)).http, 403);
  // nobody keeps the score → it closes by itself
  await db.query(`UPDATE events SET stats = stats || jsonb_build_object('scoreAt', (now() - interval '4 minutes')::text, 'openUntil', (now() - interval '1 minute')::text) WHERE id=$1`, [a.id]);
  assert.ok(await until(async () => (await mk(a.id)).suspended), 'closed when the score is stale');
  // one tap on the desk reopens it
  assert.equal((await api(`/admin/events/${a.id}/live`, { home: 0, away: 0, period: 'H1' }, ADMIN)).open, true);
});
