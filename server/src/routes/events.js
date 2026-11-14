import { Router } from 'express';
import { q } from '../db/pool.js';

const r = Router();

const shape = (e, markets) => ({
  id: e.id, sport: e.sport, league: { id: e.league_id, name: e.lname, country: e.lcountry, flag: e.lflag, top: e.ltop },
  home: e.home, away: e.away, homeLogo: e.home_logo, awayLogo: e.away_logo,
  kickoff: e.kickoff, status: e.status, minute: e.minute, period: e.period,
  score: [e.score_home, e.score_away], ht: e.ht_home == null ? null : [e.ht_home, e.ht_away], stats: e.stats, hot: e.hot,
  markets: markets || undefined,
});

const EV_SELECT = `SELECT e.*, l.name AS lname, l.country AS lcountry, l.flag AS lflag, l.top AS ltop FROM events e JOIN leagues l ON l.id=e.league_id`;

async function withMarkets(events, keys) {
  if (!events.length) return [];
  const ids = events.map(e => e.id);
  const { rows } = await q(`SELECT event_id, key, name, grp, cols, outcomes, suspended FROM markets WHERE event_id = ANY($1) ${keys ? 'AND key = ANY($2)' : ''}`, keys ? [ids, keys] : [ids]);
  const by = {};
  rows.forEach(m => (by[m.event_id] ||= []).push({ key: m.key, name: m.name, group: m.grp, cols: m.cols, outcomes: m.outcomes, suspended: m.suspended }));
  return events.map(e => shape(e, by[e.id] || []));
}

r.get('/leagues', async (_req, res, next) => {
  // only leagues that have something to bet on right now
  try { const { rows } = await q(`SELECT id, sport, name, country, flag, top FROM leagues l WHERE EXISTS (SELECT 1 FROM events e WHERE e.league_id=l.id AND e.status IN ('scheduled','live')) ORDER BY top DESC, country, name`); res.json({ leagues: rows }); } catch (e) { next(e); }
});

// GET /events?sport=football&status=scheduled|live&league=3&from=&to=&limit=
r.get('/', async (req, res, next) => {
  const { sport, status, league, day, limit = 200, markets } = req.query;
  const where = ["e.status <> 'cancelled'"], params = [];
  if (sport) { params.push(sport); where.push(`e.sport = $${params.length}`); }
  if (status) { params.push(status); where.push(`e.status = $${params.length}`); }
  if (league) { params.push(+league); where.push(`e.league_id = $${params.length}`); }
  if (day === 'today') where.push(`e.kickoff::date = now()::date`);
  if (day === '3h') where.push(`e.kickoff <= now() + interval '3 hours' AND e.status='scheduled'`);
  if (!status) where.push(`e.status <> 'finished'`);
  params.push(Math.min(+limit || 200, 500));
  try {
    const { rows } = await q(`${EV_SELECT} WHERE ${where.join(' AND ')} ORDER BY (e.status='live') DESC, e.kickoff LIMIT $${params.length}`, params);
    const keys = markets ? String(markets).split(',') : ['1x2', 'dc', 'ou', 'gg', 'win', 'hcp', 'tot'];
    res.json({ events: await withMarkets(rows, keys) });
  } catch (e) { next(e); }
});

r.get('/results', async (req, res, next) => {
  try {
    // virtual rounds finish every 2 minutes – only returned when asked for (sport=vfootball)
    const { rows } = await q(`${EV_SELECT} WHERE e.status='finished' ${req.query.sport ? 'AND e.sport=$1' : "AND e.sport <> 'vfootball'"} ORDER BY e.updated_at DESC LIMIT ${req.query.sport === 'vfootball' ? 30 : 300}`, req.query.sport ? [req.query.sport] : []);
    res.json({ events: rows.map(e => shape(e)) });
  } catch (e) { next(e); }
});

r.get('/search', async (req, res, next) => {
  const s = String(req.query.q || '').trim();
  if (s.length < 2) return res.json({ events: [] });
  try {
    const { rows } = await q(`${EV_SELECT} WHERE e.status <> 'finished' AND (e.home ILIKE $1 OR e.away ILIKE $1 OR l.name ILIKE $1 OR l.country ILIKE $1) ORDER BY e.kickoff LIMIT 30`, ['%' + s + '%']);
    res.json({ events: rows.map(e => shape(e)) });
  } catch (e) { next(e); }
});

r.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await q(`${EV_SELECT} WHERE e.id=$1`, [+req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ event: (await withMarkets(rows))[0] });
  } catch (e) { next(e); }
});

/** Events (by id) with the given market keys, in the public shape – used by the jackpot round. */
export async function eventsWithMarkets(ids, keys) {
  const { rows } = await q(`${EV_SELECT} WHERE e.id = ANY($1)`, [ids]);
  return withMarkets(rows, keys);
}

export default r;
