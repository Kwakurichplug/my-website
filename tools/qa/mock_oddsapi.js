// Mock of The Odds API v4 built from a real EPL sample. Shifts kick-offs so one match is in play
// (fresh scores) and one has finished, to exercise the adapter without spending credits.
const http = require('http');
const fs = require('fs');
const S = process.argv[2], PORT = +process.argv[3] || 9099;
const sample = JSON.parse(fs.readFileSync(S + '/fixtures/epl_odds.json'));
let remaining = 480;
const now = Date.now();
const evs = sample.map((e, i) => ({ ...e, commence_time: new Date(i === 0 ? now - 30 * 60e3 : i === 1 ? now - 130 * 60e3 : now + (i + 1) * 3600e3).toISOString() }));
const state = { liveScore: [1, 0], finalScore: [2, 1], nbaDone: false, nbaScore: [110, 104] };
// NBA slate (two-way sport): two games later today, 4 books each; POST /__state {"nbaDone":true} finishes the first
const nba = [['nba1', 'Los Angeles Lakers', 'Boston Celtics', 3], ['nba2', 'Golden State Warriors', 'Denver Nuggets', 5]].map(([id, home_team, away_team, h]) => ({ id, sport_key: 'basketball_nba', home_team, away_team, commence_time: new Date(now + h * 3600e3).toISOString() }));
const nbaBook = (e, j) => ({ key: 'book' + j, title: 'Book ' + j, markets: [
  { key: 'h2h', outcomes: [{ name: e.home_team, price: [1.8, 1.83, 1.78, 1.8][j] }, { name: e.away_team, price: [2.05, 2.0, 2.1, 2.05][j] }] },
  { key: 'spreads', outcomes: [{ name: e.home_team, price: 1.91, point: j === 2 ? -3 : -2.5 }, { name: e.away_team, price: 1.91, point: j === 2 ? 3 : 2.5 }] },
  { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 224.5 }, { name: 'Under', price: 1.9, point: 224.5 }] }] });
const SPORTS = [['soccer_epl', true], ['basketball_nba', true], ['icehockey_nhl', false], ['americanfootball_nfl', false], ['tennis_atp_finals', true]].map(([key, active]) => ({ key, group: key.split('_')[0], title: key, active, has_outrights: false }));
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/v4\/sports\/([^/]+)\/(odds|scores)/);
  const send = (body, cost) => { remaining -= cost; res.writeHead(200, { 'content-type': 'application/json', 'x-requests-remaining': remaining, 'x-requests-last': cost, 'x-requests-used': 500 - remaining }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/__state') { let b = ''; req.on('data', c => b += c); req.on('end', () => { Object.assign(state, JSON.parse(b || '{}')); res.end('ok'); }); return; }
  if (u.pathname === '/v4/sports') return send(SPORTS, 0);   // the sports list costs no credits
  if (!m) { res.writeHead(404); return res.end('{}'); }
  if (!u.searchParams.get('apiKey')) { res.writeHead(401); return res.end('{"message":"no key"}'); }
  const [, key, kind] = m;
  if (key === 'basketball_nba') {
    if (kind === 'odds') return send(nba.filter((e, i) => !(i === 0 && state.nbaDone)).map(e => ({ ...e, bookmakers: [0, 1, 2, 3].map(j => nbaBook(e, j)) })), 3);
    const daysFrom = u.searchParams.get('daysFrom');
    return send(nba.map((e, i) => ({ ...e, completed: i === 0 && state.nbaDone && !!daysFrom, scores: i === 0 && state.nbaDone ? [{ name: e.home_team, score: String(state.nbaScore[0]) }, { name: e.away_team, score: String(state.nbaScore[1]) }] : null, last_update: new Date().toISOString() })), daysFrom ? 2 : 1);
  }
  if (key !== 'soccer_epl') return send([], kind === 'odds' ? 2 : 1);
  if (kind === 'odds') return send(evs, 2);
  const daysFrom = u.searchParams.get('daysFrom');
  send(evs.map((e, i) => ({ id: e.id, sport_key: key, commence_time: e.commence_time, completed: i === 1 && !!daysFrom, home_team: e.home_team, away_team: e.away_team,
    scores: i === 0 ? [{ name: e.home_team, score: String(state.liveScore[0]) }, { name: e.away_team, score: String(state.liveScore[1]) }]
      : i === 1 ? [{ name: e.home_team, score: String(state.finalScore[0]) }, { name: e.away_team, score: String(state.finalScore[1]) }] : null, last_update: new Date().toISOString() })), daysFrom ? 2 : 1);
}).listen(PORT, () => console.log('mock odds api on', PORT));
