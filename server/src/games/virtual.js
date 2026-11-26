// Virtual League – the server runs back-to-back 2-minute rounds of 6 matches.
// Each match is a normal event (sport 'vfootball') with real markets, so bets go through
// /api/bets/place and settle through settleEvent() exactly like real football.
// Results are drawn with the CSPRNG at kick-off, after betting has closed, and kept server-side (events.model is
// never sent to players). The match then plays out live over VLEAGUE_PLAY_SEC (default 60 s): the clock runs from
// 1' to 90' with a short half-time, goals and corners appear at their minute, then full time and settlement.
import { q, pool } from '../db/pool.js';
import { upsertEvent } from '../feeds/index.js';
import { footballMarkets, marketNeeds } from '../feeds/demo.js';
import { settleEvent } from '../lib/settle.js';
import { inplayRules } from '../lib/inplay.js';
import { rng, samplePois } from './rng.js';

export const ROUND_MS = 120000;
export const PLAY_MS = Math.max(20, Math.min(100, +process.env.VLEAGUE_PLAY_SEC || 60)) * 1000;
const H1_END = 0.47, H2_START = 0.53;   // share of the play-out: first half, half-time, second half
// Every match of a round runs its clock at the same speed (all show 37' together, like a real matchday): the halves
// are timed for the longest added time (45+3', 90+5'); a match with less goes to half-time / full time earlier.
const H1_MAX = 48, H2_MAX = 50;
const TEAMS = ['Lagos City', 'Accra United', 'Kumasi Stars', 'Abuja Kings', 'Kano Falcons', 'Tema Mariners', 'Ibadan Lions', 'Takoradi Sharks', 'Port Harcourt Rivers', 'Tamale Eagles', 'Benin Royals', 'Sunyani Leopards'];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

let leagueId = null;
async function league() {
  if (leagueId) return leagueId;
  const { rows } = await q(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ('vfootball','Virtual League','LetBet Virtuals','world',false,'lba:virtual')
    ON CONFLICT (ext_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`);
  return (leagueId = rows[0].id);
}

async function createRound(kick) {
  const lg = await league(), slot = Math.floor(kick / ROUND_MS), round = slot % 10000, t = shuffle([...TEAMS]), uid = Date.now().toString(36);
  for (let i = 0; i < 6; i++) {
    const m = { extId: `vl:${slot}:${uid}:${i}`, sport: 'vfootball', leagueId: lg, home: t[2 * i], away: t[2 * i + 1], kickoff: new Date(kick), status: 'scheduled',
      minute: 0, score: [0, 0], lh: 0.7 + rng() * 1.4, la: 0.5 + rng() * 1.2, stats: { round } };
    const id = await upsertEvent(m, footballMarkets(m, { noCorners: true, noCards: true }));
    await q('UPDATE events SET model = $2 WHERE id = $1', [id, { lh: m.lh, la: m.la, lc: 8 + rng() * 4 }]);
  }
}

/** At kick-off: draw the result (CSPRNG, betting is closed) – goals, corners and the added time of each half – keep it
 *  server-side and start the clock. Goal times are positions in their half: 1..45+added (1st), 46..90+added (2nd). */
async function kickOff() {
  const { rows } = await q(`SELECT id, model FROM events WHERE sport='vfootball' AND status='scheduled' AND kickoff <= now() ORDER BY id`);
  if (!rows.length) return;
  const draws = rows.map(e => {
    const md = e.model || { lh: 1.2, la: 1, lc: 9 };
    const add = [1 + Math.floor(rng() * 3), 2 + Math.floor(rng() * 4)];   // 1–3 and 2–5 minutes of added time
    const h1 = samplePois(md.lh * 0.45), a1 = samplePois(md.la * 0.45), h2 = samplePois(md.lh * 0.55), a2 = samplePois(md.la * 0.55);
    const goal = (side, half) => ({ side, half, t: half === 1 ? 1 + Math.floor(rng() * (45 + add[0])) : 46 + Math.floor(rng() * (45 + add[1])) });
    const goals = [...Array.from({ length: h1 }, () => goal(0, 1)), ...Array.from({ length: a1 }, () => goal(1, 1)),
      ...Array.from({ length: h2 }, () => goal(0, 2)), ...Array.from({ length: a2 }, () => goal(1, 2))].sort((x, y) => x.half - y.half || x.t - y.t);
    const final = { h: h1 + h2, a: a1 + a2, ht: [h1, a1], goals, add, corners: [samplePois(md.lc * 0.55), samplePois(md.lc * 0.45)] };
    return { id: e.id, final, a0: add[0] };
  });
  // the whole round goes live in ONE statement, so every screen sees its matches kick off together;
  // playMs and the first half's added time let the app run the clock (the result stays in model.final, server-side)
  const u = await q(`UPDATE events e SET status='live', minute=1, period='H1', model = coalesce(e.model,'{}'::jsonb) || jsonb_build_object('final', d.final),
      stats = e.stats || '{"goals": [], "corners": [0, 0], "noScore": false, "plus": 0}'::jsonb || jsonb_build_object('playMs', $2::int, 'added', jsonb_build_array(d.a0, null)),
      updated_at=now()
    FROM jsonb_to_recordset($1::jsonb) AS d(id int, final jsonb, a0 int) WHERE e.id = d.id AND e.status='scheduled' RETURNING e.id`, [JSON.stringify(draws), PLAY_MS]);
  if (u.rows.length) await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id = ANY($1) AND NOT suspended', [u.rows.map(r => r.id)]);   // no in-play betting
}
/** What players see of a goal: minute 1–45 / 46–90, plus added time (45+2', 90+4'). */
const shown = g => { const cap = g.half === 1 ? 45 : 90; return { side: g.side, min: Math.min(g.t, cap), ...(g.t > cap ? { plus: g.t - cap } : {}) }; };
/** The match clock for a share f (0..1) of the play-out: each half runs its 45 minutes plus its added time. */
export function clockAt(f, add = [0, 0]) {
  const ht = { t: 45 + add[0], half: 1, minute: 45, plus: 0, period: 'HT' };
  if (f < H1_END) { const t = 1 + Math.floor(Math.max(0, f) / H1_END * H1_MAX); return t > 45 + add[0] ? ht : { t, half: 1, minute: Math.min(45, t), plus: Math.max(0, t - 45), period: 'H1' }; }
  if (f < H2_START) return ht;
  const t = 46 + Math.floor((f - H2_START) / (1 - H2_START) * H2_MAX);
  if (t > 90 + add[1] || f >= 1) return { t: 90 + add[1], half: 2, minute: 90, plus: add[1], period: 'FT', over: true };   // its own full time
  return { t, half: 2, minute: Math.min(90, t), plus: Math.max(0, t - 90), period: 'H2' };
}
/* In-play betting. While a match plays, its full-time markets and the next goal are priced from the SCORE and the
   TIME LEFT only – never from the drawn result (goals fall at random times, so what has happened says nothing about
   what is still to come) – with the house margin, and re-priced as the clock runs: odds go up and down live.
   A goal stops betting on that match for BET_STOP_MS, then it reopens at the new prices. Score and prices change in
   one transaction. The app shows the match – and these odds – VLAG (5 s) behind, so on screen the odds lock the
   moment the goal appears and reopen at the new prices. */
const BET_STOP_MS = Math.max(1500, +process.env.VLEAGUE_BET_STOP_MS || 3000);
const LIVE_MARKET = k => marketNeeds(k) === 'ft' || k === 'next';
const liveState = new Map();   // event id -> { goals, pricedT, pricedPeriod, open, stopUntil }
export function livePrices(e, c, score, add, ht) {
  // the shared pricing model works in 0–90 minutes; each virtual half also has its added time
  const minute = c.period === 'HT' ? 45 : c.half === 1 ? 45 * Math.min(1, c.t / (45 + add[0])) : 45 + 45 * Math.min(1, (c.t - 45) / (45 + add[1]));
  const md = e.model || {};
  return footballMarkets({ home: e.home, away: e.away, lh: md.lh, la: md.la, status: 'live', minute, score, ht: c.period === 'H1' ? null : ht },
    { noCorners: true, noCards: true }).filter(x => LIVE_MARKET(x.key));
}
async function inTx(fn) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err; }
  finally { c.release(); }
}

/** Live matches: show what has happened by the current minute, price the live markets; at the end, full time and settlement. */
async function playOut() {
  const { rows } = await q(`SELECT id, kickoff, model, minute, period, stats, home, away FROM events WHERE sport='vfootball' AND status='live'`);
  const R = rows.length ? await inplayRules() : null;
  for (const e of rows) {
    const fin = e.model && e.model.final; if (!fin) continue;
    const add = fin.add || [0, 0], f = (Date.now() - new Date(e.kickoff)) / PLAY_MS;
    if (f >= 1 || clockAt(f, add).over) {
      const u = await q(`UPDATE events SET status='finished', minute=90, period='FT', score_home=$2, score_away=$3, ht_home=$4, ht_away=$5,
          stats = stats || $6::jsonb, updated_at=now() WHERE id=$1 AND status='live'`, [e.id, fin.h, fin.a, fin.ht[0], fin.ht[1], { goals: fin.goals.map(shown), corners: fin.corners, plus: 0, added: add }]);
      liveState.delete(e.id);
      if (u.rowCount) { await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [e.id]); await settleEvent(e.id); }
      continue;
    }
    const c = clockAt(f, add);
    const seen = fin.goals.filter(g => g.half < c.half || (g.half === c.half && g.t <= c.t) || (c.period === 'HT' && g.half === 1));
    const sh = seen.filter(g => g.side === 0).length, sa = seen.length - sh;
    const prog = c.half === 1 ? c.t / (90 + add[0] + add[1]) : (45 + add[0] + (c.t - 45)) / (90 + add[0] + add[1]);
    const corners = fin.corners.map(n => Math.floor(n * Math.min(1, prog)));
    const clockMoved = !(c.minute === e.minute && c.period === e.period && c.plus === ((e.stats && e.stats.plus) || 0));
    const now = Date.now(), st = liveState.get(e.id) || { goals: seen.length, pricedT: null, open: false, stopUntil: 0 };
    const goal = seen.length > st.goals;
    if (goal) st.stopUntil = now + BET_STOP_MS;
    const stopped = now < st.stopUntil;
    const late = c.half === 2 && c.t >= R.closeMinute;   // in-play betting closes at 80' (Settings -> inplay)
    const closed = stopped || late;
    const reprice = !closed && (!st.open || st.pricedT == null || c.period !== st.pricedPeriod || Math.abs(c.t - st.pricedT) >= 2);
    if (!clockMoved && !goal && !reprice && !(closed && st.open)) { liveState.set(e.id, st); continue; }
    await inTx(async db => {
      if (clockMoved || goal) await db.query(`UPDATE events SET minute=$2, period=$3, score_home=$4, score_away=$5, stats = stats || $6::jsonb,
          ht_home = CASE WHEN $3 IN ('HT','H2') THEN $7 ELSE ht_home END, ht_away = CASE WHEN $3 IN ('HT','H2') THEN $8 ELSE ht_away END,
          updated_at=now() WHERE id=$1 AND status='live'`, [e.id, c.minute, c.period, sh, sa, { goals: seen.map(shown), corners, plus: c.plus, added: c.period === 'H1' ? [add[0], null] : add, betStop: stopped }, fin.ht[0], fin.ht[1]]);
      if (closed) {   // goal: betting stops on this match for a few seconds; from 80' it stays closed
        await db.query('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended', [e.id]);
        st.open = false;
      } else if (reprice) {
        const mk = livePrices(e, c, [sh, sa], add, fin.ht);
        await db.query(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended, updated_at)
            SELECT $1, x.key, x.name, x.grp, x.cols, x.outcomes, false, now() FROM jsonb_to_recordset($2::jsonb) AS x(key text, name text, grp text, cols int, outcomes jsonb)
          ON CONFLICT (event_id, key) DO UPDATE SET name=EXCLUDED.name, outcomes=EXCLUDED.outcomes, suspended=false, updated_at=now()`,
          [e.id, JSON.stringify(mk.map(x => ({ key: x.key, name: x.name, grp: x.group, cols: x.cols, outcomes: x.outcomes })))]);
        // pre-match markets with no live price (half-time, corners, cards…) stay closed
        await db.query('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1 AND NOT suspended AND NOT (key = ANY($2))', [e.id, mk.map(x => x.key)]);
        st.open = true; st.pricedT = c.t; st.pricedPeriod = c.period;
      }
    });
    if (goal || stopped) st.goals = seen.length;
    liveState.set(e.id, st);
  }
}

let lastClean = 0;
export async function tick() {
  // open the next round first, so a new round is on screen the moment the current one kicks off
  const { rows } = await q(`SELECT max(kickoff) AS k FROM events WHERE sport='vfootball' AND status='scheduled' AND kickoff > now()`);
  if (!rows[0].k) {
    let kick = Math.ceil(Date.now() / ROUND_MS) * ROUND_MS;
    if (kick - Date.now() < 30000) kick += ROUND_MS;
    await createRound(kick);
  }
  await kickOff();
  await playOut();
  if (Date.now() - lastClean > 10 * 60 * 1000) {
    lastClean = Date.now();
    await q(`DELETE FROM events e WHERE e.sport='vfootball' AND e.status='finished' AND e.kickoff < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM bet_legs l WHERE l.event_id = e.id)`);
  }
}
