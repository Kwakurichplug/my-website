// Virtual sports end to end through the real API: every sport has a round on sale, a bet on each settles exactly
// as its final score says, betting is closed while a game plays out, virtual results stay out of the main results.
// Quick run: start the server with VIRTUAL_ROUND_SEC=40 VIRTUAL_PLAY_SEC=15 (fresh DB), then
//   node tools/qa/e2e_vsports.js http://127.0.0.1:8095/
const BASE = process.argv[2] || 'http://127.0.0.1:8095/';
const SPORTS = ['vbasketball', 'vtennis', 'vicehockey', 'vvolleyball', 'vtabletennis', 'vhandball', 'vdarts'];
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const api = async (path, body, token) => {
  const r = await fetch(BASE + 'api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
const wait = async (f, ms, step = 2000) => { const end = Date.now() + ms; for (;;) { const v = await f().catch(() => null); if (v || Date.now() > end) return v; await new Promise(r => setTimeout(r, step)); } };

(async () => {
  const open = await wait(async () => {
    const all = await Promise.all(SPORTS.map(s => api('/events?sport=' + s + '&status=scheduled')));
    return all.every(r => r.events.some(e => new Date(e.kickoff) > Date.now() + 8000 && e.markets.length >= 3)) && all.map(r => r.events);
  }, 120000);
  ok(!!open, 'every virtual sport has a round on sale with Winner/1X2, Handicap and Total');
  if (!open) process.exit(1);
  open.forEach((evs, i) => ok(evs[0].league.name.startsWith('Virtual ') && evs[0].league.country === 'LetBet Virtuals', `${SPORTS[i]}: ${evs[0].league.name}, ${evs[0].home} v ${evs[0].away}`));

  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Virtual123' });
  await api('/wallet/deposit', { amount: 20000, method: 'card' }, token);
  // one Winner/1X2 home bet and one Over on the main total, per sport
  const picks = [];
  for (const evs of open) {
    const e = evs.find(x => new Date(x.kickoff) > Date.now() + 8000), M = Object.fromEntries(e.markets.map(m => [m.key, m]));
    const first = M.win || M['1x2'], tk = Object.keys(M.tot.outcomes).find(k => k[0] === 'o');
    picks.push({ e, mk: first.key, ok: '1', odd: first.outcomes['1'].o }, { e, mk: 'tot', ok: tk, odd: M.tot.outcomes[tk].o });
  }
  const placed = await api('/bets/place', { type: 'single', selections: picks.map(p => ({ eventId: p.e.id, market: p.mk, outcome: p.ok, odd: p.odd })), stakes: picks.map(() => 100) }, token);
  ok(!placed.error, `${picks.length} singles placed across the 7 sports` + (placed.error ? ' ' + JSON.stringify(placed) : ''));

  // while a game plays out its markets are closed
  const live = await wait(async () => { const { event } = await api('/events/' + picks[0].e.id); return event.status === 'live' && event; }, 120000, 1000);
  ok(live && live.markets.every(m => m.suspended), `in play (${live && live.period}): markets closed`);
  const late = await api('/bets/place', { type: 'single', selections: [{ eventId: picks[0].e.id, market: picks[0].mk, outcome: '1', odd: picks[0].odd }], stakes: [100] }, token);
  ok(late.error === 'selection_unavailable', 'no bets while it plays');

  const bets = await wait(async () => { const r = await api('/bets?status=settled', null, token); return r.bets && r.bets.length === picks.length && r.bets; }, 180000);
  ok(!!bets, 'every bet settled');
  for (const b of bets || []) {
    const l = b.legs[0], [h, a] = l.final, { event } = await api('/events/' + l.eventId);
    const total = event.sport === 'vtennis' ? event.stats.total : h + a;
    const want = l.market === 'tot' ? (total > parseFloat(l.outcome.slice(1)) ? 'won' : 'lost') : (h > a ? 'won' : 'lost');
    ok(b.status === want, `${event.sport} ${l.market} ${l.outcome}: ${h}-${a}${event.stats.sets ? ' (' + event.stats.sets.map(x => x.join('-')).join(' ') + ')' : ''}${event.sport === 'vtennis' ? ' ' + total + ' games' : ''} → ${b.status}`);
  }
  const res = await api('/events/results');
  ok(!res.events.some(e => SPORTS.includes(e.sport)), 'virtual results stay out of the main results list');
  const vres = await api('/events/results?sport=vbasketball');
  ok(vres.events.length > 0, 'and are there when asked for by sport');
  process.exit(fails ? 1 : 0);
})();
