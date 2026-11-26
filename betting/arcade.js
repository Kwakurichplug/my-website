/* =========================================================
   LetBetAfrika – instant games shell   (#/game/<id>)   "LetBet Originals"
   Lucky Dice · Spin & Win · Penalty Kick · Number Rush · Keno · Scratch Cards · Hi-Lo
   live: POST /api/games/<id>/play – the server takes the stake, decides the result and pays the win
         in one transaction (server/src/routes/games.js). Scenes (scenes.js) only animate it.
   demo: the same pay tables (game-logic.js) run in the browser.
   The balance on screen changes only after the animation, so the result is never spoiled.
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const A = () => window.LBA_APP, GL = window.GameLogic, SC = () => window.Scenes;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fx = x => +Number(x).toFixed(2) + 'x';
  const BACK = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';

  const META = {
    dice: { n: 'Lucky Dice', verb: 'ROLL', how: 'Put your chip on UNDER 7, 7 or OVER 7 and roll two dice. If the total lands in your area you win the multiplier printed on the table.' },
    spin: { n: 'Spin & Win', verb: 'SPIN', how: 'Spin the wheel. The segment that stops under the pointer is your multiplier – up to 5x your stake.' },
    penalty: { n: 'Penalty Kick', verb: 'SHOOT', how: 'Tap the left, centre or right of the goal to aim, then shoot. If the keeper dives the other way it is a goal and you win 1.44x.' },
    rush: { n: 'Number Rush', verb: 'SPIN', how: 'Three reels, one win line. Three of a kind pays the table on the machine; two 7s pay 5x and two cherries pay 1.5x.' },
    keno: { n: 'Keno', verb: 'DRAW', how: 'Pick 1 to 5 numbers from 1 to 40. Ten balls are drawn – the more of your numbers come out, the more you win.' },
    scratch: { n: 'Scratch Cards', verb: 'BUY CARD', how: 'Buy a card and scratch the silver panel with your finger. Three matching prizes win that prize.' },
    hilo: { n: 'Hi-Lo Cards', verb: null, how: 'Will the next card be higher or lower than yours? A tie loses. The price shown on each button depends on the card you hold.' },
  };
  const S = { id: null, stake: {}, choice: { dice: 'over', penalty: 'left', keno: [] }, busy: false, res: {}, hist: {}, histLoaded: {}, deal: null, scr: null, last: null, hiloHist: [] };
  const stakeOf = id => S.stake[id] ?? A().C.defStake;
  const chipLabel = v => { const C = A().C; return v >= 1000 ? (v / 1000) + 'K' : String(v); };
  const ctx = id => ({ id, S, GL, choice: () => (id === 'keno' ? S.choice.keno : S.choice[id]), setChoice: v => setChoice(id, v), stake: () => stakeOf(id),
    money: v => A().money(v), busy: () => S.busy, chipLabel: () => chipLabel(stakeOf(id)), rerender: () => renderScene(), play: ch => play(ch) });

  /* ---------------- pay tables (info sheet) ---------------- */
  const row = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  const TABLE = {
    dice: () => Object.values(GL.DICE).map(v => row(v.label, fx(v.mult))).join(''),
    spin: () => [...new Set(GL.WHEEL)].sort((a, b) => b - a).map(m => row(m ? fx(m) : 'No win', `${GL.WHEEL.filter(x => x === m).length} of ${GL.WHEEL.length} segments`)).join(''),
    penalty: () => row('Goal', fx(GL.PENALTY.mult)) + row('Saved', 'No win'),
    rush: () => Object.entries(GL.RUSH_PAY).map(([s, m]) => row(`3 × ${s[0] + s.slice(1).toLowerCase()}`, fx(m))).join('') + row('2 × 7', '5x') + row('2 × Cherry', fx(GL.RUSH_TWO_CHERRY)),
    keno: () => { const p = Math.max(1, S.choice.keno.length); return `<p class="gx-note">${p} number${p === 1 ? '' : 's'} picked</p>` + GL.KENO_PAY[p].map((m, h) => (m ? row(`${h} match${h === 1 ? '' : 'es'}`, fx(m)) : '')).join(''); },
    scratch: () => GL.SCRATCH.filter(x => x.m).map(x => row(`3 × ${GL.SCRATCH_SYM[x.m]}`, fx(x.m))).join(''),
    hilo: () => GL.RANKS.map((r, i) => { const o = GL.hiloOdds(i); return row(`Holding ${r}`, `Higher ${o.higher ? fx(o.higher) : '–'} · Lower ${o.lower ? fx(o.lower) : '–'}`); }).join(''),
  };

  /* ---------------- recent results + my plays ---------------- */
  const tag = (g, x) => {
    const r = x.result || {};
    switch (g) {
      case 'dice': return r.sum != null ? String(r.sum) : '–';
      case 'penalty': return r.goal ? 'GOAL' : 'SAVED';
      case 'keno': return r.hits ? `${r.hits.length}/${r.picks.length}` : '–';
      case 'hilo': return r.next ? GL.RANKS[r.next.rank] : '–';
      default: return x.mult ? fx(x.mult) : '0x';
    }
  };
  const sumUp = (g, x) => {
    const r = x.result || {};
    switch (g) {
      case 'dice': return r.dice ? `${r.dice[0]} + ${r.dice[1]} = ${r.sum} · ${GL.DICE[x.choice]?.label || ''}` : '';
      case 'spin': return x.mult ? `Wheel ${fx(x.mult)}` : 'Wheel 0x';
      case 'penalty': return r.goal ? `Goal – shot ${r.shot}` : `Saved – keeper went ${r.keeper}`;
      case 'rush': return (r.reels || []).map(s => s[0] + s.slice(1).toLowerCase()).join(' · ');
      case 'keno': return r.picks ? `${r.hits.length} of ${r.picks.length} matched` : '';
      case 'scratch': return x.mult ? `3 × ${GL.SCRATCH_SYM[x.mult]}` : 'No match';
      case 'hilo': return r.first ? `${GL.RANKS[r.first.rank]} → ${GL.RANKS[r.next.rank]} · ${x.choice}` : '';
      default: return '';
    }
  };
  const histStrip = id => { const l = (S.hist[id] || []).slice(0, 14); return l.length ? l.map(x => `<i class="${x.payout > 0 ? 'w' : ''}">${tag(id, x)}</i>`).join('') : '<span>Your recent results appear here</span>'; };
  function myPlays(id) {
    const a = A(), list = (S.hist[id] || []).slice(0, 8);
    if (!a.state.user) return '<p class="gx-none">Log in to play and see your results here.</p>';
    if (!list.length) return `<p class="gx-none">${a.live && !S.histLoaded[id] ? 'Loading…' : 'No plays yet – good luck!'}</p>`;
    return list.map(x => `<div class="gx-pl ${x.payout > 0 ? 'w' : ''}"><time>${new Date(x.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span>${sumUp(id, x)}</span><em>${a.money(x.stake)}</em><b>${x.payout > 0 ? '+' + a.money(x.payout) : '–'}</b></div>`).join('');
  }
  async function loadHist(id) {
    try { S.hist[id] = (await API.games.history(id)).map(x => ({ ...x, at: new Date(x.at).getTime() })); } catch { S.hist[id] = S.hist[id] || []; }
    S.histLoaded[id] = true;
    if (S.id === id) { const h = $('#gxHist'), m = $('#gxMy'); if (h) h.innerHTML = histStrip(id); if (m) m.innerHTML = myPlays(id); }
  }

  /* ---------------- page ---------------- */
  const CHIPC = ['c1', 'c2', 'c3', 'c4'];
  const actHTML = id => {
    const a = A();
    if (id !== 'hilo') return `<button class="gx-go" id="gxGo" data-gx="play" ${S.busy ? 'disabled' : ''}><b>${META[id].verb}</b><small>${a.money(stakeOf(id))}</small></button>`;
    const d = S.deal, o = d ? GL.hiloOdds(d.card.rank) : { higher: 0, lower: 0 };
    return `<div class="gx-hl">${[['higher', 'HIGHER', '▲'], ['lower', 'LOWER', '▼']].map(([k, l, ar]) => `<button class="gx-go ${k}" data-gx="hilo" data-v="${k}" ${o[k] && !S.busy ? '' : 'disabled'}><b>${ar} ${l}</b><small>${o[k] ? fx(o[k]) : 'not possible'}</small></button>`).join('')}</div>`;
  };
  const pickHTML = id => id !== 'penalty' ? '' : `<div class="gx-pick" id="gxPick">${GL.PENALTY.dirs.map(k => `<button class="${S.choice.penalty === k ? 'on' : ''}" data-gx="choice" data-v="${k}" aria-pressed="${S.choice.penalty === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`;
  function render(id) {
    const a = A(), el = $('#page-game .pg-root');
    if (!META[id]) return a.go('games');
    if (S.id !== id) { S.res = {}; if (id !== 'scratch') S.scr = null; }
    S.id = id;
    const m = META[id], C = a.C, stake = stakeOf(id);
    el.innerHTML = `<div class="gx gx--${id}">
      <div class="gx-head"><button class="icon-btn" data-back aria-label="Back">${BACK}</button>
        <div class="gx-title"><small>LetBet Originals</small><b>${m.n}</b></div>
        <span class="gx-bal" id="gxBal">${a.state.user ? a.money(a.state.user.balance) : `<button data-open="loginModal">Log in</button>`}</span>
        <button class="gx-i" data-gx="info" aria-label="How to play">i</button></div>
      <div class="gx-hist" id="gxHist" aria-label="Recent results">${histStrip(id)}</div>
      <section class="gx-stage"><div class="gx-scene" id="gxScene">${SC()[id].html(ctx(id))}</div><div class="gx-result" id="gxResult" aria-live="polite"></div></section>
      ${pickHTML(id)}
      <div class="gx-bet">
        <div class="gx-chips" role="group" aria-label="Stake">${C.chips.map((v, i) => `<button class="gx-chipbtn ${CHIPC[i]} ${+stake === v ? 'on' : ''}" data-gx="chip" data-v="${v}" aria-label="Stake ${a.whole(v)}"><i><b>${chipLabel(v)}</b></i></button>`).join('')}</div>
        <div class="gx-row"><div class="gx-stake"><button data-gx="minus" aria-label="Lower stake">−</button><label><small>STAKE ${C.cur}</small><input id="gxStake" inputmode="decimal" value="${stake}" aria-label="Stake"></label><button data-gx="plus" aria-label="Raise stake">+</button></div>
          <div id="gxAct">${actHTML(id)}</div></div>
      </div>
      <div class="gx-my"><h4>My plays</h4><div id="gxMy">${myPlays(id)}</div></div>
      <div class="gx-sheet" id="gxSheet" hidden><div class="gx-sheet-in"><div class="gx-sheet-h"><b>${m.n}</b><button data-gx="close" aria-label="Close">×</button></div>
        <h5>How to play</h5><p>${m.how}</p><h5>Pay table</h5><div class="gx-tab" id="gxTab">${TABLE[id]()}</div>
        <h5>Return to player</h5><p><b>${(GL.rtp(id) * 100).toFixed(1)}%</b> over the long run.</p>
        <p class="gx-note">Every result is decided on our secure server after your stake is placed, and every round is recorded for audit. 18+ only. Play responsibly – set limits under Responsible Gambling.</p></div></div>
    </div>`;
    SC()[id].mount?.($('#gxScene'), ctx(id));
    if (id === 'hilo') ensureDeal();
    if (a.live && a.state.user && !S.histLoaded[id]) loadHist(id);
  }
  function renderScene() { const sc = $('#gxScene'); if (!sc || !S.id) return; sc.innerHTML = SC()[S.id].html(ctx(S.id)); SC()[S.id].mount?.(sc, ctx(S.id)); }
  function setChoice(id, v) {
    if (S.busy) return;
    S.choice[id] = v;
    if (id === 'penalty') { SC().penalty.sync(ctx(id)); $$('#gxPick button').forEach(b => { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v); }); }
    else renderScene();
  }
  const updBal = () => { const a = A(), b = $('#gxBal'); if (b && a.state.user) b.textContent = a.money(a.state.user.balance); };
  const setBusy = on => { S.busy = on; $('#page-game')?.classList.toggle('gx-busy', on); $$('#gxAct button, #gxPick button, .gx-chips button, .gx-stake button').forEach(b => { b.disabled = on || (b.dataset.gx === 'hilo' && !(S.deal && GL.hiloOdds(S.deal.card.rank)[b.dataset.v])); }); };
  const refreshAct = () => { const el = $('#gxAct'); if (el) el.innerHTML = actHTML(S.id); $$('.gx-chipbtn').forEach(b => b.classList.toggle('on', +b.dataset.v === +stakeOf(S.id))); };
  function showResult(r) {
    const el = $('#gxResult'), a = A(); if (!el) return;
    clearTimeout(el._t);
    el.className = 'gx-result ' + (r.payout > 0 ? 'win on' : 'lose on');
    el.innerHTML = r.payout > 0 ? `<small>YOU WIN</small><b>${a.money(r.payout)}</b><em>${fx(r.mult)}</em>${Array.from({ length: 14 }, (_, i) => `<i class="coin" style="--a:${i * 25.7}deg;--d:${(i % 4) * 0.04}s"></i>`).join('')}`
      : `<small>${S.id === 'penalty' ? 'SAVED' : 'NO WIN'}</small><b>Try again</b>`;
    el._t = setTimeout(() => el.classList.remove('on'), r.payout > 0 ? 3200 : 1800);
  }

  /* ---------------- Hi-Lo deal ---------------- */
  async function ensureDeal(force) {
    const a = A();
    if (S.deal && !force) return;
    if (a.live && a.state.user) { try { S.deal = await API.games.deal(); } catch (e) { S.deal = null; a.toast(a.apiErr(e, 'Could not deal a card'), 'err'); } }
    else S.deal = { card: GL.deal(Math.random), local: true };
    S.res.hilo = null; S.dealt = true;
    if (S.id === 'hilo') { renderScene(); refreshAct(); }
  }

  /* ---------------- play ---------------- */
  async function play(choice) {
    const a = A(), id = S.id, u = a.state.user;
    if (S.busy || !id) return;
    if (!u) return a.openModal('loginModal');
    const stake = a.r2(+String($('#gxStake')?.value || stakeOf(id)).replace(/[^\d.]/g, '') || 0);
    if (!(stake >= a.C.minStake)) return a.toast('Minimum stake is ' + a.whole(a.C.minStake), 'err');
    if (stake > u.balance) { a.toast('Insufficient balance – please deposit', 'err'); return a.go('deposit'); }
    if (id === 'keno' && !S.choice.keno.length) return a.toast('Pick 1 to 5 numbers first', 'err');
    if (id === 'hilo' && (!S.deal || (a.live && S.deal.local))) { await ensureDeal(true); return a.toast('Here is your card – now choose Higher or Lower'); }
    const ch = id === 'keno' ? [...S.choice.keno] : id === 'hilo' ? choice : S.choice[id];
    setBusy(true); $('#gxResult')?.classList.remove('on');
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
    u.balance = a.r2(u.balance - stake); updBal();                       // the stake leaves the balance straight away
    if (!a.live) a.addTx(META[id].n + ' stake', -stake, { ref: r.id, status: 'success' });
    await SC()[id].play($('#gxScene'), r, ctx(id));
    S.res[id] = r.result;
    u.balance = r.balance; if (!a.live && r.payout > 0) a.addTx(META[id].n + ' win', r.payout, { ref: r.id, status: 'success' });
    a.saveUser(); a.renderAuth(); updBal();
    S.last = r; showResult(r);
    (S.hist[id] = S.hist[id] || []).unshift({ ...r, at: Date.now(), status: r.payout > 0 ? 'won' : 'lost' }); S.histLoaded[id] = true;
    $('#gxHist').innerHTML = histStrip(id); $('#gxMy').innerHTML = myPlays(id);
    if (id === 'hilo') S.hiloHist.push(r.result.first);
    if (r.payout > 0) { if (r.mult >= 2 && window.Pages) setTimeout(() => Pages.trophy({ amount: r.payout, source: META[id].n, ref: r.id, href: '#/game/' + id }), 900); else if (window.Motion) Motion.confetti(); }
    setBusy(false);
    if (id === 'hilo') setTimeout(() => { if (S.id === 'hilo' && !S.busy) { S.deal = null; ensureDeal(); } }, 1700);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-gx]'); if (!t || !$('#page-game.active')) return;
    const a = A(), id = S.id, k = t.dataset.gx, v = t.dataset.v, inp = $('#gxStake');
    const setStake = x => { S.stake[id] = Math.max(a.C.minStake, a.r2(x)); if (inp) inp.value = S.stake[id]; refreshAct(); if (id === 'dice') renderScene(); };
    switch (k) {
      case 'minus': return setStake((+inp.value || 0) - a.C.chips[0]);
      case 'plus': return setStake((+inp.value || 0) + a.C.chips[0]);
      case 'chip': return setStake(+v);
      case 'choice': return setChoice(id, v);
      case 'play': return play();
      case 'hilo': return play(v);
      case 'info': { const s = $('#gxSheet'); s.hidden = false; requestAnimationFrame(() => s.classList.add('on')); return; }
      case 'close': { const s = $('#gxSheet'); s.classList.remove('on'); setTimeout(() => { s.hidden = true; }, 250); return; }
      case 'kn': {
        if (S.busy) return;
        const n = +v, l = S.choice.keno, i = l.indexOf(n);
        if (i >= 0) l.splice(i, 1); else if (l.length < 5) l.push(n); else return a.toast('Five numbers is the maximum', 'err');
        S.res.keno = null; renderScene(); const tb = $('#gxTab'); if (tb) tb.innerHTML = TABLE.keno(); return;
      }
      case 'knquick': { if (S.busy) return; const pool = Array.from({ length: GL.KENO_N }, (_, i) => i + 1).sort(() => Math.random() - 0.5); S.choice.keno = pool.slice(0, 5); S.res.keno = null; renderScene(); const tb = $('#gxTab'); if (tb) tb.innerHTML = TABLE.keno(); return; }
      case 'knclear': { if (S.busy) return; S.choice.keno = []; S.res.keno = null; renderScene(); const tb = $('#gxTab'); if (tb) tb.innerHTML = TABLE.keno(); return; }
      case 'scall': return S.scr && S.scr.auto && S.scr.auto();
    }
  });
  document.addEventListener('click', e => { const s = $('#gxSheet'); if (s && !s.hidden && e.target === s) { s.classList.remove('on'); setTimeout(() => { s.hidden = true; }, 250); } });
  document.addEventListener('input', e => {
    if (e.target.id !== 'gxStake' || !S.id) return;
    S.stake[S.id] = +e.target.value.replace(/[^\d.]/g, '') || 0; refreshAct();
  });

  window.Arcade = { handles: page => page === 'game', render: (_page, arg) => render(arg), META };
})();
