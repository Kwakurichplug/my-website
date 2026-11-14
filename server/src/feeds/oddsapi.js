// The Odds API adapter (the-odds-api.com, v4).
//
// Credits are the constraint, not users: every player is served from our own
// database, so 10 or 10,000 players cost the same number of API calls.
//
//   • Prices   – one call per league for h2h + totals (2 credits). The goal model is
//                fitted to the bookmaker consensus and every other market (double
//                chance, GG/NG, correct score, handicaps, team totals…) is derived
//                from that fit, so the whole card stays consistent with real odds.
//   • Scores   – only polled while a league has matches in play or awaiting a result.
//   • Budget   – the credits left this month are spread evenly over the days left,
//                so the feed runs all month on any plan and speeds up by itself
//                when the plan is upgraded.
//   • Safety   – in-play markets are open only while the score is fresh
//                (ODDS_LIVE_FRESH_SEC, default 90s); otherwise they are suspended so
//                nobody can bet on a match whose score we have not seen.
//
// Env: ODDS_API_KEY (required), ODDS_LEAGUES (comma list of sport keys),
//      ODDS_REGION (default uk), ODDS_LIVE_FRESH_SEC, ODDS_MARGIN (default from settings).
import { q } from '../db/pool.js';
import { upsertEvent } from './index.js';
import { footballMarkets, marketNeeds } from './demo.js';
import { getSetting, setSetting } from '../lib/settings.js';
import { attachLogos } from '../lib/logos.js';

export const syncEvery = 60 * 1000;    // the scheduler decides what is actually due
export const tickEvery = 20 * 1000;

const BASE = process.env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4'; // override for tests (mock server)
const KEY = () => process.env.ODDS_API_KEY;
const REGION = () => process.env.ODDS_REGION || 'uk';
const FRESH_MS = () => (+process.env.ODDS_LIVE_FRESH_SEC || 90) * 1000;

// sport key -> our league. flag = flag-icons code (betting/img/flags/<code>.svg)
export const LEAGUES = {
  soccer_epl: ['Premier League', 'England', 'gb-eng', true],
  soccer_spain_la_liga: ['LaLiga', 'Spain', 'es', true],
  soccer_italy_serie_a: ['Serie A', 'Italy', 'it', true],
  soccer_germany_bundesliga: ['Bundesliga', 'Germany', 'de', true],
  soccer_france_ligue_one: ['Ligue 1', 'France', 'fr', true],
  soccer_uefa_champs_league: ['Champions League', 'UEFA', 'eu', true],
  soccer_uefa_europa_league: ['Europa League', 'UEFA', 'eu', true],
  soccer_uefa_europa_conference_league: ['Conference League', 'UEFA', 'eu', false],
  soccer_uefa_nations_league: ['Nations League', 'UEFA', 'eu', false],
  soccer_efl_champ: ['Championship', 'England', 'gb-eng', false],
  soccer_england_league1: ['League One', 'England', 'gb-eng', false],
  soccer_england_league2: ['League Two', 'England', 'gb-eng', false],
  soccer_england_efl_cup: ['EFL Cup', 'England', 'gb-eng', false],
  soccer_fa_cup: ['FA Cup', 'England', 'gb-eng', false],
  soccer_spl: ['Premiership', 'Scotland', 'gb-sct', false],
  soccer_spain_segunda_division: ['LaLiga 2', 'Spain', 'es', false],
  soccer_spain_copa_del_rey: ['Copa del Rey', 'Spain', 'es', false],
  soccer_italy_serie_b: ['Serie B', 'Italy', 'it', false],
  soccer_germany_bundesliga2: ['2. Bundesliga', 'Germany', 'de', false],
  soccer_germany_liga3: ['3. Liga', 'Germany', 'de', false],
  soccer_germany_dfb_pokal: ['DFB-Pokal', 'Germany', 'de', false],
  soccer_france_ligue_two: ['Ligue 2', 'France', 'fr', false],
  soccer_france_coupe_de_france: ['Coupe de France', 'France', 'fr', false],
  soccer_netherlands_eredivisie: ['Eredivisie', 'Netherlands', 'nl', false],
  soccer_portugal_primeira_liga: ['Primeira Liga', 'Portugal', 'pt', false],
  soccer_belgium_first_div: ['First Division A', 'Belgium', 'be', false],
  soccer_turkey_super_league: ['Super Lig', 'Turkey', 'tr', false],
  soccer_greece_super_league: ['Super League', 'Greece', 'gr', false],
  soccer_austria_bundesliga: ['Bundesliga', 'Austria', 'at', false],
  soccer_switzerland_superleague: ['Super League', 'Switzerland', 'ch', false],
  soccer_denmark_superliga: ['Superliga', 'Denmark', 'dk', false],
  soccer_sweden_allsvenskan: ['Allsvenskan', 'Sweden', 'se', false],
  soccer_sweden_superettan: ['Superettan', 'Sweden', 'se', false],
  soccer_norway_eliteserien: ['Eliteserien', 'Norway', 'no', false],
  soccer_poland_ekstraklasa: ['Ekstraklasa', 'Poland', 'pl', false],
  soccer_russia_premier_league: ['Premier League', 'Russia', 'ru', false],
  soccer_usa_mls: ['MLS', 'USA', 'us', false],
  soccer_mexico_ligamx: ['Liga MX', 'Mexico', 'mx', false],
  soccer_brazil_campeonato: ['Serie A', 'Brazil', 'br', false],
  soccer_brazil_serie_b: ['Serie B', 'Brazil', 'br', false],
  soccer_argentina_primera_division: ['Primera Division', 'Argentina', 'ar', false],
  soccer_chile_campeonato: ['Primera Division', 'Chile', 'cl', false],
  soccer_conmebol_copa_libertadores: ['Copa Libertadores', 'South America', 'conmebol', false],
  soccer_conmebol_copa_sudamericana: ['Copa Sudamericana', 'South America', 'conmebol', false],
  soccer_japan_j_league: ['J1 League', 'Japan', 'jp', false],
  soccer_korea_kleague1: ['K League 1', 'South Korea', 'kr', false],
  soccer_australia_aleague: ['A-League', 'Australia', 'au', false],
  soccer_africa_cup_of_nations: ['Africa Cup of Nations', 'Africa', 'caf', true],
  soccer_saudi_arabia_pro_league: ['Pro League', 'Saudi Arabia', 'sa', false],
};
// cheapest useful default for the free plan; add more with ODDS_LEAGUES when the plan allows
const DEFAULT = ['soccer_epl', 'soccer_spain_la_liga', 'soccer_italy_serie_a', 'soccer_germany_bundesliga', 'soccer_france_ligue_one', 'soccer_uefa_champs_league'];
const enabled = () => (process.env.ODDS_LEAGUES ? process.env.ODDS_LEAGUES.split(',').map(s => s.trim()).filter(k => LEAGUES[k]) : DEFAULT);

/* ---------------- credit budget ---------------- */
const daysLeftInMonth = () => { const d = new Date(); const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); return Math.max(1, Math.ceil((end - d) / 864e5)); };
async function budget() {
  const b = (await getSetting('oddsapi_budget')) || {};
  const today = new Date().toISOString().slice(0, 10);
  if (b.day !== today) { b.day = today; b.spent = 0; b.startRemaining = b.remaining ?? null; }
  return b;
}
async function allowanceLeft() {
  const b = await budget();
  if (b.startRemaining == null) return 50; // first run of the day before we have seen the header
  const daily = Math.floor(b.startRemaining / daysLeftInMonth());
  return Math.max(0, daily - (b.spent || 0));
}
async function call(path, cost) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(KEY())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const b = await budget();
  const rem = res.headers.get('x-requests-remaining'), last = res.headers.get('x-requests-last');
  if (rem != null) { b.remaining = +rem; if (b.startRemaining == null) b.startRemaining = +rem + (+last || cost); }
  b.spent = (b.spent || 0) + (+last || cost);
  b.lastCall = new Date().toISOString();
  await setSetting('oddsapi_budget', b);
  if (!res.ok) throw new Error(`odds api ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
  return res.json();
}

/* ---------------- model fitting ---------------- */
const pois = (l, n = 10) => { const a = []; let p = Math.exp(-l); for (let k = 0; k <= n; k++) { a.push(p); p *= l / (k + 1); } return a; };
function probs(lh, la) {
  const ph = pois(lh), pa = pois(la); let H = 0, D = 0, A = 0, O = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = ph[i] * pa[j]; if (i > j) H += p; else if (i === j) D += p; else A += p; if (i + j > 2.5) O += p; }
  return { H, D, A, O };
}
/** Find goal rates (home, away) whose 1X2 and Over 2.5 probabilities match the market. */
export function fit(target) {
  const err = (lh, la) => { const p = probs(lh, la); return (p.H - target.H) ** 2 + (p.A - target.A) ** 2 + (target.O != null ? (p.O - target.O) ** 2 : 0) + (target.O == null ? (p.D - target.D) ** 2 : 0); };
  let best = [1.4, 1.1], be = err(...best);
  for (let lh = 0.2; lh <= 4; lh += 0.1) for (let la = 0.2; la <= 4; la += 0.1) { const e = err(lh, la); if (e < be) { be = e; best = [lh, la]; } }
  for (let step = 0.05; step > 0.001; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dh, da] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const c = [best[0] + dh, best[1] + da]; if (c[0] < 0.05 || c[1] < 0.05) continue;
        const e = err(...c); if (e < be) { be = e; best = c; moved = true; }
      }
    }
  }
  return { lh: +best[0].toFixed(4), la: +best[1].toFixed(4), err: be };
}
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Bookmaker consensus: de-vig each book, take the median probability per outcome. */
export function consensus(ev) {
  const h2h = [], over = [];
  for (const bk of ev.bookmakers || []) {
    for (const mk of bk.markets || []) {
      if (mk.key === 'h2h') {
        const o = Object.fromEntries(mk.outcomes.map(x => [x.name, 1 / x.price]));
        const H = o[ev.home_team], A = o[ev.away_team], D = o.Draw;
        if (H && A && D) { const s = H + A + D; h2h.push([H / s, D / s, A / s]); }
      }
      if (mk.key === 'totals') {
        const ov = mk.outcomes.find(x => x.name === 'Over' && x.point === 2.5), un = mk.outcomes.find(x => x.name === 'Under' && x.point === 2.5);
        if (ov && un) { const a = 1 / ov.price, b = 1 / un.price; over.push(a / (a + b)); }
      }
    }
  }
  if (!h2h.length) return null;
  const H = median(h2h.map(x => x[0])), D = median(h2h.map(x => x[1])), A = median(h2h.map(x => x[2])), s = H + D + A;
  return { H: H / s, D: D / s, A: A / s, O: over.length ? median(over) : null, books: h2h.length };
}

/* ---------------- leagues ---------------- */
async function leagueId(key) {
  const [name, country, flag, top] = LEAGUES[key];
  const { rows } = await q(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ('football',$1,$2,$3,$4,$5)
    ON CONFLICT (ext_id) DO UPDATE SET name=EXCLUDED.name, country=EXCLUDED.country, flag=EXCLUDED.flag, top=EXCLUDED.top RETURNING id`, [name, country, flag, top, 'oa:' + key]);
  return rows[0].id;
}

// markets we can settle from the full-time score alone (no half-time, corners or goal times in this feed)
const card = m => footballMarkets(m, { noCorners: true, noCards: true }).filter(x => marketNeeds(x.key) === 'ft');

/* ---------------- prices ---------------- */
async function syncOdds(key) {
  const lid = await leagueId(key);
  const data = await call(`/sports/${key}/odds?regions=${REGION()}&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`, 2);
  const seen = [];
  for (const ev of data) {
    const c = consensus(ev); if (!c) continue;
    const f = fit(c);
    const kickoff = new Date(ev.commence_time);
    const started = kickoff <= new Date();
    const extId = 'oa:' + ev.id;
    const { rows } = await q('SELECT id, status, score_home, score_away, minute FROM events WHERE ext_id=$1', [extId]);
    const cur = rows[0];
    if (cur && (cur.status === 'finished' || cur.status === 'cancelled')) continue;
    // in-play: keep our own live pricing (score-aware); only refresh the pre-match fit
    const m = { lh: f.lh, la: f.la, status: started ? 'live' : 'scheduled', minute: cur?.minute || 0, score: [cur?.score_home || 0, cur?.score_away || 0], home: ev.home_team, away: ev.away_team };
    const id = await upsertEvent({ extId, sport: 'football', leagueId: lid, home: ev.home_team, away: ev.away_team, kickoff, status: cur?.status || 'scheduled', minute: cur?.minute || 0, score: m.score, stats: {}, hot: LEAGUES[key][3] && c.books >= 10 },
      started ? [] : card(m));
    await q('UPDATE events SET model=$2 WHERE id=$1', [id, { lh: f.lh, la: f.la, fitErr: f.err, books: c.books, src: 'oddsapi', key, at: Date.now() }]);
    seen.push(extId);
  }
  // fixtures that vanished before kick-off were postponed → cancel (bets are voided by settlement)
  const { rows: gone } = await q(`UPDATE events SET status='cancelled', updated_at=now() WHERE league_id=$1 AND status='scheduled' AND kickoff > now() AND ext_id LIKE 'oa:%' AND NOT (ext_id = ANY($2)) RETURNING id`, [lid, seen]);
  attachLogos(lid).catch(() => {});
  return gone.map(r => r.id);
}

/* ---------------- scores ---------------- */
async function syncScores(key, withCompleted) {
  const lid = await leagueId(key);
  const data = await call(`/sports/${key}/scores?dateFormat=iso${withCompleted ? '&daysFrom=1' : ''}`, withCompleted ? 2 : 1);
  const finished = [];
  const fresh = new Date().toISOString();
  for (const ev of data) {
    if (!ev.scores) continue;
    const get = n => +(ev.scores.find(s => s.name === n)?.score ?? NaN);
    const h = get(ev.home_team), a = get(ev.away_team); if (Number.isNaN(h) || Number.isNaN(a)) continue;
    const { rows } = await q(`UPDATE events SET score_home=$2, score_away=$3, status=CASE WHEN $4 THEN 'finished' ELSE (CASE WHEN status='scheduled' THEN 'live' ELSE status END) END,
      stats = stats || jsonb_build_object('scoreAt', $5::text), updated_at=now() WHERE ext_id=$1 AND status IN ('scheduled','live') RETURNING id, status`, ['oa:' + ev.id, h, a, !!ev.completed, fresh]);
    if (rows[0]?.status === 'finished') finished.push(rows[0].id);
  }
  await setSetting(`oddsapi_scores_${key}`, { at: Date.now() });
  return finished;
}

/* ---------------- live state (no credits) ---------------- */
function liveClock(kickoff) {
  const el = Math.floor((Date.now() - new Date(kickoff)) / 60000);
  if (el <= 45) return { minute: Math.max(1, el), period: 'H1' };
  if (el <= 60) return { minute: 45, period: 'HT' };
  return { minute: Math.min(90, el - 15), period: 'H2' };
}
async function liveTick() {
  const { rows } = await q(`SELECT e.id, e.kickoff, e.status, e.score_home, e.score_away, e.home, e.away, e.model, e.stats, l.ext_id AS lext
    FROM events e JOIN leagues l ON l.id=e.league_id WHERE e.ext_id LIKE 'oa:%' AND (e.status='live' OR (e.status='scheduled' AND e.kickoff <= now()))`);
  for (const e of rows) {
    const c = liveClock(e.kickoff);
    const scoreAt = e.stats?.scoreAt ? Date.parse(e.stats.scoreAt) : 0;
    const fresh = Date.now() - scoreAt < FRESH_MS() && c.period !== 'HT';
    await q(`UPDATE events SET status='live', minute=$2, period=$3, stats = stats || jsonb_build_object('minuteEstimated', true, 'live', $4::boolean), updated_at=now() WHERE id=$1`, [e.id, c.minute, c.period, fresh]);
    if (fresh && e.model) {
      const m = { lh: e.model.lh, la: e.model.la, status: 'live', minute: c.minute, score: [e.score_home, e.score_away], home: e.home, away: e.away };
      for (const mk of card(m)) await q(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended, updated_at) VALUES ($1,$2,$3,$4,$5,$6,false,now())
        ON CONFLICT (event_id, key) DO UPDATE SET outcomes=EXCLUDED.outcomes, suspended=false, updated_at=now()`, [e.id, mk.key, mk.name, mk.group, mk.cols, JSON.stringify(mk.outcomes)]);
    } else {
      await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [e.id]);
    }
  }
}

/* ---------------- scheduler ---------------- */
let busy = false, booted = false;
export async function sync() {
  if (!KEY()) { console.warn('[oddsapi] ODDS_API_KEY missing – feed idle'); return; }
  if (busy) return; busy = true;
  try {
    if (!booted) {
      await retireDemo(); booted = true;
      // crests for fixtures already in the database (free – no Odds API credits)
      const { rows } = await q(`SELECT DISTINCT league_id FROM events WHERE ext_id LIKE 'oa:%' AND status IN ('scheduled','live') AND (home_logo IS NULL OR away_logo IS NULL)`);
      rows.forEach(r => attachLogos(r.league_id));
    }
    const keys = enabled();
    let left = await allowanceLeft();
    const now = Date.now();
    // 1) results first: leagues with matches past ~110 min that are not finished yet
    const { rows: due } = await q(`SELECT DISTINCT l.ext_id FROM events e JOIN leagues l ON l.id=e.league_id WHERE e.ext_id LIKE 'oa:%' AND e.status IN ('scheduled','live') AND e.kickoff <= now() - interval '110 minutes'`);
    const { rows: inplay } = await q(`SELECT DISTINCT l.ext_id FROM events e JOIN leagues l ON l.id=e.league_id WHERE e.ext_id LIKE 'oa:%' AND e.status IN ('scheduled','live') AND e.kickoff <= now() AND e.kickoff > now() - interval '110 minutes'`);
    const finished = [];
    const scoreGap = left >= 40 ? 60e3 : left >= 15 ? 10 * 60e3 : 30 * 60e3;
    for (const { ext_id } of [...due, ...inplay]) {
      const key = ext_id.slice(3); if (!LEAGUES[key]) continue;
      const last = (await getSetting(`oddsapi_scores_${key}`))?.at || 0;
      const overdue = due.some(d => d.ext_id === ext_id);
      if (now - last < (overdue ? Math.max(scoreGap, 15 * 60e3) : scoreGap) || left < (overdue ? 2 : 1)) continue;
      finished.push(...await syncScores(key, overdue)); left -= overdue ? 2 : 1;
    }
    // 2) prices: oldest league first, as often as the daily allowance allows
    const oddsGap = Math.min(48, Math.max(1, Math.round(24 * keys.length * 2 / Math.max(1, left * 0.6)))) * 3600e3;
    const ages = await Promise.all(keys.map(async k => [k, (await getSetting(`oddsapi_odds_${k}`))?.at || 0]));
    for (const [k, at] of ages.sort((a, b) => a[1] - b[1])) {
      if (left < 2 || (at && now - at < oddsGap)) continue;
      try { finished.push(...await syncOdds(k)); left -= 2; await setSetting(`oddsapi_odds_${k}`, { at: now }); }
      catch (e) { console.error('[oddsapi] odds', k, e.message); }
    }
    pending.push(...finished);
  } finally { busy = false; }
}
const pending = [];
export async function tick() {
  if (!KEY()) return [];
  await liveTick();
  return pending.splice(0);
}
/** Switching from the demo feed: cancel unfinished demo fixtures so their bets are refunded. */
async function retireDemo() {
  const { rows } = await q(`UPDATE events SET status='cancelled', updated_at=now() WHERE ext_id LIKE 'demo:%' AND status IN ('scheduled','live') RETURNING id`);
  pending.push(...rows.map(r => r.id));
  if (rows.length) console.log(`[oddsapi] retired ${rows.length} demo fixtures`);
}
export async function status() {
  const b = await budget();
  return { provider: 'oddsapi', leagues: enabled(), remaining: b.remaining ?? null, spentToday: b.spent || 0, allowanceLeftToday: await allowanceLeft(), daysLeft: daysLeftInMonth(), lastCall: b.lastCall || null };
}
