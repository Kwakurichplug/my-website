/* =========================================================
   LetBetAfrika – instant games   (#/game/<id>)
   Lucky Dice · Spin & Win · Penalty Kick · Number Rush · Keno · Scratch Cards · Hi-Lo
   live: POST /api/games/<id>/play – the server takes the stake, draws the result with a
         CSPRNG and pays the win in one transaction (server/src/routes/games.js)
   demo: the same pay tables (game-logic.js) run in the browser
   The balance on screen only changes after the animation, so the result is never spoiled.
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const A = () => window.LBA_APP, GL = window.GameLogic;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fx = x => Number(x).toFixed(2).replace(/\.00$/, '') + 'x';
  const short = x => +Number(x).toFixed(2) + 'x';
  const BACK = '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

  const META = {
    dice: { n: 'Lucky Dice', verb: 'Roll', how: 'Two dice are rolled. Choose Under 7, Seven or Over 7, set your stake and roll.' },
    spin: { n: 'Spin & Win', verb: 'Spin', how: 'Spin the wheel. The segment that stops under the pointer is your multiplier.' },
    penalty: { n: 'Penalty Kick', verb: 'Shoot', how: 'Pick a corner and shoot. If the keeper dives the other way it is a goal and you win 1.44x.' },
    rush: { n: 'Number Rush', verb: 'Spin', how: 'Three reels. Three of a kind pays the table below; two cherries or two 7s also pay.' },
    keno: { n: 'Keno', verb: 'Draw', how: 'Pick 1 to 5 numbers from 1 to 40. Ten numbers are drawn – the more you match, the more you win.' },
    scratch: { n: 'Scratch Cards', verb: 'Buy card', how: 'Buy a card and scratch the nine panels. Three matching prizes win that prize.' },
    hilo: { n: 'Hi-Lo Cards', verb: null, how: 'Will the next card be higher or lower than yours? Ties lose. The price depends on the card you hold.' },
  };
  const S = { id: null, stake: {}, choice: { dice: 'over', penalty: 'left', keno: [] }, busy: false, res: {}, hist: {}, histLoaded: {}, deal: null, rot: 0, scr: null };

  /* ---------------- shared bits ---------------- */
  const stakeOf = id => S.stake[id] ?? A().C.defStake;
  const SUIT = [
    '<path d="M12 3c3 4 8 6.5 8 10.2A4.2 4.2 0 0 1 12.7 16l1.3 5h-4l1.3-5A4.2 4.2 0 0 1 4 13.2C4 9.5 9 7 12 3z"/>',               // spade
    '<path d="M12 21C6 16 3 12.6 3 9.1A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 9 2.1C21 12.6 18 16 12 21z"/>',                              // heart
    '<path d="M12 2.5l7.5 9.5-7.5 9.5L4.5 12z"/>',                                                                                    // diamond
    '<path d="M12 3.5a4 4 0 0 1 3.4 6.1A4 4 0 1 1 13 16.4l1 4.6h-4l1-4.6a4 4 0 1 1-2.4-6.8A4 4 0 0 1 12 3.5z"/>',                   // club
  ];
  const card = (c, cls = '') => c ? `<div class="ar-card ${c.suit === 1 || c.suit === 2 ? 'red' : ''} ${cls}"><b>${GL.RANKS[c.rank]}</b><svg viewBox="0 0 24 24">${SUIT[c.suit]}</svg><b class="br">${GL.RANKS[c.rank]}</b></div>`
    : `<div class="ar-card back ${cls}"><span>LB</span></div>`;
  const SYM = {
    '7': '<svg viewBox="0 0 60 60"><text x="30" y="47" text-anchor="middle" font-family="Kanit,Arial Black,sans-serif" font-style="italic" font-weight="800" font-size="50" fill="#e5163a" stroke="#ffc20e" stroke-width="2.5" paint-order="stroke">7</text></svg>',
    BAR: '<svg viewBox="0 0 60 60"><rect x="6" y="18" width="48" height="24" rx="5" fill="#1b1e25" stroke="#ffc20e" stroke-width="2.5"/><text x="30" y="36" text-anchor="middle" font-family="Roboto,Arial,sans-serif" font-weight="900" font-size="15" fill="#fff">BAR</text></svg>',
    BELL: '<svg viewBox="0 0 60 60"><path d="M30 10a4 4 0 0 1 4 4v1.5c8 2 12 9 12 17v6l5 6H9l5-6v-6c0-8 4-15 12-17V14a4 4 0 0 1 4-4z" fill="#ffc20e" stroke="#b87900" stroke-width="2"/><circle cx="30" cy="50" r="4.5" fill="#b87900"/></svg>',
    CHERRY: '<svg viewBox="0 0 60 60"><path d="M24 36c2-12 8-20 18-26M38 38c-1-10 0-20 4-28" stroke="#0a7d3e" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M40 10c6-1 10 2 12 6-6 1-10-1-12-6z" fill="#32ce62"/><circle cx="22" cy="42" r="10" fill="#e5163a"/><circle cx="40" cy="44" r="10" fill="#c8102e"/><circle cx="18" cy="38" r="3" fill="#ff8a9b"/></svg>',
    LEMON: '<svg viewBox="0 0 60 60"><path d="M8 32c0-11 10-19 22-19s22 8 22 19-10 18-22 18S8 43 8 32z" fill="#ffe14d" stroke="#d4a900" stroke-width="2"/><path d="M8 32l-4-2 4-2M52 32l4-2-4-2" fill="#ffe14d" stroke="#d4a900" stroke-width="2"/><ellipse cx="22" cy="26" rx="6" ry="3" fill="#fff6b0"/></svg>',
  };
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const die = n => `<div class="ar-die">${Array.from({ length: 9 }, (_, i) => `<i${PIPS[n].includes(i + 1) ? ' class="on"' : ''}></i>`).join('')}</div>`;
  const prizeCls = m => (m >= 50 ? 'p4' : m >= 10 ? 'p3' : m >= 5 ? 'p2' : m >= 2 ? 'p1' : 'p0');

  /* ---------------- boards ---------------- */
  const WHEEL_COL = m => (m === 0 ? '#262a31' : m >= 5 ? '#ffc20e' : m >= 3 ? '#e5163a' : m >= 2 ? '#7b2d8e' : m >= 1.5 ? '#2b6cff' : m >= 1.2 ? '#0a7d3e' : '#4a5260');
  const BOARD = {
    dice: () => { const r = S.res.dice; return `<div class="ar-dice">${die(r ? r.dice[0] : 3)}${die(r ? r.dice[1] : 4)}</div><div class="ar-sum">${r ? `Total <b>${r.sum}</b>` : 'Pick a side and roll'}</div>`; },
    spin: () => {
      const N = GL.WHEEL.length, R = 118, seg = 360 / N, pt = (a, r) => [r * Math.sin(a * Math.PI / 180), -r * Math.cos(a * Math.PI / 180)];
      const segs = GL.WHEEL.map((m, i) => {
        const a0 = i * seg - seg / 2, a1 = a0 + seg, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R), [tx, ty] = pt(i * seg, R * 0.68);
        // labels run along the radius (like a real prize wheel), outer end at the rim
        return `<path d="M0 0L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}z" fill="${WHEEL_COL(m)}" stroke="#0f1115" stroke-width="1.5"/>
          <text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" transform="rotate(${i * seg <= 180 ? i * seg - 90 : i * seg + 90} ${tx.toFixed(2)} ${ty.toFixed(2)})" text-anchor="middle" dominant-baseline="central" font-family="Roboto,Arial,sans-serif" font-size="${m ? 14 : 13}" font-weight="900" fill="${m >= 5 ? '#1b1e25' : '#fff'}">${m ? short(m) : '–'}</text>`;
      }).join('');
      return `<div class="ar-wheel"><svg viewBox="-130 -130 260 260" aria-hidden="true"><circle r="128" fill="#ffc20e"/><circle r="122" fill="#0f1115"/>
        <g id="arWheel" style="transform:rotate(${S.rot}deg)">${segs}</g><circle r="22" fill="#1b1e25" stroke="#ffc20e" stroke-width="4"/><text y="1" text-anchor="middle" dominant-baseline="central" font-family="Kanit,sans-serif" font-style="italic" font-weight="800" font-size="15" fill="#ffc20e">LB</text></svg>
        <i class="ar-pointer"></i></div>`;
    },
    penalty: () => `<div class="ar-pitch"><svg viewBox="0 0 320 200" aria-hidden="true">
        <rect x="0" y="150" width="320" height="50" fill="#12803f"/><path d="M0 150h320" stroke="#fff" stroke-width="2" opacity=".5"/><path d="M90 200l30-50h80l30 50" fill="none" stroke="#fff" stroke-width="2" opacity=".5"/>
        <g opacity=".35" stroke="#fff">${Array.from({ length: 13 }, (_, i) => `<path d="M${44 + i * 19} 30v120"/>`).join('')}${Array.from({ length: 6 }, (_, i) => `<path d="M40 ${40 + i * 20}h240"/>`).join('')}</g>
        <path d="M40 150V30h240v120" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
        <g id="arKeeper" class="ar-keeper"><rect x="146" y="92" width="28" height="44" rx="10" fill="#ffc20e"/><circle cx="160" cy="82" r="11" fill="#7a4a2b"/><path d="M146 100l-22-14M174 100l22-14" stroke="#ffc20e" stroke-width="9" stroke-linecap="round"/><circle cx="122" cy="85" r="6" fill="#fff"/><circle cx="198" cy="85" r="6" fill="#fff"/><path d="M152 136v14M168 136v14" stroke="#1b1e25" stroke-width="8" stroke-linecap="round"/></g>
        <g id="arBall" class="ar-ball"><circle cx="160" cy="182" r="10" fill="#fff"/><path d="M160 176l5 3.5-2 6h-6l-2-6z" fill="#1b1e25"/></g>
      </svg><b class="ar-call" id="arCall"></b></div>`,
    rush: () => { const r = S.res.rush; return `<div class="ar-reels">${[0, 1, 2].map(i => `<div class="ar-reel"><div class="ar-strip" id="arStrip${i}"><div class="ar-sym">${SYM[r ? r.reels[i] : ['7', 'BELL', 'CHERRY'][i]]}</div></div></div>`).join('')}</div>`; },
    keno: () => {
      const r = S.res.keno, picks = new Set(S.choice.keno), drawn = new Set(r ? r.drawn : []);
      return `<div class="ar-keno">${Array.from({ length: GL.KENO_N }, (_, i) => { const n = i + 1, p = picks.has(n), d = drawn.has(n);
        return `<button class="kn ${p ? 'pk' : ''} ${d ? 'dr' : ''} ${p && d ? 'hit' : ''}" data-ar="kn" data-v="${n}" aria-pressed="${p}">${n}</button>`; }).join('')}</div>
        <div class="ar-kn-tools"><span>${picks.size}/5 picked</span><button data-ar="knquick">Quick pick</button><button data-ar="knclear">Clear</button></div>`;
    },
    scratch: () => {
      const c = S.scr;
      return `<div class="ar-scratch ${c ? '' : 'idle'}">${Array.from({ length: 9 }, (_, i) => { const v = c ? c.cells[i] : null, open = c && c.open.has(i);
        return `<button class="sc ${open ? 'open' : ''} ${c && c.done && v === c.mult && c.mult ? 'win' : ''}" data-ar="sc" data-v="${i}" ${c && !open ? '' : 'disabled'} aria-label="${open ? GL.SCRATCH_SYM[v] : 'Scratch panel ' + (i + 1)}">
          <span class="sc-v ${v ? prizeCls(v) : ''}">${v ? GL.SCRATCH_SYM[v] : ''}</span><span class="sc-cov">${c ? 'SCRATCH' : '?'}</span></button>`; }).join('')}</div>
        ${c && !c.done ? '<button class="ar-reveal" data-ar="scall">Reveal all</button>' : ''}`;
    },
    hilo: () => { const d = S.deal, r = S.res.hilo; return `<div class="ar-cards">${card(r ? r.first : d && d.card)}<span class="ar-vs">then</span>${card(r ? r.next : null, r ? 'flip' : '')}</div>`; },
  };

  /* ---------------- choices ---------------- */
  const PICK = {
    dice: () => Object.entries(GL.DICE).map(([k, v]) => `<button class="ar-ch ${S.choice.dice === k ? 'on' : ''}" data-ar="choice" data-v="${k}" aria-pressed="${S.choice.dice === k}"><b>${v.label}</b><small>${fx(v.mult)}</small></button>`).join(''),
    penalty: () => GL.PENALTY.dirs.map(k => `<button class="ar-ch ${S.choice.penalty === k ? 'on' : ''}" data-ar="choice" data-v="${k}" aria-pressed="${S.choice.penalty === k}"><b>${k[0].toUpperCase() + k.slice(1)}</b><small>${fx(GL.PENALTY.mult)}</small></button>`).join(''),
  };
  const hiloBtns = () => {
    const d = S.deal, o = d ? GL.hiloOdds(d.card.rank) : { higher: 0, lower: 0 }, a = A();
    return `<div class="ar-hl">${[['higher', 'Higher'], ['lower', 'Lower']].map(([k, l]) => `<button class="ar-play ${k}" data-ar="hilo" data-v="${k}" ${o[k] && !S.busy ? '' : 'disabled'}>${l}<small>${o[k] ? fx(o[k]) + ' · ' + a.money(stakeOf('hilo')) : 'not available'}</small></button>`).join('')}</div>`;
  };

  /* ---------------- pay tables ---------------- */
  const row = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  const TABLE = {
    dice: () => `<div class="ar-tab">${Object.values(GL.DICE).map(v => row(v.label, fx(v.mult))).join('')}</div>`,
    spin: () => `<div class="ar-tab">${[...new Set(GL.WHEEL)].sort((a, b) => b - a).map(m => row(m ? fx(m) : 'No win', `${GL.WHEEL.filter(x => x === m).length} of ${GL.WHEEL.length}`)).join('')}</div>`,
    penalty: () => `<div class="ar-tab">${row('Goal', fx(GL.PENALTY.mult))}${row('Saved', 'No win')}</div>`,
    rush: () => `<div class="ar-tab">${Object.entries(GL.RUSH_PAY).map(([s, m]) => row(`<span class="ar-ts">${SYM[s].repeat(3)}</span>`, fx(m))).join('')}${row(`<span class="ar-ts">${SYM['7'].repeat(2)}</span>`, '5x')}${row(`<span class="ar-ts">${SYM.CHERRY.repeat(2)}</span>`, fx(GL.RUSH_TWO_CHERRY))}</div>`,
    keno: () => { const p = Math.max(1, S.choice.keno.length); return `<p class="ar-tnote">${p} number${p === 1 ? '' : 's'} picked</p><div class="ar-tab">${GL.KENO_PAY[p].map((m, h) => m ? row(`${h} match${h === 1 ? '' : 'es'}`, fx(m)) : '').join('')}</div>`; },
    scratch: () => `<div class="ar-tab">${GL.SCRATCH.filter(x => x.m).map(x => row(`3 × ${GL.SCRATCH_SYM[x.m]}`, fx(x.m))).join('')}</div>`,
    hilo: () => `<div class="ar-tab">${GL.RANKS.map((r, i) => { const o = GL.hiloOdds(i); return row(`Holding ${r}`, `Higher ${o.higher ? fx(o.higher) : '–'} · Lower ${o.lower ? fx(o.lower) : '–'}`); }).join('')}</div>`,
  };

  /* ---------------- history ---------------- */
  const sumUp = (g, x) => {
    const r = x.result || {};
    switch (g) {
      case 'dice': return r.dice ? `${r.dice[0]} + ${r.dice[1]} = ${r.sum} · ${GL.DICE[x.choice]?.label || ''}` : '';
      case 'spin': return x.mult ? fx(x.mult) : 'No win';
      case 'penalty': return r.goal ? `Goal ${r.shot}` : `Saved – keeper went ${r.keeper}`;
      case 'rush': return (r.reels || []).map(s => s[0] + s.slice(1).toLowerCase()).join(' · ');
      case 'keno': return r.picks ? `${r.hits.length}/${r.picks.length} matched` : '';
      case 'scratch': return x.mult ? `3 × ${GL.SCRATCH_SYM[x.mult]}` : 'No match';
      case 'hilo': return r.first ? `${GL.RANKS[r.first.rank]} → ${GL.RANKS[r.next.rank]} · ${x.choice}` : '';
      default: return '';
    }
  };
  function histHTML(id) {
    const a = A(), list = (S.hist[id] || []).slice(0, 10);
    if (!a.state.user) return '<p class="ar-none">Log in to play and see your results here.</p>';
    if (!list.length) return `<p class="ar-none">${a.live && !S.histLoaded[id] ? 'Loading…' : 'No plays yet – good luck!'}</p>`;
    return list.map(x => `<div class="ar-hr ${x.payout > 0 ? 'w' : ''}"><time>${new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>${sumUp(id, x)}</span><em>${a.money(x.stake)}</em><b>${x.payout > 0 ? '+' + a.money(x.payout) : '–'}</b></div>`).join('');
  }
  async function loadHist(id) {
    try { S.hist[id] = (await API.games.history(id)).map(x => ({ ...x, at: new Date(x.at).getTime() })); } catch { S.hist[id] = S.hist[id] || []; }
    S.histLoaded[id] = true;
    if (S.id === id && $('#arHist')) $('#arHist').innerHTML = histHTML(id);
  }

  /* ---------------- page ---------------- */
  const msgHTML = (r, id) => !r ? '' : r.payout > 0 ? `<span class="win">You won <b>${A().money(r.payout)}</b> · ${fx(r.mult)}</span>` : `<span class="lose">${id === 'penalty' ? 'Saved! No win this time' : 'No win this time – try again'}</span>`;
  function render(id) {
    const a = A(), el = $('#page-game .pg-root');
    if (!META[id]) return a.go('games');
    if (S.id !== id) { S.res = {}; S.scr = null; }
    S.id = id;
    const m = META[id], C = a.C, stake = stakeOf(id);
    el.innerHTML = `<div class="ar ar--${id}">
      <div class="ar-head"><button class="icon-btn" data-back aria-label="Back">${BACK}</button><b>${m.n}</b><span class="ar-bal" id="arBal">${a.state.user ? a.money(a.state.user.balance) : `<button data-open="loginModal">Log in</button>`}</span></div>
      <div class="ar-stage" id="arStage">${BOARD[id]()}</div>
      <div class="ar-msg" id="arMsg" aria-live="polite">${msgHTML(S.last && S.last.game === id ? S.last : null, id)}</div>
      ${PICK[id] ? `<div class="ar-pick" id="arPick">${PICK[id]()}</div>` : ''}
      <div class="ar-bet">
        <div class="ar-stake"><button data-ar="minus" aria-label="Lower stake">−</button><label><small>Stake ${C.cur}</small><input id="arStake" inputmode="decimal" value="${stake}" aria-label="Stake"></label><button data-ar="plus" aria-label="Raise stake">+</button></div>
        <div class="ar-chips">${C.chips.map(v => `<button data-ar="chip" data-v="${v}">${a.whole(v)}</button>`).join('')}</div>
        <div id="arAct">${id === 'hilo' ? hiloBtns() : `<button class="ar-play" data-ar="play" id="arPlay" ${S.busy ? 'disabled' : ''}>${m.verb} · ${a.money(stake)}</button>`}</div>
      </div>
      <div class="ar-hist"><h4>My plays</h4><div id="arHist">${histHTML(id)}</div></div>
      <details class="ar-info"><summary>How to play · return to player ${(GL.rtp(id) * 100).toFixed(1)}%</summary><p>${m.how}</p><div id="arTable">${TABLE[id]()}</div>
        <p class="ar-fair">Every result is decided on our secure server after your stake is placed, and every round is recorded for audit. Play responsibly – set limits under Responsible gambling.</p></details>
    </div>`;
    if (id === 'hilo') ensureDeal();
    if (a.live && a.state.user && !S.histLoaded[id]) loadHist(id);
  }
  const updBal = () => { const a = A(), b = $('#arBal'); if (b && a.state.user) b.textContent = a.money(a.state.user.balance); };
  const setBusy = on => { S.busy = on; $$('#arAct button, #arPick button, .ar-chips button, .ar-stake button').forEach(b => { b.disabled = on || (b.dataset.ar === 'hilo' && !(S.deal && GL.hiloOdds(S.deal.card.rank)[b.dataset.v])); }); };
  const refreshAct = () => { const a = A(), id = S.id, el = $('#arAct'); if (!el) return; el.innerHTML = id === 'hilo' ? hiloBtns() : `<button class="ar-play" data-ar="play" id="arPlay" ${S.busy ? 'disabled' : ''}>${META[id].verb} · ${a.money(stakeOf(id))}</button>`; };

  /* ---------------- Hi-Lo deal ---------------- */
  async function ensureDeal(force) {
    const a = A();
    if (S.deal && !force) return;
    if (a.live && a.state.user) { try { S.deal = await API.games.deal(); } catch (e) { S.deal = null; a.toast(a.apiErr(e, 'Could not deal a card'), 'err'); } }
    else S.deal = { card: GL.deal(Math.random), local: true };
    S.res.hilo = null;
    if (S.id === 'hilo' && $('#arStage')) { $('#arStage').innerHTML = BOARD.hilo(); refreshAct(); }
  }

  /* ---------------- animations (resolve when the result is on screen) ---------------- */
  const ANIM = {
    async dice(o) {
      const st = $('#arStage');
      for (let i = 0; i < 11; i++) { st.innerHTML = `<div class="ar-dice rolling">${die(1 + (Math.random() * 6 | 0))}${die(1 + (Math.random() * 6 | 0))}</div><div class="ar-sum">Rolling…</div>`; await wait(65); }
      S.res.dice = o.result; st.innerHTML = BOARD.dice();
    },
    async spin(o) {
      const N = GL.WHEEL.length, seg = 360 / N, i = o.result.segment, g = $('#arWheel');
      const target = (((-i * seg) % 360) + 360) % 360, jitter = (Math.random() - 0.5) * seg * 0.6;
      S.rot = S.rot - (S.rot % 360) + 360 * 6 + target + jitter;
      g.style.transition = 'transform 3.6s cubic-bezier(.12,.68,.1,1)'; g.style.transform = `rotate(${S.rot}deg)`;
      await wait(3700);
    },
    async penalty(o) {
      const k = $('#arKeeper'), b = $('#arBall'), call = $('#arCall'), r = o.result;
      const AIM = { left: [-78, -112, 0.62], centre: [0, -118, 0.6], right: [78, -112, 0.62] }, DIVE = { left: 'translate(-74px,6px) rotate(-68deg)', centre: 'translateY(-14px)', right: 'translate(74px,6px) rotate(68deg)' };
      const [dx, dy, sc] = AIM[r.shot];
      b.style.transform = `translate(${dx}px,${dy}px) scale(${sc})`; k.style.transform = DIVE[r.keeper];
      await wait(650);
      call.textContent = r.goal ? 'GOAL!' : 'SAVED!'; call.className = 'ar-call on ' + (r.goal ? 'goal' : 'saved');
      await wait(700);
    },
    async rush(o) {
      const syms = Object.keys(SYM);
      await Promise.all([0, 1, 2].map(async i => {
        const strip = $('#arStrip' + i), n = 14 + i * 5, list = Array.from({ length: n }, () => syms[Math.random() * syms.length | 0]);
        strip.style.transition = 'none'; strip.style.transform = 'translateY(0)';
        strip.innerHTML = [...list, o.result.reels[i]].map(s => `<div class="ar-sym">${SYM[s]}</div>`).join('');
        void strip.offsetWidth;
        const h = strip.firstElementChild.offsetHeight;
        strip.style.transition = `transform ${1.1 + i * 0.45}s cubic-bezier(.2,.75,.25,1)`; strip.style.transform = `translateY(${-n * h}px)`;
        await wait(1150 + i * 450);
      }));
      S.res.rush = o.result;
    },
    async keno(o) {
      S.res.keno = { drawn: [] }; $('#arStage').innerHTML = BOARD.keno();
      const picks = new Set(o.result.picks);
      for (const n of o.result.drawn) {
        const c = $(`.kn[data-v="${n}"]`); if (c) { c.classList.add('dr', 'pop'); if (picks.has(n)) c.classList.add('hit'); }
        await wait(190);
      }
      S.res.keno = o.result; await wait(250);
    },
    scratch(o) {
      return new Promise(done => {
        S.scr = { cells: o.result.cells, mult: o.mult, open: new Set(), done: false, finish: done };
        $('#arStage').innerHTML = BOARD.scratch();
      });
    },
    async hilo(o) {
      S.res.hilo = o.result; $('#arStage').innerHTML = BOARD.hilo();
      await wait(650);
    },
  };
  function scratchOpen(i) {
    const c = S.scr; if (!c || c.done) return;
    i === 'all' ? c.cells.forEach((_, k) => c.open.add(k)) : c.open.add(+i);
    if (c.open.size === 9) { c.done = true; setTimeout(() => { $('#arStage').innerHTML = BOARD.scratch(); c.finish(); }, 350); }
    $('#arStage').innerHTML = BOARD.scratch();
  }

  /* ---------------- play ---------------- */
  async function play(choice) {
    const a = A(), id = S.id, u = a.state.user;
    if (S.busy || !id) return;
    if (!u) return a.openModal('loginModal');
    const stake = a.r2(+String($('#arStake')?.value || stakeOf(id)).replace(/[^\d.]/g, '') || 0);
    if (!(stake >= a.C.minStake)) return a.toast('Minimum stake is ' + a.whole(a.C.minStake), 'err');
    if (stake > u.balance) { a.toast('Insufficient balance – please deposit', 'err'); return a.go('deposit'); }
    if (id === 'keno' && !S.choice.keno.length) return a.toast('Pick 1 to 5 numbers first', 'err');
    if (id === 'hilo' && (!S.deal || (a.live && S.deal.local))) { await ensureDeal(true); return a.toast('Here is your card – now choose Higher or Lower'); }
    const ch = id === 'keno' ? [...S.choice.keno] : id === 'hilo' ? choice : S.choice[id];
    setBusy(true); $('#arMsg').innerHTML = '';
    if (id === 'penalty' && $('#arCall')) { $('#arStage').innerHTML = BOARD.penalty(); await wait(30); }
    let r;
    try {
      if (a.live) r = await API.games.play(id, { stake, choice: ch, deal: id === 'hilo' ? S.deal.deal : undefined });
      else {
        const o = GL.play(id, Math.random, ch, id === 'hilo' ? S.deal.card : undefined);
        r = { id: 'G' + Date.now().toString(36).toUpperCase(), game: id, stake, choice: ch, mult: o.mult, payout: a.r2(stake * o.mult), result: o.result, balance: a.r2(u.balance - stake + stake * o.mult) };
      }
    } catch (e) {
      setBusy(false);
      if (['deal_expired', 'already_played'].includes(e.message)) { await ensureDeal(true); return a.toast('New card dealt – choose again'); }
      if (e.message === 'insufficient_funds') a.go('deposit');
      return a.toast(a.apiErr(e, 'Could not play – try again'), 'err');
    }
    u.balance = a.r2(u.balance - stake); updBal();                       // stake leaves the balance straight away
    if (!a.live) a.addTx(META[id].n + ' stake', -stake, { ref: r.id, status: 'success' });
    await ANIM[id](r);
    u.balance = r.balance; if (!a.live && r.payout > 0) a.addTx(META[id].n + ' win', r.payout, { ref: r.id, status: 'success' });
    a.saveUser(); a.renderAuth(); updBal();
    S.last = r; $('#arMsg').innerHTML = msgHTML(r, id);
    (S.hist[id] = S.hist[id] || []).unshift({ ...r, at: Date.now(), status: r.payout > 0 ? 'won' : 'lost' }); S.histLoaded[id] = true;
    $('#arHist').innerHTML = histHTML(id);
    if (r.payout > 0) { if (r.mult >= 2 && window.Pages) setTimeout(() => Pages.trophy({ amount: r.payout, source: META[id].n, ref: r.id, href: '#/game/' + id }), 450); else if (window.Motion) Motion.confetti(); }
    setBusy(false);
    if (id === 'hilo') setTimeout(() => { if (S.id === 'hilo' && !S.busy) { S.deal = null; ensureDeal(); } }, 1600);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ar]'); if (!t || !$('#page-game.active')) return;
    const a = A(), id = S.id, k = t.dataset.ar, v = t.dataset.v, inp = $('#arStake');
    const setStake = x => { S.stake[id] = Math.max(a.C.minStake, a.r2(x)); if (inp) inp.value = S.stake[id]; refreshAct(); };
    switch (k) {
      case 'minus': return setStake((+inp.value || 0) - a.C.chips[0]);
      case 'plus': return setStake((+inp.value || 0) + a.C.chips[0]);
      case 'chip': return setStake(+v);
      case 'choice': if (S.busy) return; S.choice[id] = v; $('#arPick').innerHTML = PICK[id](); return;
      case 'play': return play();
      case 'hilo': return play(v);
      case 'kn': {
        if (S.busy) return;
        const n = +v, l = S.choice.keno, i = l.indexOf(n);
        if (i >= 0) l.splice(i, 1); else if (l.length < 5) l.push(n); else return a.toast('Five numbers is the maximum', 'err');
        S.res.keno = null; $('#arStage').innerHTML = BOARD.keno(); if ($('#arTable')) $('#arTable').innerHTML = TABLE.keno();
        return;
      }
      case 'knquick': { if (S.busy) return; const pool = Array.from({ length: GL.KENO_N }, (_, i) => i + 1).sort(() => Math.random() - 0.5); S.choice.keno = pool.slice(0, 5); S.res.keno = null; $('#arStage').innerHTML = BOARD.keno(); if ($('#arTable')) $('#arTable').innerHTML = TABLE.keno(); return; }
      case 'knclear': if (S.busy) return; S.choice.keno = []; S.res.keno = null; $('#arStage').innerHTML = BOARD.keno(); if ($('#arTable')) $('#arTable').innerHTML = TABLE.keno(); return;
      case 'sc': return scratchOpen(v);
      case 'scall': return scratchOpen('all');
    }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'arStake' || !S.id) return;
    S.stake[S.id] = +e.target.value.replace(/[^\d.]/g, '') || 0; refreshAct();
  });

  window.Arcade = { handles: page => page === 'game', render: (_page, arg) => render(arg), META };
})();
