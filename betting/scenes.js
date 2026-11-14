/* =========================================================
   LetBetAfrika – game scenes ("LetBet Originals")
   One scene per instant game. Interface used by arcade.js:
     html(ctx)            markup for the scene
     mount(el, ctx)       wire events / canvases after the markup is in the page
     play(el, r, ctx)     animate a result from the server (or demo); resolves when it is on screen
     reset(el, ctx)       optional – back to the idle state before the next play
   ctx: { id, S, GL, choice(), setChoice(v), stake(), money(v), busy(), play(choice) }
   No result is ever decided here – scenes only animate what the server returned.
   ========================================================= */
(() => {
  'use strict';
  const GL = () => window.GameLogic;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const short = x => +Number(x).toFixed(2) + 'x';
  const raf = fn => new Promise(done => { const t0 = performance.now(); const step = t => { if (fn(t - t0) === false) return done(); requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const dpr = () => Math.min(2.5, devicePixelRatio || 1);
  function fitCanvas(cv, w, h) { const k = dpr(); cv.width = Math.round(w * k); cv.height = Math.round(h * k); cv.style.aspectRatio = `${w} / ${h}`; const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); return g; }
  const img = src => { const i = new Image(); i.decoding = 'async'; i.src = src; return i; };
  const SPR = { ball: img('img/games/ball.webp') };
  const chip = (v, cls = '') => `<i class="gx-chip ${cls}"><b>${v}</b></i>`;

  /* ================= LUCKY DICE – craps-style felt table, 3D dice thrown across it ================= */
  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const FACE_AT = { 1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)' };
  const SHOW = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };   // [rotX, rotY] that turns face v to the viewer
  const dieHTML = i => `<div class="dc" id="dc${i}"><div class="dc-tilt"><div class="dc-cube" id="dcc${i}">${[1, 2, 3, 4, 5, 6].map(v => `<div class="dc-f" style="transform:${FACE_AT[v]} translateZ(var(--dh))">${Array.from({ length: 9 }, (_, k) => `<i${PIPS[v].includes(k + 1) ? ' class="p"' : ''}></i>`).join('')}</div>`).join('')}</div></div></div><i class="dc-sh" id="dcs${i}"></i>`;
  const diceTotalCls = s => (s < 7 ? 'under' : s === 7 ? 'seven' : 'over');
  const dice = {
    html: ctx => {
      const D = GL().DICE, ch = ctx.choice();
      return `<div class="dz">
        <div class="dz-print"><span>LETBET AFRIKA</span><b>LUCKY DICE</b></div>
        <div class="dz-roll" id="dzRoll">${dieHTML(0)}${dieHTML(1)}<div class="dz-total" id="dzTotal" hidden></div></div>
        <div class="dz-zones" role="radiogroup" aria-label="Your bet">
          ${[['under', 'UNDER 7', '2 – 6'], ['seven', '7', 'SEVEN'], ['over', 'OVER 7', '8 – 12']].map(([k, l, s]) => `<button class="dz-zone ${k} ${ch === k ? 'on' : ''}" data-gx="choice" data-v="${k}" role="radio" aria-checked="${ch === k}">
            <b>${l}</b><small>${s}</small><em>PAYS ${short(D[k].mult)}</em>${ch === k ? chip(ctx.chipLabel()) : ''}</button>`).join('')}
        </div></div>`;
    },
    mount: (el, ctx) => {
      // idle: two dice resting on the felt, showing the last result (or 3 and 4)
      const last = ctx.S.res.dice, v = last ? last.dice : [3, 4], roll = el.querySelector('#dzRoll'), W = roll.clientWidth, H = roll.clientHeight;
      v.forEach((n, i) => {
        const p = { x: W * (i ? 0.6 : 0.4), y: H * 0.48 }, d = el.querySelector('#dc' + i), c = el.querySelector('#dcc' + i), sh = el.querySelector('#dcs' + i);
        d.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`;
        c.style.transform = `rotateZ(${i ? 14 : -10}deg) rotateX(${SHOW[n][0]}deg) rotateY(${SHOW[n][1]}deg)`;
        sh.style.transform = `translate(${p.x + 6}px,${p.y + 10}px) translate(-50%,-50%)`;
      });
      if (last) { const t = el.querySelector('#dzTotal'); t.hidden = false; t.className = 'dz-total ' + diceTotalCls(last.sum); t.innerHTML = `<b>${last.sum}</b>`; }
    },
    play: async (el, r) => {
      const roll = el.querySelector('#dzRoll'), W = roll.clientWidth, H = roll.clientHeight, tot = el.querySelector('#dzTotal');
      tot.hidden = true; el.querySelectorAll('.dz-zone').forEach(z => z.classList.remove('win', 'lose'));
      const runs = r.result.dice.map((n, i) => {
        const d = el.querySelector('#dc' + i), c = el.querySelector('#dcc' + i), sh = el.querySelector('#dcs' + i);
        const T = still() ? 10 : 1350 + i * 140, [fx, fy] = SHOW[n], rz = rnd(-35, 35), spinX = 360 * (2 + i), spinY = 360 * (2 - i);
        const start = { x: W * 1.12, y: H * 1.05 }, hit = { x: W * (i ? 0.7 : 0.48), y: H * 0.62 }, end = { x: W * (i ? 0.61 : 0.39) + rnd(-8, 8), y: H * 0.46 + rnd(-6, 6) };
        const hop = { x: (hit.x + end.x) / 2, y: (hit.y + end.y) / 2 - 8 };
        const at = (p, s) => `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${s})`;
        const sat = (p, s, k) => `translate(${p.x + 6 + k * 26}px,${p.y + 10 + k * 22}px) translate(-50%,-50%) scale(${s})`;
        const kf = [[start, 1.55, 0], [hit, 1, 0.42], [hop, 1.16, 0.62], [end, 1, 0.8], [end, 1, 1]];
        d.animate(kf.map(([p, s, o]) => ({ transform: at(p, s), offset: o })), { duration: T, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'forwards' });
        sh.animate(kf.map(([p, s, o]) => ({ transform: sat(p, 1 + (s - 1) * 1.6, s - 1), opacity: 1 - (s - 1) * 1.1, offset: o })), { duration: T, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'forwards' });
        const rot = (x, y, z) => `rotateZ(${z}deg) rotateX(${x}deg) rotateY(${y}deg)`;
        const a = c.animate([
          { transform: rot(rnd(0, 360), rnd(0, 360), rnd(0, 360)) },
          { transform: rot(fx + spinX * 0.42, fy + spinY * 0.42, rz + 140), offset: 0.42 },
          { transform: rot(fx + spinX * 0.1, fy + spinY * 0.1, rz + 30), offset: 0.7 },
          { transform: rot(fx, fy, rz) }], { duration: T, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
        return a.finished.then(() => { d.style.transform = at(end, 1); c.style.transform = rot(fx, fy, rz); sh.style.transform = sat(end, 1, 0); });
      });
      await Promise.all(runs);
      const s = r.result.sum, k = diceTotalCls(s);
      tot.hidden = false; tot.className = 'dz-total pop ' + k; tot.innerHTML = `<b>${s}</b>`;
      el.querySelectorAll('.dz-zone').forEach(z => z.classList.add(z.dataset.v === k ? 'win' : 'lose'));
      await wait(450);
    },
  };

  /* ================= SPIN & WIN – game-show wheel: gold rim, chasing bulbs, pegs and a ticking flapper ================= */
  const WCOL = m => (m === 0 ? ['#3a3f4a', '#1c1f26'] : m >= 5 ? ['#ffe27a', '#e09b00'] : m >= 3 ? ['#ff4d67', '#a50f2a'] : m >= 2 ? ['#b157d6', '#5b1d7a'] : m >= 1.5 ? ['#4d8dff', '#1740a8'] : m >= 1.2 ? ['#2ed16b', '#086b2f'] : ['#8a94a6', '#4a5260']);
  const WH = { angle: 0, flap: 0, flapV: 0 };
  const wheelSVG = () => {
    const W = GL().WHEEL, N = W.length, seg = 360 / N, R = 132, pt = (a, r) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
    const grads = [...new Set(W)].map(m => { const [a, b] = WCOL(m); return `<radialGradient id="wg${String(m).replace('.', '_')}" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse"><stop offset=".25" stop-color="${b}"/><stop offset=".95" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`; }).join('');
    const segs = W.map((m, i) => {
      const a0 = i * seg - seg / 2, a1 = a0 + seg, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [tx, ty] = pt(i * seg, R * 0.7), rot = i * seg <= 180 ? i * seg - 90 : i * seg + 90;
      return `<path d="M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}z" fill="url(#wg${String(m).replace('.', '_')})"/>
        <text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${rot} ${tx.toFixed(2)} ${ty.toFixed(2)})" class="wh-t${m >= 5 ? ' dk' : ''}">${m ? short(m) : '0'}</text>`;
    }).join('');
    const seps = W.map((_, i) => { const [x, y] = pt(i * seg + seg / 2, R); return `<line x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/>`; }).join('');
    const pegs = W.map((_, i) => { const [x, y] = pt(i * seg + seg / 2, R - 6); return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.2"/>`; }).join('');
    const bulbs = W.map((_, i) => { const [x, y] = pt(i * seg, R + 13); return `<circle class="wh-b ${i % 2 ? 'o' : 'e'}" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6"/>`; }).join('');
    return `<div class="wh" id="wh"><div class="wh-beams"></div><svg viewBox="-160 -160 320 320" class="wh-svg" aria-hidden="true">
      <defs>${grads}
        <linearGradient id="whRim" x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff2b0"/><stop offset=".25" stop-color="#ffc20e"/><stop offset=".55" stop-color="#9a6200"/><stop offset=".8" stop-color="#ffd24d"/><stop offset="1" stop-color="#7a4d00"/></linearGradient>
        <radialGradient id="whHub" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff3c0"/><stop offset=".45" stop-color="#ffc20e"/><stop offset="1" stop-color="#8a5a00"/></radialGradient>
        <radialGradient id="whPeg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#e8e3d0"/><stop offset="1" stop-color="#8f8a78"/></radialGradient>
        <linearGradient id="whGloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="whFlapG" x1="0" x2="1"><stop offset="0" stop-color="#7a4d00"/><stop offset=".45" stop-color="#ffe27a"/><stop offset="1" stop-color="#b87900"/></linearGradient>
        <filter id="whShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000" flood-opacity=".55"/></filter>
      </defs>
      <circle r="158" fill="#120d1f" filter="url(#whShadow)"/>
      <circle r="154" fill="url(#whRim)"/><circle r="139" fill="#1b1430"/>
      ${bulbs}
      <g id="whRot" style="transform:rotate(${WH.angle}deg)">${segs}<g class="wh-sep">${seps}</g><g fill="url(#whPeg)" stroke="#5f5a48" stroke-width=".8">${pegs}</g></g>
      <circle r="133" fill="none" stroke="#ffd24d" stroke-width="2"/>
      <circle r="30" fill="url(#whHub)" stroke="#7a4d00" stroke-width="2"/><circle r="23" fill="none" stroke="#fff3c0" stroke-opacity=".6"/>
      <text y="1" class="wh-hub">LB</text>
      <path d="M-120-60A140 140 0 0 1 60-128L0 0z" fill="url(#whGloss)" pointer-events="none"/>
      <g id="whFlap" class="wh-flap" style="transform:rotate(0deg)"><path d="M-11-158h22l-3 16-8 26-8-26z" fill="url(#whFlapG)" stroke="#5a3a00" stroke-width="1.2"/><circle cy="-152" r="4" fill="#c8102e"/></g>
    </svg></div>`;
  };
  const spin = {
    html: () => wheelSVG(),
    play: (el, r) => new Promise(done => {
      const g = el.querySelector('#whRot'), flap = el.querySelector('#whFlap'), wrap = el.querySelector('#wh');
      const seg = 360 / GL().WHEEL.length, start = WH.angle % 360, T = still() ? 60 : 4800;
      const target = start + 360 * 6 + ((((-r.result.segment * seg) - start) % 360) + 360) % 360 + rnd(-seg * 0.32, seg * 0.32);
      const ease = p => 1 - Math.pow(1 - p, 3.3);
      let lastPeg = Math.floor((start + seg / 2) / seg), lastT = 0;
      wrap.classList.add('spinning');
      raf(t => {
        const p = Math.min(1, t / T), a = start + (target - start) * ease(p), dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
        const peg = Math.floor((a + seg / 2) / seg);
        if (peg !== lastPeg) { WH.flapV -= 420 + 260 * (1 - p); lastPeg = peg; }
        WH.flapV += (-180 * WH.flap - 14 * WH.flapV) * dt; WH.flap = Math.max(-32, Math.min(4, WH.flap + WH.flapV * dt));
        g.style.transform = `rotate(${a}deg)`; flap.style.transform = `rotate(${WH.flap}deg)`;
        if (p >= 1 && Math.abs(WH.flap) < 0.5) { WH.angle = target % 360; g.style.transform = `rotate(${WH.angle}deg)`; WH.flap = 0; WH.flapV = 0; flap.style.transform = 'rotate(0deg)'; wrap.classList.remove('spinning'); done(); return false; }
      });
    }),
  };

  /* ================= NUMBER RUSH – slot cabinet, curved reels, glossy symbols, blur and bounce stops ================= */
  const SLOT_DEFS = `<svg class="gx-defs" width="0" height="0" aria-hidden="true"><defs>
    <linearGradient id="s7f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7d8e"/><stop offset=".45" stop-color="#e5163a"/><stop offset="1" stop-color="#7d0a1c"/></linearGradient>
    <linearGradient id="sGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".45" stop-color="#ffc20e"/><stop offset="1" stop-color="#9a5f00"/></linearGradient>
    <radialGradient id="sCherry" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ff8a99"/><stop offset=".45" stop-color="#e5163a"/><stop offset="1" stop-color="#6e0718"/></radialGradient>
    <radialGradient id="sLemon" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fffbcc"/><stop offset=".45" stop-color="#ffe14d"/><stop offset="1" stop-color="#c79800"/></radialGradient>
    <linearGradient id="sLeaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6fe07a"/><stop offset="1" stop-color="#17682a"/></linearGradient>
    <linearGradient id="sBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a505c"/><stop offset=".5" stop-color="#16181d"/><stop offset="1" stop-color="#050607"/></linearGradient>
    <linearGradient id="sChrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#9aa3b0"/><stop offset=".6" stop-color="#eef1f5"/><stop offset="1" stop-color="#5d6570"/></linearGradient>
  </defs></svg>`;
  const SYM = {
    '7': '<svg viewBox="0 0 80 80"><path d="M15 11h51v12L44 70H25l21-43H15z" fill="url(#s7f)" stroke="url(#sGold)" stroke-width="4.5" stroke-linejoin="round"/><path d="M21 16h38" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/></svg>',
    BAR: '<svg viewBox="0 0 80 80"><rect x="7" y="23" width="66" height="34" rx="8" fill="url(#sBar)" stroke="url(#sChrome)" stroke-width="4.5"/><text x="40" y="47.5" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="900" font-size="20" fill="#fff" letter-spacing="1.5">BAR</text><path d="M14 29h52" stroke="#fff" stroke-opacity=".22" stroke-width="3" stroke-linecap="round"/></svg>',
    BELL: '<svg viewBox="0 0 80 80"><path d="M40 10c3.2 0 5.5 2.3 5.5 5.5v1.7C56 20 61 29.5 61 40v9.5l6 7.5H13l6-7.5V40c0-10.5 5-20 15.5-22.8v-1.7c0-3.2 2.3-5.5 5.5-5.5z" fill="url(#sGold)" stroke="#7a4d00" stroke-width="2"/><rect x="12" y="55" width="56" height="6" rx="3" fill="#a86b00"/><circle cx="40" cy="66" r="6.5" fill="url(#sGold)" stroke="#7a4d00" stroke-width="1.5"/><path d="M27 31c2-6 6-9.5 10.5-10.5" stroke="#fff" stroke-opacity=".75" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>',
    CHERRY: '<svg viewBox="0 0 80 80"><path d="M29 44c4-14 12-24 25-30M48 48c-2-12 0-24 6-34" stroke="#2d6a1f" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M54 14c8-5 16-1.5 19 5-8.5 3.5-16 1-19-5z" fill="url(#sLeaf)"/><circle cx="27" cy="53" r="14.5" fill="url(#sCherry)"/><circle cx="52" cy="57" r="14.5" fill="url(#sCherry)"/><ellipse cx="22" cy="47" rx="4.3" ry="2.6" fill="#fff" fill-opacity=".8" transform="rotate(-32 22 47)"/><ellipse cx="47" cy="51" rx="4.3" ry="2.6" fill="#fff" fill-opacity=".8" transform="rotate(-32 47 51)"/></svg>',
    LEMON: '<svg viewBox="0 0 80 80"><path d="M10 42c0-14 13-25 30-25s30 11 30 25-13 24-30 24S10 56 10 42z" fill="url(#sLemon)" stroke="#a37c00" stroke-width="2"/><path d="M10 42l-5.5-3.2L10 35.5M70 42l5.5-3.2L70 35.5" fill="#ffe14d" stroke="#a37c00" stroke-width="2" stroke-linejoin="round"/><ellipse cx="30" cy="31" rx="9.5" ry="4" fill="#fff" fill-opacity=".62" transform="rotate(-14 30 31)"/><g fill="#c79800" fill-opacity=".45"><circle cx="48" cy="48" r="1.3"/><circle cx="54" cy="42" r="1.1"/><circle cx="42" cy="54" r="1.2"/><circle cx="58" cy="50" r="1"/></g></svg>',
  };
  const SYMS = Object.keys(SYM), anySym = () => SYMS[Math.random() * SYMS.length | 0];
  const RUSH = { cols: null };
  const slCells = list => list.map(s => `<div class="sl-c" data-s="${s}">${SYM[s]}</div>`).join('');
  const rush = {
    html: () => {
      if (!RUSH.cols) RUSH.cols = [['LEMON', '7', 'BELL'], ['CHERRY', '7', 'BAR'], ['BELL', '7', 'LEMON']];
      const P = GL().RUSH_PAY;
      return `${SLOT_DEFS}<div class="sl"><div class="sl-cab">
        <div class="sl-top"><i class="sl-lights"></i><b>NUMBER RUSH</b><i class="sl-lights"></i></div>
        <div class="sl-win"><div class="sl-reels">${[0, 1, 2].map(i => `<div class="sl-reel"><div class="sl-strip" id="slS${i}">${slCells(RUSH.cols[i])}</div></div>`).join('')}</div>
          <i class="sl-line" id="slLine"></i><i class="sl-arr l"></i><i class="sl-arr r"></i><i class="sl-glass"></i></div>
        <div class="sl-pays">${[['7', P['7']], ['BAR', P.BAR], ['BELL', P.BELL], ['CHERRY', P.CHERRY], ['LEMON', P.LEMON]].map(([s, m]) => `<span><i>${SYM[s]}</i>${short(m)}</span>`).join('')}</div>
      </div></div>`;
    },
    play: async (el, r) => {
      const line = el.querySelector('#slLine'); line.classList.remove('win'); el.querySelectorAll('.sl-c.hit').forEach(c => c.classList.remove('hit'));
      const runs = [0, 1, 2].map(async i => {
        const strip = el.querySelector('#slS' + i), h = strip.firstElementChild.offsetHeight, n = 16 + i * 7;
        const fin = [anySym(), r.result.reels[i], anySym()], T = still() ? 20 : 1150 + i * 420;
        strip.innerHTML = slCells([...RUSH.cols[i], ...Array.from({ length: n }, anySym), ...fin]);
        const dist = (n + 3) * h;
        strip.classList.add('blur');
        const a = strip.animate([
          { transform: 'translateY(0)' },
          { transform: `translateY(${-h * 0.6}px)`, offset: 0.08, easing: 'linear' },
          { transform: `translateY(${-dist * 0.93}px)`, offset: 0.8, easing: 'cubic-bezier(.2,.5,.4,1)' },
          { transform: `translateY(${-dist - h * 0.18}px)`, offset: 0.92, easing: 'ease-out' },
          { transform: `translateY(${-dist}px)` }], { duration: T, fill: 'forwards' });
        setTimeout(() => strip.classList.remove('blur'), T * 0.8);
        await a.finished;
        RUSH.cols[i] = fin; strip.innerHTML = slCells(fin); a.cancel(); strip.style.transform = 'translateY(0)';
      });
      await Promise.all(runs);
      if (r.mult > 0) { line.classList.add('win'); el.querySelectorAll('.sl-strip').forEach(s => s.children[1].classList.add('hit')); }
      await wait(350);
    },
  };

  /* ================= KENO – glass draw machine with bouncing balls, draw tray, 40-number board ================= */
  const KCOL = n => ['#e5163a', '#1f6fd1', '#0d9737', '#f08a00'][Math.floor((n - 1) / 10)];
  const kBall = n => `<b class="kb" style="--c:${KCOL(n)}"><span>${n}</span></b>`;
  const KN = { balls: null, loop: 0, take: null };
  const keno = {
    html: ctx => {
      const picks = new Set(ctx.S.choice.keno), r = ctx.S.res.keno, drawn = new Set(r ? r.drawn : []);
      return `<div class="kn">
        <div class="kn-machine"><canvas id="knGlobe" aria-hidden="true"></canvas>
          <div class="kn-tray" id="knTray" aria-label="Drawn numbers">${Array.from({ length: 10 }, (_, i) => `<i class="kn-slot">${r && r.drawn[i] ? kBall(r.drawn[i]) : ''}</i>`).join('')}</div></div>
        <div class="kn-board" role="group" aria-label="Pick up to 5 numbers">${Array.from({ length: 40 }, (_, i) => { const n = i + 1, p = picks.has(n), d = drawn.has(n);
          return `<button class="kn-n ${p ? 'pk' : ''} ${d ? 'dr' : ''} ${p && d ? 'hit' : ''}" data-gx="kn" data-v="${n}" aria-pressed="${p}">${n}</button>`; }).join('')}</div>
        <div class="kn-tools"><span id="knCount">${picks.size} of 5 picked</span><button data-gx="knquick">Quick pick</button><button data-gx="knclear">Clear</button></div></div>`;
    },
    mount: el => {
      const cv = el.querySelector('#knGlobe'); if (!cv) return;
      const S = 150, g = fitCanvas(cv, S, S), R = 62, cx = S / 2, cy = 66;   // drawn at 150 logical px, shown at 108 css px
      if (!KN.balls) KN.balls = Array.from({ length: 22 }, (_, i) => ({ x: cx + rnd(-30, 30), y: cy + rnd(0, 40), vx: rnd(-60, 60), vy: rnd(-60, 60), n: 1 + (i * 7) % 40 }));
      cancelAnimationFrame(KN.loop);
      let last = performance.now();
      const step = now => {
        if (!cv.isConnected) return;
        const dt = Math.min(0.033, (now - last) / 1000); last = now;
        const B = KN.balls, r = 8.5;
        for (const b of B) {
          b.vy += 520 * dt;
          if (b.y > cy + R * 0.35 && Math.random() < 0.09) { b.vy -= rnd(260, 420); b.vx += rnd(-120, 120); }       // the blower
          b.x += b.vx * dt; b.y += b.vy * dt;
          const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
          if (d > R - r) { const nx = dx / d, ny = dy / d, dot = b.vx * nx + b.vy * ny; if (dot > 0) { b.vx -= 1.85 * dot * nx; b.vy -= 1.85 * dot * ny; } b.x = cx + nx * (R - r); b.y = cy + ny * (R - r); }
        }
        for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
          const a = B[i], b = B[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < 2 * r) { const nx = dx / d, ny = dy / d, o = (2 * r - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
            const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; if (p > 0) { a.vx -= p * nx; a.vy -= p * ny; b.vx += p * nx; b.vy += p * ny; } }
        }
        g.clearRect(0, 0, S, S);
        // stand + outlet tube
        g.fillStyle = '#2a2f39'; g.beginPath(); g.moveTo(cx - 34, S - 8); g.lineTo(cx + 34, S - 8); g.lineTo(cx + 22, cy + R - 4); g.lineTo(cx - 22, cy + R - 4); g.fill();
        g.fillStyle = '#ffc20e'; g.fillRect(cx - 38, S - 10, 76, 5);
        // glass
        const gl = g.createRadialGradient(cx - 20, cy - 24, 4, cx, cy, R); gl.addColorStop(0, 'rgba(255,255,255,.18)'); gl.addColorStop(1, 'rgba(160,190,220,.06)');
        g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
        for (const b of B) {
          const bg = g.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, r); bg.addColorStop(0, '#fff'); bg.addColorStop(0.35, KCOL(b.n)); bg.addColorStop(1, '#111');
          g.fillStyle = bg; g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.fill();
        }
        g.strokeStyle = 'rgba(220,235,255,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R - 7, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
        if (KN.take) { const t = KN.take; t.p = Math.min(1, t.p + dt * 3.2); const y = cy + R - 6 + t.p * 30; g.fillStyle = KCOL(t.n); g.beginPath(); g.arc(cx, y, r, 0, 7); g.fill(); if (t.p >= 1) KN.take = null; }
        KN.loop = requestAnimationFrame(step);
      };
      KN.loop = requestAnimationFrame(step);
    },
    play: async (el, r) => {
      const tray = el.querySelectorAll('.kn-slot'), picks = new Set(r.result.picks);
      tray.forEach(s => { s.innerHTML = ''; }); el.querySelectorAll('.kn-n').forEach(b => b.classList.remove('dr', 'hit', 'pop'));
      for (const [i, n] of r.result.drawn.entries()) {
        KN.take = { n, p: 0 };
        await wait(still() ? 10 : 330);
        tray[i].innerHTML = kBall(n); tray[i].firstElementChild.classList.add('in');
        const b = el.querySelector(`.kn-n[data-v="${n}"]`); if (b) { b.classList.add('dr', 'pop'); if (picks.has(n)) b.classList.add('hit'); }
        await wait(still() ? 10 : 120);
      }
      await wait(250);
    },
  };

  /* ================= SCRATCH CARDS – printed ticket with finger-scratch silver foil ================= */
  const prizeCls = m => (m >= 50 ? 'p4' : m >= 10 ? 'p3' : m >= 5 ? 'p2' : m >= 2 ? 'p1' : 'p0');
  function foil(cv, w, h) {
    const g = fitCanvas(cv, w, h);
    const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, '#b9bec7'); lg.addColorStop(0.35, '#eef0f3'); lg.addColorStop(0.55, '#c3c8cf'); lg.addColorStop(0.8, '#f4f5f7'); lg.addColorStop(1, '#a9aeb7');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 9; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4); }
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.35); g.font = 'italic 800 15px Kanit,Arial,sans-serif'; g.fillStyle = 'rgba(70,76,88,.16)'; g.textAlign = 'center';
    for (let y = -h; y < h; y += 26) for (let x = -w; x < w; x += 96) g.fillText('LETBET', x + (y / 26 % 2) * 48, y);
    g.restore();
    return g;
  }
  const scratch = {
    html: ctx => {
      const c = ctx.S.scr, cells = c ? c.cells : Array(9).fill(0);
      return `<div class="sx"><div class="sx-card">
        <div class="sx-head"><b>LetBet<span>Scratch</span></b><small>MATCH 3 PRIZES TO WIN</small><em>${c ? 'No. ' + c.ref : 'No. ––––––'}</em></div>
        <div class="sx-area" id="sxArea"><div class="sx-grid">${cells.map(v => `<div class="sx-c">${v ? `<span class="sx-p ${prizeCls(v)}">${GL().SCRATCH_SYM[v]}</span>` : '<span class="sx-p p0">–</span>'}</div>`).join('')}</div>
          ${c && c.done ? '' : '<canvas class="sx-foil" id="sxFoil"></canvas>'}${c ? '' : '<div class="sx-buy">Buy a card, then scratch it with your finger</div>'}</div>
        <div class="sx-legend">${[500, 50, 10, 5, 2, 1].map(m => `<span class="${prizeCls(m)}">${m}x</span>`).join('')}</div>
      </div>${c && !c.done ? '<button class="sx-all" data-gx="scall">Reveal all</button>' : ''}</div>`;
    },
    mount: (el, ctx) => {
      const cv = el.querySelector('#sxFoil'), area = el.querySelector('#sxArea'); if (!cv) return;
      const w = area.clientWidth, h = area.clientHeight, g = foil(cv, w, h), c = ctx.S.scr;
      if (!c || c.done) { cv.classList.add('locked'); return; }
      let down = false, lx = 0, ly = 0, checkAt = 0;
      const brush = (x, y) => { g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + rnd(-4, 4), y + rnd(-4, 4), rnd(11, 16), 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; };
      const line = (x0, y0, x1, y1) => { const n = Math.max(1, Math.hypot(x1 - x0, y1 - y0) / 6); for (let i = 0; i <= n; i++) brush(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); };
      const pos = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * w / b.width, (e.clientY - b.top) * h / b.height]; };
      const check = () => {
        const d = g.getImageData(0, 0, cv.width, cv.height).data; let clear = 0, tot = 0;
        for (let i = 3; i < d.length; i += 4 * 37) { tot++; if (d[i] < 40) clear++; }
        if (clear / tot > 0.55) scratch.finish(el, ctx);
      };
      cv.addEventListener('pointerdown', e => { down = true; [lx, ly] = pos(e); brush(lx, ly); cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (!down) return; const [x, y] = pos(e); line(lx, ly, x, y); lx = x; ly = y; if (performance.now() > checkAt) { checkAt = performance.now() + 250; check(); } });
      cv.addEventListener('pointerup', () => { down = false; check(); });
      c.auto = () => { const pts = []; for (let k = 0; k < 7; k++) pts.push([k % 2 ? w - 10 : 10, 10 + k * (h - 20) / 6]); let i = 0; const go = () => { if (i >= pts.length - 1) return scratch.finish(el, ctx); line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); i++; setTimeout(go, 70); }; go(); };
    },
    finish: (el, ctx) => {
      const c = ctx.S.scr; if (!c || c.done) return;
      c.done = true; const cv = el.querySelector('#sxFoil'); if (cv) { cv.classList.add('gone'); setTimeout(() => cv.remove(), 450); }
      el.querySelector('.sx-all')?.remove();
      if (c.mult) el.querySelectorAll('.sx-c').forEach((x, i) => { if (c.cells[i] === c.mult) x.classList.add('win'); });
      setTimeout(() => c.resolve && c.resolve(), 500);
    },
    play: (el, r, ctx) => new Promise(resolve => {
      ctx.S.scr = { cells: r.result.cells, mult: r.mult, ref: String(r.id).slice(-8), done: false, resolve };
      ctx.rerender();
    }),
  };

  /* ================= HI-LO – real playing cards dealt from a shoe and flipped ================= */
  const SUITP = ['M50 18c9 12 25 19 25 31a12.5 12.5 0 0 1-21.5 8.6L56 70H44l2.5-12.4A12.5 12.5 0 0 1 25 49c0-12 16-19 25-31z', 'M50 72C32 58 24 48 24 38a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 10-8 20-26 34z', 'M50 16l22 29-22 29-22-29z', 'M50 20a12 12 0 0 1 10.3 18.2A12 12 0 1 1 54 58.6L56.5 70h-13L46 58.6a12 12 0 1 1-6.3-20.4A12 12 0 0 1 50 20z'];
  const PIPXY = { 2: [[50, 26], [50, 114]], 3: [[50, 26], [50, 70], [50, 114]], 4: [[33, 26], [67, 26], [33, 114], [67, 114]], 5: [[33, 26], [67, 26], [50, 70], [33, 114], [67, 114]],
    6: [[33, 26], [67, 26], [33, 70], [67, 70], [33, 114], [67, 114]], 7: [[33, 26], [67, 26], [50, 48], [33, 70], [67, 70], [33, 114], [67, 114]],
    8: [[33, 26], [67, 26], [50, 48], [33, 70], [67, 70], [50, 92], [33, 114], [67, 114]], 9: [[33, 26], [67, 26], [33, 55], [67, 55], [50, 70], [33, 85], [67, 85], [33, 114], [67, 114]],
    10: [[33, 26], [67, 26], [50, 41], [33, 55], [67, 55], [33, 85], [67, 85], [50, 99], [33, 114], [67, 114]] };
  const pip = (s, x, y, k, flip) => `<path d="${SUITP[s]}" transform="translate(${x} ${y}) ${flip ? 'rotate(180)' : ''} scale(${k}) translate(-50 -45)"/>`;
  const COURT = { J: 'M38 66h24l-3-14 6-10-8 3-7-9-7 9-8-3 6 10z', Q: 'M34 64h32l3-20-9 8-10-14-10 14-9-8z', K: 'M32 64h36l3-24-10 9-11-15-11 15-10-9z' };
  function cardSVG(c) {
    const r = GL().RANKS[c.rank], red = c.suit === 1 || c.suit === 2, col = red ? '#c8102e' : '#16181d', n = c.rank + 2;
    let mid;
    if (r === 'A') mid = pip(c.suit, 50, 70, 0.62);
    else if (n <= 10) mid = PIPXY[n].map(([x, y]) => pip(c.suit, x, y, 0.27, y > 70)).join('');
    else mid = `<rect x="22" y="26" width="56" height="88" rx="5" fill="${red ? '#fdecee' : '#eef2fb'}" stroke="${col}" stroke-width="1.4"/>
      <path d="${COURT[r]}" fill="#ffc20e" stroke="#8a5a00" stroke-width="1.2" stroke-linejoin="round"/>
      <text x="50" y="98" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="30" fill="${col}">${r}</text>${pip(c.suit, 50, 108, 0.12)}`;
    return `<svg viewBox="0 0 100 140" class="cd-svg"><rect x="1" y="1" width="98" height="138" rx="8" fill="#fff" stroke="#d6d8dd"/>
      <g fill="${col}"><text x="9" y="22" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${r === '10' ? 15 : 18}">${r}</text>${pip(c.suit, 15.5, 33, 0.13)}
      <g transform="rotate(180 50 70)"><text x="9" y="22" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${r === '10' ? 15 : 18}">${r}</text>${pip(c.suit, 15.5, 33, 0.13)}</g>${mid}</g></svg>`;
  }
  const BACKSVG = `<svg viewBox="0 0 100 140" class="cd-svg"><defs><pattern id="cdPat" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#0a7d3e"/><rect width="5" height="10" fill="#0d9737"/></pattern></defs>
    <rect x="1" y="1" width="98" height="138" rx="8" fill="#fff"/><rect x="6" y="6" width="88" height="128" rx="5" fill="url(#cdPat)" stroke="#ffc20e" stroke-width="2"/>
    <circle cx="50" cy="70" r="20" fill="#0b4a26" stroke="#ffc20e" stroke-width="2"/><text x="50" y="78" text-anchor="middle" font-family="Kanit,sans-serif" font-style="italic" font-weight="800" font-size="20" fill="#ffc20e">LB</text></svg>`;
  const hilo = {
    html: ctx => {
      const d = ctx.S.deal, r = ctx.S.res.hilo, cur = r ? r.first : d && d.card, hist = ctx.S.hiloHist || [];
      return `<div class="hl"><div class="hl-hist" aria-label="Previous cards">${hist.slice(-9).map(c => `<i class="hl-mini ${c.suit === 1 || c.suit === 2 ? 'red' : ''}">${GL().RANKS[c.rank]}<svg viewBox="0 0 100 100"><path d="${SUITP[c.suit]}" transform="translate(0 5)"/></svg></i>`).join('') || '<span>Card history</span>'}</div>
        <div class="hl-table">
          <div class="hl-slot"><div class="hl-card ${ctx.S.dealt ? 'deal' : ''}" id="hlCur">${cur ? cardSVG(cur) : BACKSVG}</div><small>YOUR CARD</small></div>
          <div class="hl-vs"><b>HIGHER</b><i>or</i><b>LOWER</b></div>
          <div class="hl-slot"><div class="hl-flip ${r ? 'show' : ''}" id="hlFlip"><div class="hl-face back">${BACKSVG}</div><div class="hl-face front">${r ? cardSVG(r.next) : ''}</div></div><small>NEXT CARD</small></div>
          <div class="hl-shoe" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
        </div></div>`;
    },
    mount: (el, ctx) => { ctx.S.dealt = false; },
    play: async (el, r) => {
      const f = el.querySelector('#hlFlip');
      f.querySelector('.front').innerHTML = cardSVG(r.result.next);
      f.classList.remove('show'); void f.offsetWidth; f.classList.add('dealin');
      await wait(still() ? 10 : 380);
      f.classList.add('show');
      await wait(still() ? 10 : 650);
    },
  };

  /* ================= PENALTY KICK – night stadium, perspective goal, keeper dive, net bulge ================= */
  const PW = 360, PH = 240, GOAL = { l: 96, r: 264, top: 84, line: 150 }, SPOT = { x: 180, y: 214 };
  const AIM = { left: { x: 124, y: 108 }, centre: { x: 180, y: 102 }, right: { x: 236, y: 108 } };
  const PEN = { bg: null, t: 0, loop: 0, state: null };
  function penaltyBackground() {
    const cv = document.createElement('canvas'), k = dpr(); cv.width = PW * k; cv.height = PH * k;
    const g = cv.getContext('2d'); g.scale(k, k);
    let gr = g.createLinearGradient(0, 0, 0, 100); gr.addColorStop(0, '#040b18'); gr.addColorStop(1, '#0d2442'); g.fillStyle = gr; g.fillRect(0, 0, PW, 110);
    for (const lx of [26, 334]) {                                   // floodlights
      const glow = g.createRadialGradient(lx, 10, 2, lx, 10, 90); glow.addColorStop(0, 'rgba(255,255,240,.9)'); glow.addColorStop(0.12, 'rgba(255,250,220,.35)'); glow.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = glow; g.fillRect(lx - 90, 0, 180, 110);
      g.fillStyle = '#f4f2e6'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(lx - 9 + i * 5, 5 + j * 5, 3.4, 3.4);
    }
    gr = g.createLinearGradient(0, 24, 0, 98); gr.addColorStop(0, '#11151c'); gr.addColorStop(1, '#232a35'); g.fillStyle = gr; g.fillRect(0, 26, PW, 72);   // stands
    const crowd = ['#0a7d3e', '#0a7d3e', '#ffc20e', '#ffc20e', '#f2f2f2', '#2a2f39', '#c8102e', '#1f6fd1', '#6b4428'];
    for (let y = 30; y < 94; y += 3.6) for (let x = 2; x < PW; x += 3.4) { g.globalAlpha = 0.35 + (y - 30) / 64 * 0.5; g.fillStyle = crowd[(Math.random() * crowd.length) | 0]; g.fillRect(x + rnd(-0.8, 0.8), y + rnd(-0.6, 0.6), 2.4, 2.6); }
    g.globalAlpha = 1;
    gr = g.createLinearGradient(0, 97, 0, 109); gr.addColorStop(0, '#0b4a26'); gr.addColorStop(1, '#063018'); g.fillStyle = gr; g.fillRect(0, 97, PW, 12);   // LED boards
    g.font = "italic 800 8.5px Kanit, Arial, sans-serif"; g.textBaseline = 'middle';
    for (let x = 4; x < PW; x += 92) { g.fillStyle = '#fff'; g.fillText('LetBet', x, 103.5); g.fillStyle = '#ffc20e'; g.fillText('Afrika', x + 28, 103.5); }
    gr = g.createLinearGradient(0, 108, 0, PH); gr.addColorStop(0, '#0a5229'); gr.addColorStop(1, '#16893f'); g.fillStyle = gr; g.fillRect(0, 108, PW, PH - 108);   // pitch
    const bands = [108, 113, 119, 127, 137, 150, 166, 186, 210, 240];
    for (let i = 0; i < bands.length - 1; i++) if (i % 2) { g.fillStyle = 'rgba(255,255,255,.045)'; g.fillRect(0, bands[i], PW, bands[i + 1] - bands[i]); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(20, GOAL.line); g.lineTo(340, GOAL.line); g.stroke();
    g.beginPath(); g.moveTo(70, GOAL.line); g.lineTo(60, 170); g.lineTo(300, 170); g.lineTo(290, GOAL.line); g.stroke();
    g.beginPath(); g.moveTo(28, GOAL.line); g.lineTo(6, 204); g.lineTo(354, 204); g.lineTo(332, GOAL.line); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(SPOT.x, SPOT.y + 3, 3, 1.4, 0, 0, 7); g.fill();
    const sh = g.createRadialGradient(180, GOAL.line + 2, 10, 180, GOAL.line + 2, 110); sh.addColorStop(0, 'rgba(0,0,0,.22)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(60, GOAL.line - 4, 240, 14);
    return cv;
  }
  function drawNet(g, bulge) {
    const bL = 110, bR = 250, bT = 95, bB = 140;                    // back of the net
    const push = (x, y) => { if (!bulge) return [x, y]; const d = Math.hypot(x - bulge.x, y - bulge.y), f = Math.max(0, 1 - d / 46) * bulge.a; return [x + (x - bulge.x) * 0.06 * f, y - 7 * f]; };
    g.strokeStyle = 'rgba(255,255,255,.34)'; g.lineWidth = 0.7;
    for (let x = bL; x <= bR; x += 7) { g.beginPath(); for (let y = bT; y <= bB; y += 3) { const [px, py] = push(x, y); y === bT ? g.moveTo(px, py) : g.lineTo(px, py); } g.stroke(); }
    for (let y = bT; y <= bB; y += 5.5) { g.beginPath(); for (let x = bL; x <= bR; x += 3) { const [px, py] = push(x, y); x === bL ? g.moveTo(px, py) : g.lineTo(px, py); } g.stroke(); }
    for (let i = 0; i <= 6; i++) { const t = i / 6;                  // side and roof netting
      g.beginPath(); g.moveTo(GOAL.l, GOAL.top + (GOAL.line - GOAL.top) * t); g.lineTo(bL, bT + (bB - bT) * t); g.stroke();
      g.beginPath(); g.moveTo(GOAL.r, GOAL.top + (GOAL.line - GOAL.top) * t); g.lineTo(bR, bT + (bB - bT) * t); g.stroke(); }
    for (let i = 0; i <= 10; i++) { const x0 = GOAL.l + (GOAL.r - GOAL.l) * i / 10, x1 = bL + (bR - bL) * i / 10; g.beginPath(); g.moveTo(x0, GOAL.top); g.lineTo(x1, bT); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(GOAL.l, GOAL.line); g.lineTo(bL, bB); g.lineTo(bR, bB); g.lineTo(GOAL.r, GOAL.line); g.stroke();
    g.beginPath(); g.moveTo(GOAL.l, GOAL.top); g.lineTo(bL, bT); g.lineTo(bR, bT); g.lineTo(GOAL.r, GOAL.top); g.stroke();
  }
  function drawPosts(g) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 5; g.beginPath(); g.moveTo(GOAL.l + 2, GOAL.line + 1); g.lineTo(GOAL.l + 9, GOAL.line + 4); g.moveTo(GOAL.r + 2, GOAL.line + 1); g.lineTo(GOAL.r + 9, GOAL.line + 4); g.stroke();
    const post = (x0, y0, x1, y1) => { g.strokeStyle = '#c9ccd2'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x0 - 0.8, y0); g.lineTo(x1 - 0.8, y1); g.stroke(); };
    post(GOAL.l, GOAL.line, GOAL.l, GOAL.top); post(GOAL.r, GOAL.line, GOAL.r, GOAL.top); post(GOAL.l, GOAL.top, GOAL.r, GOAL.top);
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
  function drawKeeper(g, x, y, rot, reach, sway) {
    g.save(); g.translate(x, y); g.rotate(rot);
    const ja = g.createLinearGradient(-12, -52, 12, -22); ja.addColorStop(0, '#ffe27a'); ja.addColorStop(0.6, '#ffc20e'); ja.addColorStop(1, '#c98f00');
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 1.5, 13, 2.6, 0, 0, 7); g.fill();
    g.fillStyle = '#0d0f12'; rr(g, -10, -25, 9, 13, 3); rr(g, 1, -25, 9, 13, 3);                 // shorts
    g.fillStyle = '#0a7d3e'; rr(g, -8.5, -13, 6, 11, 2); rr(g, 2.5, -13, 6, 11, 2);              // socks
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(-6, -1.5, 4.6, 2.4, 0, 0, 7); g.ellipse(6, -1.5, 4.6, 2.4, 0, 0, 7); g.fill();
    const sh = -46, hx = 22 + 4 * reach, hy = -34 - 30 * reach + sway;                            // arms + gloves
    g.strokeStyle = '#f2b400'; g.lineWidth = 6.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-10, sh); g.quadraticCurveTo(-18 - 4 * reach, sh + 4 - 16 * reach, -hx, hy); g.moveTo(10, sh); g.quadraticCurveTo(18 + 4 * reach, sh + 4 - 16 * reach, hx, hy); g.stroke();
    g.fillStyle = ja; rr(g, -12.5, -52, 25, 29, 7);                                                // jersey
    g.fillStyle = '#0a7d3e'; rr(g, -5, -52, 10, 4, 2); g.fillRect(-12.5, -30, 25, 2.4);
    g.fillStyle = '#0a7d3e'; g.font = '800 10px Roboto, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('1', 0, -33);
    for (const sx of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(sx * hx, hy, 5.2, 0, 7); g.fill(); g.strokeStyle = '#0a7d3e'; g.lineWidth = 1.6; g.stroke(); }
    g.fillStyle = '#6b4428'; g.beginPath(); g.arc(0, -60, 7.6, 0, 7); g.fill();                    // head
    g.fillStyle = '#1b1209'; g.beginPath(); g.arc(0, -61.5, 7.8, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.restore();
  }
  function drawBall(g, x, y, s, spin) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 2 * s, SPOT.y + 4 + (y - SPOT.y) * 0.08, 8 * s, 2.4 * s, 0, 0, 7); g.fill();
    const b = SPR.ball, r = 8 * s;
    if (b.complete && b.naturalWidth) { g.save(); g.translate(x, y); g.rotate(spin); g.drawImage(b, -r, -r, 2 * r, 2 * r); g.restore(); }
    else { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  }
  function drawAim(g, a, t) {
    g.save(); g.strokeStyle = 'rgba(255,194,14,.95)'; g.lineWidth = 1.6; const r = 9 + Math.sin(t / 260) * 1.2;
    g.beginPath(); g.arc(a.x, a.y, r, 0, 7); g.stroke(); g.beginPath(); g.moveTo(a.x - r - 4, a.y); g.lineTo(a.x - r + 3, a.y); g.moveTo(a.x + r - 3, a.y); g.lineTo(a.x + r + 4, a.y); g.moveTo(a.x, a.y - r - 4); g.lineTo(a.x, a.y - r + 3); g.moveTo(a.x, a.y + r - 3); g.lineTo(a.x, a.y + r + 4); g.stroke(); g.restore();
  }
  function penaltyFrame(g, st, t) {
    g.clearRect(0, 0, PW, PH);
    if (!PEN.bg) PEN.bg = penaltyBackground();
    g.drawImage(PEN.bg, 0, 0, PW, PH);
    if (st.flash) for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.9})`; g.fillRect(rnd(0, PW), rnd(30, 92), 1.6, 1.6); }
    drawNet(g, st.bulge);
    const k = st.keeper;
    if (st.ballBehind) drawBall(g, st.ball.x, st.ball.y, st.ball.s, st.ball.spin);
    drawKeeper(g, 180 + k.dx, GOAL.line + k.dy, k.rot, k.reach, Math.sin(t / 380) * 1.5);
    drawPosts(g);
    if (!st.ballBehind) drawBall(g, st.ball.x, st.ball.y, st.ball.s, st.ball.spin);
    if (st.aim) drawAim(g, st.aim, t);
    if (st.text) { g.save(); g.globalAlpha = Math.min(1, st.text.a); g.translate(180, 60); g.scale(st.text.s, st.text.s); g.font = "italic 900 34px Kanit, Arial Black, sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = st.text.goal ? '#5a3a00' : '#7d0a1c'; g.strokeText(st.text.v, 0, 0); g.fillStyle = st.text.goal ? '#ffc20e' : '#fff'; g.fillText(st.text.v, 0, 0); g.restore(); }
  }
  const penIdle = ctx => ({ keeper: { dx: 0, dy: 0, rot: 0, reach: 0 }, ball: { x: SPOT.x, y: SPOT.y, s: 1, spin: 0 }, aim: AIM[ctx.choice()] || AIM.left });
  const penalty = {
    html: () => `<div class="pk"><canvas id="pkCv" aria-label="Penalty: tap the left, centre or right of the goal to aim"></canvas></div>`,
    mount: (el, ctx) => {
      const cv = el.querySelector('#pkCv'), g = fitCanvas(cv, PW, PH);
      PEN.state = penIdle(ctx); cancelAnimationFrame(PEN.loop);
      const idle = t => { if (!cv.isConnected) return; if (!PEN.playing) penaltyFrame(g, PEN.state, t); PEN.loop = requestAnimationFrame(idle); };
      PEN.loop = requestAnimationFrame(idle); PEN.g = g;
      cv.addEventListener('click', e => {
        if (ctx.busy()) return;
        const b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * PW / b.width, y = (e.clientY - b.top) * PH / b.height;
        if (y > GOAL.line + 26 || y < GOAL.top - 24) return;
        const v = x < 152 ? 'left' : x > 208 ? 'right' : 'centre'; ctx.setChoice(v); PEN.state.aim = AIM[v];
      });
    },
    sync: ctx => { if (PEN.state) PEN.state.aim = AIM[ctx.choice()] || AIM.left; },
    play: async (el, r) => {
      const g = PEN.g, shot = AIM[r.result.shot], dir = { left: -1, centre: 0, right: 1 }[r.result.keeper], saved = !r.result.goal;
      const st = { keeper: { dx: 0, dy: 0, rot: 0, reach: 0 }, ball: { x: SPOT.x, y: SPOT.y, s: 1, spin: 0 }, aim: null, flash: false };
      PEN.playing = true; const T = still() ? 30 : 1900;
      await raf(t => {
        const p = Math.min(1, t / T);
        const fl = Math.min(1, Math.max(0, (t - 120) / 640)), e = 1 - Math.pow(1 - fl, 2.2);          // ball flight
        const kp = Math.min(1, Math.max(0, (t - 170) / 520)), ke = 1 - Math.pow(1 - kp, 2);           // keeper dive
        st.keeper = dir ? { dx: dir * 50 * ke, dy: -15 * Math.sin(ke * Math.PI * 0.85), rot: dir * 1.22 * ke, reach: ke } : { dx: 0, dy: -17 * Math.sin(ke * Math.PI), rot: 0, reach: ke };
        if (fl < 1) { const cx = (SPOT.x + shot.x) / 2, cy = Math.min(SPOT.y, shot.y) - 52; const u = e;
          st.ball = { x: (1 - u) * (1 - u) * SPOT.x + 2 * (1 - u) * u * cx + u * u * shot.x, y: (1 - u) * (1 - u) * SPOT.y + 2 * (1 - u) * u * cy + u * u * shot.y, s: 1 - 0.42 * u, spin: u * 9 }; }
        else if (saved) { const q = Math.min(1, (t - 760) / 520); st.ball = { x: shot.x + (dir || (Math.random() < 0.5 ? -1 : 1)) * 18 * q * (dir ? 1 : 0), y: shot.y + 46 * q * q - 10 * q, s: 0.58, spin: 9 + q * 3 };
          st.text = { v: 'SAVED!', a: q * 2, s: 0.8 + 0.2 * Math.min(1, q * 2), goal: false }; }
        else { const q = Math.min(1, (t - 760) / 460); st.ballBehind = true; st.bulge = { x: shot.x, y: shot.y, a: Math.sin(Math.min(1, q * 1.4) * Math.PI) }; st.ball = { x: shot.x, y: shot.y - 5 * q + 26 * q * q, s: 0.56, spin: 9 };
          st.flash = true; st.text = { v: 'GOAL!', a: q * 2, s: 0.7 + 0.3 * Math.min(1, q * 1.6), goal: true }; }
        penaltyFrame(g, st, t);
        return p < 1;
      });
      await wait(400);
      PEN.playing = false; PEN.state.aim = AIM[r.result.shot];
    },
  };

  window.Scenes = { dice, spin, rush, keno, scratch, hilo, penalty, cardSVG, BACKSVG };
  window.SceneKit = { wait, rnd, still, short, raf, fitCanvas, SPR, chip };
})();
