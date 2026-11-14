// Mock of The Odds API v4 built from a real EPL sample. Shifts kick-offs so one match is in play
// (fresh scores) and one has finished, to exercise the adapter without spending credits.
const http = require('http');
const fs = require('fs');
const S = process.argv[2], PORT = +process.argv[3] || 9099;
const sample = JSON.parse(fs.readFileSync(S + '/fixtures/epl_odds.json'));
let remaining = 480;
const now = Date.now();
const evs = sample.map((e, i) => ({ ...e, commence_time: new Date(i === 0 ? now - 30 * 60e3 : i === 1 ? now - 130 * 60e3 : now + (i + 1) * 3600e3).toISOString() }));
const state = { liveScore: [1, 0], finalScore: [2, 1] };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/v4\/sports\/([^/]+)\/(odds|scores)/);
  const send = (body, cost) => { remaining -= cost; res.writeHead(200, { 'content-type': 'application/json', 'x-requests-remaining': remaining, 'x-requests-last': cost, 'x-requests-used': 500 - remaining }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/__state') { let b = ''; req.on('data', c => b += c); req.on('end', () => { Object.assign(state, JSON.parse(b || '{}')); res.end('ok'); }); return; }
  if (!m) { res.writeHead(404); return res.end('{}'); }
  if (!u.searchParams.get('apiKey')) { res.writeHead(401); return res.end('{"message":"no key"}'); }
  const [, key, kind] = m;
  if (key !== 'soccer_epl') return send([], kind === 'odds' ? 2 : 1);
  if (kind === 'odds') return send(evs, 2);
  const daysFrom = u.searchParams.get('daysFrom');
  send(evs.map((e, i) => ({ id: e.id, sport_key: key, commence_time: e.commence_time, completed: i === 1 && !!daysFrom, home_team: e.home_team, away_team: e.away_team,
    scores: i === 0 ? [{ name: e.home_team, score: String(state.liveScore[0]) }, { name: e.away_team, score: String(state.liveScore[1]) }]
      : i === 1 ? [{ name: e.home_team, score: String(state.finalScore[0]) }, { name: e.away_team, score: String(state.finalScore[1]) }] : null, last_update: new Date().toISOString() })), daysFrom ? 2 : 1);
}).listen(PORT, () => console.log('mock odds api on', PORT));
