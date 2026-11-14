// Virtual League – the server runs back-to-back 2-minute rounds of 6 matches.
// Each match is a normal event (sport 'vfootball') with real markets, so bets go through
// /api/bets/place and settle through settleEvent() exactly like real football.
// Results are drawn with the CSPRNG at kick-off, after betting has closed.
import { q } from '../db/pool.js';
import { upsertEvent } from '../feeds/index.js';
import { footballMarkets } from '../feeds/demo.js';
import { settleEvent } from '../lib/settle.js';
import { rng, samplePois } from './rng.js';

export const ROUND_MS = 120000;
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

async function playDue() {
  const { rows } = await q(`SELECT id, model FROM events WHERE sport='vfootball' AND status='scheduled' AND kickoff <= now() ORDER BY id`);
  for (const e of rows) {
    const md = e.model || { lh: 1.2, la: 1, lc: 9 };
    const h1 = samplePois(md.lh * 0.45), a1 = samplePois(md.la * 0.45), h2 = samplePois(md.lh * 0.55), a2 = samplePois(md.la * 0.55);
    const goal = (side, from, to) => ({ side, min: from + Math.floor(rng() * (to - from + 1)) });
    const goals = [...Array.from({ length: h1 }, () => goal(0, 1, 45)), ...Array.from({ length: a1 }, () => goal(1, 1, 45)),
      ...Array.from({ length: h2 }, () => goal(0, 46, 90)), ...Array.from({ length: a2 }, () => goal(1, 46, 90))].sort((x, y) => x.min - y.min);
    const corners = [samplePois(md.lc * 0.55), samplePois(md.lc * 0.45)];
    const u = await q(`UPDATE events SET status='finished', minute=90, period='FT', score_home=$2, score_away=$3, ht_home=$4, ht_away=$5,
        stats = stats || $6::jsonb, updated_at = now() WHERE id=$1 AND status='scheduled'`, [e.id, h1 + h2, a1 + a2, h1, a1, { goals, corners }]);
    if (u.rowCount) await settleEvent(e.id);
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
  await playDue();
  if (Date.now() - lastClean > 10 * 60 * 1000) {
    lastClean = Date.now();
    await q(`DELETE FROM events e WHERE e.sport='vfootball' AND e.status='finished' AND e.kickoff < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM bet_legs l WHERE l.event_id = e.id)`);
  }
}
