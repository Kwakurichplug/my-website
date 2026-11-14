// Demo feed: the same Poisson pricing the front end used, now server-side.
// Keeps the site alive until the real odds API key is configured.
import { q } from '../db/pool.js';
import { upsertEvent } from './index.js';

export const syncEvery = 10 * 60 * 1000;
export const tickEvery = 4000;

const MARGIN = 0.94;
const r2 = n => Math.round(n * 100) / 100;
const price = p => (p < 0.005 || p > 0.985 ? null : Math.max(1.01, r2(MARGIN / p)));
const pois = (l, n) => { const a = []; let p = Math.exp(-l); for (let k = 0; k <= n; k++) { a.push(p); p *= l / (k + 1); } return a; };
const R = Math.random;
const samplePois = l => { let k = 0, p = Math.exp(-l), s = p; const u = R(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; };

const LEAGUES = [
  ['football', 'Premier League', 'England', 'eng', true, ['Arsenal', 'Chelsea', 'Liverpool', 'Man City', 'Man Utd', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham']],
  ['football', 'LaLiga', 'Spain', 'es', true, ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Villarreal', 'Real Sociedad', 'Valencia', 'Betis']],
  ['football', 'Serie A', 'Italy', 'it', true, ['Inter', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina']],
  ['football', 'Bundesliga', 'Germany', 'de', true, ['Bayern Munich', 'Dortmund', 'Leverkusen', 'RB Leipzig', 'Frankfurt', 'Stuttgart']],
  ['football', 'Ligue 1', 'France', 'fr', true, ['PSG', 'Marseille', 'Lyon', 'Monaco', 'Lille', 'Nice']],
  ['football', 'NPFL', 'Nigeria', 'ng', true, ['Enyimba', 'Rangers Intl', 'Kano Pillars', 'Rivers Utd', 'Shooting Stars', 'Remo Stars', 'Plateau Utd', 'Lobi Stars']],
  ['football', 'Premier League', 'Ghana', 'gh', false, ['Asante Kotoko', 'Hearts of Oak', 'Medeama', 'Aduana Stars', 'Bechem Utd', 'Dreams FC']],
  ['football', 'Premier League', 'South Africa', 'za', false, ['Mamelodi Sundowns', 'Orlando Pirates', 'Kaizer Chiefs', 'SuperSport Utd', 'Stellenbosch', 'Cape Town City']],
  ['football', 'Champions League', 'UEFA', 'eu', true, ['Benfica', 'Porto', 'Ajax', 'Celtic', 'PSV', 'Club Brugge', 'Galatasaray', 'Sporting CP']],
  ['basketball', 'NBA', 'USA', 'us', false, ['Lakers', 'Celtics', 'Warriors', 'Bucks', 'Nuggets', 'Heat', 'Knicks', 'Suns']],
  ['basketball', 'BAL', 'Africa', 'world', false, ['Rivers Hoopers', 'Petro de Luanda', 'Al Ahly', 'US Monastir', 'FUS Rabat', 'AS Douanes']],
  ['tennis', 'ATP Finals', 'World', 'world', false, ['Sinner J.', 'Alcaraz C.', 'Djokovic N.', 'Zverev A.', 'Medvedev D.', 'Rune H.', 'Fritz T.', 'Ruud C.']],
];
const TWO = { basketball: { T: 218, sd: 14, msd: 11, hl: [-1.5, -4.5, -7.5], tl: [210.5, 214.5, 218.5, 222.5, 226.5], unit: 'Points' }, tennis: { T: 22.5, sd: 3.5, msd: 3.5, hl: [-1.5, -3.5], tl: [20.5, 22.5, 24.5], unit: 'Games' } };
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const ncdf = z => 0.5 * (1 + erf(z / Math.SQRT2));

// in-memory model params per event (lambda etc.) – demo only
const model = new Map();

export function footballMarkets(m) {
  const out = [];
  const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outcomes: Object.fromEntries(list.filter(x => x[0]).map(([k, l, p]) => [k, { l, o: price(p) }])) });
  const N = 8, rem = m.status === 'live' ? Math.max(0, 90 - m.minute) / 90 : 1;
  const [sh, sa] = m.score, ph = pois(m.lh * rem, N), pa = pois(m.la * rem, N);
  let H = 0, D = 0, A = 0, GG = 0, ODD = 0; const tot = {}, diff = {}, cs = {};
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = ph[i] * pa[j], fh = sh + i, fa = sa + j;
    if (fh > fa) H += p; else if (fh === fa) D += p; else A += p;
    tot[fh + fa] = (tot[fh + fa] || 0) + p; diff[fh - fa] = (diff[fh - fa] || 0) + p;
    if (fh <= 4 && fa <= 4) cs[`${fh}-${fa}`] = (cs[`${fh}-${fa}`] || 0) + p;
    if (fh && fa) GG += p; if ((fh + fa) % 2) ODD += p;
  }
  const over = l => Object.entries(tot).reduce((s, [k, p]) => s + (+k > l ? p : 0), 0);
  const dge = d => Object.entries(diff).reduce((s, [k, p]) => s + (+k >= d ? p : 0), 0);
  const teamOver = (arr, base, l) => arr.reduce((s, p, i) => s + (base + i > l ? p : 0), 0);
  add('1x2', '1X2', 'Main', 3, [['1', 'Home', H], ['X', 'Draw', D], ['2', 'Away', A]]);
  add('dc', 'Double Chance', 'Main', 3, [['1X', 'Home or Draw', H + D], ['12', 'Home or Away', H + A], ['X2', 'Draw or Away', D + A]]);
  if (m.status === 'live' && rem > 0) { const L = (m.lh + m.la) * rem, pn = Math.exp(-L); add('next', `Next Goal (${sh + sa + 1})`, 'Main', 3, [['1', 'Home', (1 - pn) * m.lh / (m.lh + m.la)], ['none', 'None', pn], ['2', 'Away', (1 - pn) * m.la / (m.lh + m.la)]]); }
  add('dnb', 'Draw No Bet', 'Main', 2, [['1', 'Home', H / (H + A)], ['2', 'Away', A / (H + A)]]);
  add('gg', 'Both Teams To Score', 'Main', 2, [['gg', 'GG (Yes)', GG], ['ng', 'NG (No)', 1 - GG]]);
  add('ou', 'Over/Under', 'Goals', 2, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].flatMap(l => [[`o${l}`, `Over ${l}`, over(l)], [`u${l}`, `Under ${l}`, 1 - over(l)]]));
  add('hou', `${m.home} Total Goals`, 'Goals', 2, [0.5, 1.5, 2.5].flatMap(l => { const p = teamOver(ph, sh, l); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
  add('aou', `${m.away} Total Goals`, 'Goals', 2, [0.5, 1.5, 2.5].flatMap(l => { const p = teamOver(pa, sa, l); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
  add('oe', 'Odd/Even Goals', 'Goals', 2, [['odd', 'Odd', ODD], ['even', 'Even', 1 - ODD]]);
  const list = Object.entries(cs).sort((a, b) => a[0].localeCompare(b[0])).map(([k, p]) => [k, k, p]);
  list.push(['oth', 'Other', 1 - Object.values(cs).reduce((s, p) => s + p, 0)]);
  add('cs', 'Correct Score', 'Score', 3, list);
  add('eh-1', `Handicap ${m.home} (-1)`, 'Handicap', 3, [['1', 'Home (-1)', dge(2)], ['X', 'Draw (-1)', diff[1] || 0], ['2', 'Away (+1)', 1 - dge(1)]]);
  add('eh+1', `Handicap ${m.home} (+1)`, 'Handicap', 3, [['1', 'Home (+1)', dge(0)], ['X', 'Draw (+1)', diff[-1] || 0], ['2', 'Away (-1)', 1 - dge(-1)]]);
  return out;
}
function twoWayMarkets(m) {
  const P = TWO[m.sport] || TWO.tennis, out = [];
  const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outcomes: Object.fromEntries(list.map(([k, l, p]) => [k, { l, o: price(p) }])) });
  const rem = m.sport === 'basketball' && m.status === 'live' ? Math.max(0.02, 1 - m.prog) : 1;
  const d0 = m.status === 'live' ? m.score[0] - m.score[1] : 0, mu = d0 + m.mu * rem, sd = P.msd * Math.sqrt(rem);
  const pw = 1 - ncdf(-mu / sd);
  add('win', 'Winner', 'Main', 2, [['1', 'Home', pw], ['2', 'Away', 1 - pw]]);
  add('hcp', 'Handicap', 'Handicap', 2, P.hl.flatMap((h, i) => { const p = 1 - ncdf((-h - mu) / sd); return [[`h${i}1`, `Home (${h})`, p], [`h${i}2`, `Away (+${-h})`, 1 - p]]; }));
  const tm = (m.status === 'live' ? m.score[0] + m.score[1] : 0) + P.T * rem, tsd = P.sd * Math.sqrt(rem);
  add('tot', `Total ${P.unit}`, 'Totals', 2, P.tl.flatMap(l => { const p = 1 - ncdf((l - tm) / tsd); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
  return out;
}
const marketsFor = m => (m.sport === 'football' ? footballMarkets(m) : twoWayMarkets(m));

async function ensureLeagues() {
  const ids = [];
  for (const [sport, name, country, flag, top, teams] of LEAGUES) {
    const ext = `demo:${sport}:${country}:${name}`;
    const { rows } = await q(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (ext_id) DO UPDATE SET top=EXCLUDED.top RETURNING id`, [sport, name, country, flag, top, ext]);
    ids.push({ id: rows[0].id, sport, teams });
  }
  return ids;
}

/** Create fixtures for the next 3 days if the table is thin. */
export async function sync() {
  const leagues = await ensureLeagues();
  const { rows } = await q(`SELECT count(*)::int AS n FROM events WHERE ext_id LIKE 'demo:%' AND status IN ('scheduled','live')`);
  if (rows[0].n >= 60) return;
  for (const lg of leagues) {
    const t = [...lg.teams].sort(() => R() - 0.5);
    for (let i = 0; i + 1 < t.length; i += 2) {
      const live = R() < 0.25;
      const kick = live ? new Date(Date.now() - R() * 60 * 60000) : new Date(Date.now() + (1 + Math.floor(R() * 70)) * 3600000 + Math.floor(R() * 4) * 900000);
      const m = { extId: `demo:${lg.id}:${t[i]}:${t[i + 1]}:${kick.toISOString().slice(0, 10)}`, sport: lg.sport, leagueId: lg.id, home: t[i], away: t[i + 1], kickoff: kick, status: live ? 'live' : 'scheduled',
        minute: live ? 1 + Math.floor(R() * 80) : 0, score: [0, 0], hot: R() < 0.35, lh: 0.75 + R() * 1.35, la: 0.55 + R() * 1.15, mu: (R() - 0.5) * 20, prog: live ? R() * 0.8 : 0, stats: {} };
      if (live && lg.sport === 'football') { const f = m.minute / 90; m.score = [samplePois(m.lh * f), samplePois(m.la * f)]; m.stats = { goals: [], corners: [samplePois(5 * f), samplePois(4 * f)] }; }
      const id = await upsertEvent(m, marketsFor(m));
      model.set(id, m);
    }
  }
}

/** Advance live matches; return ids of events that just finished. */
export async function tick() {
  // only the demo feed's own matches (Virtual League rounds are played by server/src/games/virtual.js)
  const { rows } = await q(`SELECT id, sport, home, away, status, minute, score_home, score_away, stats, kickoff FROM events WHERE ext_id LIKE 'demo:%' AND (status='live' OR (status='scheduled' AND kickoff <= now()))`);
  const finished = [];
  for (const e of rows) {
    let m = model.get(e.id);
    if (!m) { m = { lh: 1.3, la: 1.1, mu: 0, prog: 0.3, sport: e.sport, home: e.home, away: e.away }; model.set(e.id, m); }
    Object.assign(m, { status: 'live', minute: e.minute, score: [e.score_home, e.score_away], stats: e.stats || {} });
    if (e.status === 'scheduled') m.minute = 1;
    if (m.sport === 'football') {
      if (R() < 0.6) {
        m.minute++;
        for (const s of [0, 1]) {
          const l = s ? m.la : m.lh;
          if (R() < l / 90 * 1.4) { m.score[s]++; (m.stats.goals ||= []).push({ min: m.minute, side: s }); }
          if (R() < 0.05) { (m.stats.corners ||= [0, 0])[s]++; }
        }
        if (m.minute === 45) m.ht = [...m.score];
      }
      if (m.minute >= 92 && R() < 0.4) m.status = 'finished';
    } else {
      m.prog = Math.min(1, (m.prog || 0) + 0.004);
      if (m.sport === 'basketball' && R() < 0.5) m.score[R() < 0.5 ? 0 : 1] += 1 + Math.floor(R() * 3);
      if (m.prog >= 1) m.status = 'finished';
    }
    await q(`UPDATE events SET status=$2, minute=$3, period=$4, score_home=$5, score_away=$6, ht_home=coalesce($7, ht_home), ht_away=coalesce($8, ht_away), stats=$9, updated_at=now() WHERE id=$1`,
      [e.id, m.status, m.minute || 0, m.sport === 'football' ? (m.minute <= 45 ? 'H1' : 'H2') : null, m.score[0], m.score[1], m.ht?.[0] ?? null, m.ht?.[1] ?? null, m.stats || {}]);
    if (m.status === 'finished') { finished.push(e.id); model.delete(e.id); }
    else {
      for (const mk of marketsFor(m)) await q(`UPDATE markets SET outcomes=$3, updated_at=now() WHERE event_id=$1 AND key=$2`, [e.id, mk.key, JSON.stringify(mk.outcomes)]);
    }
  }
  return finished;
}
