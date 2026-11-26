// Virtual sports – basketball, tennis, ice hockey, volleyball, table tennis, handball and darts.
// Same rules as the Virtual League (virtual.js): every match is a normal event with real markets, so bets go
// through /api/bets/place and settle through settleEvent(). Teams and players are fictional and every league is
// labelled virtual.
//   • Prices come from the same score model that later decides the match (Monte Carlo with a fast generator,
//     30 000 runs), with the house margin from feeds/demo.js (price = 0.94 / p).
//   • At the start betting closes and the result is drawn with the OS CSPRNG (rng.js). It is kept server-side
//     (events.model, never sent to players) and played out over a minute, then settled.
import { q } from '../db/pool.js';
import { upsertEvent } from '../feeds/index.js';
import { price } from '../feeds/demo.js';
import { settleEvent } from '../lib/settle.js';
import { rng } from './rng.js';

export const ROUND_MS = (+process.env.VIRTUAL_ROUND_SEC || 180) * 1000;   // a new round every 3 minutes per sport
export const PLAY_MS = (+process.env.VIRTUAL_PLAY_SEC || 60) * 1000;      // a match plays out over a minute
const MATCHES = 4, RUNS = 30000;

/* ---------- random helpers (R = random source: CSPRNG for results, fast generator for pricing) ---------- */
const norm = R => { let u = 0; while (u === 0) u = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); };
const pois = (R, l) => { const L = Math.exp(-l); let k = 0, p = R(); while (p > L) { k++; p *= R(); } return k; };
const pick = (R, w) => { let u = R() * w.reduce((s, x) => s + x, 0); for (let i = 0; i < w.length; i++) { u -= w[i]; if (u < 0) return i; } return w.length - 1; };
const uni = (R, a, b) => a + (b - a) * R();
/** Fast generator for pricing runs only (never decides a result). */
function fast(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Sets / legs: first to `need`, home takes each with chance ps. seq = winner of each set in order (1 home, 2 away). */
function race(R, ps, need) { let h = 0, a = 0; const seq = []; while (h < need && a < need) { if (R() < ps) { h++; seq.push(1); } else { a++; seq.push(2); } } return { h, a, seq }; }
const tennisSet = (R, home) => { const k = pick(R, [5, 12, 20, 28, 35, 13, 12]); const g = k < 5 ? [6, k] : k === 5 ? [7, 5] : [7, 6]; return home ? g : [g[1], g[0]]; };
/** One set's points: the winner reaches `to`, or wins by two after deuce (26-24, 13-11…). */
const setPoints = (R, home, to, close) => {
  let w = to, l;
  if (R() < 0.18) { l = to - 1 + Math.floor(R() * 3); w = l + 2; }
  else l = close ? to - 2 - Math.floor(R() * 3) : Math.max(Math.floor(to * 0.4), to - 4 - Math.floor(R() * to * 0.5));
  return home ? [w, l] : [l, w];
};

/* ---------- the sports ---------- */
// sim(model, R) → { h, a, total?, sets?, seq? }. Results never end level except where the market has a draw (handball).
const SPORTS = [
  {
    id: 'vbasketball', league: 'Virtual Basketball League', unit: 'Points', hcp: 'Handicap', periods: ['Q1', 'Q2', 'Q3', 'Q4'],
    teams: ['Lagos Lightning', 'Accra Comets', 'Abuja Titans', 'Kumasi Thunder', 'Ibadan Hawks', 'Tema Tide', 'Kano Blaze', 'Cape Coast Pirates', 'Port Harcourt Jets', 'Tamale Rhinos', 'Jos Peaks', 'Takoradi Surge'],
    model: R => ({ T: uni(R, 202, 236), mu: uni(R, -7, 7) - uni(R, -7, 7) + 2.5 }),
    sim: (m, R) => {
      const T = m.T + 13 * norm(R), D = m.mu + 11.5 * norm(R); let h = Math.round((T + D) / 2), a = Math.round((T - D) / 2);
      while (h === a) { h += Math.max(2, Math.round(10 + 3 * norm(R))); a += Math.max(2, Math.round(10 + 3 * norm(R))); }   // overtime
      return { h, a };
    },
    tot: { step: 4, n: 5 }, spr: { step: 3, n: 5 },
  },
  {
    id: 'vtennis', league: 'Virtual Tennis Tour', unit: 'Games', hcp: 'Set Handicap', sets: true,
    teams: ['A. Okafor', 'K. Mensah', 'T. Adeyemi', 'E. Boateng', 'C. Nwosu', 'Y. Asante', 'D. Bello', 'S. Owusu', 'F. Eze', 'R. Appiah', 'M. Danjuma', 'J. Ofori'],
    model: R => ({ ps: uni(R, 0.25, 0.75) }),
    sim: (m, R) => { const r = race(R, m.ps, 2), sets = r.seq.map(w => tennisSet(R, w === 1)); return { h: r.h, a: r.a, seq: r.seq, sets, total: sets.reduce((s, g) => s + g[0] + g[1], 0) }; },
    tot: { step: 1, n: 3, by: 'total' }, spr: { lines: [-1.5, 1.5] },
  },
  {
    id: 'vicehockey', league: 'Virtual Ice Hockey League', unit: 'Goals', hcp: 'Handicap', periods: ['P1', 'P2', 'P3'],
    teams: ['Lagos Frost', 'Accra Blizzard', 'Abuja Polar Bears', 'Kumasi Glaciers', 'Ibadan Yetis', 'Tema Icebreakers', 'Kano Huskies', 'Benin Penguins', 'Owerri Wolves', 'Ho Avalanche', 'Ilorin Arctic', 'Sekondi Storm'],
    model: R => ({ lh: uni(R, 2.2, 3.8), la: uni(R, 2.0, 3.4) }),
    sim: (m, R) => { let h = pois(R, m.lh), a = pois(R, m.la); if (h === a) { if (R() < m.lh / (m.lh + m.la)) h++; else a++; } return { h, a }; },   // overtime / shoot-out winner +1
    tot: { step: 1, n: 3 }, spr: { lines: [-1.5, 1.5] },
  },
  {
    id: 'vvolleyball', league: 'Virtual Volleyball League', unit: 'Sets', hcp: 'Set Handicap', sets: true, setTo: 25, lastTo: 15,
    teams: ['Lagos Spikers', 'Accra Aces', 'Abuja Blockers', 'Kumasi Kings', 'Ibadan Smash', 'Tema Volley', 'Kano Jumpers', 'Benin Diggers', 'Enugu Sky', 'Cape Coast Wave', 'Kaduna Hammers', 'Koforidua Net'],
    model: R => ({ ps: uni(R, 0.3, 0.7) }),
    sim: (m, R) => { const r = race(R, m.ps, 3); return { h: r.h, a: r.a, seq: r.seq, sets: r.seq.map((w, i) => setPoints(R, w === 1, i === 4 ? 15 : 25, R() < 0.3)) }; },
    tot: { lines: [3.5, 4.5] }, spr: { lines: [-2.5, -1.5, 1.5, 2.5] },
  },
  {
    id: 'vtabletennis', league: 'Virtual Table Tennis Cup', unit: 'Games', hcp: 'Game Handicap', sets: true, label: 'Game',
    teams: ['L. Adebayo', 'N. Agyeman', 'O. Chukwu', 'P. Darko', 'I. Musa', 'G. Antwi', 'B. Ogunleye', 'H. Quaye', 'V. Okonkwo', 'W. Badu', 'Z. Lawal', 'U. Tetteh'],
    model: R => ({ ps: uni(R, 0.3, 0.7) }),
    sim: (m, R) => { const r = race(R, m.ps, 3); return { h: r.h, a: r.a, seq: r.seq, sets: r.seq.map(w => setPoints(R, w === 1, 11, R() < 0.3)) }; },
    tot: { lines: [3.5, 4.5] }, spr: { lines: [-2.5, -1.5, 1.5, 2.5] },
  },
  {
    id: 'vhandball', league: 'Virtual Handball League', unit: 'Goals', hcp: 'Handicap', draw: true, periods: ['1st half', '2nd half'],
    teams: ['Lagos Sharks', 'Accra Panthers', 'Abuja Bulls', 'Kumasi Cobras', 'Ibadan Rams', 'Tema Dolphins', 'Kano Scorpions', 'Benin Buffaloes', 'Calabar Crocs', 'Wa Vipers', 'Akure Owls', 'Bolga Bison'],
    model: R => ({ mh: uni(R, 25, 31), ma: uni(R, 24, 30) }),
    sim: (m, R) => ({ h: Math.max(14, Math.round(m.mh + 3.6 * norm(R))), a: Math.max(14, Math.round(m.ma + 3.6 * norm(R))) }),
    tot: { step: 2, n: 3 }, spr: { step: 2, n: 3 },
  },
  {
    id: 'vdarts', league: 'Virtual Darts Masters', unit: 'Legs', hcp: 'Leg Handicap', legs: true,
    teams: ['G. Addo', 'B. Okoro', 'K. Fosu', 'T. Akande', 'J. Nyarko', 'R. Ibekwe', 'S. Amoah', 'D. Oyelaran', 'P. Gyamfi', 'E. Uche', 'F. Sarpong', 'M. Abubakar'],
    model: R => ({ ps: uni(R, 0.38, 0.62) }),
    sim: (m, R) => { const r = race(R, m.ps, 6); return { h: r.h, a: r.a, seq: r.seq }; },
    tot: { step: 1, n: 3 }, spr: { lines: [-2.5, -1.5, 1.5, 2.5] },
  },
];
export const VSPORTS = SPORTS.map(s => s.id);

/* ---------- prices from the model ---------- */
const sg = x => (x > 0 ? '+' : '') + x;
/** Market card for one match (stored shape). Lines whose chance is outside 7–93% are not offered. */
export function card(S, m, seed = Date.now()) {
  const R = fast(seed), runs = Array.from({ length: RUNS }, () => S.sim(m, R));
  const share = f => runs.reduce((n, r) => n + (f(r) ? 1 : 0), 0) / RUNS;
  const totalOf = r => (S.tot.by === 'total' ? r.total : r.h + r.a);
  const median = arr => { const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };
  const around = (mid, { step, n, lines }) => lines || Array.from({ length: n }, (_, i) => mid + (i - (n >> 1)) * step);
  const mk = (key, name, group, list) => {
    const outcomes = Object.fromEntries(list.map(([k, l, p], i) => [k, { l, o: price(p), i }]).filter(([, o]) => o.o));
    return Object.keys(outcomes).length >= 2 ? { key, name, group, cols: 2, outcomes } : null;
  };
  const ok = p => p > 0.07 && p < 0.93;   // beyond this the 1.01 minimum price would eat the margin
  const pH = share(r => r.h > r.a), pD = share(r => r.h === r.a);
  const three = S.draw && mk('1x2', '1X2', 'Main', [['1', 'Home', pH], ['X', 'Draw', pD], ['2', 'Away', 1 - pH - pD]]);
  const first = S.draw ? three && { ...three, cols: 3 } : mk('win', 'Winner', 'Main', [['1', 'Home', pH], ['2', 'Away', 1 - pH]]);
  const tMid = Math.floor(median(runs.map(totalOf))) + 0.5;
  const tLines = around(tMid, S.tot).map(L => [L, share(r => totalOf(r) > L)]).filter(([, p]) => ok(p));
  const dMid = -Math.floor(median(runs.map(r => r.h - r.a))) - 0.5;   // home line nearest an even split
  const sLines = around(dMid, S.spr).map(L => [L, share(r => r.h - r.a + L > 0)]).filter(([, p]) => ok(p));
  return [
    first,
    mk('spr', S.hcp, 'Handicap', sLines.flatMap(([L, p]) => [[`${L}|1`, `Home (${sg(L)})`, p], [`${L}|2`, `Away (${sg(-L)})`, 1 - p]])),
    mk('tot', `Total ${S.unit}`, 'Totals', tLines.flatMap(([L, p]) => [[`o${L}`, `Over ${L}`, p], [`u${L}`, `Under ${L}`, 1 - p]])),
  ].filter(Boolean);
}

/* ---------- rounds ---------- */
const leagues = {};
async function league(S) {
  if (leagues[S.id]) return leagues[S.id];
  const { rows } = await q(`INSERT INTO leagues (sport, name, country, flag, top, ext_id) VALUES ($1,$2,'LetBet Virtuals','world',false,$3)
    ON CONFLICT (ext_id) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [S.id, S.league, 'lba:' + S.id]);
  return (leagues[S.id] = rows[0].id);
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
async function createRound(S, kick) {
  const lg = await league(S), round = Math.floor(kick / ROUND_MS) % 10000, t = shuffle([...S.teams]);
  for (let i = 0; i < MATCHES; i++) {
    const model = S.model(rng);
    const ev = { extId: `vs:${S.id}:${kick}:${i}`, sport: S.id, leagueId: lg, home: t[2 * i], away: t[2 * i + 1], kickoff: new Date(kick), status: 'scheduled', minute: 0, score: [0, 0], stats: { round, virtual: true } };
    const id = await upsertEvent(ev, card(S, model, Math.floor(rng() * 2 ** 32)));
    await q('UPDATE events SET model = $2 WHERE id = $1', [id, model]);
  }
}
/** Rounds start on a 3-minute grid, each sport shifted by 20 s so results arrive all the time. */
function nextKick(i) {
  const off = i * 20000; let k = Math.ceil((Date.now() - off) / ROUND_MS) * ROUND_MS + off;
  if (k - Date.now() < Math.min(45000, ROUND_MS / 3)) k += ROUND_MS;
  return k;
}
const periodOf = (S, f, live) => {
  if (S.periods) return S.periods[Math.min(S.periods.length - 1, Math.floor(f * S.periods.length))];
  return `${S.label || (S.legs ? 'Leg' : 'Set')} ${Math.min(live.h + live.a + 1, live.total || 99)}`;
};
/** What players see while a match plays out: sets/legs one by one, points and goals growing towards the result. */
function partial(S, fin, f) {
  if (fin.seq) {
    const k = Math.min(fin.seq.length - 1, Math.floor(f * fin.seq.length)), done = fin.seq.slice(0, k);
    return { h: done.filter(w => w === 1).length, a: done.filter(w => w === 2).length, sets: fin.sets ? fin.sets.slice(0, k) : undefined, total: fin.seq.length };
  }
  return { h: Math.floor(fin.h * f), a: Math.floor(fin.a * f) };
}

async function play(S) {
  // kick-off: betting closes, the result is drawn with the CSPRNG and kept server-side
  const { rows: start } = await q(`SELECT id, model FROM events WHERE sport=$1 AND status='scheduled' AND kickoff <= now()`, [S.id]);
  for (const e of start) {
    const fin = S.sim(e.model, rng);
    await q('UPDATE markets SET suspended=true, updated_at=now() WHERE event_id=$1', [e.id]);
    await q(`UPDATE events SET status='live', minute=0, period=$2, model = model || $3::jsonb, updated_at=now() WHERE id=$1 AND status='scheduled'`,
      [e.id, periodOf(S, 0, { h: 0, a: 0, total: fin.seq?.length }), JSON.stringify({ final: fin })]);
  }
  // play-out, then full time and settlement
  const { rows: live } = await q(`SELECT id, kickoff, model FROM events WHERE sport=$1 AND status='live'`, [S.id]);
  for (const e of live) {
    const fin = e.model?.final; if (!fin) continue;
    const f = (Date.now() - new Date(e.kickoff)) / PLAY_MS;
    if (f >= 1) {
      const stats = { sets: fin.sets || null, total: fin.total ?? null };
      const u = await q(`UPDATE events SET status='finished', period='FT', score_home=$2, score_away=$3, stats = stats || $4::jsonb, updated_at=now() WHERE id=$1 AND status='live'`,
        [e.id, fin.h, fin.a, JSON.stringify(stats)]);
      if (u.rowCount) await settleEvent(e.id);
    } else {
      const p = partial(S, fin, f);
      await q(`UPDATE events SET minute=$2, period=$3, score_home=$4, score_away=$5, stats = stats || $6::jsonb, updated_at=now() WHERE id=$1 AND status='live'`,
        [e.id, Math.round(f * 100), periodOf(S, f, p), p.h, p.a, JSON.stringify({ sets: p.sets || null })]);
    }
  }
}

let lastClean = 0;
export async function tick() {
  for (const [i, S] of SPORTS.entries()) {
    // keep the next round on screen: open a new one when the latest is less than ~2 minutes away
    const { rows } = await q(`SELECT max(kickoff) AS k FROM events WHERE sport=$1 AND status='scheduled'`, [S.id]);
    const last = rows[0].k ? +new Date(rows[0].k) : 0;
    if (last - Date.now() < ROUND_MS * 0.66) await createRound(S, Math.max(last + ROUND_MS, nextKick(i)));
    await play(S);
  }
  if (Date.now() - lastClean > 10 * 60 * 1000) {
    lastClean = Date.now();
    await q(`DELETE FROM events e WHERE e.ext_id LIKE 'vs:%' AND e.status='finished' AND e.kickoff < now() - interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM bet_legs l WHERE l.event_id = e.id)`);
  }
}
export const _test = { SPORTS, race, fast };
