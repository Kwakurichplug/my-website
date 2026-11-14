/* =========================================================
   LetBetAfrika – game rules and pay tables (one source of truth)
   Used by the API server (with a CSPRNG) and by the browser demo
   (with Math.random). Every game targets ~95–96% return to player;
   server/test/games.test.js computes the exact RTP of each table.
   rng() must return a uniform number in [0, 1).
   ========================================================= */
(function (root) {
  'use strict';
  const r2 = n => Math.round(n * 100) / 100;
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const weighted = (rng, items) => { const t = items.reduce((s, x) => s + x.w, 0); let u = rng() * t; for (const x of items) { if ((u -= x.w) < 0) return x; } return items[items.length - 1]; };

  /* ---------- Lucky Dice: two dice, bet Under 7 / Seven / Over 7 ---------- */
  const DICE = { under: { label: 'Under 7', mult: 2.28 }, seven: { label: 'Seven', mult: 5.7 }, over: { label: 'Over 7', mult: 2.28 } };
  function dice(rng, choice) {
    if (!DICE[choice]) throw new Error('bad_choice');
    const d = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)], s = d[0] + d[1];
    const win = choice === 'under' ? s < 7 : choice === 'over' ? s > 7 : s === 7;
    return { mult: win ? DICE[choice].mult : 0, result: { dice: d, sum: s } };
  }

  /* ---------- Spin & Win: 20-segment wheel ---------- */
  const WHEEL = [0, 1.5, 0, 2, 0, 1.2, 0, 3, 0, 1.2, 0, 5, 0, 1.2, 0, 2, 0, 0.5, 0, 1.5];
  function spin(rng) { const i = Math.floor(rng() * WHEEL.length); return { mult: WHEEL[i], result: { segment: i } }; }

  /* ---------- Penalty Kick: pick a corner, the keeper dives at random ---------- */
  const PENALTY = { mult: 1.44, dirs: ['left', 'centre', 'right'] };
  function penalty(rng, choice) {
    if (!PENALTY.dirs.includes(choice)) throw new Error('bad_choice');
    const keeper = pick(rng, PENALTY.dirs);
    return { mult: keeper === choice ? 0 : PENALTY.mult, result: { keeper, shot: choice, goal: keeper !== choice } };
  }

  /* ---------- Number Rush: 3-reel slot ---------- */
  const SYMBOLS = [{ s: '7', w: 1 }, { s: 'BAR', w: 2 }, { s: 'BELL', w: 3 }, { s: 'CHERRY', w: 4 }, { s: 'LEMON', w: 5 }];
  const RUSH_PAY = { '7': 120, BAR: 40, BELL: 16, CHERRY: 9, LEMON: 6 }; // three of a kind
  const RUSH_TWO_CHERRY = 1.5;                                       // any two cherries
  function rushMult(reels) {
    if (reels[0] === reels[1] && reels[1] === reels[2]) return RUSH_PAY[reels[0]];
    if (reels.filter(x => x === 'CHERRY').length === 2) return RUSH_TWO_CHERRY;
    if (reels.filter(x => x === '7').length === 2) return 5;
    return 0;
  }
  function rush(rng) { const reels = [0, 1, 2].map(() => weighted(rng, SYMBOLS).s); return { mult: rushMult(reels), result: { reels } }; }

  /* ---------- Keno: pick 1–5 numbers from 1–40, 10 are drawn ---------- */
  const KENO_N = 40, KENO_DRAW = 10;
  const KENO_PAY = { 1: [0, 3.8], 2: [0, 1.6, 5.7], 3: [0, 0.8, 2.4, 22.2], 4: [0, 0.5, 1.6, 6, 64.7], 5: [0, 0, 1.4, 4, 18, 187] };
  function keno(rng, choice) {
    const picks = [...new Set((Array.isArray(choice) ? choice : []).map(Number))].filter(n => n >= 1 && n <= KENO_N);
    if (picks.length < 1 || picks.length > 5) throw new Error('bad_choice');
    const pool = Array.from({ length: KENO_N }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const drawn = pool.slice(0, KENO_DRAW).sort((a, b) => a - b), hits = picks.filter(n => drawn.includes(n));
    return { mult: KENO_PAY[picks.length][hits.length] || 0, result: { picks, drawn, hits } };
  }

  /* ---------- Scratch Cards: 9 cells, three matching symbols win that prize ---------- */
  const SCRATCH = [{ m: 0, w: 485 }, { m: 1, w: 160 }, { m: 2, w: 90 }, { m: 5, w: 30 }, { m: 10, w: 12 }, { m: 50, w: 1.6 }, { m: 500, w: 0.1 }];
  const SCRATCH_SYM = { 1: '1x', 2: '2x', 5: '5x', 10: '10x', 50: '50x', 500: '500x' };
  function scratch(rng) {
    const prize = weighted(rng, SCRATCH).m, keys = Object.keys(SCRATCH_SYM).map(Number);
    const cells = [];
    if (prize) cells.push(prize, prize, prize);
    // fill the rest so no other symbol appears three times
    const count = {};
    while (cells.length < 9) { const k = pick(rng, keys); if (k === prize) continue; if ((count[k] || 0) >= 2) continue; count[k] = (count[k] || 0) + 1; cells.push(k); }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    return { mult: prize, result: { cells } };
  }

  /* ---------- Hi-Lo: guess whether the next card is higher or lower (ties lose) ---------- */
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  const HILO_RTP = 0.95;
  const hiloOdds = rank => { const hi = (12 - rank) / 13, lo = rank / 13; return { higher: hi ? r2(HILO_RTP / hi) : 0, lower: lo ? r2(HILO_RTP / lo) : 0 }; };
  const deal = rng => ({ rank: Math.floor(rng() * 13), suit: Math.floor(rng() * 4) });
  function hilo(rng, choice, first) {
    if (!['higher', 'lower'].includes(choice) || !first || !(first.rank >= 0 && first.rank <= 12)) throw new Error('bad_choice');
    const odds = hiloOdds(first.rank);
    if (!odds[choice]) throw new Error('bad_choice');
    const next = deal(rng);
    const win = choice === 'higher' ? next.rank > first.rank : next.rank < first.rank;
    return { mult: win ? odds[choice] : 0, result: { first, next } };
  }

  /* ---------- Rocket Crash: crash point from a uniform number (3% edge, cap 200x) ---------- */
  const CRASH = { k: 0.00009, waitMs: 6000, crashedMs: 2200, cap: 200 };
  const crashPoint = u => Math.max(1, Math.min(CRASH.cap, Math.floor(97 / (1 - u)) / 100));
  const crashMult = ms => Math.max(1, Math.floor(Math.exp(CRASH.k * Math.max(0, ms)) * 100) / 100);
  const crashFlyMs = point => Math.ceil(Math.log(point) / CRASH.k);

  const PLAY = { dice, spin, penalty, rush, keno, scratch, hilo };
  const L = { r2, DICE, WHEEL, PENALTY, SYMBOLS, RUSH_PAY, RUSH_TWO_CHERRY, rushMult, KENO_N, KENO_DRAW, KENO_PAY, SCRATCH, SCRATCH_SYM, RANKS, SUITS, hiloOdds, deal, CRASH, crashPoint, crashMult, crashFlyMs, PLAY,
    play: (game, rng, choice, extra) => { if (!PLAY[game]) throw new Error('bad_game'); return PLAY[game](rng, choice, extra); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.GameLogic = L;
})(typeof window !== 'undefined' ? window : globalThis);
