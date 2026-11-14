// Odds feed scheduler. ODDS_PROVIDER picks the adapter:
//   demo        – generates and simulates matches (no key needed)
//   apifootball – API-Football (api-sports.io); needs ODDS_API_KEY   [stub until key arrives]
// Every adapter exposes: sync() -> upserts leagues/events/markets, and
// tick() -> updates live events; finished events are settled here.
import { q } from '../db/pool.js';
import { settleEvent } from '../lib/settle.js';
import * as demo from './demo.js';

const adapters = { demo };

export function startFeeds() {
  const name = process.env.ODDS_PROVIDER || 'demo';
  const a = adapters[name];
  if (!a) { console.warn(`[feeds] unknown provider ${name}; feeds off`); return; }
  const run = async fn => { try { await fn(); } catch (e) { console.error('[feeds]', e.message); } };
  run(a.sync);
  setInterval(() => run(a.sync), a.syncEvery || 10 * 60 * 1000);
  setInterval(() => run(async () => {
    const finished = await a.tick();
    for (const id of finished || []) await settleEvent(id);
  }), a.tickEvery || 4000);
  console.log(`[feeds] ${name} running`);
}

/** Helper for adapters: upsert one event with its markets. */
export async function upsertEvent(ev, markets) {
  const { rows } = await q(`INSERT INTO events (id, ext_id, sport, league_id, home, away, home_logo, away_logo, kickoff, status, minute, period, score_home, score_away, ht_home, ht_away, stats, hot, updated_at)
    VALUES (coalesce($1, nextval('events_id_seq')), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
    ON CONFLICT (ext_id) DO UPDATE SET status=EXCLUDED.status, minute=EXCLUDED.minute, period=EXCLUDED.period, score_home=EXCLUDED.score_home, score_away=EXCLUDED.score_away,
      ht_home=EXCLUDED.ht_home, ht_away=EXCLUDED.ht_away, stats=EXCLUDED.stats, home_logo=coalesce(EXCLUDED.home_logo, events.home_logo), away_logo=coalesce(EXCLUDED.away_logo, events.away_logo), kickoff=EXCLUDED.kickoff, updated_at=now()
    RETURNING id`,
    [ev.id ?? null, ev.extId, ev.sport, ev.leagueId, ev.home, ev.away, ev.homeLogo || null, ev.awayLogo || null, ev.kickoff, ev.status, ev.minute || 0, ev.period || null, ev.score?.[0] || 0, ev.score?.[1] || 0, ev.ht?.[0] ?? null, ev.ht?.[1] ?? null, ev.stats || {}, !!ev.hot]);
  const id = rows[0].id;
  for (const m of markets || []) {
    await q(`INSERT INTO markets (event_id, key, name, grp, cols, outcomes, suspended, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())
      ON CONFLICT (event_id, key) DO UPDATE SET outcomes=EXCLUDED.outcomes, suspended=EXCLUDED.suspended, name=EXCLUDED.name, updated_at=now()`,
      [id, m.key, m.name, m.group, m.cols, JSON.stringify(m.outcomes), !!m.suspended]);
  }
  return id;
}
