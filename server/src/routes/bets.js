import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { q, tx } from '../db/pool.js';
import { requireUser } from '../lib/auth.js';
import { move, debit } from '../lib/wallet.js';
import { getSetting } from '../lib/settings.js';
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
      `SELECT e.id, e.home, e.away, e.status, m.name, m.outcomes, m.suspended FROM events e JOIN markets m ON m.event_id=e.id AND m.key=$2 WHERE e.id=$1`, [s.eventId, s.market]);
    const row = rows[0];
    const o = row?.outcomes?.[s.outcome];
    if (!row || !o || row.suspended || o.o == null || row.status === 'finished' || row.status === 'cancelled') {
      throw Object.assign(new Error('selection_unavailable'), { status: 409, detail: { eventId: s.eventId, market: s.market } });
    }
    if (Math.abs(o.o - s.odd) > 0.004 && !acceptChanges) {
      throw Object.assign(new Error('odds_changed'), { status: 409, detail: { eventId: s.eventId, market: s.market, odd: o.o } });
    }
    legs.push({ eventId: row.id, market: s.market, outcome: s.outcome, label: o.l, marketName: row.name, match: `${row.home} vs ${row.away}`, odd: o.o });
  }
  return legs;
}

const boostFor = (steps, n) => steps.reduce((b, [k, v]) => (n >= k ? v : b), 0);

r.post('/place', requireUser, async (req, res, next) => {
  const p = z.object({
    type: z.enum(['single', 'multiple']),
    selections: z.array(selSchema).min(1).max(30),
    stake: z.number().positive().optional(),           // multiple: one stake
    stakes: z.array(z.number().positive()).optional(),  // singles: one per selection
    acceptChanges: z.boolean().default(true),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'invalid', details: p.error.flatten().fieldErrors });
  const { type, selections, acceptChanges } = p.data;
  if (req.user.status === 'self_excluded') return res.status(403).json({ error: 'self_excluded' });
  const ids = new Set(selections.map(s => s.eventId));
  if (type === 'multiple' && ids.size !== selections.length) return res.status(400).json({ error: 'one_pick_per_match' });
  try {
    const cc = req.user.country;
    const minStake = (await getSetting('min_stake'))[cc];
    const maxPayout = (await getSetting('max_payout'))[cc];
    const boostSteps = await getSetting('boost');
    const out = await tx(async c => {
      const legs = await priceSelections(c, selections, acceptChanges);
      const placed = [];
      if (type === 'multiple') {
        const stake = p.data.stake;
        if (!stake || stake < minStake) throw Object.assign(new Error('min_stake'), { status: 400, detail: { min: minStake } });
        const odds = legs.reduce((a, l) => a * l.odd, 1);
        const boost = legs.length >= 3 ? boostFor(boostSteps, legs.length) : 0;
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
    for (const b of out.bets) sendEmail('betPlaced', req.user, { bet: { ...b, type, placedAt: new Date(), legs: (type === 'multiple' ? out.legs : [out.legs[out.bets.indexOf(b)]]).map(l => ({ match: l.match, market: l.marketName, pick: l.label, odd: l.odd })) } });
  } catch (e) { next(e); }
});

r.get('/', requireUser, async (req, res, next) => {
  const status = req.query.status === 'settled' ? "status <> 'open'" : "status = 'open'";
  try {
    const { rows } = await q(`SELECT * FROM bets WHERE user_id=$1 AND ${status} ORDER BY placed_at DESC LIMIT 100`, [req.user.id]);
    const ids = rows.map(b => b.id);
    const legs = ids.length ? (await q(`SELECT l.*, e.status AS ev_status, e.score_home, e.score_away FROM bet_legs l JOIN events e ON e.id=l.event_id WHERE l.bet_id = ANY($1)`, [ids])).rows : [];
    const byBet = {};
    legs.forEach(l => (byBet[l.bet_id] ||= []).push({ eventId: l.event_id, market: l.market_key, outcome: l.outcome_key, label: l.label, marketName: l.market_name, match: l.match_name, odd: l.odd, result: l.result, final: l.ev_status === 'finished' ? [l.score_home, l.score_away] : null }));
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
    const cd = code();
    await q('INSERT INTO booking_codes (code, selections) VALUES ($1,$2)', [cd, JSON.stringify(p.data.selections)]);
    res.status(201).json({ code: cd });
  } catch (e) { next(e); }
});

r.get('/book/:code', async (req, res, next) => {
  try {
    const { rows } = await q('SELECT selections FROM booking_codes WHERE code=$1', [req.params.code.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    const out = [];
    for (const s of rows[0].selections) {
      const m = (await q('SELECT e.home, e.away, e.status, mk.name, mk.outcomes, mk.suspended FROM events e JOIN markets mk ON mk.event_id=e.id AND mk.key=$2 WHERE e.id=$1', [s.eventId, s.market])).rows[0];
      const o = m?.outcomes?.[s.outcome];
      if (m && o && o.o != null && !m.suspended && m.status !== 'finished') out.push({ ...s, odd: o.o, label: o.l, marketName: m.name, match: `${m.home} vs ${m.away}`, live: m.status === 'live' });
    }
    res.json({ selections: out });
  } catch (e) { next(e); }
});

export default r;
