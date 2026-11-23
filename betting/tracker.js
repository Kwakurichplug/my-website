/* =========================================================
   LetBetAfrika – Match tracker (match page, live football)
   • Virtual League: an animated pitch – ball, possession, safe / attack / dangerous attack, corners, goals, HT / FT,
     and an attack-pressure chart. The play is generated per match and minute (same for every viewer) and shaped by
     the real goals of that simulated match: a goal is preceded by its build-up and lands at its minute. Goals are
     only known once the server has drawn them, so nothing here tells a player anything early.
   • Real matches and your own (admin-run) matches: we have the score and the clock, not ball data – so the pitch shows
     the clock, the score, goal celebrations and the goal timeline, never invented play, plus how fresh the score is.
   ========================================================= */
(() => {
  'use strict';
  const A = () => window.LBA_APP, $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const W = 600, H = 340, PAD = 14;
  const T = { id: null, raf: 0, el: null, ball: { x: W / 2, y: H / 2 }, target: { x: W / 2, y: H / 2 }, lastKey: '', overlay: null, overlayUntil: 0, score: null, corners: null, hidden: false, lastPaint: 0 };
  try { T.hidden = localStorage.getItem('lba_tracker_hidden') === '1'; } catch {}

  // stable pseudo-random numbers per (match, minute): every viewer sees the same play
  const hash = (...a) => { let h = 2166136261; for (const v of a) for (const ch of String(v)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
  const hue = name => { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const col = name => `hsl(${hue(name)},70%,48%)`;
  // the two sides always look different: an away colour too close to the home one is turned round the colour wheel
  const sideCol = (m, side) => { const h = hue(m.home), a = hue(m.away), d = Math.abs(h - a), far = d < 60 || d > 300 ? (a + 180) % 360 : a; return `hsl(${side ? far : h},70%,48%)`; };

  // the play at a minute of a Virtual League match: who has the ball and how dangerous it is
  const goalT = g => ({ half: g.min > 45 ? 2 : 1, t: g.min + (g.plus || 0) });
  function playAt(m, half, t) {
    const goals = (m.srvGoals || []).map(g => ({ ...goalT(g), side: g.side }));
    const next = goals.find(g => g.half === half && g.t >= t && g.t - t <= 3);
    if (next) return { side: next.side, phase: next.t - t <= 1 ? 'danger' : 'attack', build: true };
    const block = Math.floor(t / 3), side = hash(m.id, half, block, 's') < 0.5 ? 0 : 1, r = hash(m.id, half, t, 'p');
    return { side, phase: r < 0.55 ? 'safe' : r < 0.85 ? 'attack' : 'danger' };
  }
  // where the ball goes for that play (home attacks to the right)
  function spot(m, half, t, p) {
    const r1 = hash(m.id, half, t, 'x'), r2 = hash(m.id, half, t, 'y');
    const band = { safe: [0.22, 0.48], attack: [0.5, 0.74], danger: [0.78, 0.92] }[p.phase];
    let fx = band[0] + (band[1] - band[0]) * r1; if (p.side === 1) fx = 1 - fx;
    const fy = p.phase === 'danger' ? 0.32 + 0.36 * r2 : 0.14 + 0.72 * r2;
    return { x: PAD + fx * (W - 2 * PAD), y: PAD + fy * (H - 2 * PAD) };
  }
  const PH = { safe: 'Ball safe', attack: 'Attack', danger: 'Dangerous attack' };

  function pitchSVG() {
    const L = 'stroke="rgba(255,255,255,.75)" stroke-width="2" fill="none"';
    const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${i * 60}" y="0" width="60" height="${H}" fill="${i % 2 ? '#1f8a45' : '#23974c'}"/>`).join('');
    return `<svg class="tk-pitch" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${stripes}<rect class="tk-zone" id="tkZone" x="0" y="0" width="0" height="${H}" fill="rgba(255,255,255,.0)"/>
      <rect x="${PAD}" y="${PAD}" width="${W - 2 * PAD}" height="${H - 2 * PAD}" ${L}/>
      <line x1="${W / 2}" y1="${PAD}" x2="${W / 2}" y2="${H - PAD}" ${L}/><circle cx="${W / 2}" cy="${H / 2}" r="44" ${L}/><circle cx="${W / 2}" cy="${H / 2}" r="3" fill="#fff"/>
      <rect x="${PAD}" y="${H / 2 - 80}" width="84" height="160" ${L}/><rect x="${PAD}" y="${H / 2 - 36}" width="30" height="72" ${L}/>
      <rect x="${W - PAD - 84}" y="${H / 2 - 80}" width="84" height="160" ${L}/><rect x="${W - PAD - 30}" y="${H / 2 - 36}" width="30" height="72" ${L}/>
      <rect class="tk-net l" x="${PAD - 8}" y="${H / 2 - 22}" width="8" height="44" fill="rgba(255,255,255,.35)"/><rect class="tk-net r" x="${W - PAD}" y="${H / 2 - 22}" width="8" height="44" fill="rgba(255,255,255,.35)"/>
      <path d="M${PAD} ${PAD + 12}a12 12 0 0 0 12 -12M${W - PAD - 12} ${PAD}a12 12 0 0 0 12 12M${PAD + 12} ${H - PAD}a12 12 0 0 0 -12 -12M${W - PAD} ${H - PAD - 12}a12 12 0 0 0 -12 12" ${L}/>
      <g id="tkTrail"></g>
      <g id="tkBall"><circle r="11" fill="rgba(255,255,255,.22)"/><circle r="6.5" fill="#fff" stroke="#1c1f23" stroke-width="1.5"/></g>
    </svg>`;
  }

  function shell(m) {
    const a = A();
    return `<div class="tk-card">
      <div class="tk-head"><span class="tk-tag"><i></i>${m.virtual ? 'Match tracker' : 'Live score'}</span><button class="tk-min" data-tk-toggle aria-label="${T.hidden ? 'Show' : 'Hide'} the tracker">${T.hidden ? 'Show tracker' : 'Hide'}</button></div>
      <div class="tk-body"${T.hidden ? ' hidden' : ''}>
        <div class="tk-board">
          <span class="tk-team h"><i style="background:${sideCol(m, 0)}"></i>${a.crest(m.home, 0, m.sport)}<b>${esc(m.home)}</b></span>
          <span class="tk-score"><b id="tkSc">–</b><small id="tkClk"></small></span>
          <span class="tk-team a"><b>${esc(m.away)}</b>${a.crest(m.away, 0, m.sport)}<i style="background:${sideCol(m, 1)}"></i></span>
        </div>
        <div class="tk-stage">${pitchSVG()}<div class="tk-over" id="tkOver" hidden></div><div class="tk-call" id="tkCall"></div></div>
        <div class="tk-mom"><svg viewBox="0 0 450 44" preserveAspectRatio="none" id="tkMom"></svg><div class="tk-mom-l"><span>0'</span><span>HT</span><span>90'</span></div></div>
        <div class="tk-foot" id="tkFoot"></div>
      </div>
    </div>`;
  }

  // the attack-pressure chart: one bar per 2 minutes, up for home, down for away; goals marked
  function momentum(m, upto) {
    const svg = $('#tkMom', T.el); if (!svg) return;
    const bars = [], half = t => (t <= 45 ? 1 : 2);
    if (m.virtual) for (let t = 1; t <= Math.min(90, upto); t += 2) {
      const p = playAt(m, half(t), t), v = p.phase === 'danger' ? 1 : p.phase === 'attack' ? 0.62 : 0.28, x = (t - 1) / 90 * 450, h = v * 20;
      bars.push(`<rect x="${x.toFixed(1)}" y="${p.side ? 22 : (22 - h).toFixed(1)}" width="4" height="${h.toFixed(1)}" rx="1" fill="${sideCol(m, p.side)}" opacity="${p.phase === 'safe' ? 0.45 : 0.9}"/>`);
    }
    const goals = (m.ev || []).filter(e => e.type === 'goal').map(g => { const x = Math.min(446, (g.min + (g.plus ? 0.5 : 0)) / 90 * 450); return `<circle cx="${x.toFixed(1)}" cy="${g.side ? 38 : 6}" r="4" fill="#fff" stroke="${sideCol(m, g.side)}" stroke-width="2"/>`; });
    svg.innerHTML = `<line x1="0" y1="22" x2="450" y2="22" stroke="rgba(255,255,255,.25)"/><line x1="225" y1="0" x2="225" y2="44" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 3"/>${bars.join('')}${goals.join('')}`;
  }

  function overlay(kind, text, ms = 3200) { T.overlay = { kind, text }; T.overlayUntil = Date.now() + ms; const o = $('#tkOver', T.el); if (o) { o.hidden = false; o.className = 'tk-over ' + kind; o.innerHTML = text; } }

  function frame() {
    T.raf = requestAnimationFrame(frame);
    const a = A(); if (!a || !T.el || T.hidden) return;
    const m = a.byId(T.id); if (!m) return;
    const now = Date.now();
    // overlays come and go
    if (T.overlay && now > T.overlayUntil) { T.overlay = null; const o = $('#tkOver', T.el); if (o) o.hidden = true; }
    const ft = m.finished, live = m.live, c = live ? a.clockOf(m) : null;
    // score + clock
    const sc = m.noScore ? '– : –' : `${m.score[0]} : ${m.score[1]}`;
    const clk = ft ? 'Full time' : !live ? 'Not started' : c ? (c.period === 'HT' ? 'Half-time' : (a.clockParts(m, c) || {}).main || `${m.minute}'`) : `${m.minute}'`;
    if (now - T.lastPaint > 200) { T.lastPaint = now; const s = $('#tkSc', T.el), k = $('#tkClk', T.el); if (s && s.textContent !== sc) s.textContent = sc; if (k && k.textContent !== clk) k.textContent = clk; }
    // goals: the shown score went up
    if (T.score && (m.score[0] > T.score[0] || m.score[1] > T.score[1])) {
      const side = m.score[0] > T.score[0] ? 0 : 1, team = side ? m.away : m.home;
      overlay('goal', `<b>GOAL!</b><span>${esc(team)}</span><em>${m.score[0]} – ${m.score[1]}</em>`, 3600);
      T.target = { x: side ? PAD - 2 : W - PAD + 2, y: H / 2 + (hash(m.id, m.score.join(), 'g') - 0.5) * 30 };
      const net = $(`.tk-net.${side ? 'l' : 'r'}`, T.el); if (net) { net.classList.remove('hit'); void net.getBoundingClientRect(); net.classList.add('hit'); }
    }
    T.score = [...m.score];
    // corners (Virtual League: the count the server shows)
    const cn = m.st && m.st.corners ? [...m.st.corners] : null;
    if (m.virtual && cn && T.corners && (cn[0] > T.corners[0] || cn[1] > T.corners[1]) && !T.overlay) {
      const side = cn[0] > T.corners[0] ? 0 : 1, top = hash(m.id, cn.join(), 'c') < 0.5;
      overlay('corner', `<b>Corner</b><span>${esc(side ? m.away : m.home)}</span>`, 2200);
      T.target = { x: side ? PAD + 4 : W - PAD - 4, y: top ? PAD + 4 : H - PAD - 4 };
    }
    if (cn) T.corners = cn;

    const call = $('#tkCall', T.el), zone = $('#tkZone', T.el);
    if (ft) { if (!T.overlay || T.overlay.kind !== 'ft') overlay('ft', `<b>Full time</b><em>${m.score[0]} – ${m.score[1]}</em>`, 1e9); T.target = { x: W / 2, y: H / 2 }; if (call) call.textContent = ''; }
    else if (!live) { if (!T.overlay || T.overlay.kind !== 'pre') overlay('pre', `<b>Kick-off</b><em>${new Date(m.kick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</em>`, 1e9); }
    else if (c && c.period === 'HT') { if (!T.overlay || T.overlay.kind !== 'ht') overlay('ht', `<b>Half-time</b><em>${m.score[0]} – ${m.score[1]}</em>`, 1e9); T.target = { x: W / 2, y: H / 2 }; if (call) call.textContent = ''; }
    else {
      if (T.overlay && ['ht', 'pre', 'ft'].includes(T.overlay.kind)) { T.overlay = null; const o = $('#tkOver', T.el); if (o) o.hidden = true; }
      if (m.virtual && c && c.t) {
        const key = `${c.half}:${c.t}`;
        if (key !== T.lastKey && !(T.overlay && (T.overlay.kind === 'goal' || T.overlay.kind === 'corner'))) {
          T.lastKey = key;
          const p = playAt(m, c.half, c.t); T.target = spot(m, c.half, c.t, p); T.play = p;
          momentum(m, c.half === 1 ? Math.min(45, c.t) : c.t);
        }
        const p = T.play;
        if (p && call && !T.overlay) { const t = `${PH[p.phase]} · ${p.side ? m.away : m.home}`; if (call.textContent !== t) { call.textContent = t; call.className = 'tk-call ' + p.phase; } }
        if (p && zone) { const x0 = p.side ? 0 : W / 2, wd = p.phase === 'safe' ? 0 : W / 2; zone.setAttribute('x', p.side ? x0 : W - wd); zone.setAttribute('width', wd); zone.setAttribute('fill', p.phase === 'danger' ? 'rgba(255,80,80,.16)' : 'rgba(255,255,255,.07)'); }
      } else {
        // real / admin-run: no invented play – the ball rests on the centre spot between goals
        if (!T.overlay) T.target = { x: W / 2, y: H / 2 };
        if (call && !T.overlay) { const t = m.noScore ? 'In play – waiting for the first score update' : 'In play'; if (call.textContent !== t) { call.textContent = t; call.className = 'tk-call safe'; } }
        if (now - (T.lastMom || 0) > 5000) { T.lastMom = now; momentum(m, 90); }
      }
    }
    // the ball eases to where the play is
    const b = T.ball, tg = T.target, k = T.overlay && T.overlay.kind === 'goal' ? 0.12 : 0.045;
    b.x += (tg.x - b.x) * k; b.y += (tg.y - b.y) * k;
    const jitter = live && m.virtual && !T.overlay ? Math.sin(now / 160) * 1.2 : 0;
    const ball = $('#tkBall', T.el); if (ball) ball.setAttribute('transform', `translate(${b.x.toFixed(1)} ${(b.y + jitter).toFixed(1)})`);
    // footer: how fresh the score is (real matches) / what the tracker is
    if (now - (T.lastFoot || 0) > 1000) {
      T.lastFoot = now; const f = $('#tkFoot', T.el);
      if (f) f.textContent = m.virtual ? 'Virtual League · goals and corners as they happen' : m.manual ? 'Score kept live by LetBetAfrika.'
        : m.scoreAt ? `Score from the live feed · updated ${Math.max(0, Math.round((now - m.scoreAt) / 60000))} min ago` : 'Score from the live feed.';
    }
  }

  function show(id) {
    const host = $('#mdTracker'); if (!host) return;
    const a = A(), m = a && a.byId(id);
    const football = m && (m.sport === 'football' || m.sport === 'vfootball');
    if (!football || (!m.live && !m.finished && m.kick - Date.now() > 30 * 60000)) { hide(); return; }   // pre-match: shown from 30 min before kick-off
    if (T.id !== id || !host.firstChild) {
      T.id = id; T.el = host; T.score = null; T.corners = null; T.lastKey = ''; T.overlay = null; T.ball = { x: W / 2, y: H / 2 }; T.target = { x: W / 2, y: H / 2 };
      host.innerHTML = shell(m); host.hidden = false;
      momentum(m, m.finished ? 90 : 0);
    }
    host.hidden = false;
    const pg = $('#page-match'); if (pg) pg.classList.toggle('has-tracker', !T.hidden);   // the tracker carries the clock bar and the play
    cancelAnimationFrame(T.raf); T.raf = requestAnimationFrame(frame);
  }
  function hide() { cancelAnimationFrame(T.raf); T.raf = 0; T.id = null; const host = $('#mdTracker'); if (host) { host.hidden = true; host.innerHTML = ''; } const pg = $('#page-match'); if (pg) pg.classList.remove('has-tracker'); }
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-tk-toggle]')) return;
    T.hidden = !T.hidden; try { localStorage.setItem('lba_tracker_hidden', T.hidden ? '1' : '0'); } catch {}
    const id = T.id; const host = $('#mdTracker'); if (host) host.innerHTML = ''; T.id = null; if (id) show(id);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(T.raf); else if (T.id) T.raf = requestAnimationFrame(frame); });

  window.Tracker = { show, hide };
})();
