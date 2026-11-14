/* =========================================================
   LetBetAfrika – games lobby + Rocket Crash
   Lobby tiles are screenshots of our own game scenes (tools/assets/thumbs.js).
   Rocket Crash runs two ways:
     live – shared rounds from the server (/api/games/crash/*), real bets
            from real players. Each round is committed before betting opens and can be
            audited on the server (GET /api/games/crash/verify/:id – for the admin portal,
            never shown to players)
     demo – the same maths in the browser when there is no server
   ========================================================= */
(() => {
  'use strict';
  // Lobby tiles are captured from the real game scenes (tools/assets/thumbs.js → img/games/thumb-<id>.webp)
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
  const art = id => `<img class="g-art" src="img/games/thumb-${id}.webp" alt="" width="300" height="300" loading="lazy" decoding="async">`;
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
  const $$q = sel => [...document.querySelectorAll(sel)];
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

  /* ----- scene: deep space, parallax stars, glowing curve, rendered LetBet rocket, flame, smoke, explosion ----- */
  const ROCKET = new Image(); ROCKET.decoding = 'async'; ROCKET.src = 'img/games/rocket.webp';
  const FX = { stars: null, parts: [], lastPhase: null, lastPos: null, boom: 0 };
  const r01 = Math.random;
  function starField(W, H) {
    if (FX.stars && FX.stars.W === W && FX.stars.H === H) return FX.stars;
    return (FX.stars = { W, H, layers: [0.012, 0.03, 0.065].map((sp, li) => ({ sp, pts: Array.from({ length: 22 + li * 12 }, () => ({ x: r01() * W, y: r01() * H, r: 0.35 + r01() * (0.5 + li * 0.45), a: 0.25 + r01() * 0.6, tw: r01() * 6 })) })) });
  }
  function niceStep(span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function drawRocket(g, x, y, ang, scale, thrust, now) {
    const w = 24 * scale, h = w * 363 / 160;
    g.save(); g.translate(x, y); g.rotate(ang + Math.PI / 2);
    // flame behind the nozzle
    const fl = h * (0.32 + 0.22 * thrust) * (0.85 + 0.3 * Math.sin(now / 37) * Math.sin(now / 53));
    const fg = g.createLinearGradient(0, h * 0.42, 0, h * 0.42 + fl); fg.addColorStop(0, 'rgba(255,255,230,.95)'); fg.addColorStop(0.3, 'rgba(255,200,60,.9)'); fg.addColorStop(0.7, 'rgba(255,90,20,.55)'); fg.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = fg; g.beginPath(); g.moveTo(-w * 0.2, h * 0.42); g.quadraticCurveTo(-w * 0.34, h * 0.42 + fl * 0.45, 0, h * 0.42 + fl); g.quadraticCurveTo(w * 0.34, h * 0.42 + fl * 0.45, w * 0.2, h * 0.42); g.closePath(); g.fill();
    g.globalCompositeOperation = 'lighter'; const glow = g.createRadialGradient(0, h * 0.5, 0, 0, h * 0.5, w * 1.1); glow.addColorStop(0, 'rgba(255,170,40,.45)'); glow.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(0, h * 0.5, w * 1.1, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    if (ROCKET.complete && ROCKET.naturalWidth) g.drawImage(ROCKET, -w / 2, -h / 2, w, h);
    g.restore();
    return { nx: x - Math.cos(ang) * h * 0.5, ny: y - Math.sin(ang) * h * 0.5 };
  }
  function draw() {
    const cv = $id('crCanvas'); if (!cv || !cv.offsetParent) return;
    const k = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight, now = performance.now();
    if (cv.width !== Math.round(W * k) || cv.height !== Math.round(H * k)) { cv.width = Math.round(W * k); cv.height = Math.round(H * k); }
    const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, W, H);
    const flying = CR.phase === 'fly', el = flying ? Date.now() - CR.t0 : CR.phase === 'crashed' ? Math.log(CR.point) / GL.CRASH.k : 0;
    // sky, nebulae, planet
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#050918'); bg.addColorStop(0.55, '#0b0a24'); bg.addColorStop(1, '#170a22'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (const [nx, ny, nr, c] of [[0.2, 0.25, 0.5, '90,60,200'], [0.75, 0.15, 0.4, '20,140,90'], [0.55, 0.7, 0.45, '160,40,120']]) { const n = g.createRadialGradient(W * nx, H * ny, 0, W * nx, H * ny, W * nr); n.addColorStop(0, `rgba(${c},.16)`); n.addColorStop(1, `rgba(${c},0)`); g.fillStyle = n; g.fillRect(0, 0, W, H); }
    const px = W * 0.95, py = H * 1.32, pr = W * 0.5;
    const at = g.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.18); at.addColorStop(0, 'rgba(46,209,107,.35)'); at.addColorStop(1, 'rgba(46,209,107,0)'); g.fillStyle = at; g.beginPath(); g.arc(px, py, pr * 1.18, 0, 7); g.fill();
    const pl = g.createRadialGradient(px - pr * 0.4, py - pr * 0.5, pr * 0.1, px, py, pr); pl.addColorStop(0, '#2f6f63'); pl.addColorStop(0.6, '#123a3a'); pl.addColorStop(1, '#061416'); g.fillStyle = pl; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
    // stars – they stream past faster as the rocket speeds up
    const sf = starField(W, H), speed = flying ? Math.min(6, 1 + el / 4000) : 0.25, drift = flying ? el * 0.06 : now * 0.004;
    for (const L of sf.layers) for (const s of L.pts) {
      const x = ((s.x - drift * L.sp * 20 * speed) % W + W) % W, y = (s.y + drift * L.sp * 6 * speed) % H;
      g.globalAlpha = s.a * (0.75 + 0.25 * Math.sin(now / 600 + s.tw)); g.fillStyle = '#fff'; g.fillRect(x, y, s.r * (flying ? 1 + speed * 0.6 : 1), s.r); }
    g.globalAlpha = 1;
    const msg = $id('crMsg'), multEl = $id('crMult');
    if (CR.phase === 'conn' || CR.phase === 'wait') {
      // rocket waiting on the launch pad
      const lx = 46, ly = H - 22;
      g.fillStyle = '#2a2f39'; g.fillRect(lx - 26, ly + 6, 52, 6); g.fillStyle = '#ffc20e'; g.fillRect(lx - 26, ly + 5, 52, 2);
      drawRocket(g, lx, ly - 22, -Math.PI / 2, 1, 0.15, now);
      multEl.textContent = ''; multEl.className = 'cr-mult';
      if (CR.phase === 'conn') msg.innerHTML = '<b>Connecting to the next round…</b>';
      else { const sec = Math.max(0, (CR.waitUntil - Date.now()) / 1000); msg.innerHTML = `<small>NEXT ROUND IN</small><b>${sec.toFixed(1)}s</b><i style="width:${100 - sec / (GL.CRASH.waitMs / 1000) * 100}%"></i>`; }
      msg.hidden = false; FX.lastPhase = CR.phase; FX.parts.length = 0; return;
    }
    msg.hidden = true;
    // axes
    const maxT = Math.max(8000, el * 1.15), rate = t => Math.pow(Math.E, GL.CRASH.k * t), maxM = Math.max(2, rate(maxT) * 1.05);
    const L0 = 34, B0 = H - 22, P = t => [L0 + (t / maxT) * (W - L0 - 30), B0 - ((rate(t) - 1) / (maxM - 1)) * (B0 - 40)];
    g.font = '600 10px Roboto, Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,.45)'; g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    const ms = niceStep(maxM - 1, 4); for (let m = 1; m <= maxM; m += ms) { const y = B0 - ((m - 1) / (maxM - 1)) * (B0 - 40); g.beginPath(); g.moveTo(L0, y); g.lineTo(W, y); g.stroke(); g.fillText((+m.toFixed(2)) + 'x', 4, y + 3); }
    const ts = niceStep(maxT / 1000, 5); for (let s2 = 0; s2 <= maxT / 1000; s2 += ts) { const x = L0 + (s2 * 1000 / maxT) * (W - L0 - 30); g.fillText(Math.round(s2) + 's', x - 4, H - 6); }
    // curve with glow
    const [ex, ey] = P(el), steps = 70;
    const fill = g.createLinearGradient(0, B0, 0, ey); fill.addColorStop(0, 'rgba(255,194,14,0)'); fill.addColorStop(1, CR.phase === 'crashed' ? 'rgba(229,22,58,.28)' : 'rgba(255,194,14,.3)');
    g.beginPath(); g.moveTo(L0, B0); for (let i = 0; i <= steps; i++) { const [x, y] = P(el * i / steps); g.lineTo(x, y); } g.lineTo(ex, B0); g.closePath(); g.fillStyle = fill; g.fill();
    const sg = g.createLinearGradient(L0, B0, ex, ey); sg.addColorStop(0, '#ffc20e'); sg.addColorStop(1, CR.phase === 'crashed' ? '#e5163a' : '#ff8a00');
    g.save(); g.shadowColor = CR.phase === 'crashed' ? 'rgba(229,22,58,.8)' : 'rgba(255,194,14,.8)'; g.shadowBlur = 12; g.strokeStyle = sg; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i <= steps; i++) { const [x, y] = P(el * i / steps); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore();
    const [qx, qy] = P(Math.max(0, el - 160)), ang = Math.atan2(ey - qy, ex - qx);
    if (CR.phase === 'fly') {
      const n = drawRocket(g, ex, ey, ang, 1, 1, now);
      for (let i = 0; i < 2; i++) FX.parts.push({ x: n.nx, y: n.ny, vx: -Math.cos(ang) * 50 + (r01() - 0.5) * 30, vy: -Math.sin(ang) * 50 + (r01() - 0.5) * 30, life: 1, r: 2 + r01() * 3, smoke: true });
      FX.lastPos = [ex, ey];
    } else if (FX.lastPhase === 'fly' && FX.lastPos) {        // just crashed: explosion
      const [bx, by] = FX.lastPos; FX.boom = now;
      for (let i = 0; i < 52; i++) { const a = r01() * Math.PI * 2, v = 60 + r01() * 230; FX.parts.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + r01() * 0.5, r: 1.5 + r01() * 3.5, c: ['#fff6c8', '#ffc20e', '#ff8a00', '#e5163a', '#9aa0aa'][i % 5] }); }
      if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
    }
    if (FX.boom && now - FX.boom < 450 && FX.lastPos) { const q = (now - FX.boom) / 450, [bx, by] = FX.lastPos; g.strokeStyle = `rgba(255,220,150,${1 - q})`; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, 10 + q * 60, 0, 7); g.stroke();
      const fl = g.createRadialGradient(bx, by, 0, bx, by, 40); fl.addColorStop(0, `rgba(255,240,200,${0.9 * (1 - q)})`); fl.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = fl; g.beginPath(); g.arc(bx, by, 40, 0, 7); g.fill(); }
    // particles (smoke + explosion debris)
    const dt = 1 / 60;
    FX.parts = FX.parts.filter(p => (p.life -= dt * (p.smoke ? 1.1 : 0.9)) > 0);
    for (const p of FX.parts) { p.x += p.vx * dt; p.y += p.vy * dt; if (!p.smoke) p.vy += 120 * dt;
      g.globalAlpha = Math.max(0, p.life) * (p.smoke ? 0.32 : 1); g.fillStyle = p.smoke ? '#c9ccd2' : p.c; g.beginPath(); g.arc(p.x, p.y, p.smoke ? p.r * (2 - p.life) : p.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    FX.lastPhase = CR.phase;
    multEl.innerHTML = CR.phase === 'crashed' ? `<small>FLEW AWAY!</small>${fmtX(CR.mult)}` : fmtX(CR.mult);
    multEl.className = 'cr-mult' + (CR.phase === 'crashed' ? ' dead' : CR.mult >= 2 ? ' cr-hot' : '');
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
    const u = api.user(), bal = $id('crBal'), bt = u ? api.money(u.balance) : 'Log in'; if (bal && bal.textContent !== bt) bal.textContent = bt;
    const sv = +$id('crStake').value; $$q('#crQuick .gx-chipbtn').forEach(b => b.classList.toggle('on', +b.dataset.crq === sv));
    if ($id('crBets').innerHTML !== rows) $id('crBets').innerHTML = rows;
  }

  function loop(api) {
    tick(api); draw(); renderPanel(api);
    CR.raf = requestAnimationFrame(() => loop(api));
  }

  function initCrash(api) {
    CR.api = api;
    CR.hist = Array.from({ length: 10 }, newPoint);
    CR.phase = 'conn';
    $id('crQuick').innerHTML = api.C.chips.map((v, i) => `<button class="gx-chipbtn c${i + 1}" data-crq="${v}" aria-label="Stake ${api.whole(v)}"><i><b>${v >= 1000 ? v / 1000 + 'K' : v}</b></i></button>`).join('');
    $id('crStake').value = api.C.defStake;
    document.addEventListener('click', e => {
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
