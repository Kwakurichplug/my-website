// Club crests: first from ESPN's public team list for the league (one call per league, matched by name – accurate),
// then, for teams ESPN does not list, from TheSportsDB (free API). Looked up once per team name and cached in
// team_logos; a miss is cached too and retried after a week. Only football (soccer) teams are
// accepted, so a same-named team from another sport can never supply a badge.
// Unmatched teams keep the front end's drawn crest. Note: club crests are trademarks – the
// operator should confirm usage rights before launch.
import { q } from '../db/pool.js';

const KEY = () => process.env.THESPORTSDB_KEY || '123';
const API = () => `https://www.thesportsdb.com/api/v1/json/${KEY()}`;
const SPORT = { football: 'Soccer', basketball: 'Basketball', icehockey: 'Ice Hockey' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(fc|afc|cf|sc|ac|club|de|the)\b/g, '').replace(/[^a-z0-9]/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let queue = Promise.resolve();

async function get(path) {
  const res = await fetch(API() + path, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('thesportsdb ' + res.status);
  return res.json();
}
const badge = t => { const u = t.strBadge || t.strTeamBadge; return u ? u.replace(/\/(tiny|small|medium)$/, '') + '/tiny' : null; }; // 37 KB thumbnail instead of the 330 KB original
const matches = (t, name, sport) => t.strSport === sport && [t.strTeam, t.strTeamShort, ...(t.strTeamAlternate || '').split(',')].some(n => n && norm(n) === norm(name));

// Names the free search resolves to the wrong team (e.g. a netball side) -> TheSportsDB team id.
// Add entries here to pin any club to its correct badge.
const PIN = { 'Nottingham Forest': 133720 };

async function find(name, sport = 'football') {
  const want = SPORT[sport] || 'Soccer';
  if (PIN[name]) { const d = await get('/lookupteam.php?id=' + PIN[name]); await sleep(2100); const t = d?.teams?.[0]; return t && t.strSport === want ? badge(t) : null; }
  const tries = [name, name.replace(/\b(FC|AFC|CF)\b/g, '').trim(), name + ' FC', name.replace(/ United$/, ' Utd'), name.replace(/^Nottingham/, "Nott'm"), name.replace(/^Nottingham/, 'Nottm')];
  for (const t of [...new Set(tries)]) {
    let d;
    for (let attempt = 0; ; attempt++) {
      try { d = await get('/searchteams.php?t=' + encodeURIComponent(t)); break; }
      catch (e) { if (attempt >= 3) throw e; await sleep(20000 * (attempt + 1)); } // rate limited: back off, never cache a miss for an error
    }
    await sleep(2100); // free tier: 30 requests a minute
    const hit = (d?.teams || []).find(x => x.strSport === want && (matches(x, name, want) || norm(x.strTeam) === norm(t)));
    if (hit && badge(hit)) return badge(hit);
  }
  return null;
}

/* ---------- ESPN: every team of a league in one call ---------- */
// The Odds API sport key -> ESPN league path (site.api.espn.com/apis/site/v2/sports/<path>/teams)
const ESPN = {
  soccer_epl: 'soccer/eng.1', soccer_spain_la_liga: 'soccer/esp.1', soccer_italy_serie_a: 'soccer/ita.1', soccer_germany_bundesliga: 'soccer/ger.1',
  soccer_france_ligue_one: 'soccer/fra.1', soccer_uefa_champs_league: 'soccer/uefa.champions', soccer_uefa_europa_league: 'soccer/uefa.europa',
  soccer_uefa_europa_conference_league: 'soccer/uefa.europa.conf', soccer_uefa_nations_league: 'soccer/uefa.nations', soccer_efl_champ: 'soccer/eng.2',
  soccer_england_league1: 'soccer/eng.3', soccer_england_league2: 'soccer/eng.4', soccer_england_efl_cup: 'soccer/eng.league_cup', soccer_fa_cup: 'soccer/eng.fa',
  soccer_spl: 'soccer/sco.1', soccer_spain_segunda_division: 'soccer/esp.2', soccer_spain_copa_del_rey: 'soccer/esp.copa_del_rey', soccer_italy_serie_b: 'soccer/ita.2',
  soccer_germany_bundesliga2: 'soccer/ger.2', soccer_germany_liga3: 'soccer/ger.3', soccer_germany_dfb_pokal: 'soccer/ger.dfb_pokal', soccer_france_ligue_two: 'soccer/fra.2',
  soccer_france_coupe_de_france: 'soccer/fra.coupe_de_france', soccer_netherlands_eredivisie: 'soccer/ned.1', soccer_portugal_primeira_liga: 'soccer/por.1',
  soccer_belgium_first_div: 'soccer/bel.1', soccer_turkey_super_league: 'soccer/tur.1', soccer_greece_super_league: 'soccer/gre.1', soccer_austria_bundesliga: 'soccer/aut.1',
  soccer_switzerland_superleague: 'soccer/sui.1', soccer_denmark_superliga: 'soccer/den.1', soccer_sweden_allsvenskan: 'soccer/swe.1', soccer_sweden_superettan: 'soccer/swe.2',
  soccer_norway_eliteserien: 'soccer/nor.1', soccer_poland_ekstraklasa: 'soccer/pol.1', soccer_russia_premier_league: 'soccer/rus.1', soccer_usa_mls: 'soccer/usa.1',
  soccer_mexico_ligamx: 'soccer/mex.1', soccer_brazil_campeonato: 'soccer/bra.1', soccer_brazil_serie_b: 'soccer/bra.2', soccer_argentina_primera_division: 'soccer/arg.1',
  soccer_chile_campeonato: 'soccer/chi.1', soccer_conmebol_copa_libertadores: 'soccer/conmebol.libertadores', soccer_conmebol_copa_sudamericana: 'soccer/conmebol.sudamericana',
  soccer_japan_j_league: 'soccer/jpn.1', soccer_korea_kleague1: 'soccer/kor.1', soccer_australia_aleague: 'soccer/aus.1', soccer_africa_cup_of_nations: 'soccer/caf.nations',
  soccer_saudi_arabia_pro_league: 'soccer/ksa.1',
  basketball_nba: 'basketball/nba', basketball_ncaab: 'basketball/mens-college-basketball', basketball_wnba: 'basketball/wnba', icehockey_nhl: 'hockey/nhl',
  americanfootball_nfl: 'football/nfl', americanfootball_ncaaf: 'football/college-football', baseball_mlb: 'baseball/mlb',
};
// a sharper name key for matching ESPN's names with the bookmakers' ("Brighton and Hove Albion" = "Brighton & Hove Albion")
const key2 = s => norm(String(s || '').replace(/&/g, ' and ').replace(/\b(utd)\b/gi, 'united').replace(/\b(hotspur|wanderers|albion)\b/gi, m => m));
const espnCache = new Map();   // league path -> { at, teams: [{ names:Set, url }] }
const small = href => String(href).replace(/^http:/, 'https:');
async function espnTeams(path) {
  const c = espnCache.get(path); if (c && Date.now() - c.at < 24 * 3600e3) return c.teams;
  let teams = [];
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${path}/teams?limit=500`, { signal: AbortSignal.timeout(10000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LetBetAfrika/1.0)', accept: 'application/json' } });
    if (!res.ok) console.warn(`[logos] espn ${path} ${res.status}`);
    if (res.ok) {
      const d = await res.json();
      teams = (d?.sports?.[0]?.leagues?.[0]?.teams || []).map(x => x.team).filter(t => t && t.logos && t.logos[0] && t.logos[0].href).map(t => ({
        names: new Set([t.displayName, t.shortDisplayName, t.name, t.location, t.nickname, t.location && t.name && t.location + ' ' + t.name].filter(Boolean).map(key2)),
        url: small(t.logos[0].href) }));
    }
  } catch (e) { console.warn(`[logos] espn ${path} ${e.message}`); }
  console.log(`[logos] espn ${path}: ${teams.length} teams`);
  // a failed or empty answer is retried after 10 minutes, a good one is kept for a day
  espnCache.set(path, { at: teams.length ? Date.now() : Date.now() - 24 * 3600e3 + 10 * 60e3, teams });
  return teams;
}
function espnMatch(teams, name) {
  const k = key2(name); if (!k) return null;
  const exact = teams.find(t => t.names.has(k)); if (exact) return exact.url;
  // one name inside the other ("Inter" / "Internazionale" no; "Tottenham" / "Tottenham Hotspur" yes) – only when unambiguous
  const part = teams.filter(t => [...t.names].some(n => n.length >= 5 && k.length >= 5 && (n.includes(k) || k.includes(n))));
  return part.length === 1 ? part[0].url : null;
}

/** Crest URL for one team (cached). */
export async function logoFor(name, sport = 'football') {
  const { rows } = await q(`SELECT url, fetched_at FROM team_logos WHERE name=$1`, [name]);
  if (rows[0] && (rows[0].url || Date.now() - new Date(rows[0].fetched_at) < 7 * 864e5)) return rows[0].url;
  let url;
  try { url = await find(name, sport); } catch { return null; } // network/rate-limit problem: try again next time
  await q(`INSERT INTO team_logos (name, url, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (name) DO UPDATE SET url=EXCLUDED.url, fetched_at=now()`, [name, url]);
  return url;
}

/** Fill home_logo / away_logo for a league's upcoming and live fixtures (runs in the background, one at a time).
 *  ESPN first (the league's own team list – it also replaces a wrong crest already set), then TheSportsDB. */
export function attachLogos(leagueId, force) {
  queue = queue.then(async () => {
    const { rows: [lg] } = await q(`SELECT ext_id FROM leagues WHERE id=$1`, [leagueId]);
    const path = lg && lg.ext_id && ESPN[String(lg.ext_id).replace(/^oa:/, '')];
    const teams = path ? await espnTeams(path) : [];
    const { rows } = await q(`SELECT DISTINCT unnest(ARRAY[home, away]) AS name, sport FROM events WHERE league_id=$1 AND status IN ('scheduled','live')
      AND ($2 OR $3 OR home_logo IS NULL OR away_logo IS NULL)`, [leagueId, !!force, teams.length > 0]);
    let hit = 0;
    for (const r of rows) {
      let url = teams.length ? espnMatch(teams, r.name) : null;
      if (url) hit++; else if (teams.length) console.log(`[logos] no espn match: ${r.name} (${path})`);
      if (url) await q(`INSERT INTO team_logos (name, url, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (name) DO UPDATE SET url=EXCLUDED.url, fetched_at=now()`, [r.name, url]);
      else url = await logoFor(r.name, r.sport);
      if (url) await q(`UPDATE events SET home_logo = CASE WHEN home=$1 THEN $2 ELSE home_logo END, away_logo = CASE WHEN away=$1 THEN $2 ELSE away_logo END
        WHERE league_id=$3 AND (home=$1 OR away=$1) AND status IN ('scheduled','live')`, [r.name, url, leagueId]);
    }
    if (path) console.log(`[logos] ${path}: ${hit}/${rows.length} crests from espn`);
  }).catch(e => console.error('[logos]', e.message));
  return queue;
}
