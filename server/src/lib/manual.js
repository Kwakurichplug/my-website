// Matches the manager adds by hand: real fixtures the odds feed does not carry (local leagues, friendlies, cup
// games). The admin gives the league, the teams, the kick-off and the 1X2 odds. Every other full-time market is priced
// from those odds by the same model as the feed (Poisson goal rates fitted to the 1X2) with the site margin, and the
// 1X2 keeps the admin's own prices. Betting closes at kick-off (bets.js refuses past-posting). The match then shows
// as started with its markets suspended. The admin settles it with the real final score (Trading desk → Enter
// result) or cancels it (every bet refunded). ext_id 'man:…' – no feed ever touches these events.
// Live scoring (optional): while the match is being played the admin can enter the real score and the half
// (Trading desk → the match → Live scoring); players then see a running clock and the score. Betting stays closed.
// Crests: remembered per team name (team_logos) – uploaded (team_crests, served at /api/crests/<id>), a link, or
// found automatically (TheSportsDB, lib/logos.js).
import { randomBytes } from 'node:crypto';
import { q } from '../db/pool.js';
import { fit } from '../feeds/oddsapi.js';
import { footballMarkets, marketNeeds } from '../feeds/demo.js';
import { upsertEvent } from '../feeds/index.js';
import { logoFor, attachLogos } from './logos.js';
import { inplayRules, pastClose } from './inplay.js';

const fail = (status, error, extra) => Object.assign(new Error(error), { status, body: { error, ...extra } });
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** Leagues the admin can pick (football; demo leagues are hidden once a real feed is on). */
export async function leagues() {
  const real = (process.env.ODDS_PROVIDER || 'demo') !== 'demo';
  const { rows } = await q(`SELECT id, name, country, flag, ext_id FROM leagues WHERE sport='football' ${real ? "AND coalesce(ext_id,'') NOT LIKE 'demo:%'" : ''}
    AND coalesce(ext_id,'') NOT LIKE 'vf:%' AND coalesce(ext_id,'') NOT LIKE 'vs:%' ORDER BY country, name`);
  return rows.map(l => ({ id: l.id, name: l.name, country: l.country, flag: l.flag, manual: String(l.ext_id || '').startsWith('man:') }));
}

async function leagueId(L) {
  if (L.id) {
    const { rows } = await q(`SELECT id FROM leagues WHERE id=$1 AND sport='football'`, [L.id]);
    if (!rows[0]) throw fail(400, 'league_not_found');
    return rows[0].id;
  }
  const { rows } = await q(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ('football',$1,$2,$3,false,$4)
    ON CONFLICT (ext_id) DO UPDATE SET name=EXCLUDED.name, flag=EXCLUDED.flag RETURNING id`, [L.name, L.country, L.flag, `man:${slug(L.country)}:${slug(L.name)}`]);
  return rows[0].id;
}

/** Every full-time market for a match from its 1X2 odds. Refuses prices that would lose money whatever happens. */
export function priceMatch(odds) {
  const S = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
  if (S < 1.02) throw fail(400, 'odds_too_high', { overround: +S.toFixed(4) });      // under 2% margin: players win on average
  if (S > 1.35) throw fail(400, 'odds_too_low', { overround: +S.toFixed(4) });
  const f = fit({ H: 1 / odds.home / S, D: 1 / odds.draw / S, A: 1 / odds.away / S });
  const markets = footballMarkets({ lh: f.lh, la: f.la, status: 'scheduled', minute: 0, score: [0, 0] }, { noCorners: true, noCards: true })
    .filter(x => marketNeeds(x.key) === 'ft');
  const x = markets.find(m => m.key === '1x2');
  if (x) { x.outcomes['1'].o = odds.home; x.outcomes.X.o = odds.draw; x.outcomes['2'].o = odds.away; }
  return { markets, model: { lh: f.lh, la: f.la }, margin: +((S - 1) * 100).toFixed(2) };
}

/** Add a match. d = { league: {id} | {name, country, flag}, home, away, kickoff: Date, odds: {home, draw, away} } */
export async function createMatch(d, adminId) {
  const kickoff = new Date(d.kickoff), now = Date.now();
  if (!(kickoff.getTime() > now + 5 * 60000)) throw fail(400, 'kickoff_too_soon');
  if (kickoff.getTime() > now + 60 * 86400000) throw fail(400, 'kickoff_too_far');
  if (d.home.toLowerCase() === d.away.toLowerCase()) throw fail(400, 'same_teams');
  const { markets, model, margin } = priceMatch(d.odds);
  // the same two teams within 12 h of each other is the same match (a time window: no time-zone / midnight edge cases)
  const dup = await q(`SELECT id FROM events WHERE lower(home)=lower($1) AND lower(away)=lower($2) AND kickoff BETWEEN $3::timestamptz - interval '12 hours' AND $3::timestamptz + interval '12 hours' AND status <> 'cancelled' LIMIT 1`, [d.home, d.away, kickoff.toISOString()]);
  if (dup.rows[0]) throw fail(409, 'duplicate', { eventId: Number(dup.rows[0].id) });
  const lid = await leagueId(d.league);
  // crests already known for these teams (uploaded, linked or found before); the rest are looked up in the background
  const known = async n => (await q(`SELECT url FROM team_logos WHERE name=$1 AND url IS NOT NULL`, [n])).rows[0]?.url || null;
  const [homeLogo, awayLogo] = [await known(d.home), await known(d.away)];
  const id = await upsertEvent({ extId: 'man:' + randomBytes(6).toString('hex'), sport: 'football', leagueId: lid, home: d.home, away: d.away, kickoff, status: 'scheduled',
    homeLogo, awayLogo, minute: 0, score: [0, 0], stats: { manual: true, addedBy: adminId, model, inplay: d.inplay !== false }, hot: !!d.hot }, markets);   // live betting on unless the admin unticks it
  if (!homeLogo || !awayLogo) attachLogos(lid).catch(() => {});
  return { id: Number(id), markets: markets.length, margin, homeLogo, awayLogo };
}

/* ---------- teams and crests ---------- */
/** Teams the admin can pick (seen in matches or with a crest), with their crest. */
export async function teams(term = '') {
  const t = '%' + String(term).trim().slice(0, 40) + '%';
  const { rows } = await q(`WITH names AS (
      SELECT home AS name FROM events WHERE sport='football' AND kickoff > now() - interval '120 days' AND coalesce(ext_id,'') NOT LIKE 'vs:%' AND coalesce(ext_id,'') NOT LIKE 'vf:%'
      UNION SELECT away FROM events WHERE sport='football' AND kickoff > now() - interval '120 days' AND coalesce(ext_id,'') NOT LIKE 'vs:%' AND coalesce(ext_id,'') NOT LIKE 'vf:%'
      UNION SELECT name FROM team_logos WHERE url IS NOT NULL)
    SELECT n.name, l.url AS logo FROM names n LEFT JOIN team_logos l ON l.name=n.name WHERE n.name ILIKE $1 ORDER BY (l.url IS NULL), n.name LIMIT 30`, [t]);
  return rows;
}
const useLogo = async (name, url) => {
  await q(`INSERT INTO team_logos (name, url, fetched_at) VALUES ($1,$2,now()) ON CONFLICT (name) DO UPDATE SET url=EXCLUDED.url, fetched_at=now()`, [name, url]);
  // every upcoming or live match of this team shows it at once
  await q(`UPDATE events SET home_logo = CASE WHEN home=$1 THEN $2 ELSE home_logo END, away_logo = CASE WHEN away=$1 THEN $2 ELSE away_logo END, updated_at=now()
    WHERE (home=$1 OR away=$1) AND status IN ('scheduled','live')`, [name, url]);
  return url;
};
const teamName = n => { const s = String(n || '').trim(); if (s.length < 2 || s.length > 60) throw fail(400, 'invalid'); return s; };
const IMG = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/, LINK = /^https:\/\/[^\s"'<>]{6,400}$/;
/** An uploaded crest: a PNG / JPEG / WebP data URL of at most ~45 KB (the admin page shrinks it to 160 px first). */
export async function uploadCrest(name, dataUrl) {
  name = teamName(name);
  const m = IMG.exec(String(dataUrl || ''));
  if (!m) throw fail(400, 'bad_image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > 45000) throw fail(400, 'image_too_big');
  const { rows } = await q(`INSERT INTO team_crests (name, mime, data) VALUES ($1,$2,$3) RETURNING id`, [name, m[1], buf]);
  return { logo: await useLogo(name, `/api/crests/${rows[0].id}`) };
}
/** A crest from a link (https only), or – internal – one of the site's own flags (/img/flags/<code>.svg). */
export async function linkCrest(name, url, ownFlag = false) {
  name = teamName(name);
  if (ownFlag ? !/^\/img\/flags\/[a-z]{2,6}(-[a-z]{2,3})?\.svg$/.test(String(url)) : !LINK.test(String(url || ''))) throw fail(400, 'bad_link');
  return { logo: await useLogo(name, String(url)) };
}
/** Find the club's crest automatically (TheSportsDB; cached per name). */
export async function findCrest(name) {
  name = teamName(name);
  const url = await logoFor(name, 'football');
  if (url) await useLogo(name, url);
  return { logo: url || null };
}
export async function crestImage(id) {
  const { rows } = await q(`SELECT mime, data FROM team_crests WHERE id=$1`, [id]);
  return rows[0] || null;
}

/* ---------- live scoring ---------- */
/* In-play betting on a hand-added match is the admin's call ("Live betting" on the live panel). Its markets are open
   only while the score is FRESH – the admin entered or confirmed it in the last MANUAL_LIVE_FRESH_SEC (default 180 s)
   – priced from the match's own goal model, the score and the clock, with the margin. A goal stops betting for
   GOAL_STOP_MS, then it reopens at the new prices. When the admin goes quiet, betting closes by itself (the leader
   checks every few seconds, and every bet is checked again when it is placed – stats.openUntil). */
export const LIVE_FRESH_SEC = () => Math.max(60, Number(process.env.MANUAL_LIVE_FRESH_SEC) || 180);
const LIVE_FRESH_MS = () => LIVE_FRESH_SEC() * 1000;
const GOAL_STOP_MS = 10000;
export async function priceLive(e) {
  const st = e.stats || {}, now = Date.now(), until = st.scoreAt ? Date.parse(st.scoreAt) + LIVE_FRESH_MS() : 0;
  const stopped = st.betStopUntil && now < Date.parse(st.betStopUntil);
  const c0 = clockOf(e.kickoff, e.period || 'H1', st.h2At);
  const open = e.status === 'live' && st.inplay && st.liveScoring && st.model && now < until && !stopped && !pastClose(c0.period, c0.minute, await inplayRules());
  if (!open) { await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [e.id]); return false; }
  const c = clockOf(e.kickoff, e.period || 'H1', st.h2At);
  const minute = c.period === 'HT' ? 45 : Math.min(89.5, c.minute);
  const ht = (e.period === 'H2' || e.period === 'HT') && e.ht_home != null ? [e.ht_home, e.ht_away] : null;
  const mk = footballMarkets({ home: e.home, away: e.away, lh: st.model.lh, la: st.model.la, status: 'live', minute, score: [e.score_home, e.score_away], ht },
    { noCorners: true, noCards: true }).filter(x => marketNeeds(x.key) === 'ft' || x.key === 'next');
  await q(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended, updated_at)
      SELECT $1, x.key, x.name, x.grp, x.cols, x.outcomes, false, now() FROM jsonb_to_recordset($2::jsonb) AS x(key text, name text, grp text, cols int, outcomes jsonb)
    ON CONFLICT (event_id, key) DO UPDATE SET name=EXCLUDED.name, outcomes=EXCLUDED.outcomes, suspended=false, updated_at=now()`,
    [e.id, JSON.stringify(mk.map(x => ({ key: x.key, name: x.name, grp: x.group, cols: x.cols, outcomes: x.outcomes })))]);
  await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended AND NOT (key = ANY($2))', [e.id, mk.map(x => x.key)]);
  await q(`UPDATE events SET stats = stats || jsonb_build_object('openUntil', $2::text) WHERE id=$1`, [e.id, new Date(until).toISOString()]);
  return true;
}

/** The admin enters the real score / half of a hand-added match that has kicked off. period: H1 | HT | H2.
 *  Sending the same score again confirms it (keeps live betting open); inplay turns live betting on / off. */
export async function liveUpdate(id, { home, away, period, inplay }) {
  const { rows } = await q(`SELECT * FROM events WHERE id=$1 AND ext_id LIKE 'man:%'`, [id]);
  const e = rows[0]; if (!e) throw fail(404, 'not_found');
  if (new Date(e.kickoff) > new Date()) throw fail(409, 'not_started');
  if (e.status !== 'live' && e.status !== 'scheduled') throw fail(409, 'not_live');
  const st = e.stats || {}, now = new Date().toISOString();
  const goals = Array.isArray(st.goals) ? st.goals.slice() : [];
  const ck = clockOf(e.kickoff, period, st.h2At || (period === 'H2' ? now : null)), mark = side => ({ side, min: ck.minute, ...(ck.plus ? { plus: ck.plus } : {}) });
  for (let i = e.score_home; i < home; i++) goals.push(mark(0));
  for (let i = e.score_away; i < away; i++) goals.push(mark(1));
  // a correction (score taken back) removes that side's latest goals
  for (const [side, from, to] of [[0, e.score_home, home], [1, e.score_away, away]]) for (let i = to; i < from; i++) { const k = goals.map(g => g.side).lastIndexOf(side); if (k >= 0) goals.splice(k, 1); }
  const scored = home > e.score_home || away > e.score_away;
  const next = { ...st, liveScoring: true, noScore: false, scoreAt: now, goals, plus: 0, ...(period === 'H2' && !st.h2At ? { h2At: now } : {}), ...(period === 'HT' && !st.htAt ? { htAt: now } : {}),
    ...(inplay != null ? { inplay: !!inplay } : {}), ...(scored ? { betStopUntil: new Date(Date.now() + GOAL_STOP_MS).toISOString() } : {}) };
  const c = clockOf(e.kickoff, period, next.h2At);
  await q(`UPDATE events SET status='live', score_home=$2, score_away=$3, period=$4, minute=$5, stats=$6,
    ht_home = CASE WHEN $4='HT' AND ht_home IS NULL THEN $2 ELSE ht_home END, ht_away = CASE WHEN $4='HT' AND ht_away IS NULL THEN $3 ELSE ht_away END,
    updated_at=now() WHERE id=$1`, [id, home, away, period, c.minute, next]);
  const open = await priceLive({ ...e, status: 'live', score_home: home, score_away: away, period, stats: next,
    ht_home: period === 'HT' && e.ht_home == null ? home : e.ht_home, ht_away: period === 'HT' && e.ht_away == null ? away : e.ht_away });
  return { id: Number(id), home, away, period, minute: c.minute, inplay: !!next.inplay, open, openUntil: new Date(Date.parse(now) + LIVE_FRESH_MS()).toISOString() };
}
/** The Live desk: hand-added matches in play or kicking off within 30 min, with what the admin needs to run them. */
export async function liveDesk() {
  const { rows } = await q(`SELECT e.id, e.home, e.away, e.home_logo, e.away_logo, e.kickoff, e.status, e.period, e.minute, e.score_home, e.score_away, e.ht_home, e.ht_away, e.stats,
      l.name AS league, l.country,
      (SELECT count(*)::int FROM bet_legs g JOIN bets b ON b.id=g.bet_id WHERE g.event_id=e.id AND b.status='open') AS open_bets,
      (SELECT coalesce(sum(b.stake),0) FROM bet_legs g JOIN bets b ON b.id=g.bet_id WHERE g.event_id=e.id AND b.status='open') AS open_stake,
      EXISTS (SELECT 1 FROM markets m WHERE m.event_id=e.id AND m.key='1x2' AND NOT m.suspended) AS open
    FROM events e JOIN leagues l ON l.id=e.league_id
    WHERE e.ext_id LIKE 'man:%' AND (e.status='live' OR (e.status='scheduled' AND e.kickoff <= now() + interval '30 minutes'))
    ORDER BY e.status='live' DESC, e.kickoff`);
  return rows.map(e => ({ ...e, stake: Number(e.open_stake), clock: e.status === 'live' ? clockOf(e.kickoff, e.period || 'H1', e.stats && e.stats.h2At) : null }));
}
/** The match clock: 1st half from kick-off, 2nd half from when the admin started it. */
function clockOf(kickoff, period, h2At) {
  if (period === 'HT') return { minute: 45, plus: 0, period: 'HT' };
  if (period === 'H2') { const t = 46 + Math.max(0, h2At ? Math.floor((Date.now() - new Date(h2At)) / 60000) : 0); return { minute: Math.min(90, t), plus: Math.min(15, Math.max(0, t - 90)), period: 'H2' }; }
  const t = Math.max(1, Math.floor((Date.now() - new Date(kickoff)) / 60000) + 1);
  return { minute: Math.min(45, t), plus: Math.min(15, Math.max(0, t - 45)), period: 'H1' };   // past 45' until the admin calls half-time: 45+x'
}

/** Leader, every 30 s: a manual match that has kicked off shows as started, its markets closed until the result. */
export async function tick() {
  // kick-off: with live betting on, the score is certainly 0-0 now – live scoring starts and betting opens by itself
  // (it stays open while an admin keeps the score fresh on the Live desk)
  const { rows } = await q(`UPDATE events SET status='live', period = CASE WHEN coalesce((stats->>'inplay')::boolean, false) THEN 'H1' ELSE period END,
      stats = stats || CASE WHEN coalesce((stats->>'inplay')::boolean, false) THEN jsonb_build_object('liveScoring', true, 'noScore', false, 'scoreAt', $1::text, 'goals', '[]'::jsonb, 'plus', 0)
        ELSE '{"noScore": true}'::jsonb END, updated_at=now()
    WHERE ext_id LIKE 'man:%' AND status='scheduled' AND kickoff <= now() RETURNING id`, [new Date().toISOString()]);
  if (rows.length) await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id = ANY($1) AND NOT suspended', [rows.map(r => r.id)]);
  // live scoring on: keep the clock running for players
  const { rows: live } = await q(`SELECT id, kickoff, period, minute, stats, status, home, away, score_home, score_away, ht_home, ht_away FROM events WHERE ext_id LIKE 'man:%' AND status='live' AND (stats->>'liveScoring')::boolean`);
  for (const e of live) {
    const c = clockOf(e.kickoff, e.period || 'H1', e.stats && e.stats.h2At);
    if (c.minute !== e.minute || c.plus !== ((e.stats && e.stats.plus) || 0))
      await q(`UPDATE events SET minute=$2, stats = stats || jsonb_build_object('plus', $3::int), updated_at=now() WHERE id=$1 AND status='live'`, [e.id, c.minute, c.plus]);
    if (e.stats && e.stats.inplay) await priceLive({ ...e, minute: c.minute });   // re-price with the clock; close when the score is stale
  }
}
