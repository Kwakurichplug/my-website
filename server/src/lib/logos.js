// Club crests from TheSportsDB (free API). Looked up once per team name and cached in
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

/** Crest URL for one team (cached). */
export async function logoFor(name, sport = 'football') {
  const { rows } = await q(`SELECT url, fetched_at FROM team_logos WHERE name=$1`, [name]);
  if (rows[0] && (rows[0].url || Date.now() - new Date(rows[0].fetched_at) < 7 * 864e5)) return rows[0].url;
  let url;
  try { url = await find(name, sport); } catch { return null; } // network/rate-limit problem: try again next time
  await q(`INSERT INTO team_logos (name, url, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (name) DO UPDATE SET url=EXCLUDED.url, fetched_at=now()`, [name, url]);
  return url;
}

/** Fill home_logo / away_logo for a league's upcoming and live fixtures (runs in the background, one at a time). */
export function attachLogos(leagueId) {
  queue = queue.then(async () => {
    const { rows } = await q(`SELECT DISTINCT unnest(ARRAY[home, away]) AS name, sport FROM events WHERE league_id=$1 AND status IN ('scheduled','live') AND (home_logo IS NULL OR away_logo IS NULL)`, [leagueId]);
    for (const r of rows) {
      const url = await logoFor(r.name, r.sport);
      if (url) await q(`UPDATE events SET home_logo = CASE WHEN home=$1 THEN $2 ELSE home_logo END, away_logo = CASE WHEN away=$1 THEN $2 ELSE away_logo END WHERE league_id=$3 AND (home=$1 OR away=$1)`, [r.name, url, leagueId]);
    }
  }).catch(e => console.error('[logos]', e.message));
  return queue;
}
