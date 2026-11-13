/* =========================================================
   BetNova – front-end prototype logic (demo data, no backend)
   ========================================================= */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const naira = n => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const store = {
    get(k, d) { try { const v = localStorage.getItem('bn_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bn_' + k, JSON.stringify(v)); } catch {} }
  };

  /* ---------------- Demo data ---------------- */
  const SPORTS = [
    { id: 'football', name: 'Football', em: '⚽', n: 1248 },
    { id: 'basketball', name: 'Basketball', em: '🏀', n: 214 },
    { id: 'tennis', name: 'Tennis', em: '🎾', n: 186 },
    { id: 'icehockey', name: 'Ice Hockey', em: '🏒', n: 92 },
    { id: 'volleyball', name: 'Volleyball', em: '🏐', n: 64 },
    { id: 'tabletennis', name: 'Table Tennis', em: '🏓', n: 140 },
    { id: 'esports', name: 'eSports', em: '🎮', n: 77 },
    { id: 'cricket', name: 'Cricket', em: '🏏', n: 23 },
    { id: 'rugby', name: 'Rugby', em: '🏉', n: 18 },
    { id: 'boxing', name: 'Boxing', em: '🥊', n: 12 },
    { id: 'baseball', name: 'Baseball', em: '⚾', n: 31 },
    { id: 'handball', name: 'Handball', em: '🤾', n: 40 },
    { id: 'darts', name: 'Darts', em: '🎯', n: 15 },
    { id: 'mma', name: 'MMA', em: '🥋', n: 9 },
  ];
  const LEAGUES = {
    football: [
      { name: 'England · Premier League', flag: '🇬🇧', teams: ['Arsenal','Chelsea','Liverpool','Man City','Man Utd','Tottenham','Newcastle','Aston Villa','Brighton','West Ham'] },
      { name: 'Spain · LaLiga', flag: '🇪🇸', teams: ['Real Madrid','Barcelona','Atletico Madrid','Sevilla','Villarreal','Real Sociedad','Valencia','Betis'] },
      { name: 'Italy · Serie A', flag: '🇮🇹', teams: ['Inter','AC Milan','Juventus','Napoli','Roma','Lazio','Atalanta','Fiorentina'] },
      { name: 'Germany · Bundesliga', flag: '🇩🇪', teams: ['Bayern Munich','Dortmund','Leverkusen','RB Leipzig','Frankfurt','Stuttgart'] },
      { name: 'Nigeria · NPFL', flag: '🇳🇬', teams: ['Enyimba','Rangers Intl','Kano Pillars','Rivers Utd','Shooting Stars','Remo Stars','Plateau Utd','Lobi Stars'] },
      { name: 'UEFA Champions League', flag: '🇪🇺', teams: ['PSG','Benfica','Porto','Ajax','Celtic','PSV','Club Brugge','Galatasaray'] },
    ],
    basketball: [
      { name: 'USA · NBA', flag: '🇺🇸', teams: ['Lakers','Celtics','Warriors','Bucks','Nuggets','Heat','Knicks','Suns'] },
      { name: 'Euroleague', flag: '🇪🇺', teams: ['Real Madrid','Olympiacos','Fenerbahce','Panathinaikos','Barcelona','Monaco'] },
    ],
    tennis: [
      { name: 'ATP Finals', flag: '🎾', teams: ['Sinner J.','Alcaraz C.','Djokovic N.','Zverev A.','Medvedev D.','Rune H.','Fritz T.','Ruud C.'] },
    ],
    default: [
      { name: 'International', flag: '🌍', teams: ['Team Alpha','Team Bravo','Team Delta','Team Echo','Team Falcon','Team Titan'] },
    ],
  };
  const TWO_WAY = ['basketball','tennis','tabletennis','esports','volleyball','baseball','boxing','mma','darts'];

  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r2 = n => Math.round(n * 100) / 100;
  const pick = a => a[Math.floor(rnd() * a.length)];

  function makeOdds(twoWay) {
    if (twoWay) {
      const p = 0.25 + rnd() * 0.5;
      return { '1x2': [r2(0.94 / p), r2(0.94 / (1 - p))] };
    }
    let h = 0.2 + rnd() * 0.5, d = 0.22 + rnd() * 0.08, a = 1 - h - d;
    if (a < 0.08) { a = 0.08; h = 1 - d - a; }
    const m = 0.93;
    const ov = 0.4 + rnd() * 0.25, gg = 0.42 + rnd() * 0.2;
    return {
      '1x2': [r2(m / h), r2(m / d), r2(m / a)],
      dc: [r2(m / (h + d)), r2(m / (h + a)), r2(m / (d + a))],
      ou: [r2(m / ov), r2(m / (1 - ov))],
      gg: [r2(m / gg), r2(m / (1 - gg))],
    };
  }
  const MARKET_LABELS = {
    '1x2': { name: '1X2', two: ['1', '2'], three: ['1', 'X', '2'] },
    dc: { name: 'Double Chance', three: ['1X', '12', 'X2'] },
    ou: { name: 'Over/Under 2.5', two: ['Over', 'Under'] },
    gg: { name: 'GG/NG', two: ['GG', 'NG'] },
  };

  const now = Date.now();
  let MATCHES = [];
  let mid = 1000;
  SPORTS.forEach(sp => {
    const leagues = LEAGUES[sp.id] || LEAGUES.default;
    const twoWay = TWO_WAY.includes(sp.id);
    leagues.forEach(lg => {
      const teams = [...lg.teams].sort(() => rnd() - 0.5);
      for (let i = 0; i + 1 < teams.length; i += 2) {
        const live = rnd() < 0.3;
        const kick = live ? now - Math.floor(rnd() * 80) * 60000 : now + Math.floor(rnd() * 72 + 1) * 3600000 + Math.floor(rnd() * 4) * 900000;
        MATCHES.push({
          id: mid++, sport: sp.id, league: lg.name, flag: lg.flag, home: teams[i], away: teams[i + 1],
          kick, live, twoWay, odds: makeOdds(twoWay),
          minute: live ? Math.floor(rnd() * 85) + 1 : 0,
          score: live ? [Math.floor(rnd() * 3), Math.floor(rnd() * 3)] : [0, 0],
          markets: Math.floor(rnd() * 180) + 40,
        });
      }
    });
  });

  /* ---------------- State ---------------- */
  const state = {
    sport: 'football', liveSport: 'all', list: 'highlights', market: '1x2',
    slip: store.get('slip', []), slipType: 'multi', user: store.get('user', null),
    bets: store.get('bets', []), jp: {}, betsTab: 'open',
  };
  const saveSlip = () => store.set('slip', state.slip);

  /* ---------------- Utilities ---------------- */
  const toast = (msg, type = 'ok') => {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast on ' + type;
    clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2400);
  };
  const fmtKick = ts => {
    const d = new Date(ts), today = new Date();
    const tm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return 'Today ' + tm;
    const tmr = new Date(today); tmr.setDate(today.getDate() + 1);
    if (d.toDateString() === tmr.toDateString()) return 'Tomorrow ' + tm;
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' }) + ' ' + tm;
  };
  const labelsFor = (m, mk) => {
    const L = MARKET_LABELS[mk];
    return m.twoWay ? L.two : (L.three || L.two);
  };
  const oddsFor = (m, mk) => m.twoWay ? m.odds['1x2'] : m.odds[mk];
  const isSel = (id, mk, i) => state.slip.some(s => s.id === id && s.mk === mk && s.i === i);

  function oddBtn(m, mk, i, val, label, showLabel) {
    return `<button class="odd ${isSel(m.id, mk, i) ? 'sel' : ''}" data-id="${m.id}" data-mk="${mk}" data-i="${i}">
      ${showLabel ? `<small>${label}</small>` : ''}${val.toFixed(2)}</button>`;
  }

  /* ---------------- Renderers ---------------- */
  function renderSportTabs(el, active, withAll) {
    const list = withAll ? [{ id: 'all', name: 'All', em: '🔥' }, ...SPORTS.filter(s => MATCHES.some(m => m.live && m.sport === s.id))] : SPORTS;
    el.innerHTML = list.map(s => `<button data-sport="${s.id}" class="${s.id === active ? 'active' : ''}"><span class="em">${s.em}</span>${s.name}</button>`).join('');
  }

  function matchRow(m, mk) {
    const mkUse = m.twoWay ? '1x2' : mk;
    const odds = oddsFor(m, mkUse) || [];
    const labels = labelsFor(m, mkUse);
    const meta = m.live
      ? `<span class="live">● ${m.sport === 'football' ? m.minute + "'" : 'LIVE'}</span>`
      : `<span>${fmtKick(m.kick)}</span>`;
    return `<div class="match" style="--n:${odds.length}">
      <div class="m-info">
        <div class="m-meta">${meta}<span>ID ${m.id}</span></div>
        <div class="m-team"><span>${m.home}</span>${m.live ? `<b>${m.score[0]}</b>` : ''}</div>
        <div class="m-team"><span>${m.away}</span>${m.live ? `<b>${m.score[1]}</b>` : ''}</div>
        <div class="m-more">+${m.markets} markets</div>
      </div>
      <div class="m-odds">${odds.map((o, i) => oddBtn(m, mkUse, i, o)).join('')}</div>
    </div>`;
  }

  function groupRender(list, mk) {
    if (!list.length) return `<div class="empty"><span class="big">🗓️</span>No events available right now.</div>`;
    const groups = {};
    list.forEach(m => (groups[m.league] ||= []).push(m));
    return Object.entries(groups).map(([lg, ms]) => {
      const m0 = ms[0], mkUse = m0.twoWay ? '1x2' : mk, labels = labelsFor(m0, mkUse);
      return `<div class="league-block">
        <div class="league-head" style="--n:${labels.length}"><span class="flag">${m0.flag}</span>${lg}
          <div class="cols">${labels.map(l => `<span>${l}</span>`).join('')}</div></div>
        ${ms.map(m => matchRow(m, mk)).join('')}
      </div>`;
    }).join('');
  }

  function renderHome() {
    renderSportTabs($('#sportTabs'), state.sport);
    $('#marketTabs').style.display = TWO_WAY.includes(state.sport) ? 'none' : '';
    let list = MATCHES.filter(m => m.sport === state.sport && !m.live);
    const endToday = new Date(); endToday.setHours(23, 59, 59);
    if (state.list === 'today') list = list.filter(m => m.kick <= endToday.getTime());
    if (state.list === 'upcoming') list = list.sort((a, b) => a.kick - b.kick);
    if (state.list === 'highlights') list = list.sort((a, b) => b.markets - a.markets).slice(0, 14);
    $('#matchList').innerHTML = groupRender(list, state.market);
    renderLiveStrip();
  }

  function renderLiveStrip() {
    const live = MATCHES.filter(m => m.live).slice(0, 10);
    $('#liveStrip').innerHTML = live.map(m => {
      const labels = labelsFor(m, '1x2');
      return `<div class="live-card">
        <div class="lc-top"><span>${m.flag} ${m.league}</span><span class="lc-min">${m.sport === 'football' ? m.minute + "'" : 'LIVE'}</span></div>
        <div class="lc-team"><span>${m.home}</span><b>${m.score[0]}</b></div>
        <div class="lc-team"><span>${m.away}</span><b>${m.score[1]}</b></div>
        <div class="lc-odds" style="grid-template-columns:repeat(${labels.length},1fr)">${m.odds['1x2'].map((o, i) => oddBtn(m, '1x2', i, o, labels[i], true)).join('')}</div>
      </div>`;
    }).join('');
  }

  function renderLive() {
    renderSportTabs($('#liveSportTabs'), state.liveSport, true);
    const list = MATCHES.filter(m => m.live && (state.liveSport === 'all' || m.sport === state.liveSport));
    $('#liveCount').textContent = list.length + ' events';
    $('#liveList').innerHTML = groupRender(list, '1x2');
  }

  function renderRails() {
    const top = [...new Set(MATCHES.filter(m => m.sport === 'football').map(m => m.league))];
    $('#leagueRail').innerHTML = top.map(l => `<li data-sport="football">${MATCHES.find(m => m.league === l).flag} ${l.split(' · ').pop()}</li>`).join('');
    $('#sportRail').innerHTML = SPORTS.map(s => `<li data-sport="${s.id}">${s.em} ${s.name}</li>`).join('');
  }

  function renderAZ(q = '') {
    q = q.toLowerCase();
    $('#azList').innerHTML = [...SPORTS].sort((a, b) => a.name.localeCompare(b.name))
      .filter(s => !q || s.name.toLowerCase().includes(q) || (LEAGUES[s.id] || []).some(l => l.name.toLowerCase().includes(q)))
      .map(s => `<li data-sport="${s.id}"><span class="em">${s.em}</span>${s.name}<span class="cnt">${s.n}</span></li>`).join('');
  }

  /* ---------------- Betslip ---------------- */
  const BOOST = n => n >= 20 ? 1000 : n >= 15 ? 500 : n >= 10 ? 200 : n >= 5 ? 50 : n >= 3 ? 5 : 0;

  function addToSlip(id, mk, i) {
    const m = MATCHES.find(x => x.id === id);
    const existing = state.slip.findIndex(s => s.id === id);
    if (existing > -1 && state.slip[existing].mk === mk && state.slip[existing].i === i) {
      state.slip.splice(existing, 1);
    } else {
      if (state.slip.length >= 30 && existing === -1) return toast('Maximum 30 selections', 'err');
      const sel = { id, mk, i, odd: oddsFor(m, mk)[i], pick: labelsFor(m, mk)[i], market: MARKET_LABELS[mk].name, match: `${m.home} vs ${m.away}`, stake: 100 };
      if (existing > -1) state.slip[existing] = sel; else state.slip.push(sel);
    }
    saveSlip(); refreshAll();
  }

  function renderSlip() {
    const n = state.slip.length;
    $('#bsCount').textContent = n;
    $('#navBadge').textContent = n; $('#navBadge').dataset.z = n ? 0 : 1;
    $('#pillCount').textContent = n;
    const total = state.slip.reduce((a, s) => a * s.odd, 1);
    $('#pillOdds').textContent = 'Odds ' + (n ? total.toFixed(2) : '0.00');
    $('#slipPill').classList.toggle('show', n > 0 && !$('#betslip').classList.contains('open'));
    $$('.bs-tabs button').forEach(b => b.classList.toggle('active', b.dataset.bstype === state.slipType));

    if (!n) {
      $('#bsBody').innerHTML = `<div class="empty"><span class="big">🎫</span>Your betslip is empty.<br>Tap on any odds to add a selection.</div>`;
      $('#bsFoot').style.display = 'none'; return;
    }
    $('#bsFoot').style.display = '';
    const single = state.slipType === 'single';
    $('#bsBody').innerHTML = state.slip.map((s, k) => `<div class="bs-item">
      <button class="x" data-rm="${k}">×</button>
      <div class="pick"><span>${s.pick}</span><b>${s.odd.toFixed(2)}</b></div>
      <div class="mk">${s.market} · ${s.match}</div>
      ${single ? `<input type="number" min="100" value="${s.stake}" data-stake="${k}"><div class="sw">Potential win: ${naira(s.stake * s.odd)}</div>` : ''}
    </div>`).join('');

    $('.stake-row').style.display = single ? 'none' : '';
    $('.bs-foot .chips').style.display = single ? 'none' : '';
    const stake = +$('#bsStake').value || 0;
    if (single) {
      const totStake = state.slip.reduce((a, s) => a + (+s.stake || 0), 0);
      const win = state.slip.reduce((a, s) => a + (+s.stake || 0) * s.odd, 0);
      $('#bsOdds').textContent = '—';
      $('#bsBoost').textContent = 'N/A';
      $('#bsWin').textContent = naira(win);
      $('#bsPlace').textContent = `Place Bet ${naira(totStake)}`;
    } else {
      const boost = BOOST(n);
      $('#bsOdds').textContent = total.toFixed(2);
      $('#bsBoost').textContent = boost + '%';
      const base = stake * total;
      $('#bsWin').textContent = naira(base + (base - stake) * boost / 100);
      $('#bsPlace').textContent = 'Place Bet';
    }
  }

  function placeBet() {
    if (!state.user) { openModal('loginModal'); return toast('Please login to place a bet', 'err'); }
    const single = state.slipType === 'single';
    const stake = single ? state.slip.reduce((a, s) => a + (+s.stake || 0), 0) : +$('#bsStake').value;
    if (!stake || stake < 100) return toast('Minimum stake is ₦100', 'err');
    if (stake > state.user.balance) { openModal('depositModal'); return toast('Insufficient balance – please deposit', 'err'); }
    state.user.balance -= stake;
    const total = state.slip.reduce((a, s) => a * s.odd, 1);
    if (single) {
      state.slip.forEach(s => state.bets.unshift({ id: Date.now() + Math.random(), at: Date.now(), type: 'Single', legs: [s], stake: +s.stake, odds: s.odd, win: s.stake * s.odd, status: 'open' }));
    } else {
      const boost = BOOST(state.slip.length), base = stake * total;
      state.bets.unshift({ id: Date.now(), at: Date.now(), type: `Multiple (${state.slip.length})`, legs: [...state.slip], stake, odds: total, win: base + (base - stake) * boost / 100, status: 'open' });
    }
    state.slip = []; saveSlip();
    store.set('user', state.user); store.set('bets', state.bets);
    toast('✅ Bet placed successfully!');
    closeSlip(); refreshAll();
  }

  function bookCode() {
    const code = 'BN' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const codes = store.get('codes', {}); codes[code] = state.slip; store.set('codes', codes);
    navigator.clipboard?.writeText(code).catch(() => {});
    toast(`Booking code: ${code} (copied)`);
  }

  /* ---------------- My bets ---------------- */
  function renderMe() {
    const u = state.user;
    $('#meName').textContent = u ? '+234 ' + u.phone : 'Guest';
    $('#meSub').textContent = u ? 'Verified account' : 'Login to view your bets and balance';
    $('#meBal').textContent = naira(u ? u.balance : 0);
    $$('[data-bets]').forEach(b => b.classList.toggle('active', b.dataset.bets === state.betsTab));
    const list = state.bets.filter(b => state.betsTab === 'open' ? b.status === 'open' : b.status !== 'open');
    $('#myBets').innerHTML = !u
      ? `<div class="empty"><span class="big">🔒</span><button class="btn btn-accent sm" data-open="loginModal">Login</button></div>`
      : !list.length ? `<div class="empty"><span class="big">🎫</span>No ${state.betsTab} bets yet.</div>`
      : list.map(b => `<div class="bet-card">
          <div class="bh"><span>${b.type} · ${new Date(b.at).toLocaleString()}</span><span class="status ${b.status}">${b.status.toUpperCase()}</span></div>
          ${b.legs.map(l => `<div class="bl"><span>${l.match}<br><small class="muted">${l.market}: ${l.pick}</small></span><b>${l.odd.toFixed(2)}</b></div>`).join('')}
          <div class="bf"><span>Stake ${naira(b.stake)}</span><span class="accent">To win ${naira(b.win)}</span></div>
        </div>`).join('');
  }

  /* ---------------- Jackpot ---------------- */
  const JP = MATCHES.filter(m => m.sport === 'football' && !m.live).slice(0, 12);
  function renderJackpot() {
    $('#jackpotList').innerHTML = JP.map((m, k) => `<div class="jp-row">
      <span class="n">${k + 1}</span><span class="t">${m.home}<br>${m.away}</span>
      <div class="opts">${['1', 'X', '2'].map(o => `<button data-jp="${m.id}" data-o="${o}" class="${state.jp[m.id] === o ? 'sel' : ''}">${o}</button>`).join('')}</div>
    </div>`).join('');
    const n = Object.keys(state.jp).length;
    $('#jpPicked').textContent = `${n}/12 picked`;
    $('#jpSubmit').disabled = n < 12;
  }
  function tickCountdown() {
    const end = new Date(); end.setDate(end.getDate() + ((6 - end.getDay() + 7) % 7 || 7)); end.setHours(15, 0, 0, 0);
    let s = Math.max(0, (end - Date.now()) / 1000 | 0);
    const parts = [['Days', 86400], ['Hrs', 3600], ['Min', 60], ['Sec', 1]].map(([l, d]) => { const v = s / d | 0; s -= v * d; return `<div><b>${String(v).padStart(2, '0')}</b><span>${l}</span></div>`; });
    $('#countdown').innerHTML = parts.join('');
  }

  /* ---------------- Auth / header ---------------- */
  function renderAuth() {
    $('#authArea').innerHTML = state.user
      ? `<div class="balance"><small>Balance</small><b>${naira(state.user.balance)}</b></div><button class="btn btn-accent sm" data-open="depositModal">Deposit</button>`
      : `<button class="btn btn-ghost sm" data-open="loginModal">Login</button><button class="btn btn-accent sm" data-open="registerModal">Join Now</button>`;
  }

  /* ---------------- Navigation ---------------- */
  function go(page) {
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    $$('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
    closeDrawer(); closeSlip();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (page === 'live') renderLive();
    if (page === 'me') renderMe();
    if (page === 'jackpot') renderJackpot();
  }
  const openSlip = () => { $('#betslip').classList.add('open'); $('#scrim').classList.add('on'); renderSlip(); };
  const closeSlip = () => { $('#betslip').classList.remove('open'); if (!$('#drawer').classList.contains('open')) $('#scrim').classList.remove('on'); renderSlip(); };
  const closeDrawer = () => { $('#drawer').classList.remove('open'); if (!$('#betslip').classList.contains('open')) $('#scrim').classList.remove('on'); };
  const openModal = id => { $$('.modal').forEach(m => m.classList.remove('open')); $('#' + id).classList.add('open'); };
  const closeModals = () => $$('.modal').forEach(m => m.classList.remove('open'));

  function refreshAll() {
    renderHome(); renderSlip(); renderAuth();
    if ($('#page-live').classList.contains('active')) renderLive();
    if ($('#page-me').classList.contains('active')) renderMe();
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('button, a, li');
    if (!t) return;
    if (t.tagName === 'A' && t.getAttribute('href') === '#') e.preventDefault();

    if (t.classList.contains('odd')) return addToSlip(+t.dataset.id, t.dataset.mk, +t.dataset.i);
    if (t.dataset.page) return go(t.dataset.page);
    if (t.dataset.open) {
      if (t.dataset.open === 'depositModal') {
        if (!state.user) return openModal('loginModal');
        const w = t.dataset.mode === 'withdraw';
        $('#depTitle').textContent = w ? 'Withdraw' : 'Deposit'; $('#depBtn').textContent = w ? 'Withdraw' : 'Deposit';
        $('#depositForm').dataset.mode = w ? 'withdraw' : 'deposit';
      }
      closeDrawer(); return openModal(t.dataset.open);
    }
    if (t.dataset.switch) { e.preventDefault(); return openModal(t.dataset.switch); }
    if (t.hasAttribute('data-close')) return closeModals();
    if (t.dataset.sport) {
      if (t.closest('#liveSportTabs')) { state.liveSport = t.dataset.sport; return renderLive(); }
      state.sport = t.dataset.sport; state.market = '1x2';
      $$('#marketTabs button').forEach(b => b.classList.toggle('active', b.dataset.market === '1x2'));
      go('home'); return renderHome();
    }
    if (t.dataset.list) { state.list = t.dataset.list; $$('[data-list]').forEach(b => b.classList.toggle('active', b === t)); return renderHome(); }
    if (t.dataset.filter === 'today') { state.list = 'today'; $$('[data-list]').forEach(b => b.classList.toggle('active', b.dataset.list === 'today')); renderHome(); return $('.list-tabs').scrollIntoView({ behavior: 'smooth' }); }
    if (t.dataset.market) { state.market = t.dataset.market; $$('[data-market]').forEach(b => b.classList.toggle('active', b === t)); return renderHome(); }
    if (t.dataset.bstype) { state.slipType = t.dataset.bstype; return renderSlip(); }
    if (t.dataset.rm) { state.slip.splice(+t.dataset.rm, 1); saveSlip(); return refreshAll(); }
    if (t.dataset.add) { $('#bsStake').value = (+$('#bsStake').value || 0) + +t.dataset.add; return renderSlip(); }
    if (t.dataset.amt) { $('#depAmt').value = t.dataset.amt; return; }
    if (t.dataset.bets) { state.betsTab = t.dataset.bets; return renderMe(); }
    if (t.dataset.jp) {
      state.jp[t.dataset.jp] === t.dataset.o ? delete state.jp[t.dataset.jp] : state.jp[t.dataset.jp] = t.dataset.o;
      return renderJackpot();
    }
    switch (t.id) {
      case 'menuBtn': $('#drawer').classList.add('open'); $('#scrim').classList.add('on'); break;
      case 'navSlip': case 'slipPill': openSlip(); break;
      case 'bsClose': closeSlip(); break;
      case 'bsClear': state.slip = []; saveSlip(); refreshAll(); break;
      case 'bsPlace': placeBet(); break;
      case 'bsBook': bookCode(); break;
      case 'jpSubmit':
        if (!state.user) { openModal('loginModal'); break; }
        if (state.user.balance < 100) { openModal('depositModal'); toast('Insufficient balance', 'err'); break; }
        state.user.balance -= 100; store.set('user', state.user); state.jp = {}; renderJackpot(); renderAuth();
        toast('🏆 Jackpot ticket submitted. Good luck!'); break;
    }
  });
  $('#scrim').addEventListener('click', () => { closeSlip(); closeDrawer(); });
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));
  $('#bsStake').addEventListener('input', renderSlip);
  $('#bsBody').addEventListener('input', e => {
    if (e.target.dataset.stake) {
      state.slip[+e.target.dataset.stake].stake = +e.target.value; saveSlip();
      const s = state.slip[+e.target.dataset.stake];
      e.target.nextElementSibling.textContent = 'Potential win: ' + naira(s.stake * s.odd);
      const tot = state.slip.reduce((a, x) => a + (+x.stake || 0), 0);
      $('#bsWin').textContent = naira(state.slip.reduce((a, x) => a + (+x.stake || 0) * x.odd, 0));
      $('#bsPlace').textContent = `Place Bet ${naira(tot)}`;
    }
  });
  $('#sportSearch').addEventListener('input', e => renderAZ(e.target.value));

  $$('form[data-auth]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const phone = f.phone.value.replace(/\D/g, '');
    if (phone.length < 10) return toast('Enter a valid mobile number', 'err');
    const reg = f.dataset.auth === 'register';
    state.user = store.get('user', null) && !reg ? store.get('user') : { phone, balance: reg ? 0 : 25000 };
    state.user.phone = phone;
    store.set('user', state.user); closeModals(); refreshAll();
    toast(reg ? '🎉 Welcome to BetNova! Make your first deposit to claim 200% bonus.' : 'Welcome back!');
  }));
  $('#depositForm').addEventListener('submit', e => {
    e.preventDefault();
    const amt = +$('#depAmt').value, w = e.target.dataset.mode === 'withdraw';
    if (amt < 100) return toast('Minimum amount is ₦100', 'err');
    if (w && amt > state.user.balance) return toast('Insufficient balance', 'err');
    state.user.balance += w ? -amt : amt; store.set('user', state.user);
    closeModals(); refreshAll(); toast(w ? `Withdrawal of ${naira(amt)} requested` : `${naira(amt)} deposited`);
  });
  $('#codeForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#codeInput').value.trim().toUpperCase(), codes = store.get('codes', {});
    if (!codes[code]) return toast('Booking code not found', 'err');
    state.slip = codes[code]; saveSlip(); closeModals(); refreshAll(); openSlip(); toast('Booking code loaded');
  });

  /* ---------------- Carousel ---------------- */
  const slides = $$('.slide'); let cur = 0;
  $('#dots').innerHTML = slides.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('');
  const show = i => { cur = (i + slides.length) % slides.length; $('#slides').style.transform = `translateX(-${cur * 100}%)`; $$('#dots i').forEach((d, k) => d.classList.toggle('on', k === cur)); };
  let auto = setInterval(() => show(cur + 1), 4500);
  let sx = 0;
  $('#carousel').addEventListener('touchstart', e => { sx = e.touches[0].clientX; clearInterval(auto); }, { passive: true });
  $('#carousel').addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) show(cur + (dx < 0 ? 1 : -1)); auto = setInterval(() => show(cur + 1), 4500); });

  /* ---------------- Live simulation ---------------- */
  setInterval(() => {
    MATCHES.filter(m => m.live).forEach(m => {
      if (rnd() < 0.5) m.minute = Math.min(90, m.minute + 1);
      if (rnd() < 0.03) m.score[rnd() < 0.5 ? 0 : 1]++;
      Object.keys(m.odds).forEach(k => m.odds[k] = m.odds[k].map(o => Math.max(1.01, r2(o * (1 + (rnd() - 0.5) * 0.06)))));
    });
    const scrollY = window.scrollY;
    if ($('#page-home').classList.contains('active')) { const sl = $('#liveStrip'), x = sl.scrollLeft; renderLiveStrip(); sl.scrollLeft = x; }
    if ($('#page-live').classList.contains('active')) { const st = $('#liveSportTabs'), x = st.scrollLeft; renderLive(); st.scrollLeft = x; }
    window.scrollTo(0, scrollY);
  }, 6000);

  /* ---------------- Init ---------------- */
  $('#yr').textContent = new Date().getFullYear();
  renderRails(); renderAZ(); refreshAll(); tickCountdown(); setInterval(tickCountdown, 1000);
})();
