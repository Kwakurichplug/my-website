/* =========================================================
   LetBetAfrika – games lobby artwork + Rocket Crash
   Artwork is drawn in SVG so it is crisp and ours to use.
   Rocket Crash runs two ways:
     live – shared rounds from the server (/api/games/crash/*), real bets
            from real players, provably fair (hash before, seed after)
     demo – the same maths in the browser when there is no server
   ========================================================= */
(() => {
  'use strict';
  const T = (t, y = 128, size = 26, fill = '#fff', stroke = '#000') =>
    `<text x="80" y="${y}" text-anchor="middle" font-family="Kanit,Arial Black,sans-serif" font-style="italic" font-weight="800" font-size="${size}" fill="${fill}" stroke="${stroke}" stroke-width="5" paint-order="stroke" letter-spacing="-.5">${t}</text>`;
  const BG = (id, a, b) => `<defs><radialGradient id="${id}" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><rect width="160" height="160" fill="url(#${id})"/>`;
  const RAYS = c => `<g opacity=".18" fill="${c}">${Array.from({ length: 12 }, (_, i) => `<path d="M80 62L${80 + Math.cos(i / 6 * Math.PI) * 140} ${62 + Math.sin(i / 6 * Math.PI) * 140}L${80 + Math.cos((i + .45) / 6 * Math.PI) * 140} ${62 + Math.sin((i + .45) / 6 * Math.PI) * 140}z"/>`).join('')}</g>`;

  const ART = {
    crash: BG('gc', '#3a0d12', '#0d0406') + RAYS('#ff4d4d') +
      `<path d="M10 120 Q70 110 120 40" fill="none" stroke="#ff3b3b" stroke-width="4" stroke-linecap="round"/>
       <g transform="translate(112 44) rotate(40)"><path d="M0-26c10 6 14 18 14 30l-14 12-14-12c0-12 4-24 14-30z" fill="#f2f2f2"/><circle cy="-4" r="5" fill="#2b6cff" stroke="#fff" stroke-width="2"/><path d="M-14 4l-8 14 10-4M14 4l8 14-10-4" fill="#e5163a"/><path d="M-6 16l6 14 6-14" fill="#ffc20e"/></g>` + T('ROCKET', 122, 30, '#fff', '#8b0d16') + T('CRASH', 148, 24, '#ffc20e', '#5a0710'),
    spin: BG('gs', '#3b1a6e', '#130726') +
      `<g transform="translate(80 66)"><circle r="46" fill="#ffc20e"/>${Array.from({ length: 12 }, (_, i) => `<path d="M0 0L${Math.cos(i / 6 * Math.PI) * 42} ${Math.sin(i / 6 * Math.PI) * 42}A42 42 0 0 1 ${Math.cos((i + 1) / 6 * Math.PI) * 42} ${Math.sin((i + 1) / 6 * Math.PI) * 42}z" fill="${['#e5163a', '#0a7d3e', '#2b6cff', '#ff8a00'][i % 4]}"/>`).join('')}<circle r="9" fill="#fff" stroke="#ffc20e" stroke-width="3"/><path d="M-6-52h12l-6 12z" fill="#fff"/></g>` + T('SPIN & WIN', 140, 24, '#fff', '#2a0b52'),
    penalty: BG('gp', '#1d8a4a', '#06381c') +
      `<path d="M0 104h160v56H0z" fill="#127a3c"/><path d="M0 104h160" stroke="#fff" stroke-width="2" opacity=".6"/>
       <rect x="28" y="30" width="104" height="58" fill="none" stroke="#fff" stroke-width="4"/><g stroke="#fff" opacity=".35">${Array.from({ length: 9 }, (_, i) => `<path d="M${38 + i * 11} 30v58"/>`).join('')}${Array.from({ length: 5 }, (_, i) => `<path d="M28 ${40 + i * 11}h104"/>`).join('')}</g>
       <g transform="translate(108 52)"><circle r="13" fill="#fff"/><path d="M0-6l6 4-2 7h-8l-2-7z" fill="#1b1e25"/></g><path d="M70 118 Q90 80 104 58" stroke="#fff" stroke-dasharray="3 5" stroke-width="2" fill="none"/>` + T('PENALTY', 132, 28, '#fff', '#04351a') + T('KICK', 156, 22, '#ffc20e', '#04351a'),
    dice: BG('gd', '#123b7a', '#050f24') +
      `<g transform="translate(52 62) rotate(-14)"><rect x="-24" y="-24" width="48" height="48" rx="10" fill="#fff"/>${[[-12, -12], [12, 12], [0, 0], [12, -12], [-12, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#e5163a"/>`).join('')}</g>
       <g transform="translate(106 66) rotate(16)"><rect x="-24" y="-24" width="48" height="48" rx="10" fill="#ffc20e"/>${[[-12, -12], [12, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#1b1e25"/>`).join('')}</g>` + T('LUCKY', 124, 28, '#fff', '#071a3d') + T('DICE', 150, 24, '#ffc20e', '#071a3d'),
    keno: BG('gk', '#a54800', '#2e1200') +
      `${[[40, 40, '#e5163a', 7], [80, 34, '#2b6cff', 23], [120, 42, '#0a7d3e', 41], [56, 78, '#ffc20e', 12], [100, 80, '#7b2d8e', 68]].map(([x, y, c, n]) => `<circle cx="${x}" cy="${y}" r="18" fill="${c}"/><circle cx="${x}" cy="${y}" r="10" fill="#fff"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="Arial" font-weight="900" font-size="11" fill="#1b1e25">${n}</text>`).join('')}` + T('KENO', 140, 34, '#fff', '#4a1d00'),
    scratch: BG('gx', '#0b6b6e', '#032224') +
      `<rect x="26" y="20" width="108" height="76" rx="8" fill="#ffc20e"/><rect x="34" y="28" width="92" height="60" rx="4" fill="#c9ccd2"/>
       <path d="M40 40c20 10 40-6 60 4s20 8 22 10v30H40z" fill="#fff"/><text x="80" y="76" text-anchor="middle" font-family="Arial" font-weight="900" font-size="22" fill="#e5163a">x50</text>
       <path d="M118 30l18-12 6 8-18 12z" fill="#e5e7ea"/>` + T('SCRATCH', 130, 26, '#fff', '#02393b') + T('CARDS', 154, 22, '#ffc20e', '#02393b'),
    hilo: BG('gh', '#5a3020', '#140804') +
      `<g transform="translate(60 62) rotate(-12)"><rect x="-26" y="-36" width="52" height="72" rx="6" fill="#fff"/><text x="-14" y="-16" font-family="Arial" font-weight="900" font-size="18" fill="#e5163a">A</text><path d="M0 2c-8-10-18 2-8 10l8 8 8-8c10-8 0-20-8-10z" fill="#e5163a"/></g>
       <g transform="translate(102 62) rotate(12)"><rect x="-26" y="-36" width="52" height="72" rx="6" fill="#fff"/><text x="-14" y="-16" font-family="Arial" font-weight="900" font-size="18" fill="#1b1e25">K</text><path d="M0-8l8 12h-16z" fill="#1b1e25"/><path d="M0 22l8-12h-16z" fill="#1b1e25"/></g>` + T('HI-LO', 140, 32, '#ffc20e', '#2a0e04'),
    rush: BG('gn', '#26323a', '#07090b') + RAYS('#ffc20e') +
      `<text x="80" y="92" text-anchor="middle" font-family="Kanit,Arial Black" font-weight="800" font-style="italic" font-size="70" fill="#ffc20e" stroke="#7a4d00" stroke-width="4" paint-order="stroke">777</text>` + T('NUMBER RUSH', 140, 22, '#fff', '#000'),
    virtual: BG('gv', '#0d5a32', '#03200f') +
      `<rect x="30" y="22" width="100" height="64" rx="6" fill="#1b1e25" stroke="#ffc20e" stroke-width="3"/><path d="M42 74l18-22 14 12 22-26 22 30" fill="none" stroke="#32ce62" stroke-width="4"/><circle cx="96" cy="38" r="5" fill="#ffc20e"/>` + T('VIRTUAL', 126, 26, '#fff', '#02200e') + T('LEAGUE', 150, 22, '#ffc20e', '#02200e'),
    instant: BG('gi', '#0a7d3e', '#02200e') +
      `<rect x="22" y="22" width="116" height="70" rx="6" fill="#127a3c" stroke="#fff" stroke-width="2.5"/><path d="M80 22v70" stroke="#fff" stroke-width="2"/><circle cx="80" cy="57" r="13" fill="none" stroke="#fff" stroke-width="2"/>
       <g transform="translate(112 44)"><circle r="11" fill="#fff"/><path d="M0-5l5 3.5-2 6h-6l-2-6z" fill="#1b1e25"/></g><path d="M40 98l10-12 10 12z" fill="#ffc20e"/>` + T('INSTANT', 126, 26, '#fff', '#02200e') + T('FOOTBALL', 150, 20, '#ffc20e', '#02200e'),
    jackpot: BG('gj', '#7a4d00', '#1f1400') + RAYS('#ffe680') +
      `<g transform="translate(80 58)"><path d="M-26-26h52v16a26 26 0 0 1-52 0z" fill="#ffc20e" stroke="#7a4d00" stroke-width="3"/><path d="M-26-20h-12a12 12 0 0 0 14 16M26-20h12a12 12 0 0 1-14 16" fill="none" stroke="#ffc20e" stroke-width="5"/><path d="M-6 16h12v12H-6zM-18 30h36v8h-36z" fill="#ffc20e"/></g>` + T('JACKPOT', 134, 30, '#ffc20e', '#3d2600'),
  };

  const GAMES = [
    { id: 'crash', n: 'Rocket Crash', cat: 'crash', top: 1, href: '#/play', badge: 'LIVE' },
    { id: 'virtual', n: 'Virtual League', cat: 'sports', top: 2, href: '#/virtuals' },
    { id: 'instant', n: 'Instant Football', cat: 'sports', top: 3, href: '#/instant' },
    { id: 'jackpot', n: 'Weekly Jackpot', cat: 'sports', top: 4, href: '#/jackpot' },
    { id: 'penalty', n: 'Penalty Kick', cat: 'instant', top: 5 },
    { id: 'spin', n: 'Spin & Win', cat: 'instant', top: 6 },
    { id: 'dice', n: 'Lucky Dice', cat: 'instant' },
    { id: 'keno', n: 'Keno', cat: 'instant' },
    { id: 'scratch', n: 'Scratch Cards', cat: 'instant' },
    { id: 'hilo', n: 'Hi-Lo Cards', cat: 'instant' },
    { id: 'rush', n: 'Number Rush', cat: 'crash' },
  ];
  const art = id => `<svg viewBox="0 0 160 160" class="g-art" aria-hidden="true">${ART[id]}</svg>`;
  const card = (g, rank) => `<a class="gcard" href="${g.href || '#/game/' + g.id}" aria-label="${g.n}">
      ${art(g.id)}${rank ? `<span class="g-rank">${rank}</span>` : ''}${g.badge ? `<span class="g-live">${g.badge}</span>` : ''}</a>`;
  const row = (title, list, rank) => list.length ? `<div class="g-sec"><div class="g-h"><h3>${title}</h3>${rank ? '' : `<span class="g-all">${list.length} games</span>`}</div><div class="g-row">${list.map((g, i) => card(g, rank ? i + 1 : 0)).join('')}</div></div>` : '';

  function renderLobby(country) {
    const q = (document.getElementById('gSearch').value || '').trim().toLowerCase();
    const cat = document.getElementById('gCat').value;
    const f = GAMES.filter(g => (!q || g.n.toLowerCase().includes(q)) && (cat === 'all' || g.cat === cat));
    const el = document.getElementById('gLobby');
    if (q || cat !== 'all') { el.innerHTML = f.length ? `<div class="g-grid">${f.map(g => card(g)).join('')}</div>` : '<div class="g-empty">No games found</div>'; return; }
    el.innerHTML =
      row(`Top Games in ${country}`, GAMES.filter(g => g.top).sort((a, b) => a.top - b.top), true) +
      `<div class="g-sec"><div class="g-h"><h3>Game Studios</h3></div><div class="g-row prov" tabindex="0" role="region" aria-label="Game studios">${['LetBet Originals', 'Virtual Sports', 'Instant Win'].map(p => `<span class="g-prov"><b>${p.split(' ')[0]}</b>${p.split(' ').slice(1).join(' ')}</span>`).join('')}</div></div>` +
      row('Crash Games', GAMES.filter(g => g.cat === 'crash')) +
      row('Instant Win', GAMES.filter(g => g.cat === 'instant')) +
      row('Sports Games', GAMES.filter(g => g.cat === 'sports'));
  }

  /* ---------------- Rocket Crash engine ---------------- */
  const GL = window.GameLogic;
  const NAMES = ['Tunde', 'Ama', 'Kofi', 'Chidi', 'Efua', 'Yaw', 'Ngozi', 'Kwame', 'Bola', 'Esi', 'Emeka', 'Akosua', 'Femi', 'Kojo', 'Ada', 'Nana'];
  const CR = { phase: 'wait', t0: 0, waitUntil: 0, point: 1, mult: 1, hist: [], bet: null, queued: null, others: [], api: null, raf: 0 };
  const rateMult = ms => Math.pow(Math.E, GL.CRASH.k * ms);
  const newPoint = () => GL.crashPoint(Math.random());
  const fmtX = x => Number(x).toFixed(2) + 'x';
  const $id = id => document.getElementById(id);
  const onPage = () => $id('page-play')?.classList.contains('active');

  /* ----- live: shared server rounds ----- */
  const LV = { st: null, off: 0, mine: null, queued: null, busy: false, t: 0, polling: false };
  const isLive = api => !!(api.live && api.live() && window.API && API.games);
  function livePhase() {
    const r = LV.st && LV.st.round; if (!r) return 'conn';
    if (r.phase === 'crashed') return 'crashed';
    return Date.now() + LV.off < r.startsAt ? 'wait' : 'fly';
  }
  async function livePoll(api) {
    clearTimeout(LV.t);
    if (!onPage() || !isLive(api)) { LV.polling = false; return; }
    LV.polling = true;
    try {
      const t0 = Date.now(), s = await API.games.crash.state();
      LV.off = s.now - Math.round((t0 + Date.now()) / 2);
      onState(api, s);
    } catch { /* keep the last state; try again */ }
    LV.t = setTimeout(() => livePoll(api), livePhase() === 'fly' ? 350 : 900);
  }
  function onState(api, s) {
    LV.st = s;
    const r = s.round; if (!r) return;
    const m = LV.mine;
    if (m) {
      const b = s.bets.find(x => x.id === m.id);
      if (b && b.status === 'cashed' && !m.out) { m.out = b.out; m.payout = b.payout; celebrate(api, b.payout, b.out, b.id, true); }
      if (r.id === m.round && r.phase === 'crashed' && !m.out && !m.lost) { m.lost = true; api.toast(`Crashed at ${fmtX(r.point)} – bet lost`, 'err'); }
      if (r.id > m.round) LV.mine = null;
    }
    if ($id('crFairBox')?.open && LV.fairRound !== r.id) { LV.fairRound = r.id; renderFair(api); }
    if (LV.queued && r.phase !== 'crashed' && r.id !== LV.queued.after && Date.now() + LV.off < r.startsAt - 300 && !LV.busy) { const q = LV.queued; LV.queued = null; livePlace(api, q); }
  }
  async function livePlace(api, nb) {
    LV.busy = true;
    try {
      const res = await API.games.crash.bet(nb.stake, nb.auto);
      LV.mine = { id: res.id, round: res.round, stake: res.stake, auto: res.auto, out: null };
      api.setBalance(res.balance);
    } catch (e) {
      if (e.message === 'betting_closed') { LV.queued = { ...nb, after: LV.st?.round?.id }; api.toast('Too late for this round – your bet is set for the next one'); }
      else if (e.message === 'insufficient_funds') { api.toast('Insufficient balance – please deposit', 'err'); api.deposit(); }
      else api.toast(api.apiErr(e, 'Bet not placed'), 'err');
    } finally { LV.busy = false; }
  }
  async function liveCashout(api) {
    LV.busy = true;
    try { const res = await API.games.crash.cashout(); LV.mine.out = res.mult; LV.mine.payout = res.payout; api.setBalance(res.balance); celebrate(api, res.payout, res.mult, res.id); }
    catch (e) { api.toast(e.message === 'crashed' ? 'Too late – the rocket crashed' : api.apiErr(e, 'Cash out failed'), 'err'); }
    finally { LV.busy = false; }
  }
  async function liveCancel(api) {
    LV.busy = true;
    try { const res = await API.games.crash.cancel(); LV.mine = null; api.setBalance(res.balance); api.toast('Bet cancelled – stake refunded'); }
    catch (e) { api.toast(api.apiErr(e, 'Too late to cancel'), 'err'); }
    finally { LV.busy = false; }
  }
  function celebrate(api, payout, mult, ref, auto) {
    api.toast(`${auto ? 'Auto cash-out' : 'Cashed out'} at ${fmtX(mult)} · +${api.money(payout)}`);
    if (auto && isLive(api)) api.refreshBalance();
    if (mult >= 2 && window.Pages) setTimeout(() => Pages.trophy({ amount: payout, source: 'Rocket Crash', ref, href: '#/play' }), 450);
    else if (window.Motion) Motion.confetti();
  }
  function syncLive() {
    const r = LV.st && LV.st.round, ph = livePhase();
    CR.hist = LV.st ? LV.st.history.map(h => h.point) : [];
    if (!r) { CR.phase = 'conn'; return; }
    CR.t0 = r.startsAt - LV.off;
    if (ph === 'crashed') { CR.phase = 'crashed'; CR.point = r.point; CR.mult = r.point; }
    else if (ph === 'wait') { CR.phase = 'wait'; CR.waitUntil = r.startsAt - LV.off; }
    else { CR.phase = 'fly'; CR.mult = GL.crashMult(Date.now() - CR.t0); }
  }

  /* ----- demo: browser rounds (no server) ----- */
  function seedOthers(api) {
    const n = 8 + (Math.random() * 10 | 0);
    CR.others = Array.from({ length: n }, () => {
      const stake = api.C.chips[Math.random() * 4 | 0] * (1 + (Math.random() * 4 | 0));
      return { name: NAMES[Math.random() * NAMES.length | 0] + '***' + (Math.random() * 90 + 10 | 0), stake, at: Math.random() < .75 ? +(1.1 + Math.random() * Math.random() * 6).toFixed(2) : 99, out: null };
    });
  }
  function startWait(api) { CR.phase = 'wait'; CR.waitUntil = Date.now() + GL.CRASH.waitMs; seedOthers(api); if (CR.queued) { CR.bet = CR.queued; CR.queued = null; } }
  function startFly() { CR.phase = 'fly'; CR.t0 = Date.now(); CR.point = newPoint(); CR.mult = 1; }
  function crash(api) {
    CR.phase = 'crashed'; CR.mult = CR.point; CR.hist.unshift(CR.point); CR.hist = CR.hist.slice(0, 12);
    if (CR.bet && !CR.bet.out) api.toast(`Crashed at ${fmtX(CR.point)} – bet lost`, 'err');
    CR.bet = null;
    if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
    setTimeout(() => startWait(api), GL.CRASH.crashedMs);
  }
  function cashOut(api) {
    const b = CR.bet; if (!b || b.out || CR.phase !== 'fly') return;
    b.out = CR.mult; const win = +(b.stake * CR.mult).toFixed(2);
    api.credit(win, 'Rocket Crash win');
    celebrate(api, win, CR.mult, 'DEMO');
  }
  function tick(api) {
    if (isLive(api)) { syncLive(); if (!LV.polling && onPage()) livePoll(api); return; }
    const now = Date.now();
    if (CR.phase === 'conn') startWait(api);
    if (CR.phase === 'wait' && now >= CR.waitUntil) startFly();
    if (CR.phase === 'fly') {
      CR.mult = GL.crashMult(now - CR.t0);
      CR.others.forEach(o => { if (!o.out && CR.mult >= o.at) o.out = o.at; });
      const auto = CR.bet && !CR.bet.out && CR.bet.auto;
      if (auto && CR.mult >= auto) { CR.mult = Math.min(CR.mult, auto); cashOut(api); }
      if (CR.mult >= CR.point) crash(api);
    }
  }

  function draw() {
    const cv = $id('crCanvas'); if (!cv || !cv.offsetParent) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const multEl = $id('crMult'), msg = $id('crMsg');
    if (CR.phase === 'conn' || CR.phase === 'wait') multEl.className = 'cr-mult';
    if (CR.phase === 'conn') { multEl.textContent = ''; msg.innerHTML = '<b>Connecting to the next round…</b>'; msg.hidden = false; return; }
    if (CR.phase === 'wait') {
      const s = Math.max(0, (CR.waitUntil - Date.now()) / 1000);
      multEl.textContent = ''; msg.innerHTML = `<b>Next round in ${s.toFixed(1)}s</b><i style="width:${100 - s / (GL.CRASH.waitMs / 1000) * 100}%"></i>`; msg.hidden = false;
      return;
    }
    msg.hidden = true;
    const el = CR.phase === 'fly' ? Date.now() - CR.t0 : Math.log(CR.point) / GL.CRASH.k;
    const maxT = Math.max(8000, el * 1.15), maxM = Math.max(2, rateMult(maxT) * 1.05);
    const P = t => [24 + (t / maxT) * (W - 60), H - 24 - ((rateMult(t) - 1) / (maxM - 1)) * (H - 70)];
    const grad = g.createLinearGradient(0, H, W, 0); grad.addColorStop(0, 'rgba(255,194,14,.05)'); grad.addColorStop(1, 'rgba(255,194,14,.35)');
    g.beginPath(); g.moveTo(24, H - 24);
    const steps = 60; for (let i = 0; i <= steps; i++) { const [x, y] = P(el * i / steps); g.lineTo(x, y); }
    const [ex, ey] = P(el);
    g.lineTo(ex, H - 24); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); for (let i = 0; i <= steps; i++) { const [x, y] = P(el * i / steps); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = CR.phase === 'crashed' ? '#e5163a' : '#ffc20e'; g.lineWidth = 4; g.lineCap = 'round'; g.stroke();
    const [px, py] = P(Math.max(0, el - 120)); const ang = Math.atan2(ey - py, ex - px);
    g.save(); g.translate(ex, ey); g.rotate(ang + Math.PI / 2);
    if (CR.phase === 'crashed') {
      for (let i = 0; i < 10; i++) { g.fillStyle = ['#ff3b3b', '#ffc20e', '#fff'][i % 3]; g.beginPath(); g.arc(Math.cos(i) * 14 * Math.random(), Math.sin(i * 2) * 14 * Math.random(), 4 + Math.random() * 6, 0, 7); g.fill(); }
    } else {
      g.fillStyle = '#ff8a00'; g.beginPath(); g.moveTo(-6, 14); g.lineTo(0, 24 + Math.random() * 10); g.lineTo(6, 14); g.fill();
      g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(10, -6, 9, 14); g.lineTo(-9, 14); g.quadraticCurveTo(-10, -6, 0, -18); g.fill();
      g.fillStyle = '#e5163a'; g.beginPath(); g.moveTo(-9, 6); g.lineTo(-16, 18); g.lineTo(-9, 14); g.fill(); g.beginPath(); g.moveTo(9, 6); g.lineTo(16, 18); g.lineTo(9, 14); g.fill();
      g.fillStyle = '#2b6cff'; g.beginPath(); g.arc(0, -3, 4, 0, 7); g.fill();
    }
    g.restore();
    multEl.textContent = fmtX(CR.mult);
    multEl.className = 'cr-mult' + (CR.phase === 'crashed' ? ' dead' : '');
  }

  const cur = cc => (cc === 'GH' ? 'GH₵' : '₦');
  function renderPanel(api) {
    if (!$id('crBtn') || !onPage()) return;
    const btn = $id('crBtn'), live = isLive(api);
    let label, cls = '';
    if (live) {
      const ph = livePhase(), r = LV.st?.round, m = LV.mine && r && LV.mine.round === r.id ? LV.mine : null;
      if (LV.busy) label = 'Please wait…';
      else if (ph === 'fly' && m && !m.out) { label = `Cash out ${api.money(m.stake * CR.mult)}`; cls = 'cash'; }
      else if (ph === 'wait' && m) { label = 'Cancel bet'; cls = 'cancel'; }
      else if (LV.queued) { label = 'Cancel (next round)'; cls = 'cancel'; }
      else label = ph === 'wait' ? 'Bet' : 'Bet next round';
    } else {
      const b = CR.bet;
      if (b && !b.out && CR.phase === 'fly') { label = `Cash out ${api.money(b.stake * CR.mult)}`; cls = 'cash'; }
      else if (b && CR.phase === 'wait') { label = 'Cancel bet'; cls = 'cancel'; }
      else if (CR.queued) { label = 'Cancel (next round)'; cls = 'cancel'; }
      else label = CR.phase === 'wait' ? 'Bet' : 'Bet next round';
    }
    if (btn.textContent !== label) btn.textContent = label;
    btn.className = 'cr-btn ' + cls;
    btn.disabled = live && LV.busy;
    const hist = CR.hist.map(x => `<i class="${x >= 10 ? 'hi' : x >= 2 ? 'mid' : 'lo'}">${fmtX(x)}</i>`).join('');
    if ($id('crHist').innerHTML !== hist) $id('crHist').innerHTML = hist;
    let rows, n;
    if (live) {
      const list = LV.st ? LV.st.bets : [], crashed = livePhase() === 'crashed';
      n = list.length;
      rows = list.map(o => { const me = LV.mine && o.id === LV.mine.id; return `<div class="cr-row${me ? ' me' : ''}${o.out ? ' out' : ''}${crashed && !o.out ? ' lost' : ''}"><span>${me ? 'You' : o.name}</span><span>${cur(o.cc)}${Number(o.stake).toLocaleString('en')}</span><span>${o.out ? fmtX(o.out) : '–'}</span><b>${o.out ? cur(o.cc) + Number(o.payout).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</b></div>`; }).join('')
        || '<div class="cr-none">No bets in this round yet – be the first.</div>';
    } else {
      const b = CR.bet, mine = b ? [{ name: 'You', stake: b.stake, out: b.out, me: 1 }] : [], all = mine.concat(CR.others);
      n = all.length;
      rows = all.map(o => `<div class="cr-row${o.me ? ' me' : ''}${o.out ? ' out' : ''}${CR.phase === 'crashed' && !o.out ? ' lost' : ''}"><span>${o.name}</span><span>${api.money(o.stake)}</span><span>${o.out ? fmtX(o.out) : '–'}</span><b>${o.out ? api.money(o.stake * o.out) : ''}</b></div>`).join('');
    }
    $id('crCount').textContent = n;
    if ($id('crBets').innerHTML !== rows) $id('crBets').innerHTML = rows;
  }

  /* ----- provably fair panel (live) ----- */
  async function sha256hex(txt) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  async function pointOf(seed) {
    const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const h = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode('LetBetAfrika Rocket Crash')))].map(x => x.toString(16).padStart(2, '0')).join('');
    return GL.crashPoint(parseInt(h.slice(0, 13), 16) / 2 ** 52);
  }
  function renderFair(api) {
    const el = $id('crFair'); if (!el) return;
    if (!isLive(api)) { el.innerHTML = '<p>Rounds in demo mode are drawn in your browser. On the live site every round is provably fair.</p>'; return; }
    const st = LV.st; if (!st || !st.round) { el.innerHTML = '<p>Loading…</p>'; return; }
    el.innerHTML = `<p>Before betting opens we publish the round's <b>hash</b> = SHA-256(seed). After the crash we reveal the <b>seed</b>.
      The crash point is <code>crashPoint(HMAC-SHA256(seed, "LetBetAfrika Rocket Crash") first 13 hex digits ÷ 2<sup>52</sup>)</code> – 3% house edge, top 200x.</p>
      <div class="cr-frow cur"><span>#${st.round.id}</span><span>now</span><code>${st.round.hash}</code></div>
      ${st.history.slice(0, 10).map(h => `<div class="cr-frow"><span>#${h.id}</span><b>${fmtX(h.point)}</b><code>${h.seed}</code><button data-crv="${h.id}">Verify</button></div>`).join('')}`;
  }
  async function verifyRound(api, id, btn) {
    const h = LV.st && LV.st.history.find(x => x.id === +id); if (!h) return;
    if (!window.crypto || !crypto.subtle) return api.toast('Your browser cannot verify here – use any SHA-256 tool', 'err');
    const ok = (await sha256hex(h.seed)) === h.hash && (await pointOf(h.seed)) === h.point;
    btn.textContent = ok ? 'Verified' : 'Mismatch'; btn.className = ok ? 'ok' : 'bad';
  }

  function loop(api) {
    tick(api); draw(); renderPanel(api);
    CR.raf = requestAnimationFrame(() => loop(api));
  }

  function initCrash(api) {
    CR.api = api;
    CR.hist = Array.from({ length: 10 }, newPoint);
    CR.phase = 'conn';
    $id('crQuick').innerHTML = api.C.chips.map(v => `<button data-crq="${v}">${api.whole(v)}</button>`).join('');
    $id('crStake').value = api.C.defStake;
    document.addEventListener('toggle', e => { if (e.target.id === 'crFairBox' && e.target.open) renderFair(api); }, true);
    document.addEventListener('click', e => {
      const v = e.target.closest('[data-crv]'); if (v) return verifyRound(api, v.dataset.crv, v);
      const t = e.target.closest('[data-cr],[data-crq],#crBtn'); if (!t) return;
      const st = $id('crStake');
      if (t.dataset.cr) { st.value = Math.max(api.C.minStake, (+st.value || 0) + (t.dataset.cr === '+' ? api.C.chips[0] : -api.C.chips[0])); return; }
      if (t.dataset.crq) { st.value = t.dataset.crq; return; }
      const stake = +st.value, auto = +$id('crAuto').value, nb = { stake, auto: auto >= 1.1 ? Math.min(200, auto) : null };
      if (isLive(api)) {
        if (LV.busy) return;
        const ph = livePhase(), r = LV.st?.round, m = LV.mine && r && LV.mine.round === r.id ? LV.mine : null;
        if (ph === 'fly' && m && !m.out) return liveCashout(api);
        if (ph === 'wait' && m) return liveCancel(api);
        if (LV.queued) { LV.queued = null; return; }
        if (!api.user()) return api.login();
        if (!stake || stake < api.C.minStake) return api.toast('Minimum stake is ' + api.whole(api.C.minStake), 'err');
        if (stake > api.user().balance) { api.toast('Insufficient balance – please deposit', 'err'); return api.deposit(); }
        if (ph === 'wait') return livePlace(api, nb);
        LV.queued = { ...nb, after: r?.id }; return api.toast('Bet set for the next round');
      }
      const b = CR.bet;
      if (b && !b.out && CR.phase === 'fly') return cashOut(api);
      if (b && CR.phase === 'wait') { api.credit(b.stake, 'Rocket Crash refund'); CR.bet = null; return; }
      if (CR.queued) { api.credit(CR.queued.stake, 'Rocket Crash refund'); CR.queued = null; return; }
      if (!api.user()) return api.login();
      if (!stake || stake < api.C.minStake) return api.toast('Minimum stake is ' + api.whole(api.C.minStake), 'err');
      if (stake > api.user().balance) return api.toast('Insufficient balance', 'err');
      api.debit(stake, 'Rocket Crash bet');
      const nbd = { stake, auto: nb.auto || 0, out: null };
      if (CR.phase === 'wait') CR.bet = nbd; else { CR.queued = nbd; api.toast('Bet placed for the next round'); }
    });
    loop(api);
  }

  window.Games = { renderLobby, initCrash, GAMES, art };
})();
