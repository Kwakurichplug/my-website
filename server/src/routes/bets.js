import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';
import { getSetting } from '../lib/settings.js';
import { inplayRules } from '../lib/inplay.js';
import { cashoutValue } from '../lib/settle.js';
import { sendEmail } from '../emails/index.js';

const r = Router();
const ticket = () => 'T' + randomBytes(4).toString('hex').toUpperCase();
const code = () => 'LB' + randomBytes(3).toString('hex').toUpperCase().slice(0, 5);

const selSchema = z.object({ eventId: z.number().int(), market: z.string(), outcome: z.string(), odd: z.number().positive() });

/** Re-price selections from the DB; returns legs or throws with detail. */
async function priceSelections(client, sels, acceptChanges) {
  const legs = [];
  for (const s of sels) {
    const { rows } = await client.query(
      `SELECT e.id, e.home, e.away, e.status, e.kickoff, e.stats, m.name, m.outcomes, m.suspended FROM events e JOIN markets m ON m.event_id=e.id AND m.key=$2 WHERE e.id=$1`, [s.eventId, s.market]);
    const row = rows[0];
    const o = row?.outcomes?.[s.outcome];
    // no past-posting: a pre-match price is gone once the game has kicked off (live prices need status 'live')
    // a hand-added match in play: only while its score is fresh and not in a goal stop (checked again here, not only by the leader)
    const st = row && row.stats || {}, nowMs = Date.now();
    const staleLive = row && row.status === 'live' && ((st.inplay && st.openUntil && Date.parse(st.openUntil) < nowMs) || (st.betStopUntil && Date.parse(st.betStopUntil) > nowMs) || st.awaiting);
    if (!row || !o || row.suspended || staleLive || o.o == null || row.status === 'finished' || row.status === 'cancelled' || (row.status === 'scheduled' && new Date(row.kickoff) <= new Date())) {
      throw Object.assign(new Error('selection_unavailable'), { status: 409, detail: { eventId: s.eventId, market: s.market } });
    }
    if (Math.abs(o.o - s.odd) > 0.004 && !acceptChanges) {
      throw Object.assign(new Error('odds_changed'), { status: 409, detail: { eventId: s.eventId, market: s.market, odd: o.o } });
    }
    legs.push({ eventId: row.id, market: s.market, outcome: s.outcome, label: o.l, marketName: row.name, match: `${row.home} vs ${row.away}`, odd: o.o, live: row.status === 'live' });
  }
  return legs;
}

const boostFor = (steps, n) => steps.reduce((b, [k, v]) => (n >= k ? v : b), 0);
/** The most boost n selections can carry while the multiple still returns at most 97% of the stake on average –
 *  whatever the tiers in Settings say. With a payout ratio m per selection a boosted multiple returns up to
 *  m^n x (1 + boost) (most with long odds), so boost <= 0.97 / m^n - 1. */
export const safeBoost = (n, margin) => Math.max(0, Math.floor((0.97 / Math.pow(Math.min(0.99, Math.max(0.5, Number(margin) || 0.94)), n) - 1) * 100));

/** Refer & Earn: pay the referrer (once) when the friend has deposited and has LOST at least the reward on settled
 *  sports bets (stakes minus what came back) – staking alone, or betting both sides, earns nothing (no reward farming). */
async function payReferral(user) {
  const reward = (await getSetting('referral'))?.[user.country];
  if (!reward) return;
  await tx(async c => {
    const { rows } = await c.query(`SELECT u.referred_by, u.ref_paid, r.country AS rc FROM users u LEFT JOIN users r ON r.id = u.referred_by WHERE u.id=$1 FOR UPDATE OF u`, [user.id]);
    const me = rows[0];
    if (!me || !me.referred_by || me.ref_paid || me.rc !== user.country) return;
    const { rows: st } = await c.query(`SELECT coalesce(sum(stake - coalesce(paid,0)) FILTER (WHERE status IN ('won','lost','cashout','void')),0)::float AS lost,
        (SELECT count(*)::int FROM payments WHERE user_id=$1 AND kind='deposit' AND status='success') AS deps FROM bets WHERE user_id=$1`, [user.id]);
    if (!st[0].deps || st[0].lost < reward) return;
    await c.query('UPDATE users SET ref_paid=true WHERE id=$1', [user.id]);
    await move(c, me.referred_by, 'referral', reward, 'RF' + String(user.uid || '').slice(-8), { friend: user.id });
  });
}

/** Leader, every minute: friends whose bets have settled since (the reward is checked at bet time too). */
export async function referralSweep() {
  const { rows } = await q(`SELECT DISTINCT u.id, u.country, u.uid FROM users u JOIN bets b ON b.user_id=u.id
    WHERE u.referred_by IS NOT NULL AND NOT coalesce(u.ref_paid,false) AND b.settled_at > now() - interval '1 day' LIMIT 200`);
  for (const u of rows) await payReferral(u).catch(() => {});
}

r.post('/place', requireUser, async (req, res, next) => {
  const p = z.object({
    type: z.enum(['single', 'multiple']),
    selections: z.array(selSchema).min(1).max(30),
    // whole cents: the ticket keeps exactly what the balance paid (no half-cent rounding gap)
    stake: z.number().positive().max(1e8).transform(v => Math.round(v * 100) / 100).optional(),            // multiple: one stake
    stakes: z.array(z.number().positive().max(1e8).transform(v => Math.round(v * 100) / 100)).optional(),  // singles: one per selection
    acceptChanges: z.boolean().default(true),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid', details: p.error.flatten().fieldErrors });
  const { type, selections, acceptChanges } = p.data;
  if (req.user.status === 'self_excluded') return res.status(403).json({ error: 'self_excluded' });
  const ids = new Set(selections.map(s => s.eventId));
  if (type === 'multiple' && ids.size !== selections.length) return res.status(400).json({ error: 'one_pick_per_match' });
  try {
    const cc = req.user.country;
    // in play (real or your own football matches): confirmed after a short wait – a goal in the meantime refuses the bet;
    // "blind" matches (no live score feed) have a per-player stake cap per match
    const { rows: liveEv } = await q(`SELECT id, stats, kickoff FROM events WHERE id = ANY($1) AND status='live' AND sport='football'`, [[...ids]]);
    if (liveEv.length) {
      const R = await inplayRules();
      const blindEv = liveEv.filter(e => e.stats && e.stats.blind);
      for (const e of blindEv) {
        const i = selections.findIndex(s => s.eventId === Number(e.id)), stake = type === 'multiple' ? p.data.stake : (p.data.stakes || [])[i];
        const { rows: had } = await q(`SELECT coalesce(sum(b.stake),0)::float AS s FROM bets b JOIN bet_legs l ON l.bet_id=b.id WHERE b.user_id=$1 AND l.event_id=$2 AND b.placed_at >= $3`, [req.user.id, e.id, e.kickoff]);
        const max = Number(R.blindMaxStake[cc]) || 0;
        if ((Number(stake) || 0) + had[0].s > max) return res.status(400).json({ error: 'inplay_max_stake', detail: { max, left: Math.max(0, +(max - had[0].s).toFixed(2)) } });
      }
      const wait = (blindEv.length ? R.blindDelaySec : R.delaySec) * 1000;
      if (wait) await new Promise(r => setTimeout(r, wait));
    }
    const minStake = (await getSetting('min_stake'))[cc];
    const maxPayout = (await getSetting('max_payout'))[cc];
    const boostSteps = await getSetting('boost'), margin = await getSetting('margin');
    const out = await tx(async c => {
      const legs = await priceSelections(c, selections, acceptChanges);
      const placed = [];
      if (type === 'multiple') {
        const stake = p.data.stake;
        if (!stake || stake < minStake) throw Object.assign(new Error('min_stake'), { status: 400, detail: { min: minStake } });
        const odds = legs.reduce((a, l) => a * l.odd, 1);
        const qualifying = legs.filter(l => l.odd >= 1.2 && !l.live).length;   // Acca Win Boost: pre-match selections at odds 1.20+ (live prices are the least sure)
        const boost = qualifying >= 3 ? Math.min(boostFor(boostSteps, qualifying), safeBoost(qualifying, margin)) : 0;
        const base = stake * odds;
        const potential = Math.min(maxPayout, base + (base - stake) * boost / 100);
        const id = ticket();
        await debit(c, req.user.id, 'bet', stake, id, { type, legs: legs.length });
        await c.query(`INSERT INTO bets (id, user_id, type, stake, odds, boost_pct, potential) VALUES ($1,$2,'multiple',$3,$4,$5,$6)`, [id, req.user.id, stake, odds, boost, potential]);
        for (const l of legs) await c.query(`INSERT INTO bet_legs (bet_id, event_id, market_key, outcome_key, label, market_name, match_name, odd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, l.eventId, l.market, l.outcome, l.label, l.marketName, l.match, l.odd]);
        placed.push({ id, stake, odds, boost, potential });
      } else {
        const stakes = p.data.stakes && p.data.stakes.length === legs.length ? p.data.stakes : legs.map(() => p.data.stake);
        for (const [i, l] of legs.entries()) {
          const stake = stakes[i];
          if (!stake || stake < minStake) throw Object.assign(new Error('min_stake'), { status: 400, detail: { min: minStake } });
          const id = ticket();
          const potential = Math.min(maxPayout, stake * l.odd);
          await debit(c, req.user.id, 'bet', stake, id, { type: 'single' });
          await c.query(`INSERT INTO bets (id, user_id, type, stake, odds, potential) VALUES ($1,$2,'single',$3,$4,$5)`, [id, req.user.id, stake, l.odd, potential]);
          await c.query(`INSERT INTO bet_legs (bet_id, event_id, market_key, outcome_key, label, market_name, match_name, odd) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, l.eventId, l.market, l.outcome, l.label, l.marketName, l.match, l.odd]);
          placed.push({ id, stake, odds: l.odd, boost: 0, potential });
        }
      }
      const { rows } = await c.query('SELECT balance FROM users WHERE id=$1', [req.user.id]);
      return { bets: placed, balance: Number(rows[0].balance), legs };
    });
    res.status(201).json({ bets: out.bets, balance: out.balance });
    payReferral(req.user).catch(e => req.log?.warn(e, 'referral reward failed'));
    for (const b of out.bets) sendEmail('betPlaced', req.user, { bet: { ...b, type, placedAt: new Date(), legs: (type === 'multiple' ? out.legs : [out.legs[out.bets.indexOf(b)]]).map(l => ({ match: l.match, market: l.marketName, pick: l.label, odd: l.odd })) } });
  } catch (e) { next(e); }
});

r.get('/', requireUser, async (req, res, next) => {
  const status = req.query.status === 'settled' ? "status <> 'open'" : "status = 'open'";
  try {
    const { rows } = await q(`SELECT * FROM bets WHERE user_id=$1 AND ${status} ORDER BY placed_at DESC LIMIT 100`, [req.user.id]);
    const ids = rows.map(b => b.id);
    const legs = ids.length ? (await q(`SELECT l.*, e.status AS ev_status, e.score_home, e.score_away, e.sport AS ev_sport FROM bet_legs l JOIN events e ON e.id=l.event_id WHERE l.bet_id = ANY($1)`, [ids])).rows : [];
    const byBet = {};
    legs.forEach(l => (byBet[l.bet_id] ||= []).push({ eventId: l.event_id, market: l.market_key, outcome: l.outcome_key, label: l.label, marketName: l.market_name, match: l.match_name, odd: l.odd, result: l.result, sport: l.ev_sport, final: l.ev_status === 'finished' ? [l.score_home, l.score_away] : null }));
    const bets = [];
    for (const b of rows) {
      const legsOf = byBet[b.id] || [];
      bets.push({ id: b.id, type: b.type, stake: b.stake, odds: b.odds, boost: b.boost_pct, potential: b.potential, status: b.status, paid: b.paid, placedAt: b.placed_at, settledAt: b.settled_at, legs: legsOf, cashout: b.status === 'open' ? await cashoutValue(b, legsOf) : null });
    }
    res.json({ bets });
  } catch (e) { next(e); }
});

r.post('/:id/cashout', requireUser, async (req, res, next) => {
  try {
    const out = await tx(async c => {
      const { rows } = await c.query('SELECT * FROM bets WHERE id=$1 AND user_id=$2 FOR UPDATE', [req.params.id, req.user.id]);
      const b = rows[0];
      if (!b || b.status !== 'open') throw Object.assign(new Error('not_open'), { status: 409 });
      const legs = (await c.query('SELECT * FROM bet_legs WHERE bet_id=$1', [b.id])).rows.map(l => ({ eventId: l.event_id, market: l.market_key, outcome: l.outcome_key, odd: l.odd, result: l.result }));
      const v = await cashoutValue(b, legs);
      if (!v) throw Object.assign(new Error('cashout_unavailable'), { status: 409 });
      await c.query(`UPDATE bets SET status='cashout', paid=$2, settled_at=now() WHERE id=$1`, [b.id, v]);
      const balance = await move(c, req.user.id, 'cashout', v, b.id);
      return { paid: v, balance, bet: b };
    });
    res.json({ paid: out.paid, balance: out.balance });
    sendEmail('cashout', req.user, { bet: out.bet, paid: out.paid, balance: out.balance });
  } catch (e) { next(e); }
});

// Booking codes
r.post('/book', async (req, res, next) => {
  const p = z.object({ selections: z.array(selSchema.pick({ eventId: true, market: true, outcome: true })).min(1).max(30) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid' });
  try {
    // only selections that exist and can be bet now go into a code
    const { rows: ok } = await q(`SELECT e.id, m.key, m.outcomes FROM events e JOIN markets m ON m.event_id = e.id AND NOT m.suspended
      WHERE e.id = ANY($1) AND (e.status = 'live' OR (e.status = 'scheduled' AND e.kickoff > now()))`, [p.data.selections.map(x => x.eventId)]);
    const open = new Set(ok.flatMap(r => Object.entries(r.outcomes || {}).filter(([, o]) => o && o.o != null).map(([k]) => `${r.id}|${r.key}|${k}`)));
    if (!p.data.selections.every(x => open.has(`${x.eventId}|${x.market}|${x.outcome}`))) return res.status(409).json({ error: 'selection_unavailable' });
    for (let i = 0; i < 6; i++) {   // ~1M codes: on the rare clash, draw another
      const cd = code();
      try { await q('INSERT INTO booking_codes (code, selections, user_id) VALUES ($1,$2,$3)', [cd, JSON.stringify(p.data.selections), req.user ? req.user.id : null]); return res.status(201).json({ code: cd }); }
      catch (e) { if (e.code !== '23505') throw e; }
    }
    throw new Error('no free booking code');
  } catch (e) { next(e); }
});

// Code Hub feed: real codes booked on the site in the last 3 days, multiples whose games are all still open
const maskWho = (p, e) => (p ? ('0' + p).slice(0, 3) + '****' + String(p).slice(-2) : e ? String(e).split('@')[0].slice(0, 2) + '****' : null);
r.get('/codes', async (req, res, next) => {
  const sport = ['football', 'basketball', 'tennis'].includes(req.query.sport) ? req.query.sport : null;
  try {
    const { rows } = await q(`SELECT b.code, b.selections, b.uses, b.created_at, u.phone, u.email FROM booking_codes b LEFT JOIN users u ON u.id = b.user_id
      WHERE b.created_at > now() - interval '3 days' ORDER BY b.uses DESC, b.created_at DESC LIMIT 150`);
    const ids = [...new Set(rows.flatMap(x => x.selections.map(s => s.eventId)))];
    const evs = ids.length ? (await q(`SELECT e.id, e.sport, e.home, e.away, e.kickoff, e.status, m.key, m.name, m.outcomes, m.suspended FROM events e JOIN markets m ON m.event_id = e.id WHERE e.id = ANY($1)`, [ids])).rows : [];
    const byKey = new Map(evs.map(x => [x.id + '|' + x.key, x])), now = Date.now(), codes = [];
    for (const x of rows) {
      const legs = [];
      for (const s of x.selections) {
        const e = byKey.get(s.eventId + '|' + s.market), o = e?.outcomes?.[s.outcome];
        if (!e || !o || o.o == null || e.suspended || e.status !== 'scheduled' || +new Date(e.kickoff) <= now) { legs.length = 0; break; }
        legs.push({ eventId: Number(e.id), sport: e.sport, market: s.market, outcome: s.outcome, label: o.l, marketName: e.name, home: e.home, away: e.away, kickoff: e.kickoff, odd: o.o });
      }
      if (legs.length < 2 || (sport && !legs.every(l => l.sport === sport))) continue;
      codes.push({ code: x.code, by: maskWho(x.phone, x.email), uses: x.uses, at: x.created_at, sport: legs[0].sport, legs, odds: Math.round(legs.reduce((p, l) => p * l.odd, 1) * 100) / 100 });
      if (codes.length >= 30) break;
    }
    res.json({ codes });
  } catch (e) { next(e); }
});

r.get('/book/:code', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT selections FROM booking_codes WHERE code=$1', [req.params.code.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    q('UPDATE booking_codes SET uses = uses + 1 WHERE code=$1', [req.params.code.toUpperCase()]).catch(() => {});
    // today's price for every selection that can still be bet; the rest (started, finished, closed) are counted
    const out = []; let expired = 0;
    for (const s of rows[0].selections) {
      const m = (await q('SELECT e.home, e.away, e.status, e.kickoff, mk.name, mk.outcomes, mk.suspended FROM events e JOIN markets mk ON mk.event_id=e.id AND mk.key=$2 WHERE e.id=$1', [s.eventId, s.market])).rows[0];
      const o = m?.outcomes?.[s.outcome];
      const open = m && o && o.o != null && !m.suspended && (m.status === 'live' || (m.status === 'scheduled' && new Date(m.kickoff) > new Date()));
      if (open) out.push({ ...s, odd: o.o, label: o.l, marketName: m.name, match: `${m.home} vs ${m.away}`, live: m.status === 'live' }); else expired++;
    }
    res.json({ code: req.params.code.toUpperCase(), selections: out, expired });
  } catch (e) { next(e); }
});

export default r;
