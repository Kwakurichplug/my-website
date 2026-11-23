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
      jackpot: 50000000, jp11: 100000, jp10: 10000, jackpotShort: '₦50M', ticket: 100, bonusMax: 100000, referral: 1000, b1: 'img/banner-1.jpg', b3: 'img/banner-3.jpg' },
    GH: { code: 'GH', flag: 'gh', name: 'Ghana', cur: 'GH₵', curName: 'Cedis', locale: 'en-GH', dial: '+233', ph: '24 123 4567', digits: 9,
      minStake: 1, defStake: 5, chips: [1, 5, 10, 50], dep: [10, 50, 100, 500], depDef: 50, demo: 250,
      jackpot: 500000, jp11: 1000, jp10: 100, jackpotShort: 'GH₵500K', ticket: 1, bonusMax: 1000, referral: 10, b1: 'img/banner-1-gh.jpg', b3: 'img/banner-3-gh.jpg' },
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
    { id: 'americanfootball', name: 'American Football', em: '🏈' },
    { id: 'baseball', name: 'Baseball', em: '⚾' },
    { id: 'volleyball', name: 'Volleyball', em: '🏐' },
    { id: 'tabletennis', name: 'Table Tennis', em: '🏓' },
    { id: 'esports', name: 'eSports', em: '🎮' },
    { id: 'cricket', name: 'Cricket', em: '🏏' },
    { id: 'rugby', name: 'Rugby', em: '🏉' },
    { id: 'handball', name: 'Handball', em: '🤾' },
    { id: 'boxing', name: 'Boxing', em: '🥊' },
    { id: 'mma', name: 'MMA', em: '🥋' },
    { id: 'darts', name: 'Darts', em: '🎯' },
    // virtual sports (server-run rounds, fictional teams) – listed after the real ones
    { id: 'vbasketball', name: 'vBasketball', em: '🏀' },
    { id: 'vtennis', name: 'vTennis', em: '🎾' },
    { id: 'vicehockey', name: 'vIce Hockey', em: '🏒' },
    { id: 'vvolleyball', name: 'vVolleyball', em: '🏐' },
    { id: 'vtabletennis', name: 'vTable Tennis', em: '🏓' },
    { id: 'vhandball', name: 'vHandball', em: '🤾' },
    { id: 'vdarts', name: 'vDarts', em: '🎯' },
    { id: 'vfootball', name: 'Virtual Football', em: '🎮', hidden: true },
  ];
  SPORTS.forEach(sp => { sp.em = LBA.sport(sp.id); });
  const VISIBLE = () => SPORTS.filter(s => !s.hidden);
  const VS = new Set(['vbasketball', 'vtennis', 'vicehockey', 'vvolleyball', 'vtabletennis', 'vhandball', 'vdarts']);
  const realLive = m => m.live && !m.vs;   // virtual games in play stay out of "All live" and the live counters
  // sports and leagues are only listed while they have a match to bet on (no empty "(0)" spots)
  const openIn = (f) => MATCHES.filter(m => !m.finished && f(m));
  const SPORTS_ON = () => VISIBLE().filter(s => MATCHES.some(m => m.sport === s.id && !m.finished));
  const sportOf = id => SPORTS.find(s => s.id === id);
  // Two-way model parameters: T = expected total, sd = total sd, msd = margin sd
  const TW = {
    basketball: { T: 218, sd: 14, msd: 11, hl: [-1.5, -4.5, -7.5], tl: [210.5, 214.5, 218.5, 222.5, 226.5], unit: 'Points' },
    tennis: { T: 22.5, sd: 3.5, msd: 3.5, hl: [-1.5, -3.5], tl: [20.5, 22.5, 24.5], unit: 'Games' },
    icehockey: { T: 5.5, sd: 1.8, msd: 1.6, hl: [-1.5], tl: [4.5, 5.5, 6.5], unit: 'Goals' },
    handball: { T: 56.5, sd: 5, msd: 4, hl: [-1.5, -3.5], tl: [54.5, 56.5, 58.5], unit: 'Goals' },
    volleyball: { T: 182.5, sd: 18, msd: 10, hl: [-2.5, -4.5], tl: [176.5, 182.5, 188.5], unit: 'Points' },
    americanfootball: { T: 44.5, sd: 13, msd: 13, hl: [-3.5, -6.5], tl: [40.5, 44.5, 48.5], unit: 'Points' },
    baseball: { T: 8.5, sd: 3, msd: 3, hl: [-1.5], tl: [7.5, 8.5, 9.5], unit: 'Runs' },
    vbasketball: { T: 218, sd: 14, msd: 11, hl: [-1.5], tl: [218.5], unit: 'Points' }, vtennis: { T: 21.5, sd: 3.5, msd: 1, hl: [-1.5], tl: [21.5], unit: 'Games' },
    vicehockey: { T: 5.5, sd: 1.8, msd: 1.6, hl: [-1.5], tl: [5.5], unit: 'Goals' }, vvolleyball: { T: 3.5, sd: 1, msd: 1, hl: [-1.5], tl: [3.5], unit: 'Sets' },
    vtabletennis: { T: 3.5, sd: 1, msd: 1, hl: [-1.5], tl: [3.5], unit: 'Games' }, vhandball: { T: 55.5, sd: 5, msd: 4, hl: [-1.5], tl: [55.5], unit: 'Goals' },
    vdarts: { T: 9.5, sd: 1.5, msd: 1.5, hl: [-1.5], tl: [9.5], unit: 'Legs' },
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
  const FLAG_OF = { England: 'gb-eng', Scotland: 'gb-sct', Spain: 'es', Italy: 'it', Germany: 'de', France: 'fr', Nigeria: 'ng', Ghana: 'gh', 'South Africa': 'za', UEFA: 'eu', Europe: 'eu', USA: 'us' };
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

  // every football market, priced with our margin – see betting/markets.js (shared with the server)
  function footballMarkets(m) { return LBAMarkets.football(m, price, m.virtual ? { noCorners: true, noCards: true } : undefined); }

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
    const sg = x => (x > 0 ? '+' : '') + x;
    add('spr', 'Handicap', 'Handicap', 2, P.hl.flatMap(h => { const p = 1 - ncdf((-h - mu) / sd); return [[`${h}|1`, `Home (${sg(h)})`, p], [`${h}|2`, `Away (${sg(-h)})`, 1 - p]]; }));
    add('tot', `Total ${P.unit}`, 'Totals', 2, P.tl.flatMap(l => { const p = 1 - ncdf((l - tm) / tsd); return [[`o${l}`, `Over ${l}`, p], [`u${l}`, `Under ${l}`, 1 - p]]; }));
    return out;
  }

  // Which columns show in match lists for each sport
  function listMarkets(sport) {
    if (sport === 'football') return [
      { id: '1x2', name: '1X2', mk: '1x2', outs: ['1', 'X', '2'], lab: ['1', 'X', '2'] },
      { id: 'ou', name: 'O/U', mk: 'ou', outs: ['o', 'u'], n: 3, lines: [0.5, 1.5, 2.5, 3.5, 4.5], def: 2.5, lab: ['', 'Over', 'Under'] },
      { id: 'dc', name: 'DC', mk: 'dc', outs: ['1X', '12', 'X2'], lab: ['1X', '12', 'X2'] },
      { id: 'hou', name: 'Home O/U', mk: 'hou', outs: ['o', 'u'], n: 3, lines: [0.5, 1.5, 2.5, 3.5], def: 1.5, lab: ['', 'Over', 'Under'] },
      { id: 'aou', name: 'Away O/U', mk: 'aou', outs: ['o', 'u'], n: 3, lines: [0.5, 1.5, 2.5, 3.5], def: 1.5, lab: ['', 'Over', 'Under'] },
    ];
    if (sport === 'vfootball') return [
      { id: '1x2', name: '1X2', mk: '1x2', outs: ['1', 'X', '2'], lab: ['1', 'X', '2'] },
      { id: 'dc', name: 'DC', mk: 'dc', outs: ['1X', '12', 'X2'], lab: ['1X', '12', 'X2'] },
      { id: 'ou', name: 'O/U 2.5', mk: 'ou', outs: ['o2.5', 'u2.5'], lab: ['Over', 'Under'] },
      { id: 'gg', name: 'GG/NG', mk: 'gg', outs: ['gg', 'ng'], lab: ['GG', 'NG'] },
    ];
    const P = TW[sport] || TW.default;
    return [
      sport === 'vhandball' ? { id: '1x2', name: '1X2', mk: '1x2', outs: ['1', 'X', '2'], lab: ['1', 'X', '2'] } : { id: 'win', name: 'Winner', mk: 'win', outs: ['1', '2'], lab: ['1', '2'] },
      { id: 'spr', name: 'Handicap', mk: 'spr', outs: ['1', '2'], n: 3, lines: 'auto', lab: ['', '1', '2'] },
      { id: 'tot', name: 'Total', mk: 'tot', outs: ['o', 'u'], n: 3, lines: 'auto', lab: ['', 'Over', 'Under'], unit: P.unit },
    ];
  }

  /* ---------------- State ---------------- */
  const state = {
    sport: 'football', liveSport: 'all', list: 'highlights', market: {}, day: 'all', tx: store.get('tx', []), resSport: 'all',
    slip: store.get('slip', []), slipType: 'multi', user: store.get('user', null),
    bets: store.get('bets', []), jp: {}, betsTab: 'open', favs: store.get('favs', []), favMk: store.get('favmk', []),
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
    if (m.vs && m.period) return m.period;
    if (m.noScore) return 'LIVE';
    if (!m.two) return m.minute >= 90 ? "90+'" : m.minute === 45 ? 'HT' : m.minute + "'";
    if (m.sport === 'basketball') return 'Q' + Math.min(4, 1 + Math.floor(m.prog * 4));
    if (m.sport === 'tennis') return 'Set ' + (m.score[0] + m.score[1] + 1);
    return 'LIVE';
  };

  function oddBtn(m, mk, ok, label, style, short) {
    const o = m.map[mk]?.[ok];
    if (!o) return `<span class="odd void"></span>`;
    if (!o.o || (!m.live && !m.finished && m.kick <= Date.now())) return `<button class="odd ${style || ''} locked" disabled aria-label="${esc(o.l)} – suspended">${style === 'ob' ? `<span>${esc(short || o.l)}</span>` : ''}${LOCK}</button>`;
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
    let list = SPORTS_ON();
    if (liveOnly) list = [{ id: 'all', name: 'All', em: LBA.sport('all') }, ...VISIBLE().filter(s => MATCHES.some(m => m.live && m.sport === s.id))];
    const x = el.scrollLeft;
    el.innerHTML = list.map(s => {
      const n = s.id === 'all' ? MATCHES.filter(realLive).length : openIn(m => m.sport === s.id && (!liveOnly || m.live)).length;
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
    const line = cfg.lines ? rowLine(m, cfg) : null, pr = line == null ? null : pairOf(cfg, line);
    const oddsHTML = cfg.lines
      ? (pr ? `<button class="odd lsel" data-lcycle="${m.id}|${cfg.mk}" aria-label="Change line"><b>${lineTxt(cfg, line)}</b><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>${oddBtn(m, cfg.mk, pr[0])}${oddBtn(m, cfg.mk, pr[1])}` : '<span class="odd void"></span>'.repeat(3))
      : cfg.outs.map(ok => oddBtn(m, cfg.mk, ok)).join('');
    return `<div class="ev${m.live ? ' is-live' : ''}${m.live && recentGoal(m) ? ' goal' : ''}" style="--n:${cfg.n || cfg.outs.length}">
      <div class="ev-meta">${meta}${withLeague ? `<span class="ev-lg">${esc(lg.country)} - ${esc(lg.name)}</span>` : ''}${state.favs.includes(m.id) ? '<span class="star">★</span>' : ''}</div>
      <div class="ev-body">
        <a class="ev-teams" href="#/match/${m.id}">
          <span><i>${esc(m.home)}</i>${m.live ? `<b class="${recentGoal(m) && m.goalSide === 0 ? 'pop' : ''}">${m.noScore ? '–' : m.score[0]}</b>` : ''}</span>
          <span><i>${esc(m.away)}</i>${m.live ? `<b class="${recentGoal(m) && m.goalSide === 1 ? 'pop' : ''}">${m.noScore ? '–' : m.score[1]}</b>` : ''}</span>
          <small>+${n} ›</small>
        </a>
        <div class="ev-odds">${oddsHTML}</div>
        ${exCols(m, cfg)}
      </div>
    </div>`;
  }

  // list O/U columns: the player's pick for that row, else the line priced closest to even (the reference's "Near odds")
  // line columns: Over/Under keys are o<L>/u<L>; handicap keys are <home line>|1 and <home line>|2
  const isSpr = cfg => cfg.mk === 'spr';
  const pairOf = (cfg, L) => (isSpr(cfg) ? [`${L}|1`, `${L}|2`] : ['o' + L, 'u' + L]);
  const lineTxt = (cfg, L) => (isSpr(cfg) && L > 0 ? '+' + L : String(L));
  function linesOf(m, cfg) {
    if (cfg.lines !== 'auto') return cfg.lines;
    const ks = Object.keys(m.map[cfg.mk] || {});
    return [...new Set(ks.map(k => parseFloat(isSpr(cfg) ? k.split('|')[0] : k.slice(1))).filter(Number.isFinite))].sort((a, b) => a - b);
  }
  function rowLine(m, cfg) {
    const lines = linesOf(m, cfg), pick = m.uiLine && m.uiLine[cfg.mk];
    if (pick != null && lines.includes(pick)) return pick;
    if (!lines.length) return null;
    const mk = m.map[cfg.mk] || {}; let best = lines.includes(cfg.def) ? cfg.def : lines[lines.length >> 1], gap = Infinity;
    lines.forEach(L => { const [ka, kb] = pairOf(cfg, L), o = mk[ka], u = mk[kb]; if (o && u && o.o && u.o) { const g = Math.abs(o.o - u.o); if (g < gap) { gap = g; best = L; } } });
    return best;
  }
  // the line cell in a list row opens a sheet with every open line and its prices
  function openLinePicker(key) {
    const [mid, mk] = key.split('|'), m = byId(mid), cfg = m && listMarkets(m.sport).find(x => x.mk === mk);
    if (!cfg) return;
    const map = m.map[mk] || {}, cur = rowLine(m, cfg), px = o => (o && o.o ? o.o.toFixed(2) : '–');
    const open = linesOf(m, cfg).filter(L => { const [ka, kb] = pairOf(cfg, L); return map[ka]?.o || map[kb]?.o; });
    if (open.length < 2) return toast('Only one line is open for this match');
    $('#lineTitle').textContent = isSpr(cfg) ? 'Handicap' : { hou: 'Home Over/Under', aou: 'Away Over/Under' }[mk] || (cfg.unit ? `Total ${cfg.unit}` : 'Over/Under');
    $('#lineSub').textContent = `${m.home} v ${m.away}`;
    $('#lineHead').innerHTML = (isSpr(cfg) ? ['Home line', 'Home', 'Away'] : [cfg.unit || 'Goals', 'Over', 'Under']).map(h => `<span>${h}</span>`).join('');
    $('#lineList').innerHTML = open.map(L => { const [ka, kb] = pairOf(cfg, L); return `<button class="ln-row${L === cur ? ' on' : ''}" data-lpick="${m.id}|${mk}|${L}" aria-pressed="${L === cur}"><b>${lineTxt(cfg, L)}</b><span>${px(map[ka])}</span><span>${px(map[kb])}</span></button>`; }).join('');
    openModal('lineModal');
  }
  // desktop shows Over/Under 2.5 next to 1X2, like the reference's wide table (hidden on phones by CSS)
  const exOk = cfg => cfg.mk === '1x2';
  const exCols = (m, cfg) => exOk(cfg) ? `<div class="ev-odds ex">${m.map.ou?.['o2.5'] ? oddBtn(m, 'ou', 'o2.5') + oddBtn(m, 'ou', 'u2.5') : '<span class="odd void"></span><span class="odd void"></span>'}</div>` : '';
  const exHead = cfg => exOk(cfg) ? '<div class="cols ex"><span>Over 2.5</span><span>Under 2.5</span></div>' : '';
  function groupRender(list, cfgFn, hideHead) {
    if (!list.length) return `<div class="empty"><span class="big">🗓️</span>No events available right now.</div>`;
    const groups = new Map();
    list.forEach(m => { if (!groups.has(m.lg)) groups.set(m.lg, []); groups.get(m.lg).push(m); });
    return [...groups].map(([lgi, ms]) => {
      const lg = LEAGUES[lgi], cfg = cfgFn(lg.sport);
      return `<div class="league-block">
        <div class="league-head" style="--n:${cfg.n || cfg.outs.length}">
          ${hideHead ? `<span class="lh-name">${esc(cfg.name)}</span>` : `<a class="lh-name" href="#/league/${lgi}"><span class="flag">${lg.flag}</span><span class="lh-t">${esc(lg.full)}</span></a>`}
          <div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div>${exHead(cfg)}<span class="cols-pad"></span></div>
        ${ms.map(m => matchRow(m, cfg, false)).join('')}
      </div>`;
    }).join('');
  }

  const fmtDay = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.toLocaleDateString([], { weekday: 'long' })}`; };
  function flatList(list, cfg) {
    let day = '', html = '';
    list.forEach(m => {
      const d = new Date(m.kick).toDateString();
      if (d !== day) { day = d; html += `<div class="day-sep" style="--n:${cfg.n || cfg.outs.length}"><span>${fmtDay(m.kick)}</span><div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div>${exHead(cfg)}</div>`; }
      html += matchRow(m, cfg, true);
    });
    return html || '<div class="empty">No events for this filter.</div>';
  }
  function renderHome() {
    const big = MATCHES.filter(m => m.sport === 'football' && !m.finished && !m.live && LEAGUES[m.lg].top).sort((a, b) => a.kick - b.kick);
    const t1 = big[0], t2 = big[3] || big[1];
    const mt = m => m ? `<a class="tile tile-match" href="#/match/${m.id}"><span class="tm">${crest(m.home, 1, m.sport)}<em>vs</em>${crest(m.away, 1, m.sport)}</span><b>${esc(LBA.code(m.home))} vs ${esc(LBA.code(m.away))}</b></a>` : '';
    $('#tiles').innerHTML = `
      <a class="tile" href="#" data-open="registerModal" style="background-image:url(${C.b1})"><b>Deposit Bonuses</b></a>
      ${mt(t1)}
      <a class="tile" href="#/virtuals" style="background-image:url(img/banner-2.jpg)"><b>Virtuals</b></a>
      ${mt(t2)}
      <a class="tile" href="#/jackpot" style="background-image:url(${C.b3})"><b>Jackpot</b></a>
      <a class="tile tile-game" href="#/games"><svg viewBox="0 0 24 24"><path d="M12 3c3 2 4 6 4 9l-4 4-4-4c0-3 1-7 4-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M8 16l-2 4 4-2M16 16l2 4-4-2"/></svg><b>Rocket Crash</b></a>`;
    const lgIdx = (c, n) => LEAGUES.find(l => l.country === c && l.name === n)?.idx;
    const LG_COL = ['#0a7d3e', '#ffc20e', '#3d1a6e', '#0055a4', '#c8102e'];
    const busy = LEAGUES.filter(l => l.sport === 'football').map(l => [l, MATCHES.filter(m => m.lg === l.idx && !m.finished).length]).filter(x => x[1]).sort((a, b) => (b[0].top - a[0].top) || b[1] - a[1]).slice(0, 3);
    void lgIdx;
    $('#catCards').innerHTML = [
      ["TODAY'S FOOTBALL", '#e5163a', 'data-cat="today"'],
      ['FOOTBALL IN NEXT 3 HOURS', '#7d838c', 'data-cat="3h"'],
      ...busy.map(([l], i) => [`${l.country} ${l.name}`.toUpperCase().replace(/^UEFA /, 'UEFA '), LG_COL[i], `href="#/league/${l.idx}"`]),
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
    const sports = [...new Set(MATCHES.filter(realLive).map(m => m.sport))];
    if (!state.hls || !sports.includes(state.hls)) state.hls = sports[0] || 'football';
    const el = $('#homeLiveTabs'), x = el.scrollLeft;
    el.innerHTML = sports.map(id => `<button data-hls="${id}" class="${id === state.hls ? 'active' : ''}">${sportOf(id).name}</button>`).join('');
    el.scrollLeft = x;
    renderMarketTabs($('#homeLiveMkt'), state.hls);
    const cfg = mktFor(state.hls);
    const live = MATCHES.filter(m => realLive(m) && m.sport === state.hls).slice(0, 6);
    $('#liveStrip').innerHTML = `<div class="day-sep dark" style="--n:${cfg.n || cfg.outs.length}"><span></span><div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div>${exHead(cfg)}</div>` + live.map(m => matchRow(m, cfg, true)).join('');
  }

  function renderLive() {
    renderSportTabs($('#liveSportTabs'), state.liveSport, true);
    const list = MATCHES.filter(m => state.liveSport === 'all' ? realLive(m) : m.live && m.sport === state.liveSport);
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
    $('#leagueRail').innerHTML = LEAGUES.filter(l => l.top && MATCHES.some(m => m.lg === l.idx && !m.finished)).map(l => `<li><a href="#/league/${l.idx}">${l.flag} ${esc(l.name)}${l.country === 'England' || l.country === 'Nigeria' ? ` <small class="muted">${l.country}</small>` : ''}</a></li>`).join('');
    $('#sportRail').innerHTML = SPORTS_ON().map(s => `<li><a href="#/sport/${s.id}">${s.em} ${s.name}<i>${openIn(m => m.sport === s.id).length}</i></a></li>`).join('');
  }

  function renderAZ(q = '') {
    q = q.trim().toLowerCase();
    $('#azList').innerHTML = SPORTS_ON().sort((a, b) => a.name.localeCompare(b.name)).map(s => {
      const lgs = LEAGUES.filter(l => l.sport === s.id && MATCHES.some(m => m.lg === l.idx && !m.finished) && (!q || s.name.toLowerCase().includes(q) || l.full.toLowerCase().includes(q)));
      if (!lgs.length) return '';
      const open = q || state.azOpen.has(s.id);
      return `<div class="az-item ${open ? 'open' : ''}">
        <button class="az-head" data-az="${s.id}"><span class="em">${s.em}</span>${s.name}<span class="cnt">${openIn(m => m.sport === s.id).length}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="az-body">${lgs.map(l => `<a href="#/league/${l.idx}"><span>${l.flag} ${esc(l.full)}</span><span class="cnt">${openIn(m => m.lg === l.idx).length}</span></a>`).join('')}</div>
      </div>`;
    }).join('') || `<div class="empty">No results for “${esc(q)}”</div>`;
  }

  /* ---------------- Match detail ---------------- */
  function renderMatch(id, keepScroll) {
    const m = byId(id); if (!m) return go('home');
    const lg = league(m), sp = sportOf(m.sport);
    const pre = !m.live && !m.finished;
    const pg = $('#page-match'); pg.classList.toggle('pre', pre); pg.classList.toggle('lv', !pre);
    $('#mdSport').innerHTML = `${sp.em} ${sp.name} · ${esc(lg.country)}`;
    $('#mdLeague').innerHTML = `<span>${esc(m.home)}</span> <i class="vs">vs</i> <span>${esc(m.away)}</span>`;
    if (state.mkQFor !== m.id) { state.mkQ = null; state.mkQFor = m.id; }
    $('#mdFav').classList.toggle('on', state.favs.includes(m.id));

    // Hero
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
    if (pre) {
      const dt = new Date(m.kick), dd = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const wd = kd === 'Today' || kd === 'Tomorrow' ? kd : dt.toLocaleDateString([], { weekday: 'long' });
      $('#mdHero').innerHTML = `<a class="mh-lg" href="#/league/${lg.idx}">${esc(sp.name)} - ${esc(lg.country)} - ${esc(lg.name)}</a>
        <div class="mh-teams">
          <div class="mh-team">${crest(m.home, 1, m.sport)}<b>${esc(m.home)}</b></div>
          <div class="mh-when"><span>${dd}</span><span>${wd}</span><em>${kt}</em></div>
          <div class="mh-team">${crest(m.away, 1, m.sport)}<b>${esc(m.away)}</b></div>
        </div>
        <div class="mh-meta">Game ID ${m.id}${m.vs ? ' · Virtual game' : m.two ? '' : '<span class="dot"></span>Live In-Play Available'}</div>`;
    } else {
      const clock = m.live
        ? `<span class="mh-clock">${m.two ? liveLabel(m) : `<b data-clk="${m.id}">${String(m.minute).padStart(2, '0')}:00</b> ${m.minute <= 45 ? 'H1' : 'H2'}`}</span>`
        : `<span class="mh-clock pre">${kd} ${kt}</span>`;
      const bar2 = (name, sc, side) => `<div class="mh-row"><span class="mh-name">${crest(name, 0, m.sport)}<i>${esc(name)}</i></span>${m.live || m.finished ? `<b class="mh-sc${recentGoal(m) && m.goalSide === side ? ' pop' : ''}">${sc}</b>` : ''}</div>`;
      $('#mdHero').innerHTML = `<a class="mh-lg" href="#/league/${lg.idx}">${esc(sp.name)} - ${esc(lg.country)} - ${esc(lg.name)}</a>
        <div class="mh-clockrow">${m.finished ? '<span class="mh-clock">Ended</span>' : clock}<span class="mh-id">ID ${m.id}</span></div>
        ${bar2(m.home, m.noScore ? '–' : m.score[0], 0)}${bar2(m.away, m.noScore ? '–' : m.score[1], 1)}
        ${m.sets && m.sets.length ? `<div class="mh-sets">${m.sets.map(x => x.join('-')).join(' · ')}</div>` : ''}
        ${bar}`;
    }

    $$('#mdTabs button').forEach(b => b.classList.toggle('active', b.dataset.mdtab === state.mdTab));
    $('#mdMarketsWrap').hidden = state.mdTab !== 'markets';
    $('#mdStats').hidden = state.mdTab !== 'stats';
    $('#mdInfo').hidden = state.mdTab !== 'info';

    if (state.mdTab === 'markets') {
      const present = new Set(m.mk.map(x => x.group));
      const groups = ['All', ...(window.LBAMarkets ? LBAMarkets.GROUPS.slice(1) : []).filter(g => present.has(g)), ...[...present].filter(g => !LBAMarkets.GROUPS.includes(g))];
      if (!m.two && m.mk.some(x => isTeamMk(m, x))) groups.splice(Math.max(1, groups.indexOf('Goals') + 1), 0, 'Teams');
      if (!groups.includes(state.mdGroup) && state.mdGroup !== '★') state.mdGroup = 'All';
      const searching = state.mkQ != null;
      $('#mdGroups').innerHTML = `<button class="gsearch ${searching ? 'active' : ''}" data-mksearch aria-label="Search markets" aria-pressed="${searching}">${SEARCH}</button><button class="gstar ${state.mdGroup === '★' && !searching ? 'active' : ''}" data-group="★" aria-label="Favourite markets">${STAR}</button>` + groups.map(g => `<button data-group="${g}" class="${g === state.mdGroup && !searching ? 'active' : ''}">${g}</button>`).join('');
      const box = $('#mdSearch'); box.hidden = !searching;
      if (searching && !box.firstChild) box.innerHTML = `<label class="mk-q">${SEARCH}<input id="mkQ" type="search" placeholder="Search markets, e.g. corners, half, both teams" autocomplete="off" enterkeyhint="search"></label><button class="mk-q-x" data-mksearch aria-label="Close search">Cancel</button>`;
      if (!searching) box.innerHTML = '';
      $('#mdMarkets').innerHTML = mdMarketsHTML(m);
    }
    if (state.mdTab === 'stats') $('#mdStats').innerHTML = statsHTML(m);
    if (state.mdTab === 'info') $('#mdInfo').innerHTML = infoHTML(m);
    if (!keepScroll) window.scrollTo(0, 0);
  }

  // markets about one team (its goals, clean sheet, win to nil, corners, cards…) – the "Teams" group
  const isTeamMk = (m, x) => !m.two && (x.name.includes(m.home) || x.name.includes(m.away));
  function mdMarketsHTML(m) {
    const q = (state.mkQ || '').trim().toLowerCase();
    if (state.mkQ != null && q) {
      const hit = m.mk.filter(x => x.name.toLowerCase().includes(q) || (x.group || '').toLowerCase().includes(q));
      return hit.length ? hit.map(x => marketHTML(m, x)).join('') : `<div class="empty">No market matches “${esc(state.mkQ.trim())}”.</div>`;
    }
    const g = state.mdGroup, show = m.mk.filter(x => g === 'All' || state.mkQ != null ? true : g === '★' ? state.favMk.includes(x.key) : g === 'Teams' ? isTeamMk(m, x) : x.group === g);
    return show.length ? show.map(x => marketHTML(m, x)).join('') : `<div class="empty"><span class="big">★</span>${g === '★' ? 'Tap the star on any market to keep it here.' : 'No markets in this group right now.'}</div>`;
  }
  const SEARCH = '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
  // the same line icons as the rest of the site (header star, empty-state info icon)
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>';
  const INFO = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>';
  const lineOf = l => { const r = /\(([^)]+)\)/.exec(l); return r ? r[1] : l.replace(/^(Over|Under)\s*/, ''); };
  function marketHTML(m, x) {
    const ck = m.id + x.key, closed = state.collapsed.has(ck), v = window.LBAMarkets ? LBAMarkets.view(x.key) : 'grid';
    const live = x.outs.filter(o => o.k), allLocked = live.length > 0 && live.every(o => !o.o);
    const head = `<div class="mkt-head"><button class="mkt-tog" data-collapse="${ck}" aria-expanded="${!closed}"><i class="tri"></i><span>${esc(x.name)}</span></button><button class="mkt-i" data-mkinfo="${esc(x.key)}" aria-label="How this market settles">${INFO}</button>${allLocked ? '<em class="susp">Suspended</em>' : ''}<button class="mkt-star ${state.favMk.includes(x.key) ? 'on' : ''}" data-mkfav="${esc(x.key)}" aria-label="Favourite market" aria-pressed="${state.favMk.includes(x.key)}">${STAR}</button></div>`;
    let body;
    if (v === 'ou') {
      let rows = ''; for (let i = 0; i + 1 < live.length; i += 2) rows += `<span class="line">${esc(lineOf(live[i].l))}</span>${oddBtn(m, x.key, live[i].k, null, 'tb')}${oddBtn(m, x.key, live[i + 1].k, null, 'tb')}`;
      body = `<div class="mkt-th t2"><span></span><span>Over</span><span>Under</span></div><div class="mkt-body tbl">${rows}</div>`;
    } else if (v === 'eh') {
      let rows = ''; for (let i = 0; i + 2 < live.length; i += 3) rows += `<span class="line">${esc(lineOf(live[i].l))}</span>${oddBtn(m, x.key, live[i].k, null, 'tb')}${oddBtn(m, x.key, live[i + 1].k, null, 'tb')}${oddBtn(m, x.key, live[i + 2].k, null, 'tb')}`;
      body = `<div class="mkt-th t3"><span></span><span>Home</span><span>Draw</span><span>Away</span></div><div class="mkt-body tbl3">${rows}</div>`;
    } else if (v === 'ah') {
      body = `<div class="mkt-th h2"><span>Home</span><span>Away</span></div><div class="mkt-body" style="--c:2">${live.map(o => oddBtn(m, x.key, o.k, null, 'ob', lineOf(o.l))).join('')}</div>`;
    } else {
      body = `<div class="mkt-body" style="--c:${x.cols}">${x.outs.map(o => o.k ? oddBtn(m, x.key, o.k, null, 'ob') : '<span class="odd void"></span>').join('')}</div>`;
    }
    return `<div class="mkt ${closed ? 'closed' : ''}">${head}${body}</div>`;
  }
  function showMarketInfo(key) {
    const m = byId(+state.arg), x = m && m.mk.find(y => y.key === key);
    $('#mkInfoTitle').textContent = x ? x.name : 'Market';
    $('#mkInfoBody').textContent = window.LBAMarkets ? LBAMarkets.guide(key) : '';
    $('#mkInfoRule').textContent = m && m.vs
      ? 'Virtual game with fictional teams: the result is drawn by our random number generator when betting closes and played out over a minute. Results include overtime.'
      : m && m.two
      ? 'Results include overtime and extra innings. A game that is not completed within 48 hours of its start is void.'
      : 'Unless the market name says otherwise, football markets settle on the result after 90 minutes plus stoppage time. Extra time and penalties do not count. A match abandoned or postponed and not completed within 48 hours is void.';
    openModal('mkInfoModal');
  }

  function statRow(label, a, b, pct) {
    const t = (a + b) || 1, pa = pct ? a : Math.round(a / t * 100);
    return `<div class="srow"><div class="snum"><b>${a}${pct ? '%' : ''}</b><span>${label}</span><b>${b}${pct ? '%' : ''}</b></div>
      <div class="sbar"><i class="h" style="width:${pa}%"></i><i class="a" style="width:${100 - pa}%"></i></div></div>`;
  }
  // What the betting market expects – implied probabilities from the current prices, margin removed.
  function implied(m, mk, keys) {
    const o = m.map[mk]; if (!o) return null;
    const p = keys.map(k => (o[k] && o[k].o ? 1 / o[k].o : 0)), s = p.reduce((a, b) => a + b, 0);
    return s && p.every(Boolean) ? p.map(x => x / s) : null;
  }
  function marketView(m) {
    const keys = m.two ? ['1', '2'] : ['1', 'X', '2'], w = implied(m, m.two ? 'win' : '1x2', keys);
    if (!w) return '';
    const pc = x => Math.round(x * 100), lab = m.two ? [m.home, m.away] : [m.home, 'Draw', m.away];
    const ou = !m.two && implied(m, 'ou', ['o2.5', 'u2.5']), gg = !m.two && implied(m, 'gg', ['gg', 'ng']);
    const one = (label, x) => `<div class="mv-row"><span>${label}</span><div class="mv-track"><i style="width:${pc(x)}%"></i></div><b>${pc(x)}%</b></div>`;
    return `<h4 class="sh">Market view <small>${m.live ? 'live odds' : 'current odds'}, bookmaker margin removed</small></h4>
      <div class="mv-split">${w.map((x, i) => `<i class="s${m.two ? [0, 2][i] : i}" style="flex:${Math.max(x, 0.04)}"></i>`).join('')}</div>
      <div class="mv-labels">${w.map((x, i) => `<span><b>${pc(x)}%</b>${esc(lab[i])}</span>`).join('')}</div>
      ${ou ? one('Over 2.5 goals', ou[0]) : ''}${gg ? one('Both teams to score', gg[0]) : ''}`;
  }
  function statsHTML(m) {
    const legend = `<div class="slegend"><span>${crest(m.home, 0, m.sport)} ${esc(m.home)}</span><span>${esc(m.away)} ${crest(m.away, 0, m.sport)}</span></div>`;
    const mv = marketView(m);
    if (!m.live) return `<div class="card-pad">${legend}${mv || '<p class="muted center pad">Prices for this match are not open yet.</p>'}</div>`;
    const s = m.st, rows = [statRow('Score', m.score[0], m.score[1])];
    // only statistics the data feed actually provides (the demo simulation provides all of them)
    if (!LIVE && !m.two) rows.push(statRow('Possession', s.poss[0], s.poss[1], true), statRow('Dangerous attacks', s.att[0], s.att[1]), statRow('Shots', s.shots[0], s.shots[1]), statRow('Shots on target', s.sot[0], s.sot[1]), statRow('Yellow cards', s.yc[0], s.yc[1]));
    if (!m.two && (s.corners[0] + s.corners[1] > 0)) rows.push(statRow('Corners', s.corners[0], s.corners[1]));
    const tl = [...m.ev].reverse().map(e => `<li class="${e.side ? 'a' : 'h'}"><span class="tmin">${e.min}'</span><span class="tic">${e.type === 'goal' ? '⚽' : '🟨'}</span><span>${e.type === 'goal' ? 'Goal' : 'Yellow card'} – ${esc(e.side ? m.away : m.home)}</span></li>`).join('');
    return `<div class="card-pad">${legend}${rows.join('')}
      ${m.two ? '' : `<h4 class="sh">Timeline</h4><ul class="timeline">${tl || '<li class="muted">No goals yet</li>'}<li class="ko"><span class="tmin">0'</span><span class="tic">🏁</span><span>Kick-off</span></li></ul>`}
      ${mv}</div>`;
  }
  function infoHTML(m) {
    const lg = league(m), sp = sportOf(m.sport).name;
    const rules = m.two ? `${sp} markets include overtime unless the market name says otherwise.`
      : 'Football markets settle on the result after 90 minutes plus stoppage time (extra time and penalties do not count), unless the market name says otherwise. If the match is postponed or abandoned and not completed within 48 hours, bets on it are void.';
    return `<div class="card-pad">
      <h4 class="sh">Match info</h4>
      <dl class="minfo"><dt>Competition</dt><dd>${lg.flag} ${esc(lg.full)}</dd><dt>Kick-off</dt><dd>${new Date(m.kick).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd><dt>Status</dt><dd>${m.finished ? 'Finished' : m.live ? 'Live' : 'Not started'}</dd><dt>Event ID</dt><dd>${m.id}</dd></dl>
      <h4 class="sh">How bets on this match settle</h4>
      <p class="minfo-p">${rules}</p>
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
      state.slipNew = mid;   // that row slides in on the next render
    }
    saveSlip(); renderAfterSlipChange();
  }

  // the 5-second list only carries the main markets; a slip pick from any other market (correct score, Asian
  // handicap, HT/FT…) needs its match in full, or it would show as suspended (booking codes, page reloads)
  const LIST_KEYS = new Set(['1x2', 'dc', 'ou', 'gg', 'hou', 'aou', 'win', 'hcp', 'spr', 'tot']);
  const detailAt = {};
  async function refreshSlipEvents(force) {
    if (!LIVE || !state.slip.length) return;
    const ids = [...new Set(state.slip.filter(x => { const m = byId(x.mid); return force || !m || !m.map[x.mk]?.[x.ok] || !LIST_KEYS.has(x.mk); }).map(x => x.mid))]
      .filter(id => force || Date.now() - (detailAt[id] || 0) > 15000).slice(0, 20);
    await Promise.all(ids.map(async id => { detailAt[id] = Date.now(); const e = await API.events.one(id).catch(() => null); if (e) mapEvent(e); }));
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
    if ($('#betslip').classList.contains('dragging')) return;   // the sheet is under the finger – it re-renders on release
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
    $('#bsBody').innerHTML = state.slip.map((s, k) => `<div class="bs-item${s.susp ? ' susp' : ''}${s.mid === state.slipNew ? ' bs-in' : ''}" data-slip-mid="${s.mid}">
      <button class="bs-rm" data-rm="${k}" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="bs-main">
        <div class="bs-l1"><span class="bs-sp">${sportOf(byId(s.mid)?.sport || 'football').em}</span><span class="bs-pick">${esc(s.label)}</span><b class="bs-odd ${s.chg || ''}">${s.susp ? LOCK : s.odd.toFixed(2)}</b></div>
        <a class="bs-l2" href="#/match/${s.mid}">${s.live ? '<em class="lv">Live</em>' : ''}${esc(s.match)}</a>
        <div class="bs-l3"><span>${esc(s.mname)}</span>${single && !s.susp ? `<input type="number" min="${C.minStake}" value="${s.stake}" data-stake="${k}" inputmode="decimal">` : ''}</div>
        ${s.susp ? '<div class="susp-msg">Market suspended – remove to continue</div>' : ''}
      </div>
    </div>`).join('');
    state.slipNew = null;

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
      const c = valid.filter(x => x.odd >= 1.2).length, boost = BOOST(c), base = stake * total;   // Acca Win Boost counts selections at odds 1.20+
      const next = BOOST_STEPS.find(x => x > c);
      $('#bsStakeLbl').textContent = 'Stake';
      $('#bsOdds').parentElement.hidden = false;
      $('#bsOdds').textContent = total.toFixed(2);
      $('#bsTotStake').textContent = fmtN(stake);
      $('#bsBoost').textContent = boost + '%';
      $('#bbFill').style.width = Math.min(100, c / 20 * 100) + '%';
      $('#bbText').textContent = next ? `Add ${next - c} more (odds 1.20+) for ${BOOST(next)}% boost` : 'Max boost unlocked';
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
      const total = legs.reduce((a, l) => a * l.odd, 1), boost = BOOST(legs.filter(l => l.odd >= 1.2).length), base = stake * total;
      state.bets.unshift({ id: 'T' + Date.now().toString(36).toUpperCase(), at: Date.now(), type: `Multiple · ${legs.length} legs`, legs, stake, odds: total, boost, win: base + (base - stake) * boost / 100, status: 'open' });
    }
    state.slip = []; state.slipType = 'multi'; saveSlip(); saveUser(); saveBets();
    toast('Bet placed successfully');
    closeSlip(); renderAfterSlipChange(); renderAuth();
  }

  function bookCode() {
    if (state.slip.some(s => s.susp)) return toast('Remove suspended selections first', 'err');
    const n = state.slip.length, odds = state.slip.reduce((p, x) => p * x.odd, 1);
    if (LIVE) { API.bets.book(state.slip.map(s => ({ eventId: s.mid, market: s.mk, outcome: s.ok }))).then(code => shareCode(code, n, odds)).catch(e => toast(apiErr(e), 'err')); return; }
    const code = 'LB' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const codes = store.get('codes', {}); codes[code] = state.slip.map(({ mid, mk, ok }) => ({ mid, mk, ok })); store.set('codes', codes);
    shareCode(code, n, odds);
  }
  const codeLink = code => `${location.origin}${location.pathname}#/code/${encodeURIComponent(code)}`;
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} t.remove(); return ok;
  }
  /** Share sheet for a booking code: anyone opening the link gets the same selections in their betslip. */
  function shareCode(code, n, odds) {
    const link = codeLink(code), text = `My LetBetAfrika booking code: ${code}${n ? ` – ${n} selection${n === 1 ? '' : 's'}${odds > 1 ? `, odds ${odds.toFixed(2)}` : ''}` : ''}. Load it here: ${link}`;
    $('#shCode').textContent = code;
    $('#shSum').textContent = n ? `${n} selection${n === 1 ? '' : 's'}${odds > 1 ? ` · Total odds ${odds.toFixed(2)}` : ''}` : '';
    $('#shLinkTxt').textContent = link.replace(/^https?:\/\//, '');
    $('#shWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
    $('#shShare').hidden = !navigator.share;
    const m = $('#shareModal'); m.dataset.code = code; m.dataset.text = text; m.dataset.link = link;
    openModal('shareModal');
  }
  $('#shareModal').addEventListener('click', async e => {
    const b = e.target.closest('[data-sh]'); if (!b) return;
    const m = $('#shareModal'), k = b.dataset.sh;
    if (k === 'share') { try { await navigator.share({ title: 'LetBetAfrika booking code', text: m.dataset.text, url: m.dataset.link }); } catch {} return; }
    const ok = await copyText(k === 'link' ? m.dataset.link : m.dataset.code);
    toast(ok ? (k === 'link' ? 'Link copied' : `Code ${m.dataset.code} copied`) : 'Could not copy – press and hold to copy', ok ? 'ok' : 'err');
  });

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
    $('#meName').textContent = u ? (u.phone ? C.dial + ' ' + u.phone : u.email || 'ID ' + u.uid) : 'Login to View';
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
    const [h, a] = m.ft, d = h - a, ok = l.ok;
    if (!m.two) return LBAMarkets.grade(l.mk, ok, { h, a, ht: m.ht || null, corners: m.st?.corners || null, cards: m.st?.yc || null, goals: m.ev ? m.ev.filter(e => e.type === 'goal') : null, marketName: l.mname });
    const P = TW[m.sport] || TW.default;
    if (l.mk === 'win') return d === 0 ? 'void' : (d > 0 ? '1' : '2') === ok ? 'won' : 'lost';
    if (l.mk === 'hcp') { const cover = d + P.hl[+ok[1]] > 0; return (ok.endsWith('1') ? cover : !cover) ? 'won' : 'lost'; }
    if (l.mk === 'spr') { const [line, pick] = ok.split('|'), v = d + parseFloat(line); return v === 0 ? 'void' : (pick === '1' ? v > 0 : v < 0) ? 'won' : 'lost'; }
    if (l.mk === 'tot') { const L = parseFloat(ok.slice(1)); if (m.ftTotal === L) return 'void'; return (ok[0] === 'o' ? m.ftTotal > L : m.ftTotal < L) ? 'won' : 'lost'; }
    return 'void';
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
      if (b.status === 'won') window.Pages ? Pages.trophy({ amount: b.paid, source: 'Sport', ref: b.id, href: '#/bet/' + encodeURIComponent(b.id) }) : toast(`You won ${money(b.paid)}`);
    });
    if (changed) { saveBets(); saveUser(); renderAuth(); if (state.route === 'me') renderMe(); }
  }
  function addTx(type, amt, extra) {
    if (!state.user) return;
    state.tx.unshift({ at: Date.now(), type, amt: r2(amt), bal: r2(state.user.balance), ...(extra || {}) });
    state.tx = state.tx.slice(0, 200); store.set('tx', state.tx);
  }
  function updateLiveBadges() {
    const n = MATCHES.filter(realLive).length;
    const nl = $('#navLive'); if (nl) nl.textContent = n; $('#liveCountHome').textContent = n;
  }

  /* ---------------- Virtual football ---------------- */
  const VTEAMS = ['Lagos City', 'Accra United', 'Kumasi Stars', 'Abuja Kings', 'Kano Falcons', 'Tema Mariners', 'Ibadan Lions', 'Takoradi Sharks', 'Port Harcourt Rivers', 'Tamale Eagles', 'Benin Royals', 'Sunyani Leopards'];
  const VLG = LEAGUES.length;
  let VLG_LIVE = null; // virtual league index after live mode resets the league list
  LEAGUES.push({ sport: 'vfootball', name: 'Virtual League', country: 'LetBet Virtuals', flag: LBA.sport('vfootball'), idx: VLG, full: 'LetBet Virtual League', teams: VTEAMS });
  const VR_LEN = 120000;
  const VR = { round: 1000 + Math.floor(Date.now() / VR_LEN) % 9000, endsAt: 0, ids: [], last: [], lastRound: null };
  function vNewRound() {
    VR.round++; VR.endsAt = Date.now() + VR_LEN; VR.ids = [];
    const t = [...VTEAMS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 6; i++) {
      const m = { id: nextId++, sport: 'vfootball', lg: VLG_LIVE ?? VLG, home: t[2 * i], away: t[2 * i + 1], live: false, kick: VR.endsAt,
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
  // live: the server runs the rounds (server/src/games/virtual.js); we follow its schedule and results
  let vLastSync = 0;
  async function vSync() {
    if (!LIVE || Date.now() - vLastSync < 2000) return;
    vLastSync = Date.now();
    try {
      const [up, res] = await Promise.all([API.events.list({ sport: 'vfootball', limit: 50, markets: '1x2,dc,ou,gg' }), API.events.results('vfootball')]);
      up.forEach(mapEvent); res.forEach(mapEvent);
      const cur = up.filter(e => e.status === 'scheduled' && new Date(e.kickoff).getTime() > Date.now()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      if (cur.length) { const k = cur[0].kickoff, rnd = cur.filter(e => e.kickoff === k); VR.ids = rnd.map(e => e.id); VR.endsAt = new Date(k).getTime(); VR.round = rnd[0].stats?.round ?? VR.round; }
      if (res.length) { const r0 = res[0].stats?.round; VR.last = res.filter(e => e.stats?.round === r0).map(e => byId(e.id)).filter(Boolean); VR.lastRound = r0; }
      const keep = new Set([...VR.ids, ...VR.last.map(m => m.id)]);
      for (let i = MATCHES.length - 1; i >= 0; i--) if (MATCHES[i].virtual && !keep.has(MATCHES[i].id) && !state.slip.some(x => x.mid === MATCHES[i].id)) MATCHES.splice(i, 1);
      for (let i = RESULTS.length - 1; i >= 0; i--) if (RESULTS[i].virtual && !keep.has(RESULTS[i].id)) RESULTS.splice(i, 1);
      if (state.user) { await liveUser(); await liveBets(); renderAuth(); }
      syncSlipOdds(); renderSlip();
      if (state.route === 'virtuals') renderVirtuals();
    } catch { /* next tick tries again */ }
  }
  function vTick() {
    if (LIVE) { if (!VR.endsAt || Date.now() >= VR.endsAt + 1200) vSync(); }
    else if (Date.now() >= VR.endsAt) return vEndRound();
    if (state.route !== 'virtuals') return;
    const left = Math.max(0, VR.endsAt - Date.now()), sec = Math.ceil(left / 1000);
    if (!VR.endsAt) { $('#vClock').textContent = '--:--'; return; }
    $('#vClock').textContent = `${String(sec / 60 | 0).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    $('#vBar').style.width = (100 - left / VR_LEN * 100) + '%';
  }
  function resRow(m) {
    return `<div class="res-row"><span class="rh"><span>${esc(m.home)}</span>${crest(m.home, 0, m.sport)}</span><b class="rs">${m.ft[0]} - ${m.ft[1]}</b><span class="ra">${crest(m.away, 0, m.sport)}<span>${esc(m.away)}</span></span>${m.ht ? `<small class="rht">HT ${m.ht[0]}-${m.ht[1]}</small>` : ''}</div>`;
  }
  function renderVirtuals() {
    $('#vRound').textContent = '#' + VR.round;
    renderMarketTabs($('#vMarketTabs'), 'vfootball');
    $("#vList").innerHTML = groupRender(VR.ids.map(byId).filter(Boolean), mktFor, true);
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
  const ACCT = { bets: 'Bet History', how: 'How to Play', tx: 'Transaction Records', bonus: 'Bonuses', refer: 'Refer & Earn', messages: 'Messages', verify: 'Verify ID', security: 'Email & Password', limits: 'Responsible Gambling', help: 'Help & Support' };
  function renderAcct(sec) {
    if (!ACCT[sec]) return go('me');
    // live: bonus progress and referral stats come from the server
    if (LIVE && state.user && (sec === 'bonus' || sec === 'refer') && Date.now() - (renderAcct['_' + sec] || 0) > 4000) {
      renderAcct['_' + sec] = Date.now();
      (sec === 'bonus' ? API.wallet.bonuses().then(r => { state.bonuses = r; }) : API.auth.referrals().then(r => { state.referrals = r; }))
        .then(() => { if (state.route === 'acct' && state.arg === sec) renderAcct(sec); }).catch(() => {});
    }
    if (LIVE && sec === 'tx' && state.user && Date.now() - (renderAcct._txAt || 0) > 4000) {
      renderAcct._txAt = Date.now();
      API.wallet.transactions().then(l => { state.tx = l.map(t => ({ at: new Date(t.at).getTime(), type: { deposit: 'Deposit', withdrawal: 'Withdrawal', bet: 'Bet placed', win: 'Winnings', refund: 'Refund', cashout: 'Cashout', bonus: 'Bonus', referral: 'Referral reward', commission: 'Agent commission', jackpot_win: 'Jackpot win', adjustment: 'Adjustment', transfer_out: 'Transfer to friend', transfer_in: 'Received from friend', game_bet: 'Game stake', game_win: 'Game win', virtual_bet: 'Instant Football stake', virtual_win: 'Instant Football win', jackpot: 'Jackpot ticket' }[t.type] || t.type, amt: t.amount, bal: t.balance, ref: t.ref ? String(t.ref).slice(0, 8).toUpperCase() : undefined })); if (state.route === 'acct' && state.arg === 'tx') renderAcct('tx'); }).catch(() => {});
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
      bonus: () => {
        const B = LIVE ? state.bonuses : null, wb = B && B.bonuses.find(x => x.kind === 'welcome'), rules = (B && B.rules) || { times: 5, min_odds: 1.5, days: 14 };
        let welcome;
        if (LIVE && !B) welcome = `<div class="bonus"><div><b>200% Welcome Bonus</b><small>Loading…</small></div></div>`;
        else if (wb) {
          const pct = Math.min(100, wb.wagered / wb.required * 100), left = Math.max(0, wb.required - wb.wagered);
          welcome = `<div class="bonus wb"><div><b>200% Welcome Bonus · ${money(wb.amount)}</b>
            <small>${wb.status === 'active' ? `Stake ${money(left)} more on multiples (every selection ${(+rules.min_odds).toFixed(2)} or more) by ${new Date(wb.expiresAt).toLocaleDateString()} to unlock it.` : wb.status === 'released' ? `Unlocked and added to your balance on ${new Date(wb.releasedAt).toLocaleDateString()}.` : 'Expired before the stake target was reached.'}</small>
            ${wb.status === 'active' ? `<div class="wb-bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><small>${money(wb.wagered)} of ${money(wb.required)} staked</small>` : ''}</div>
            <span class="status ${wb.status === 'active' ? 'open' : wb.status === 'released' ? 'won' : 'lost'}">${wb.status === 'active' ? 'LOCKED' : wb.status.toUpperCase()}</span></div>`;
        } else if (!LIVE || B.eligible) welcome = `<div class="bonus"><div><b>200% Welcome Bonus</b><small>Make your first deposit and get 200% of it as a bonus, up to ${whole(C.bonusMax)}. Unlock it by staking ${rules.times}× the bonus on multiples (every selection ${(+rules.min_odds).toFixed(2)}+) within ${rules.days} days.</small></div><span class="status won">AVAILABLE</span></div>`;
        else welcome = `<div class="bonus"><div><b>200% Welcome Bonus</b><small>For a player's first deposit only.</small></div><span class="status lost">NOT ELIGIBLE</span></div>`;
        // Deposit 1, 2, 3 (live, when the operator runs the ladder): one row per step with its bonus and progress
        const L = B && B.ladder;
        if (L && L.steps && L.steps.length) welcome = L.steps.map(s => {
          const b = B.bonuses.find(x => x.kind === 'deposit' + s.n), pct = b && b.required ? Math.min(100, b.wagered / b.required * 100) : 0;
          const tag = b ? (b.status === 'active' ? ['open', 'LOCKED'] : b.status === 'released' ? ['won', 'RELEASED'] : ['lost', b.status.toUpperCase()]) : s.status === 'next' ? ['won', 'NEXT'] : s.status === 'locked' ? ['lost', 'VERIFY ID'] : ['lost', 'LATER'];
          const info = b ? (b.status === 'active' ? `Stake ${money(Math.max(0, b.required - b.wagered))} more on multiples (every selection ${(+L.min_odds).toFixed(2)} or more) by ${new Date(b.expiresAt).toLocaleDateString()} to unlock it.` : b.status === 'released' ? `Unlocked and added to your balance on ${new Date(b.releasedAt).toLocaleDateString()}.` : 'Ended before the stake target was reached.')
            : s.status === 'locked' ? `Verify your ID to unlock it. Then your ${['first', 'second', 'third'][s.n - 1]} deposit earns ${s.pct}% as a bonus, up to ${whole(s.max)}.` : `Your ${['first', 'second', 'third'][s.n - 1]} deposit after your ID check earns ${s.pct}% as a bonus, up to ${whole(s.max)}. Unlock it by staking ${L.times}× the bonus on multiples (every selection ${(+L.min_odds).toFixed(2)}+) within ${L.days} days.`;
          return `<div class="bonus wb"><div><b>Deposit ${s.n} · ${s.pct}% bonus${b ? ' · ' + money(b.amount) : ''}</b><small>${info}</small>
            ${b && b.status === 'active' ? `<div class="wb-bar" role="progressbar" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><small>${money(b.wagered)} of ${money(b.required)} staked</small>` : ''}</div>
            <span class="status ${tag[0]}">${tag[1]}</span></div>`;
        }).join('') + (L.unlocked ? '' : '<a class="btn btn-accent block mt" href="#/acct/verify">Verify my ID</a>');
        return `<div class="card-list">${welcome}
          <div class="bonus"><div><b>Acca Win Boost</b><small>5% to 1000% extra winnings on multiples with 3 or more selections at odds 1.20+</small></div><span class="status open">ACTIVE</span></div>
          <div class="bonus"><div><b>Free Bets</b><small>You have no free bets right now</small></div><span class="status lost">NONE</span></div>
        </div>`;
      },
      refer: () => {
        const R = LIVE ? state.referrals : null, code = LIVE ? ((R && R.code) || u.refCode || '…') : 'LB' + u.uid, reward = R ? R.reward : C.referral;
        // the sign-up link fills in the code (account.js reads ?ref=)
        const link = (/^https?:$/.test(location.protocol) ? location.origin + '/' : 'https://letbetafrika.online/') + '?ref=' + code + '#/register';
        const msg = encodeURIComponent(`Join me on LetBetAfrika – bonuses on your first 3 deposits. Sign up with my link: ${link} (or use my code ${code})`);
        // agents (set by LetBetAfrika): commission on their players instead of the flat reward
        const ag = R && R.agent, on = ag && ({ revenue: 'net revenue', deposits: 'deposits', stakes: 'stakes' })[ag.basis];
        const how = ag && (ag.basis === 'revenue' ? `You earn ${ag.rate}% of what your players lose – their stakes minus their winnings and bonuses, counted when bets settle.`
          : ag.basis === 'deposits' ? `You earn ${ag.rate}% of every deposit your players make.` : `You earn ${ag.rate}% of everything your players stake on settled bets and games.`);
        const agentHTML = ag ? `<div class="ag-card">
            <div class="ag-top"><span class="ag-badge">Agent</span><b>${ag.rate}% of your players' ${on}</b></div>
            <div class="ag-due"><small>Commission this period</small><b>${money(ag.commission)}</b><span>Since ${new Date(ag.since).toLocaleDateString(C.locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
            <div class="ref-stats"><div><b>${ag.players}</b><small>Players</small></div><div><b>${ag.active}</b><small>Active this period</small></div><div><b>${whole(ag.base)}</b><small>${on[0].toUpperCase() + on.slice(1)}</small></div></div>
            <p class="ag-note">${how} LetBetAfrika pays your commission into your balance. Paid so far: <b>${money(ag.paid)}</b>.</p>
            ${ag.payouts.length ? `<div class="ag-pay">${ag.payouts.map(x => `<div><span>${new Date(x.at).toLocaleDateString(C.locale, { day: 'numeric', month: 'short' })}</span><b>+${money(x.amount)}</b></div>`).join('')}</div>` : ''}
          </div>` : '';
        return `<div class="card-pad refer">${agentHTML}<p>${ag ? 'Share your code or link. Everyone who signs up with it becomes your player.' : `Invite friends. When a friend who signed up with your code has staked <b>${whole(reward)}</b> or more on sports bets, you get <b>${whole(reward)}</b> in cash.`}</p>
          <div class="code-box"><span>Your code</span><b>${code}</b><button class="btn btn-accent sm" data-copy="${code}">Copy</button></div>
          <div class="code-box link"><span>Your link</span><b>${esc(link)}</b><button class="btn btn-accent sm" data-copy="${esc(link)}">Copy</button></div>
          <a class="btn btn-ghost block mt" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener">Share on WhatsApp</a>
          ${ag ? '' : `<div class="ref-stats"><div><b>${R ? R.joined : 0}</b><small>Friends joined</small></div><div><b>${R ? R.qualified : 0}</b><small>Qualified</small></div><div><b>${whole(R ? R.earned : 0)}</b><small>Earned</small></div></div>`}</div>`;
      },
      messages: () => { const at = new Date(u.createdAt || Date.now()).toLocaleDateString(); return `<div class="card-list">${[
          ['Welcome to LetBetAfrika', `Your account is ready. Verify your ID and get a bonus on each of your first 3 deposits.`],
          ['Acca Win Boost is on', 'Add 3 or more selections at odds 1.20+ to a multiple and get up to 1000% extra winnings.'],
          ['Play responsibly', 'Set deposit limits, reminders or a break any time under Responsible Gambling.']].map(([t, b], i) => `<div class="msg ${i ? '' : 'unread'}"><b>${t}</b><p>${b}</p><small>${at}</small></div>`).join('')}</div>`; },
      verify: () => u.verified ? `<div class="empty"><b>Your account is verified</b><br>${esc(u.fullName || '')}</div>` : `<form class="card-pad form" data-acform="verify">
          ${u.limits?.kyc?.status === 'pending' ? `<div class="kyc-st pend"><b>We are checking your ID</b><span>Usually within 24 hours – we will let you know. You can send corrected details below.</span></div>`
            : u.limits?.kyc?.status === 'rejected' ? `<div class="kyc-st bad"><b>Your ID check was not approved</b><span>${esc(u.limits.kyc.reason || 'Please check your details')}. Correct them and submit again.</span></div>` : ''}
          <p class="muted">Verify your identity to withdraw winnings.</p>
          <label>Full name<input name="name" required placeholder="As shown on your ID"></label>
          <label>Date of birth<input name="dob" type="date" required></label>
          <label>ID type<select name="idt">${(CC === 'GH' ? ['Ghana Card', 'Passport', "Driver's Licence", "Voter's ID"] : ['NIN', 'BVN', 'International Passport', "Driver's Licence", "Voter's Card"]).map(x => `<option>${x}</option>`).join('')}</select></label>
          <label>ID number<input name="idn" required></label>
          <p class="muted">${u.email ? `We'll email the result to <b>${esc(u.email)}</b>.` : `Add your email under <a href="#/acct/security">Email &amp; Password</a> to get the result by email.`}</p>
          <button class="btn btn-accent block">Submit for verification</button></form>`,
      // email: a code goes to the new address first (state.emailStep holds the address waiting for its code)
      security: () => { const st = state.emailStep, viaEmail = u.email && !u.phone;
        return `<form class="card-pad form" data-acform="email">
          <h4 class="sh">Email address</h4>
          ${u.email ? `<p class="ac-cur">${esc(u.email)}<span class="ok">Verified</span></p>` : ''}
          <p class="muted">${viaEmail ? 'You log in with this email. ' : ''}We send receipts, withdrawal updates and your verification result here.</p>
          ${st ? `<label>Code sent to <b>${esc(st)}</b><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="\\d{6}" required placeholder="6-digit code"></label>
          <button class="btn btn-accent block">Confirm email</button>
          <button type="button" class="btn btn-ghost block" data-email-cancel>Use a different email</button>`
          : `<label>${u.email ? 'New email' : 'Email'}<input name="email" type="email" required maxlength="120" autocomplete="email" placeholder="you@example.com"></label>
          <button class="btn btn-accent block">${u.email ? 'Change email' : 'Add email'}</button>`}</form>
        <form class="card-pad form" data-acform="security">
          <h4 class="sh">Change password</h4>
          <label>Current password<input type="password" name="cur" required></label>
          <label>New password<input type="password" name="pw1" minlength="6" required></label>
          <label>Confirm new password<input type="password" name="pw2" minlength="6" required></label>
          <button class="btn btn-accent block">Update password</button></form>`; },
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
  document.addEventListener('click', e => { if (e.target.closest('[data-email-cancel]')) { state.emailStep = null; renderAcct('security'); } });
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-acform]'); if (!f) return;
    e.preventDefault();
    const k = f.dataset.acform, u = state.user;
    if (LIVE) {
      try {
        if (k === 'email') {
          if (!state.emailStep) {
            const email = f.email.value.trim().toLowerCase(), r = await API.auth.email(email);
            if (r.unchanged) return toast('That is already your email');
            state.emailStep = email; renderAcct('security');
            return toast(r.devCode ? `Test code: ${r.devCode}` : `We sent a 6-digit code to ${email}`);
          }
          state.user = mapUser(await API.auth.emailConfirm(state.emailStep, f.code.value.trim()));
          state.emailStep = null; toast('Email verified and saved'); return renderAcct('security');
        }
        if (k === 'verify') { await API.auth.verify({ fullName: f.name.value, dob: f.dob.value, idType: f.idt.value, idNumber: f.idn.value }); toast(u && u.email ? 'Documents submitted – we will email you when verified' : 'Documents submitted – we will let you know when verified'); if (state.afterVerify) { const r = state.afterVerify; state.afterVerify = null; await liveUser(); return go(r); } }
        if (k === 'security') { if (window.Account) return Account.changePassword(f); if (f.pw1.value !== f.pw2.value) return toast('New passwords do not match', 'err'); await API.auth.password(f.cur.value, f.pw1.value); toast('Password updated'); f.reset(); }
        if (k === 'limits') { await API.auth.limits({ period: f.period.value, amount: +f.amt.value || 0, reminder: f.rem.value }); toast('Limits saved'); }
        await liveUser(); renderMe();
      } catch (err) { toast(apiErr(err), 'err'); }
      return;
    }
    if (k === 'email') {   // demo: the code is shown in a toast, like the sign-up code
      if (!u) return openModal('loginModal');
      if (!state.emailStep) { state.emailStep = f.email.value.trim().toLowerCase(); state.emailCode = String(Math.floor(100000 + Math.random() * 900000)); renderAcct('security'); return toast(`Demo email to ${state.emailStep}: your LetBetAfrika code is ${state.emailCode}`); }
      if (f.code.value.trim() !== state.emailCode) return toast('That code is wrong or has expired', 'err');
      u.email = state.emailStep; state.emailStep = null; saveUser(); toast('Email verified and saved'); return renderAcct('security');
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
  const mapUser = u => ({ phone: u.phone, balance: u.balance, uid: u.uid, verified: u.verified, fullName: u.fullName, email: u.email, role: u.role, limits: u.limits || {}, country: u.country, createdAt: u.createdAt ? new Date(u.createdAt).getTime() : null, refCode: u.refCode });
  const apiErr = (e, fallback) => e.offline ? 'Cannot reach the server – check your connection' : ({ bad_login: 'Wrong number or password', phone_taken: 'This number already has an account', bad_code: 'That code is wrong or expired', too_many_codes: 'Too many codes – wait 10 minutes', insufficient_funds: 'Insufficient balance – please deposit', odds_changed: 'Odds changed – check your slip and try again', selection_unavailable: 'A selection is no longer available', one_pick_per_match: 'One pick per match in a multiple', min_stake: 'Stake is below the minimum', login_required: 'Please log in', suspended: 'This account is suspended', self_excluded: 'Your account is on a break', below_minimum: 'Amount is below the minimum', deposit_limit: 'This would pass your deposit limit', kyc_required: 'Verify your ID to withdraw', no_account: 'No account is registered with that number', self_transfer: 'You can\u2019t send money to yourself', bad_password: 'Current password is not correct', invalid: 'Please check the details and try again', max_stake: `Maximum stake is ${e.detail && e.detail.max != null ? whole(e.detail.max) : 'reached'}`, bad_choice: 'Make your pick first', deal_expired: 'That card expired – here is a new one', already_played: 'That card was already played', betting_closed: 'Betting for this round has closed', already_in_round: 'You already have a bet in this round', no_open_bet: 'You have no bet in this round', crashed: 'Too late – the rocket crashed', cannot_cancel: 'Too late to cancel – the round has started', not_started: 'The round has not started yet', round_closed: 'This jackpot round has closed – a new one is open', round_changed: 'The jackpot games changed – please pick again', too_many_lines: 'Too many lines – cover fewer outcomes', unknown_game: 'This game is not available', too_many_requests: 'Too many plays at once – slow down a little', invalid_email: 'Please enter a valid email address', too_many_attempts: 'Too many attempts – please wait 15 minutes and try again', email_taken: 'This email is already used by another account', email_unavailable: 'Email codes are not available right now – please try again shortly', email_failed: 'We could not send the email – please try again in a moment', sms_unavailable: 'Text-message codes are not available right now – use your email instead', sms_failed: 'We could not send the text message – please try again' }[e.message] || fallback || 'Something went wrong');

  function leagueIdx(l, sport) {
    if (SERVER_LEAGUES[l.id] != null) return SERVER_LEAGUES[l.id];
    let idx = LEAGUES.findIndex(x => x.sport === sport && x.name === l.name && x.country === l.country);
    if (idx < 0) {
      idx = LEAGUES.length;
      LEAGUES.push({ sport, name: l.name, country: l.country, idx, full: `${l.country} · ${l.name}`, top: !!l.top, teams: [], flag: l.flag ? LBA.flag(l.flag) : FLAG_OF[l.country] ? LBA.flag(FLAG_OF[l.country]) : LBA.sport(sport) });
    }
    SERVER_LEAGUES[l.id] = idx; return idx;
  }
  // Postgres jsonb re-sorts object keys, so put outcomes back in betting order (1 X 2, Over before Under, lines ascending)
  const FIXED = { '1': 0, '1X': 0, X: 1, '12': 1, none: 1, '2': 2, X2: 2, gg: 0, ng: 1, odd: 0, even: 1, oth: 999 };
  const okRank = k => {
    if (k in FIXED) return FIXED[k];
    let r = /^([ou])(\d+(?:\.\d+)?)$/.exec(k); if (r) return +r[2] * 10 + (r[1] === 'o' ? 0 : 1);
    r = /^h(\d+)([12])$/.exec(k); if (r) return +r[1] * 10 + +r[2];
    r = /^(-?\d+(?:\.\d+)?)\|([12])$/.exec(k); if (r) return 1000 + +r[1] * 10 + +r[2];
    r = /^(\d+)-(\d+)$/.exec(k); if (r) return 100 + +r[1] * 10 + +r[2];
    return 500;
  };
  function mapMarkets(m, markets) {
    if (!markets) return;
    const old = m.map || {};
    const mk = markets.map(x => ({ key: x.key, name: x.name, group: x.group, cols: x.cols, outs: Object.entries(x.outcomes).sort((a, b) => (a[1].i ?? okRank(a[0])) - (b[1].i ?? okRank(b[0]))).map(([k, o]) => ({ k, l: o.l, o: x.suspended ? null : o.o })) }));
    const have = new Set(mk.map(x => x.key));
    (m.mk || []).forEach(x => { if (!have.has(x.key)) mk.push(x); });   // list payloads are partial; keep detail markets
    if (window.LBAMarkets) mk.sort((a, b) => LBAMarkets.order(a.key) - LBAMarkets.order(b.key));
    const map = {}; mk.forEach(x => { map[x.key] = {}; x.outs.forEach(o => { if (o.k) map[x.key][o.k] = o; }); });
    m.flash = {};
    for (const k in map) for (const o in map[k]) { const a = old[k]?.[o]?.o, b = map[k][o].o; if (a && b && a !== b) m.flash[k + '|' + o] = b > a ? 'up' : 'down'; }
    m.mk = mk; m.map = map;
  }
  function mapEvent(e) {
    let m = byId(e.id);
    if (!m) { m = { id: e.id, ev: [], flash: {}, st: { poss: [50, 50], shots: [0, 0], sot: [0, 0], corners: [0, 0], yc: [0, 0], att: [0, 0] }, lh: 1.3, la: 1.1, lc: 10, mu: 0, tf: 1, mk: [], map: {} }; MATCHES.push(m); }
    const prevScore = m.score ? [...m.score] : null;
    m.sport = e.sport; m.lg = e.sport === 'vfootball' && VLG_LIVE != null ? VLG_LIVE : leagueIdx(e.league, e.sport); m.home = e.home; m.away = e.away;
    if (e.sport === 'vfootball') { m.virtual = true; m.round = e.stats && e.stats.round; }
    m.kick = new Date(e.kickoff).getTime(); m.live = e.status === 'live'; m.finished = e.status === 'finished' || e.status === 'cancelled';
    m.minute = e.minute || 0; m.score = e.score || [0, 0]; m.two = e.sport !== 'football'; m.hot = !!e.hot;
    m.prog = m.two && m.live ? Math.min(0.98, m.minute / 48) : 0;
    const st = e.stats || {};
    if (st.corners) m.st.corners = st.corners;
    if (st.goals) m.ev = st.goals.map(g => ({ min: g.min, side: g.side, type: 'goal' }));
    if (m.finished) { m.ft = m.score; if (e.ht) m.ht = e.ht; if (!m.endAt) { m.endAt = Date.now(); if (!RESULTS.includes(m)) RESULTS.unshift(m); } }
    const logos = {}; if (e.homeLogo) logos[e.home] = e.homeLogo; if (e.awayLogo) logos[e.away] = e.awayLogo; if (Object.keys(logos).length) LBA.setLogos(logos);
    m.noScore = m.live && !!(e.stats && e.stats.noScore);
    m.vs = VS.has(e.sport); m.period = e.period || null; m.sets = Array.isArray(st.sets) ? st.sets : null;
    if (prevScore && m.live && !m.two && (m.score[0] > prevScore[0] || m.score[1] > prevScore[1])) { m.goalAt = Date.now(); m.goalSide = m.score[0] > prevScore[0] ? 0 : 1; notifyGoal(m); }
    mapMarkets(m, e.markets);
    return m;
  }
  const mapBet = b => ({ id: b.id, at: new Date(b.placedAt).getTime(), type: b.type === 'multiple' ? `Multiple · ${b.legs.length} legs` : 'Single',
    legs: b.legs.map(l => ({ mid: l.eventId, mk: l.market, ok: l.outcome, odd: +l.odd, label: l.label, mname: l.marketName, match: l.match, result: l.result })),
    stake: +b.stake, odds: +b.odds, boost: b.boost, win: +b.potential, status: b.status, paid: b.paid == null ? null : +b.paid, cashout: b.cashout });
  async function liveBets() {
    if (!LIVE || !state.user) return;
    try {
      const was = new Map(state.bets.map(b => [String(b.id), b.status]));
      const [open, settled] = await Promise.all([API.bets.list('open'), API.bets.list('settled')]); state.bets = [...open, ...settled].map(mapBet);
      // a bet we saw open has just been settled as won → trophy (once per bet, also across reloads)
      let seen = []; try { seen = JSON.parse(localStorage.getItem('lba_trophies') || '[]'); } catch {}
      const fresh = state.bets.filter(b => b.status === 'won' && was.get(String(b.id)) === 'open' && !seen.includes(String(b.id)));
      if (fresh.length && window.Pages) {
        fresh.forEach(b => seen.push(String(b.id))); try { localStorage.setItem('lba_trophies', JSON.stringify(seen.slice(-200))); } catch {}
        const top = fresh.sort((a, b) => b.paid - a.paid)[0], total = fresh.reduce((t, b) => t + (+b.paid || 0), 0);
        Pages.trophy({ amount: total, source: 'Sport', ref: fresh.length > 1 ? `${fresh.length} tickets` : top.id, href: '#/bet/' + encodeURIComponent(top.id) });
      }
    } catch { /* keep what we have */ }
  }
  async function liveUser() {
    if (!API.token) { state.user = null; return; }
    try { state.user = mapUser(await API.auth.me()); if (state.user.country && state.user.country !== CC) { try { localStorage.setItem('lba_country', state.user.country); } catch {} location.reload(); } }
    catch (e) { if (e.status === 401) state.user = null; }
  }
  let refreshing = false, lastBetsSync = Date.now();
  async function liveRefresh() {
    if (!LIVE || refreshing) return; refreshing = true;
    try {
      const evs = await API.events.list({ limit: 400 });
      const seen = new Set(evs.map(e => e.id));
      evs.forEach(mapEvent);
      await refreshSlipEvents();
      MATCHES.forEach(m => { if (!m.virtual && !seen.has(m.id) && !state.slip.some(x => x.mid === m.id) && !m.finished && m.kick < Date.now() + 36e5) { m.live = false; m.finished = true; m.ft = m.score; } });
      if (state.route === 'match' && state.arg) { const e = await API.events.one(+state.arg).catch(() => null); if (e) mapEvent(e); }
      if (state.user && (['me', 'acct'].includes(state.route) || Date.now() - lastBetsSync > 30000)) { lastBetsSync = Date.now(); await liveUser(); await liveBets(); }
      syncSlipOdds(); updateLiveBadges();
      if (window.Account && Account.notices) Account.notices();
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
    if (window.Account && Account.prefetch) Account.prefetch();   // which sign-up methods can deliver a code
    // keep only the virtual league (browser-run rounds); real leagues come from the server
    { const v = LEAGUES[VLG]; MATCHES.length = 0; RESULTS.length = 0; LEAGUES.length = 0; v.idx = 0; LEAGUES.push(v); VLG_LIVE = 0; }
    await liveUser();
    if (window.Account && Account.notices) setTimeout(() => Account.notices(true), 1500);   // payment pop-ups when the app opens
    try { const evs = await API.events.list({ limit: 400 }); evs.forEach(mapEvent); } catch {}
    try { (await API.events.results()).forEach(mapEvent); } catch {}
    await liveBets();
    setInterval(liveRefresh, 5000);
    return true;
  }
  async function livePlaceBet() {
    const single = state.slipType === 'single';
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
      ['Your rights', 'You can ask for a copy of your data, correct it, or ask us to delete what we are not required to keep. You can withdraw marketing consent at any time. Write to info@letbetafrika.online.'],
      ['Security', 'Data is encrypted in transit and at rest. Access is limited to staff who need it. Passwords are stored hashed and are never visible to us.'],
      ['Cookies and storage', 'The app stores your country, login token and preferences on your device. We use analytics to understand how the app is used; no advertising trackers are placed without consent.'],
      ['Children', 'The Service is for adults only. We delete accounts found to belong to anyone under 18.'],
      ['Contact', 'LetBetAfrika Limited · info@letbetafrika.online'],
    ] },
  };
  function renderLegal(kind) {
    const L = LEGAL[kind] || LEGAL.terms;
    $('#legalTitle').textContent = L.title;
    $('#legalBody').innerHTML = `<h2>${L.title}</h2><div class="upd">Last updated ${L.updated}</div>` + L.sections.map(([h, t]) => `<h3>${h}</h3><p>${t}</p>`).join('') +
      `<p style="margin-top:24px"><a href="#/legal/${kind === 'terms' ? 'privacy' : 'terms'}">Read our ${kind === 'terms' ? 'Privacy Policy' : 'Terms & Conditions'} →</a></p>`;
  }

  /* ---------------- Router ---------------- */
  const PAGES = ['home', 'live', 'sports', 'jackpot', 'promos', 'me', 'match', 'league', 'virtuals', 'games', 'results', 'acct', 'play', 'deposit', 'withdraw', 'legal', 'register', 'login', 'forgot', 'list', 'codes', 'promo', 'bet', 'instant', 'game'];
  function go(r) { location.hash = '#/' + r; }
  const navStack = [];
  let firstRoute = true;
  function route() {
    const [r, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    // shared booking code links: #/code/LB7K2Q or ?code=LB7K2Q – the page opens with the code in the betslip
    const qCode = firstRoute && new URLSearchParams(location.search).get('code');
    if (qCode) { history.replaceState(null, '', location.pathname + location.hash); setTimeout(() => loadCode(qCode), 80); }
    if (r === 'code') { if (arg) setTimeout(() => loadCode(decodeURIComponent(arg)), 80); return location.replace('#/home'); }
    if (r === 'league' && LEAGUES[+arg] && LEAGUES[+arg].sport === 'vfootball') return location.replace('#/virtuals');   // the Virtual League has its own screen
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
    const navKey = page === 'match' || page === 'league' || page === 'legal' ? null : page === 'acct' ? (arg === 'bets' ? 'bets' : 'me') : page === 'play' || page === 'game' || page === 'instant' ? 'games' : ['deposit', 'withdraw'].includes(page) ? 'me' : page;
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
    if (window.Arcade && Arcade.handles(page)) Arcade.render(page, arg);
    if (page === 'legal') renderLegal(arg);
    if (page === 'match') {
      renderMatch(+arg);
      if (LIVE) API.events.one(+arg).then(e => { if (e && state.route === 'match' && +state.arg === e.id) { mapEvent(e); renderMatch(e.id, true); } }).catch(() => {});
    } else window.scrollTo(0, 0);
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

  const openSlip = () => { $('#betslip').classList.add('open'); $('#scrim').classList.add('on'); document.documentElement.classList.add('slip-open'); renderSlip(); };
  const closeSlip = () => { $('#betslip').classList.remove('open'); document.documentElement.classList.remove('slip-open'); if (!$('#drawer').classList.contains('open')) $('#scrim').classList.remove('on'); renderSlip(); };
  const closeDrawer = () => { $('#drawer').classList.remove('open'); if (!$('#betslip').classList.contains('open')) $('#scrim').classList.remove('on'); };

  /* ---------------- Betslip sheet follows the finger (phones) ----------------
     Swipe up on the betslip pill to pull the sheet open; drag the header down – or pull down on the list when it is
     scrolled to the top – to close it. The sheet tracks the finger 1:1 (rubber band past the top), the backdrop dims
     with it, and on release it springs open or closed by distance and flick speed.                               */
  (() => {
    const slip = $('#betslip'), scrim = $('#scrim'), body = $('#bsBody');
    const phone = () => matchMedia('(max-width: 1023px)').matches;
    const height = () => slip.getBoundingClientRect().height || innerHeight * 0.6;
    let d = null;
    const at = e => (e.touches && e.touches[0] ? e.touches[0] : e).clientY;
    const place = y => { slip.style.transform = `translateY(${y}px)`; scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / height()))); };
    // move / end listen on the touched element itself: touch events keep going to it even if the slip re-renders
    const opt = { passive: false };
    const listen = (el, on) => { const f = on ? 'addEventListener' : 'removeEventListener'; el[f]('touchmove', move, opt); el[f]('touchend', end); el[f]('touchcancel', end); };
    function start(e, from) {
      if (!phone() || (e.touches && e.touches.length > 1)) return;
      if (from !== 'pill' && !slip.classList.contains('open')) return;
      if (d) listen(d.el, false);
      const y = at(e), t = performance.now();
      d = { from, el: e.target, y0: y, y, t, v: 0, base: 0, moved: false };
      listen(d.el, true);
    }
    const drop = () => { if (d) listen(d.el, false); d = null; };
    function move(e) {
      if (!d) return;
      const y = at(e), dy = y - d.y0, now = performance.now();
      if (!d.moved) {
        if (Math.abs(dy) < 6) return;
        if (d.from === 'body' && (body.scrollTop > 0 || dy < 0)) return drop();   // the list scrolls instead
        if (d.from === 'pill' && dy > 0) return drop();
        d.moved = true;
        if (d.from === 'pill') { slip.classList.add('open'); scrim.classList.add('on'); document.documentElement.classList.add('slip-open'); renderSlip(); }
        slip.classList.add('dragging'); scrim.classList.add('dragging');
        if (d.from === 'pill') d.base = height();
      }
      if (e.cancelable) e.preventDefault();
      d.v = 0.8 * ((y - d.y) / Math.max(1, now - d.t)) + 0.2 * d.v; d.y = y; d.t = now;
      const off = d.base + dy;
      place(off < 0 ? off / 4 : off);   // rubber band above fully open
    }
    function end() {
      if (!d) return;
      const g = d; drop();
      if (!g.moved) return;
      const off = g.base + (g.y - g.y0), h = height();
      const close = g.v > 0.45 || (g.v > -0.45 && off > h * (g.from === 'pill' ? 0.72 : 0.3));
      slip.classList.remove('dragging'); scrim.classList.remove('dragging');
      slip.style.transform = ''; scrim.style.opacity = '';
      if (close) closeSlip(); else openSlip();
    }
    ['.bs-head', '.bs-tools', '.bs-tabs'].forEach(s => { const el = slip.querySelector(s); if (el) el.addEventListener('touchstart', e => start(e, 'sheet'), { passive: true }); });
    body.addEventListener('touchstart', e => start(e, 'body'), { passive: true });
    $('#slipPill').addEventListener('touchstart', e => start(e, 'pill'), { passive: true });
  })();
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
  document.addEventListener('input', e => {
    if (e.target.id !== 'mkQ') return;
    state.mkQ = e.target.value; const m = byId(+state.arg); if (m) $('#mdMarkets').innerHTML = mdMarketsHTML(m);
  });
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
    if (d.copy) { navigator.clipboard?.writeText(d.copy).catch(() => {}); return toast(/^https?:/.test(d.copy) ? 'Link copied' : 'Code copied'); }
    if (d.break) { if (!state.user) return openModal('loginModal'); if (LIVE) { const days = { '24 hours': 1, '7 days': 7, '30 days': 30, '6 months': 182 }[d.break] || 1; API.auth.limits({ selfExclude: new Date(Date.now() + days * 864e5).toISOString() }).then(() => toast(`Your break has started (${d.break})`)).catch(e => toast(apiErr(e), 'err')); return; } return toast(`Self-exclusion request for ${d.break} received`); }
    if (d.soon) { e.preventDefault(); return toast(`${d.soon} is coming soon`); }
    if ('chat' in d) return toast('Live chat will connect to your support desk');
    if (d.list) { state.list = d.list; return renderHome(); }
    if (d.hview) { state.homeView = d.hview; return renderHome(); }
    if (d.filter === 'today') { state.list = 'today'; $$('[data-list]').forEach(b => b.classList.toggle('active', b.dataset.list === 'today')); renderHome(); return $('.list-tabs').scrollIntoView({ behavior: 'smooth' }); }
    if (d.market) { state.market[d.msport] = d.market; return renderCurrent(true); }
    if (d.bstype) { state.slipType = d.bstype; return renderSlip(); }
    if (d.rm) {   // the row folds away, then the selection is removed
      const row = t.closest('.bs-item');
      if (!row || row.classList.contains('bs-out') || matchMedia('(prefers-reduced-motion: reduce)').matches) { state.slip.splice(+d.rm, 1); saveSlip(); return renderAfterSlipChange(); }
      row.style.height = row.offsetHeight + 'px'; row.getBoundingClientRect(); row.classList.add('bs-out');
      return setTimeout(() => { const k = state.slip.findIndex(s => String(s.mid) === row.dataset.slipMid); if (k > -1) state.slip.splice(k, 1); saveSlip(); renderAfterSlipChange(); }, 230);
    }
    if (d.add) { $('#bsStake').value = (+$('#bsStake').value || 0) + +d.add; return renderSlip(); }
    if (d.amt) { $('#depAmt').value = d.amt; return; }
    if (d.bets) { state.betsTab = d.bets; return renderMe(); }
    if (d.mdtab) { state.mdTab = d.mdtab; return renderMatch(+state.arg, true); }
    if (d.group) { state.mdGroup = d.group; return renderMatch(+state.arg, true); }
    if (t.hasAttribute('data-search-open')) return openSearch();
    if (t.hasAttribute('data-mksearch')) { state.mkQ = state.mkQ == null ? '' : null; renderMatch(+state.arg, true); if (state.mkQ != null) setTimeout(() => $('#mkQ') && $('#mkQ').focus(), 30); return; }
    if (d.lcycle) return openLinePicker(d.lcycle);
    if (d.lpick) { const [mid, mk, L] = d.lpick.split('|'), m = byId(mid); if (!m) return; m.uiLine = m.uiLine || {}; m.uiLine[mk] = +L; closeModals(); return renderCurrent(true); }
    if (d.mkinfo) return showMarketInfo(d.mkinfo);
    if (d.mkfav) { const i = state.favMk.indexOf(d.mkfav); i > -1 ? state.favMk.splice(i, 1) : state.favMk.push(d.mkfav); store.set('favmk', state.favMk); toast(i > -1 ? 'Removed from favourite markets' : 'Added to favourite markets'); return renderMatch(+state.arg, true); }
    if (d.collapse) { state.collapsed.has(d.collapse) ? state.collapsed.delete(d.collapse) : state.collapsed.add(d.collapse); const blk = t.closest('.mkt'); blk.classList.toggle('closed'); t.setAttribute('aria-expanded', !blk.classList.contains('closed')); return; }
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
  $('#logoutBtn').addEventListener('click', () => { window.Account && Account.persist(state.user); if (LIVE) API.auth.logout(); state.user = null; state.bets = []; state.emailStep = null; store.del('user'); renderAuth(); renderMe(); toast('Logged out'); });
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
        const { selections: list, expired = 0 } = await API.bets.load(code);
        if (!list.length) return toast(expired ? 'Every game in this code has already started' : 'Booking code not found or expired', 'err');
        state.slip = list.map(s => ({ mid: s.eventId, mk: s.market, ok: s.outcome, odd: s.odd, label: s.label, mname: s.marketName, match: s.match, live: s.live, stake: C.defStake }));
        state.slipType = list.length > 1 ? 'multi' : 'single';
        await refreshSlipEvents(true); syncSlipOdds();
        saveSlip(); closeModals(); renderAfterSlipChange(); openSlip();
        toast(`Loaded ${list.length} selection${list.length === 1 ? '' : 's'} from ${code}` + (expired ? ` · ${expired} already started` : ''));
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
          if (m.minute === 46 && !m.ht) m.ht = [...m.score];
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
  // only the ways players can really pay today (Ghana: Mobile Money on all three networks · Nigeria: bank transfer)
  $('#payRow').innerHTML = (CC === 'GH' ? ['MTN MoMo', 'Telecel Cash', 'AT Money'] : ['Bank Transfer']).map(x => `<span>${x}</span>`).join('');
  $('#footLic').textContent = 'Age 18 and above only. Betting can be addictive – please play responsibly.';
  if (window.Games) Games.initCrash({
    C, money, whole, toast, apiErr,
    live: () => LIVE,
    user: () => state.user,
    login: () => openModal('loginModal'),
    deposit: () => go('deposit'),
    setBalance: b => { if (!state.user) return; state.user.balance = b; saveUser(); renderAuth(); },
    refreshBalance: () => API.wallet.balance().then(r => { if (state.user) { state.user.balance = r.balance; saveUser(); renderAuth(); } }).catch(() => {}),
    debit: (v, why) => { state.user.balance -= v; addTx(why, -v); saveUser(); renderAuth(); },
    credit: (v, why) => { if (!state.user) return; state.user.balance += v; addTx(why, v); saveUser(); renderAuth(); },
  });
  (async () => {
    const live = await liveInit().catch(() => false);
    if (live) await refreshSlipEvents(true);
    if (!live) seedResults();
    if (live) { VR.endsAt = 0; VR.ids = []; vSync(); } else vNewRound();
    syncSlipOdds();
    renderRails(); renderAuth(); renderSlip(); updateLiveBadges();
    window.addEventListener('hashchange', route);
    route();
  })();
  // internal API used by account.js (sign-up, login, reset, deposit, withdraw pages)
  window.LBA_APP = { state, C, CC, store, money, whole, esc, toast, saveUser, addTx, renderAuth, renderMe, go, openModal, r2,
    get live() { return LIVE; }, exHead, apiErr, mapUser, liveBets, liveUser,
    MATCHES, LEAGUES, SPORTS, RESULTS, VISIBLE, sportOf, byId, listMarkets, mktFor, matchRow, oddBtn, crest, fmtKick, fmtDay, liveLabel, isHot,
    saveSlip, saveBets, renderSlip, openSlip, renderCurrent, renderAfterSlipChange, openSearch, loadCode, shareCode, legResult, cashoutValue, naira, closeModals, betsHTML };
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
