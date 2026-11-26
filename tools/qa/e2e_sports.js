// Multi-sport live feed, end to end against the mock Odds API (no credits): NBA games arrive with
// Winner / Handicap / Total from the bookmakers' lines, tennis (no results feed) never appears, betting
// closes at tip-off, and bets placed before it settle from the final score.
//
//   node tools/qa/mock_oddsapi.js tools/qa 9099 &
//   (server) ODDS_PROVIDER=oddsapi ODDS_API_BASE=http://127.0.0.1:9099/v4 ODDS_API_KEY=test PORT=8090 DATABASE_URL=<fresh db> node src/index.js
//   node tools/qa/e2e_sports.js http://127.0.0.1:8090/ <fresh db url> [mockUrl]
const { execFileSync } = require('child_process');
const BASE = process.argv[2] || 'http://127.0.0.1:8090/', DB = process.argv[3], MOCK = process.argv[4] || 'http://127.0.0.1:9099';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const api = async (path, body, token) => {
  const r = await fetch(BASE + 'api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const sql = s => execFileSync('psql', [DB, '-Atc', s]).toString().trim();
const wait = async (f, ms, step = 2000) => { const end = Date.now() + ms; for (;;) { const v = await f().catch(() => null); if (v || Date.now() > end) return v; await new Promise(r => setTimeout(r, step)); } };

(async () => {
  const nba = await wait(async () => { const { events } = await api('/events?sport=basketball'); return events && events.length >= 2 && events.every(e => e.markets.length === 3) && events; }, 120000);
  ok(nba && nba.length === 2, `NBA games listed (${nba ? nba.length : 0})`);
  if (!nba) process.exit(1);
  const g = nba.find(e => e.home === 'Los Angeles Lakers'), M = Object.fromEntries(g.markets.map(m => [m.key, m]));
  ok(g.league.name === 'NBA' && g.sport === 'basketball', 'league NBA, sport basketball');
  ok(Object.keys(M).sort().join() === 'spr,tot,win', 'markets: Winner, Handicap, Total');
  ok(Object.keys(M.spr.outcomes).sort().join() === '-2.5|1,-2.5|2', 'handicap: the popular line (-2.5); -3 from a single book is left out');
  ok(Object.keys(M.tot.outcomes).sort().join() === 'o224.5,u224.5', 'total line 224.5');
  const book = m => Object.values(m.outcomes).reduce((s, o) => s + 1 / o.o, 0);
  ok(['win', 'spr', 'tot'].every(k => book(M[k]) > 1.01 && book(M[k]) < 1.15), 'every market carries the margin on both sides');
  const ten = await api('/events?sport=tennis');
  ok(ten.events.length === 0, 'no tennis (no results feed for it, so nothing that could not settle)');

  // a player bets on the Lakers game before tip-off
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Sports123' });
  await api('/wallet/deposit', { amount: 10000, method: 'card' }, token);
  const sel = (mk, k) => ({ eventId: g.id, market: mk, outcome: k, odd: M[mk].outcomes[k].o });
  const placed = await api('/bets/place', { type: 'single', selections: [sel('win', '1'), sel('spr', '-2.5|1'), sel('tot', 'u224.5'), sel('spr', '-2.5|2')], stakes: [500, 500, 500, 500] }, token);
  ok(!placed.error, 'four singles placed: Lakers to win, Lakers -2.5, Under 224.5, Celtics +2.5' + (placed.error ? ' ' + JSON.stringify(placed) : ''));

  // tip-off passes, the game ends 110-104 (total 214)
  sql(`UPDATE events SET kickoff = now() - interval '200 minutes' WHERE id = ${g.id}`);
  await fetch(MOCK + '/__state', { method: 'POST', body: JSON.stringify({ nbaDone: true, nbaScore: [110, 104] }) });
  const live = await wait(async () => { const { event } = await api('/events/' + g.id); return event.status !== 'scheduled' && event; }, 60000);
  ok(live && live.markets.every(m => m.suspended), 'after tip-off every market is closed');
  const late = await api('/bets/place', { type: 'single', selections: [sel('win', '2')], stakes: [500] }, token);
  ok(late.error === 'selection_unavailable', 'no bets after tip-off');
  const fin = await wait(async () => { const { event } = await api('/events/' + g.id); return event.status === 'finished' && event; }, 180000);
  ok(fin && fin.score.join('-') === '110-104', 'final score 110-104 from the results call');
  const bets = await wait(async () => { const r = await api('/bets?status=settled', null, token); return r.bets && r.bets.length === 4 && r.bets; }, 60000);
  const st = bets ? Object.fromEntries(bets.map(b => [b.legs[0].market + ' ' + b.legs[0].outcome, b.status])) : {};
  ok(st['win 1'] === 'won' && st['spr -2.5|1'] === 'won' && st['tot u224.5'] === 'won' && st['spr -2.5|2'] === 'lost', 'settled correctly: ' + JSON.stringify(st));
  const left = await api('/events?sport=basketball');
  ok(left.events.length === 1 && left.events[0].home === 'Golden State Warriors', 'the other game is still open for bets');
  process.exit(fails ? 1 : 0);
})();
