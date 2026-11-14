/* =========================================================
   LetBetAfrika – football market engine (one source of truth)
   Used by the browser demo (app.js) and by the API server
   (feeds/demo.js, feeds/oddsapi.js, lib/settle.js).

   football(m, price)  -> every market for a match, priced
   grade(mk, ok, R)    -> 'won' | 'lost' | 'void' for a leg
   needs(mk)           -> what the result must contain to settle it
   view(mk)            -> how the match page lays the market out
   guide(mk)           -> plain-language "how it settles" text

   The model: goals in each half are Poisson (45% of the expected
   goals in the first half, 55% in the second). One pass over the
   joint distribution of (home 1st half, away 1st half, home 2nd
   half, away 2nd half) fills a few small tables, and every market
   is read from those tables. Corners and cards are Poisson too.
   ========================================================= */
(function (root) {
  'use strict';
  const N = 6;                       // goals per team per half considered (0..6)
  // Poisson probabilities 0..n; the tail beyond n is added to n so every table sums to exactly 1
  const pois = (l, n) => { const a = []; let p = Math.exp(-Math.max(l, 1e-9)), s = 0; for (let k = 0; k <= n; k++) { a.push(p); s += p; p *= l / (k + 1); } a[n] += Math.max(0, 1 - s); return a; };
  const res = (x, y) => (x > y ? '1' : x === y ? 'X' : '2');
  const RI = { '1': 0, X: 1, '2': 2 };
  const fmtLine = l => (Number.isInteger(l) ? String(l) : l.toFixed(1));

  /* ---------- the joint distribution, summarised ---------- */
  function tables(m) {
    const live = m.live ?? m.status === 'live';
    const minute = live ? Math.max(0, Math.min(90, +m.minute || 0)) : 0;
    const sc = m.score || [0, 0];
    const goals = m.ev ? m.ev.filter(e => e.type === 'goal') : (m.stats && m.stats.goals) || [];
    // first-half score: known at half-time, else counted from the goal list
    let ht = m.ht;
    if (!ht && live && minute > 45) ht = [goals.filter(g => !g.side && g.min <= 45).length, goals.filter(g => g.side && g.min <= 45).length];
    if (ht && (ht[0] > sc[0] || ht[1] > sc[1])) ht = [Math.min(ht[0], sc[0]), Math.min(ht[1], sc[1])];
    const lh = +m.lh || 1.3, la = +m.la || 1.1;
    // fixed goals already scored + Poisson rates for what is left of each half
    let b1 = [0, 0], b2 = [0, 0], r1 = [lh * 0.45, la * 0.45], r2 = [lh * 0.55, la * 0.55];
    if (live && minute <= 45) { const f = (45 - minute) / 45; b1 = [sc[0], sc[1]]; r1 = [r1[0] * f, r1[1] * f]; }
    else if (live) { const f = Math.max(0, 90 - minute) / 45; b1 = ht || [sc[0], sc[1]]; b2 = [sc[0] - b1[0], sc[1] - b1[1]]; r1 = [0, 0]; r2 = [r2[0] * f, r2[1] * f]; }
    const P = [pois(r1[0], N), pois(r1[1], N), pois(r2[0], N), pois(r2[1], N)];
    const M = 2 * N + 6;                                   // max goals per team over the match
    const z2 = () => Array.from({ length: M + 1 }, () => new Float64Array(M + 1));
    const T = { ft: z2(), ht: z2(), h2: z2(), tt: z2(), hh: z2(), aa: z2(), rr: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rf: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], gg: [[0, 0], [0, 0]], hb: [[0, 0], [0, 0]], ab: [[0, 0], [0, 0]], live, minute, sc, lh, la };
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p1 = P[0][i] * P[1][j], h1 = b1[0] + i, a1 = b1[1] + j; if (p1 < 1e-12) continue;
      for (let k = 0; k <= N; k++) for (let l = 0; l <= N; l++) {
        const p = p1 * P[2][k] * P[3][l]; if (p < 1e-12) continue;
        const h2 = b2[0] + k, a2 = b2[1] + l, h = h1 + h2, a = a1 + a2;
        T.ft[h][a] += p; T.ht[h1][a1] += p; T.h2[h2][a2] += p; T.tt[h1 + a1][h2 + a2] += p; T.hh[h1][h2] += p; T.aa[a1][a2] += p;
        T.rr[RI[res(h1, a1)]][RI[res(h2, a2)]] += p; T.rf[RI[res(h1, a1)]][RI[res(h, a)]] += p;
        T.gg[h1 > 0 && a1 > 0 ? 1 : 0][h2 > 0 && a2 > 0 ? 1 : 0] += p; T.hb[h1 > 0 ? 1 : 0][h2 > 0 ? 1 : 0] += p; T.ab[a1 > 0 ? 1 : 0][a2 > 0 ? 1 : 0] += p;
      }
    }
    return T;
  }
  // probability of a predicate over a score table
  const S = (tab, f) => { let s = 0; for (let h = 0; h < tab.length; h++) { const row = tab[h]; for (let a = 0; a < row.length; a++) if (row[a] && f(h, a)) s += row[a]; } return s; };

  /* ---------- market definitions ---------- */
  const OU_LINES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4.5, 5.5];
  const TEAM_LINES = [0.5, 1.5, 2.5, 3.5];
  const H1_LINES = [0.5, 1, 1.5, 2.5];
  const H2_LINES = [0.5, 1, 1.5, 2.5];
  const COR_LINES = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
  const TCOR_LINES = [3.5, 4.5, 5.5, 6.5];
  const CARD_LINES = [2.5, 3.5, 4.5, 5.5];
  const EH_LINES = [[0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [3, 0]];
  const AH_LINES = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5];
  const MG = ['1-2', '1-3', '1-4', '1-5', '1-6', '2-3', '2-4', '2-5', '2-6', '3-4', '3-5', '3-6', '4-5', '4-6', '5-6'];
  const MGT = ['1-2', '1-3', '2-3', '4+', 'none'];

  // Over/Under pair. On a whole-number line landing exactly is a push (stake refunded), so both sides are priced on
  // their chance given no push – P(win) / (1 − P(push)) – otherwise the refund would be free value for the player.
  const ouPair = (f, L) => {
    const over = f(L);
    if (!Number.isInteger(L)) return [[`o${L}`, `Over ${fmtLine(L)}`, over], [`u${L}`, `Under ${fmtLine(L)}`, 1 - over]];
    const push = f.eq(L), rest = Math.max(1e-9, 1 - push);
    return [[`o${L}`, `Over ${fmtLine(L)}`, over / rest], [`u${L}`, `Under ${fmtLine(L)}`, (1 - over - push) / rest]];
  };
  function overFn(tab, pick) { const f = L => S(tab, (h, a) => pick(h, a) > L); f.eq = L => S(tab, (h, a) => pick(h, a) === L); return f; }
  const T_ = (h, a) => h + a, H_ = h => h, A_ = (h, a) => a;
  const yn = (k, p) => [[k + ':y', 'Yes', p], [k + ':n', 'No', 1 - p]];

  /**
   * m: { home, away, lh, la, lc?, live|status, minute, score, ht?, ev?|stats? , st?:{corners,yc}, virtual? }
   * price: probability -> decimal odds (or null to suspend)
   * returns [{ key, name, group, cols, outs: [{ k, l, o } | { k: null }] }]
   */
  function football(m, price, opt) {
    opt = opt || {};
    const T = tables(m), { ft, ht, h2, live } = T, out = [];
    const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outs: list.map(x => x[0] ? { k: x[0], l: x[1], o: price(x[2]) } : { k: null }) });
    const home = m.home || 'Home', away = m.away || 'Away';
    const pFT = f => S(ft, f), pHT = f => S(ht, f), pH2 = f => S(h2, f);
    const H = pFT((h, a) => h > a), D = pFT((h, a) => h === a), A = pFT((h, a) => h < a);
    const ou = overFn(ft, T_), hou = overFn(ft, H_), aou = overFn(ft, A_);
    const ou1 = overFn(ht, T_), ou2 = overFn(h2, T_), hou1 = overFn(ht, H_), aou1 = overFn(ht, A_), hou2 = overFn(h2, H_), aou2 = overFn(h2, A_);
    const GG = pFT((h, a) => h > 0 && a > 0);
    const r3 = (tab, prefix) => [[prefix + '1', 'Home', S(tab, (h, a) => h > a)], [prefix + 'X', 'Draw', S(tab, (h, a) => h === a)], [prefix + '2', 'Away', S(tab, (h, a) => h < a)]];
    const dc = tab => [['1X', 'Home or Draw', S(tab, (h, a) => h >= a)], ['12', 'Home or Away', S(tab, (h, a) => h !== a)], ['X2', 'Draw or Away', S(tab, (h, a) => h <= a)]];
    const dnb = tab => { const w = S(tab, (h, a) => h > a), l = S(tab, (h, a) => h < a); return [['1', 'Home', w / (w + l || 1)], ['2', 'Away', l / (w + l || 1)]]; };
    const csList = (tab, max) => {                          // 3 columns: home win | draw | away win, then Other
      const hw = [], dr = [], aw = [];
      for (let h = 0; h <= max; h++) for (let a = 0; a <= max; a++) (h > a ? hw : h === a ? dr : aw).push([`${h}-${a}`, `${h}:${a}`, tab[h][a], h, a]);
      const srt = (x, y) => (x[3] + x[4]) - (y[3] + y[4]) || x[3] - y[3];
      hw.sort(srt); dr.sort(srt); aw.sort((x, y) => (x[3] + x[4]) - (y[3] + y[4]) || x[4] - y[4]);
      const rows = Math.max(hw.length, dr.length, aw.length), list = [];
      for (let r = 0; r < rows; r++) [hw, dr, aw].forEach(c => list.push(c[r] ? c[r].slice(0, 3) : [null]));
      list.push([null], ['oth', 'Other', S(tab, (h, a) => h > max || a > max)], [null]);
      return list;
    };
    const oeList = (tab, pick) => { const odd = S(tab, (h, a) => pick(h, a) % 2 === 1); return [['odd', 'Odd', odd], ['even', 'Even', 1 - odd]]; };
    const xgList = (tab, pick, max) => { const l = []; for (let g = 0; g < max; g++) l.push([String(g), String(g), S(tab, (h, a) => pick(h, a) === g)]); l.push([`${max}+`, `${max}+`, S(tab, (h, a) => pick(h, a) >= max)]); return l; };
    const mgList = (tab, pick, keys) => keys.map(k => { if (k === 'none') return ['none', 'No goal', S(tab, (h, a) => pick(h, a) === 0)]; if (k.endsWith('+')) { const lo = +k; return [k, k, S(tab, (h, a) => pick(h, a) >= lo)]; } const [lo, hi] = k.split('-').map(Number); return [k, k, S(tab, (h, a) => pick(h, a) >= lo && pick(h, a) <= hi)]; });
    const nextGoal = () => { const [sh, sa] = T.sc, rem = live ? Math.max(0, 90 - T.minute) / 90 : 1, L = (T.lh + T.la) * rem, pn = Math.exp(-L); return [['1', 'Home', (1 - pn) * T.lh / (T.lh + T.la)], ['none', 'None', pn], ['2', 'Away', (1 - pn) * T.la / (T.lh + T.la)]].concat([[`__n${sh + sa + 1}`]]); };

    /* ---- Main ---- */
    add('1x2', '1X2', 'Main', 3, [['1', 'Home', H], ['X', 'Draw', D], ['2', 'Away', A]]);
    add('ou', 'Over/Under', 'Main', 2, OU_LINES.flatMap(L => ouPair(ou, L)));
    add('dc', 'Double Chance', 'Main', 3, dc(ft));
    if (!live || T.minute < 90) { const ng = nextGoal(); const n = +ng.pop()[0].slice(3); add('next', live ? `Next Goal (${n})` : '1st Goal', 'Main', 3, ng); }
    add('eh', 'Handicap', 'Main', 3, EH_LINES.flatMap(([hs, as]) => { const k = `${hs}:${as}`; return [[`${k}|1`, `Home (${k})`, pFT((h, a) => h + hs > a + as)], [`${k}|X`, `Draw (${k})`, pFT((h, a) => h + hs === a + as)], [`${k}|2`, `Away (${k})`, pFT((h, a) => h + hs < a + as)]]; }));
    add('ah', 'Asian Handicap', 'Main', 2, AH_LINES.flatMap(L => [[`${L}|1`, `Home (${L > 0 ? '+' : ''}${L})`, pFT((h, a) => h + L > a)], [`${L}|2`, `Away (${-L > 0 ? '+' : ''}${-L})`, pFT((h, a) => h + L < a)]]));
    add('gg', 'GG/NG', 'Main', 2, [['gg', 'Yes', GG], ['ng', 'No', 1 - GG]]);
    add('dnb', 'Draw No Bet', 'Main', 2, dnb(ft));
    add('cs', 'Correct Score', 'Main', 3, csList(ft, 4));
    add('htft', 'Halftime/Fulltime', 'Main', 3, ['1', 'X', '2'].flatMap(r1 => ['1', 'X', '2'].map(r2 => [`${r1}/${r2}`, `${{ 1: 'Home', X: 'Draw', 2: 'Away' }[r1]} / ${{ 1: 'Home', X: 'Draw', 2: 'Away' }[r2]}`, T.rf[RI[r1]][RI[r2]]])));
    add('oe', 'Odd/Even', 'Main', 2, oeList(ft, T_));
    add('hnb', 'Home No Bet', 'Main', 2, [['X', 'Draw', D / (D + A || 1)], ['2', 'Away', A / (D + A || 1)]]);
    add('anb', 'Away No Bet', 'Main', 2, [['1', 'Home', H / (H + D || 1)], ['X', 'Draw', D / (H + D || 1)]]);
    add('wm', 'Winning Margin', 'Main', 3, [['h1', 'Home by 1', pFT((h, a) => h - a === 1)], ['h2', 'Home by 2', pFT((h, a) => h - a === 2)], ['h3', 'Home by 3+', pFT((h, a) => h - a >= 3)], ['a1', 'Away by 1', pFT((h, a) => a - h === 1)], ['a2', 'Away by 2', pFT((h, a) => a - h === 2)], ['a3', 'Away by 3+', pFT((h, a) => a - h >= 3)], ['X', 'Draw', D], [null], [null]]);
    add('xg', 'Exact Goals', 'Main', 3, xgList(ft, T_, 6).concat([[null], [null]]));
    add('gr', 'Goal Range', 'Main', 2, [['0-1', '0-1', pFT((h, a) => h + a <= 1)], ['2-3', '2-3', pFT((h, a) => h + a >= 2 && h + a <= 3)], ['4-6', '4-6', pFT((h, a) => h + a >= 4 && h + a <= 6)], ['7+', '7+', pFT((h, a) => h + a >= 7)]]);
    add('wts', 'Which Team To Score', 'Main', 2, [['none', 'None', pFT((h, a) => h === 0 && a === 0)], ['home', 'Only Home', pFT((h, a) => h > 0 && a === 0)], ['away', 'Only Away', pFT((h, a) => h === 0 && a > 0)], ['both', 'Both teams', GG]]);
    add('mg', 'Multigoals', 'Main', 3, mgList(ft, T_, MG.concat(['7+', 'none'])).concat([[null]]));

    /* ---- Goals ---- */
    add('hou', `${home} Over/Under`, 'Goals', 2, TEAM_LINES.flatMap(L => ouPair(hou, L)));
    add('aou', `${away} Over/Under`, 'Goals', 2, TEAM_LINES.flatMap(L => ouPair(aou, L)));
    add('hxg', `${home} Exact Goals`, 'Goals', 2, xgList(ft, H_, 3));
    add('axg', `${away} Exact Goals`, 'Goals', 2, xgList(ft, A_, 3));
    add('hcs', `${home} Clean Sheet`, 'Goals', 2, yn('hcs', pFT((h, a) => a === 0)));
    add('acs', `${away} Clean Sheet`, 'Goals', 2, yn('acs', pFT((h, a) => h === 0)));
    add('hoe', `${home} Odd/Even`, 'Goals', 2, oeList(ft, H_));
    add('aoe', `${away} Odd/Even`, 'Goals', 2, oeList(ft, A_));
    add('bho', 'Both Halves Over 1.5', 'Goals', 2, yn('bho', S(T.tt, (t1, t2) => t1 > 1.5 && t2 > 1.5)));
    add('bhu', 'Both Halves Under 1.5', 'Goals', 2, yn('bhu', S(T.tt, (t1, t2) => t1 < 1.5 && t2 < 1.5)));
    add('bho05', 'Both Halves Over 0.5', 'Goals', 2, yn('bho05', S(T.tt, (t1, t2) => t1 > 0 && t2 > 0)));
    add('hgg', '1st/2nd Half GG/NG', 'Goals', 2, [['nn', 'No/No', T.gg[0][0]], ['yn', 'Yes/No', T.gg[1][0]], ['yy', 'Yes/Yes', T.gg[1][1]], ['ny', 'No/Yes', T.gg[0][1]]]);
    add('hsb', `${home} To Score In Both Halves`, 'Goals', 2, yn('hsb', T.hb[1][1]));
    add('asb', `${away} To Score In Both Halves`, 'Goals', 2, yn('asb', T.ab[1][1]));
    add('hmg', `${home} Multigoals`, 'Goals', 3, mgList(ft, H_, MGT).concat([[null]]));
    add('amg', `${away} Multigoals`, 'Goals', 3, mgList(ft, A_, MGT).concat([[null]]));
    add('hsh', 'Highest Scoring Half', 'Goals', 3, [['1', '1st half', S(T.tt, (t1, t2) => t1 > t2)], ['2', '2nd half', S(T.tt, (t1, t2) => t2 > t1)], ['X', 'Equal', S(T.tt, (t1, t2) => t1 === t2)]]);
    add('hhsh', `${home} Highest Scoring Half`, 'Goals', 3, [['1', '1st half', S(T.hh, (x, y) => x > y)], ['2', '2nd half', S(T.hh, (x, y) => y > x)], ['X', 'Equal', S(T.hh, (x, y) => x === y)]]);
    add('ahsh', `${away} Highest Scoring Half`, 'Goals', 3, [['1', '1st half', S(T.aa, (x, y) => x > y)], ['2', '2nd half', S(T.aa, (x, y) => y > x)], ['X', 'Equal', S(T.aa, (x, y) => x === y)]]);

    /* ---- Corners (only where the feed reports them) ---- */
    if (!opt.noCorners) {
      const lc = +m.lc || 10, cur = (m.st && m.st.corners) || (m.stats && m.stats.corners) || [0, 0];
      const rem = live ? Math.max(0, 90 - T.minute) / 90 : 1, hs = 0.55;
      const ch = pois(lc * hs * rem, 24), ca = pois(lc * (1 - hs) * rem, 24);
      const cornerP = f => { let s = 0; for (let i = 0; i < ch.length; i++) for (let j = 0; j < ca.length; j++) { const p = ch[i] * ca[j]; if (p > 1e-12 && f(cur[0] + i, cur[1] + j)) s += p; } return s; };
      const cf = pick => { const f = L => cornerP((h, a) => pick(h, a) > L); f.eq = L => cornerP((h, a) => pick(h, a) === L); return f; };
      add('cor', 'Total Corners', 'Corners', 2, COR_LINES.flatMap(L => ouPair(cf(T_), L)));
      add('cor1x2', 'Corners 1X2', 'Corners', 3, [['1', 'Home', cornerP((h, a) => h > a)], ['X', 'Draw', cornerP((h, a) => h === a)], ['2', 'Away', cornerP((h, a) => h < a)]]);
      add('hcor', `${home} Corners`, 'Corners', 2, TCOR_LINES.flatMap(L => ouPair(cf(H_), L)));
      add('acor', `${away} Corners`, 'Corners', 2, TCOR_LINES.flatMap(L => ouPair(cf(A_), L)));
      add('coroe', 'Corners Odd/Even', 'Corners', 2, [['odd', 'Odd', cornerP((h, a) => (h + a) % 2 === 1)], ['even', 'Even', cornerP((h, a) => (h + a) % 2 === 0)]]);
    }

    /* ---- Half ---- */
    if (!live || T.minute < 45) {
      add('1h1x2', '1st Half - 1X2', 'Half', 3, r3(ht, ''));
      add('1hou', '1st Half - Over/Under', 'Half', 2, H1_LINES.flatMap(L => ouPair(ou1, L)));
      add('1hdc', '1st Half - Double Chance', 'Half', 3, dc(ht));
      add('1heh', '1st Half - Handicap', 'Half', 3, [[0, 1], [1, 0]].flatMap(([hs, as]) => { const k = `${hs}:${as}`; return [[`${k}|1`, `Home (${k})`, pHT((h, a) => h + hs > a + as)], [`${k}|X`, `Draw (${k})`, pHT((h, a) => h + hs === a + as)], [`${k}|2`, `Away (${k})`, pHT((h, a) => h + hs < a + as)]]; }));
      add('1hdnb', '1st Half - Draw No Bet', 'Half', 2, dnb(ht));
      add('1hcs', '1st Half - Correct Score', 'Half', 3, csList(ht, 2));
      { const g1 = pHT((h, a) => h > 0 && a > 0); add('1hgg', '1st Half - GG/NG', 'Half', 2, [['gg', 'Yes', g1], ['ng', 'No', 1 - g1]]); }
      add('1hxg', '1st Half - Exact Goals', 'Half', 2, xgList(ht, T_, 3));
      add('1hhou', `1st Half - ${home} O/U`, 'Half', 2, [0.5, 1.5].flatMap(L => ouPair(hou1, L)));
      add('1haou', `1st Half - ${away} O/U`, 'Half', 2, [0.5, 1.5].flatMap(L => ouPair(aou1, L)));
      add('1hoe', '1st Half - Odd/Even', 'Half', 2, oeList(ht, T_));
      add('1hhcs', `1st Half - ${home} Clean Sheet`, 'Half', 2, yn('1hhcs', pHT((h, a) => a === 0)));
      add('1hacs', `1st Half - ${away} Clean Sheet`, 'Half', 2, yn('1hacs', pHT((h, a) => h === 0)));
    }
    add('2h1x2', '2nd Half - 1X2', 'Half', 3, r3(h2, ''));
    add('2hou', '2nd Half - Over/Under', 'Half', 2, H2_LINES.flatMap(L => ouPair(ou2, L)));
    add('2hdc', '2nd Half - Double Chance', 'Half', 3, dc(h2));
    add('2hdnb', '2nd Half - Draw No Bet', 'Half', 2, dnb(h2));
    add('2hcs', '2nd Half - Correct Score', 'Half', 3, csList(h2, 2));
    { const g2 = pH2((h, a) => h > 0 && a > 0); add('2hgg', '2nd Half - GG/NG', 'Half', 2, [['gg', 'Yes', g2], ['ng', 'No', 1 - g2]]); }
    add('2hxg', '2nd Half - Exact Goals', 'Half', 2, xgList(h2, T_, 2));
    add('2hhou', `2nd Half - ${home} O/U`, 'Half', 2, [0.5, 1.5].flatMap(L => ouPair(hou2, L)));
    add('2haou', `2nd Half - ${away} O/U`, 'Half', 2, [0.5, 1.5].flatMap(L => ouPair(aou2, L)));
    add('2hoe', '2nd Half - Odd/Even', 'Half', 2, oeList(h2, T_));
    add('2hhcs', `2nd Half - ${home} Clean Sheet`, 'Half', 2, yn('2hhcs', pH2((h, a) => a === 0)));
    add('2hacs', `2nd Half - ${away} Clean Sheet`, 'Half', 2, yn('2hacs', pH2((h, a) => h === 0)));
    add('hwb', `${home} To Win Both Halves`, 'Half', 2, yn('hwb', T.rr[0][0]));
    add('awb', `${away} To Win Both Halves`, 'Half', 2, yn('awb', T.rr[2][2]));
    add('hwe', `${home} To Win Either Half`, 'Half', 2, yn('hwe', T.rr[0][0] + T.rr[0][1] + T.rr[0][2] + T.rr[1][0] + T.rr[2][0]));
    add('awe', `${away} To Win Either Half`, 'Half', 2, yn('awe', T.rr[2][2] + T.rr[2][0] + T.rr[2][1] + T.rr[0][2] + T.rr[1][2]));
    add('ggbh', 'GG in Both Halves', 'Half', 2, yn('ggbh', T.gg[1][1]));

    /* ---- Combo ---- */
    const RL = { 1: 'Home', X: 'Draw', 2: 'Away' }, DL = { '1X': 'Home/Draw', '12': 'Home/Away', X2: 'Draw/Away' };
    const resOk = (r, h, a) => (r === '1' ? h > a : r === 'X' ? h === a : h < a);
    const dcOk = (d, h, a) => (d === '1X' ? h >= a : d === '12' ? h !== a : h <= a);
    [1.5, 2.5, 3.5].forEach(L => add(`1x2ou${L}`, `1X2 & Over/Under ${L}`, 'Combo', 2, ['1', 'X', '2'].flatMap(r => [[`${r}&u${L}`, `${RL[r]} & Under ${L}`, pFT((h, a) => resOk(r, h, a) && h + a < L)], [`${r}&o${L}`, `${RL[r]} & Over ${L}`, pFT((h, a) => resOk(r, h, a) && h + a > L)]])));
    add('1x2gg', '1X2 & GG/NG', 'Combo', 2, ['1', 'X', '2'].flatMap(r => [[`${r}&gg`, `${RL[r]} & Yes`, pFT((h, a) => resOk(r, h, a) && h > 0 && a > 0)], [`${r}&ng`, `${RL[r]} & No`, pFT((h, a) => resOk(r, h, a) && !(h > 0 && a > 0))]]));
    add('ougg', 'Over/Under 2.5 & GG/NG', 'Combo', 2, [['o2.5&gg', 'Over 2.5 & Yes', pFT((h, a) => h + a > 2.5 && h > 0 && a > 0)], ['u2.5&gg', 'Under 2.5 & Yes', pFT((h, a) => h + a < 2.5 && h > 0 && a > 0)], ['o2.5&ng', 'Over 2.5 & No', pFT((h, a) => h + a > 2.5 && !(h > 0 && a > 0))], ['u2.5&ng', 'Under 2.5 & No', pFT((h, a) => h + a < 2.5 && !(h > 0 && a > 0))]]);
    add('dcou', 'Double Chance & Over/Under 2.5', 'Combo', 2, ['1X', '12', 'X2'].flatMap(d => [[`${d}&u2.5`, `${DL[d]} & Under 2.5`, pFT((h, a) => dcOk(d, h, a) && h + a < 2.5)], [`${d}&o2.5`, `${DL[d]} & Over 2.5`, pFT((h, a) => dcOk(d, h, a) && h + a > 2.5)]]));
    add('dcgg', 'Double Chance & GG/NG', 'Combo', 2, ['1X', '12', 'X2'].flatMap(d => [[`${d}&gg`, `${DL[d]} & Yes`, pFT((h, a) => dcOk(d, h, a) && h > 0 && a > 0)], [`${d}&ng`, `${DL[d]} & No`, pFT((h, a) => dcOk(d, h, a) && !(h > 0 && a > 0))]]));
    add('hwtn', `${home} Win To Nil`, 'Combo', 2, yn('hwtn', pFT((h, a) => h > 0 && a === 0)));
    add('awtn', `${away} Win To Nil`, 'Combo', 2, yn('awtn', pFT((h, a) => a > 0 && h === 0)));
    add('htftou', 'Halftime/Fulltime & Over/Under 2.5', 'Combo', 2, ['1', 'X', '2'].flatMap(r1 => ['1', 'X', '2'].flatMap(r2 => ['u', 'o'].map(s => [`${r1}/${r2}&${s}2.5`, `${RL[r1]} / ${RL[r2]} & ${s === 'o' ? 'Over' : 'Under'} 2.5`, htftTot(T, m, r1, r2, s)]))));

    /* ---- Bookings ---- */
    if (!opt.noCards) {
      const lk = +m.lcard || 4.2, cur = (m.st && m.st.yc) || (m.stats && m.stats.cards) || [0, 0];
      const rem = live ? Math.max(0, 90 - T.minute) / 90 : 1;
      const kh = pois(lk * 0.5 * rem, 14), ka = pois(lk * 0.5 * rem, 14);
      const cardP = f => { let s = 0; for (let i = 0; i < kh.length; i++) for (let j = 0; j < ka.length; j++) { const p = kh[i] * ka[j]; if (p > 1e-12 && f(cur[0] + i, cur[1] + j)) s += p; } return s; };
      const kf = pick => { const f = L => cardP((h, a) => pick(h, a) > L); f.eq = L => cardP((h, a) => pick(h, a) === L); return f; };
      add('bk', 'Total Cards', 'Bookings', 2, CARD_LINES.flatMap(L => ouPair(kf(T_), L)));
      add('hbk', `${home} Cards`, 'Bookings', 2, [0.5, 1.5, 2.5].flatMap(L => ouPair(kf(H_), L)));
      add('abk', `${away} Cards`, 'Bookings', 2, [0.5, 1.5, 2.5].flatMap(L => ouPair(kf(A_), L)));
    }
    return out;
  }
  // HT/FT & total needs the joint of (half-time result, full-time result, full-time total): recompute from the halves.
  function htftTot(T, m, r1, r2, s) {
    // approximate independence of the total given the two results would be wrong for e.g. Draw/Draw & Over,
    // so sum the joint directly over half scores (cheap: the half tables are small).
    let p = 0; const ht = T.ht, h2 = T.h2;
    for (let a1 = 0; a1 < ht.length; a1++) for (let b1 = 0; b1 < ht.length; b1++) { const q1 = ht[a1][b1]; if (!q1) continue; if (res(a1, b1) !== r1) continue;
      for (let a2 = 0; a2 < h2.length; a2++) for (let b2 = 0; b2 < h2.length; b2++) { const q2 = h2[a2][b2]; if (!q2) continue; const h = a1 + a2, a = b1 + b2; if (res(h, a) !== r2) continue; if (s === 'o' ? h + a > 2.5 : h + a < 2.5) p += q1 * q2; } }
    return p;
  }

  /* ---------- how the match page lays a market out ---------- */
  const OU_KEYS = /^(ou|hou|aou|1hou|2hou|1hhou|1haou|2hhou|2haou|cor|hcor|acor|bk|hbk|abk|tot)$/;
  function view(mk) { if (OU_KEYS.test(mk)) return 'ou'; if (mk === 'eh' || mk === '1heh') return 'eh'; if (mk === 'ah' || mk === 'hcp') return 'ah'; return 'grid'; }

  /* ---------- what a result must contain to settle a market ---------- */
  function needs(mk) {
    if (/^(1h|2h|hsh|hhsh|ahsh|hwb|awb|hwe|awe|ggbh|htft|bho|bhu|hgg|hsb|asb)/.test(mk)) return 'ht';
    if (/cor/.test(mk)) return 'corners';
    if (/bk$/.test(mk)) return 'cards';
    if (mk === 'next') return 'goals';
    return 'ft';
  }

  /* ---------- grading ---------- */
  // R = { h, a, ht: [h, a] | null, corners: [h, a] | null, cards: [h, a] | null, goals: [{ min, side }] | null, marketName? }
  const ouGrade = (v, k) => { const L = parseFloat(k.slice(1)); if (v === L) return 'void'; return (k[0] === 'o' ? v > L : v < L) ? 'won' : 'lost'; };
  const W = b => (b ? 'won' : 'lost');
  const gg = (h, a) => h > 0 && a > 0;
  function gradeScore(mk, ok, h, a, hs, as) {           // markets read from one score table (FT, HT or 2H)
    const t = h + a, d = h - a, r = res(h, a);
    switch (mk) {
      case '1x2': return W(r === ok);
      case 'dc': return W(ok.includes(r));
      case 'dnb': return d === 0 ? 'void' : W(r === ok);
      case 'gg': return W(gg(h, a) === (ok === 'gg'));
      case 'ou': return ouGrade(t, ok);
      case 'hou': return ouGrade(h, ok);
      case 'aou': return ouGrade(a, ok);
      case 'oe': return W((t % 2 === 1) === (ok === 'odd'));
      case 'hoe': return W((h % 2 === 1) === (ok === 'odd'));
      case 'aoe': return W((a % 2 === 1) === (ok === 'odd'));
      case 'cs': return W(ok === 'oth' ? (h > 4 || a > 4) : ok === `${h}-${a}`);
      case 'cs2': return W(ok === 'oth' ? (h > 2 || a > 2) : ok === `${h}-${a}`);
      case 'eh': { const [line, pick] = ok.split('|'), [x, y] = line.split(':').map(Number); return W(res(h + x, a + y) === pick); }
      case 'ah': { const [line, pick] = ok.split('|'); const v = h + parseFloat(line) - a; return v === 0 ? 'void' : W(pick === '1' ? v > 0 : v < 0); }
      case 'hnb': return r === '1' ? 'void' : W(r === ok);
      case 'anb': return r === '2' ? 'void' : W(r === ok);
      case 'wm': return W(ok === 'X' ? d === 0 : ok[0] === 'h' ? (ok === 'h3' ? d >= 3 : d === +ok[1]) : (ok === 'a3' ? -d >= 3 : -d === +ok[1]));
      case 'xg': return W(ok.endsWith('+') ? t >= parseInt(ok) : t === +ok);
      case 'hxg': return W(ok.endsWith('+') ? h >= parseInt(ok) : h === +ok);
      case 'axg': return W(ok.endsWith('+') ? a >= parseInt(ok) : a === +ok);
      case 'gr': { if (ok === '7+') return W(t >= 7); const [lo, hi] = ok.split('-').map(Number); return W(t >= lo && t <= hi); }
      case 'wts': return W(ok === 'none' ? t === 0 : ok === 'home' ? h > 0 && a === 0 : ok === 'away' ? a > 0 && h === 0 : gg(h, a));
      case 'mg': case 'hmg': case 'amg': { const v = mk === 'mg' ? t : mk === 'hmg' ? h : a; if (ok === 'none') return W(v === 0); if (ok.endsWith('+')) return W(v >= parseInt(ok)); const [lo, hi] = ok.split('-').map(Number); return W(v >= lo && v <= hi); }
      case 'hcs': return W((a === 0) === (ok.endsWith(':y')));
      case 'acs': return W((h === 0) === (ok.endsWith(':y')));
      case 'hwtn': return W((h > 0 && a === 0) === ok.endsWith(':y'));
      case 'awtn': return W((a > 0 && h === 0) === ok.endsWith(':y'));
      case '1x2ou1.5': case '1x2ou2.5': case '1x2ou3.5': { const [pr, s] = ok.split('&'); const L = parseFloat(s.slice(1)); return W(pr === r && (s[0] === 'o' ? t > L : t < L)); }
      case '1x2gg': { const [pr, s] = ok.split('&'); return W(pr === r && gg(h, a) === (s === 'gg')); }
      case 'ougg': { const [s, g] = ok.split('&'); return W((s[0] === 'o' ? t > 2.5 : t < 2.5) && gg(h, a) === (g === 'gg')); }
      case 'dcou': { const [dcv, s] = ok.split('&'); return W(dcv.includes(r) && (s[0] === 'o' ? t > 2.5 : t < 2.5)); }
      case 'dcgg': { const [dcv, g] = ok.split('&'); return W(dcv.includes(r) && gg(h, a) === (g === 'gg')); }
      // legacy keys (bets placed before the market set grew)
      case 'eh-1': return W((d >= 2 ? '1' : d === 1 ? 'X' : '2') === ok);
      case 'eh+1': return W((d >= 0 ? '1' : d === -1 ? 'X' : '2') === ok);
      default: return null;
    }
  }
  function grade(mk, ok, R) {
    const h = +R.h, a = +R.a;
    if (!Number.isFinite(h) || !Number.isFinite(a) || ok == null) return 'void';
    const nd = needs(mk);
    if (nd === 'ht' && !R.ht) return 'void';
    if (nd === 'corners' && !R.corners) return 'void';
    if (nd === 'cards' && !R.cards) return 'void';
    if (nd === 'goals' && !R.goals) return 'void';
    const ht = R.ht, h1 = ht && ht[0], a1 = ht && ht[1], h2 = ht && h - h1, a2 = ht && a - a1;
    const t1 = ht && h1 + a1, t2 = ht && h2 + a2;
    switch (mk) {
      case 'next': { const n = +(((R.marketName || '').match(/\((\d+)\)/) || [0, 1])[1]); const gl = [...R.goals].sort((x, y) => x.min - y.min)[n - 1]; return W(gl ? (gl.side ? '2' : '1') === ok : ok === 'none'); }
      case 'htft': return W(`${res(h1, a1)}/${res(h, a)}` === ok);
      case 'htftou': { const [rr, s] = ok.split('&'); const t = h + a; return W(`${res(h1, a1)}/${res(h, a)}` === rr && (s[0] === 'o' ? t > 2.5 : t < 2.5)); }
      case 'bho': return W((t1 > 1.5 && t2 > 1.5) === ok.endsWith(':y'));
      case 'bhu': return W((t1 < 1.5 && t2 < 1.5) === ok.endsWith(':y'));
      case 'bho05': return W((t1 > 0 && t2 > 0) === ok.endsWith(':y'));
      case 'hgg': return W(ok === (gg(h1, a1) ? 'y' : 'n') + (gg(h2, a2) ? 'y' : 'n'));
      case 'hsb': return W((h1 > 0 && h2 > 0) === ok.endsWith(':y'));
      case 'asb': return W((a1 > 0 && a2 > 0) === ok.endsWith(':y'));
      case 'hsh': return W(ok === (t1 > t2 ? '1' : t2 > t1 ? '2' : 'X'));
      case 'hhsh': return W(ok === (h1 > h2 ? '1' : h2 > h1 ? '2' : 'X'));
      case 'ahsh': return W(ok === (a1 > a2 ? '1' : a2 > a1 ? '2' : 'X'));
      case 'hwb': return W((h1 > a1 && h2 > a2) === ok.endsWith(':y'));
      case 'awb': return W((a1 > h1 && a2 > h2) === ok.endsWith(':y'));
      case 'hwe': return W((h1 > a1 || h2 > a2) === ok.endsWith(':y'));
      case 'awe': return W((a1 > h1 || a2 > h2) === ok.endsWith(':y'));
      case 'ggbh': return W((gg(h1, a1) && gg(h2, a2)) === ok.endsWith(':y'));
      case 'cor': return ouGrade(R.corners[0] + R.corners[1], ok);
      case 'hcor': return ouGrade(R.corners[0], ok);
      case 'acor': return ouGrade(R.corners[1], ok);
      case 'cor1x2': return W(res(R.corners[0], R.corners[1]) === ok);
      case 'coroe': return W(((R.corners[0] + R.corners[1]) % 2 === 1) === (ok === 'odd'));
      case 'bk': return ouGrade(R.cards[0] + R.cards[1], ok);
      case 'hbk': return ouGrade(R.cards[0], ok);
      case 'abk': return ouGrade(R.cards[1], ok);
    }
    // half markets map onto the full-time graders with the half's score
    let r;
    if (mk.startsWith('1h')) r = gradeScore(halfKey(mk.slice(2)), ok, h1, a1);
    else if (mk.startsWith('2h')) r = gradeScore(halfKey(mk.slice(2)), ok, h2, a2);
    else r = gradeScore(mk, ok, h, a);
    return r == null ? 'void' : r;
  }
  const halfKey = k => (k === 'cs' ? 'cs2' : k);

  /* ---------- plain-language guides ---------- */
  const GUIDE = {
    '1x2': 'Predict the result after 90 minutes plus stoppage time: Home win, Draw or Away win.',
    ou: 'Predict whether the total number of goals will be over or under the line. On a whole-number line that lands exactly, the stake is refunded.',
    dc: 'Two of the three outcomes in one pick. 1X = Home or Draw, 12 = Home or Away, X2 = Draw or Away.',
    next: 'Which team scores the next goal. "None" wins if no further goal is scored.',
    eh: 'The match starts from the handicap score shown, e.g. 0:1 means the away team starts one goal up. The result is then settled as 1X2.',
    ah: 'The handicap is added to the home team\'s goals. Half-goal lines cannot tie, so there is always a winner.',
    gg: 'Yes wins if both teams score at least one goal. No wins if at least one team fails to score.',
    dnb: 'Pick the winner. If the match is drawn, your stake is refunded.',
    cs: 'Predict the exact score. "Other" covers every score not listed.',
    htft: 'Predict the result at half-time and the result at full-time, in that order.',
    oe: 'Whether the total number of goals is odd or even. 0 counts as even.',
    hnb: 'Pick Draw or Away. If the home team wins, your stake is refunded.',
    anb: 'Pick Home or Draw. If the away team wins, your stake is refunded.',
    wm: 'The number of goals the winning team wins by, or a draw.',
    xg: 'The exact number of goals scored.',
    gr: 'The range the total number of goals falls into.',
    wts: 'Which team(s) score at least one goal.',
    mg: 'The total goals fall inside the range you pick, both ends included.',
    hou: 'Over or under the line for this team\'s goals only.',
    cor: 'Over or under the number of corners taken. Corners awarded but not taken do not count.',
    cor1x2: 'Which team is awarded more corners in the match.',
    coroe: 'Whether the total number of corners is odd or even.',
    bk: 'Over or under the number of cards shown. A yellow card counts 1 and a red card 1; a second yellow is not counted again.',
    '1x2gg': 'The match result and whether both teams score, together in one pick.',
    ougg: 'Total goals over/under the line and whether both teams score, together in one pick.',
    dcou: 'Double chance and total goals over/under 2.5, together in one pick.',
    dcgg: 'Double chance and whether both teams score, together in one pick.',
    htftou: 'Half-time/full-time result and total goals over/under 2.5 in one pick.',
    hwtn: 'This team wins and keeps a clean sheet.',
    hwe: 'This team wins at least one of the two halves on that half\'s goals alone.',
    hwb: 'This team wins both halves on each half\'s goals alone.',
    hsh: 'Which half has more goals.',
    bho: 'Both halves have more than 1.5 goals each.',
    bhu: 'Both halves have fewer than 1.5 goals each.',
    bho05: 'At least one goal is scored in each half.',
    hgg: 'Whether both teams score in the first half / in the second half.',
    ggbh: 'Both teams score in the first half and again in the second half.',
    hsb: 'This team scores in both halves.',
    hcs: 'This team concedes no goal (a clean sheet).',
    hxg: 'The exact number of goals this team scores.',
    hoe: 'Whether this team\'s goals are odd or even. 0 counts as even.',
    hmg: 'This team\'s goals fall inside the range you pick, both ends included.',
    hhsh: 'In which half this team scores more goals.',
    hcor: 'Over or under the number of corners this team takes.',
    hbk: 'Over or under the number of cards shown to this team.',
  };
  function guide(mk) {
    if (GUIDE[mk]) return GUIDE[mk];
    const half = /^1h/.test(mk) ? 'First half only. ' : /^2h/.test(mk) ? 'Second half only. ' : '';
    let k = mk.replace(/^[12]h/, '');
    if (GUIDE[k]) return half + GUIDE[k];
    if (/^1x2ou/.test(k)) return 'The match result and the total goals over/under the line, together in one pick.';
    k = k.replace(/^a(?=(ou|xg|cs|oe|mg|sb|wb|we|wtn|hsh|cor|bk)$)/, 'h');   // away-team markets read like the home ones
    if (k === 'hwtn' && mk === 'awtn') return GUIDE.hwtn;
    if (GUIDE[k]) return half + GUIDE[k];
    return half + 'Settled on the official result. Extra time and penalties do not count.';
  }

  /* ---------- canonical order of market keys (how the match page lists them) ---------- */
  const ORDER = (() => { const o = {}; football({ home: 'H', away: 'A', lh: 1.3, la: 1.1 }, p => p).forEach((x, i) => { o[x.key] = i; }); o.next = o.dc + 0.5; return o; })();
  const order = mk => (mk in ORDER ? ORDER[mk] : 900);

  const GROUPS = ['All', 'Main', 'Goals', 'Corners', 'Half', 'Combo', 'Bookings'];
  const L = { football, grade, needs, view, guide, order, GROUPS, tables };
  if (typeof module !== 'undefined' && module.exports) module.exports = L; else root.LBAMarkets = L;
})(typeof window !== 'undefined' ? window : globalThis);
