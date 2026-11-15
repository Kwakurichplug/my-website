// Demo feed: the same Poisson pricing the front end used, now server-side.
// Keeps the site alive until the real odds API key is configured.
import { createRequire } from 'node:module';
import { q } from '../db/pool.js';
import { upsertEvent, upsertMarkets } from './index.js';

export const syncEvery = 10 * 60 * 1000;
export const tickEvery = 4000;

const MARGIN = 0.94;
const r2 = n => Math.round(n * 100) / 100;
export const price = p => (p < 0.005 || p > 0.985 ? null : Math.max(1.01, r2(MARGIN / p)));
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

const M = createRequire(import.meta.url)('../../../betting/markets.js');
export const marketNeeds = M.needs;
/** Every football market for a match, in the API's stored shape. opt: { noCorners, noCards } */
export function footballMarkets(m, opt) {
  return M.football(m, price, opt).map(x => ({ key: x.key, name: x.name, group: x.group, cols: x.cols,
    outcomes: Object.fromEntries(x.outs.filter(o => o.k).map((o, i) => [o.k, { l: o.l, o: o.o, i }])) }));
}
function twoWayMarkets(m) {
  const P = TWO[m.sport] || TWO.tennis, out = [];
  const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outcomes: Object.fromEntries(list.map(([k, l, p]) => [k, { l, o: price(p) }])) });
  const rem = m.sport === 'basketball' && m.status === 'live' ? Math.max(0.02, 1 - m.prog) : 1;
  const d0 = m.status === 'live' ? m.score[0] - m.score[1] : 0, mu = d0 + m.mu * rem, sd = P.msd * Math.sqrt(rem);
  const pw = 1 - ncdf(-mu / sd);
  add('win', 'Winner', 'Main', 2, [['1', 'Home', pw], ['2', 'Away', 1 - pw]]);
  // handicap keys carry the home line ("<line>|1" / "<line>|2"), like the live feed and football's Asian Handicap
  const sg = x => (x > 0 ? '+' : '') + x;
  add('spr', 'Handicap', 'Handicap', 2, P.hl.flatMap(h => { const p = 1 - ncdf((-h - mu) / sd); return [[`${h}|1`, `Home (${sg(h)})`, p], [`${h}|2`, `Away (${sg(-h)})`, 1 - p]]; }));
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
  await refreshMarkets();
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
      if (live && lg.sport === 'football') {
        const f = m.minute / 90; m.score = [samplePois(m.lh * f), samplePois(m.la * f)];
        const goals = []; [0, 1].forEach(s => { for (let g = 0; g < m.score[s]; g++) goals.push({ min: 1 + Math.floor(R() * m.minute), side: s }); }); goals.sort((x, y) => x.min - y.min);
        m.stats = { goals, corners: [samplePois(5 * f), samplePois(4 * f)], cards: [samplePois(2 * f), samplePois(2.2 * f)] };
        if (m.minute > 45) m.ht = [goals.filter(g => !g.side && g.min <= 45).length, goals.filter(g => g.side && g.min <= 45).length];
      }
      const id = await upsertEvent(m, marketsFor(m));
      await q('UPDATE events SET model=$2 WHERE id=$1', [id, { lh: m.lh, la: m.la, mu: m.mu, src: 'demo' }]);
      model.set(id, m);
    }
  }
}

/** Events created before the full market set existed get every market (runs on each sync, cheap once done). */
async function refreshMarkets() {
  const { rows } = await q(`SELECT e.id, e.sport, e.home, e.away, e.status, e.minute, e.score_home, e.score_away, e.ht_home, e.ht_away, e.stats, e.model FROM events e
    WHERE e.ext_id LIKE 'demo:%' AND e.status IN ('scheduled','live') AND e.sport='football' AND NOT EXISTS (SELECT 1 FROM markets k WHERE k.event_id=e.id AND k.key='ah') LIMIT 100`);
  for (const e of rows) {
    const md = e.model || {};
    const m = model.get(e.id) || { lh: md.lh || 1.3, la: md.la || 1.1, mu: md.mu || 0, prog: 0.3, sport: e.sport, home: e.home, away: e.away };
    Object.assign(m, { status: e.status, minute: e.minute, score: [e.score_home, e.score_away], stats: e.stats || {}, ht: e.ht_home != null ? [e.ht_home, e.ht_away] : m.ht });
    model.set(e.id, m);
    await upsertMarkets(e.id, marketsFor(m));
  }
  return rows.length;
}

/** Advance live matches; return ids of events that just finished. */
export async function tick() {
  // only the demo feed's own matches (Virtual League rounds are played by server/src/games/virtual.js)
  const { rows } = await q(`SELECT id, sport, home, away, status, minute, score_home, score_away, ht_home, ht_away, stats, kickoff, model FROM events WHERE ext_id LIKE 'demo:%' AND (status='live' OR (status='scheduled' AND kickoff <= now()))`);
  const finished = [];
  for (const e of rows) {
    let m = model.get(e.id);
    if (!m) { const md = e.model || {}; m = { lh: md.lh || 1.3, la: md.la || 1.1, mu: md.mu || 0, prog: 0.3, sport: e.sport, home: e.home, away: e.away }; model.set(e.id, m); }
    Object.assign(m, { status: 'live', minute: e.minute, score: [e.score_home, e.score_away], stats: e.stats || {}, ht: e.ht_home != null ? [e.ht_home, e.ht_away] : m.ht });
    if (e.status === 'scheduled') m.minute = 1;
    if (m.sport === 'football') {
      if (R() < 0.6) {
        m.minute++;
        for (const s of [0, 1]) {
          const l = s ? m.la : m.lh;
          if (R() < l / 90 * 1.4) { m.score[s]++; (m.stats.goals ||= []).push({ min: m.minute, side: s }); }
          if (R() < 0.05) { (m.stats.corners ||= [0, 0])[s]++; }
          if (R() < 0.022) { (m.stats.cards ||= [0, 0])[s]++; }
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
      await upsertMarkets(e.id, marketsFor(m));
    }
  }
  return finished;
}
