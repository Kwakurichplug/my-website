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
  /* ---------------- Country / currency ---------------- */
  const COUNTRIES = {
    NG: { code: 'NG', flag: 'ng', name: 'Nigeria', cur: '₦', curName: 'Naira', locale: 'en-NG', dial: '+234', ph: '801 234 5678', digits: 10,
      minStake: 100, defStake: 100, chips: [100, 500, 1000, 5000], dep: [1000, 5000, 10000, 50000], depDef: 1000, demo: 25000,
      jackpot: 50000000, jackpotShort: '₦50M', ticket: 100, bonusMax: 100000, referral: 1000, b1: 'img/banner-1.jpg', b3: 'img/banner-3.jpg' },
    GH: { code: 'GH', flag: 'gh', name: 'Ghana', cur: 'GH₵', curName: 'Cedis', locale: 'en-GH', dial: '+233', ph: '24 123 4567', digits: 9,
      minStake: 1, defStake: 5, chips: [1, 5, 10, 50], dep: [10, 50, 100, 500], depDef: 50, demo: 250,
      jackpot: 500000, jackpotShort: 'GH₵500K', ticket: 1, bonusMax: 1000, referral: 10, b1: 'img/banner-1-gh.jpg', b3: 'img/banner-3-gh.jpg' },
  };
  let CC = 'NG';
  try { CC = localStorage.getItem('lba_country') || 'NG'; } catch {}
  if (!COUNTRIES[CC]) CC = 'NG';
  const C = COUNTRIES[CC];
  const money = n => C.cur + Number(n || 0).toLocaleString(C.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const whole = n => C.cur + Number(n || 0).toLocaleString(C.locale);
  const naira = money;
  // each country keeps its own wallet, bets and slip
  const store = {
    get(k, d) { try { const v = localStorage.getItem('lba_' + CC + '_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('lba_' + CC + '_' + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem('lba_' + CC + '_' + k); } catch {} },
  };
  function applyCountry() {
    const short = n => n >= 1000 ? (n / 1000) + 'k' : String(n);
    const T = { curCode: CC === 'GH' ? 'GHS' : 'NGN', cur: C.cur, jackpot: whole(C.jackpot), jackpotShort: C.jackpotShort, ticket: whole(C.ticket), bonusMax: whole(C.bonusMax), referral: whole(C.referral) };
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T[el.dataset.t]; });
    const IMG = { b1: C.b1, b2: 'img/banner-2.jpg', b3: C.b3 };
    document.querySelectorAll('[data-img]').forEach(el => { el.style.backgroundImage = `url(${IMG[el.dataset.img]})`; });
    document.querySelectorAll('.cc-flag').forEach(el => { el.innerHTML = LBA.flag(C.flag); });
    document.querySelectorAll('[data-flagc]').forEach(el => { el.innerHTML = LBA.flag(el.dataset.flagc); });
    document.querySelectorAll('.cc-name').forEach(el => { el.textContent = `${C.name} (${C.cur})`; });
    document.querySelectorAll('.cc-code').forEach(el => { el.textContent = C.code; });
    document.querySelectorAll('.dial').forEach(el => { el.innerHTML = `${LBA.flag(C.flag)} ${C.dial}`; });
    document.querySelectorAll('input[name=phone]').forEach(el => { el.placeholder = C.ph; });
    document.querySelectorAll('.cc-opt').forEach(el => el.classList.toggle('on', el.dataset.cc === CC));
    document.getElementById('stakeChips').innerHTML = C.chips.map(v => `<button data-add="${v}">+${short(v)}</button>`).join('');
    const st = document.getElementById('bsStake'); st.min = C.minStake; if (!st.value) st.value = C.defStake;
    document.documentElement.lang = 'en-' + CC;
  }
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
    { id: 'vfootball', name: 'Virtual Football', em: '🎮', hidden: true },
  ];
  SPORTS.forEach(sp => { sp.em = LBA.sport(sp.id); });
  const VISIBLE = () => SPORTS.filter(s => !s.hidden);
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
  const FLAG_OF = { England: 'eng', Spain: 'es', Italy: 'it', Germany: 'de', France: 'fr', Nigeria: 'ng', Ghana: 'gh', 'South Africa': 'za', UEFA: 'eu', Europe: 'eu', USA: 'us' };
  LEAGUES.forEach((l, i) => { l.idx = i; l.full = `${l.country} · ${l.name}`; l.flag = FLAG_OF[l.country] ? LBA.flag(FLAG_OF[l.country]) : LBA.sport(l.sport); });

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

    add('1x2', '1X2', 'Main', 3, [['1', 'Home', H], ['X', 'Draw', D], ['2', 'Away', A]]);
    add('dc', 'Double Chance', 'Main', 3, [['1X', 'Home or Draw', H + D], ['12', 'Home or Away', H + A], ['X2', 'Draw or Away', D + A]]);
    if (m.live && rem > 0) {
      const L = (m.lh + m.la) * rem, pn = Math.exp(-L);
      add('next', `Next Goal (${sh + sa + 1})`, 'Main', 3, [['1', 'Home', (1 - pn) * m.lh / (m.lh + m.la)], ['none', 'None', pn], ['2', 'Away', (1 - pn) * m.la / (m.lh + m.la)]]);
    }
    add('dnb', 'Draw No Bet', 'Main', 2, [['1', 'Home', H / (H + A)], ['2', 'Away', A / (H + A)]]);
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
      add('1h1x2', '1st Half - 1X2', 'Half', 3, [['1', 'Home', h], ['X', 'Draw', d], ['2', 'Away', a]]);
      add('1hou', '1st Half - Over/Under', 'Half', 2, [0.5, 1.5].flatMap(l => [[`o${l}`, `Over ${l}`, o1(l)], [`u${l}`, `Under ${l}`, 1 - o1(l)]]));
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
    add('win', 'Winner', 'Main', 2, [['1', 'Home', pw], ['2', 'Away', 1 - pw]]);
    add('hcp', 'Handicap', 'Handicap', 2, P.hl.flatMap((h, i) => { const p = 1 - ncdf((-h - mu) / sd); return [[`h${i}1`, `1 (${h})`, p], [`h${i}2`, `2 (+${-h})`, 1 - p]]; }));
    add('tot', `Total ${P.unit}`, 'Totals', 2, P.tl.flatMap(l => { const p = 1 - ncdf((l - tm) / tsd); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
    return out;
  }

  // Which columns show in match lists for each sport
  function listMarkets(sport) {
    if (sport === 'football' || sport === 'vfootball') return [
      { id: '1x2', name: '1X2', mk: '1x2', outs: ['1', 'X', '2'], lab: ['1', 'X', '2'] },
      { id: 'dc', name: 'DC', mk: 'dc', outs: ['1X', '12', 'X2'], lab: ['1X', '12', 'X2'] },
      { id: 'ou', name: 'O/U 2.5', mk: 'ou', outs: ['o2.5', 'u2.5'], lab: ['Over', 'Under'] },
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
    sport: 'football', liveSport: 'all', list: 'highlights', market: {}, day: 'all', tx: store.get('tx', []), resSport: 'all',
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
  const shirt = name => `<span class="mh-shirt" style="--h:${hue(name)}"><svg viewBox="0 0 24 24"><path d="M8 3l-5 3 2 5 2-1v11h10V10l2 1 2-5-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/></svg></span>`;
  const crest = (name, big, sp) => LBA.crest(name, sp || 'football', big);
  const LOCK = '<svg class="lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const isSel = (id, mk, ok) => state.slip.some(s => s.mid === id && s.mk === mk && s.ok === ok);
  const liveLabel = m => {
    if (!m.two) return m.minute >= 90 ? "90+'" : m.minute === 45 ? 'HT' : m.minute + "'";
    if (m.sport === 'basketball') return 'Q' + Math.min(4, 1 + Math.floor(m.prog * 4));
    if (m.sport === 'tennis') return 'Set ' + (m.score[0] + m.score[1] + 1);
    return 'LIVE';
  };

  function oddBtn(m, mk, ok, label, style, short) {
    const o = m.map[mk]?.[ok];
    if (!o) return `<span class="odd void"></span>`;
    if (!o.o) return `<button class="odd ${style || ''} locked" disabled>${style === 'ob' ? `<span>${esc(short || o.l)}</span>` : ''}${LOCK}</button>`;
    if (style === 'tb' && !o) return '<span class="odd void"></span>';
    const cls = ['odd', style || '', isSel(m.id, mk, ok) ? 'sel' : '', m.flash[mk + '|' + ok] || ''].join(' ');
    const inner = style === 'ob'
      ? `<span>${esc(short || o.l)}</span><b>${o.o.toFixed(2)}</b>`
      : style === 'tb' ? `<b>${o.o.toFixed(2)}</b>`
      : `${label ? `<small>${esc(label)}</small>` : ''}<b>${o.o.toFixed(2)}</b>`;
    return `<button class="${cls}" data-mid="${m.id}" data-mk="${mk}" data-ok="${esc(ok)}">${inner}</button>`;
  }

  /* ---------------- Lists ---------------- */
  function renderSportTabs(el, active, liveOnly) {
    let list = VISIBLE();
    if (liveOnly) list = [{ id: 'all', name: 'All', em: LBA.sport('all') }, ...VISIBLE().filter(s => MATCHES.some(m => m.live && m.sport === s.id))];
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

  const isHot = m => LEAGUES[m.lg].top && m.id % 3 === 0;
  function matchRow(m, cfg, withLeague) {
    const meta = m.live
      ? `<span class="lv-clock"${m.two ? '' : ` data-clk="${m.id}"`}>${m.two ? liveLabel(m) : String(m.minute).padStart(2, '0') + ':' + String((m.id * 7) % 60).padStart(2, '0')}</span><span class="lv-half">${m.two ? '' : m.minute <= 45 ? 'H1' : 'H2'}</span>`
      : `${isHot(m) ? '<span class="hot">HOT</span>' : ''}<span>${new Date(m.kick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span><span>ID ${m.id}</span>`;
    const lg = LEAGUES[m.lg];
    const n = m.mk.reduce((acc, x) => acc + x.outs.filter(o => o.k).length, 0);
    return `<div class="ev${m.live ? ' is-live' : ''}${m.live && recentGoal(m) ? ' goal' : ''}" style="--n:${cfg.outs.length}">
      <div class="ev-meta">${meta}${withLeague ? `<span class="ev-lg">${esc(lg.country)} - ${esc(lg.name)}</span>` : ''}${state.favs.includes(m.id) ? '<span class="star">★</span>' : ''}</div>
      <div class="ev-body">
        <a class="ev-teams" href="#/match/${m.id}">
          <span><i>${esc(m.home)}</i>${m.live ? `<b class="${recentGoal(m) && m.goalSide === 0 ? 'pop' : ''}">${m.score[0]}</b>` : ''}</span>
          <span><i>${esc(m.away)}</i>${m.live ? `<b class="${recentGoal(m) && m.goalSide === 1 ? 'pop' : ''}">${m.score[1]}</b>` : ''}</span>
          <small>+${n} ›</small>
        </a>
        <div class="ev-odds">${cfg.outs.map(ok => oddBtn(m, cfg.mk, ok)).join('')}</div>
      </div>
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
        ${ms.map(m => matchRow(m, cfg, false)).join('')}
      </div>`;
    }).join('');
  }

  const fmtDay = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.toLocaleDateString([], { weekday: 'long' })}`; };
  function flatList(list, cfg) {
    let day = '', html = '';
    list.forEach(m => {
      const d = new Date(m.kick).toDateString();
      if (d !== day) { day = d; html += `<div class="day-sep" style="--n:${cfg.outs.length}"><span>${fmtDay(m.kick)}</span><div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div></div>`; }
      html += matchRow(m, cfg, true);
    });
    return html || '<div class="empty">No events for this filter.</div>';
  }
  function renderHome() {
    const big = MATCHES.filter(m => m.sport === 'football' && !m.finished && !m.live && LEAGUES[m.lg].top).sort((a, b) => a.kick - b.kick);
    const t1 = big[0], t2 = big[3] || big[1];
    const mt = m => m ? `<a class="tile tile-match" href="#/match/${m.id}"><span class="tm">${crest(m.home, 1, m.sport)}<em>vs</em>${crest(m.away, 1, m.sport)}</span><b>${esc(LBA.code(m.home))} vs ${esc(LBA.code(m.away))}</b></a>` : '';
    $('#tiles').innerHTML = `
      <a class="tile" href="#" data-open="registerModal" style="background-image:url(${C.b1})"><b>Welcome Bonus</b></a>
      ${mt(t1)}
      <a class="tile" href="#/virtuals" style="background-image:url(img/banner-2.jpg)"><b>Virtuals</b></a>
      ${mt(t2)}
      <a class="tile" href="#/jackpot" style="background-image:url(${C.b3})"><b>Jackpot</b></a>
      <a class="tile tile-game" href="#/games"><svg viewBox="0 0 24 24"><path d="M12 3c3 2 4 6 4 9l-4 4-4-4c0-3 1-7 4-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M8 16l-2 4 4-2M16 16l2 4-4-2"/></svg><b>Rocket Crash</b></a>`;
    const lgIdx = (c, n) => LEAGUES.find(l => l.country === c && l.name === n)?.idx;
    $('#catCards').innerHTML = [
      ["TODAY'S FOOTBALL", '#e5163a', 'data-cat="today"'],
      ['FOOTBALL IN NEXT 3 HOURS', '#7d838c', 'data-cat="3h"'],
      ['NIGERIA NPFL', '#0a7d3e', `href="#/league/${lgIdx('Nigeria', 'NPFL')}"`],
      ['GHANA PREMIER LEAGUE', '#ffc20e', `href="#/league/${lgIdx('Ghana', 'Premier League')}"`],
      ['ENGLAND PREMIER LEAGUE', '#3d1a6e', `href="#/league/${lgIdx('England', 'Premier League')}"`],
    ].map(([t, c, a]) => `<a class="cat" ${a.startsWith('href') ? a : 'href="#" ' + a} style="--c:${c}">${t}</a>`).join('');
    $('#hotTabs').innerHTML = `<button class="active">Matches</button><a href="#/games">Games</a><a href="#/codes">Codes</a><a href="#/virtuals">Virtuals</a><a href="#/jackpot">Jackpot</a>`;
    const hotLgs = LEAGUES.filter(l => l.sport === 'football' && MATCHES.some(m => m.lg === l.idx && !m.live && !m.finished));
    if (state.hotLg == null || !hotLgs.some(l => l.idx === state.hotLg)) state.hotLg = hotLgs[0] ? hotLgs[0].idx : null;
    const pl = $('#leagueChips'), px = pl.scrollLeft;
    pl.innerHTML = hotLgs.map(l => `<button class="lpill ${l.idx === state.hotLg ? 'active' : ''}" data-hlg="${l.idx}">${l.flag}<span>${esc(l.name)}</span></button>`).join('');
    pl.scrollLeft = px;
    const feat = MATCHES.filter(m => m.lg === state.hotLg && !m.live && !m.finished).sort((a, b) => a.kick - b.kick).slice(0, 6);
    const fe = $('#featured'), fx = fe.scrollLeft;
    fe.innerHTML = feat.map(m => {
      const [d, t] = fmtKick(m.kick, true);
      return `<div class="fcard">
        <div class="fc-top"><span class="hot">HOT</span><a href="#/league/${m.lg}">Football - ${esc(LEAGUES[m.lg].country)} - ${esc(LEAGUES[m.lg].name)}</a></div>
        <a class="fc-mid" href="#/match/${m.id}">
          <span class="fc-team">${crest(m.home, 1, m.sport)}<i>${esc(m.home)}</i></span>
          <span class="fc-time"><span class="fc-dt"><b>${t}</b><i></i><small>${d}</small></span><em>1X2</em></span>
          <span class="fc-team">${crest(m.away, 1, m.sport)}<i>${esc(m.away)}</i></span>
        </a>
        <div class="fc-odds">${['1', 'X', '2'].map(k => oddBtn(m, '1x2', k, null, 'ob', k)).join('')}</div>
      </div>`;
    }).join('');
    fe.scrollLeft = fx;
    renderLiveStrip();
    renderSportTabs($('#sportTabs'), state.sport);
    renderMarketTabs($('#marketTabs'), state.sport);
    const F = { all: 'All', today: 'Today', '3h': 'Next 3 hours', tomorrow: 'Tomorrow' };
    if (!F[state.list]) state.list = 'all';
    const hv = state.homeView || 'hl';
    $('#filterBar').innerHTML = `<button data-hview="hl" class="${hv === 'hl' ? 'active' : ''}">Highlights</button><button data-hview="today" class="${hv === 'today' ? 'active' : ''}">Today</button><button data-hview="countries" class="${hv === 'countries' ? 'active' : ''}">Countries</button>`
      + (state.list !== 'all' && hv === 'hl' ? `<button data-list="all" class="chip-x">${F[state.list]} ✕</button>` : '');
    $('#filterBar').hidden = false;
    $('#matchList').hidden = hv === 'countries'; $('#leagueAcc').hidden = hv !== 'countries';
    let list = MATCHES.filter(m => m.sport === state.sport && !m.live && !m.finished).sort((a, b) => a.kick - b.kick);
    const now = Date.now(), dayOf = ts => new Date(ts).toDateString();
    if (state.list === 'today' || hv === 'today') list = list.filter(m => dayOf(m.kick) === dayOf(now));
    if (state.list === 'tomorrow') list = list.filter(m => dayOf(m.kick) === dayOf(now + 864e5));
    if (state.list === '3h') list = list.filter(m => m.kick - now <= 3 * 36e5);
    $('#matchList').innerHTML = flatList(list.slice(0, 30), mktFor(state.sport));
    $('#leagueAcc').innerHTML = LEAGUES.filter(l => l.sport === state.sport).map(l => `<a class="lg-acc" href="#/league/${l.idx}"><i></i>${l.flag}<span>${esc(l.country)} - ${esc(l.name)}</span><b>${MATCHES.filter(m => m.lg === l.idx && !m.finished).length}</b></a>`).join('');
  }

  function renderLiveStrip() {
    const sports = [...new Set(MATCHES.filter(m => m.live).map(m => m.sport))];
    if (!state.hls || !sports.includes(state.hls)) state.hls = sports[0] || 'football';
    const el = $('#homeLiveTabs'), x = el.scrollLeft;
    el.innerHTML = sports.map(id => `<button data-hls="${id}" class="${id === state.hls ? 'active' : ''}">${sportOf(id).name}</button>`).join('');
    el.scrollLeft = x;
    renderMarketTabs($('#homeLiveMkt'), state.hls);
    const cfg = mktFor(state.hls);
    const live = MATCHES.filter(m => m.live && m.sport === state.hls).slice(0, 6);
    $('#liveStrip').innerHTML = `<div class="day-sep dark" style="--n:${cfg.outs.length}"><span></span><div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div></div>` + live.map(m => matchRow(m, cfg, true)).join('');
  }

  function renderLive() {
    renderSportTabs($('#liveSportTabs'), state.liveSport, true);
    const list = MATCHES.filter(m => m.live && (state.liveSport === 'all' || m.sport === state.liveSport));
    $('#liveCount').textContent = list.length + ' events';
    $('#liveList').innerHTML = groupRender(list, s => listMarkets(s)[0]);
  }

  function renderLeague(idx) {
    const lg = LEAGUES[idx]; if (!lg) return go('home');
    $('#lgSport').innerHTML = `${sportOf(lg.sport).em} ${sportOf(lg.sport).name} · ${esc(lg.country)}`;
    $('#lgTitle').innerHTML = `${lg.flag} ${esc(lg.name)}`;
    renderMarketTabs($('#lgMarketTabs'), lg.sport);
    const list = MATCHES.filter(m => m.lg === lg.idx && !m.finished).sort((a, b) => (b.live - a.live) || a.kick - b.kick);
    $('#lgList').innerHTML = groupRender(list, mktFor, true);
  }

  function renderRails() {
    $('#leagueRail').innerHTML = LEAGUES.filter(l => l.top).map(l => `<li><a href="#/league/${l.idx}">${l.flag} ${esc(l.name)}${l.country === 'England' || l.country === 'Nigeria' ? ` <small class="muted">${l.country}</small>` : ''}</a></li>`).join('');
    $('#sportRail').innerHTML = VISIBLE().map(s => `<li><a href="#/sport/${s.id}">${s.em} ${s.name}<i>${MATCHES.filter(m => m.sport === s.id).length}</i></a></li>`).join('');
  }

  function renderAZ(q = '') {
    q = q.trim().toLowerCase();
    $('#azList').innerHTML = VISIBLE().sort((a, b) => a.name.localeCompare(b.name)).map(s => {
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
    $('#mdSport').innerHTML = `${sp.em} ${sp.name} · ${esc(lg.country)}`;
    $('#mdLeague').innerHTML = `<a href="#/league/${lg.idx}">${esc(lg.name)}</a>`;
    $('#mdFav').classList.toggle('on', state.favs.includes(m.id));

    // Hero
    let mid;
    if (m.live) {
      mid = `<div class="mh-score${recentGoal(m) ? ' goal' : ''}"><span>${m.score[0]}</span><i>:</i><span>${m.score[1]}</span></div><div class="mh-status live">● ${liveLabel(m)}</div>`;
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
          <div class="mini-row"><span>${m.st.sot[0]}</span><span>Shots on target</span><span>${m.st.sot[1]}</span></div>
          <div class="mini-row"><span>${m.st.corners[0]}</span><span>Corners</span><span>${m.st.corners[1]}</span></div>
        </div>`;
    } else if (m.live) {
      bar = `<div class="mh-bar"><div class="mh-track"><i style="width:${m.prog * 100}%"></i></div></div>`;
    }
    const [kd, kt] = fmtKick(m.kick, true);
    const clock = m.live
      ? `<span class="mh-clock">${m.two ? liveLabel(m) : `<b data-clk="${m.id}">${String(m.minute).padStart(2, '0')}:00</b> ${m.minute <= 45 ? 'H1' : 'H2'}`}</span>`
      : `<span class="mh-clock pre">${kd} ${kt}</span>`;
    const bar2 = (name, sc, side) => `<div class="mh-row"><span class="mh-name">${crest(name, 0, m.sport)}<i>${esc(name)}</i></span>${m.live ? `<b class="mh-sc${recentGoal(m) && m.goalSide === side ? ' pop' : ''}">${sc}</b>` : ''}</div>`;
    $('#mdHero').innerHTML = `<a class="mh-lg" href="#/league/${lg.idx}">${esc(sp.name)} - ${esc(lg.country)} - ${esc(lg.name)}</a>
      <div class="mh-clockrow">${clock}<span class="mh-id">ID ${m.id}</span></div>
      ${bar2(m.home, m.score[0], 0)}${bar2(m.away, m.score[1], 1)}
      ${bar}`;

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
          ${['ou', 'hou', 'aou', 'cor', '1hou', 'tot'].includes(x.key)
            ? `<div class="mkt-body tbl"><span class="th"></span><span class="th">Over</span><span class="th">Under</span>${(() => { let h = ''; for (let i = 0; i + 1 < x.outs.length; i += 2) { const o = x.outs[i], u = x.outs[i + 1]; h += `<span class="line">${esc(o.l.replace(/^Over\s*/, ''))}</span>${oddBtn(m, x.key, o.k, null, 'tb')}${oddBtn(m, x.key, u.k, null, 'tb')}`; } return h; })()}</div>`
            : `<div class="mkt-body" style="--c:${x.cols}">${x.outs.map(o => o.k ? oddBtn(m, x.key, o.k, null, 'ob') : '<span class="odd void"></span>').join('')}</div>`}
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
    const legend = `<div class="slegend"><span>${crest(m.home, 0, m.sport)} ${esc(m.home)}</span><span>${esc(m.away)} ${crest(m.away, 0, m.sport)}</span></div>`;
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
      <div class="form-row">${crest(m.home, 0, m.sport)}<span>${esc(m.home)}</span><div class="pills">${pill(fh)}</div></div>
      <div class="form-row">${crest(m.away, 0, m.sport)}<span>${esc(m.away)}</span><div class="pills">${pill(fa)}</div></div>
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
    if (m.finished) return toast('This event has finished', 'err');
    const mkObj = m.mk.find(x => x.key === mk);
    const ix = state.slip.findIndex(s => s.mid === mid);
    if (ix > -1 && state.slip[ix].mk === mk && state.slip[ix].ok === ok) state.slip.splice(ix, 1);
    else {
      if (ix === -1 && state.slip.length >= 30) return toast('Maximum 30 selections', 'err');
      const sel = { mid, mk, ok, odd: o.o, label: o.l, mname: mkObj.name, match: `${m.home} vs ${m.away}`, live: m.live, stake: state.slip[ix]?.stake || C.defStake };
      if (ix > -1) { state.slip[ix] = sel; toast('Selection replaced – one pick per match'); } else state.slip.push(sel);
    }
    saveSlip(); renderAfterSlipChange();
  }

  function syncSlipOdds() {
    let changed = false;
    state.slip.forEach(s => {
      const m = byId(s.mid), o = m && !m.finished ? m.map[s.mk]?.[s.ok] : null;
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
    $('#pillCount').textContent = n;
    const valid = state.slip.filter(s => !s.susp);
    const total = valid.reduce((a, s) => a * s.odd, 1);
    const pill = n > 0 && !$('#betslip').classList.contains('open');
    $('#slipPill').classList.toggle('show', pill); $('#slipPill').classList.toggle('empty', n === 0); document.body.classList.toggle('has-pill', n > 0);
    if (state.slipType === 'multi' && n < 2) state.slipType = 'single';
    $$('.bs-tabs button').forEach(b => { b.classList.toggle('active', b.dataset.bstype === state.slipType); if (b.dataset.bstype === 'multi') b.disabled = n < 2; });
    const single = state.slipType === 'single';

    if (!n) {
      $('#bsBody').innerHTML = `<div class="bs-empty"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg><b>Your betslip is empty</b><span>Tap any odds to add a selection</span></div>`;
      $('#bsFoot').hidden = true; $('#bsBar').hidden = true; return;
    }
    $('#bsFoot').hidden = false; $('#bsBar').hidden = false;
    $('#bsBody').innerHTML = state.slip.map((s, k) => `<div class="bs-item${s.susp ? ' susp' : ''}">
      <button class="bs-rm" data-rm="${k}" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="bs-main">
        <div class="bs-l1"><span class="bs-sp">${sportOf(byId(s.mid)?.sport || 'football').em}</span><span class="bs-pick">${esc(s.label)}</span><b class="bs-odd ${s.chg || ''}">${s.susp ? LOCK : s.odd.toFixed(2)}</b></div>
        <a class="bs-l2" href="#/match/${s.mid}">${s.live ? '<em class="lv">Live</em>' : ''}${esc(s.match)}</a>
        <div class="bs-l3"><span>${esc(s.mname)}</span>${single && !s.susp ? `<input type="number" min="${C.minStake}" value="${s.stake}" data-stake="${k}" inputmode="decimal">` : ''}</div>
        ${s.susp ? '<div class="susp-msg">Market suspended – remove to continue</div>' : ''}
      </div>
    </div>`).join('');

    $('#boostBar').hidden = single; $('.row.boost').hidden = single;
    const stake = +$('#bsStake').value || 0;
    if (single) {
      const totStake = valid.reduce((a, s) => a + (+s.stake || 0), 0);
      $('#bsStakeLbl').textContent = `Stake per bet (${valid.length} bet${valid.length === 1 ? '' : 's'})`;
      $('#bsOdds').parentElement.hidden = true;
      $('#bsTotStake').textContent = money(totStake).replace(C.cur, '');
      const wins = valid.map(s => (+s.stake || 0) * s.odd);
      const lo = Math.min(...wins), hi = Math.max(...wins);
      $('#bsWin').textContent = valid.length > 1 ? `${fmtN(lo)} ~ ${fmtN(wins.reduce((a, w) => a + w, 0))}` : fmtN(hi);
      $('#bsPay').textContent = `About to pay ${fmtN(totStake)}`;
    } else {
      const c = valid.length, boost = BOOST(c), base = stake * total;
      const next = BOOST_STEPS.find(x => x > c);
      $('#bsStakeLbl').textContent = 'Stake';
      $('#bsOdds').parentElement.hidden = false;
      $('#bsOdds').textContent = total.toFixed(2);
      $('#bsTotStake').textContent = fmtN(stake);
      $('#bsBoost').textContent = boost + '%';
      $('#bbFill').style.width = Math.min(100, c / 20 * 100) + '%';
      $('#bbText').textContent = next ? `Add ${next - c} more for ${BOOST(next)}% boost` : 'Max boost unlocked';
      const winV = base + (base - stake) * boost / 100;
      if (window.Motion && state._lastWin != null && Math.abs(state._lastWin - winV) > 0.004) Motion.countUp($('#bsWin'), state._lastWin, winV, fmtN, 380);
      else $('#bsWin').textContent = fmtN(winV);
      state._lastWin = winV;
      $('#bsPay').textContent = `About to pay ${fmtN(stake)}`;
    }
  }
  const fmtN = n => Number(n || 0).toLocaleString(C.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function placeBet() {
    if (state.slip.some(s => s.susp)) return toast('Remove suspended selections first', 'err');
    if (!state.user) { openModal('loginModal'); return toast('Please login to place a bet', 'err'); }
    if (state.slip.length === 1 && state.slipType === 'multi') { state.slipType = 'single'; state.slip[0].stake = +$('#bsStake').value; }
    const single = state.slipType === 'single';
    const stake = single ? state.slip.reduce((a, s) => a + (+s.stake || 0), 0) : +$('#bsStake').value;
    if (single ? state.slip.some(s => (+s.stake || 0) < C.minStake) : stake < C.minStake) return toast('Minimum stake is ' + whole(C.minStake), 'err');
    if (LIVE) return livePlaceBet();
    if (stake > state.user.balance) { go('deposit'); return toast('Insufficient balance – please deposit', 'err'); }
    state.user.balance -= stake; addTx('Bet placed', -stake);
    const legs = state.slip.map(({ mid, mk, ok, odd, label, mname, match }) => ({ mid, mk, ok, odd, label, mname, match }));
    if (single) {
      legs.forEach((l, i) => { const st = +state.slip[i].stake; state.bets.unshift({ id: 'T' + Date.now().toString(36).toUpperCase() + i, at: Date.now(), type: 'Single', legs: [l], stake: st, odds: l.odd, win: st * l.odd, status: 'open' }); });
    } else {
      const total = legs.reduce((a, l) => a * l.odd, 1), boost = BOOST(legs.length), base = stake * total;
      state.bets.unshift({ id: 'T' + Date.now().toString(36).toUpperCase(), at: Date.now(), type: `Multiple · ${legs.length} legs`, legs, stake, odds: total, boost, win: base + (base - stake) * boost / 100, status: 'open' });
    }
    state.slip = []; state.slipType = 'multi'; saveSlip(); saveUser(); saveBets();
    toast('Bet placed successfully');
    closeSlip(); renderAfterSlipChange(); renderAuth();
  }

  function bookCode() {
    if (state.slip.some(s => s.susp)) return toast('Remove suspended selections first', 'err');
    if (LIVE) { API.bets.book(state.slip.map(s => ({ eventId: s.mid, market: s.mk, outcome: s.ok }))).then(code => { navigator.clipboard?.writeText(code).catch(() => {}); toast(`Booking code ${code} copied – share it with friends`); }).catch(e => toast(apiErr(e), 'err')); return; }
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
  function betsHTML() {
    const u = state.user;
    const list = state.bets.filter(b => state.betsTab === 'open' ? b.status === 'open' : b.status !== 'open');
    const tabs = `<div class="list-tabs"><button data-bets="open" class="${state.betsTab === 'open' ? 'active' : ''}">Open Bets (${state.bets.filter(b => b.status === 'open').length})</button><button data-bets="settled" class="${state.betsTab !== 'open' ? 'active' : ''}">Settled</button></div>`;
    if (!u) return `<div class="empty">Log in to see your bets.<br><button class="btn btn-accent sm mt" data-open="loginModal">Log in</button></div>`;
    return tabs + (!list.length ? `<div class="empty">No ${state.betsTab} bets yet.<br><a class="btn btn-ghost sm mt" href="#/home">Browse matches</a></div>`
      : list.map(b => {
        const co = b.status === 'open' ? (LIVE ? b.cashout : cashoutValue(b)) : null;
        return `<div class="bet-card">
          <a class="bh" href="#/bet/${encodeURIComponent(b.id)}"><span><b>${b.type}</b><br><small>${new Date(b.at).toLocaleString()} · ${b.id}</small></span><span class="status ${b.status}">${b.status === 'cashout' ? 'CASHED OUT' : b.status.toUpperCase()}</span></a>
          ${b.legs.map(l => { const r = LIVE ? l.result : legResult(l), m = byId(l.mid); return `<a class="bl" href="${m && m.finished ? '#/results' : '#/match/' + l.mid}"><span>${esc(l.match)}${m && m.finished ? ` <small class="ftag">FT ${m.ft[0]}-${m.ft[1]}</small>` : ''}<br><small class="muted">${esc(l.mname)}: <b>${esc(l.label)}</b></small></span><b class="lr ${r || ''}">${l.odd.toFixed(2)}</b></a>`; }).join('')}
          <div class="bf"><span>Stake ${naira(b.stake)}<br><small class="muted">Odds ${b.odds.toFixed(2)}${b.boost ? ` · +${b.boost}% boost` : ''}</small></span><span class="${b.status === 'lost' ? 'lostc' : 'accent'}">${b.status === 'cashout' ? 'Returned ' + naira(b.paid) : b.status === 'won' ? 'Paid ' + naira(b.paid) : b.status === 'void' ? 'Refunded ' + naira(b.paid) : b.status === 'lost' ? 'Lost' : 'To win ' + naira(b.win)}</span></div>
          ${b.status === 'open' ? `<button class="btn ${co ? 'btn-gold' : 'btn-ghost'} block mt" data-cashout="${b.id}" ${co ? '' : 'disabled'}>${co ? 'Cashout ' + naira(co) : 'Cashout unavailable'}</button>` : ''}
        </div>`;
      }).join(''));
  }
  function renderMe() {
    const u = state.user;
    $('#meName').textContent = u ? C.dial + ' ' + u.phone : 'Login to View';
    $('#meUserLink').dataset.open = u ? '' : 'loginModal';
    $('#meSub').textContent = u ? `ID ${u.uid || '—'}` : '';
    $('#meBal').textContent = u ? money(u.balance) : `${C.cur} --`;
    $('#meLoyal').textContent = u ? 'Member · Bronze' : 'Log in to join';
    $('#meVer').textContent = u ? (u.verified ? 'Verified' : 'Not verified') : '';
    const open = state.bets.filter(b => b.status === 'open').length;
    $('#meOpenCnt').textContent = u && open ? open : '';
    $('#meMsgDot').hidden = !u;
    $('#logoutBtn').hidden = !u;
    if (state.route === 'acct' && state.arg === 'bets') $('#acBody').innerHTML = betsHTML();
    const nb = $('#navOpen'); if (nb) nb.textContent = u && open ? open : '';
  }

  let lastBal = null;
  function renderAuth() {
    const prevBal = lastBal;
    lastBal = state.user ? state.user.balance : null;
    $('#authArea').innerHTML = state.user
      ? `<a class="balance" href="#/me"><small>Balance</small><b>${naira(state.user.balance)}</b></a><button class="btn btn-accent sm dep" data-open="depositModal" aria-label="Deposit"><span class="dep-full">Deposit</span><span class="dep-plus">+</span></button>`
      : `<button class="btn btn-accent sm" data-open="registerModal">Join Now</button><button class="btn btn-ghost sm" data-open="loginModal">Log in</button>`;
    if (state.user && prevBal != null && prevBal !== state.user.balance && window.Motion) Motion.countUp($('.balance b'), prevBal, state.user.balance, money);
  }

  /* ---------------- Jackpot ---------------- */
  const JP = MATCHES.filter(m => m.sport === 'football' && !m.live).sort((a, b) => a.kick - b.kick).slice(0, 12);
  function renderJackpot() {
    $('#jackpotList').innerHTML = JP.map((m, k) => `<div class="jp-row">
      <span class="n">${k + 1}</span>
      <div class="t"><small class="muted">${league(m).flag} ${esc(league(m).name)} · ${fmtKick(m.kick)}</small><span>${crest(m.home)}${esc(m.home)}</span><span>${crest(m.away)}${esc(m.away)}</span></div>
      <div class="opts">${['1', 'X', '2'].map(o => `<button data-jp="${m.id}" data-o="${o}" class="${state.jp[m.id] === o ? 'sel' : ''}">${o}</button>`).join('')}</div>
    </div>`).join('');
    const n = Object.keys(state.jp).length;
    $('#jpPicked').innerHTML = `<b>${n}</b>/12 picked`;
    $('#jpSubmit').disabled = n < 12;
  }
  function tickCountdown() {
    if (window.Pages) return Pages.tick();
    if (state.route !== 'jackpot') return;
    const end = new Date(); end.setDate(end.getDate() + ((6 - end.getDay() + 7) % 7 || 7)); end.setHours(15, 0, 0, 0);
    let s = Math.max(0, (end - Date.now()) / 1000 | 0);
    $('#countdown').innerHTML = [['Days', 86400], ['Hrs', 3600], ['Min', 60], ['Sec', 1]].map(([l, d]) => { const v = s / d | 0; s -= v * d; return `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`; }).join('');
  }

  /* ---------------- Search ---------------- */
  function renderSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { $('#searchRes').innerHTML = `<p class="muted pad">Popular searches</p><div class="tags">${['Arsenal', 'Real Madrid', 'Enyimba', 'Lakers', 'Kotoko', 'Sundowns'].map(t => `<button class="tag-btn" data-q="${t}">${t}</button>`).join('')}</div>`; return; }
    const res = MATCHES.filter(m => !m.finished && (m.home + ' ' + m.away + ' ' + league(m).full).toLowerCase().includes(q)).slice(0, 30);
    $('#searchRes').innerHTML = res.length ? res.map(m => `<a class="sr" href="#/match/${m.id}">
      <span class="sr-sp">${sportOf(m.sport).em}</span>
      <span class="sr-t"><b>${esc(m.home)} vs ${esc(m.away)}</b><small class="muted">${league(m).flag} ${esc(league(m).full)} · ${m.live ? '<span class="live-t">LIVE ' + liveLabel(m) + '</span>' : fmtKick(m.kick)}</small></span>
      <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></a>`).join('') : `<div class="empty">No matches for “${esc(q)}”</div>`;
  }


  function notifyGoal(m) {
    const mine = state.slip.some(x => x.mid === m.id) || state.bets.some(b => b.status === 'open' && b.legs.some(l => l.mid === m.id)) || (state.route === 'match' && +state.arg === m.id);
    if (mine && window.Motion) Motion.goal(`<b>GOAL!</b> ${esc(m.home)} <span class="gt-sc">${m.score[0]} - ${m.score[1]}</span> ${esc(m.away)} <i>${m.minute}'</i>`);
  }
  const recentGoal = m => m.goalAt && Date.now() - m.goalAt < 4500;

  /* ---------------- Match lifecycle & settlement ---------------- */
  const RESULTS = [];
  function finishMatch(m) {
    m.live = false; m.finished = true; m.endAt = Date.now(); m.ft = [...m.score];
    if (!m.two) {
      const g = side => m.ev.filter(e => e.type === 'goal' && e.side === side && e.min <= 45).length;
      m.ht = [g(0), g(1)]; m.ftc = m.st.corners[0] + m.st.corners[1];
    } else {
      const P = TW[m.sport] || TW.default;
      m.ftTotal = m.sport === 'basketball' ? m.ft[0] + m.ft[1] : Math.round(P.T * m.tf + (Math.random() - 0.5) * 2 * P.sd);
    }
    RESULTS.unshift(m);
  }
  // when live football gets thin, the next scheduled match kicks off
  function kickOffs() {
    if (LIVE) return;
    const liveFb = MATCHES.filter(m => m.live && m.sport === 'football').length;
    if (liveFb >= 8) return;
    const next = MATCHES.filter(m => m.sport === 'football' && !m.live && !m.finished).sort((a, b) => a.kick - b.kick)[0];
    if (!next || JP.includes(next)) return;
    next.live = true; next.minute = 1; next.kick = Date.now(); next.score = [0, 0];
    computeMarkets(next, false);
  }
  function legResult(l) {
    const m = byId(l.mid); if (!m || !m.finished) return null;
    const [h, a] = m.ft, d = h - a, t = h + a, ok = l.ok;
    const ou = (v, k) => { const L = parseFloat(k.slice(1)); return k[0] === 'o' ? v > L : v < L; };
    const r3 = (x, y) => x > y ? '1' : x === y ? 'X' : '2';
    let w;
    if (!m.two) {
      switch (l.mk) {
        case '1x2': w = r3(h, a) === ok; break;
        case 'dc': w = ok.includes(r3(h, a)); break;
        case 'dnb': if (d === 0) return 'void'; w = r3(h, a) === ok; break;
        case 'gg': w = (h > 0 && a > 0) === (ok === 'gg'); break;
        case 'ou': w = ou(t, ok); break;
        case 'hou': w = ou(h, ok); break;
        case 'aou': w = ou(a, ok); break;
        case 'cor': w = ou(m.ftc, ok); break;
        case '1hou': w = ou(m.ht[0] + m.ht[1], ok); break;
        case 'oe': w = (t % 2 === 1) === (ok === 'odd'); break;
        case '1h1x2': w = r3(m.ht[0], m.ht[1]) === ok; break;
        case 'htft': w = r3(m.ht[0], m.ht[1]) + '/' + r3(h, a) === ok; break;
        case 'cs': w = ok === 'oth' ? (h > 4 || a > 4) : ok === h + '-' + a; break;
        case 'eh-1': w = (d >= 2 ? '1' : d === 1 ? 'X' : '2') === ok; break;
        case 'eh+1': w = (d >= 0 ? '1' : d === -1 ? 'X' : '2') === ok; break;
        case 'next': {
          const n = +((l.mname.match(/\((\d+)\)/) || [0, 1])[1]);
          const goal = m.ev.filter(e => e.type === 'goal').sort((x, y) => x.min - y.min)[n - 1];
          w = goal ? (goal.side ? '2' : '1') === ok : ok === 'none'; break;
        }
        default: return 'void';
      }
    } else {
      const P = TW[m.sport] || TW.default;
      if (l.mk === 'win') { if (d === 0) return 'void'; w = (d > 0 ? '1' : '2') === ok; }
      else if (l.mk === 'hcp') { const cover = d + P.hl[+ok[1]] > 0; w = ok.endsWith('1') ? cover : !cover; }
      else if (l.mk === 'tot') w = ou(m.ftTotal, ok);
      else return 'void';
    }
    return w ? 'won' : 'lost';
  }
  function settleBets() {
    if (LIVE) return;
    let changed = false;
    state.bets.filter(b => b.status === 'open').forEach(b => {
      const rs = b.legs.map(legResult);
      if (rs.includes('lost')) { b.status = 'lost'; b.paid = 0; b.settledAt = Date.now(); changed = true; return; }
      if (!rs.every(Boolean)) return;
      const odds = b.legs.reduce((acc, l, i) => acc * (rs[i] === 'void' ? 1 : l.odd), 1);
      const base = b.stake * odds;
      b.paid = r2(b.boost && rs.every(r => r === 'won') ? base + (base - b.stake) * b.boost / 100 : base);
      b.status = rs.every(r => r === 'void') ? 'void' : 'won'; b.settledAt = Date.now(); changed = true;
      if (state.user) { state.user.balance += b.paid; addTx(b.status === 'won' ? 'Winnings' : 'Refund', b.paid); }
      if (b.status === 'won') { toast(`You won ${money(b.paid)} 🎉`); if (window.Motion) Motion.confetti(); }
    });
    if (changed) { saveBets(); saveUser(); renderAuth(); if (state.route === 'me') renderMe(); }
  }
  function addTx(type, amt, extra) {
    if (!state.user) return;
    state.tx.unshift({ at: Date.now(), type, amt: r2(amt), bal: r2(state.user.balance), ...(extra || {}) });
    state.tx = state.tx.slice(0, 200); store.set('tx', state.tx);
  }
  function updateLiveBadges() {
    const n = MATCHES.filter(m => m.live).length;
    const nl = $('#navLive'); if (nl) nl.textContent = n; $('#liveCountHome').textContent = n;
  }

  /* ---------------- Virtual football ---------------- */
  const VTEAMS = ['Lagos City', 'Accra United', 'Kumasi Stars', 'Abuja Kings', 'Kano Falcons', 'Tema Mariners', 'Ibadan Lions', 'Takoradi Sharks', 'Port Harcourt Rivers', 'Tamale Eagles', 'Benin Royals', 'Sunyani Leopards'];
  const VLG = LEAGUES.length;
  LEAGUES.push({ sport: 'vfootball', name: 'Virtual League', country: 'LetBet Virtuals', flag: LBA.sport('vfootball'), idx: VLG, full: 'LetBet Virtual League', teams: VTEAMS });
  const VR_LEN = 120000;
  const VR = { round: 1000 + Math.floor(Date.now() / VR_LEN) % 9000, endsAt: 0, ids: [], last: [], lastRound: null };
  function vNewRound() {
    VR.round++; VR.endsAt = Date.now() + VR_LEN; VR.ids = [];
    const t = [...VTEAMS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 6; i++) {
      const m = { id: nextId++, sport: 'vfootball', lg: VLG, home: t[2 * i], away: t[2 * i + 1], live: false, kick: VR.endsAt,
        score: [0, 0], minute: 0, prog: 0, ev: [], flash: {}, two: false, virtual: true, round: VR.round,
        lh: 0.7 + Math.random() * 1.4, la: 0.5 + Math.random() * 1.2, lc: 8 + Math.random() * 4,
        st: { poss: [50, 50], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], att: [0, 0] } };
      computeMarkets(m, false); MATCHES.push(m); VR.ids.push(m.id);
    }
  }
  function vEndRound() {
    const Rn = Math.random;
    VR.last = VR.ids.map(id => {
      const m = byId(id);
      const h1 = samplePois(m.lh * 0.45, Rn), a1 = samplePois(m.la * 0.45, Rn), h2 = samplePois(m.lh * 0.55, Rn), a2 = samplePois(m.la * 0.55, Rn);
      m.ht = [h1, a1]; m.ft = [h1 + h2, a1 + a2]; m.score = [...m.ft]; m.ftc = samplePois(m.lc, Rn);
      m.finished = true; m.endAt = Date.now(); RESULTS.unshift(m); return m;
    });
    VR.lastRound = VR.round;
    settleBets(); vNewRound(); syncSlipOdds(); renderSlip();
    if (state.route === 'virtuals') renderVirtuals();
  }
  function vTick() {
    if (Date.now() >= VR.endsAt) return vEndRound();
    if (state.route !== 'virtuals') return;
    const left = Math.max(0, VR.endsAt - Date.now()), sec = Math.ceil(left / 1000);
    $('#vClock').textContent = `${String(sec / 60 | 0).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    $('#vBar').style.width = (100 - left / VR_LEN * 100) + '%';
  }
  function resRow(m) {
    return `<div class="res-row"><span class="rh"><span>${esc(m.home)}</span>${crest(m.home, 0, m.sport)}</span><b class="rs">${m.ft[0]} - ${m.ft[1]}</b><span class="ra">${crest(m.away, 0, m.sport)}<span>${esc(m.away)}</span></span>${m.ht ? `<small class="rht">HT ${m.ht[0]}-${m.ht[1]}</small>` : ''}</div>`;
  }
  function renderVirtuals() {
    $('#vRound').textContent = '#' + VR.round;
    renderMarketTabs($('#vMarketTabs'), 'vfootball');
    $('#vList').innerHTML = groupRender(VR.ids.map(byId), mktFor, true);
    $('#vLastRound').textContent = VR.lastRound ? 'Round #' + VR.lastRound : 'waiting for first result';
    $('#vResults').innerHTML = VR.last.length ? `<div class="res-block">${VR.last.map(resRow).join('')}</div>` : '<div class="empty">Results appear here when the countdown ends.</div>';
    vTick();
  }

  /* ---------------- Results ---------------- */
  function seedResults() {
    const r = mkRng(4242), yd = new Date(); yd.setHours(0, 0, 0, 0);
    LEAGUES.filter(l => l.sport === 'football').forEach(lg => {
      for (let i = 0; i < 3; i++) {
        const t = [...lg.teams].sort(() => r() - 0.5), lh = 0.8 + r() * 1.2, la = 0.6 + r() * 1;
        const h1 = samplePois(lh * 0.45, r), a1 = samplePois(la * 0.45, r);
        const ft = [h1 + samplePois(lh * 0.55, r), a1 + samplePois(la * 0.55, r)];
        RESULTS.push({ id: 'p' + lg.idx + i, sport: 'football', lg: lg.idx, home: t[0], away: t[1], ft, ht: [h1, a1], past: true,
          endAt: yd.getTime() - (1 + Math.floor(r() * 2)) * 864e5 + (13 + Math.floor(r() * 9)) * 36e5 });
      }
    });
  }
  function renderResults() {
    const sports = ['all', ...new Set(RESULTS.map(m => m.sport))];
    $('#resTabs').innerHTML = sports.map(id => `<button data-res="${id}" class="${id === state.resSport ? 'active' : ''}">${id === 'all' ? 'All' : sportOf(id).name}</button>`).join('');
    const list = RESULTS.filter(m => state.resSport === 'all' || m.sport === state.resSport).sort((a, b) => b.endAt - a.endAt);
    $('#resCount').textContent = list.length + ' events';
    const dayLbl = ts => { const d = new Date(ts).toDateString(); return d === new Date().toDateString() ? 'Today' : d === new Date(Date.now() - 864e5).toDateString() ? 'Yesterday' : new Date(ts).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }); };
    const byDay = new Map();
    list.forEach(m => { const k = dayLbl(m.endAt); if (!byDay.has(k)) byDay.set(k, new Map()); const g = byDay.get(k); if (!g.has(m.lg)) g.set(m.lg, []); g.get(m.lg).push(m); });
    $('#resList').innerHTML = list.length ? [...byDay].map(([day, g]) => `<div class="res-day">${day}</div>` + [...g].map(([lgi, ms]) =>
      `<div class="res-block"><div class="league-head"><span class="lh-name"><span class="flag">${LEAGUES[lgi].flag}</span><span class="lh-t">${esc(LEAGUES[lgi].full)}</span></span></div>${ms.map(resRow).join('')}</div>`).join('')).join('')
      : '<div class="empty">No results yet.</div>';
  }

  /* ---------------- Games lobby ---------------- */
  function renderGames() { window.Games && Games.renderLobby(C.name); }

  /* ---------------- Account sub-pages ---------------- */
  const ACCT = { bets: 'Bet History', how: 'How to Play', tx: 'Transaction Records', bonus: 'Bonuses', refer: 'Refer & Earn', messages: 'Messages', verify: 'Verify ID', security: 'Change Password', limits: 'Responsible Gambling', help: 'Help & Support' };
  function renderAcct(sec) {
    if (!ACCT[sec]) return go('me');
    if (LIVE && sec === 'tx' && state.user && Date.now() - (renderAcct._txAt || 0) > 4000) {
      renderAcct._txAt = Date.now();
      API.wallet.transactions().then(l => { state.tx = l.map(t => ({ at: new Date(t.at).getTime(), type: { deposit: 'Deposit', withdrawal: 'Withdrawal', bet: 'Bet placed', win: 'Winnings', refund: 'Refund', cashout: 'Cashout', bonus: 'Bonus', adjustment: 'Adjustment', transfer_out: 'Transfer to friend', transfer_in: 'Received from friend', game_bet: 'Game stake', game_win: 'Game win' }[t.type] || t.type, amt: t.amount, bal: t.balance, ref: t.ref ? String(t.ref).slice(0, 8).toUpperCase() : undefined })); if (state.route === 'acct' && state.arg === 'tx') renderAcct('tx'); }).catch(() => {});
    }
    if (LIVE && sec === 'bets' && state.user) liveBets().then(() => { if (state.route === 'acct' && state.arg === 'bets') $('#acBody').innerHTML = betsHTML(); });
    $('#acTitle').textContent = ACCT[sec];
    const u = state.user;
    const needLogin = !['help', 'limits', 'how', 'bets'].includes(sec) && !u;
    if (needLogin) { $('#acBody').innerHTML = `<div class="empty">Please login to continue.<br><button class="btn btn-accent sm mt" data-open="loginModal">Login</button></div>`; return; }
    const H = {
      bets: () => betsHTML(),
      how: () => `<div class="card-pad how">${[
        ['1', 'Pick your odds', 'Tap any price on a match. It goes into your betslip.'],
        ['2', 'Single or multiple', 'Bet each pick on its own, or combine 3+ picks for an Acca Win Boost.'],
        ['3', 'Enter your stake', `Minimum stake is ${whole(C.minStake)}. Your potential win updates as you type.`],
        ['4', 'Place your bet', 'Log in and tap Place Bet. Follow it live under Open Bets.'],
        ['5', 'Cash out or collect', 'Take a cashout early, or let it ride. Winnings land in your balance automatically.']]
        .map(([n, t, d]) => `<div class="how-step"><b>${n}</b><div><strong>${t}</strong><p>${d}</p></div></div>`).join('')}</div>`,
      tx: () => {
        const f = state.txFilter || 'all';
        const F = { all: 'All', in: 'Money in', out: 'Money out' };
        const list = state.tx.filter(t => f === 'all' || (f === 'in' ? t.amt > 0 : t.amt < 0));
        return `<div class="market-tabs">${Object.entries(F).map(([k, v]) => `<button data-txf="${k}" class="${k === f ? 'active' : ''}">${v}</button>`).join('')}</div>
          <div class="tx-list">${list.length ? list.map(t => `<div class="tx"><div><b>${t.type}${t.status ? ` <em class="tx-st ${t.status}">${t.status === 'pending' ? 'Pending' : t.status === 'failed' ? 'Failed' : 'Successful'}</em>` : ''}</b><small>${new Date(t.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${t.method ? ' · ' + esc(t.method) : ''}</small>${t.ref ? `<small class="tx-ref">Ref ${esc(t.ref)}</small>` : ''}</div><div class="tx-r"><b class="${t.amt > 0 ? 'pos' : 'neg'}">${t.amt > 0 ? '+' : '−'}${money(Math.abs(t.amt))}</b><small>Bal ${money(t.bal)}</small></div></div>`).join('') : '<div class="empty">No transactions yet. Deposits, bets and winnings appear here.</div>'}</div>`;
      },
      bonus: () => `<div class="card-list">
          <div class="bonus"><div><b>200% Welcome Bonus</b><small>Up to ${whole(C.bonusMax)} on your first deposit</small></div><span class="status ${state.tx.some(t => t.type === 'Deposit') ? 'open' : 'won'}">${state.tx.some(t => t.type === 'Deposit') ? 'ACTIVE' : 'AVAILABLE'}</span></div>
          <div class="bonus"><div><b>Acca Win Boost</b><small>5% to 1000% extra on 3+ selection multiples</small></div><span class="status open">ACTIVE</span></div>
          <div class="bonus"><div><b>Free Bets</b><small>You have no free bets right now</small></div><span class="status lost">NONE</span></div>
        </div>`,
      refer: () => { const code = 'LBA' + String(u.uid).slice(-5); const msg = encodeURIComponent(`Join me on LetBetAfrika and get a 200% welcome bonus. Use my code ${code}`);
        return `<div class="card-pad refer"><p>Invite friends and get <b>${whole(C.referral)}</b> when they join and place their first bet.</p>
          <div class="code-box"><span>Your code</span><b>${code}</b><button class="btn btn-accent sm" data-copy="${code}">Copy</button></div>
          <a class="btn btn-ghost block mt" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">Share on WhatsApp</a>
          <div class="ref-stats"><div><b>0</b><small>Friends joined</small></div><div><b>${whole(0)}</b><small>Earned</small></div></div></div>`; },
      messages: () => `<div class="card-list">${[
          ['Welcome to LetBetAfrika', 'Your account is ready. Make your first deposit to unlock the 200% welcome bonus.'],
          ['Acca Win Boost is on', 'Add 3 or more selections to a multiple and get up to 1000% extra winnings.'],
          ['Play responsibly', 'Set deposit limits any time under Responsible Gambling.']].map(([t, b], i) => `<div class="msg ${i ? '' : 'unread'}"><b>${t}</b><p>${b}</p><small>${new Date(Date.now() - i * 864e5).toLocaleDateString()}</small></div>`).join('')}</div>`,
      verify: () => u.verified ? `<div class="empty"><b>Your account is verified ✔</b><br>${esc(u.fullName || '')}</div>` : `<form class="card-pad form" data-acform="verify">
          <p class="muted">Verify your identity to withdraw winnings.</p>
          <label>Full name<input name="name" required placeholder="As shown on your ID"></label>
          <label>Date of birth<input name="dob" type="date" required></label>
          <label>ID type<select name="idt">${(CC === 'GH' ? ['Ghana Card', 'Passport', "Driver's Licence", "Voter's ID"] : ['NIN', 'BVN', 'International Passport', "Driver's Licence", "Voter's Card"]).map(x => `<option>${x}</option>`).join('')}</select></label>
          <label>ID number<input name="idn" required></label>
          <button class="btn btn-accent block">Submit for verification</button></form>`,
      security: () => `<form class="card-pad form" data-acform="security">
          <label>Current password<input type="password" name="cur" required></label>
          <label>New password<input type="password" name="pw1" minlength="6" required></label>
          <label>Confirm new password<input type="password" name="pw2" minlength="6" required></label>
          <button class="btn btn-accent block">Update password</button></form>`,
      limits: () => { const L = (u && u.limits) || {};
        return `<form class="card-pad form" data-acform="limits">
          <p class="muted">Set limits to stay in control. Lower limits apply straight away.</p>
          <label>Deposit limit<select name="period">${['Daily', 'Weekly', 'Monthly'].map(x => `<option ${L.period === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Amount (${C.cur})<input name="amt" type="number" min="${C.minStake}" value="${L.amt || ''}" placeholder="No limit"></label>
          <label>Session reminder<select name="rem">${['Off', 'Every 30 minutes', 'Every hour', 'Every 2 hours'].map(x => `<option ${L.rem === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <button class="btn btn-accent block">Save limits</button>
          <h4 class="sh" style="margin-top:18px">Take a break</h4>
          <div class="chips">${['24 hours', '7 days', '30 days', '6 months'].map(x => `<button type="button" data-break="${x}">${x}</button>`).join('')}</div>
        </form>`; },
      help: () => `<div class="card-pad"><h4 class="sh">Frequently asked questions</h4>${[
          ['How do I deposit?', 'Tap Deposit, choose an amount and pay by card, bank transfer, USSD or mobile money.'],
          ['How long do withdrawals take?', 'Most withdrawals are paid within minutes once your account is verified.'],
          ['What is a booking code?', 'A code that loads a saved betslip. Share yours from the betslip or load one from the menu.'],
          ['How does Cashout work?', 'Open bets show a cashout value that follows the live odds. Tap it to settle early.'],
          ['Why was my selection suspended?', 'Markets pause during key moments such as goals. Remove the selection or wait for it to reopen.']]
          .map(([q, a]) => `<details class="faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}
          <h4 class="sh" style="margin-top:16px">Contact us</h4>
          <button class="btn btn-accent block" data-chat>Live chat</button></div>`,
    };
    $('#acBody').innerHTML = H[sec]();
  }
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-acform]'); if (!f) return;
    e.preventDefault();
    const k = f.dataset.acform, u = state.user;
    if (LIVE) {
      try {
        if (k === 'verify') { await API.auth.verify({ fullName: f.name.value, dob: f.dob.value, idType: f.idt.value, idNumber: f.idn.value }); toast('Documents submitted – we will email you when verified'); if (state.afterVerify) { const r = state.afterVerify; state.afterVerify = null; await liveUser(); return go(r); } }
        if (k === 'security') { if (window.Account) return Account.changePassword(f); if (f.pw1.value !== f.pw2.value) return toast('New passwords do not match', 'err'); await API.auth.password(f.cur.value, f.pw1.value); toast('Password updated'); f.reset(); }
        if (k === 'limits') { await API.auth.limits({ period: f.period.value, amount: +f.amt.value || 0, reminder: f.rem.value }); toast('Limits saved'); }
        await liveUser(); renderMe();
      } catch (err) { toast(apiErr(err), 'err'); }
      return;
    }
    if (k === 'verify') {
      u.verified = true; u.fullName = f.name.value.trim(); saveUser(); toast('Documents submitted – account verified');
      if (state.afterVerify) { const r = state.afterVerify; state.afterVerify = null; return go(r); }
      renderAcct('verify');
    }
    if (k === 'security') { if (window.Account) return Account.changePassword(f); if (f.pw1.value !== f.pw2.value) return toast('New passwords do not match', 'err'); toast('Password updated'); f.reset(); }
    if (k === 'limits') { if (!u) return openModal('loginModal'); u.limits = { period: f.period.value, amt: +f.amt.value || 0, rem: f.rem.value }; saveUser(); toast('Limits saved'); }
  });


  /* ---------------- Live backend bridge ----------------
     When api.js can reach the server, data, auth, wallet and bets come from it
     and the in-browser simulation below is switched off.                       */
  let LIVE = false;
  const SERVER_LEAGUES = {};
  const METHOD_KEY = { 'Card': 'card', 'Bank Transfer': 'bank_transfer', 'USSD': 'ussd', 'Mobile Money': 'mobile_money' };
  const mapUser = u => ({ phone: u.phone, balance: u.balance, uid: u.uid, verified: u.verified, fullName: u.fullName, email: u.email, role: u.role, limits: u.limits || {}, country: u.country });
  const apiErr = (e, fallback) => e.offline ? 'Cannot reach the server – check your connection' : ({ bad_login: 'Wrong number or password', phone_taken: 'This number already has an account', bad_code: 'That code is wrong or expired', too_many_codes: 'Too many codes – wait 10 minutes', insufficient_funds: 'Insufficient balance – please deposit', odds_changed: 'Odds changed – check your slip and try again', selection_unavailable: 'A selection is no longer available', one_pick_per_match: 'One pick per match in a multiple', min_stake: 'Stake is below the minimum', login_required: 'Please log in', suspended: 'This account is suspended', self_excluded: 'Your account is on a break', below_minimum: 'Amount is below the minimum', deposit_limit: 'This would pass your deposit limit', kyc_required: 'Verify your ID to withdraw', no_account: 'No account is registered with that number', self_transfer: 'You can\u2019t send money to yourself', bad_password: 'Current password is not correct', invalid: 'Please check the details and try again' }[e.message] || fallback || 'Something went wrong');

  function leagueIdx(l, sport) {
    if (SERVER_LEAGUES[l.id] != null) return SERVER_LEAGUES[l.id];
    let idx = LEAGUES.findIndex(x => x.sport === sport && x.name === l.name && x.country === l.country);
    if (idx < 0) {
      idx = LEAGUES.length;
      LEAGUES.push({ sport, name: l.name, country: l.country, idx, full: `${l.country} · ${l.name}`, top: !!l.top, teams: [], flag: FLAG_OF[l.country] ? LBA.flag(FLAG_OF[l.country]) : (l.flag && l.flag !== 'world' ? LBA.flag(l.flag) : LBA.sport(sport)) });
    }
    SERVER_LEAGUES[l.id] = idx; return idx;
  }
  // Postgres jsonb re-sorts object keys, so put outcomes back in betting order (1 X 2, Over before Under, lines ascending)
  const FIXED = { '1': 0, '1X': 0, X: 1, '12': 1, none: 1, '2': 2, X2: 2, gg: 0, ng: 1, odd: 0, even: 1, oth: 999 };
  const okRank = k => {
    if (k in FIXED) return FIXED[k];
    let r = /^([ou])(\d+(?:\.\d+)?)$/.exec(k); if (r) return +r[2] * 10 + (r[1] === 'o' ? 0 : 1);
    r = /^h(\d+)([12])$/.exec(k); if (r) return +r[1] * 10 + +r[2];
    r = /^(\d+)-(\d+)$/.exec(k); if (r) return 100 + +r[1] * 10 + +r[2];
    return 500;
  };
  function mapMarkets(m, markets) {
    if (!markets) return;
    const old = m.map || {};
    const mk = markets.map(x => ({ key: x.key, name: x.name, group: x.group, cols: x.cols, outs: Object.entries(x.outcomes).sort((a, b) => okRank(a[0]) - okRank(b[0])).map(([k, o]) => ({ k, l: o.l, o: x.suspended ? null : o.o })) }));
    const have = new Set(mk.map(x => x.key));
    (m.mk || []).forEach(x => { if (!have.has(x.key)) mk.push(x); });   // list payloads are partial; keep detail markets
    const map = {}; mk.forEach(x => { map[x.key] = {}; x.outs.forEach(o => { if (o.k) map[x.key][o.k] = o; }); });
    m.flash = {};
    for (const k in map) for (const o in map[k]) { const a = old[k]?.[o]?.o, b = map[k][o].o; if (a && b && a !== b) m.flash[k + '|' + o] = b > a ? 'up' : 'down'; }
    m.mk = mk; m.map = map;
  }
  function mapEvent(e) {
    let m = byId(e.id);
    if (!m) { m = { id: e.id, ev: [], flash: {}, st: { poss: [50, 50], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], att: [0, 0] }, lh: 1.3, la: 1.1, lc: 10, mu: 0, tf: 1, mk: [], map: {} }; MATCHES.push(m); }
    const prevScore = m.score ? [...m.score] : null;
    m.sport = e.sport; m.lg = leagueIdx(e.league, e.sport); m.home = e.home; m.away = e.away;
    m.kick = new Date(e.kickoff).getTime(); m.live = e.status === 'live'; m.finished = e.status === 'finished' || e.status === 'cancelled';
    m.minute = e.minute || 0; m.score = e.score || [0, 0]; m.two = e.sport !== 'football'; m.hot = !!e.hot;
    m.prog = m.two && m.live ? Math.min(0.98, m.minute / 48) : 0;
    const st = e.stats || {};
    if (st.corners) m.st.corners = st.corners;
    if (st.goals) m.ev = st.goals.map(g => ({ min: g.min, side: g.side, type: 'goal' }));
    if (m.finished) { m.ft = m.score; if (e.ht) m.ht = e.ht; if (!m.endAt) { m.endAt = Date.now(); if (!RESULTS.includes(m)) RESULTS.unshift(m); } }
    const logos = {}; if (e.homeLogo) logos[e.home] = e.homeLogo; if (e.awayLogo) logos[e.away] = e.awayLogo; if (Object.keys(logos).length) LBA.setLogos(logos);
    if (prevScore && m.live && (m.score[0] > prevScore[0] || m.score[1] > prevScore[1])) { m.goalAt = Date.now(); m.goalSide = m.score[0] > prevScore[0] ? 0 : 1; notifyGoal(m); }
    mapMarkets(m, e.markets);
    return m;
  }
  const mapBet = b => ({ id: b.id, at: new Date(b.placedAt).getTime(), type: b.type === 'multiple' ? `Multiple · ${b.legs.length} legs` : 'Single',
    legs: b.legs.map(l => ({ mid: l.eventId, mk: l.market, ok: l.outcome, odd: +l.odd, label: l.label, mname: l.marketName, match: l.match, result: l.result })),
    stake: +b.stake, odds: +b.odds, boost: b.boost, win: +b.potential, status: b.status, paid: b.paid == null ? null : +b.paid, cashout: b.cashout });
  async function liveBets() {
    if (!LIVE || !state.user) return;
    try { const [open, settled] = await Promise.all([API.bets.list('open'), API.bets.list('settled')]); state.bets = [...open, ...settled].map(mapBet); } catch { /* keep what we have */ }
  }
  async function liveUser() {
    if (!API.token) { state.user = null; return; }
    try { state.user = mapUser(await API.auth.me()); if (state.user.country && state.user.country !== CC) { try { localStorage.setItem('lba_country', state.user.country); } catch {} location.reload(); } }
    catch (e) { if (e.status === 401) state.user = null; }
  }
  let refreshing = false;
  async function liveRefresh() {
    if (!LIVE || refreshing) return; refreshing = true;
    try {
      const evs = await API.events.list({ limit: 400 });
      const seen = new Set(evs.map(e => e.id));
      evs.forEach(mapEvent);
      MATCHES.forEach(m => { if (!m.virtual && !seen.has(m.id) && !m.finished && m.kick < Date.now() + 36e5) { m.live = false; m.finished = true; m.ft = m.score; } });
      if (state.route === 'match' && state.arg) { const e = await API.events.one(+state.arg).catch(() => null); if (e) mapEvent(e); }
      if (state.user && ['me', 'acct'].includes(state.route)) { await liveUser(); await liveBets(); }
      syncSlipOdds(); updateLiveBadges();
      const y = window.scrollY;
      if (state.route === 'home') renderHome();
      else if (['live', 'match', 'league', 'list', 'results', 'me', 'acct', 'bet'].includes(state.route)) renderCurrent(false);
      window.scrollTo(0, y); renderSlip(); renderAuth();
    } catch (e) { if (!e.offline) console.warn('[live]', e); }
    finally { refreshing = false; }
  }
  async function liveInit() {
    if (!window.API || !API.enabled) return false;
    if (!(await API.ping())) return false;
    LIVE = true; document.documentElement.dataset.live = '1';
    MATCHES.length = 0; RESULTS.length = 0;
    await liveUser();
    try { const evs = await API.events.list({ limit: 400 }); evs.forEach(mapEvent); } catch {}
    try { (await API.events.results()).forEach(mapEvent); } catch {}
    await liveBets();
    setInterval(liveRefresh, 5000);
    return true;
  }
  async function livePlaceBet() {
    const single = state.slipType === 'single';
    if (state.slip.some(s => byId(s.mid)?.virtual)) return toast('Virtuals are not open for real bets yet', 'err');
    const selections = state.slip.map(s => ({ eventId: s.mid, market: s.mk, outcome: s.ok, odd: s.odd }));
    const body = { type: single ? 'single' : 'multiple', selections, acceptChanges: $('#bsAccept')?.checked !== false };
    if (single) body.stakes = state.slip.map(s => +s.stake || 0); else body.stake = +$('#bsStake').value;
    $('#bsPlace').disabled = true;
    try {
      const r = await API.bets.place(body);
      state.user.balance = r.balance; saveUser();
      state.slip = []; state.slipType = 'multi'; saveSlip();
      toast(r.bets.length > 1 ? `${r.bets.length} bets placed` : `Bet placed · ticket ${r.bets[0].id}`);
      closeSlip(); await liveBets(); renderAfterSlipChange(); renderAuth();
    } catch (e) {
      if (e.message === 'login_required') openModal('loginModal');
      else if (e.message === 'insufficient_funds') go('deposit');
      else if (e.message === 'odds_changed' || e.message === 'selection_unavailable') { await liveRefresh(); }
      toast(apiErr(e, 'Bet could not be placed'), 'err');
    } finally { $('#bsPlace').disabled = false; }
  }


  /* ---------------- Legal pages ---------------- */
  const LEGAL = {
    terms: { title: 'Terms & Conditions', updated: '14 November 2026', sections: [
      ['1. About these terms', 'These terms govern your use of LetBetAfrika (the "Service"), operated by LetBetAfrika Limited ("we", "us"). By opening an account or placing a bet you accept them. If you do not agree, do not use the Service.'],
      ['2. Eligibility', 'You must be 18 or older, resident in Nigeria or Ghana, and legally allowed to gamble where you are. We may ask for proof of identity, age and address at any time and may suspend an account until it is provided.'],
      ['3. Your account', 'One account per person. Keep your password private; you are responsible for activity on your account. Tell us immediately if you think someone else has access. We may close duplicate accounts and void their bets.'],
      ['4. Deposits and withdrawals', 'Deposits are credited when confirmed by the payment provider. Withdrawals are paid to an account in your own name and may require identity verification. We may hold a payout while we check for fraud or bonus abuse. Minimum and maximum amounts are shown in the app.'],
      ['5. Placing bets', 'A bet is accepted only when it appears in your bet history. Odds can change before acceptance; if "Accept odds changes" is on, the bet is placed at the new price. Obvious pricing errors (palpable errors) may be voided. Maximum payout per ticket is shown in the app.'],
      ['6. Settlement', 'Football markets settle on the result at the end of regular time including stoppage time, unless the market says otherwise. Postponed or abandoned events not completed within 48 hours are void. Cashout values are offered at our discretion and may be withdrawn at any time.'],
      ['7. Bonuses', 'Each promotion has its own rules shown with the offer. Bonus funds may carry wagering requirements and may be removed if misused. We may withhold bonus winnings where we reasonably believe the rules were broken.'],
      ['8. Responsible gambling', 'You can set deposit limits, session reminders and take a break from your account at any time under Responsible gambling. Lower limits apply immediately; higher limits apply after 24 hours. Self-exclusion cannot be reversed early.'],
      ['9. Prohibited use', 'You may not use the Service for money laundering, match-fixing, arbitrage through bonus abuse, or with automated tools. We report suspicious activity to the relevant authorities.'],
      ['10. Liability', 'The Service is provided as is. We are not liable for losses caused by events outside our control, including network failures, or for indirect losses. Nothing limits liability that cannot be limited by law.'],
      ['11. Complaints and disputes', 'Contact support first; we aim to resolve complaints within 72 hours. Unresolved disputes may be referred to the licensing authority in your country.'],
      ['12. Changes', 'We may update these terms. The date at the top shows the latest version. Continued use after a change means you accept it.'],
    ] },
    privacy: { title: 'Privacy Policy', updated: '14 November 2026', sections: [
      ['What we collect', 'Phone number, name, date of birth, email (optional), identity documents you send for verification, payment details needed to move money, your bets and transactions, device and usage data, and your approximate location.'],
      ['Why we use it', 'To run your account and pay you; to verify age and identity as the law requires; to detect fraud and problem gambling; to send receipts and important account notices; and, if you opt in, promotions. Our legal bases are contract, legal obligation and legitimate interest.'],
      ['Who we share it with', 'Payment providers, SMS and email providers, identity-verification partners, the sports data supplier (match and odds data only), our hosting providers, and regulators or law enforcement where required. We never sell your data.'],
      ['How long we keep it', 'Account and transaction records are kept for at least 5 years after your account closes, as gambling and anti-money-laundering rules require. Marketing preferences are kept until you change them.'],
      ['Your rights', 'You can ask for a copy of your data, correct it, or ask us to delete what we are not required to keep. You can withdraw marketing consent at any time. Write to privacy@letbetafrika.com.'],
      ['Security', 'Data is encrypted in transit and at rest. Access is limited to staff who need it. Passwords are stored hashed and are never visible to us.'],
      ['Cookies and storage', 'The app stores your country, login token and preferences on your device. We use analytics to understand how the app is used; no advertising trackers are placed without consent.'],
      ['Children', 'The Service is for adults only. We delete accounts found to belong to anyone under 18.'],
      ['Contact', 'LetBetAfrika Limited · privacy@letbetafrika.com · support@letbetafrika.com'],
    ] },
  };
  function renderLegal(kind) {
    const L = LEGAL[kind] || LEGAL.terms;
    $('#legalTitle').textContent = L.title;
    $('#legalBody').innerHTML = `<h2>${L.title}</h2><div class="upd">Last updated ${L.updated}</div>` + L.sections.map(([h, t]) => `<h3>${h}</h3><p>${t}</p>`).join('') +
      `<p style="margin-top:24px"><a href="#/legal/${kind === 'terms' ? 'privacy' : 'terms'}">Read our ${kind === 'terms' ? 'Privacy Policy' : 'Terms & Conditions'} →</a></p>`;
  }

  /* ---------------- Router ---------------- */
  const PAGES = ['home', 'live', 'sports', 'jackpot', 'promos', 'me', 'match', 'league', 'virtuals', 'games', 'results', 'acct', 'play', 'deposit', 'withdraw', 'legal', 'register', 'login', 'forgot', 'list', 'codes', 'promo', 'bet'];
  function go(r) { location.hash = '#/' + r; }
  const navStack = [];
  let firstRoute = true;
  function route() {
    const [r, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const h = location.hash || '#/home';
    let dir = 'fade';
    if (navStack.length > 1 && navStack[navStack.length - 2] === h) { navStack.pop(); dir = 'back'; }
    else if (navStack[navStack.length - 1] !== h) { navStack.push(h); dir = ['match', 'league', 'acct'].includes(r) ? 'fwd' : 'fade'; }
    let page = PAGES.includes(r) ? r : 'home';
    if (r === 'sport' && sportOf(arg)) { state.sport = arg; page = 'home'; }
    if (page === 'match' && state.arg !== arg) { state.mdTab = 'markets'; state.mdGroup = 'All'; }
    const prevRoute = state.route;
    state.route = page; state.arg = arg;
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    const navKey = page === 'match' || page === 'league' || page === 'legal' ? null : page === 'acct' ? (arg === 'bets' ? 'bets' : 'me') : page === 'play' ? 'games' : ['deposit', 'withdraw'].includes(page) ? 'me' : page;
    $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === navKey));
    closeDrawer(); closeSlip(); closeSearch(); closeModals();
    document.body.dataset.page = page;
    if (page === 'home') renderHome();
    if (page === 'me') renderMe();
    if (page === 'virtuals') renderVirtuals();
    if (page === 'games') renderGames();
    if (page === 'acct') renderAcct(arg);
    if (window.Account && Account.handles(page)) Account.render(page, arg, prevRoute);
    if (window.Pages && Pages.handles(page)) Pages.render(page, arg, false, prevRoute);
    if (page === 'legal') renderLegal(arg);
    if (page === 'match') renderMatch(+arg);
    else window.scrollTo(0, 0);
    const sec = $('#page-' + page);
    if (sec && !firstRoute) {
      sec.classList.remove('enter-fwd', 'enter-back', 'enter-fade'); void sec.offsetWidth;
      sec.classList.add('enter-' + dir, 'stagger');
      clearTimeout(sec._st); sec._st = setTimeout(() => sec.classList.remove('stagger'), 900);
      const SKL = { match: 'match', league: 'list', live: 'list', results: 'list', virtuals: 'list', acct: 'cards' };
      if (SKL[page] && dir !== 'back' && window.Motion) Motion.skeleton(sec, SKL[page]);
    }
    firstRoute = false;
  }

  const openSlip = () => { $('#betslip').classList.add('open'); $('#scrim').classList.add('on'); renderSlip(); };
  const closeSlip = () => { $('#betslip').classList.remove('open'); if (!$('#drawer').classList.contains('open')) $('#scrim').classList.remove('on'); renderSlip(); };
  const closeDrawer = () => { $('#drawer').classList.remove('open'); if (!$('#betslip').classList.contains('open')) $('#scrim').classList.remove('on'); };
  const openSearch = () => { $('#searchOv').classList.add('open'); renderSearch($('#searchInput').value); setTimeout(() => $('#searchInput').focus(), 50); };
  const closeSearch = () => $('#searchOv').classList.remove('open');
  const PAGE_MODALS = { loginModal: 'login', registerModal: 'register', depositModal: 'deposit' };
  const openModal = (id, mode) => {
    if (PAGE_MODALS[id]) {
      let r = id === 'depositModal' && mode === 'withdraw' ? 'withdraw' : PAGE_MODALS[id];
      if (r === 'login' || r === 'register') {
        // come back to the page the user was on once they are logged in
        const back = location.hash.replace(/^#\/?/, '');
        if (back && !/^(login|register|forgot)/.test(back)) r += '/' + encodeURIComponent(back);
      }
      closeModals(); return go(r);
    }
    $$('.modal').forEach(m => m.classList.remove('open')); $('#' + id).classList.add('open');
  };
  const closeModals = () => $$('.modal').forEach(m => m.classList.remove('open'));

  function renderCurrent(keepScroll) {
    const y = window.scrollY;
    if (state.route === 'home') renderHome();
    if (window.Pages && Pages.handles(state.route)) Pages.render(state.route, state.arg, true);
    if (state.route === 'match') renderMatch(+state.arg, true);
    if (state.route === 'me') renderMe();
    if (state.route === 'virtuals') renderVirtuals();
    if (state.route === 'acct') renderAcct(state.arg);
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

    if (d.mid) {
      const rect = t.getBoundingClientRect(), was = isSel(+d.mid, d.mk, d.ok);
      toggleSel(+d.mid, d.mk, d.ok);
      if (!was && isSel(+d.mid, d.mk, d.ok) && window.Motion) Motion.fly(rect, (t.querySelector('b') || t).textContent.trim());
      return;
    }
    if ('openCc' in d) { e.preventDefault(); closeDrawer(); return openModal('countryModal'); }
    if (d.cc) {
      if (d.cc === CC) return closeModals();
      try { localStorage.setItem('lba_country', d.cc); } catch {}
      location.hash = '#/home'; return location.reload();
    }
    if (d.open) {
      e.preventDefault();
      if (d.open === 'depositModal') { closeDrawer(); closeSlip(); closeModals(); return go(d.mode === 'withdraw' ? 'withdraw' : 'deposit'); }
      if (d.open === 'loginModal' || d.open === 'registerModal') { closeDrawer(); closeSlip(); return openModal(d.open); }
      closeDrawer(); closeSlip(); return openModal(d.open);
    }
    if (d.switch) { e.preventDefault(); return openModal(d.switch); }
    if ('close' in d) return closeModals();
    if ('back' in d) return history.length > 1 ? history.back() : go('home');
    if (d.sport) {
      if (t.closest('#liveSportTabs')) { state.liveSport = d.sport; return renderLive(); }
      state.sport = d.sport; return state.route === 'home' ? renderHome() : go('home');
    }
    if (d.day) { state.day = d.day; return renderHome(); }
    if (d.hlg) { state.hotLg = +d.hlg; return renderHome(); }
    if (d.hls) { state.hls = d.hls; return renderLiveStrip(); }
    if (d.cat) { state.list = d.cat; state.sport = 'football'; renderHome(); return $('.sports-block').scrollIntoView({ behavior: 'smooth' }); }
    if (d.res) { state.resSport = d.res; return renderResults(); }
    if (d.txf) { state.txFilter = d.txf; return renderAcct('tx'); }
    if (d.copy) { navigator.clipboard?.writeText(d.copy).catch(() => {}); return toast('Code copied'); }
    if (d.break) { if (!state.user) return openModal('loginModal'); if (LIVE) { const days = { '24 hours': 1, '7 days': 7, '30 days': 30, '6 months': 182 }[d.break] || 1; API.auth.limits({ selfExclude: new Date(Date.now() + days * 864e5).toISOString() }).then(() => toast(`Your break has started (${d.break})`)).catch(e => toast(apiErr(e), 'err')); return; } return toast(`Self-exclusion request for ${d.break} received`); }
    if (d.soon) { e.preventDefault(); return toast(`${d.soon} is coming soon`); }
    if ('chat' in d) return toast('Live chat will connect to your support desk');
    if (d.list) { state.list = d.list; return renderHome(); }
    if (d.hview) { state.homeView = d.hview; return renderHome(); }
    if (d.filter === 'today') { state.list = 'today'; $$('[data-list]').forEach(b => b.classList.toggle('active', b.dataset.list === 'today')); renderHome(); return $('.list-tabs').scrollIntoView({ behavior: 'smooth' }); }
    if (d.market) { state.market[d.msport] = d.market; return renderCurrent(true); }
    if (d.bstype) { if (d.bstype === 'system') return toast('System bets are coming soon'); state.slipType = d.bstype; return renderSlip(); }
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
      if (LIVE) { API.bets.cashout(d.cashout).then(async r => { state.user.balance = r.balance; saveUser(); toast(`Cashed out ${naira(r.paid)}`); await liveBets(); renderMe(); renderAuth(); }).catch(e => toast(apiErr(e, 'Cashout unavailable'), 'err')); return; }
      const b = state.bets.find(x => x.id === d.cashout), v = b && cashoutValue(b);
      if (!v) return;
      b.status = 'cashout'; b.paid = v; state.user.balance += v; addTx('Cashout', v); saveBets(); saveUser();
      toast(`Cashed out ${naira(v)}`); renderMe(); return renderAuth();
    }
    switch (t.id) {
      case 'moreBtn': e.preventDefault(); $('#drawer').classList.add('open'); $('#scrim').classList.add('on'); break;
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
        if (state.user.balance < C.ticket) { go('deposit'); toast('Insufficient balance', 'err'); break; }
        state.user.balance -= C.ticket; addTx('Jackpot ticket', -C.ticket); saveUser(); state.jp = {}; renderJackpot(); renderAuth();
        toast('Jackpot ticket submitted. Good luck!'); break;
    }
  });
  // Dark mode (Me page toggle, like the reference). The saved choice is applied in <head> before first paint.
  const setTheme = dark => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('lba_theme', dark ? 'dark' : 'light'); } catch {}
    const b = $('#themeBtn'); if (b) { b.setAttribute('aria-pressed', dark); b.querySelector('span').textContent = dark ? 'Light Mode' : 'Dark Mode'; }
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121418' : '#0a7d3e');
  };
  setTheme(document.documentElement.dataset.theme === 'dark');
  $('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme !== 'dark'));
  $('#logoutBtn').addEventListener('click', () => { window.Account && Account.persist(state.user); if (LIVE) API.auth.logout(); state.user = null; state.bets = []; store.del('user'); renderAuth(); renderMe(); toast('Logged out'); });
  $('#scrim').addEventListener('click', () => { closeSlip(); closeDrawer(); });
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); closeSlip(); closeDrawer(); closeSearch(); } });
  $('#bsStake').addEventListener('input', () => { if (state.slipType === 'single') { const v = +$('#bsStake').value || 0; state.slip.forEach(s => s.stake = v); saveSlip(); } renderSlip(); });
  $('#bsBody').addEventListener('input', e => {
    const k = e.target.dataset.stake; if (k == null) return;
    const s = state.slip[+k]; s.stake = +e.target.value; saveSlip();
    const valid = state.slip.filter(x => !x.susp), tot = valid.reduce((a, x) => a + (+x.stake || 0), 0);
    const wins = valid.map(x => (+x.stake || 0) * x.odd);
    $('#bsTotStake').textContent = fmtN(tot);
    $('#bsWin').textContent = valid.length > 1 ? `${fmtN(Math.min(...wins))} ~ ${fmtN(wins.reduce((a, w) => a + w, 0))}` : fmtN(wins[0] || 0);
    $('#bsPay').textContent = `About to pay ${fmtN(tot)}`;
  });
  $('#gSearch').addEventListener('input', renderGames);
  $('#gCat').addEventListener('change', renderGames);
  $('#searchInput').addEventListener('input', e => renderSearch(e.target.value));

  $('#codeForm').addEventListener('submit', e => { e.preventDefault(); loadCode($('#codeInput').value); });
  async function loadCode(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (!code) return toast('Enter a booking code', 'err');
    if (LIVE) {
      try {
        const list = await API.bets.load(code);
        if (!list.length) return toast('Booking code not found or expired', 'err');
        state.slip = list.map(s => ({ mid: s.eventId, mk: s.market, ok: s.outcome, odd: s.odd, label: s.label, mname: s.marketName, match: s.match, live: s.live, stake: C.defStake }));
        saveSlip(); closeModals(); await liveRefresh(); renderAfterSlipChange(); openSlip(); toast(`Loaded ${state.slip.length} selection(s)`);
      } catch (err) { toast(apiErr(err, 'Booking code not found'), 'err'); }
      return;
    }
    const sels = store.get('codes', {})[code];
    if (!sels) return toast('Booking code not found', 'err');
    state.slip = [];
    sels.forEach(({ mid, mk, ok }) => {
      const m = byId(mid), o = m?.map[mk]?.[ok];
      if (o && o.o) state.slip.push({ mid, mk, ok, odd: o.o, label: o.l, mname: m.mk.find(x => x.key === mk).name, match: `${m.home} vs ${m.away}`, live: m.live, stake: C.defStake });
    });
    saveSlip(); closeModals(); renderAfterSlipChange(); openSlip();
    toast(`Loaded ${state.slip.length} selection(s)`);
  }

  /* ---------------- Live simulation ---------------- */
  function simTick() {
    if (LIVE) return;
    const R = Math.random;
    MATCHES.filter(m => m.live).forEach(m => {
      if (!m.two) {
        if (m.minute < 90 && R() < 0.6) {
          m.minute++;
          [0, 1].forEach(s => {
            const l = s ? m.la : m.lh, st = m.st;
            if (R() < l / 90 * 1.4) { m.score[s]++; st.shots[s]++; st.sot[s]++; m.ev.push({ min: m.minute, side: s, type: 'goal' }); m.goalAt = Date.now(); m.goalSide = s; notifyGoal(m); }
            if (R() < l * 0.07) { st.shots[s]++; if (R() < 0.35) st.sot[s]++; }
            if (R() < (s ? m.lc * 0.45 : m.lc * 0.55) / 90) st.corners[s]++;
            if (R() < 0.022) { st.yc[s]++; m.ev.push({ min: m.minute, side: s, type: 'yc' }); }
            st.att[s] += R() < l * 0.45 ? 1 : 0;
          });
          const p = Math.max(30, Math.min(70, m.st.poss[0] + Math.round((R() - 0.5) * 3)));
          m.st.poss = [p, 100 - p];
        }
        if (m.minute >= 90 && R() < 0.35) finishMatch(m);
      } else {
        if (m.prog >= 0.98 && R() < 0.3) { finishMatch(m); return; }
        m.prog = Math.min(0.98, m.prog + 0.004);
        if (m.sport === 'basketball') { if (R() < 0.5) m.score[0] += 1 + Math.floor(R() * 3); if (R() < 0.5) m.score[1] += 1 + Math.floor(R() * 3); }
        else if (R() < 0.04) m.score[R() < 0.5 ? 0 : 1]++;
        m.mu += (R() - 0.5) * 0.3;
      }
      if (!m.finished) computeMarkets(m, true);
    });
    kickOffs();
    settleBets();
    syncSlipOdds();
    updateLiveBadges();
    const y = window.scrollY;
    if (state.route === 'home') renderLiveStrip();
    else if (['live', 'match', 'league', 'results'].includes(state.route)) renderCurrent(false);
    window.scrollTo(0, y);
    renderSlip();
  }
  setInterval(simTick, 4000);

  /* ---------------- Init ---------------- */
  applyCountry();
  $('#yr').textContent = new Date().getFullYear();
  $('#payRow').innerHTML = (CC === 'GH' ? ['MTN MoMo', 'Telecel Cash', 'AT Money', 'VISA', 'Mastercard', 'Bank'] : ['OPay', 'PalmPay', 'Quickteller', 'Verve', 'VISA', 'Mastercard']).map(x => `<span>${x}</span>`).join('');
  $('#footLic').textContent = `Age 18 and above only. Betting can be addictive – please play responsibly. LetBetAfrika ${C.name} operates under licence from ${CC === 'GH' ? 'the Gaming Commission of Ghana' : 'the National Lottery Regulatory Commission of Nigeria'} (licence pending).`;
  if (window.Games) Games.initCrash({
    C, money, whole, toast,
    user: () => state.user,
    login: () => openModal('loginModal'),
    debit: (v, why) => { state.user.balance -= v; addTx(why, -v); saveUser(); renderAuth(); },
    credit: (v, why) => { if (!state.user) return; state.user.balance += v; addTx(why, v); saveUser(); renderAuth(); },
  });
  (async () => {
    const live = await liveInit().catch(() => false);
    if (!live) seedResults();
    syncSlipOdds(); vNewRound();
    renderRails(); renderAuth(); renderSlip(); updateLiveBadges();
    window.addEventListener('hashchange', route);
    route();
  })();
  // internal API used by account.js (sign-up, login, reset, deposit, withdraw pages)
  window.LBA_APP = { state, C, CC, store, money, whole, esc, toast, saveUser, addTx, renderAuth, renderMe, go, openModal, r2,
    get live() { return LIVE; }, apiErr, mapUser, liveBets, liveUser,
    MATCHES, LEAGUES, SPORTS, RESULTS, VISIBLE, sportOf, byId, listMarkets, mktFor, matchRow, oddBtn, crest, fmtKick, fmtDay, liveLabel, isHot,
    saveSlip, saveBets, renderSlip, openSlip, renderCurrent, renderAfterSlipChange, openSearch, loadCode, legResult, cashoutValue, naira, closeModals, betsHTML };
  setInterval(() => {
    tickCountdown(); vTick();
    const sec = Math.floor(Date.now() / 1000);
    document.querySelectorAll('[data-clk]').forEach(el => { const m = byId(el.dataset.clk); if (m && m.live) el.textContent = String(m.minute).padStart(2, '0') + ':' + String((sec + m.id * 7) % 60).padStart(2, '0'); });
  }, 1000);
  if (window.Motion) {
    Motion.pullToRefresh($('#page-home'), () => { renderHome(); const h = $('#page-home'); h.classList.add('stagger'); setTimeout(() => h.classList.remove('stagger'), 900); toast('Odds updated'); });
    Motion.splash();
  }
})();
