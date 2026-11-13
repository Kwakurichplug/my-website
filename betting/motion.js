/* =========================================================
   LetBetAfrika – motion library
   Splash, page transitions, skeletons, ripple, fly-to-slip,
   count-up, confetti, goal ticker, pull-to-refresh.
   Everything degrades to no-motion under prefers-reduced-motion.
   ========================================================= */
(() => {
  'use strict';
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const M = { reduced: RM };
  const raf = f => requestAnimationFrame(f);
  const ease = t => 1 - Math.pow(1 - t, 3);

  /* ---------- Splash ---------- */
  M.splash = (done) => {
    const sp = $('#splash');
    if (!sp) return done && done();
    let force = /[?&#]splash=1/.test(location.href), seen = false;
    try { seen = sessionStorage.getItem('lba_splash') === '1'; } catch {}
    if (RM || (seen && !force)) { sp.remove(); document.documentElement.classList.remove('splashing'); return done && done(); }
    try { sessionStorage.setItem('lba_splash', '1'); } catch {}
    // split wordmark into letters for the stagger
    sp.querySelectorAll('.sp-word span').forEach((w, wi) => {
      w.innerHTML = [...w.textContent].map((ch, i) => `<em style="--i:${i + wi * 6}">${ch}</em>`).join('');
    });
    sp.classList.add('run');
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      const mark = $('.sp-mark', sp), logo = $('.topbar .logo');
      // FLIP the splash wordmark into the header logo
      if (mark && logo) {
        const a = mark.getBoundingClientRect(), b = logo.getBoundingClientRect();
        const s = b.height / a.height;
        mark.style.transition = 'transform .62s cubic-bezier(.7,0,.2,1)';
        mark.style.transformOrigin = '0 0';
        mark.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${s})`;
      }
      sp.classList.add('out');
      document.documentElement.classList.add('app-in');
      setTimeout(() => {
        document.documentElement.classList.remove('splashing');
        sp.remove();
        setTimeout(() => document.documentElement.classList.remove('app-in'), 900);
        done && done();
      }, 640);
    };
    sp.addEventListener('click', finish);
    setTimeout(finish, 2650);
  };

  /* ---------- Ripple on press ---------- */
  document.addEventListener('pointerdown', e => {
    if (RM) return;
    const t = e.target.closest('.odd:not(.locked):not(.void), .btn, .tile, .cat, .lpill, .icon-row a, .bottom-nav a, .mkt-tabs button, .game');
    if (!t) return;
    const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
    t.appendChild(s);
    setTimeout(() => s.remove(), 600);
  }, { passive: true });

  /* ---------- Fly selection to betslip ---------- */
  M.fly = (rect, label) => {
    if (RM || !rect) return;
    const pill = $('#slipPill'), desk = window.innerWidth >= 1024;
    const target = desk ? $('#bsCount') : pill;
    if (!target) return;
    const tr = target.getBoundingClientRect();
    if (!tr.width) return;
    const el = document.createElement('div');
    el.className = 'fly-chip'; el.textContent = label;
    document.body.appendChild(el);
    const x0 = rect.left + rect.width / 2, y0 = rect.top + rect.height / 2;
    const x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
    const cx = (x0 + x1) / 2 + (x1 > x0 ? -40 : 40), cy = Math.min(y0, y1) - 120;
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      pts.push({ transform: `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${1 - t * 0.55})`, opacity: t > 0.9 ? 0.2 : 1 });
    }
    el.animate(pts, { duration: 620, easing: 'cubic-bezier(.45,0,.2,1)' }).onfinish = () => { el.remove(); M.bump(target); };
    if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
  };

  M.bump = el => { if (RM || !el || !el.animate) return; el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' }); };

  /* ---------- Count-up numbers ---------- */
  M.countUp = (el, from, to, fmt, dur = 650) => {
    if (!el) return;
    if (RM || from === to || from == null) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(from + (to - from) * ease(k));
      if (k < 1) raf(step);
    };
    raf(step);
    el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth;
    el.classList.add(to > from ? 'tick-up' : 'tick-down');
  };

  /* ---------- Skeleton overlays ---------- */
  const bar = (w, h = 12) => `<i class="sk" style="width:${w};height:${h}px"></i>`;
  const SK = {
    list: () => Array.from({ length: 6 }, () => `<div class="sk-row"><div class="sk-l">${bar('48%', 10)}${bar('62%', 14)}${bar('54%', 14)}</div><div class="sk-r">${bar('100%', 38)}${bar('100%', 38)}${bar('100%', 38)}</div></div>`).join(''),
    match: () => `<div class="sk-hero"><i class="sk sk-c"></i><div>${bar('70px', 26)}${bar('50px', 10)}</div><i class="sk sk-c"></i></div>` + Array.from({ length: 4 }, () => `<div class="sk-card">${bar('35%', 14)}<div class="sk-r3">${bar('100%', 38)}${bar('100%', 38)}${bar('100%', 38)}</div></div>`).join(''),
    cards: () => Array.from({ length: 5 }, () => `<div class="sk-card">${bar('40%', 14)}${bar('80%', 10)}</div>`).join(''),
  };
  M.skeleton = (page, kind, ms = 360) => {
    if (RM || !page) return;
    page.querySelectorAll('.skel-ov').forEach(x => x.remove());
    const ov = document.createElement('div');
    ov.className = 'skel-ov'; ov.innerHTML = (SK[kind] || SK.list)();
    page.appendChild(ov);
    setTimeout(() => { ov.classList.add('gone'); setTimeout(() => ov.remove(), 220); }, ms);
  };

  /* ---------- Goal ticker ---------- */
  M.goal = (html) => {
    let el = $('#goalTicker');
    if (!el) { el = document.createElement('div'); el.id = 'goalTicker'; document.body.appendChild(el); }
    el.innerHTML = `<span class="gt-ball"></span><span class="gt-txt">${html}</span>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 4200);
    if (navigator.vibrate) try { navigator.vibrate([20, 40, 20]); } catch {}
  };

  /* ---------- Confetti ---------- */
  M.confetti = () => {
    if (RM) return;
    const c = document.createElement('canvas');
    c.className = 'confetti'; document.body.appendChild(c);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cols = ['#0a7d3e', '#ffc20e', '#ffffff', '#16e08a', '#e5163a'];
    const P = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - .5) * 80, y: H * .45, vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 3, a: Math.random() * 6.28, va: (Math.random() - .5) * .4, c: cols[Math.random() * cols.length | 0] }));
    const t0 = performance.now();
    const loop = now => {
      const t = now - t0; g.clearRect(0, 0, W, H);
      P.forEach(p => { p.vy += .38; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.globalAlpha = Math.max(0, 1 - t / 2400); g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore(); });
      if (t < 2400) raf(loop); else c.remove();
    };
    raf(loop);
  };

  /* ---------- Pull to refresh (home) ---------- */
  M.pullToRefresh = (scope, onRefresh) => {
    if (RM) return;
    const ind = document.createElement('div');
    ind.className = 'ptr'; ind.innerHTML = '<img src="img/ball.png" alt="">';
    document.body.appendChild(ind);
    let y0 = null, dy = 0, busy = false;
    scope.addEventListener('touchstart', e => { if (window.scrollY <= 0 && !busy && scope.classList.contains('active')) y0 = e.touches[0].clientY; }, { passive: true });
    scope.addEventListener('touchmove', e => {
      if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0);
      const k = Math.min(1, dy / 90);
      ind.style.transform = `translate(-50%, ${Math.min(dy, 110) * .7}px) rotate(${dy * 3}deg)`; ind.style.opacity = k;
    }, { passive: true });
    scope.addEventListener('touchend', () => {
      if (y0 == null) return; y0 = null;
      if (dy > 80) {
        busy = true; ind.classList.add('spin');
        setTimeout(() => { onRefresh(); ind.classList.remove('spin'); ind.style.opacity = 0; ind.style.transform = 'translate(-50%,0)'; busy = false; }, 900);
      } else { ind.style.opacity = 0; ind.style.transform = 'translate(-50%,0)'; }
      dy = 0;
    });
  };

  window.Motion = M;
})();
