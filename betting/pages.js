/* =========================================================
   LetBetAfrika – sportsbook pages modelled on the reference
   mobile site, screen by screen.
   ---------------------------------------------------------
   #/live[/sport]                      dark live list
   #/sports                            sport + date + league filter
   #/list/<sport>/<when>[/<lg,lg>]     filtered event list
   #/league/<idx>                      one league (same list view)
   #/jackpot[/tab]                     12-game jackpot
   #/promos[/tab]  #/promo/<id>        promotions + detail
   #/results                           results by day
   #/codes                             Code Hub (booking-code feed)
   #/bet/<id>                          bet ticket detail
   Odds buttons use the app's own data-mid/mk/ok handler, so the
   betslip, odds changes and settlement keep working unchanged.
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const A = () => window.LBA_APP;
  const esc = s => A().esc(s);
  const root = page => $(`#page-${page} .pg-root`);
  const DAY = 864e5;
  const sod = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const store = { get: (k, d) => A().store.get(k, d), set: (k, v) => A().store.set(k, v) };

  const I = {
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
    tri: '<svg viewBox="0 0 24 24" class="tri"><path d="M7 9h10l-5 6z" fill="currentColor" stroke="none"/></svg>',
    stats: '<svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 3 6-7 3 3"/><path d="M3 21h18"/></svg>',
    slip: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    filter: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.7-3.4 3-5 6-5s5.3 1.6 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.4c2.6.1 4.7 1.6 5.5 4.6"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    trophy: '<svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
  };
  const head = (title, right = '', opts = {}) => `<div class="pg-head${opts.dark ? ' dark' : ''}">
    <button class="icon-btn" data-back aria-label="Back">${I.back}</button><h1>${title}</h1>
    <div class="pg-act">${right}</div></div>`;
  const homeBtn = `<a class="icon-btn" href="#/home" aria-label="Home">${I.home}</a>`;
  const searchBtn = `<button class="icon-btn" data-pg="search" aria-label="Search">${I.search}</button>`;
  const cols = cfg => `<div class="cols">${cfg.lab.map(l => `<span>${l}</span>`).join('')}</div>${A().exHead ? A().exHead(cfg) : ''}`;
  const dateLabel = ts => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`; };
  const upcoming = () => A().MATCHES.filter(m => !m.live && !m.finished && !m.virtual);

  /* =========================================================
     LIVE  (#/live[/sport])
     ========================================================= */
  const LV = { sport: null, sort: 'league', shut: new Set(), all: false };
  function renderLive(arg, keep) {
    const a = A(), el = root('live');
    const liveBy = id => a.MATCHES.filter(m => m.live && m.sport === id);
    const sports = a.VISIBLE().filter(s => liveBy(s.id).length);
    if (arg && a.sportOf(arg)) LV.sport = arg;
    if (!LV.sport || !liveBy(LV.sport).length) LV.sport = sports[0]?.id || 'football';
    const cfg = a.mktFor(LV.sport), list = liveBy(LV.sport);
    const y = keep ? window.scrollY : 0, tx = $('#lvTabs', el)?.scrollLeft || 0, mx = $('#lvMkt', el)?.scrollLeft || 0;
    let body;
    if (!list.length) body = `<div class="pg-empty dark">${I.info}<b>No live events right now</b><span>Check the schedule for matches starting soon.</span><a class="au-btn" href="#/list/football/3h">See upcoming matches</a></div>`;
    else if (LV.sort === 'time') body = list.slice().sort((x, y) => y.minute - x.minute).map(m => a.matchRow(m, cfg, true)).join('');
    else {
      const g = new Map(); list.forEach(m => { if (!g.has(m.lg)) g.set(m.lg, []); g.get(m.lg).push(m); });
      body = [...g].map(([lgi, ms]) => {
        const lg = a.LEAGUES[lgi], shut = LV.shut.has(lgi);
        return `<div class="lv-grp ${shut ? 'shut' : ''}"><button class="lv-lg" data-pg="lvlg" data-lg="${lgi}" aria-expanded="${!shut}">${I.tri}<span>${esc(lg.country)} - ${esc(lg.name)}</span><em>${ms.length}</em></button>
          <div class="lv-rows">${ms.map(m => a.matchRow(m, cfg, false)).join('')}</div></div>`;
      }).join('');
    }
    el.innerHTML = `${head('Live', `<a class="pg-txt" href="#/list/${LV.sport}/3h">Schedule</a>${homeBtn}`)}
      <div class="live-block pg-live">
        <div class="pg-sticky">
        <div class="sp-tabs dark" id="lvTabs" role="tablist">${sports.map(s => `<button role="tab" data-pg="lvsport" data-s="${s.id}" class="${s.id === LV.sport ? 'on' : ''}" aria-selected="${s.id === LV.sport}"><i>${liveBy(s.id).length}</i>${s.em}<span>${s.name}</span></button>`).join('') || '<span class="muted pad">No live sports</span>'}</div>
          <div class="mkt-tabs dark" id="lvMkt">${a.listMarkets(LV.sport).map(x => `<button data-market="${x.id}" data-msport="${LV.sport}" class="${x.id === cfg.id ? 'active' : ''}">${x.name}</button>`).join('')}</div>
          <div class="lv-tool"><button data-pg="lvall">${I.tri}${list.length && [...new Set(list.map(m => m.lg))].every(i => LV.shut.has(i)) ? 'Expand All' : 'Collapse All'}</button>
            <label>Sort by <select data-pg="lvsort" aria-label="Sort by"><option value="league" ${LV.sort === 'league' ? 'selected' : ''}>Leagues</option><option value="time" ${LV.sort === 'time' ? 'selected' : ''}>Match time</option></select></label></div>
          <div class="day-sep dark" style="--n:${cfg.n || cfg.outs.length}"><span>${list.length} live</span>${cols(cfg)}</div>
        </div>
        ${body}
      </div>`;
    $('#lvTabs', el).scrollLeft = tx; $('#lvMkt', el).scrollLeft = mx;
    if (keep) window.scrollTo(0, y);
  }

  /* =========================================================
     SPORTS FILTER  (#/sports)
     ========================================================= */
  const SF = { sport: 'football', mode: 'daily', when: null, tab: 'top', sel: new Set(), open: new Set(), q: '' };
  const DAYS = () => Array.from({ length: 7 }, (_, i) => { const t = sod(Date.now()) + i * DAY; return { id: 'd' + i, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(t).toLocaleDateString('en-GB', { weekday: 'long' }), from: t, to: t + DAY }; });
  const RANGES = () => [['h3', 'Next 3 hours', 3], ['h12', 'Next 12 hours', 12], ['h24', 'Next 24 hours', 24], ['h72', 'Next 3 days', 72]].map(([id, label, h]) => ({ id, label, from: Date.now(), to: Date.now() + h * 36e5 }));
  const WHEN = id => [...DAYS(), ...RANGES(), { id: 'all', label: 'All', from: 0, to: Infinity }, { id: 'today', label: 'Today', from: sod(Date.now()), to: sod(Date.now()) + DAY }, { id: 'tomorrow', label: 'Tomorrow', from: sod(Date.now()) + DAY, to: sod(Date.now()) + 2 * DAY }, { id: '3h', label: 'Next 3 hours', from: Date.now(), to: Date.now() + 3 * 36e5 }].find(w => w.id === id) || { id: 'all', label: 'All', from: 0, to: Infinity };
  function renderSports() {
    const a = A(), el = root('sports');
    const sp = a.VISIBLE().filter(s => a.MATCHES.some(m => m.sport === s.id && !m.finished));
    if (!sp.some(s => s.id === SF.sport)) SF.sport = sp[0]?.id || 'football';
    const all = upcoming().filter(m => m.sport === SF.sport);
    const w = SF.when ? WHEN(SF.when) : null;
    const inWhen = m => !w || (m.kick >= w.from && m.kick < w.to);
    const lgs = a.LEAGUES.filter(l => l.sport === SF.sport && all.some(m => m.lg === l.idx));
    const cnt = l => all.filter(m => m.lg === l.idx && inWhen(m)).length;
    const today = all.filter(m => m.kick < sod(Date.now()) + DAY).length;
    const liveN = a.MATCHES.filter(m => m.live && m.sport === SF.sport).length;
    const chk = (id, on, label, n, extra = '') => `<label class="sf-row ${extra}"><span>${label}</span><em>${n}</em><input type="checkbox" data-pg="sfchk" value="${id}" ${on ? 'checked' : ''} aria-label="${esc(String(label).replace(/<[^>]+>/g, ''))}"></label>`;
    let list;
    if (SF.tab === 'top') {
      const top = lgs.filter(l => l.top || cnt(l) > 0).sort((x, y) => (y.top ? 1 : 0) - (x.top ? 1 : 0) || cnt(y) - cnt(x));
      const dup = n => lgs.filter(x => x.name === n).length > 1;
      list = chk('all', SF.sel.size === 0, 'All', all.filter(inWhen).length) + top.map(l => chk(l.idx, SF.sel.has(l.idx), `${l.flag} ${esc(l.name)}${dup(l.name) ? ` <small class="muted">${esc(l.country)}</small>` : ''}`, cnt(l))).join('');
    } else if (SF.tab === 'countries') {
      const byC = new Map(); lgs.forEach(l => { if (!byC.has(l.country)) byC.set(l.country, []); byC.get(l.country).push(l); });
      list = [...byC].sort((x, y) => x[0].localeCompare(y[0])).map(([c, ls]) => {
        const open = SF.open.has(c), n = ls.reduce((s, l) => s + cnt(l), 0);
        return `<div class="sf-ctry ${open ? 'open' : ''}"><button class="sf-row head" data-pg="sfctry" data-c="${esc(c)}" aria-expanded="${open}">${ls[0].flag}<span>${esc(c)}</span><em>${n}</em>${I.down}</button>
          <div class="sf-sub">${ls.map(l => chk(l.idx, SF.sel.has(l.idx), esc(l.name), cnt(l))).join('')}</div></div>`;
      }).join('');
    } else {
      list = lgs.slice().sort((x, y) => x.full.localeCompare(y.full)).map(l => chk(l.idx, SF.sel.has(l.idx), `${l.flag} ${esc(l.country)} - ${esc(l.name)}`, cnt(l))).join('');
    }
    const picks = SF.mode === 'daily' ? DAYS() : RANGES();
    const n = all.filter(m => inWhen(m) && (!SF.sel.size || SF.sel.has(m.lg))).length;
    const x = $('#sfTabs', el)?.scrollLeft || 0, cx = $('#sfChips', el)?.scrollLeft || 0;
    el.innerHTML = `${head('Sports', searchBtn + homeBtn)}
      <div class="sp-tabs" id="sfTabs" role="tablist">${sp.map(s => `<button role="tab" data-pg="sfsport" data-s="${s.id}" class="${s.id === SF.sport ? 'on' : ''}" aria-selected="${s.id === SF.sport}">${s.em}<span>${s.name}</span></button>`).join('')}</div>
      <div class="sf-quick">
        <a href="#/list/${SF.sport}/today">Today games (${today})</a>
        <a href="#/live/${SF.sport}">Live (${liveN})</a>
        <a href="#/list/${SF.sport}/all">All ${esc(a.sportOf(SF.sport).name)} (${all.length})</a>
        ${(n => n ? `<a href="#/list/${SF.sport}/all/out">Outrights (${n})</a>` : '')(lgs.filter(l => l.teams && l.teams.length > 2).length)}
      </div>
      <div class="sf-sec">
        <div class="pg-tabs sm"><button data-pg="sfmode" data-v="daily" class="${SF.mode === 'daily' ? 'on' : ''}">Daily</button><button data-pg="sfmode" data-v="range" class="${SF.mode === 'range' ? 'on' : ''}">Range</button></div>
        <div class="sf-chips" id="sfChips">${picks.map(p => `<button data-pg="sfwhen" data-v="${p.id}" class="${SF.when === p.id ? 'on' : ''}" aria-pressed="${SF.when === p.id}">${p.label}</button>`).join('')}</div>
      </div>
      <div class="sf-sec">
        <div class="pg-tabs sm"><button data-pg="sftab" data-v="top" class="${SF.tab === 'top' ? 'on' : ''}">Top Leagues</button><button data-pg="sftab" data-v="countries" class="${SF.tab === 'countries' ? 'on' : ''}">Top Countries</button><button data-pg="sftab" data-v="az" class="${SF.tab === 'az' ? 'on' : ''}">A-Z</button></div>
        <div class="sf-list">${list || '<div class="pg-empty">No leagues for this sport yet.</div>'}</div>
      </div>
      <div class="sf-foot"><button class="au-btn ghost" data-pg="sfclear">Clear</button><button class="au-btn" data-pg="sfview" ${n ? '' : 'disabled'}>View${n ? ` (${n})` : ''}</button></div>`;
    $('#sfTabs', el).scrollLeft = x; $('#sfChips', el).scrollLeft = cx;
  }

  /* =========================================================
     EVENT LIST  (#/list/<sport>/<when>[/<lgs>|out])  and  LEAGUE (#/league/<idx>)
     ========================================================= */
  const EL = { tab: 'matches', sort: 'time', shut: new Set() };
  function parseList(page, arg) {
    const a = A();
    if (page === 'league') { const lg = a.LEAGUES[+arg]; return lg ? { sport: lg.sport, when: 'all', lgs: [lg.idx], league: lg } : null; }
    const parts = location.hash.replace(/^#\/list\/?/, '').split('/');
    const sport = a.sportOf(parts[0]) ? parts[0] : 'football';
    const out = parts[2] === 'out';
    const lgs = !out && parts[2] ? parts[2].split(',').map(Number).filter(n => a.LEAGUES[n]) : [];
    return { sport, when: parts[1] || 'all', lgs, out };
  }
  function renderList(page, arg, keep) {
    const a = A(), el = root(page), f = parseList(page, arg);
    if (!f) return a.go('home');
    if (f.out) EL.tab = 'out';
    const cfg = a.mktFor(f.sport), w = WHEN(f.when);
    let list = upcoming().filter(m => m.sport === f.sport && m.kick >= w.from && m.kick < w.to && (!f.lgs.length || f.lgs.includes(m.lg)));
    if (page === 'league') list = a.MATCHES.filter(m => m.lg === f.lgs[0] && !m.finished && !m.virtual);
    const liveN = a.MATCHES.filter(m => m.live && m.sport === f.sport).length;
    const title = f.league ? esc(f.league.name) : esc(a.sportOf(f.sport).name);
    const lgOpts = [...new Set(list.map(m => m.lg))];
    let body;
    if (EL.tab === 'out') body = outrightsHTML(f);
    else if (!list.length) body = `<div class="pg-empty">${I.info}<b>No matches for this filter</b><span>Try another day or league.</span><a class="au-btn ghost" href="#/sports">Change filter</a></div>`;
    else {
      const sorted = list.slice().sort((x, y) => (y.live - x.live) || (EL.sort === 'league' ? x.lg - y.lg || x.kick - y.kick : x.kick - y.kick));
      const g = new Map();
      if (EL.sort === 'league' || page === 'league') sorted.forEach(m => { if (!g.has(m.lg)) g.set(m.lg, []); g.get(m.lg).push(m); });
      else g.set(-1, sorted);
      body = [...g].map(([lgi, ms]) => {
        let day = '', rows = '';
        ms.forEach(m => {
          const d = m.live ? 'Live' : new Date(m.kick).toDateString();
          if (d !== day) { day = d; rows += `<div class="day-sep" style="--n:${cfg.n || cfg.outs.length}"><span>${m.live ? 'Live now' : dateLabel(m.kick)}</span>${cols(cfg)}</div>`; }
          rows += a.matchRow(m, cfg, lgi === -1);
        });
        if (lgi === -1) return rows;
        const lg = a.LEAGUES[lgi], shut = EL.shut.has(lgi);
        return `<div class="el-grp ${shut ? 'shut' : ''}"><button class="el-lg" data-pg="ellg" data-lg="${lgi}" aria-expanded="${!shut}">${I.tri}${lg.flag}<span>${esc(lg.country)} - ${esc(lg.name)}</span><em>${ms.length}</em></button><div class="el-rows">${rows}</div></div>`;
      }).join('');
    }
    const y = keep ? window.scrollY : 0, mx = $('.mkt-tabs', el)?.scrollLeft || 0;
    el.innerHTML = `${head(title + (f.league ? `<small>${esc(a.sportOf(f.sport).name)} · ${esc(f.league.country)}</small>` : ''), searchBtn + homeBtn)}
      <a class="el-live" href="#/live/${f.sport}"><b>All Live</b><em>${liveN}</em>${I.right}</a>
      <div class="pg-tabs"><button data-pg="eltab" data-v="matches" class="${EL.tab === 'matches' ? 'on' : ''}">Matches</button><button data-pg="eltab" data-v="out" class="${EL.tab === 'out' ? 'on' : ''}">Outrights</button></div>
      ${EL.tab === 'out' ? '' : `<div class="pg-sticky light">
        <div class="el-filters">
          <label><select data-pg="elwhen" aria-label="Time">${['all', 'today', 'tomorrow', '3h', 'h24', 'h72'].map(id => `<option value="${id}" ${f.when === id ? 'selected' : ''}>${id === 'all' ? 'Daily' : WHEN(id).label}</option>`).join('')}</select></label>
          <label class="${f.lgs.length ? 'on' : ''}"><select data-pg="ellgs" aria-label="League"><option value="">All leagues</option>${a.LEAGUES.filter(l => l.sport === f.sport).map(l => `<option value="${l.idx}" ${f.lgs.length === 1 && f.lgs[0] === l.idx ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
          <label><select data-pg="elmkt" data-msport="${f.sport}" aria-label="Market">${a.listMarkets(f.sport).map(x => `<option value="${x.id}" ${x.id === cfg.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
          <label class="on"><select data-pg="elsort" aria-label="Sort">${[['time', 'Sort: Time'], ['league', 'Sort: League']].map(([v, l]) => `<option value="${v}" ${EL.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="mkt-tabs">${a.listMarkets(f.sport).map(x => `<button data-market="${x.id}" data-msport="${f.sport}" class="${x.id === cfg.id ? 'active' : ''}">${x.name}</button>`).join('')}</div>
      </div>`}
      <div class="el-body">${body}</div>
      ${lgOpts.length && EL.tab !== 'out' ? `<p class="pg-foot-note">${list.length} match${list.length === 1 ? '' : 'es'} · odds update live</p>` : ''}`;
    const mt = $('.mkt-tabs', el); if (mt) mt.scrollLeft = mx;
    if (keep) window.scrollTo(0, y);
  }
  // Outright winner prices from each team's strength in the odds model (display + coming-soon betting)
  function outrightsHTML(f) {
    const a = A();
    const lgs = (f.lgs.length ? f.lgs.map(i => a.LEAGUES[i]) : a.LEAGUES.filter(l => l.sport === f.sport)).filter(l => l.teams && l.teams.length > 2);
    if (!lgs.length) return `<div class="pg-empty">${I.info}<b>No outright markets</b><span>Outrights appear when a season or tournament opens.</span></div>`;
    return lgs.map(lg => {
      const n = lg.teams.length;
      const w = lg.teams.map((t, i) => Math.pow(0.78, i) * (1 + ((t.length * 7) % 5) / 20));
      const tot = w.reduce((s, x) => s + x, 0);
      const rows = lg.teams.map((t, i) => ({ t, o: Math.max(1.2, Math.round(0.88 * tot / w[i] * 100) / 100) })).sort((x, y) => x.o - y.o);
      const shut = EL.shut.has('o' + lg.idx);
      return `<div class="el-grp ${shut ? 'shut' : ''}"><button class="el-lg" data-pg="ellg" data-lg="o${lg.idx}">${I.tri}${lg.flag}<span>${esc(lg.country)} - ${esc(lg.name)} · Winner</span><em>${n}</em></button>
        <div class="el-rows out-rows">${rows.map(r => `<div class="out-row">${a.crest(r.t, 0, lg.sport)}<span>${esc(r.t)}</span><button class="odd" data-pg="outright">${r.o.toFixed(2)}</button></div>`).join('')}</div></div>`;
    }).join('') + '<p class="pg-foot-note">Outright prices are a preview – betting opens with the season feed.</p>';
  }

  /* =========================================================
     JACKPOT  (#/jackpot[/results|how|tickets])
     ========================================================= */
  // live: the server fixes each round's 12 games (GET /api/jackpot/round) and pays winners automatically
  const JP = { picks: {}, tab: 'play', round: undefined, results: undefined };
  const weekCode = () => { const d = new Date(); const s = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}${String(Math.ceil(((d - s) / DAY + s.getDay() + 1) / 7)).padStart(2, '0')}`; };
  const jpRound = () => (A().live ? (JP.round ? JP.round.code : '…') : weekCode());
  const jpPrize = k => { const a = A(), p = JP.prizes && JP.prizes[a.CC]; return p ? p[k] : a.C[k === 't11' ? 'jp11' : k === 't10' ? 'jp10' : 'jackpot']; };
  const jpMatch = e => { const o = (e.markets || []).find(m => m.key === '1x2'); return { id: e.id, home: e.home, away: e.away, kick: new Date(e.kickoff).getTime(), map: { '1x2': o ? o.outcomes : {} } }; };
  async function loadRound(force) {
    if (!A().live || (JP.round !== undefined && !force) || JP.loadingRound) return;
    JP.loadingRound = true;
    try { const r = await API.jackpot.round(); JP.round = r.round ? { code: r.round.code, closesAt: new Date(r.round.closesAt).getTime(), games: r.round.events.map(jpMatch) } : null; JP.prizes = r.prizes; }
    catch { JP.round = JP.round || null; }
    JP.loadingRound = false;
    if (A().state.route === 'jackpot') renderJackpot(JP.tab === 'play' ? null : JP.tab);
  }
  const jpGames = () => A().live ? (JP.round ? JP.round.games : []) : A().MATCHES.filter(m => m.sport === 'football' && !m.live && !m.finished && !m.virtual && m.map['1x2']?.['1']?.o).sort((a, b) => a.kick - b.kick).slice(0, 12);
  const jpEnd = () => { if (A().live && JP.round) return JP.round.closesAt; const games = jpGames(); return games[0] ? games[0].kick : Date.now() + DAY; };
  const lines = () => jpGames().reduce((n, m) => n * Math.max(1, (JP.picks[m.id] || []).length), 1);
  function renderJackpot(arg) {
    const a = A(), el = root('jackpot'), C = a.C;
    if (a.live && JP.round === undefined) loadRound();
    JP.tab = ['results', 'how', 'tickets'].includes(arg) ? arg : 'play';
    const games = jpGames(), picked = games.filter(m => (JP.picks[m.id] || []).length).length, ln = lines();
    let body = '';
    if (JP.tab === 'play') {
      body = `<div class="jp-round">Round No. ${jpRound()}</div>
        <div class="jp-th"><span>Date/Match</span><span>1(Home)</span><span>X(Draw)</span><span>2(Away)</span></div>
        ${a.live && JP.round === undefined ? '<div class="pg-empty dark"><i class="spin big"></i><span>Loading this round…</span></div>' : games.length ? games.map((m, i) => `<div class="jp-r"><b class="n">${i + 1}</b><div class="jp-m"><small>${new Date(m.kick).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')}</small><span>${esc(m.home)}</span><span>${esc(m.away)}</span></div>
          ${['1', 'X', '2'].map(o => { const on = (JP.picks[m.id] || []).includes(o); return `<button class="jp-o ${on ? 'on' : ''}" data-pg="jpick" data-m="${m.id}" data-o="${o}" aria-pressed="${on}" aria-label="${o} ${esc(m.home)} v ${esc(m.away)}">${(m.map['1x2']?.[o]?.o || 0).toFixed(2)}</button>`; }).join('')}</div>`).join('') : '<div class="pg-empty dark"><b>The next round opens soon</b></div>'}
        <div class="jp-bar"><div><span><b>${picked}</b>/12 selected${ln > 1 ? ` · ${ln} lines` : ''}</span><small>${ln > 1 ? `${ln} × ${a.whole(C.ticket)}` : 'Pick 1, X or 2 – pick more than one to cover outcomes'}</small></div>
          <button class="jp-tool" data-pg="jplucky">Lucky Pick</button><button class="jp-tool" data-pg="jpclear">Clear</button>
          <button class="au-btn" data-pg="jpbuy" ${picked === 12 && games.length === 12 ? '' : 'disabled'}>Buy ${a.whole(ln * C.ticket)}</button></div>`;
    } else if (JP.tab === 'results') {
      const cc = a.CC, list = JP.results;
      if (a.live && list === undefined && !JP.loadingRes) { JP.loadingRes = true; API.jackpot.results().then(r => { JP.results = r; }).catch(() => { JP.results = []; }).finally(() => { JP.loadingRes = false; if (a.state.route === 'jackpot' && JP.tab === 'results') renderJackpot('results'); }); }
      body = !a.live ? '<div class="pg-empty dark"><b>No settled rounds yet</b><span>Results of each round appear here once its last game has finished.</span></div>'
        : list === undefined ? '<div class="pg-empty dark"><i class="spin big"></i><span>Loading results…</span></div>'
        : list.length ? list.map(rd => { const sm = (rd.summary || {})[cc] || {}, tier = (l, t) => `<div><span>${l}</span><b>${t && t.lines ? `${t.lines} winning line${t.lines === 1 ? '' : 's'}` : 'No winners'}</b><small>${t && t.lines ? a.whole(t.prize) + ' per line' : '–'}</small></div>`;
            return `<div class="jp-past"><div class="jp-past-h"><b>Round No. ${esc(rd.code)}</b><span>${new Date(rd.settledAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
              <div class="jp-tiers">${tier('12 correct', sm.t12)}${tier('11 correct', sm.t11)}${tier('10 correct', sm.t10)}</div>
              <details class="jp-games"><summary>Results of the 12 games</summary>${rd.games.map((g, i) => `<p><b>${i + 1}</b><span>${esc(g.match)}</span><em>${g.score ? g.score.join(' - ') : 'Void'}</em><i>${g.o || ''}${g.drawn ? ' (drawn)' : ''}</i></p>`).join('')}</details></div>`; }).join('')
        : '<div class="pg-empty dark"><b>No settled rounds yet</b><span>Results of each round appear here once its last game has finished.</span></div>';
    } else if (JP.tab === 'how') {
      body = `<div class="jp-how">${[
        ['Predict 12 games', 'Pick Home (1), Draw (X) or Away (2) for every game in the round.'],
        ['Cover more outcomes', `Pick two or three outcomes for a game to cover it. Each extra combination is one more line at ${a.whole(C.ticket)}.`],
        ['Win big', `Get all 12 right to win the ${a.whole(jpPrize('jackpot'))} jackpot – shared equally if more than one line gets 12. 11 correct pays ${a.whole(jpPrize('t11'))} and 10 correct pays ${a.whole(jpPrize('t10'))} per line.`],
        ['Results', 'The round closes when its first game kicks off. When the last game ends, every ticket is graded and winnings are paid straight into your balance.'],
        ['Postponed games', 'If a game is cancelled, or not finished within 48 hours of kick-off, its result is drawn at random, weighted by the 1X2 odds.'],
      ].map(([t, d], i) => `<div class="how-step"><b>${i + 1}</b><div><strong>${t}</strong><p>${d}</p></div></div>`).join('')}</div>`;
    } else {
      const tk = JP.tickets || [];
      body = !a.state.user ? `<div class="pg-empty dark"><b>Log in to see your tickets</b><button class="au-btn" data-open="loginModal">Log in</button></div>`
        : JP.tickets == null ? '<div class="pg-empty dark"><i class="spin big"></i><span>Loading your tickets…</span></div>'
        : tk.length ? tk.map(t => { const st = t.status === 'won' ? `<em class="won">Won ${a.money(t.prize)}</em>` : t.status === 'lost' ? '<em class="lost">No win</em>' : '<em>Pending</em>', h = t.hits ? ` · best ${[12, 11, 10].find(k => t.hits[k]) ? [12, 11, 10].find(k => t.hits[k]) + ' correct' : 'under 10'}` : '';
            return `<div class="jp-past"><div class="jp-past-h"><b>Round No. ${esc(t.round)}</b><span>${a.whole(t.cost)}</span></div><p class="jp-tk">${t.lines} line${t.lines === 1 ? '' : 's'} · ${new Date(t.at).toLocaleString()} · <b>${esc(t.ref)}</b>${h} · ${st}</p></div>`; }).join('')
        : '<div class="pg-empty dark"><b>No tickets yet</b><span>Your jackpot tickets appear here.</span></div>';
      if (!JP.loading && a.state.user && JP.tickets == null) { JP.loading = true; loadTickets().then(() => { JP.loading = false; if (a.state.route === 'jackpot' && JP.tab === 'tickets') renderJackpot('tickets'); }); }
    }
    el.innerHTML = `${head('Jackpot', `<a class="icon-btn" href="#/jackpot/tickets" aria-label="My tickets">${I.slip}</a>${homeBtn}`, { dark: true })}
      <div class="jp-hero" style="background-image:linear-gradient(180deg,rgba(10,20,14,.55),rgba(27,30,37,1)),url(${C.b3})">
        <div class="jp-prize"><p>Predict 12 GAMES to Win</p><h2>${a.C.cur === '₦' ? 'NGN' : 'GHS'} ${Number(jpPrize('jackpot')).toLocaleString('en')}</h2><small>Prizes for 11 and 10 correct predictions too!</small></div>
        <div class="jp-cd" id="jpCd"></div>
      </div>
      <div class="pg-tabs dark">${[['play', 'Jackpot 12'], ['results', 'Previous Results'], ['how', 'How to play'], ['tickets', 'My Tickets']].map(([k, l]) => `<a href="#/jackpot${k === 'play' ? '' : '/' + k}" class="${JP.tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="jp-body">${body}</div>`;
    tick();
  }
  async function loadTickets() {
    const a = A();
    if (a.live) { try { JP.tickets = await API.jackpot.tickets(); } catch { JP.tickets = JP.tickets || []; } }
    else { const me = a.state.user && (a.state.user.phone || a.state.user.email); JP.tickets = store.get('jp_tickets', []).filter(t => (t.who || t.phone) === me); }
  }
  function tick() {
    const el = $('#jpCd'); if (!el || A().state.route !== 'jackpot') return;
    let s = Math.max(0, (jpEnd() - Date.now()) / 1000 | 0);
    el.innerHTML = [['Days', 86400], ['Hours', 3600], ['Min.', 60], ['Sec.', 1]].map(([l, d]) => { const v = s / d | 0; s -= v * d; return `<div><small>${l}</small><b>${v}</b></div>`; }).join('');
  }
  async function buyJackpot() {
    const a = A(), u = a.state.user, games = jpGames(), ln = lines(), cost = ln * a.C.ticket;
    if (!u) return a.openModal('loginModal');
    if (u.balance < cost) { a.toast('Insufficient balance – please deposit', 'err'); return a.go('deposit'); }
    const picks = games.map(m => ({ eventId: m.id, outcomes: JP.picks[m.id] }));
    try {
      let ref;
      if (a.live) { const r = await API.jackpot.buy(jpRound(), picks); u.balance = r.balance; ref = r.ref; JP.results = undefined; }
      else {
        ref = 'JP' + Date.now().toString(36).toUpperCase();
        u.balance = a.r2(u.balance - cost); a.addTx('Jackpot ticket', -cost, { ref, method: `${ln} line${ln === 1 ? '' : 's'}`, status: 'success' });
        store.set('jp_tickets', [{ ref, round: jpRound(), lines: ln, cost, picks, at: Date.now(), who: u.phone || u.email }, ...store.get('jp_tickets', [])].slice(0, 50));
      }
      a.saveUser(); a.renderAuth(); JP.picks = {}; JP.tickets = null;
      a.toast(`Ticket ${ref} bought – good luck!`); a.go('jackpot/tickets');
    } catch (e) { a.toast(a.apiErr(e, 'Ticket could not be bought'), 'err'); if (['round_closed', 'round_changed'].includes(e.message)) { JP.picks = {}; loadRound(true); } }
  }

  /* =========================================================
     PROMOTIONS  (#/promos[/tab])  +  detail (#/promo/<id>)
     ========================================================= */
  const PROMOS = () => { const a = A(), C = a.C, w = a.whole; const y = new Date().getFullYear(); return [
    { id: 'welcome', cat: 'sports', title: '200% Welcome Bonus', img: C.b1, from: `1/1/${y}`, to: `12/31/${y}`, lead: `Triple your first deposit, up to ${w(C.bonusMax)}.`, cta: ['Join Now', '#/register'],
      steps: ['Register with your mobile number.', 'Make your first deposit.', 'Your bonus is added straight away as locked bonus funds.', 'Bet the bonus 5 times on multiples with odds of 1.50 or more per selection to unlock it.'],
      terms: ['New players only, one bonus per person, household and device.', `Maximum bonus ${w(C.bonusMax)}.`, 'Bonus must be wagered within 14 days or it expires.', 'Cashed-out and void bets do not count towards wagering.'] },
    { id: 'acca', cat: 'sports', title: 'Acca Win Boost – up to 1000%', img: 'img/banner-2.jpg', from: `1/1/${y}`, to: `12/31/${y}`, lead: 'Add 3 or more selections to a multiple and your winnings get boosted.', cta: ['Bet Now', '#/home'],
      steps: ['Add 3+ selections with odds of 1.20 or more to the betslip.', 'Choose Multiple.', 'The boost grows with the number of selections at 1.20+: 5% for 3, 50% for 5, 200% for 10, 500% for 15 and 1000% for 20 or more.'],
      terms: ['Applies to pre-match and live multiples.', 'The boost is paid as cash on winning bets.', 'Cashed-out bets do not get the boost.'] },
    { id: 'jackpot', cat: 'sports', title: `${C.jackpotShort} Weekly Jackpot`, img: C.b3, from: `1/1/${y}`, to: `12/31/${y}`, lead: 'Predict 12 matches correctly and take the jackpot.', cta: ['Play Jackpot', '#/jackpot'],
      steps: ['Open Jackpot.', 'Pick 1, X or 2 for all 12 games.', `Buy your ticket – ${w(C.ticket)} per line.`],
      terms: ['The jackpot is shared equally between all lines with 12 correct.', '11 and 10 correct win a fixed prize per line.', 'Winnings are paid automatically when the last game of the round ends.'] },
    { id: 'games', cat: 'games', title: 'LetBet Games – 11 games, results in seconds', grad: 'linear-gradient(135deg,#0a2a17,#0d9737)', from: `1/1/${y}`, to: `12/31/${y}`, lead: 'Rocket Crash up to 200x, Spin & Win, Lucky Dice, Penalty Kick, Keno, Scratch Cards and more.', cta: ['Play now', '#/games'],
      steps: ['Open Games from the bottom menu.', 'Pick a game and set your stake.', 'Results are instant and winnings go straight to your balance.'],
      terms: ['18+ only. Play responsibly – set limits under Responsible Gambling.', 'Each game shows its return to player under How to play.'] },
    { id: 'crash', cat: 'games', demoOnly: true, title: 'Rocket Crash: Daily Cashback', grad: 'linear-gradient(135deg,#3b0a5c,#d0306d)', from: `11/1/${y}`, to: `12/31/${y}`, lead: '10% of your daily net Rocket Crash losses back as a free bet.', cta: ['Play Rocket Crash', '#/play'],
      steps: ['Play Rocket Crash.', 'At midnight we add up your net losses for the day.', '10% comes back as a free bet the next morning.'],
      terms: [`Maximum cashback ${w(C.bonusMax / 10)} per day.`, 'Free bet valid for 7 days.'] },
    { id: 'refer', cat: 'features', title: `Refer & Earn ${w(C.referral)}`, grad: 'linear-gradient(135deg,#06612f,#0d9a4c)', from: `1/1/${y}`, to: `12/31/${y}`, lead: 'Invite friends and earn for every friend who joins and bets.', cta: ['Get my code', '#/acct/refer'],
      steps: ['Share your referral code from Me → Refer & Earn.', 'Your friend enters it when signing up.', `When your friend has staked ${w(C.referral)} or more on sports bets, you get ${w(C.referral)}.`],
      terms: ['Friends must be new players in the same country.', 'One reward per friend, paid in cash.', 'Accounts created to abuse the offer are closed and rewards removed.'] },
    { id: 'cashout', cat: 'features', title: 'Cashout – Take Control', grad: 'linear-gradient(135deg,#1b1e25,#3a4352)', from: `1/1/${y}`, to: `12/31/${y}`, lead: 'Settle your bet early – win now or cut your losses.', cta: ['Open Bets', '#/acct/bets'],
      steps: ['Open your bet history.', 'The cashout value follows the live odds.', 'Tap Cashout to settle the bet now.'],
      terms: ['Cashout is not available on every market.', 'The offer can change or be withdrawn at any time.'] },
  ]; };
  const promoCard = p => `<a class="pr-card" href="#/promo/${p.id}"><span class="pr-img" style="${p.img ? `background-image:url(${p.img})` : `background:${p.grad}`}"><b>${esc(p.title)}</b></span>
    <span class="pr-cap"><b>${esc(p.title)}</b>${I.right}</span><small>${p.from} – ${p.to}</small></a>`;
  function renderPromos(arg) {
    const tab = ['sports', 'games', 'features'].includes(arg) ? arg : 'all';
    // live: only offers the server actually runs (Daily Cashback needs the free-bet wallet – see HANDOVER.md)
    const list = PROMOS().filter(p => (tab === 'all' || p.cat === tab) && !(A().live && p.demoOnly));
    root('promos').innerHTML = `${head('Promotions')}
      <div class="pg-tabs">${[['all', 'All'], ['sports', 'Sports'], ['games', 'Games'], ['features', 'Features']].map(([k, l]) => `<a href="#/promos${k === 'all' ? '' : '/' + k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="pr-list">${list.map(promoCard).join('')}</div>`;
  }
  function renderPromo(id) {
    const p = PROMOS().find(x => x.id === id && !(A().live && x.demoOnly)); if (!p) return A().go('promos');
    root('promo').innerHTML = `${head('Promotion Details')}
      <span class="pr-img big" style="${p.img ? `background-image:url(${p.img})` : `background:${p.grad}`}"><b>${esc(p.title)}</b></span>
      <div class="pr-detail"><h2>${esc(p.title)}</h2><small>${p.from} – ${p.to}</small><p>${esc(p.lead)}</p>
        <h3>How it works</h3><ol>${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <h3>Terms &amp; Conditions</h3><ul>${p.terms.map(s => `<li>${esc(s)}</li>`).join('')}<li>General <a href="#/legal/terms">Terms &amp; Conditions</a> apply. 18+ only. Play responsibly.</li></ul>
        <a class="au-btn" href="${p.cta[1]}">${p.cta[0]}</a></div>`;
  }

  /* =========================================================
     RESULTS  (#/results)
     ========================================================= */
  const RS = { day: 0, sport: 'football', open: new Set(), pick: false };
  function renderResults() {
    const a = A(), el = root('results');
    const from = sod(Date.now()) - RS.day * DAY, to = from + DAY;
    const sports = [...new Set(a.RESULTS.map(m => m.sport))];
    if (!sports.includes(RS.sport)) RS.sport = sports[0] || 'football';
    const list = a.RESULTS.filter(m => m.sport === RS.sport && m.endAt >= from && m.endAt < to && m.ft);
    const g = new Map(); list.forEach(m => { if (!g.has(m.lg)) g.set(m.lg, []); g.get(m.lg).push(m); });
    const d = new Date(from);
    el.innerHTML = `${head('Results', searchBtn + homeBtn)}
      <div class="rs-date"><button data-pg="rsday" data-v="1" aria-label="Previous day" ${RS.day >= 6 ? 'disabled' : ''}>${I.left}</button><b>${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}</b><button data-pg="rsday" data-v="-1" aria-label="Next day" ${RS.day <= 0 ? 'disabled' : ''}>${I.right}</button></div>
      <div class="rs-crumb"><span>${esc(a.sportOf(RS.sport)?.name || 'Football')} / All Categories / All Tournaments</span><button data-pg="rspick">Change</button></div>
      ${RS.pick ? `<div class="rs-pick">${sports.map(s => `<button data-pg="rssport" data-v="${s}" class="${s === RS.sport ? 'on' : ''}">${a.sportOf(s).em}${a.sportOf(s).name}</button>`).join('')}</div>` : ''}
      <div class="rs-list">${list.length ? [...g].map(([lgi, ms]) => {
        const open = RS.open.has(lgi) || g.size === 1, lg = a.LEAGUES[lgi];
        return `<div class="rs-grp ${open ? 'open' : ''}"><button class="rs-lg" data-pg="rslg" data-lg="${lgi}" aria-expanded="${open}">${I.tri}<span>${esc(lg.country)} - ${esc(lg.name)}</span><em>${ms.length}</em></button>
          <div class="rs-rows">${ms.sort((x, y) => x.endAt - y.endAt).map(m => `<div class="rs-row"><small>${new Date(m.endAt - 105 * 6e4).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</small><span class="h">${esc(m.home)}</span><b>${m.ft[0]} : ${m.ft[1]}</b><span class="w">${esc(m.away)}</span>${m.ht ? `<small class="ht">HT ${m.ht[0]}:${m.ht[1]}</small>` : ''}</div>`).join('')}</div></div>`;
      }).join('') : `<div class="pg-empty">${I.info}<b>No results for this day</b><span>Results appear here when matches finish.</span></div>`}</div>`;
  }

  /* =========================================================
     CODE HUB  (#/codes)
     ========================================================= */
  const CH = { sport: 'all', follow: null };
  const TIPSTERS = ['naija_banker', 'kwame.odds', 'stephen_tips', 'accra_king', 'lagos_punter', 'odds_doctor', 'bigwin_ade', 'kumasi_kofi'];
  function hubCodes() {
    const a = A(), ms = upcoming().filter(m => m.map['1x2']?.['1']?.o);
    const pick = (seed, n, sport) => {
      const pool = ms.filter(m => sport === 'all' || m.sport === sport); const out = []; let s = seed;
      for (let i = 0; i < pool.length && out.length < n; i++) { s = (s * 16807) % 2147483647; const m = pool[s % pool.length]; if (!out.some(x => x.mid === m.id)) out.push(m.id && { mid: m.id }); }
      return out.map(({ mid }) => {
        const m = a.byId(mid), mk = m.map.gg ? (mid % 3 === 0 ? 'gg' : mid % 3 === 1 ? 'ou' : '1x2') : '1x2';
        const outs = Object.keys(m.map[mk] || {}); const ok = outs[mid % Math.max(1, outs.length)] || '1';
        const o = m.map[mk]?.[ok] || m.map['1x2']['1'];
        return { mid, mk: m.map[mk]?.[ok] ? mk : '1x2', ok: m.map[mk]?.[ok] ? ok : '1', odd: o.o, label: o.l, mname: m.mk.find(x => x.key === (m.map[mk]?.[ok] ? mk : '1x2'))?.name || '1X2', match: `${m.home} vs ${m.away}`, m };
      });
    };
    return TIPSTERS.map((t, i) => {
      const sport = i % 4 === 3 ? 'basketball' : 'football', legs = pick(97 + i * 131, 3 + (i % 4), sport);
      const odds = legs.reduce((p, l) => p * l.odd, 1);
      const code = ((i + 11) * 2654435761 % 2176782336).toString(36).toUpperCase().padStart(6, 'X').slice(-6);
      return { t, followers: 120 + ((i * 7919) % 900), uses: 900 + ((i * 3571) % 15000), code, sport, legs, odds };
    }).filter(c => c.legs.length >= 2);
  }
  // live: real codes booked on the site (GET /api/bets/codes) – no invented tipsters or follower counts
  const hubLive = c => ({ code: c.code, t: c.by || 'Guest player', uses: c.uses, at: new Date(c.at).getTime(), live: true, sport: c.sport, odds: c.odds,
    legs: c.legs.map(l => ({ mid: l.eventId, mk: l.market, ok: l.outcome, odd: l.odd, label: l.label, mname: l.marketName, match: `${l.home} vs ${l.away}`, m: { home: l.home, away: l.away, kick: new Date(l.kickoff).getTime() } })) });
  function renderCodes() {
    const a = A(), el = root('codes');
    if (!CH.follow) CH.follow = new Set(store.get('follows', []));
    if (a.live && CH.feed === undefined && !CH.loading) {
      CH.loading = true;
      API.bets.codes(CH.sport).then(r => { CH.feed = r.map(hubLive); }).catch(() => { CH.feed = []; }).finally(() => { CH.loading = false; if (a.state.route === 'codes') renderCodes(); });
    }
    const codes = a.live ? (CH.feed || []) : hubCodes().filter(c => CH.sport === 'all' || c.sport === CH.sport);
    // register the feed's codes so "Load" works for them too (demo mode)
    if (!a.live) { const saved = store.get('codes', {}); codes.forEach(c => { saved[c.code] = c.legs.map(l => ({ mid: l.mid, mk: l.mk, ok: l.ok })); }); store.set('codes', saved); }
    el.innerHTML = `${head('Code Hub', `${a.live ? '' : `<button class="icon-btn" data-pg="chfollowing" aria-label="Following">${I.users}</button>`}${homeBtn}`)}
      <form class="ch-load" data-pg-form="load"><p>Load a code or choose one from the feed.</p>
        <div class="ch-in"><input name="code" placeholder="Insert a code to load to betslip" autocapitalize="characters" aria-label="Booking code"><button class="au-btn">Load</button></div></form>
      <div class="ch-chips">${[['all', 'All'], ['football', 'Football'], ['basketball', 'Basketball']].map(([k, l]) => `<button data-pg="chsport" data-v="${k}" class="${CH.sport === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="ch-feed">${codes.map(c => `<article class="ch-card">
        <div class="ch-user"><span class="ch-av" style="--h:${(c.t.length * 47) % 360}">${c.live ? I.users : esc(c.t[0].toUpperCase())}</span><b>${esc(c.t)}</b><small>${c.live ? `Booked ${new Date(c.at || Date.now()).toLocaleDateString([], { day: 'numeric', month: 'short' })}` : `${c.followers + (CH.follow.has(c.t) ? 1 : 0)} Followers`}</small>
          ${c.live ? '' : `<button class="ch-follow ${CH.follow.has(c.t) ? 'on' : ''}" data-pg="chfollow" data-v="${esc(c.t)}">${CH.follow.has(c.t) ? 'Following' : 'Follow'}</button>`}</div>
        <div class="ch-code"><b>${c.code}</b><span title="Times this code was loaded">${I.slip}${c.uses.toLocaleString()}</span><span>Folds: <b>${c.legs.length}</b></span><span>Odds: <b>${c.odds.toFixed(2)}</b></span></div>
        <ul class="ch-legs">${c.legs.map(l => `<li><a href="#/match/${l.mid}"><span class="ch-pick"><b>${esc(l.label)} @${l.odd.toFixed(2)}</b> <span class="muted">| ${esc(l.mname)}</span></span><small>${esc(l.m.home)} <i>vs</i> ${esc(l.m.away)}</small></a><span class="ch-when">${a.fmtKick(l.m.kick)}</span></li>`).join('')}</ul>
        <div class="ch-act"><button data-pg="chshare" data-v="${c.code}">${I.share}Share</button><button class="go" data-pg="chadd" data-v="${c.code}">Add to Betslip</button></div>
      </article>`).join('') || (a.live && CH.feed === undefined ? `<div class="pg-empty"><i class="spin big"></i><span>Loading codes…</span></div>`
        : `<div class="pg-empty">${I.info}<b>No open codes right now</b><span>Book a multiple from your betslip and share the code – it appears here for other players.</span></div>`)}</div>`;
    CH.codes = codes;
  }

  /* =========================================================
     BET DETAIL  (#/bet/<id>)
     ========================================================= */
  function renderBet(id) {
    const a = A(), b = a.state.bets.find(x => String(x.id) === decodeURIComponent(id || ''));
    const el = root('bet');
    if (!b) { el.innerHTML = `${head('Bet Details')}<div class="pg-empty">${I.info}<b>Bet not found</b><span>It may belong to another account.</span><a class="au-btn" href="#/acct/bets">Bet history</a></div>`; return; }
    const co = b.status === 'open' ? (a.live ? b.cashout : a.cashoutValue(b)) : null;
    const res = l => a.live ? l.result : a.legResult(l);
    const st = { open: 'Running', won: 'Won', lost: 'Lost', void: 'Void', cashout: 'Cashed out' }[b.status] || b.status;
    const ret = b.status === 'open' ? b.win : b.paid || 0;
    el.innerHTML = `${head('Bet Details')}
      <div class="bd-top ${b.status}"><span class="status ${b.status}">${st.toUpperCase()}</span><b>${a.money(ret)}</b><small>${b.status === 'open' ? 'Potential win' : b.status === 'lost' ? 'Return' : 'Returned'}</small></div>
      <dl class="wl-dl bd-dl">
        <div><dt>Ticket ID</dt><dd>${esc(b.id)} <button class="bd-copy" data-pg="copy" data-v="${esc(b.id)}" aria-label="Copy ticket ID">${I.copy}</button></dd></div>
        <div><dt>Placed</dt><dd>${new Date(b.at).toLocaleString()}</dd></div>
        <div><dt>Bet type</dt><dd>${esc(b.type)}</dd></div>
        <div><dt>Total stake</dt><dd>${a.money(b.stake)}</dd></div>
        <div><dt>Total odds</dt><dd>${b.odds.toFixed(2)}</dd></div>
        ${b.boost ? `<div><dt>Win boost</dt><dd>+${b.boost}%</dd></div>` : ''}
        <div><dt>${b.status === 'open' ? 'Potential win' : 'Paid'}</dt><dd><b>${a.money(ret)}</b></dd></div>
      </dl>
      <h3 class="bd-h">Selections (${b.legs.length})</h3>
      <div class="bd-legs">${b.legs.map(l => { const r = res(l), m = a.byId(l.mid); return `<a class="bd-leg" href="#/match/${l.mid}">
        <span class="bd-dot ${r || (m && m.live ? 'live' : 'open')}"></span>
        <div><b>${esc(l.label)}</b><small>${esc(l.mname)}</small><span>${esc(l.match)}</span>
          <em>${m && m.live ? `<i class="live-t">LIVE ${a.liveLabel(m)}</i> ${m.score[0]}:${m.score[1]}` : m && m.finished && m.ft ? `FT ${m.ft[0]}:${m.ft[1]}` : m ? a.fmtKick(m.kick) : ''}</em></div>
        <span class="bd-odd">${l.odd.toFixed(2)}<small>${r ? r.toUpperCase() : m && m.live ? 'LIVE' : 'OPEN'}</small></span></a>`; }).join('')}</div>
      <div class="bd-act">
        ${b.status === 'open' ? `<button class="au-btn ${co ? 'gold' : ''}" data-cashout="${esc(b.id)}" ${co ? '' : 'disabled'}>${co ? 'Cashout ' + a.money(co) : 'Cashout unavailable'}</button>` : ''}
        <button class="au-btn ghost" data-pg="rebet" data-v="${esc(b.id)}">Rebet these selections</button>
        <button class="au-btn ghost" data-pg="sharebet" data-v="${esc(b.id)}">${I.share} Share ticket</button>
      </div>`;
  }

  /* =========================================================
     INSTANT FOOTBALL  (#/instant)
     Pick results for a 10-match round, kick off, results in ~10 seconds.
     live: the server prices the round, takes the stake, plays and settles.
     demo: the same maths runs in the browser.
     ========================================================= */
  const VI = { round: null, picks: {}, type: 'multiple', stake: null, playing: null, loading: false };
  const VTEAMS = ['Lagos Lions', 'Accra Hearts', 'Kano Pillars', 'Kumasi Kings', 'Enugu Rangers', 'Tamale Eagles', 'Ibadan Stars', 'Cape Coast United', 'Abuja City', 'Takoradi Sharks', 'Port Harcourt FC', 'Tema Mariners', 'Benin Arsenal', 'Sunyani Chelsea', 'Jos Plateau', 'Ho Volta', 'Warri Wolves', 'Obuasi Goldfields', 'Owerri Heartland', 'Koforidua Royals'];
  const vPois = (l, n = 10) => { const a = []; let p = Math.exp(-l); for (let k = 0; k <= n; k++) { a.push(p); p *= l / (k + 1); } return a; };
  const vSample = l => { let k = 0, p = Math.exp(-l), s = p; const u = Math.random(); while (u > s && k < 10) { k++; p *= l / k; s += p; } return k; };
  function demoRound() {
    const t = [...VTEAMS].sort(() => Math.random() - 0.5), price = p => Math.max(1.05, Math.round(0.92 / p * 100) / 100);
    const matches = Array.from({ length: 10 }, (_, i) => {
      const lh = 0.7 + Math.random() * 1.6, la = 0.5 + Math.random() * 1.4, ph = vPois(lh), pa = vPois(la); let H = 0, D = 0, Aw = 0;
      ph.forEach((x, a) => pa.forEach((y, b) => { if (a > b) H += x * y; else if (a === b) D += x * y; else Aw += x * y; }));
      return { i, home: t[i * 2], away: t[i * 2 + 1], lh, la, odds: { 1: price(H), X: price(D), 2: price(Aw) } };
    });
    return { id: 'demo-' + Date.now(), matches };
  }
  async function newRound() {
    VI.loading = true; VI.picks = {}; VI.playing = null;
    try { VI.round = A().live ? await API.virtuals.round() : demoRound(); }
    catch (e) { VI.round = null; A().toast(A().apiErr(e, 'Could not load the round'), 'err'); }
    VI.loading = false;
    if (A().state.route === 'instant') renderInstant();
  }
  const viPicks = () => Object.entries(VI.picks).map(([i, o]) => ({ i: +i, o }));
  function viCalc() {
    const a = A(), picks = viPicks(), stake = VI.stake ?? a.C.defStake * 5;
    const odds = picks.map(x => VI.round.matches[x.i].odds[x.o]);
    const total = VI.type === 'single' ? stake * picks.length : stake;
    const win = VI.type === 'single' ? odds.reduce((s, o) => s + stake * o, 0) : picks.length ? stake * odds.reduce((x, y) => x * y, 1) : 0;
    return { picks, stake, odds, total, win, tOdds: odds.reduce((x, y) => x * y, 1) };
  }
  function renderInstant() {
    const a = A(), el = root('instant');
    if (!VI.round && !VI.loading) { newRound(); }
    const head0 = head('Instant Football', `<a class="pg-txt" href="#/virtuals">Virtual League</a>${homeBtn}`);
    if (!VI.round) { el.innerHTML = head0 + `<div class="pg-empty dark"><i class="spin big"></i><span>Setting up the next round…</span></div>`; return; }
    const P = VI.playing, c = viCalc();
    const rows = VI.round.matches.map(m => {
      const res = P && P.results[m.i], pick = VI.picks[m.i];
      const sc = res ? res.score.map((g, side) => res.goals.filter(x => x.side === side && x.min <= P.min).length) : null;
      const done = P && P.min >= 90, out = res && done ? (res.score[0] > res.score[1] ? '1' : res.score[0] === res.score[1] ? 'X' : '2') : null;
      return `<div class="vi-r ${pick && done ? (out === pick ? 'won' : 'lost') : ''}">
        <div class="vi-t"><span>${esc(m.home)}</span><span>${esc(m.away)}</span></div>
        ${sc ? `<div class="vi-sc"><b>${sc[0]}</b><b>${sc[1]}</b></div>` : ''}
        <div class="vi-o">${['1', 'X', '2'].map(o => `<button class="jp-o ${pick === o ? 'on' : ''} ${out === o ? 'res' : ''}" data-pg="vipick" data-m="${m.i}" data-o="${o}" ${P ? 'disabled' : ''} aria-pressed="${pick === o}"><small>${o}</small>${m.odds[o].toFixed(2)}</button>`).join('')}</div></div>`;
    }).join('');
    const C = a.C;
    const bar = P ? (P.min < 90 ? `<div class="vi-bar"><div class="vi-clock"><b>${P.min}'</b><span>Matches in play…</span></div></div>`
      : `<div class="vi-bar done"><div class="vi-res ${P.payout > 0 ? 'win' : ''}"><b>${P.payout > 0 ? 'You won ' + a.money(P.payout) : 'No win this time'}</b><small>Stake ${a.money(P.stake)} · Ticket ${esc(P.ref)}</small></div><button class="au-btn" data-pg="vinext">Next Round</button></div>`)
      : `<div class="vi-bar">
          <div class="vi-type"><button data-pg="vitype" data-v="single" class="${VI.type === 'single' ? 'on' : ''}">Single</button><button data-pg="vitype" data-v="multiple" class="${VI.type === 'multiple' ? 'on' : ''}">Multiple</button></div>
          <div class="vi-sum"><span>${c.picks.length} pick${c.picks.length === 1 ? '' : 's'}${VI.type === 'multiple' && c.picks.length ? ` · odds ${c.tOdds.toFixed(2)}` : ''}</span><span>Potential win <b>${a.money(c.win)}</b></span></div>
          <div class="vi-stake"><label>${VI.type === 'single' ? 'Stake per pick' : 'Stake'} <span>${C.cur}</span><input id="viStake" inputmode="decimal" value="${c.stake}" aria-label="Stake"></label>
            ${C.chips.map(v => `<button data-pg="vichip" data-v="${v}">+${v >= 1000 ? v / 1000 + 'k' : v}</button>`).join('')}</div>
          <button class="au-btn" data-pg="vikick" ${c.picks.length && c.stake >= C.minStake ? '' : 'disabled'}>Kick Off · ${a.money(c.total)}</button></div>`;
    el.innerHTML = `${head0}
      <div class="vi-hero"><b>INSTANT FOOTBALL</b><span>Pick results · Kick off · Full time in 10 seconds</span></div>
      <div class="vi-th"><span>Match</span><span>1</span><span>X</span><span>2</span></div>
      <div class="vi-list">${rows}</div>${bar}`;
  }
  async function kickOff() {
    const a = A(), u = a.state.user, c = viCalc();
    if (!u) return a.openModal('loginModal');
    if (c.total > u.balance) { a.toast('Insufficient balance – please deposit', 'err'); return a.go('deposit'); }
    let r;
    try {
      if (a.live) { r = await API.virtuals.play({ roundId: VI.round.id, type: VI.type, stake: c.stake, picks: c.picks }); u.balance = r.balance; }
      else {
        const results = VI.round.matches.map(m => { const h = vSample(m.lh), w = vSample(m.la); return { i: m.i, score: [h, w], goals: [...Array(h).fill(0), ...Array(w).fill(1)].map(side => ({ side, min: 1 + Math.floor(Math.random() * 90) })) }; });
        const won = c.picks.map(x => { const s = results[x.i].score; return (s[0] > s[1] ? '1' : s[0] === s[1] ? 'X' : '2') === x.o; });
        const payout = Math.round((VI.type === 'single' ? c.picks.reduce((s, _x, k) => s + (won[k] ? c.stake * c.odds[k] : 0), 0) : won.every(Boolean) ? c.win : 0) * 100) / 100;
        const ref = 'VI' + Date.now().toString(36).toUpperCase();
        u.balance = a.r2(u.balance - c.total); a.addTx('Instant Football stake', -c.total, { ref, status: 'success' });
        if (payout) { u.balance = a.r2(u.balance + payout); a.addTx('Instant Football win', payout, { ref, status: 'success' }); }
        r = { ref, results, payout, stake: c.total, balance: u.balance };
      }
    } catch (e) { if (e.message === 'round_expired') { a.toast('That round expired – here is a new one', 'err'); return newRound(); } return a.toast(a.apiErr(e, 'Could not kick off'), 'err'); }
    a.saveUser();
    VI.playing = { ...r, min: 0 };
    const t0 = Date.now(), dur = 10000;
    const step = () => {
      if (!VI.playing) return;
      VI.playing.min = Math.min(90, Math.round((Date.now() - t0) / dur * 90));
      if (a.state.route === 'instant') renderInstant();
      if (VI.playing.min < 90) setTimeout(step, 400);
      else { a.renderAuth(); if (r.payout > 0) setTimeout(() => trophy({ amount: r.payout, source: 'Instant Football', ref: r.ref }), 700); }
    };
    step();
  }
  document.addEventListener('input', e => { if (e.target.id === 'viStake') { VI.stake = +e.target.value.replace(/[^\d.]/g, '') || 0; const c = viCalc(), b = $('[data-pg=vikick]'); if (b) { b.disabled = !(c.picks.length && c.stake >= A().C.minStake); b.textContent = `Kick Off · ${A().money(c.total)}`; } const w = $('.vi-sum b'); if (w) w.textContent = A().money(c.win); } });

  /* =========================================================
     TROPHY – full-screen "YOU WON" celebration for every win
     Pages.trophy({ amount, source: 'Sport' | 'Instant Football' | …, ref, href })
     ========================================================= */
  const TROPHY_SVG = `<svg class="tr-cup" viewBox="0 0 240 280" aria-hidden="true">
    <defs>
      <linearGradient id="trG" x1="0" x2="1"><stop offset="0" stop-color="#8a5a00"/><stop offset=".22" stop-color="#ffd76a"/><stop offset=".45" stop-color="#fff3c4"/><stop offset=".62" stop-color="#ffc20e"/><stop offset="1" stop-color="#7a4d00"/></linearGradient>
      <linearGradient id="trD" x1="0" x2="1"><stop offset="0" stop-color="#5c3a00"/><stop offset=".5" stop-color="#d49a1c"/><stop offset="1" stop-color="#4a2e00"/></linearGradient>
      <radialGradient id="trE" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#1b1e25"/><stop offset="1" stop-color="#0b0d10"/></radialGradient>
    </defs>
    <path d="M58 40c-36 0-44 22-40 44 5 26 30 40 52 44l4-16c-16-4-34-14-37-32-2-14 4-24 20-24z" fill="url(#trD)"/>
    <path d="M182 40c36 0 44 22 40 44-5 26-30 40-52 44l-4-16c16-4 34-14 37-32 2-14-4-24-20-24z" fill="url(#trD)"/>
    <path d="M52 26h136v34c0 52-30 88-68 96-38-8-68-44-68-96z" fill="url(#trG)"/>
    <path d="M52 26h136v10H52z" fill="#fff3c4" opacity=".55"/>
    <path d="M70 34c2 52 18 82 46 100" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".35"/>
    <circle cx="120" cy="80" r="30" fill="url(#trE)" stroke="#ffd76a" stroke-width="4"/>
    <g transform="translate(120 80)" fill="none" stroke="#ffd76a" stroke-width="2.2">
      <circle r="17"/><path d="M0-17l7 5-3 9H-4l-3-9zM7-12l9 2M-7-12l-9 2M4-3l7 8M-4-3l-7 8M11 5l-3 9M-11 5l3 9"/>
    </g>
    <path d="M106 154h28l6 34h-40z" fill="url(#trD)"/>
    <path d="M86 188h68l8 22H78z" fill="url(#trG)"/>
    <rect x="66" y="210" width="108" height="26" rx="3" fill="url(#trD)"/>
    <rect x="80" y="216" width="80" height="14" rx="2" fill="#2a1a00" opacity=".55"/>
    <text x="120" y="227" text-anchor="middle" font-family="Kanit,Roboto,sans-serif" font-style="italic" font-weight="800" font-size="10" fill="#ffd76a" letter-spacing="1">LETBET AFRIKA</text>
  </svg>`;
  // LetBetAfrika trophy: our own 3D render (tools/trophy) – gold cup with the LB monogram, green wordmark plinth.
  const TROPHY_SRCSET = 'img/trophy-lb-600.webp 600w, img/trophy-lb.webp 900w', TROPHY_SIZES = '(min-width: 500px) 380px, 84vw';
  // warm the cache once the app is idle so the celebration never waits for the image
  (window.requestIdleCallback || ((f) => setTimeout(f, 3000)))(() => { const i = new Image(); i.sizes = TROPHY_SIZES; i.srcset = TROPHY_SRCSET; i.src = 'img/trophy-lb-600.webp'; });
  function trophy({ amount, source = 'Sport', ref = '', href = '' } = {}) {
    const a = A(); if (!(amount > 0)) return;
    let el = $('#trophyOv');
    if (!el) { el = document.createElement('div'); el.id = 'trophyOv'; el.className = 'tr-ov'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'You won'); document.body.appendChild(el); }
    const code = a.C.cur === '₦' ? 'NGN' : 'GHS';
    el.innerHTML = `<button class="tr-x" data-tr="close" aria-label="Close">×</button>
      <div class="tr-top"><h2>YOU WON</h2><b class="tr-amt">${code} <span id="trAmt">0.00</span></b></div>
      <div class="tr-stage"><div class="tr-rays"></div><div class="tr-glow"></div><img class="tr-img" src="img/trophy-lb-600.webp" srcset="${TROPHY_SRCSET}" sizes="${TROPHY_SIZES}" width="900" height="1080" alt="LetBetAfrika gold trophy" decoding="async" onerror="this.parentNode.classList.add('noimg')">${TROPHY_SVG}<i class="tr-sp s1"></i><i class="tr-sp s2"></i><i class="tr-sp s3"></i><i class="tr-sp s4"></i><i class="tr-sp s5"></i></div>
      <p class="tr-src">From ${esc(source)}${ref ? ` / Ticket ID ${esc(ref)}` : ''}</p>
      <div class="tr-btns">${href ? `<a class="tr-btn ghost" href="${href}" data-tr="close">Details</a>` : `<button class="tr-btn ghost" data-tr="close">Close</button>`}<button class="tr-btn" data-tr="share">Show Off</button></div>`;
    el._share = `I just won ${a.money(amount)} on LetBetAfrika${source ? ' (' + source + ')' : ''}! 🏆`;
    requestAnimationFrame(() => el.classList.add('on'));
    document.body.classList.add('tr-lock');
    // count the amount up
    const t0 = performance.now(), dur = 1400, span = $('#trAmt', el), f = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); span.textContent = f(amount * e); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    if (window.Motion && Motion.confetti) setTimeout(() => Motion.confetti(), 250);
    if (navigator.vibrate) try { navigator.vibrate([40, 60, 40]); } catch {}
    setTimeout(() => $('[data-tr=share]', el)?.focus({ preventScroll: true }), 300);
  }
  const closeTrophy = () => { const el = $('#trophyOv'); if (el) el.classList.remove('on'); document.body.classList.remove('tr-lock'); };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-tr]'); if (!t) return;
    if (t.dataset.tr === 'close') return closeTrophy();
    if (t.dataset.tr === 'share') { const txt = $('#trophyOv')._share; if (navigator.share) navigator.share({ title: 'LetBetAfrika win', text: txt, url: location.origin }).catch(() => {}); else { navigator.clipboard?.writeText(txt + ' ' + location.origin).catch(() => {}); A().toast('Copied – paste it to show off your win'); } }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTrophy(); });
  window.addEventListener('hashchange', () => { if (document.querySelector('#trophyOv.on')) closeTrophy(); });

  /* =========================================================
     Events
     ========================================================= */
  const toSlip = legs => {
    const a = A(); let n = 0;
    legs.forEach(l => {
      const m = a.byId(l.mid), o = m?.map[l.mk]?.[l.ok];
      if (!o || !o.o || a.state.slip.some(s => s.mid === l.mid)) return;
      a.state.slip.push({ mid: l.mid, mk: l.mk, ok: l.ok, odd: o.o, label: o.l, mname: m.mk.find(x => x.key === l.mk)?.name || l.mname, match: `${m.home} vs ${m.away}`, live: m.live, stake: a.C.defStake }); n++;
    });
    a.saveSlip(); a.renderAfterSlipChange(); a.openSlip();
    return n;
  };
  const share = async (title, text) => {
    try { if (navigator.share) return await navigator.share({ title, text }); } catch { return; }
    navigator.clipboard?.writeText(text).catch(() => {}); A().toast('Copied – paste it anywhere to share');
  };
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-pg]'); if (!t || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    const a = A(), v = t.dataset.v, k = t.dataset.pg;
    switch (k) {
      case 'search': return a.openSearch();
      case 'lvsport': LV.sport = t.dataset.s; LV.shut.clear(); return renderLive();
      case 'lvlg': { const i = +t.dataset.lg; LV.shut.has(i) ? LV.shut.delete(i) : LV.shut.add(i); return t.parentElement.classList.toggle('shut'); }
      case 'lvall': { const ids = $$('.lv-lg').map(b => +b.dataset.lg); if (ids.length && ids.every(i => LV.shut.has(i))) LV.shut.clear(); else ids.forEach(i => LV.shut.add(i)); return renderLive(null, true); }
      case 'sfsport': SF.sport = t.dataset.s; SF.sel.clear(); return renderSports();
      case 'sfmode': SF.mode = v; SF.when = null; return renderSports();
      case 'sfwhen': SF.when = SF.when === v ? null : v; return renderSports();
      case 'sftab': SF.tab = v; return renderSports();
      case 'sfctry': { const c = t.dataset.c; SF.open.has(c) ? SF.open.delete(c) : SF.open.add(c); return t.parentElement.classList.toggle('open'); }
      case 'sfclear': SF.sel.clear(); SF.when = null; return renderSports();
      case 'sfview': return a.go(`list/${SF.sport}/${SF.when || 'all'}${SF.sel.size ? '/' + [...SF.sel].join(',') : ''}`);
      case 'eltab': EL.tab = v; return renderList(a.state.route, a.state.arg);
      case 'ellg': { const i = t.dataset.lg; const key = i.startsWith('o') ? i : +i; EL.shut.has(key) ? EL.shut.delete(key) : EL.shut.add(key); return t.parentElement.classList.toggle('shut'); }
      case 'outright': return a.toast('Outright betting opens with the season feed');
      case 'jpick': { const id = +t.dataset.m, o = t.dataset.o, cur = JP.picks[id] || []; JP.picks[id] = cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]; if (!JP.picks[id].length) delete JP.picks[id]; return renderJackpot(); }
      case 'jplucky': jpGames().forEach(m => { const p = ['1', 'X', '2'].map(o => 1 / (m.map['1x2'][o]?.o || 99)); const s = p.reduce((x, y) => x + y, 0); const u = Math.random() * s; JP.picks[m.id] = [u < p[0] ? '1' : u < p[0] + p[1] ? 'X' : '2']; }); return renderJackpot();
      case 'jpclear': JP.picks = {}; return renderJackpot();
      case 'jpbuy': return buyJackpot();
      case 'rsday': RS.day = Math.min(6, Math.max(0, RS.day + +v)); return renderResults();
      case 'rspick': RS.pick = !RS.pick; return renderResults();
      case 'rssport': RS.sport = v; RS.pick = false; return renderResults();
      case 'rslg': { const i = +t.dataset.lg; RS.open.has(i) ? RS.open.delete(i) : RS.open.add(i); return t.parentElement.classList.toggle('open'); }
      case 'chsport': CH.sport = v; CH.feed = undefined; return renderCodes();
      case 'chfollow': { CH.follow.has(v) ? CH.follow.delete(v) : CH.follow.add(v); store.set('follows', [...CH.follow]); a.toast(CH.follow.has(v) ? `Following ${v}` : `Unfollowed ${v}`); return renderCodes(); }
      case 'chfollowing': return a.toast(CH.follow && CH.follow.size ? `You follow ${[...CH.follow].join(', ')}` : 'Follow tipsters to see their codes first');
      case 'chadd': { const c = (CH.codes || []).find(x => x.code === v); if (!c) return; if (a.live) return a.loadCode(c.code); const n = toSlip(c.legs); return a.toast(n ? `Added ${n} selection${n === 1 ? '' : 's'} from ${c.code}` : 'These selections are already in your betslip'); }
      case 'chshare': { const c = (CH.codes || []).find(x => x.code === v); return a.shareCode(v, c ? c.legs.length : 0, c ? c.odds : 0); }
      case 'vipick': { const i = +t.dataset.m, o = t.dataset.o; if (VI.picks[i] === o) delete VI.picks[i]; else VI.picks[i] = o; return renderInstant(); }
      case 'vitype': VI.type = v; return renderInstant();
      case 'vichip': VI.stake = (VI.stake ?? A().C.defStake * 5) + +v; return renderInstant();
      case 'vikick': return kickOff();
      case 'vinext': return newRound();
      case 'copy': navigator.clipboard?.writeText(v).catch(() => {}); return a.toast('Copied');
      case 'rebet': { const b = a.state.bets.find(x => String(x.id) === v); if (!b) return; const n = toSlip(b.legs); return a.toast(n ? `Added ${n} selection${n === 1 ? '' : 's'} to your betslip` : 'Those matches are no longer open for betting', n ? 'ok' : 'err'); }
      case 'sharebet': { const b = a.state.bets.find(x => String(x.id) === v); if (!b) return; return share('My LetBetAfrika ticket', `My ${b.type} on LetBetAfrika – odds ${b.odds.toFixed(2)}, stake ${a.money(b.stake)}:\n` + b.legs.map(l => `• ${l.match}: ${l.label} @${l.odd.toFixed(2)}`).join('\n')); }
    }
  });
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-pg]'); if (!t) return;
    const a = A(), k = t.dataset.pg;
    if (k === 'lvsort') { LV.sort = t.value; return renderLive(null, true); }
    if (k === 'sfchk') {
      if (t.value === 'all') SF.sel.clear(); else { const i = +t.value; t.checked ? SF.sel.add(i) : SF.sel.delete(i); }
      return renderSports();
    }
    if (k === 'elwhen' || k === 'ellgs') {
      const f = parseList(a.state.route, a.state.arg);
      const when = k === 'elwhen' ? t.value : f.when, lg = k === 'ellgs' ? t.value : (f.lgs.length ? f.lgs.join(',') : '');
      return a.go(`list/${f.sport}/${when}${lg ? '/' + lg : ''}`);
    }
    if (k === 'elmkt') { a.state.market[t.dataset.msport] = t.value; return a.renderCurrent(true); }
    if (k === 'elsort') { EL.sort = t.value; return renderList(a.state.route, a.state.arg); }
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-pg-form]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.pgForm === 'load') A().loadCode(f.code.value);
  });

  /* ---------------- Router glue ---------------- */
  const RENDER = {
    live: (arg, keep) => renderLive(arg, keep), sports: () => renderSports(), list: (arg, keep) => renderList('list', arg, keep), league: (arg, keep) => renderList('league', arg, keep),
    jackpot: arg => renderJackpot(arg), promos: arg => renderPromos(arg), promo: arg => renderPromo(arg), results: () => renderResults(), codes: () => renderCodes(), bet: arg => renderBet(arg), instant: () => renderInstant(),
  };
  // pages that refresh with live odds keep their scroll; static ones only re-render on navigation
  const LIVE_REFRESH = new Set(['live', 'list', 'league', 'bet']);
  function render(page, arg, keep, prev) {
    if (keep && !LIVE_REFRESH.has(page)) return;
    if (!keep && page === 'list' && prev !== 'list') EL.tab = 'matches';
    if (!keep && page === 'codes') CH.feed = undefined;
    if (!keep && page === 'jackpot') { JP.tickets = null; if (A().live && JP.round && JP.round.closesAt <= Date.now()) JP.round = undefined; }
    if (!keep && page === 'league' && prev !== 'league') { EL.tab = 'matches'; EL.shut.clear(); }
    RENDER[page](arg, keep);
  }
  // jackpot header turns solid once the hero scrolls away (as on the reference)
  window.addEventListener('scroll', () => { const h = $('#page-jackpot.active .pg-head.dark'); if (h) h.classList.toggle('solid', window.scrollY > 120); }, { passive: true });
  // offline banner – odds and balances can't update without a connection
  const net = () => {
    let b = $('#netBar');
    if (!b) { b = document.createElement('div'); b.id = 'netBar'; b.className = 'net-bar'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = navigator.onLine ? 'Back online' : 'You are offline – odds and balances may be out of date';
    b.className = 'net-bar on' + (navigator.onLine ? ' ok' : '');
    clearTimeout(b._t); if (navigator.onLine) b._t = setTimeout(() => b.classList.remove('on'), 2500);
  };
  window.addEventListener('offline', net); window.addEventListener('online', net);
  window.Pages = { handles: p => p in RENDER, render, tick, trophy };
})();
