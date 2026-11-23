// Live scores for REAL matches from API-Football (api-sports.io), so in-play betting on them can stay open.
//
// The odds feed (The Odds API) prices the matches, but on a small plan its scores come every 10–30 min – too stale to
// take in-play bets (anyone watching on TV would bet after a goal). One API-Football call (/fixtures?live=all) returns
// every match in play worldwide with the real minute and score, so:
//   • polled about every APIFOOTBALL_POLL_SEC (default 15 s) – only while one of our real matches is in play – and
//     never faster than the plan's daily allowance can carry for the rest of the day (x-ratelimit headers);
//   • each of our matches is paired with its fixture by BOTH team names (spelt differently by the two feeds:
//     "Wolves" / "Wolverhampton Wanderers") and the kick-off time;
//   • a new score stops betting on that match for GOAL_STOP_MS, then it re-prices; while the score is fresh the
//     in-play markets are open and priced from the match's model, the real minute and the score (house margin).
// Off until APIFOOTBALL_KEY is set (Railway variable). APIFOOTBALL_BASE overrides the URL (tests use a mock).
import { q } from '../db/pool.js';
import { footballMarkets, marketNeeds } from './demo.js';
import { inplayRules, pastClose } from '../lib/inplay.js';

const KEY = () => process.env.APIFOOTBALL_KEY;
const BASE = () => (process.env.APIFOOTBALL_BASE || 'https://v3.football.api-sports.io').replace(/\/$/, '');
const POLL_MS = () => Math.max(5, Number(process.env.APIFOOTBALL_POLL_SEC) || 15) * 1000;
export const FRESH_MS = 90000, GOAL_STOP_MS = 10000;
export const enabled = () => !!KEY();
const S = { last: 0, gap: 0, busy: false, remaining: null, limit: null, error: null, at: 0 };
export const status = () => ({ enabled: enabled(), lastCall: S.at || null, remaining: S.remaining, limit: S.limit, error: S.error, everySec: Math.round(Math.max(POLL_MS(), S.gap) / 1000) });

/* ---------- matching two feeds' team names ---------- */
const STOP = new Set(['fc', 'afc', 'cf', 'sc', 'ac', 'cd', 'sd', 'ud', 'fk', 'sk', 'if', 'bk', 'the', 'and', 'de', 'club', 'calcio', 'football', 'futbol', 'clube', 'sv', 'vfb', 'vfl', 'tsg', 'rc', 'as', 'ss', 'us', 'cp', 'ca']);
// words that tell clubs of one city apart: ignored only when one feed leaves them out ("Wolves"); two different ones = two clubs
const SUFFIX = new Set(['hotspur', 'albion', 'wanderers', 'athletic', 'united', 'city', 'town', 'county', 'rovers']);
const ALIAS = { wolves: 'wolverhampton', spurs: 'tottenham', man: 'manchester', utd: 'united', inter: 'internazionale', psg: 'paris', bayern: 'bayern', atletico: 'atletico', nottm: 'nottingham', sheff: 'sheffield', qpr: 'queens' };
const words = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(w => ALIAS[w] || w);
// words many clubs share ("Real Madrid" / "Real Betis"): they never decide a match on their own
const GENERIC = new Set(['real', 'sporting', 'atletico', 'dynamo', 'dinamo', 'olympique', 'racing', 'union', 'borussia', 'inter', 'deportivo', 'sport', 'olympic', 'young', 'new']);
const sameWord = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) || y.startsWith(x.slice(0, 4))));
/** 1 when two names are the same club: every distinctive word of the shorter name is in the other ("Wolverhampton" /
 *  "Wolves", "Brighton" / "Brighton and Hove Albion"); 0 for "Manchester City" / "Manchester United",
 *  "Sheffield United" / "Sheffield Wednesday", "Real Madrid" / "Real Betis". Below 1 = not sure. */
export function sameTeam(a, b) {
  const wa = words(a), wb = words(b), sa = wa.filter(x => SUFFIX.has(x)), sb = wb.filter(x => SUFFIX.has(x));
  if (sa.length && sb.length && !sa.some(x => sb.includes(x))) return 0;
  const strip = (w, generic) => w.filter(x => !STOP.has(x) && !SUFFIX.has(x) && !(generic && GENERIC.has(x)));
  let A = strip(wa, true), B = strip(wb, true);
  if (!A.length || !B.length) { A = strip(wa, false); B = strip(wb, false); }
  if (!A.length || !B.length) return 0;
  const [S, L, sufS] = A.length <= B.length ? [A, B, sa] : [B, A, sb];
  const hit = S.filter(x => L.some(y => sameWord(x, y))).length;
  if (hit < S.length) return (hit / S.length) * 0.5;
  if (sufS.length && L.some(y => !S.some(x => sameWord(x, y)))) return 0;   // "Sheffield United" / "Sheffield Wednesday"
  return 1;
}
/** The live fixture for one of our matches: both teams agree and the kick-off is within 20 minutes. */
export function pair(e, fixtures) {
  const ko = new Date(e.kickoff).getTime(); let best = null, bestScore = 0;
  for (const f of fixtures) {
    const t = Date.parse(f.fixture && f.fixture.date); if (!t || Math.abs(t - ko) > 20 * 60000) continue;
    const s = Math.min(sameTeam(e.home, f.teams.home.name), sameTeam(e.away, f.teams.away.name));
    if (s >= 0.75 && s > bestScore) { best = f; bestScore = s; }
  }
  return best;
}

/* ---------- prices from the real minute and score ---------- */
async function price(e, minute, score, ht, open) {
  if (!open || !e.model || !e.model.lh) { await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [e.id]); return false; }
  const mk = footballMarkets({ home: e.home, away: e.away, lh: e.model.lh, la: e.model.la, status: 'live', minute: Math.min(89.5, minute), score, ht }, { noCorners: true, noCards: true })
    .filter(x => marketNeeds(x.key) === 'ft');   // the result feed gives the final score only: markets that settle on it
  await q(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended, updated_at)
      SELECT $1, x.key, x.name, x.grp, x.cols, x.outcomes, false, now() FROM jsonb_to_recordset($2::jsonb) AS x(key text, name text, grp text, cols int, outcomes jsonb)
    ON CONFLICT (event_id, key) DO UPDATE SET name=EXCLUDED.name, outcomes=EXCLUDED.outcomes, suspended=false, updated_at=now()`,
    [e.id, JSON.stringify(mk.map(x => ({ key: x.key, name: x.name, grp: x.group, cols: x.cols, outcomes: x.outcomes })))]);
  await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended AND NOT (key = ANY($2))', [e.id, mk.map(x => x.key)]);
  return true;
}

const PERIOD = { '1H': 'H1', HT: 'HT', '2H': 'H2', ET: 'H2', BT: 'H2', P: 'H2', LIVE: 'H2', INT: 'H2', SUSP: 'H2' };
/** Apply one live fixture to our match: score, real minute and half, freshness; goal stop; prices. */
export async function apply(e, f, now = Date.now()) {
  const st = e.stats || {}, s = f.fixture.status || {}, short = String(s.short || '');
  const home = Number(f.goals && f.goals.home) || 0, away = Number(f.goals && f.goals.away) || 0;
  const period = PERIOD[short] || (short === 'FT' || short === 'AET' || short === 'PEN' ? 'H2' : 'H1');
  const el = Number(s.elapsed) || 0, extra = Number(s.extra) || 0;
  const minute = period === 'HT' ? 45 : period === 'H1' ? Math.min(45, el) : Math.min(90, el);
  const plus = period === 'HT' ? 0 : extra || Math.max(0, period === 'H1' ? el - 45 : el - 90);
  const over = ['ET', 'BT', 'P', 'FT', 'AET', 'PEN', 'INT', 'SUSP'].includes(short);   // after 90' (or stopped): wait for the result
  const scored = home !== e.score_home || away !== e.score_away;
  const goalStop = scored ? new Date(now + GOAL_STOP_MS).toISOString() : st.betStopUntil || null;
  const ht = f.score && f.score.halftime && f.score.halftime.home != null && period !== 'H1' ? [f.score.halftime.home, f.score.halftime.away] : null;
  const next = { liveSource: 'apifootball', afId: f.fixture.id, scoreAt: new Date(now).toISOString(), noScore: false, minuteEstimated: false, plus, awaiting: over, live: !over && period !== 'HT', ...(goalStop ? { betStopUntil: goalStop } : {}) };
  await q(`UPDATE events SET status='live', score_home=$2, score_away=$3, minute=$4, period=$5, stats = stats || $6::jsonb,
      ht_home = coalesce($7, ht_home), ht_away = coalesce($8, ht_away), updated_at=now() WHERE id=$1 AND status IN ('scheduled','live')`,
    [e.id, home, away, minute, period, JSON.stringify(next), ht ? ht[0] : null, ht ? ht[1] : null]);
  const stopped = goalStop && Date.parse(goalStop) > now;
  const open = !over && period !== 'HT' && !stopped && !pastClose(period, minute, await inplayRules());
  await price({ ...e, score_home: home, score_away: away }, minute, [home, away], ht, open);
  return { scored, open, minute, period };
}

/** Leader, every few seconds: one call for every match in play, while one of ours is. */
export async function tick() {
  if (!KEY() || S.busy) return;
  const { rows: ours } = await q(`SELECT id, home, away, kickoff, status, score_home, score_away, period, minute, stats, model FROM events
    WHERE ext_id LIKE 'oa:%' AND sport='football' AND (status='live' OR (status='scheduled' AND kickoff <= now())) AND kickoff > now() - interval '4 hours'`);
  const now = Date.now();
  // between calls: a goal stop that has run out reopens at once (no need to wait for the next call)
  for (const e of ours) { const st = e.stats || {}; if (st.liveSource === 'apifootball' && st.betStopUntil && Date.parse(st.betStopUntil) <= now && st.betStopUntil !== st.reopened && now - Date.parse(st.scoreAt || 0) < FRESH_MS && !st.awaiting && e.period !== 'HT') {
    await q(`UPDATE events SET stats = stats || jsonb_build_object('reopened', $2::text) WHERE id=$1`, [e.id, st.betStopUntil]);
    await price(e, Number(e.minute) || 1, [e.score_home, e.score_away], null, !pastClose(e.period, e.minute, await inplayRules()));
  } }
  if (!ours.length || now - S.last < Math.max(POLL_MS(), S.gap)) return;
  S.last = now; S.busy = true;
  try {
    const r = await fetch(`${BASE()}/fixtures?live=all`, { headers: { 'x-apisports-key': KEY() }, signal: AbortSignal.timeout(10000) });
    const rem = Number(r.headers.get('x-ratelimit-requests-remaining')), lim = Number(r.headers.get('x-ratelimit-requests-limit'));
    if (Number.isFinite(rem)) {
      S.remaining = rem; S.limit = Number.isFinite(lim) ? lim : S.limit;
      const d = new Date(), toMidnight = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - d.getTime()) / 1000;
      S.gap = rem > 0 ? Math.min(30 * 60000, (toMidnight / rem) * 1000) : 30 * 60000;   // what is left today, spread to midnight (UTC)
    }
    const j = await r.json().catch(() => ({}));
    const errs = j && j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length);
    if (!r.ok || errs) throw new Error(`api-football ${r.status} ${JSON.stringify(j.errors || '').slice(0, 160)}`);
    S.error = null; S.at = now;
    const fixtures = Array.isArray(j.response) ? j.response : [];
    for (const e of ours) {
      const st = e.stats || {};
      const f = st.afId ? fixtures.find(x => x.fixture && x.fixture.id === st.afId) || pair(e, fixtures) : pair(e, fixtures);
      if (f) await apply(e, f, now);
    }
  } catch (err) { S.error = err.message; console.error('[livescores]', err.message); }
  finally { S.busy = false; }
}
