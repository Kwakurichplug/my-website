// Mock API-Football (v3) for tests: GET /fixtures?live=all returns the fixtures set with POST /__state {fixtures}.
// Rate-limit headers like the real API. Port 9101 (MOCK_APIFOOTBALL_PORT).
import http from 'node:http';
const state = { fixtures: [], calls: 0, remaining: 7400, limit: 7500 };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = (code, body, h = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(body)); };
  if (u.pathname === '/__state') { let b = ''; for await (const c of req) b += c; Object.assign(state, b ? JSON.parse(b) : {}); return json(200, { ok: true, calls: state.calls }); }
  if (u.pathname === '/__calls') return json(200, { calls: state.calls });
  if (u.pathname === '/fixtures' && u.searchParams.get('live') === 'all') {
    if (!req.headers['x-apisports-key']) return json(200, { errors: { token: 'Missing application key' }, response: [] });
    state.calls++; state.remaining--;
    return json(200, { errors: [], results: state.fixtures.length, response: state.fixtures }, { 'x-ratelimit-requests-limit': String(state.limit), 'x-ratelimit-requests-remaining': String(state.remaining) });
  }
  json(404, { errors: { path: 'not found' } });
}).listen(Number(process.env.MOCK_APIFOOTBALL_PORT) || 9101, () => console.log('mock api-football on', Number(process.env.MOCK_APIFOOTBALL_PORT) || 9101));
