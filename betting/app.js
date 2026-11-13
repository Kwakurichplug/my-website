/* =========================================================
   LetBetAfrika – front-end prototype (demo data, no backend)
   ---------------------------------------------------------
   • Hash router: #/home #/live #/sports #/jackpot #/promos #/me
                  #/match/:id #/league/:idx #/sport/:id
   • Odds come from a goal model (Poisson for football, normal
     approximation for two-way sports) so every market on a
     match is internally consistent, including live odds.
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const naira = n => '₦' + Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const store = {
    get(k, d) { try { const v = localStorage.getItem('lba_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('lba_' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('lba_' + k); } catch {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Maths ---------------- */
  const mkRng = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
  const rnd = mkRng(20261113);
  const r2 = n => Math.round(n * 100) / 100;
  const MARGIN = 0.94;
  const price = p => (p < 0.005 || p > 0.985) ? null : Math.max(1.01, r2(MARGIN / p));
  const pois = (l, n) => { const a = []; let p = Math.exp(-l); for (let k = 0; k <= n; k++) { a.push(p); p *= l / (k + 1); } return a; };
  const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
  const ncdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const samplePois = (l, r) => { let k = 0, p = Math.exp(-l), s = p; const u = r(); while (u > s && k < 12) { k++; p *= l / k; s += p; } return k; };
  const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = s => s.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase() || s.slice(0, 2);

  /* ---------------- Reference data ---------------- */
  const SPORTS = [
    { id: 'football', name: 'Football', em: '⚽' },
    { id: 'basketball', name: 'Basketball', em: '🏀' },
    { id: 'tennis', name: 'Tennis', em: '🎾' },
    { id: 'icehockey', name: 'Ice Hockey', em: '🏒' },
    { id: 'volleyball', name: 'Volleyball', em: '🏐' },
    { id: 'tabletennis', name: 'Table Tennis', em: '🏓' },
    { id: 'esports', name: 'eSports', em: '🎮' },
    { id: 'cricket', name: 'Cricket', em: '🏏' },
    { id: 'rugby', name: 'Rugby', em: '🏉' },
    { id: 'handball', name: 'Handball', em: '🤾' },
    { id: 'boxing', name: 'Boxing', em: '🥊' },
    { id: 'mma', name: 'MMA', em: '🥋' },
    { id: 'darts', name: 'Darts', em: '🎯' },
  ];
  const sportOf = id => SPORTS.find(s => s.id === id);
  // Two-way model parameters: T = expected total, sd = total sd, msd = margin sd
  const TW = {
    basketball: { T: 218, sd: 14, msd: 11, hl: [-1.5, -4.5, -7.5], tl: [210.5, 214.5, 218.5, 222.5, 226.5], unit: 'Points' },
    tennis: { T: 22.5, sd: 3.5, msd: 3.5, hl: [-1.5, -3.5], tl: [20.5, 22.5, 24.5], unit: 'Games' },
    icehockey: { T: 5.5, sd: 1.8, msd: 1.6, hl: [-1.5], tl: [4.5, 5.5, 6.5], unit: 'Goals' },
    handball: { T: 56.5, sd: 5, msd: 4, hl: [-1.5, -3.5], tl: [54.5, 56.5, 58.5], unit: 'Goals' },
    volleyball: { T: 182.5, sd: 18, msd: 10, hl: [-2.5, -4.5], tl: [176.5, 182.5, 188.5], unit: 'Points' },
    default: { T: 20.5, sd: 4, msd: 3, hl: [-1.5], tl: [18.5, 20.5, 22.5], unit: 'Points' },
  };
  const LEAGUES = [
    { sport: 'football', name: 'Premier League', country: 'England', flag: '🇬🇧', top: 1, teams: ['Arsenal', 'Chelsea', 'Liverpool', 'Man City', 'Man Utd', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham'] },
    { sport: 'football', name: 'LaLiga', country: 'Spain', flag: '🇪🇸', top: 1, teams: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Sevilla', 'Villarreal', 'Real Sociedad', 'Valencia', 'Betis'] },
    { sport: 'football', name: 'Serie A', country: 'Italy', flag: '🇮🇹', top: 1, teams: ['Inter', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'] },
    { sport: 'football', name: 'Bundesliga', country: 'Germany', flag: '🇩🇪', top: 1, teams: ['Bayern Munich', 'Dortmund', 'Leverkusen', 'RB Leipzig', 'Frankfurt', 'Stuttgart'] },
    { sport: 'football', name: 'Ligue 1', country: 'France', flag: '🇫🇷', top: 1, teams: ['PSG', 'Marseille', 'Lyon', 'Monaco', 'Lille', 'Nice'] },
    { sport: 'football', name: 'NPFL', country: 'Nigeria', flag: '🇳🇬', top: 1, teams: ['Enyimba', 'Rangers Intl', 'Kano Pillars', 'Rivers Utd', 'Shooting Stars', 'Remo Stars', 'Plateau Utd', 'Lobi Stars'] },
    { sport: 'football', name: 'Premier League', country: 'Ghana', flag: '🇬🇭', top: 0, teams: ['Asante Kotoko', 'Hearts of Oak', 'Medeama', 'Aduana Stars', 'Bechem Utd', 'Dreams FC'] },
    { sport: 'football', name: 'Premier League', country: 'South Africa', flag: '🇿🇦', top: 0, teams: ['Mamelodi Sundowns', 'Orlando Pirates', 'Kaizer Chiefs', 'SuperSport Utd', 'Stellenbosch', 'Cape Town City'] },
    { sport: 'football', name: 'Champions League', country: 'UEFA', flag: '🇪🇺', top: 1, teams: ['Benfica', 'Porto', 'Ajax', 'Celtic', 'PSV', 'Club Brugge', 'Galatasaray', 'Sporting CP'] },
    { sport: 'basketball', name: 'NBA', country: 'USA', flag: '🇺🇸', teams: ['Lakers', 'Celtics', 'Warriors', 'Bucks', 'Nuggets', 'Heat', 'Knicks', 'Suns'] },
    { sport: 'basketball', name: 'Euroleague', country: 'Europe', flag: '🇪🇺', teams: ['Real Madrid', 'Olympiacos', 'Fenerbahce', 'Panathinaikos', 'Barcelona', 'Monaco'] },
    { sport: 'basketball', name: 'BAL', country: 'Africa', flag: '🌍', teams: ['Rivers Hoopers', 'Petro de Luanda', 'Al Ahly', 'US Monastir', 'FUS Rabat', 'AS Douanes'] },
    { sport: 'tennis', name: 'ATP Finals', country: 'World', flag: '🎾', teams: ['Sinner J.', 'Alcaraz C.', 'Djokovic N.', 'Zverev A.', 'Medvedev D.', 'Rune H.', 'Fritz T.', 'Ruud C.'] },
    { sport: 'tennis', name: 'WTA Finals', country: 'World', flag: '🎾', teams: ['Sabalenka A.', 'Swiatek I.', 'Gauff C.', 'Rybakina E.', 'Pegula J.', 'Paolini J.'] },
    { sport: 'icehockey', name: 'NHL', country: 'USA', flag: '🇺🇸', teams: ['Rangers', 'Bruins', 'Oilers', 'Avalanche', 'Panthers', 'Maple Leafs'] },
    { sport: 'volleyball', name: 'Nations League', country: 'World', flag: '🌐', teams: ['Brazil', 'Poland', 'Italy', 'USA', 'France', 'Japan'] },
    { sport: 'tabletennis', name: 'Pro Series', country: 'World', flag: '🌐', teams: ['Okafor D.', 'Mensah K.', 'Adeyemi T.', 'Boateng R.', 'Nwosu C.', 'Diallo S.'] },
    { sport: 'esports', name: 'CS2 Masters', country: 'Online', flag: '🖥️', teams: ['Lagos Lions', 'Accra Hawks', 'Nairobi Rhinos', 'Cairo Pharaohs', 'Cape Sharks', 'Abuja Eagles'] },
    { sport: 'cricket', name: 'T20 Series', country: 'International', flag: '🌐', teams: ['India', 'Australia', 'England', 'South Africa', 'Pakistan', 'New Zealand'] },
    { sport: 'rugby', name: 'Rugby Championship', country: 'International', flag: '🌐', teams: ['South Africa', 'New Zealand', 'Australia', 'Argentina'] },
    { sport: 'handball', name: 'EHF Champions League', country: 'Europe', flag: '🇪🇺', teams: ['Kiel', 'Barcelona', 'Veszprem', 'Magdeburg', 'Aalborg', 'PSG'] },
    { sport: 'boxing', name: 'Fight Night', country: 'World', flag: '🥊', teams: ['K. Adebayo', 'M. Ortega', 'J. Mensah', 'T. Novak'] },
    { sport: 'mma', name: 'Fight Series', country: 'World', flag: '🥋', teams: ['A. Okoro', 'D. Silva', 'R. Kamau', 'L. Petrov'] },
    { sport: 'darts', name: 'Grand Prix', country: 'World', flag: '🎯', teams: ['P. Hartley', 'S. van Dijk', 'O. Bello', 'R. Fischer'] },
  ];
  LEAGUES.forEach((l, i) => { l.idx = i; l.full = `${l.country} · ${l.name}`; });

  /* ---------------- Match generation ---------------- */
  const NOW = Date.now();
  const MATCHES = [];
  let nextId = 10421;
  LEAGUES.forEach(lg => {
    const teams = [...lg.teams].sort(() => rnd() - 0.5);
    const rounds = lg.sport === 'football' && lg.teams.length <= 8 ? 2 : 1;
    for (let r = 0; r < rounds; r++) {
      const t = r ? [...teams].reverse().sort(() => rnd() - 0.5) : teams;
      for (let i = 0; i + 1 < t.length; i += 2) {
        const live = rnd() < 0.26;
        const m = {
          id: nextId++, sport: lg.sport, lg: lg.idx, home: t[i], away: t[i + 1], live,
          kick: live ? NOW : NOW + (Math.floor(rnd() * 70) + 1) * 3600000 + Math.floor(rnd() * 4) * 900000,
          score: [0, 0], minute: 0, prog: 0, ev: [], flash: {}, two: lg.sport !== 'football',
        };
        m.kick = Math.round(m.kick / 900000) * 900000;
        if (!m.two) {
          m.lh = 0.75 + rnd() * 1.35; m.la = 0.55 + rnd() * 1.15; m.lc = 8.5 + rnd() * 3.5;
          m.st = { poss: [50, 50], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], att: [0, 0] };
          if (live) {
            m.minute = Math.floor(rnd() * 82) + 3;
            const f = m.minute / 90;
            m.score = [samplePois(m.lh * f, rnd), samplePois(m.la * f, rnd)];
            m.score.forEach((g, side) => { for (let k = 0; k < g; k++) m.ev.push({ min: 1 + Math.floor(rnd() * m.minute), side, type: 'goal' }); });
            const pa = 42 + rnd() * 16; m.st.poss = [Math.round(pa), 100 - Math.round(pa)];
            [0, 1].forEach(s => {
              const l = s ? m.la : m.lh;
              m.st.shots[s] = Math.round(l * 6 * f + rnd() * 3) + m.score[s];
              m.st.sot[s] = Math.min(m.st.shots[s], m.score[s] + Math.round(rnd() * 3 * f));
              m.st.corners[s] = Math.round((s ? m.lc * 0.45 : m.lc * 0.55) * f + rnd() * 2);
              m.st.yc[s] = Math.round(rnd() * 2.5 * f);
              m.st.att[s] = Math.round(l * 40 * f + rnd() * 10);
              for (let k = 0; k < m.st.yc[s]; k++) m.ev.push({ min: 1 + Math.floor(rnd() * m.minute), side: s, type: 'yc' });
            });
            m.ev.sort((a, b) => a.min - b.min);
          }
        } else {
          const P = TW[m.sport] || TW.default;
          m.mu = (rnd() - 0.5) * 2.2 * P.msd; m.tf = 0.95 + rnd() * 0.1;
          if (live) {
            m.prog = 0.1 + rnd() * 0.75;
            if (m.sport === 'basketball') {
              const tot = P.T * m.tf * m.prog, d = m.mu * m.prog + (rnd() - 0.5) * 8;
              m.score = [Math.round((tot + d) / 2), Math.round((tot - d) / 2)];
            } else m.score = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)];
          }
        }
        computeMarkets(m, false);
        MATCHES.push(m);
      }
    }
  });
  const byId = id => MATCHES.find(m => m.id === +id);
  const league = m => LEAGUES[m.lg];

  /* ---------------- Market model ---------------- */
  function computeMarkets(m, flash) {
    const old = m.map;
    const mk = m.two ? twoWayMarkets(m) : footballMarkets(m);
    const map = {};
    mk.forEach(x => { map[x.key] = {}; x.outs.forEach(o => { if (o.k) map[x.key][o.k] = o; }); });
    m.flash = {};
    if (flash && old) {
      for (const k in map) for (const o in map[k]) {
        const a = old[k]?.[o]?.o, b = map[k][o].o;
        if (a && b && a !== b) m.flash[k + '|' + o] = b > a ? 'up' : 'down';
      }
    }
    m.mk = mk; m.map = map;
  }

  function footballMarkets(m) {
    const out = [];
    const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outs: list.map(([k, l, p]) => k ? { k, l, o: price(p) } : { k: null }) });
    const N = 8;
    const rem = m.live ? Math.max(0, 90 - m.minute) / 90 : 1;
    const [sh, sa] = m.score;
    const ph = pois(m.lh * rem, N), pa = pois(m.la * rem, N);
    let H = 0, D = 0, A = 0, GG = 0, ODD = 0;
    const tot = {}, diff = {}, cs = {};
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = ph[i] * pa[j], fh = sh + i, fa = sa + j;
      if (fh > fa) H += p; else if (fh === fa) D += p; else A += p;
      tot[fh + fa] = (tot[fh + fa] || 0) + p;
      diff[fh - fa] = (diff[fh - fa] || 0) + p;
      if (fh <= 4 && fa <= 4) cs[fh + '-' + fa] = (cs[fh + '-' + fa] || 0) + p;
      if (fh && fa) GG += p;
      if ((fh + fa) % 2) ODD += p;
    }
    const over = l => Object.entries(tot).reduce((s, [k, p]) => s + (+k > l ? p : 0), 0);
    const dge = d => Object.entries(diff).reduce((s, [k, p]) => s + (+k >= d ? p : 0), 0);
    const deq = d => diff[d] || 0;
    const teamOver = (arr, base, l) => arr.reduce((s, p, i) => s + (base + i > l ? p : 0), 0);

    add('1x2', '1X2', 'Main', 3, [['1', '1', H], ['X', 'X', D], ['2', '2', A]]);
    add('dc', 'Double Chance', 'Main', 3, [['1X', '1X', H + D], ['12', '12', H + A], ['X2', 'X2', D + A]]);
    if (m.live && rem > 0) {
      const L = (m.lh + m.la) * rem, pn = Math.exp(-L);
      add('next', `Next Goal (${sh + sa + 1})`, 'Main', 3, [['1', '1', (1 - pn) * m.lh / (m.lh + m.la)], ['none', 'No Goal', pn], ['2', '2', (1 - pn) * m.la / (m.lh + m.la)]]);
    }
    add('dnb', 'Draw No Bet', 'Main', 2, [['1', '1', H / (H + A)], ['2', '2', A / (H + A)]]);
    add('gg', 'Both Teams To Score', 'Main', 2, [['gg', 'GG (Yes)', GG], ['ng', 'NG (No)', 1 - GG]]);
    add('ou', 'Over/Under', 'Goals', 2, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].flatMap(l => [[`o${l}`, `Over ${l}`, over(l)], [`u${l}`, `Under ${l}`, 1 - over(l)]]));
    add('hou', `${m.home} Total Goals`, 'Goals', 2, [0.5, 1.5, 2.5].flatMap(l => { const p = teamOver(ph, sh, l); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
    add('aou', `${m.away} Total Goals`, 'Goals', 2, [0.5, 1.5, 2.5].flatMap(l => { const p = teamOver(pa, sa, l); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
    add('oe', 'Odd/Even Goals', 'Goals', 2, [['odd', 'Odd', ODD], ['even', 'Even', 1 - ODD]]);

    // First half
    if (!m.live || m.minute < 45) {
      const r1 = (m.live ? 45 - m.minute : 45) / 90;
      const h1 = pois(m.lh * r1, N), a1 = pois(m.la * r1, N), b = m.live ? m.score : [0, 0];
      let h = 0, d = 0, a = 0; const t1 = {};
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const p = h1[i] * a1[j], x = b[0] + i, y = b[1] + j;
        if (x > y) h += p; else if (x === y) d += p; else a += p;
        t1[x + y] = (t1[x + y] || 0) + p;
      }
      const o1 = l => Object.entries(t1).reduce((s, [k, p]) => s + (+k > l ? p : 0), 0);
      add('1h1x2', '1st Half – 1X2', 'Half', 3, [['1', '1', h], ['X', 'X', d], ['2', '2', a]]);
      add('1hou', '1st Half – Over/Under', 'Half', 2, [0.5, 1.5].flatMap(l => [[`o${l}`, `Over ${l}`, o1(l)], [`u${l}`, `Under ${l}`, 1 - o1(l)]]));
    }
    if (!m.live) {
      const n = 6, h1 = pois(m.lh * 0.45, n), a1 = pois(m.la * 0.45, n), h2 = pois(m.lh * 0.55, n), a2 = pois(m.la * 0.55, n);
      const res = (x, y) => x > y ? '1' : x === y ? 'X' : '2';
      const acc = {};
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const p1 = h1[i] * a1[j], ht = res(i, j);
        for (let k = 0; k <= n; k++) for (let l = 0; l <= n; l++) {
          const key = ht + '/' + res(i + k, j + l);
          acc[key] = (acc[key] || 0) + p1 * h2[k] * a2[l];
        }
      }
      add('htft', 'Half Time / Full Time', 'Half', 3, ['1/1', '1/X', '1/2', 'X/1', 'X/X', 'X/2', '2/1', '2/X', '2/2'].map(k => [k, k, acc[k] || 0]));
    }

    // Correct score (3 columns: home win | draw | away win)
    const hw = [], dr = [], aw = [];
    Object.entries(cs).forEach(([k, p]) => { const [x, y] = k.split('-').map(Number); (x > y ? hw : x === y ? dr : aw).push([k, k, p, x, y]); });
    const srt = (a, b) => (a[3] + a[4]) - (b[3] + b[4]) || a[3] - b[3];
    hw.sort(srt); dr.sort(srt); aw.sort((a, b) => (a[3] + a[4]) - (b[3] + b[4]) || a[4] - b[4]);
    const rows = Math.max(hw.length, dr.length, aw.length), list = [];
    for (let r = 0; r < rows; r++) [hw, dr, aw].forEach(c => list.push(c[r] ? c[r].slice(0, 3) : [null]));
    const csSum = Object.values(cs).reduce((s, p) => s + p, 0);
    list.push([null], ['oth', 'Other', 1 - csSum], [null]);
    add('cs', 'Correct Score', 'Score', 3, list);

    add('eh-1', `Handicap ${m.home} (-1)`, 'Handicap', 3, [['1', '1 (-1)', dge(2)], ['X', 'X (-1)', deq(1)], ['2', '2 (+1)', 1 - dge(1)]]);
    add('eh+1', `Handicap ${m.home} (+1)`, 'Handicap', 3, [['1', '1 (+1)', dge(0)], ['X', 'X (+1)', deq(-1)], ['2', '2 (-1)', 1 - dge(-1)]]);

    const cur = m.st.corners[0] + m.st.corners[1], cp = pois(m.lc * rem, 30);
    const cOver = l => cp.reduce((s, p, i) => s + (cur + i > l ? p : 0), 0);
    add('cor', 'Total Corners', 'Corners', 2, [7.5, 8.5, 9.5, 10.5, 11.5].flatMap(l => [[`o${l}`, `Over ${l}`, cOver(l)], [`u${l}`, `Under ${l}`, 1 - cOver(l)]]));
    return out;
  }

  function twoWayMarkets(m) {
    const out = [];
    const add = (key, name, group, cols, list) => out.push({ key, name, group, cols, outs: list.map(([k, l, p]) => ({ k, l, o: price(p) })) });
    const P = TW[m.sport] || TW.default, bk = m.sport === 'basketball' && m.live;
    const rem = bk ? Math.max(0.02, 1 - m.prog) : 1;
    const d0 = bk ? m.score[0] - m.score[1] : 0, t0 = bk ? m.score[0] + m.score[1] : 0;
    const mu = d0 + m.mu * rem, sd = P.msd * Math.sqrt(rem);
    const tm = t0 + P.T * m.tf * rem, tsd = P.sd * Math.sqrt(rem);
    const pw = 1 - ncdf(-mu / sd);
    add('win', 'Winner', 'Main', 2, [['1', '1', pw], ['2', '2', 1 - pw]]);
    add('hcp', 'Handicap', 'Handicap', 2, P.hl.flatMap((h, i) => { const p = 1 - ncdf((-h - mu) / sd); return [[`h${i}1`, `1 (${h})`, p], [`h${i}2`, `2 (+${-h})`, 1 - p]]; }));
    add('tot', `Total ${P.unit}`, 'Totals', 2, P.tl.flatMap(l => { const p = 1 - ncdf((l - tm) / tsd); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
    return out;
  }

  // Which columns show in match lists for each sport
  function listMarkets(sport) {
    if (sport === 'football') return [
      { id: '1x2', name: '1X2', mk: '1x2', outs: ['1', 'X', '2'], lab: ['1', 'X', '2'] },
      { id: 'dc', name: 'Double Chance', mk: 'dc', outs: ['1X', '12', 'X2'], lab: ['1X', '12', 'X2'] },
      { id: 'ou', name: 'Over/Under 2.5', mk: 'ou', outs: ['o2.5', 'u2.5'], lab: ['Over', 'Under'] },
      { id: 'gg', name: 'GG/NG', mk: 'gg', outs: ['gg', 'ng'], lab: ['GG', 'NG'] },
    ];
    const P = TW[sport] || TW.default, mid = P.tl[Math.floor(P.tl.length / 2)];
    return [
      { id: 'win', name: 'Winner', mk: 'win', outs: ['1', '2'], lab: ['1', '2'] },
      { id: 'hcp', name: `Handicap ${P.hl[0]}`, mk: 'hcp', outs: ['h01', 'h02'], lab: ['1', '2'] },
      { id: 'tot', name: `Total ${mid}`, mk: 'tot', outs: [`o${mid}`, `u${mid}`], lab: ['Over', 'Under'] },
    ];
  }

  /* ---------------- State ---------------- */
  const state = {
    sport: 'football', liveSport: 'all', list: 'highlights', market: {},
    slip: store.get('slip', []), slipType: 'multi', user: store.get('user', null),
    bets: store.get('bets', []), jp: {}, betsTab: 'open', favs: store.get('favs', []),
    route: 'home', arg: null, mdTab: 'markets', mdGroup: 'All', collapsed: new Set(), azOpen: new Set(['football']),
  };
  const saveSlip = () => store.set('slip', state.slip);
  const saveUser = () => store.set('user', state.user);
  const saveBets = () => store.set('bets', state.bets);
  const mktFor = sport => { const l = listMarkets(sport); return l.find(x => x.id === state.market[sport]) || l[0]; };

  /* ---------------- UI helpers ---------------- */
  const toast = (msg, type = 'ok') => {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast on ' + type;
    clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2600);
  };
  const fmtKick = (ts, long) => {
    const d = new Date(ts), today = new Date();
    const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const tmr = new Date(today); tmr.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) return long ? ['Today', tm] : 'Today ' + tm;
    if (d.toDateString() === tmr.toDateString()) return long ? ['Tomorrow', tm] : 'Tomorrow ' + tm;
    const ds = d.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });
    return long ? [ds, tm] : d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + tm;
  };
  const crest = (name, big) => `<i class="crest${big ? ' big' : ''}" style="--h:${hue(name)}">${esc(initials(name))}</i>`;
  const LOCK = '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const isSel = (id, mk, ok) => state.slip.some(s => s.mid === id && s.mk === mk && s.ok === ok);
  const liveLabel = m => {
    if (!m.two) return m.minute >= 90 ? "90+'" : m.minute === 45 ? 'HT' : m.minute + "'";
    if (m.sport === 'basketball') return 'Q' + Math.min(4, 1 + Math.floor(m.prog * 4));
    if (m.sport === 'tennis') return 'Set ' + (m.score[0] + m.score[1] + 1);
    return 'LIVE';
  };

  function oddBtn(m, mk, ok, label, style) {
    const o = m.map[mk]?.[ok];
    if (!o) return `<span class="odd void"></span>`;
    if (!o.o) return `<button class="odd ${style || ''} locked" disabled>${style === 'ob' ? `<span>${esc(o.l)}</span>` : ''}${LOCK}</button>`;
    const cls = ['odd', style || '', isSel(m.id, mk, ok) ? 'sel' : '', m.flash[mk + '|' + ok] || ''].join(' ');
    const inner = style === 'ob'
      ? `<span>${esc(o.l)}</span><b>${o.o.toFixed(2)}</b>`
      : `${label ? `<small>${esc(label)}</small>` : ''}<b>${o.o.toFixed(2)}</b>`;
    return `<button class="${cls}" data-mid="${m.id}" data-mk="${mk}" data-ok="${esc(ok)}">${inner}</button>`;
  }

  /* ---------------- Lists ---------------- */
  function renderSportTabs(el, active, liveOnly) {
    let list = SPORTS;
    if (liveOnly) list = [{ id: 'all', name: 'All', em: '🔥' }, ...SPORTS.filter(s => MATCHES.some(m => m.live && m.sport === s.id))];
    const x = el.scrollLeft;
    el.innerHTML = list.map(s => {
      const n = s.id === 'all' ? MATCHES.filter(m => m.live).length : MATCHES.filter(m => m.sport === s.id && (!liveOnly || m.live)).length;
      return `<button data-sport="${s.id}" class="${s.id === active ? 'active' : ''}"><span class="em">${s.em}</span>${s.name}<i>${n}</i></button>`;
    }).join('');
    el.scrollLeft = x;
  }
  function renderMarketTabs(el, sport) {
    const cur = mktFor(sport);
    el.innerHTML = listMarkets(sport).map(x => `<button data-market="${x.id}" data-msport="${sport}" class="${x.id === cur.id ? 'active' : ''}">${x.name}</button>`).join('');
  }

  function matchRow(m, cfg) {
    const meta = m.live
      ? `<span class="live">● ${liveLabel(m)}</span>`
      : `<span>${fmtKick(m.kick)}</span>`;
    const fav = state.favs.includes(m.id) ? '<span class="star">★</span>' : '';
    return `<div class="match" style="--n:${cfg.outs.length}">
      <a class="m-info" href="#/match/${m.id}">
        <div class="m-meta">${meta}<span class="mid">ID ${m.id}</span>${fav}</div>
        <div class="m-team"><span>${esc(m.home)}</span>${m.live ? `<b>${m.score[0]}</b>` : ''}</div>
        <div class="m-team"><span>${esc(m.away)}</span>${m.live ? `<b>${m.score[1]}</b>` : ''}</div>
      </a>
      <div class="m-odds">${cfg.outs.map(ok => oddBtn(m, cfg.mk, ok)).join('')}</div>
      <a class="m-more" href="#/match/${m.id}" aria-label="All markets">+${m.mk.reduce((s, x) => s + x.outs.filter(o => o.k).length, 0)}<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a>
    </div>`;
  }

  function groupRender(list, cfgFn, hideHead) {
    if (!list.length) return `<div class="empty"><span class="big">🗓️</span>No events available right now.</div>`;
    const groups = new Map();
    list.forEach(m => { if (!groups.has(m.lg)) groups.set(m.lg, []); groups.get(m.lg).push(m); });
    return [...groups].map(([lgi, ms]) => {
      const lg = LEAGUES[lgi], cfg = cfgFn(lg.sport);
      return `<div class="league-block">
        <div class="league-head" style="--n:${cfg.outs.length}">
          ${hideHead ? `<span class="lh-name">${esc(cfg.name)}</span>` : `<a class="lh-name" href="#/league/${lgi}"><span class="flag">${lg.flag}</span><span class="lh-t">${esc(lg.full)}</span></a>`}
          <div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div><span class="cols-pad"></span></div>
        ${ms.map(m => matchRow(m, cfg)).join('')}
      </div>`;
    }).join('');
  }

  function renderHome() {
    renderSportTabs($('#sportTabs'), state.sport);
    renderMarketTabs($('#marketTabs'), state.sport);
    let list = MATCHES.filter(m => m.sport === state.sport && !m.live);
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    if (state.list === 'today') list = list.filter(m => m.kick <= endToday.getTime());
    list.sort((a, b) => a.kick - b.kick);
    if (state.list === 'highlights') list = list.filter(m => LEAGUES[m.lg].top || m.sport !== 'football').slice(0, 16);
    $('#matchList').innerHTML = groupRender(list, mktFor);
    const lgs = LEAGUES.filter(l => l.sport === state.sport);
    $('#leagueChips').innerHTML = lgs.map(l => `<a href="#/league/${l.idx}" class="lchip"><span class="flag">${l.flag}</span><span><b>${esc(l.name)}</b><small>${esc(l.country)}</small></span></a>`).join('');
    renderLiveStrip();
  }

  function renderLiveStrip() {
    const el = $('#liveStrip'), x = el.scrollLeft;
    const live = MATCHES.filter(m => m.live).slice(0, 12);
    el.innerHTML = live.map(m => {
      const mk = m.two ? 'win' : '1x2', outs = m.two ? ['1', '2'] : ['1', 'X', '2'];
      return `<div class="live-card">
        <a href="#/match/${m.id}" class="lc-link">
          <div class="lc-top"><span>${sportOf(m.sport).em} ${esc(league(m).name)}</span><span class="lc-min">● ${liveLabel(m)}</span></div>
          <div class="lc-team">${crest(m.home)}<span>${esc(m.home)}</span><b>${m.score[0]}</b></div>
          <div class="lc-team">${crest(m.away)}<span>${esc(m.away)}</span><b>${m.score[1]}</b></div>
        </a>
        <div class="lc-odds" style="grid-template-columns:repeat(${outs.length},1fr)">${outs.map(o => oddBtn(m, mk, o, o)).join('')}</div>
      </div>`;
    }).join('');
    el.scrollLeft = x;
  }

  function renderLive() {
    renderSportTabs($('#liveSportTabs'), state.liveSport, true);
    const list = MATCHES.filter(m => m.live && (state.liveSport === 'all' || m.sport === state.liveSport));
    $('#liveCount').textContent = list.length + ' events';
    $('#liveList').innerHTML = groupRender(list, s => listMarkets(s)[0]);
  }

  function renderLeague(idx) {
    const lg = LEAGUES[idx]; if (!lg) return go('home');
    $('#lgSport').textContent = `${sportOf(lg.sport).em} ${sportOf(lg.sport).name} · ${lg.country}`;
    $('#lgTitle').innerHTML = `${lg.flag} ${esc(lg.name)}`;
    renderMarketTabs($('#lgMarketTabs'), lg.sport);
    const list = MATCHES.filter(m => m.lg === lg.idx).sort((a, b) => (b.live - a.live) || a.kick - b.kick);
    $('#lgList').innerHTML = groupRender(list, mktFor, true);
  }

  function renderRails() {
    $('#leagueRail').innerHTML = LEAGUES.filter(l => l.top).map(l => `<li><a href="#/league/${l.idx}">${l.flag} ${esc(l.name)}${l.country === 'England' || l.country === 'Nigeria' ? ` <small class="muted">${l.country}</small>` : ''}</a></li>`).join('');
    $('#sportRail').innerHTML = SPORTS.map(s => `<li><a href="#/sport/${s.id}">${s.em} ${s.name}<i>${MATCHES.filter(m => m.sport === s.id).length}</i></a></li>`).join('');
  }

  function renderAZ(q = '') {
    q = q.trim().toLowerCase();
    $('#azList').innerHTML = [...SPORTS].sort((a, b) => a.name.localeCompare(b.name)).map(s => {
      const lgs = LEAGUES.filter(l => l.sport === s.id && (!q || s.name.toLowerCase().includes(q) || l.full.toLowerCase().includes(q)));
      if (!lgs.length) return '';
      const open = q || state.azOpen.has(s.id);
      return `<div class="az-item ${open ? 'open' : ''}">
        <button class="az-head" data-az="${s.id}"><span class="em">${s.em}</span>${s.name}<span class="cnt">${MATCHES.filter(m => m.sport === s.id).length}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="az-body">${lgs.map(l => `<a href="#/league/${l.idx}"><span>${l.flag} ${esc(l.full)}</span><span class="cnt">${MATCHES.filter(m => m.lg === l.idx).length}</span></a>`).join('')}</div>
      </div>`;
    }).join('') || `<div class="empty">No results for “${esc(q)}”</div>`;
  }

  /* ---------------- Match detail ---------------- */
  function renderMatch(id, keepScroll) {
    const m = byId(id); if (!m) return go('home');
    const lg = league(m), sp = sportOf(m.sport);
    $('#mdSport').textContent = `${sp.em} ${sp.name} · ${lg.country}`;
    $('#mdLeague').innerHTML = `<a href="#/league/${lg.idx}">${esc(lg.name)}</a>`;
    $('#mdFav').classList.toggle('on', state.favs.includes(m.id));

    // Hero
    let mid;
    if (m.live) {
      mid = `<div class="mh-score"><span>${m.score[0]}</span><i>:</i><span>${m.score[1]}</span></div><div class="mh-status live">● ${liveLabel(m)}</div>`;
    } else {
      const [d, t] = fmtKick(m.kick, true);
      mid = `<div class="mh-time">${t}</div><div class="mh-status">${d}</div>`;
    }
    let bar = '';
    if (m.live && !m.two) {
      const pct = Math.min(100, m.minute / 90 * 100);
      bar = `<div class="mh-bar"><div class="mh-track"><i style="width:${pct}%"></i><b class="ht"></b>${m.ev.filter(e => e.type === 'goal').map(e => `<em class="g ${e.side ? 'a' : 'h'}" style="left:${Math.min(100, e.min / 90 * 100)}%" title="${e.min}'">⚽</em>`).join('')}</div>
        <div class="mh-ticks"><span>0'</span><span>HT</span><span>90'</span></div></div>
        <div class="mh-mini">
          <div><b>${m.st.poss[0]}%</b><span>Possession</span><b>${m.st.poss[1]}%</b></div>
          <div class="pbar"><i style="width:${m.st.poss[0]}%"></i></div>
          <div class="mini-row"><span>🎯 ${m.st.sot[0]}</span><span>Shots on target</span><span>${m.st.sot[1]} 🎯</span></div>
          <div class="mini-row"><span>⛳ ${m.st.corners[0]}</span><span>Corners</span><span>${m.st.corners[1]} ⛳</span></div>
        </div>`;
    } else if (m.live) {
      bar = `<div class="mh-bar"><div class="mh-track"><i style="width:${m.prog * 100}%"></i></div></div>`;
    }
    $('#mdHero').innerHTML = `<div class="mh-teams">
        <div class="mh-team">${crest(m.home, 1)}<span>${esc(m.home)}</span></div>
        <div class="mh-mid">${mid}</div>
        <div class="mh-team">${crest(m.away, 1)}<span>${esc(m.away)}</span></div>
      </div>${bar}
      <div class="mh-foot"><span>ID ${m.id}</span><span>${m.mk.length} markets</span>${m.live ? '<span class="live-pill">LIVE</span>' : '<span>Cashout available</span>'}</div>`;

    $$('#mdTabs button').forEach(b => b.classList.toggle('active', b.dataset.mdtab === state.mdTab));
    $('#mdMarketsWrap').hidden = state.mdTab !== 'markets';
    $('#mdStats').hidden = state.mdTab !== 'stats';
    $('#mdInfo').hidden = state.mdTab !== 'info';

    if (state.mdTab === 'markets') {
      const groups = ['All', ...new Set(m.mk.map(x => x.group))];
      if (!groups.includes(state.mdGroup)) state.mdGroup = 'All';
      $('#mdGroups').innerHTML = groups.map(g => `<button data-group="${g}" class="${g === state.mdGroup ? 'active' : ''}">${g}</button>`).join('');
      $('#mdMarkets').innerHTML = m.mk.filter(x => state.mdGroup === 'All' || x.group === state.mdGroup).map(x => {
        const ck = m.id + x.key, closed = state.collapsed.has(ck);
        const allLocked = x.outs.every(o => !o.k || !o.o);
        return `<div class="mkt ${closed ? 'closed' : ''}">
          <button class="mkt-head" data-collapse="${ck}"><span>${esc(x.name)}</span>${allLocked ? '<em class="susp">Suspended</em>' : ''}<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="mkt-body" style="--c:${x.cols}">${x.outs.map(o => o.k ? oddBtn(m, x.key, o.k, null, 'ob') : '<span class="odd void"></span>').join('')}</div>
        </div>`;
      }).join('');
    }
    if (state.mdTab === 'stats') $('#mdStats').innerHTML = statsHTML(m);
    if (state.mdTab === 'info') $('#mdInfo').innerHTML = infoHTML(m);
    if (!keepScroll) window.scrollTo(0, 0);
  }

  function statRow(label, a, b, pct) {
    const t = (a + b) || 1, pa = pct ? a : Math.round(a / t * 100);
    return `<div class="srow"><div class="snum"><b>${a}${pct ? '%' : ''}</b><span>${label}</span><b>${b}${pct ? '%' : ''}</b></div>
      <div class="sbar"><i class="h" style="width:${pa}%"></i><i class="a" style="width:${100 - pa}%"></i></div></div>`;
  }
  function statsHTML(m) {
    const legend = `<div class="slegend"><span>${crest(m.home)} ${esc(m.home)}</span><span>${esc(m.away)} ${crest(m.away)}</span></div>`;
    if (m.two) {
      return `<div class="card-pad">${legend}${m.live ? statRow('Score', m.score[0], m.score[1]) : ''}
        <p class="muted center pad">Detailed ${sportOf(m.sport).name.toLowerCase()} statistics will appear here from the data provider.</p></div>`;
    }
    if (!m.live) {
      const r = mkRng(m.id * 7);
      const f = x => +r2(x).toFixed(2);
      return `<div class="card-pad">${legend}
        <h4 class="sh">Season averages</h4>
        ${statRow('Goals scored / game', f(m.lh + 0.2), f(m.la + 0.2))}
        ${statRow('Goals conceded / game', f(1.6 - m.lh * 0.4), f(1.7 - m.la * 0.4))}
        ${statRow('Clean sheets', Math.round(2 + r() * 6), Math.round(2 + r() * 6))}
        ${statRow('Corners / game', f(m.lc * 0.55), f(m.lc * 0.45))}
        ${statRow('Possession', Math.round(45 + m.lh * 5), 100 - Math.round(45 + m.lh * 5), true)}
      </div>`;
    }
    const s = m.st;
    const tl = [...m.ev].reverse().map(e => `<li class="${e.side ? 'a' : 'h'}"><span class="tmin">${e.min}'</span><span class="tic">${e.type === 'goal' ? '⚽' : '🟨'}</span><span>${e.type === 'goal' ? 'Goal' : 'Yellow card'} – ${esc(e.side ? m.away : m.home)}</span></li>`).join('');
    return `<div class="card-pad">${legend}
      ${statRow('Possession', s.poss[0], s.poss[1], true)}
      ${statRow('Dangerous attacks', s.att[0], s.att[1])}
      ${statRow('Shots', s.shots[0], s.shots[1])}
      ${statRow('Shots on target', s.sot[0], s.sot[1])}
      ${statRow('Corners', s.corners[0], s.corners[1])}
      ${statRow('Yellow cards', s.yc[0], s.yc[1])}
      <h4 class="sh">Timeline</h4>
      <ul class="timeline">${tl || '<li class="muted">No events yet</li>'}<li class="ko"><span class="tmin">0'</span><span class="tic">🏁</span><span>Kick-off</span></li></ul>
    </div>`;
  }
  function infoHTML(m) {
    const r = mkRng(m.id * 13 + 5);
    const form = l => Array.from({ length: 5 }, () => { const x = r(); return x < 0.3 + l * 0.12 ? 'W' : x < 0.62 + l * 0.05 ? 'D' : 'L'; });
    const fh = form(m.two ? 1 : m.lh), fa = form(m.two ? 1 : m.la);
    const lh = m.two ? 1.5 : m.lh, la = m.two ? 1.3 : m.la;
    const yr = new Date().getFullYear();
    const h2h = Array.from({ length: 5 }, (_, i) => {
      const home = i % 2 ? m.away : m.home, away = i % 2 ? m.home : m.away;
      const a = samplePois(i % 2 ? la : lh, r), b = samplePois(i % 2 ? lh : la, r);
      return `<li><span class="muted">${String(1 + Math.floor(r() * 28)).padStart(2, '0')}/${String(1 + Math.floor(r() * 12)).padStart(2, '0')}/${yr - 1 - Math.floor(i / 2)}</span><span class="hh">${esc(home)}</span><b>${a} - ${b}</b><span class="ha">${esc(away)}</span></li>`;
    }).join('');
    const pill = f => f.map(x => `<i class="f${x}">${x}</i>`).join('');
    const lg = league(m);
    return `<div class="card-pad">
      <h4 class="sh">Recent form</h4>
      <div class="form-row">${crest(m.home)}<span>${esc(m.home)}</span><div class="pills">${pill(fh)}</div></div>
      <div class="form-row">${crest(m.away)}<span>${esc(m.away)}</span><div class="pills">${pill(fa)}</div></div>
      <h4 class="sh">Head-to-head (last 5)</h4>
      <ul class="h2h">${h2h}</ul>
      <h4 class="sh">Match info</h4>
      <dl class="minfo"><dt>Competition</dt><dd>${lg.flag} ${esc(lg.full)}</dd><dt>Kick-off</dt><dd>${new Date(m.kick).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd><dt>Event ID</dt><dd>${m.id}</dd></dl>
    </div>`;
  }

  /* ---------------- Betslip ---------------- */
  const BOOST = n => n >= 20 ? 1000 : n >= 15 ? 500 : n >= 10 ? 200 : n >= 5 ? 50 : n >= 3 ? 5 : 0;
  const BOOST_STEPS = [3, 5, 10, 15, 20];

  function toggleSel(mid, mk, ok) {
    const m = byId(mid), o = m?.map[mk]?.[ok]; if (!o || !o.o) return;
    const mkObj = m.mk.find(x => x.key === mk);
    const ix = state.slip.findIndex(s => s.mid === mid);
    if (ix > -1 && state.slip[ix].mk === mk && state.slip[ix].ok === ok) state.slip.splice(ix, 1);
    else {
      if (ix === -1 && state.slip.length >= 30) return toast('Maximum 30 selections', 'err');
      const sel = { mid, mk, ok, odd: o.o, label: o.l, mname: mkObj.name, match: `${m.home} vs ${m.away}`, live: m.live, stake: state.slip[ix]?.stake || 100 };
      if (ix > -1) { state.slip[ix] = sel; toast('Selection replaced – one pick per match'); } else state.slip.push(sel);
    }
    saveSlip(); renderAfterSlipChange();
  }

  function syncSlipOdds() {
    let changed = false;
    state.slip.forEach(s => {
      const m = byId(s.mid), o = m?.map[s.mk]?.[s.ok];
      const cur = o ? o.o : null;
      if (cur !== s.odd) {
        changed = true; s.susp = cur == null;
        s.chg = cur == null ? 'susp' : cur > s.odd ? 'up' : 'down';
        if (cur != null) s.odd = cur;
      } else s.chg = null;
      if (m) s.live = m.live;
    });
    if (changed) saveSlip();
    return changed;
  }

  function renderSlip() {
    const n = state.slip.length;
    $('#bsCount').textContent = n;
    $('#navBadge').textContent = n; $('#navBadge').dataset.z = n ? 0 : 1;
    $('#pillCount').textContent = n;
    const valid = state.slip.filter(s => !s.susp);
    const total = valid.reduce((a, s) => a * s.odd, 1);
    $('#pillOdds').textContent = 'Odds ' + (n ? total.toFixed(2) : '0.00');
    $('#slipPill').classList.toggle('show', n > 0 && !$('#betslip').classList.contains('open'));
    $$('.bs-tabs button').forEach(b => b.classList.toggle('active', b.dataset.bstype === state.slipType));

    if (!n) {
      $('#bsBody').innerHTML = `<div class="empty"><span class="big">🎫</span><b>Your betslip is empty</b><br>Tap any odds to add a selection.<br><button class="btn btn-ghost sm mt" data-open="codeModal">Load booking code</button></div>`;
      $('#bsFoot').style.display = 'none'; return;
    }
    $('#bsFoot').style.display = '';
    const single = state.slipType === 'single';
    $('#bsBody').innerHTML = state.slip.map((s, k) => `<div class="bs-item ${s.susp ? 'susp' : ''}">
      <button class="x" data-rm="${k}" aria-label="Remove">×</button>
      <div class="pick"><span>${s.live ? '<em class="lv">LIVE</em>' : ''}${esc(s.label)}</span><b class="${s.chg || ''}">${s.susp ? LOCK : s.odd.toFixed(2)}</b></div>
      <div class="mk">${esc(s.mname)}</div>
      <a class="mt-link" href="#/match/${s.mid}">${esc(s.match)}</a>
      ${single && !s.susp ? `<div class="single-stake"><input type="number" min="100" value="${s.stake}" data-stake="${k}" inputmode="numeric"><span class="sw">Win ${naira(s.stake * s.odd)}</span></div>` : ''}
      ${s.susp ? '<div class="susp-msg">Market suspended – remove to continue</div>' : ''}
    </div>`).join('');

    $('.stake-row').style.display = single ? 'none' : '';
    $('.bs-foot .chips').style.display = single ? 'none' : '';
    $('#boostBar').style.display = single ? 'none' : '';
    const stake = +$('#bsStake').value || 0;
    if (single) {
      const totStake = valid.reduce((a, s) => a + (+s.stake || 0), 0);
      $('#bsOdds').textContent = '—';
      $('#bsBoost').textContent = '—';
      $('#bsWin').textContent = naira(valid.reduce((a, s) => a + (+s.stake || 0) * s.odd, 0));
      $('#bsPlace').textContent = `Place Bet · ${naira(totStake)}`;
    } else {
      const c = valid.length, boost = BOOST(c), base = stake * total;
      const next = BOOST_STEPS.find(x => x > c);
      $('#bsOdds').textContent = total.toFixed(2);
      $('#bsBoost').textContent = boost + '%';
      $('#bbFill').style.width = Math.min(100, c / 20 * 100) + '%';
      $('#bbText').textContent = next ? `Add ${next - c} more for ${BOOST(next)}% boost` : 'Max boost unlocked 🚀';
      $('#bsWin').textContent = naira(base + (base - stake) * boost / 100);
      $('#bsPlace').textContent = 'Place Bet';
    }
  }

  function placeBet() {
    if (state.slip.some(s => s.susp)) return toast('Remove suspended selections first', 'err');
    if (!state.user) { openModal('loginModal'); return toast('Please login to place a bet', 'err'); }
    if (state.slip.length === 1 && state.slipType === 'multi') { state.slipType = 'single'; state.slip[0].stake = +$('#bsStake').value; }
    const single = state.slipType === 'single';
    const stake = single ? state.slip.reduce((a, s) => a + (+s.stake || 0), 0) : +$('#bsStake').value;
    if (single ? state.slip.some(s => (+s.stake || 0) < 100) : stake < 100) return toast('Minimum stake is ₦100', 'err');
    if (stake > state.user.balance) { openModal('depositModal'); return toast('Insufficient balance – please deposit', 'err'); }
    state.user.balance -= stake;
    const legs = state.slip.map(({ mid, mk, ok, odd, label, mname, match }) => ({ mid, mk, ok, odd, label, mname, match }));
    if (single) {
      legs.forEach((l, i) => { const st = +state.slip[i].stake; state.bets.unshift({ id: 'T' + Date.now().toString(36).toUpperCase() + i, at: Date.now(), type: 'Single', legs: [l], stake: st, odds: l.odd, win: st * l.odd, status: 'open' }); });
    } else {
      const total = legs.reduce((a, l) => a * l.odd, 1), boost = BOOST(legs.length), base = stake * total;
      state.bets.unshift({ id: 'T' + Date.now().toString(36).toUpperCase(), at: Date.now(), type: `Multiple · ${legs.length} legs`, legs, stake, odds: total, boost, win: base + (base - stake) * boost / 100, status: 'open' });
    }
    state.slip = []; state.slipType = 'multi'; saveSlip(); saveUser(); saveBets();
    toast('✅ Bet placed successfully!');
    closeSlip(); renderAfterSlipChange(); renderAuth();
  }

  function bookCode() {
    if (state.slip.some(s => s.susp)) return toast('Remove suspended selections first', 'err');
    const code = 'LB' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const codes = store.get('codes', {}); codes[code] = state.slip.map(({ mid, mk, ok }) => ({ mid, mk, ok })); store.set('codes', codes);
    navigator.clipboard?.writeText(code).catch(() => {});
    toast(`Booking code ${code} copied – share it with friends`);
  }

  function cashoutValue(b) {
    let cur = 1;
    for (const l of b.legs) { const o = byId(l.mid)?.map[l.mk]?.[l.ok]?.o; if (!o) return null; cur *= o; }
    return Math.min(b.win * 0.97, r2(b.stake * (b.odds / cur) * 0.92));
  }

  /* ---------------- Account ---------------- */
  function renderMe() {
    const u = state.user;
    $('#meName').textContent = u ? '+234 ' + u.phone : 'Guest';
    $('#meSub').textContent = u ? 'Verified account · ID ' + (u.uid || '—') : 'Login to view your bets and balance';
    $('#meBal').textContent = naira(u ? u.balance : 0);
    $('#logoutBtn').hidden = !u;
    $$('[data-bets]').forEach(b => b.classList.toggle('active', b.dataset.bets === state.betsTab));
    const list = state.bets.filter(b => state.betsTab === 'open' ? b.status === 'open' : b.status !== 'open');
    $('#myBets').innerHTML = !u
      ? `<div class="empty"><span class="big">🔒</span>Login to see your bets<br><button class="btn btn-accent sm mt" data-open="loginModal">Login</button></div>`
      : !list.length ? `<div class="empty"><span class="big">🎫</span>No ${state.betsTab} bets yet.<br><a class="btn btn-ghost sm mt" href="#/home">Browse matches</a></div>`
      : list.map(b => {
        const co = b.status === 'open' ? cashoutValue(b) : null;
        return `<div class="bet-card">
          <div class="bh"><span><b>${b.type}</b><br><small>${new Date(b.at).toLocaleString()} · ${b.id}</small></span><span class="status ${b.status}">${b.status === 'cashout' ? 'CASHED OUT' : b.status.toUpperCase()}</span></div>
          ${b.legs.map(l => `<a class="bl" href="#/match/${l.mid}"><span>${esc(l.match)}<br><small class="muted">${esc(l.mname)}: <b>${esc(l.label)}</b></small></span><b>${l.odd.toFixed(2)}</b></a>`).join('')}
          <div class="bf"><span>Stake ${naira(b.stake)}<br><small class="muted">Odds ${b.odds.toFixed(2)}${b.boost ? ` · +${b.boost}% boost` : ''}</small></span><span class="accent">${b.status === 'cashout' ? 'Returned ' + naira(b.paid) : 'To win ' + naira(b.win)}</span></div>
          ${b.status === 'open' ? `<button class="btn ${co ? 'btn-gold' : 'btn-ghost'} block mt" data-cashout="${b.id}" ${co ? '' : 'disabled'}>${co ? 'Cashout ' + naira(co) : 'Cashout unavailable'}</button>` : ''}
        </div>`;
      }).join('');
  }

  function renderAuth() {
    $('#authArea').innerHTML = state.user
      ? `<a class="balance" href="#/me"><small>Balance</small><b>${naira(state.user.balance)}</b></a><button class="btn btn-accent sm dep" data-open="depositModal" aria-label="Deposit"><span class="dep-full">Deposit</span><span class="dep-plus">+</span></button>`
      : `<button class="btn btn-ghost sm" data-open="loginModal">Login</button><button class="btn btn-accent sm" data-open="registerModal">Join Now</button>`;
  }

  /* ---------------- Jackpot ---------------- */
  const JP = MATCHES.filter(m => m.sport === 'football' && !m.live).sort((a, b) => a.kick - b.kick).slice(0, 12);
  function renderJackpot() {
    $('#jackpotList').innerHTML = JP.map((m, k) => `<div class="jp-row">
      <span class="n">${k + 1}</span>
      <div class="t"><small class="muted">${league(m).flag} ${esc(league(m).name)} · ${fmtKick(m.kick)}</small><span>${esc(m.home)}</span><span>${esc(m.away)}</span></div>
      <div class="opts">${['1', 'X', '2'].map(o => `<button data-jp="${m.id}" data-o="${o}" class="${state.jp[m.id] === o ? 'sel' : ''}">${o}</button>`).join('')}</div>
    </div>`).join('');
    const n = Object.keys(state.jp).length;
    $('#jpPicked').innerHTML = `<b>${n}</b>/12 picked`;
    $('#jpSubmit').disabled = n < 12;
  }
  function tickCountdown() {
    if (state.route !== 'jackpot') return;
    const end = new Date(); end.setDate(end.getDate() + ((6 - end.getDay() + 7) % 7 || 7)); end.setHours(15, 0, 0, 0);
    let s = Math.max(0, (end - Date.now()) / 1000 | 0);
    $('#countdown').innerHTML = [['Days', 86400], ['Hrs', 3600], ['Min', 60], ['Sec', 1]].map(([l, d]) => { const v = s / d | 0; s -= v * d; return `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`; }).join('');
  }

  /* ---------------- Search ---------------- */
  function renderSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { $('#searchRes').innerHTML = `<p class="muted pad">Popular searches</p><div class="tags">${['Arsenal', 'Real Madrid', 'Enyimba', 'Lakers', 'Kotoko', 'Sundowns'].map(t => `<button class="tag-btn" data-q="${t}">${t}</button>`).join('')}</div>`; return; }
    const res = MATCHES.filter(m => (m.home + ' ' + m.away + ' ' + league(m).full).toLowerCase().includes(q)).slice(0, 30);
    $('#searchRes').innerHTML = res.length ? res.map(m => `<a class="sr" href="#/match/${m.id}">
      <span class="sr-sp">${sportOf(m.sport).em}</span>
      <span class="sr-t"><b>${esc(m.home)} vs ${esc(m.away)}</b><small class="muted">${league(m).flag} ${esc(league(m).full)} · ${m.live ? '<span class="live-t">LIVE ' + liveLabel(m) + '</span>' : fmtKick(m.kick)}</small></span>
      <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a>`).join('') : `<div class="empty">No matches for “${esc(q)}”</div>`;
  }

  /* ---------------- Router ---------------- */
  const PAGES = ['home', 'live', 'sports', 'jackpot', 'promos', 'me', 'match', 'league'];
  function go(r) { location.hash = '#/' + r; }
  function route() {
    const [r, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    let page = PAGES.includes(r) ? r : 'home';
    if (r === 'sport' && sportOf(arg)) { state.sport = arg; page = 'home'; }
    if (page === 'match' && state.arg !== arg) { state.mdTab = 'markets'; state.mdGroup = 'All'; }
    state.route = page; state.arg = arg;
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    const navKey = page === 'match' || page === 'league' ? null : page;
    $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === navKey));
    closeDrawer(); closeSlip(); closeSearch();
    document.body.dataset.page = page;
    if (page === 'home') renderHome();
    if (page === 'live') renderLive();
    if (page === 'sports') renderAZ($('#sportSearch').value);
    if (page === 'me') renderMe();
    if (page === 'jackpot') { renderJackpot(); tickCountdown(); }
    if (page === 'league') renderLeague(+arg);
    if (page === 'match') renderMatch(+arg);
    else window.scrollTo(0, 0);
  }

  const openSlip = () => { $('#betslip').classList.add('open'); $('#scrim').classList.add('on'); renderSlip(); };
  const closeSlip = () => { $('#betslip').classList.remove('open'); if (!$('#drawer').classList.contains('open')) $('#scrim').classList.remove('on'); renderSlip(); };
  const closeDrawer = () => { $('#drawer').classList.remove('open'); if (!$('#betslip').classList.contains('open')) $('#scrim').classList.remove('on'); };
  const openSearch = () => { $('#searchOv').classList.add('open'); renderSearch($('#searchInput').value); setTimeout(() => $('#searchInput').focus(), 50); };
  const closeSearch = () => $('#searchOv').classList.remove('open');
  const openModal = id => { $$('.modal').forEach(m => m.classList.remove('open')); $('#' + id).classList.add('open'); };
  const closeModals = () => $$('.modal').forEach(m => m.classList.remove('open'));

  function renderCurrent(keepScroll) {
    const y = window.scrollY;
    if (state.route === 'home') renderHome();
    if (state.route === 'live') renderLive();
    if (state.route === 'league') renderLeague(+state.arg);
    if (state.route === 'match') renderMatch(+state.arg, true);
    if (state.route === 'me') renderMe();
    if (keepScroll) window.scrollTo(0, y);
  }
  function renderAfterSlipChange() { renderCurrent(true); renderSlip(); }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a');
    if (!t) return;
    const href = t.getAttribute('href');
    if (t.tagName === 'A' && href === '#') e.preventDefault();
    const d = t.dataset;

    if (d.mid) return toggleSel(+d.mid, d.mk, d.ok);
    if (d.open) {
      e.preventDefault();
      if (d.open === 'depositModal') {
        if (!state.user) return openModal('loginModal');
        const w = d.mode === 'withdraw';
        $('#depTitle').textContent = w ? 'Withdraw' : 'Deposit'; $('#depBtn').textContent = w ? 'Withdraw' : 'Deposit';
        $('#depositForm').dataset.mode = w ? 'withdraw' : 'deposit';
      }
      closeDrawer(); closeSlip(); return openModal(d.open);
    }
    if (d.switch) { e.preventDefault(); return openModal(d.switch); }
    if ('close' in d) return closeModals();
    if ('back' in d) return history.length > 1 ? history.back() : go('home');
    if (d.sport) {
      if (t.closest('#liveSportTabs')) { state.liveSport = d.sport; return renderLive(); }
      state.sport = d.sport; return state.route === 'home' ? renderHome() : go('home');
    }
    if (d.list) { state.list = d.list; $$('[data-list]').forEach(b => b.classList.toggle('active', b === t)); return renderHome(); }
    if (d.filter === 'today') { state.list = 'today'; $$('[data-list]').forEach(b => b.classList.toggle('active', b.dataset.list === 'today')); renderHome(); return $('.list-tabs').scrollIntoView({ behavior: 'smooth' }); }
    if (d.market) { state.market[d.msport] = d.market; return renderCurrent(true); }
    if (d.bstype) { state.slipType = d.bstype; return renderSlip(); }
    if (d.rm) { state.slip.splice(+d.rm, 1); saveSlip(); return renderAfterSlipChange(); }
    if (d.add) { $('#bsStake').value = (+$('#bsStake').value || 0) + +d.add; return renderSlip(); }
    if (d.amt) { $('#depAmt').value = d.amt; return; }
    if (d.bets) { state.betsTab = d.bets; return renderMe(); }
    if (d.mdtab) { state.mdTab = d.mdtab; return renderMatch(+state.arg, true); }
    if (d.group) { state.mdGroup = d.group; return renderMatch(+state.arg, true); }
    if (d.collapse) { state.collapsed.has(d.collapse) ? state.collapsed.delete(d.collapse) : state.collapsed.add(d.collapse); return t.parentElement.classList.toggle('closed'); }
    if (d.az) { state.azOpen.has(d.az) ? state.azOpen.delete(d.az) : state.azOpen.add(d.az); return t.parentElement.classList.toggle('open'); }
    if (d.q) { $('#searchInput').value = d.q; return renderSearch(d.q); }
    if (d.jp) { state.jp[d.jp] === d.o ? delete state.jp[d.jp] : state.jp[d.jp] = d.o; return renderJackpot(); }
    if (d.cashout) {
      const b = state.bets.find(x => x.id === d.cashout), v = b && cashoutValue(b);
      if (!v) return;
      b.status = 'cashout'; b.paid = v; state.user.balance += v; saveBets(); saveUser();
      toast(`💰 Cashed out ${naira(v)}`); renderMe(); return renderAuth();
    }
    switch (t.id) {
      case 'menuBtn': $('#drawer').classList.add('open'); $('#scrim').classList.add('on'); break;
      case 'searchBtn': openSearch(); break;
      case 'searchClose': closeSearch(); break;
      case 'navSlip': e.preventDefault(); openSlip(); break;
      case 'slipPill': openSlip(); break;
      case 'bsClose': closeSlip(); break;
      case 'bsClear': state.slip = []; saveSlip(); renderAfterSlipChange(); break;
      case 'bsPlace': placeBet(); break;
      case 'bsBook': bookCode(); break;
      case 'mdFav': {
        const id = +state.arg, i = state.favs.indexOf(id);
        i > -1 ? state.favs.splice(i, 1) : state.favs.push(id); store.set('favs', state.favs);
        t.classList.toggle('on', i === -1); toast(i === -1 ? '★ Added to favourites' : 'Removed from favourites'); break;
      }
      case 'jpAuto':
        JP.forEach(m => {
          if (state.jp[m.id]) return;
          const o = m.map['1x2'], ps = ['1', 'X', '2'].map(k => 1 / (o[k].o || 99)), s = ps[0] + ps[1] + ps[2], u = Math.random() * s;
          state.jp[m.id] = u < ps[0] ? '1' : u < ps[0] + ps[1] ? 'X' : '2';
        });
        renderJackpot(); break;
      case 'jpClear': state.jp = {}; renderJackpot(); break;
      case 'jpSubmit':
        if (!state.user) { openModal('loginModal'); break; }
        if (state.user.balance < 100) { openModal('depositModal'); toast('Insufficient balance', 'err'); break; }
        state.user.balance -= 100; saveUser(); state.jp = {}; renderJackpot(); renderAuth();
        toast('🏆 Jackpot ticket submitted. Good luck!'); break;
    }
  });
  $('#logoutBtn').addEventListener('click', () => { state.user = null; store.del('user'); renderAuth(); renderMe(); toast('Logged out'); });
  $('#scrim').addEventListener('click', () => { closeSlip(); closeDrawer(); });
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); closeSlip(); closeDrawer(); closeSearch(); } });
  $('#bsStake').addEventListener('input', renderSlip);
  $('#bsBody').addEventListener('input', e => {
    const k = e.target.dataset.stake; if (k == null) return;
    const s = state.slip[+k]; s.stake = +e.target.value; saveSlip();
    e.target.nextElementSibling.textContent = 'Win ' + naira(s.stake * s.odd);
    const valid = state.slip.filter(x => !x.susp);
    $('#bsWin').textContent = naira(valid.reduce((a, x) => a + (+x.stake || 0) * x.odd, 0));
    $('#bsPlace').textContent = `Place Bet · ${naira(valid.reduce((a, x) => a + (+x.stake || 0), 0))}`;
  });
  $('#sportSearch').addEventListener('input', e => renderAZ(e.target.value));
  $('#searchInput').addEventListener('input', e => renderSearch(e.target.value));

  $$('form[data-auth]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const phone = f.phone.value.replace(/\D/g, '').replace(/^0/, '');
    if (phone.length < 10) return toast('Enter a valid mobile number', 'err');
    const reg = f.dataset.auth === 'register';
    const prev = store.get('user', null);
    state.user = !reg && prev && prev.phone === phone ? prev : { phone, balance: reg ? 0 : 25000, uid: Math.floor(1e7 + Math.random() * 9e7) };
    saveUser(); closeModals(); renderAuth(); renderCurrent(true);
    toast(reg ? '🎉 Welcome to LetBetAfrika! Deposit now to claim your 200% bonus.' : 'Welcome back! Demo balance ₦25,000');
  }));
  $('#depositForm').addEventListener('submit', e => {
    e.preventDefault();
    const amt = +$('#depAmt').value, w = e.target.dataset.mode === 'withdraw';
    if (amt < 100) return toast('Minimum amount is ₦100', 'err');
    if (w && amt > state.user.balance) return toast('Insufficient balance', 'err');
    state.user.balance += w ? -amt : amt; saveUser();
    closeModals(); renderAuth(); renderCurrent(true);
    toast(w ? `Withdrawal of ${naira(amt)} requested` : `✅ ${naira(amt)} deposited`);
  });
  $('#codeForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#codeInput').value.trim().toUpperCase(), sels = store.get('codes', {})[code];
    if (!sels) return toast('Booking code not found', 'err');
    state.slip = [];
    sels.forEach(({ mid, mk, ok }) => {
      const m = byId(mid), o = m?.map[mk]?.[ok];
      if (o && o.o) state.slip.push({ mid, mk, ok, odd: o.o, label: o.l, mname: m.mk.find(x => x.key === mk).name, match: `${m.home} vs ${m.away}`, live: m.live, stake: 100 });
    });
    saveSlip(); closeModals(); renderAfterSlipChange(); openSlip();
    toast(`Loaded ${state.slip.length} selection(s)`);
  });

  /* ---------------- Carousel ---------------- */
  const slides = $$('.slide'); let cur = 0;
  $('#dots').innerHTML = slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
  const show = i => { cur = (i + slides.length) % slides.length; $('#slides').style.transform = `translateX(-${cur * 100}%)`; $$('#dots i').forEach((d, k) => d.classList.toggle('on', k === cur)); };
  let auto = setInterval(() => show(cur + 1), 5000);
  let sx = 0;
  $('#carousel').addEventListener('touchstart', e => { sx = e.touches[0].clientX; clearInterval(auto); }, { passive: true });
  $('#carousel').addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); auto = setInterval(() => show(cur + 1), 5000); });

  /* ---------------- Live simulation ---------------- */
  function simTick() {
    const R = Math.random;
    MATCHES.filter(m => m.live).forEach(m => {
      if (!m.two) {
        if (m.minute < 90 && R() < 0.6) {
          m.minute++;
          [0, 1].forEach(s => {
            const l = s ? m.la : m.lh, st = m.st;
            if (R() < l / 90 * 1.4) { m.score[s]++; st.shots[s]++; st.sot[s]++; m.ev.push({ min: m.minute, side: s, type: 'goal' }); }
            if (R() < l * 0.07) { st.shots[s]++; if (R() < 0.35) st.sot[s]++; }
            if (R() < (s ? m.lc * 0.45 : m.lc * 0.55) / 90) st.corners[s]++;
            if (R() < 0.022) { st.yc[s]++; m.ev.push({ min: m.minute, side: s, type: 'yc' }); }
            st.att[s] += R() < l * 0.45 ? 1 : 0;
          });
          const p = Math.max(30, Math.min(70, m.st.poss[0] + Math.round((R() - 0.5) * 3)));
          m.st.poss = [p, 100 - p];
        }
      } else {
        m.prog = Math.min(0.98, m.prog + 0.004);
        if (m.sport === 'basketball') { if (R() < 0.5) m.score[0] += 1 + Math.floor(R() * 3); if (R() < 0.5) m.score[1] += 1 + Math.floor(R() * 3); }
        else if (R() < 0.04) m.score[R() < 0.5 ? 0 : 1]++;
        m.mu += (R() - 0.5) * 0.3;
      }
      computeMarkets(m, true);
    });
    syncSlipOdds();
    const y = window.scrollY;
    if (state.route === 'home') renderLiveStrip();
    else if (['live', 'match', 'league'].includes(state.route)) renderCurrent(false);
    window.scrollTo(0, y);
    renderSlip();
  }
  setInterval(simTick, 4000);

  /* ---------------- Init ---------------- */
  $('#yr').textContent = new Date().getFullYear();
  syncSlipOdds();
  renderRails(); renderAuth(); renderSlip();
  window.addEventListener('hashchange', route);
  route();
  setInterval(tickCountdown, 1000);
})();
