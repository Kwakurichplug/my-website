/* =========================================================
   LetBetAfrika – admin portal (back office)
   Plain JS on top of api.js (window.API). Pages are hash routes;
   every write goes through /api/admin and lands in the audit log.
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- icons ---------- */
  const IC = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    trade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 20a5 5 0 0 1 6-4.6"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
    ledger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v16H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4h-1l-2-2H9l-2 2H6a4 4 0 0 1-4-4v-1a4 4 0 0 1 4-4z"/><path d="M8 11v4M6 13h4M16 12h.01M18 14h.01"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8 20h8"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>',
    id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 4l9 5.5M4.5 10v8M9.5 10v8M14.5 10v8M19.5 10v8M3 20h18"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9c-1.5-3-5-4.5-6-2.5S8 9 12 9zM12 9c1.5-3 5-4.5 6-2.5S16 9 12 9z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  };
  document.body.innerHTML = document.body.innerHTML.replace(/\$\{ic\.(\w+)\}/g, (_, k) => IC[k] || '');

  /* ---------- helpers ---------- */
  const SYM = { NG: '₦', GH: 'GH₵' };
  const money = (n, cc = 'NG') => `${SYM[cc] || ''}${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const compact = (n, cc) => { n = Number(n || 0); const s = SYM[cc] || ''; const a = Math.abs(n); const f = a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : a > 0 && a < 10 && !Number.isInteger(n) ? n.toFixed(2) : n.toLocaleString('en', { maximumFractionDigits: 0 }); return s + f; };
  const int = n => Number(n || 0).toLocaleString('en');
  const when = d => { if (!d) return '–'; const x = new Date(d); return x.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  const ago = d => { if (!d) return ''; const s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return Math.floor(s / 86400) + ' d ago'; };
  const flag = cc => `<span class="flag"><img src="img/flags/${cc === 'GH' ? 'gh' : 'ng'}.svg" alt="${cc}"></span>`;
  const phoneFmt = (cc, p) => p ? (cc === 'GH' ? '+233 ' : '+234 ') + p : '–';
  const pill = (s, map) => { const [cls, label] = (map && map[s]) || ['', s]; return `<span class="pill ${cls}">${esc(label || s)}</span>`; };
  const P_PAY = { pending: ['warn', 'Pending'], success: ['ok', 'Paid'], failed: ['bad', 'Failed'], rejected: ['bad', 'Rejected'], cancelled: ['', 'Cancelled'] };
  // a deposit that succeeded was credited, a withdrawal was paid
  const payPill = p => pill(p.status, p.kind === 'deposit' ? { ...P_PAY, success: ['ok', 'Credited'] } : P_PAY);
  const NET = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AirtelTigo Money' };
  const mName = p => p.methodName || ({ bank_transfer: 'Bank transfer', mobile_money: 'Mobile money' })[p.method] || p.method;
  const P_BET = { open: ['info', 'Open'], won: ['ok', 'Won'], lost: ['', 'Lost'], void: ['warn', 'Void'], cashout: ['gold', 'Cashed out'] };
  const P_EV = { live: ['live', 'Live'], scheduled: ['info', 'Upcoming'], finished: ['', 'Finished'], cancelled: ['bad', 'Cancelled'] };
  const P_USER = { active: ['ok', 'Active'], suspended: ['bad', 'Suspended'], self_excluded: ['warn', 'Self-excluded'] };
  const P_GAME = { open: ['info', 'Open'], won: ['ok', 'Won'], lost: ['', 'Lost'], cashed: ['ok', 'Cashed'], void: ['warn', 'Void'] };
  const ERR = { ht_both: 'Enter both half-time scores, or leave both empty.', ht_over_ft: 'A half-time score cannot be higher than the full-time score.', reference_required: 'Enter the transfer reference from your bank or MoMo app – each transfer can be credited only once.', bad_image: 'That file is not a picture.', duplicate_reference: 'This transfer reference was already used for a deposit – check the player’s payments.', admin_only: 'This account is not an administrator.', bad_login: 'Wrong phone/email or password.', suspended: 'This account is suspended.', not_pending: 'This payment was already handled.', not_open: 'This bet is no longer open.', invalid: 'Some values are not valid.', invalid_email: 'Enter a valid email address.', too_many_attempts: 'Too many attempts – wait a few minutes.', offline: 'The API is unreachable.' };
  Object.assign(ERR, { not_pending: 'Someone already handled this one – the list is refreshed.', reason_required: 'Write the reason the player will see.',
    api_payment: 'Paid through the payment API – it is settled automatically.', api_not_configured: 'The payment API is not connected yet.', already_sent: 'This payout was already sent.',
    payout_failed: 'The payment API refused the payout.', review_required: 'Open Review and check the account first.', checks_failed: 'Red flags on this account – tick that you checked them to approve.', momo_details: 'This withdrawal has no valid MoMo number.', min_over_max: 'A minimum is higher than its maximum.', invalid: 'Some fields are not valid.' });
  Object.assign(ERR, { started: 'This match has kicked off – its markets stay closed until you enter the result.', not_started: 'The match has not kicked off yet – enter the result after the final whistle (or cancel it).',
    kickoff_too_soon: 'Kick-off must be at least 5 minutes from now.', kickoff_too_far: 'Kick-off must be within 60 days.', same_teams: 'Home and away must be different teams.',
    odds_too_high: 'These odds pay out more than is staked (margin under 2%). Lower at least one price.', odds_too_low: 'These odds carry over 35% margin. Raise the prices.',
    duplicate: 'This match is already on the book for that day.', league_not_found: 'Pick a league.', code_taken: 'That code already exists.',
    amount_too_high: 'That amount is above the limit for one promo code.', bad_password: 'That password is not right.', over_transfer_limit: 'Above the limit for one transfer.', over_daily_limit: 'Above the 24-hour sending limit.', no_wallet: 'There is no MoMo wallet on this number.', ends_in_past: 'The end date is in the past.' });
  // the server's own explanation (e.g. why a payout was refused) beats a generic line
  const errMsg = e => (e && e.data && e.data.message) || ERR[e && e.message] || (e && e.detail) || (e && e.message) || 'Something went wrong';
  const toast = (msg, kind) => { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200); };
  const initials = u => ((u.full_name || u.fullName || '').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2) || (u.phone || 'A').slice(-2)).toUpperCase();

  const state = { me: null, page: 'overview', arg: null, cache: {}, timer: null, drawer: null, payRows: new Map(), api: null, cc: null };
  const keepPays = list => { list.forEach(p => state.payRows.set(p.id, p)); return list; };

  /* ---------- auth ---------- */
  async function boot() {
    bind();
    if (!API.enabled) { showLogin('The API is not reachable from this address. Open the portal from the server\'s own domain.'); return; }
    if (API.token) {
      try { const u = await API.auth.me(); if (u.role === 'admin') return enter(u); API.auth.logout(); showLogin(ERR.admin_only); return; } catch (e) { if (!e.offline) API.auth.logout(); }
    }
    showLogin();
  }
  function showLogin(msg) {
    $('#app').hidden = true; $('#login').hidden = false;
    const e = $('#loginErr'); e.hidden = !msg; e.textContent = msg || '';
  }
  async function enter(u) {
    state.me = u;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#adminName').textContent = u.fullName || u.full_name || 'Administrator';
    $('#adminSub').textContent = u.email || phoneFmt(u.country, u.phone);
    $('#adminAvatar').textContent = initials(u);
    chips(); route();
    clearInterval(state.timer); state.timer = setInterval(() => { if (!document.hidden) { chips(); if (state.page === 'overview') render(true); } }, 30000);
  }

  /* ---------- top chips: feed + email health ---------- */
  async function chips() {
    try {
      const f = await API.admin.feed();
      const c = $('#feedChip'); const demo = (f.provider || 'demo') === 'demo';
      const left = f.remaining ?? (f.credits && (f.credits.remaining ?? f.credits.left)); const used = f.credits && f.credits.used;
      c.className = 'chip ' + (demo ? 'warn' : f.error ? 'bad' : 'ok');
      c.innerHTML = `<i class="dot"></i>${demo ? 'Demo odds' : 'Odds: ' + esc(f.provider)}${left != null ? ` · ${int(left)} credits left` : used != null ? ` · ${int(used)} used` : ''}`;
      c.title = JSON.stringify(f, null, 1).slice(0, 600);
      state.feed = f;
    } catch {}
    try {
      const m = await API.admin.emailStatus();
      const c = $('#emailChip'); const console_ = (m.provider || 'console') === 'console';
      c.className = 'chip ' + (console_ ? 'warn' : m.ready ? 'ok' : 'bad');
      c.innerHTML = `<i class="dot"></i>${console_ ? 'Email: console' : 'Email: ' + esc(m.provider) + (m.ready ? ' ready' : ' not ready')}`;
      c.title = m.error || m.server || '';
      state.email = m;
    } catch {}
    try {
      const o = await API.admin.overview(); const n = (o.pending_withdrawals || 0) + (o.pending_deposits || 0); const b = $('#navPending'); b.hidden = !n; b.textContent = n;
      state.pending = o;
    } catch {}
    try {
      const L = await API.admin.ladder(); const nl = $('#navLadder'); if (nl) { const n = (L.counts && L.counts.left) || 0; nl.hidden = !n; nl.textContent = n; nl.title = n + ' players with deposit bonuses left'; }
    } catch {}
    try { state.api = (await API.admin.paymentSettings()).api; } catch {}
    supportBadge();
    try { const d = await API.admin.liveDesk(); deskBadge(d.matches, d.freshSec); } catch {}
  }
  // Live support badge: chats waiting for a person (or with a new message from the player); a toast when one arrives
  async function supportBadge(n) {
    try {
      if (n == null) n = await API.admin.supportCount();
      const b = $('#navSupport'); if (b) { b.hidden = !n; b.textContent = n; }
      if (state.supportWaiting != null && n > state.supportWaiting && state.page !== 'support') toast('A player is waiting in Live support', 'ok');
      state.supportWaiting = n;
      document.title = (n ? `(${n}) ` : '') + 'LetBetAfrika Admin';
    } catch {}
  }

  /* ---------- router ---------- */
  const TITLES = { ladder: 'Deposit 1·2·3', livedesk: 'Live desk', support: 'Live support', overview: 'Overview', players: 'Players', payments: 'Payments', bets: 'Bets', trading: 'Trading desk', games: 'Games', jackpot: 'Jackpot', promos: 'Promo codes', sendmoney: 'Send money', agents: 'Agents', finance: 'Ledger', settings: 'Settings', email: 'Email', audit: 'Audit log', kyc: 'ID checks', paysettings: 'Payment settings' };
  function route() {
    const [page = 'overview', arg = null] = location.hash.replace(/^#\/?/, '').split('/');
    const before = state.page;
    state.page = TITLES[page] ? page : 'overview'; state.arg = arg ? decodeURIComponent(arg) : null;
    if (before && before !== state.page && $('#drawer').classList.contains('open')) closeDrawer();   // another page: the side panel closes
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === state.page));
    $('#pageTitle').textContent = TITLES[state.page];
    document.body.classList.remove('nav-open');
    if (state.drawer) closeDrawer();   // a drawer from the last page never covers the new one
    render();
  }
  async function render(silent) {
    const main = $('#main');
    if (!silent) main.innerHTML = '<div class="loading">Loading…</div>';
    try { await PAGES[state.page](main, silent); } catch (e) { main.innerHTML = `<div class="card"><div class="empty"><b>Could not load this page</b>${esc(errMsg(e))}</div></div>`; if (e.status === 401 || e.status === 403) { API.auth.logout(); showLogin(errMsg(e)); } }
  }

  /* =====================================================
     PAGES
     ===================================================== */
  const PAGES = {};

  /* ---------- Overview ---------- */
  PAGES.overview = async (main, silent) => {
    const cc = state.cc || state.me.country || 'NG';
    const [o, days, pend, live, ps, ph] = await Promise.all([API.admin.overview(cc), API.admin.series(14, cc), API.admin.paymentsQ('pending'), API.admin.events('open'), API.admin.paymentSettings().catch(() => null), API.admin.payoutHealth().catch(() => null)]);
    state.overview = o; keepPays(pend);
    const setup = [];
    if (ph && ph.ok === false && Date.now() - Date.parse(ph.at) < 3 * 86400000) setup.push(['Moolre payouts are failing', `Last attempt refused: ${ph.message || 'error'} – open Payments for the fix.`, '#/payments']);
    if (depFail(ph)) setup.push(['Moolre deposits are not being confirmed', `Moolre refused the payment check: ${ph.deposits.message || 'error'} – deposits stay pending until this is fixed. Open Payments.`, '#/payments']);
    if (ps) {
      const b = ps.settings.NG.bank, m = ps.settings.GH.momo; state.api = ps.api;
      if (!(b.bank && b.number && b.name)) setup.push(['Nigerian players cannot deposit yet', 'Add the bank account players pay into.', '#/paysettings']);
      if (!ps.api.enabled && !(m.number && m.name)) setup.push(['Ghana deposits are closed', 'Connect the payment API (Moolre keys in Railway) or add a MoMo number.', '#/paysettings']);
      if (ps.withdrawals && ps.withdrawals.suspended) setup.unshift(['Withdrawals are suspended', 'Players cannot request withdrawals or send money to a friend. You can still pay or reject the ones waiting.', '#/paysettings']);
    }
    const today = days[days.length - 1] || {};
    const ggr = (o.staked_today || 0) - (o.paid_today || 0) + (o.game_staked_today || 0) - (o.game_paid_today || 0);
    const spark = (key, color) => { const v = days.map(d => d[key]); const mx = Math.max(...v, 1); const pts = v.map((y, i) => `${(i / (v.length - 1)) * 100},${28 - (y / mx) * 24}`).join(' '); return `<div class="spark"><svg viewBox="0 0 100 28" preserveAspectRatio="none"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts}"/></svg></div>`; };
    const kpi = (k, v, s, cls, sp) => `<div class="card kpi ${cls || ''}"><div class="k">${k}</div><div class="v num">${v}</div>${s ? `<div class="s">${s}</div>` : ''}${sp || ''}</div>`;
    const lives = live.filter(e => e.status === 'live').slice(0, 8);
    main.innerHTML = `
      <div class="page-head"><div><h2>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${esc((state.me.fullName || state.me.full_name || 'Admin').split(' ')[0])}</h2><p>Live picture of the book as of ${when(new Date())}. Refreshes every 30 seconds.</p></div>
        <div class="page-actions"><div class="seg">${[['NG', '₦ Nigeria'], ['GH', 'GH₵ Ghana']].map(([v, l]) => `<button class="${v === cc ? 'on' : ''}" data-occ="${v}">${l}</button>`).join('')}</div><a class="btn" href="#/payments">Payment queue <b>${int(((state.pending || o).pending_withdrawals || 0) + ((state.pending || o).pending_deposits || 0))}</b></a><a class="btn primary" href="#/trading">Trading desk</a></div></div>
      ${setup.map(([t, d, h]) => `<a class="banner warn link" href="${h}"><b>${t}</b> – ${d} <span class="lnk">Open payment settings</span></a>`).join('')}
      <div class="grid g-kpi">
        ${kpi('Deposits today', compact(o.deposits_today, cc), `<b>${int(o.deposit_count_today)}</b> successful · withdrawals ${compact(o.withdrawals_today, cc)}`, 'good', spark('deposits', 'var(--s1)'))}
        ${kpi('Sports stakes today', compact(o.staked_today, cc), `<b>${int(o.bets_today)}</b> bets · paid out ${compact(o.paid_today, cc)}`, '', spark('staked', 'var(--s2)'))}
        ${kpi('Games turnover today', compact(o.game_staked_today, cc), `<b>${int(o.plays_today)}</b> plays · paid ${compact(o.game_paid_today, cc)}`, '', spark('gameStaked', 'var(--s3)'))}
        ${kpi('Gross gaming revenue', compact(ggr, cc), 'stakes minus payouts, today', ggr < 0 ? 'bad' : 'good')}
        ${kpi('Open liability', compact(o.open_liability, cc), `<b>${int(o.open)}</b> open bets · potential payout`, 'warn')}
        ${kpi('Player balances', compact(o.liabilities, cc), `<b>${int(o.users)}</b> players · <b>${int(o.new_today)}</b> joined today`)}
      </div>
      <div class="grid g-2 mt">
        <div class="card">${chartBars({ id: 'c1', title: 'Deposits vs withdrawals', sub: 'last 14 days, successful payments', days, series: [{ key: 'deposits', label: 'Deposits', color: 'var(--s1)' }, { key: 'withdrawals', label: 'Withdrawals', color: 'var(--s2)' }], cc })}</div>
        <div class="card">
          <div class="card-h"><h3>Needs attention</h3><a class="lnk" href="#/payments">All payments</a></div>
          <div class="q-list">
            ${pend.length ? pend.slice(0, 7).map(p => `<div class="q-item"><div class="who"><b>${p.kind === 'withdrawal' ? 'Withdrawal' : 'Deposit'} · ${esc(mName(p))}</b><small>${esc(p.full_name || phoneFmt(p.country, p.phone))} · ID ${p.uid} · ${ago(p.created_at)}</small></div><span class="amt">${money(p.amount, p.country)}</span>
              ${payActs(p)}</div>`).join('')
              : '<div class="empty"><b>Queue is clear</b>No pending deposits or withdrawals.</div>'}
          </div>
        </div>
      </div>
      <div class="grid g-2 mt">
        <div class="card">${chartLines({ id: 'c2', title: 'Sports book: stakes and payouts', sub: 'last 14 days', days, series: [{ key: 'staked', label: 'Staked', color: 'var(--s2)' }, { key: 'paid', label: 'Paid out', color: 'var(--s3)' }], cc })}</div>
        <div class="card">
          <div class="card-h"><h3>In play now <span class="sub">${int(o.live)} live · ${int(o.upcoming)} upcoming</span></h3><a class="lnk" href="#/trading">Trading desk</a></div>
          ${lives.length ? lives.map(e => `<div class="live-row click" data-event="${e.id}"><span class="min">${e.minute}'</span><span class="teams">${esc(e.home)} – ${esc(e.away)}<div class="lg">${esc(e.country)} · ${esc(e.league)} · ${int(e.markets - e.suspended)} open markets${e.liability ? ` · exposure ${compact(e.liability, cc)}` : ''}</div></span><span class="sc">${e.score_home}–${e.score_away}</span></div>`).join('') : '<div class="empty">No match is live right now.</div>'}
        </div>
      </div>
      <div class="grid g-2e mt">
        <div class="card">${chartBars({ id: 'c3', title: 'New players', sub: 'sign-ups per day', days, series: [{ key: 'signups', label: 'Sign-ups', color: 'var(--s1)' }], fmt: int })}</div>
        <div class="card">${chartLines({ id: 'c4', title: 'Games: turnover and payouts', sub: 'instant games, Rocket Crash, virtuals', days, series: [{ key: 'gameStaked', label: 'Turnover', color: 'var(--s4)' }, { key: 'gamePaid', label: 'Paid out', color: 'var(--s3)' }], cc })}</div>
      </div>`;
    bindCharts(main);
    $$('#main [data-occ]').forEach(b => b.onclick = () => { state.cc = b.dataset.occ; render(); });
  };

  /* ---------- Players ---------- */
  PAGES.players = async main => {
    const q = state.arg || '';
    const users = await API.admin.users(q);
    main.innerHTML = `
      <div class="page-head"><div><h2>Players</h2><p>${q ? `Results for “${esc(q)}”` : 'Most recent 100 accounts. Search by phone, ID, name or email.'}</p></div>
        <div class="page-actions"><form class="search" id="pq"><i>${IC.search}</i><input placeholder="Search players" value="${esc(q)}"></form></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Player</th><th>Contact</th><th>Status</th><th>Role</th><th class="r">Balance</th><th>Joined</th><th></th></tr></thead><tbody>
        ${users.map(u => `<tr class="click" data-user="${u.id}"><td><div class="who"><b>${esc(u.full_name || 'No name yet')}</b><small>ID ${u.uid}</small></div></td><td><div class="who">${flag(u.country)}${esc(phoneFmt(u.country, u.phone))}<small>${esc(u.email || '')}</small></div></td>
          <td>${pill(u.status, P_USER)}</td><td>${u.role === 'admin' ? pill('a', { a: ['gold', 'Admin'] }) : '<span class="muted">Player</span>'}</td>
          <td class="r amt">${money(u.balance, u.country)}</td><td class="muted">${when(u.created_at)}</td><td><div class="acts"><button class="btn xs" data-user="${u.id}">Open</button></div></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>No players found</b>Try another phone number or ID.</div></td></tr>'}
      </tbody></table></div></div>`;
    $('#pq').onsubmit = e => { e.preventDefault(); location.hash = '#/players/' + encodeURIComponent($('#pq input').value.trim()); };
  };

  // paid in or out through a payment API (Moolre, Paystack): settled by the provider, never by hand
  const isApiPay = p => !!p && (p.provider === 'moolre' || p.provider === 'paystack');
  const apiPill = p => isApiPay(p) ? ` <span class="pill info">${p.provider === 'moolre' ? 'Moolre' : 'Paystack'}</span>` : '';
  const apiName = () => (state.api && state.api.label) || 'the payment API';

  async function openUser(id) {
    openDrawer('<div class="loading">Loading player…</div>');
    const d = await API.admin.user(id);
    const u = d.user, cc = u.country;
    const tab = (t) => {
      if (t === 'bets') return `<table class="mini"><thead><tr><th>Ticket</th><th>Type</th><th class="r">Stake</th><th class="r">Odds</th><th>Status</th><th class="r">Paid</th><th>Placed</th></tr></thead><tbody>${d.bets.map(b => `<tr><td><span class="lnk" data-bet="${esc(b.id)}">${esc(b.id)}</span></td><td>${b.type}</td><td class="r">${money(b.stake, cc)}</td><td class="r">${Number(b.odds).toFixed(2)}</td><td>${pill(b.status, P_BET)}</td><td class="r">${b.paid != null ? money(b.paid, cc) : '–'}</td><td class="muted">${when(b.placed_at)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No bets yet</td></tr>'}</tbody></table>`;
      if (t === 'pay') return `<table class="mini"><thead><tr><th>Kind</th><th>Method</th><th class="r">Amount</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>${d.payments.map(p => `<tr><td>${p.kind}</td><td>${esc(mName(p))}${apiPill(p)}</td><td class="r">${money(p.amount, cc)}</td><td>${payPill(p)}</td><td class="muted">${when(p.created_at)}</td><td>${p.status === 'pending' && !isApiPay(p) ? `${p.kind === 'withdrawal' ? `<button class="btn xs primary" data-review="${p.id}">Review</button>` : `<button class="btn xs primary" data-pay="approve" data-id="${p.id}">Approve</button>`} <button class="btn xs danger" data-pay="reject" data-id="${p.id}">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No payments yet</td></tr>'}</tbody></table>`;
      if (t === 'tx') return `<table class="mini"><thead><tr><th>Type</th><th class="r">Amount</th><th class="r">Balance</th><th>Ref</th><th>When</th></tr></thead><tbody>${d.transactions.map(x => `<tr><td>${esc(x.type)}${x.meta && x.meta.reason ? `<div class="muted small">${esc(x.meta.reason)}</div>` : ''}</td><td class="r amt ${Number(x.amount) >= 0 ? 'in' : 'out'}">${Number(x.amount) >= 0 ? '+' : ''}${money(x.amount, cc)}</td><td class="r">${money(x.balance_after, cc)}</td><td class="id">${esc(x.ref || '')}</td><td class="muted">${when(x.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No transactions yet</td></tr>'}</tbody></table>`;
      if (t === 'games') return `<table class="mini"><thead><tr><th>Game</th><th class="r">Plays</th><th class="r">Staked</th><th class="r">Paid</th><th class="r">Hold</th></tr></thead><tbody>${d.games.map(g => `<tr><td>${esc(g.game)}</td><td class="r">${int(g.plays)}</td><td class="r">${money(g.staked, cc)}</td><td class="r">${money(g.paid, cc)}</td><td class="r">${g.staked > 0 ? ((1 - g.paid / g.staked) * 100).toFixed(1) + '%' : '–'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No game plays yet</td></tr>'}</tbody></table>`;
    };
    const lim = u.limits || {}, kyc = lim.kyc || {};
    keepPays(d.payments.map(p => ({ ...p, user_id: u.id, country: cc, uid: u.uid, full_name: u.full_name, phone: u.phone, verified: u.verified, kyc: kyc.status })));
    $('#drawerBody').innerHTML = `
      <div class="d-head"><span class="avatar">${initials(u)}</span><div><h3>${esc(u.full_name || 'No name yet')}</h3><p>ID ${u.uid} · ${flag(cc)}${esc(phoneFmt(cc, u.phone))}${u.email ? ' · ' + esc(u.email) : ''}</p></div></div>
      <div class="d-actions">${pill(u.status, P_USER)} ${u.role === 'admin' ? pill('a', { a: ['gold', 'Administrator'] }) : ''} ${u.status === 'self_excluded' && lim.selfExclude ? pill('x', { x: ['warn', 'Self-excluded until ' + when(lim.selfExclude)] }) : ''}</div>
      <div class="stat-row"><div class="stat"><small>Balance</small><b>${money(u.balance, cc)}</b></div><div class="stat"><small>Deposited</small><b>${money(d.totals.deposited, cc)}</b></div><div class="stat"><small>Withdrawn</small><b>${money(d.totals.withdrawn, cc)}</b></div><div class="stat"><small>Staked / won</small><b>${compact(d.totals.staked, cc)} / ${compact(d.totals.won, cc)}</b></div></div>
      <div class="d-actions">
        <button class="btn sm primary" data-add-dep="${u.id}">Add deposit</button>
        <button class="btn sm" data-req-dep="${u.id}">Request deposit</button>
        <button class="btn sm primary" data-adjust="${u.id}" data-cc="${cc}">Adjust balance</button>
        ${u.status === 'suspended' ? `<button class="btn sm" data-user-set="${u.id}" data-field="status" data-value="active">Reactivate</button>` : `<button class="btn sm danger" data-user-set="${u.id}" data-field="status" data-value="suspended">Suspend</button>`}
        ${u.role === 'admin' ? (u.id !== state.me.id ? `<button class="btn sm" data-user-set="${u.id}" data-field="role" data-value="user">Remove admin</button>` : '') : `<button class="btn sm" data-user-set="${u.id}" data-field="role" data-value="admin">Make admin</button>`}
        ${u.is_agent ? `<button class="btn sm" data-agent-set="${u.id}" data-v="false">Stop agent</button>` : `<button class="btn sm" data-agent-set="${u.id}" data-v="true">Make agent</button>`}
      </div>
      ${u.is_agent && u.agent_code ? `<div class="agent-box"><b>Agent</b> · code <span class="mono">${esc(u.agent_code)}</span><div class="agent-link"><input readonly value="${esc(location.origin + '/?agent=' + u.agent_code)}" onclick="this.select()"><a class="btn xs" href="#/agents">Agents page</a></div></div>` : ''}
      <dl class="kv">${d.ladder ? `<dt>Deposit bonuses</dt><dd class="lad">${d.ladder.steps.map(x => `<span class="pill ${x.done ? 'ok' : x.status === 'checking' ? 'gold' : x.status === 'next' ? 'info' : ''}">${x.done ? '✓ ' : ''}Deposit ${x.n} · ${x.done ? (x.deposit != null ? money(x.deposit, cc) + ' · ' : '') + 'bonus ' + money(x.bonus, cc) + (x.status === 'active' ? ` ${x.required ? Math.floor(100 * x.wagered / x.required) : 0}% played` : ' ' + x.status) : x.status === 'checking' ? 'being checked' : x.status === 'next' ? 'next' : x.status === 'locked' ? 'after the ID check' : 'left'}</span>`).join(' ')}</dd>` : ''}${(d.requests || []).length ? `<dt>Deposit request</dt><dd>${d.requests.map(r => `${r.data && r.data.amount ? money(r.data.amount, cc) : 'Any amount'} · sent ${ago(r.created_at)} · waiting for the player <button class="btn xs" data-cancel-req="${r.id}">Cancel</button>`).join('<br>')}</dd>` : ''}${d.referrer ? `<dt>Signed up with</dt><dd>code LB${d.referrer.uid} · <span class="lnk" data-${d.referrer.agent ? 'agent' : 'user'}="${d.referrer.id}">${esc(d.referrer.full_name || 'ID ' + d.referrer.uid)}</span>${d.referrer.agent ? ' (agent)' : ''}</dd>` : ''}<dt>ID check</dt><dd>${u.verified ? 'Verified' : kyc.status === 'pending' ? 'Waiting for review' : kyc.status === 'rejected' ? 'Rejected – ' + esc(kyc.reason || '') : 'Not sent'}${kyc.idType ? ` · ${esc(kyc.idType)} <span class="mono">${esc(kyc.idNumber || '')}</span> · ${esc(kyc.fullName || '')} · born ${esc(kyc.dob || '')}` : ''}</dd><dt>Deposit reference</dt><dd class="mono">LB${String(u.uid).padStart(6, '0')}</dd><dt>Joined</dt><dd>${when(u.created_at)}</dd><dt>Country</dt><dd>${cc === 'GH' ? 'Ghana' : 'Nigeria'}</dd><dt>Deposit limit</dt><dd>${lim.amt ? money(lim.amt, cc) + ' per ' + esc(lim.period || 'week') : 'None set'}</dd><dt>Referral code</dt><dd>LB${u.uid}</dd></dl>
      <div class="d-tabs"><button class="on" data-dtab="bets">Bets</button><button data-dtab="pay">Payments</button><button data-dtab="tx">Ledger</button><button data-dtab="games">Games</button></div>
      <div id="dtab">${tab('bets')}</div>`;
    $$('#drawerBody [data-dtab]').forEach(b => b.onclick = () => { $$('#drawerBody [data-dtab]').forEach(x => x.classList.toggle('on', x === b)); $('#dtab').innerHTML = tab(b.dataset.dtab); });
    state.drawer = { type: 'user', id }; state.drawerUser = u; state.drawerPays = d.payments;
  }

  const refreshDrawer = () => { if (state.drawer && state.drawer.type === 'user' && $('#drawer').classList.contains('open')) openUser(state.drawer.id); };

  /* ---------- Deposit 1·2·3 tracker: players with an approved ID, each step marked; those with deposits left first ---------- */
  const LAD_SEG = [['left', 'Deposits left'], ['s0', 'Not started'], ['s1', '1 of 3 done'], ['s2', '2 of 3 done'], ['checking', 'Being checked'], ['s3', 'All 3 done'], ['all', 'All']];
  PAGES.ladder = async main => {
    const f = state.ladF || (state.ladF = { seg: 'left', cc: '', q: '', sort: 'progress' });
    const d = await API.admin.ladder(f.cc, f.q);
    if (!d.enabled) { main.innerHTML = `<div class="page-head"><div><h2>Deposit 1·2·3</h2><p>Deposit bonuses 1 · 2 · 3 is switched off.</p></div></div><div class="card"><div class="empty"><b>Switched off</b>Turn it on in <a href="#/settings">Settings → Deposit bonuses 1 · 2 · 3</a>.</div></div>`; return; }
    state.ladRows = new Map(d.players.map(p => [p.id, p]));
    const c = d.counts, cnt = { left: c.left, s0: c.s0, s1: c.s1, s2: c.s2, checking: c.checking, s3: c.s3, all: c.all };
    let rows = d.players.filter(p => f.seg === 'all' ? true : f.seg === 'left' ? p.left > 0 : f.seg === 'checking' ? p.checking : p.done === +f.seg.slice(1));
    const t = x => (x ? new Date(x).getTime() : 0);
    rows = rows.sort(f.sort === 'recent' ? (a, b) => t(b.verified_at) - t(a.verified_at) : f.sort === 'last' ? (a, b) => t(b.last_deposit) - t(a.last_deposit)
      : (a, b) => (b.checking - a.checking) || (a.done - b.done) || (t(b.verified_at) - t(a.verified_at)));
    const day = x => x ? new Date(x).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
    const cell = (p, s) => s.done
      ? `<div class="lad-c done"><b>✓ ${s.deposit != null ? money(s.deposit, p.country) : 'Done'}</b><small>${day(s.depositAt)} · bonus ${money(s.bonus, p.country)} ${s.status === 'active' ? `· ${s.required ? Math.floor(100 * s.wagered / s.required) : 0}% played` : s.status === 'released' ? '· released' : '· ' + s.status}</small></div>`
      : s.status === 'checking' ? `<div class="lad-c chk"><b>Being checked</b><small>${money(s.deposit, p.country)} · confirm it in Payments</small></div>`
      : s.status === 'next' ? `<div class="lad-c next"><b>Next</b><small>${s.pct}% up to ${compact(s.max, p.country)}</small></div>`
      : `<div class="lad-c left"><b>Left</b><small>${s.pct}% up to ${compact(s.max, p.country)}</small></div>`;
    main.innerHTML = `
      <div class="page-head"><div><h2>Deposit 1·2·3</h2><p>Every player whose ID is approved, with each deposit step marked: ✓ done (amount, date, bonus), being checked, next or left. Players with deposits left come first – press <b>Request deposit</b> to send them a pop-up and an email that takes them straight to their next deposit.</p></div>
        <div class="page-actions"><div class="seg">${[['', 'All'], ['NG', '₦ Nigeria'], ['GH', 'GH₵ Ghana']].map(([v, l]) => `<button class="${f.cc === v ? 'on' : ''}" data-lcc="${v}">${l}</button>`).join('')}</div></div></div>
      <div class="card"><div class="toolbar sticky-tools"><div class="seg wrap">${LAD_SEG.map(([v, l]) => `<button class="${f.seg === v ? 'on' : ''}" data-lseg="${v}">${l} <em class="cnt">${cnt[v] || 0}</em></button>`).join('')}</div>
        <form class="search" id="lq"><i>${IC.search}</i><input placeholder="Phone, ID, name or email" value="${esc(f.q)}"></form>
        <select class="btn sm" id="lsort" aria-label="Sort"><option value="progress" ${f.sort === 'progress' ? 'selected' : ''}>Fewest done first</option><option value="recent" ${f.sort === 'recent' ? 'selected' : ''}>Newest ID approval</option><option value="last" ${f.sort === 'last' ? 'selected' : ''}>Latest deposit</option></select>
        <span class="spacer"></span><span class="muted small">${rows.length} shown</span></div>
      <div class="tbl-wrap"><table class="tbl lad-tbl"><thead><tr><th>Player</th><th>ID approved</th><th>Deposit 1</th><th>Deposit 2</th><th>Deposit 3</th><th>Progress</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr class="click" data-user="${p.id}"><td><div class="who"><b>${esc(p.full_name || 'No name yet')}</b><small>ID ${p.uid} · ${flag(p.country)}${esc(p.phone ? phoneFmt(p.country, p.phone) : p.email || '')}</small></div></td>
          <td class="muted">${day(p.verified_at) || '–'}</td>${p.steps.map(s => `<td>${cell(p, s)}</td>`).join('')}
          <td><div class="lad-prog" title="${p.done} of ${p.steps.length} done">${p.steps.map(s => `<i class="${s.done ? 'on' : s.status === 'checking' ? 'chk' : ''}"></i>`).join('')}</div><small class="muted">${p.left ? p.left + ' left' : 'All done'}</small></td>
          <td><div class="acts">${p.next && !p.checking ? `<button class="btn xs primary" data-lad-req="${p.id}">Request deposit ${p.next}</button>` : p.checking ? '<a class="btn xs" href="#/payments/pending:deposit">Confirm in Payments</a>' : ''}</div></td></tr>`).join('')
          || `<tr><td colspan="7"><div class="empty"><b>No players here</b>${f.seg === 'left' ? 'Every player with an approved ID has made all three deposits.' : 'Nothing matches this filter.'}</div></td></tr>`}
      </tbody></table></div></div>`;
    $$('#main [data-lseg]').forEach(b => b.onclick = () => { f.seg = b.dataset.lseg; render(true); });
    $$('#main [data-lcc]').forEach(b => b.onclick = () => { f.cc = b.dataset.lcc; render(); });
    $('#lsort').onchange = e => { f.sort = e.target.value; render(true); };
    $('#lq').onsubmit = e => { e.preventDefault(); f.q = $('#lq input').value.trim(); render(); };
  };

  /* ---------- Support: ask a player to deposit – they get a pop-up in the app (and an email) that walks them through it ---------- */
  function requestDepositModal(id, row) {
    const u = row || (state.drawerUser && state.drawerUser.id === id ? state.drawerUser : null);
    if (!u) return toast('Open the player first', 'err');
    const nx = row && row.next ? row.steps.find(x => x.n === row.next) : null;
    const preset = nx ? `Your Deposit ${nx.n} bonus is waiting: ${nx.pct}% extra, up to ${money(nx.max, u.country)}. Deposit now and we add it.` : '';
    const cc = u.country, gh = cc === 'GH';
    openModal(`<h3>Ask the player to deposit</h3>
      <p class="sub">The player gets a pop-up the next time they open LetBetAfrika, and an email. It shows how to pay ${gh ? 'with Mobile Money' : 'by bank transfer to your account'}, step by step, with a button that opens the deposit page with the amount filled in. It closes by itself once they deposit, or after 7 days.</p>
      <dl class="kv"><dt>Player</dt><dd>${esc(u.full_name || 'No name yet')} · ID ${u.uid} · ${flag(cc)}${esc(u.phone ? phoneFmt(cc, u.phone) : u.email || '')}</dd><dt>They pay by</dt><dd>${gh ? 'Mobile Money' : 'Bank transfer (the account in Payment settings)'}</dd></dl>
      <label class="field"><span>Amount (${SYM[cc]}, optional)</span><input id="rAmt" type="number" min="1" step="0.01" inputmode="decimal" placeholder="Leave empty to let them choose"></label>
      <label class="field"><span>Message to the player (optional)</span><textarea id="rNote" maxlength="300" data-preset="${esc(preset)}" placeholder="e.g. Hi ${esc((u.full_name || '').split(' ')[0] || 'there')}, please use the details below – we confirm it as soon as it arrives."></textarea></label>
      <p class="form-err" id="rErr" hidden></p>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Send to the player</button></div>`);
    if (preset) $('#rNote').value = preset;
    $('#rAmt').focus();
    $('#mGo').onclick = async () => {
      const v = +$('#rAmt').value, note = $('#rNote').value.trim(), body = {};
      if ($('#rAmt').value && !(v > 0)) return $('#rAmt').focus();
      if (v > 0) body.amount = Math.round(v * 100) / 100; if (note) body.note = note;
      try { $('#mGo').disabled = true; await API.admin.depositRequest(id, body); closeModal(); toast('Sent – the player sees it when they open the app, and by email', 'ok'); if (state.page === 'ladder' && !row) render(true); else if (row) render(true); else openUser(id); }
      catch (e) { $('#rErr').textContent = errMsg(e); $('#rErr').hidden = false; $('#mGo').disabled = false; }
    };
  }

  /* ---------- Support: add a deposit for a player whose deposit is not showing ---------- */
  function addDepositModal(id) {
    const u = state.drawerUser && state.drawerUser.id === id ? state.drawerUser : null;
    if (!u) return toast('Open the player first', 'err');
    const cc = u.country, momo = cc === 'GH', pend = (state.drawerPays || []).filter(p => p.kind === 'deposit' && p.status === 'pending');
    openModal(`<h3>Add a deposit for this player</h3>
      <p class="sub">For a player who messaged support because their deposit is not showing. Find the ${momo ? 'MoMo payment' : 'transfer'} in your ${momo ? 'MoMo' : 'bank'} app first – credit it only once you can see the money.</p>
      ${pend.length ? `<div class="banner warn dep-pend"><b>This player already sent ${pend.length === 1 ? 'a deposit request' : pend.length + ' deposit requests'} – confirm ${pend.length === 1 ? 'it' : 'the right one'} instead of adding another:</b>${pend.map(p => `<div>${money(p.amount, cc)}${p.details && p.details.sender ? ' from ' + esc(p.details.sender) : ''} · ${ago(p.created_at)}<button class="btn xs primary" data-pay="approve" data-id="${p.id}">Confirm this one</button></div>`).join('')}</div>` : ''}
      <dl class="kv"><dt>Player</dt><dd>${esc(u.full_name || 'No name yet')} · ID ${u.uid} · reference <span class="mono">LB${String(u.uid).padStart(6, '0')}</span></dd><dt>Method</dt><dd>${momo ? 'Mobile money' : 'Bank transfer'}</dd></dl>
      <label class="field"><span>Amount that arrived (${SYM[cc]})</span><input id="dAmt" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
      <label class="field"><span>Paid by (name on the ${momo ? 'MoMo wallet' : 'sending account'})</span><input id="dSender" maxlength="80" value="${esc(u.full_name || '')}"></label>
      <label class="field"><span>Transfer reference from your ${momo ? 'MoMo' : 'bank'} app (required to credit – each transfer can be credited only once)</span><input id="dRef" maxlength="80" placeholder="${momo ? 'e.g. MoMo transaction ID' : 'e.g. session ID or reference'}"></label>
      <label class="field"><span>Note (optional)</span><input id="dNote" maxlength="200" placeholder="e.g. Player messaged support on WhatsApp"></label>
      <p class="form-err" id="dErr" hidden></p>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn" id="dPend">Add to pending</button><button class="btn primary" id="mGo">Credit now</button></div>`);
    const upd = () => { const v = +$('#dAmt').value; $('#mGo').textContent = v > 0 ? 'Credit ' + money(v, cc) + ' now' : 'Credit now'; };
    $('#dAmt').oninput = upd; upd(); $('#dAmt').focus();
    const send = async credit => {
      const v = Math.round(+$('#dAmt').value * 100) / 100; if (!(v > 0)) return $('#dAmt').focus();
      if (credit && !$('#dRef').value.trim()) { $('#dErr').textContent = 'Enter the transfer reference to credit it now (or add it to pending).'; $('#dErr').hidden = false; return $('#dRef').focus(); }
      const body = { amount: v, credit }, sender = $('#dSender').value.trim(), ref = $('#dRef').value.trim(), note = $('#dNote').value.trim();
      if (sender) body.sender = sender; if (ref) body.reference = ref; if (note) body.note = note;
      $('#mGo').disabled = $('#dPend').disabled = true; $('#dErr').hidden = true;
      try {
        await API.admin.addDeposit(id, body); closeModal();
        toast(credit ? `Deposit of ${money(v, cc)} credited – the player gets a receipt` : 'Added to Payments → Pending', 'ok');
        chips(); if (['payments', 'overview', 'players'].includes(state.page)) render(true); openUser(id);
      } catch (e) { $('#dErr').textContent = errMsg(e); $('#dErr').hidden = false; $('#mGo').disabled = $('#dPend').disabled = false; }
    };
    $('#mGo').onclick = () => send(true); $('#dPend').onclick = () => send(false);
  }

  /* ---------- Payments ---------- */
  // a banner while payouts through the payment API fail (wrong key, account not activated…)
  const depFail = h => !!(h && h.deposits && h.deposits.ok === false && Date.now() - Date.parse(h.deposits.at) < 3 * 86400000);
  const depositBanner = h => depFail(h)
    ? `<div class="banner bad"><b>Moolre deposits are not being confirmed</b> – the last payment check (${when(h.deposits.at)}) was refused: <span class="mono">${esc(h.deposits.message || 'error')}</span>. Deposits stay pending (no player is credited) until Moolre accepts the check. ${/AIN|auth|key/i.test(h.deposits.message || '') ? 'Copy the current <b>public key</b> from the Moolre dashboard (API keys) into the Railway variable <span class="mono">MOOLRE_PUBLIC_KEY</span>, and check <span class="mono">MOOLRE_USER</span> and <span class="mono">MOOLRE_ACCOUNT_NUMBER</span>.' : 'Check the Moolre account and keys.'} Pending deposits are checked again every minute and settle by themselves once it works.</div>`
    : '';
  const payoutBanner = h => h && h.ok === false && Date.now() - Date.parse(h.at) < 3 * 86400000
    ? `<div class="banner bad"><b>Moolre payouts are failing</b> – the last attempt (${when(h.at)}) was refused: <span class="mono">${esc(h.message || 'error')}</span>. ${/AIN0?1|auth/i.test(h.message || '') ? 'The private key in Railway is not accepted: copy the current <b>private key</b> from the Moolre dashboard (API keys) into the Railway variable <span class="mono">MOOLRE_PRIVATE_KEY</span>.' : /AIN0?4|activ/i.test(h.message || '') ? 'API access is not activated on the Moolre account – ask Moolre to activate payouts (transfers) for your API keys.' : 'Check the Moolre account and keys.'} Until then, pay withdrawals by hand and mark them paid. This disappears after the next payout goes through.</div>` : '';
  PAGES.payments = async main => {
    const [status = 'pending', kind = ''] = (state.arg || '').split(':');
    const [rows0, ph] = await Promise.all([API.admin.paymentsQ(status, kind || undefined), API.admin.payoutHealth().catch(() => null)]);
    const rows = keepPays(rows0);
    const seg = (cur, items, fn) => `<div class="seg">${items.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-f="${fn}" data-v="${v}">${l}</button>`).join('')}</div>`;
    main.innerHTML = `
      <div class="page-head"><div><h2>Payments</h2><p>Deposits waiting for you to confirm the money arrived, and withdrawals waiting for payout. Confirm a deposit only when you can see it in the account; mark a withdrawal paid only after you have sent it. Rejecting a withdrawal refunds the player at once. Mobile Money through the payment API settles by itself.</p></div></div>
      ${depositBanner(ph)}${payoutBanner(ph)}
      <div class="card"><div class="toolbar">${seg(status, [['pending', 'Pending'], ['success', 'Done'], ['rejected', 'Rejected'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['all', 'All']], 'status')}${seg(kind, [['', 'Both'], ['withdrawal', 'Withdrawals'], ['deposit', 'Deposits']], 'kind')}<span class="spacer"></span><span class="muted small">${rows.length} shown</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Requested</th><th>Player</th><th>Kind</th><th>Method</th><th class="wrap">Pay to / reference</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td class="muted">${when(p.created_at)}<div class="small">${ago(p.created_at)}</div></td><td><div class="who"><b class="lnk" data-user="${p.user_id}">${esc(p.full_name || phoneFmt(p.country, p.phone))}</b><small>ID ${p.uid} · ${flag(p.country)}${esc(phoneFmt(p.country, p.phone))}</small></div></td>
          <td>${p.kind === 'withdrawal' ? pill('w', { w: ['warn', 'Withdrawal'] }) : pill('d', { d: ['info', 'Deposit'] })}</td><td>${esc(mName(p))}${apiPill(p)}</td><td class="wrap small">${payDetails(p)}</td><td class="r amt ${p.kind === 'deposit' ? 'in' : 'out'}">${money(p.amount, p.country)}</td><td>${payPill(p)}</td>
          <td><div class="acts">${payActs(p)}</div></td></tr>`).join('') || `<tr><td colspan="8"><div class="empty"><b>Nothing here</b>No ${status === 'all' ? '' : status} payments${kind ? ' of this kind' : ''}.</div></td></tr>`}
      </tbody></table></div></div>`;
    $$('#main [data-f]').forEach(b => b.onclick = () => { const s = b.dataset.f === 'status' ? b.dataset.v : status, k = b.dataset.f === 'kind' ? b.dataset.v : kind; location.hash = `#/payments/${s}:${k}`; });
  };
  const payDetails = p => {
    const d = p.details || {}, out = [];
    if (p.kind === 'deposit') {
      if (d.txid) out.push('USSD · transaction <b class="mono">' + esc(d.txid) + '</b>');
      else if (d.sender) out.push('From <b>' + esc(d.sender) + '</b>');
      if (d.phone) out.push(esc((NET[d.network] || d.network || 'MoMo') + ' · 0' + d.phone));
      if (p.provider_ref) out.push('Ref <span class="mono">' + esc(p.provider_ref) + '</span>');
      if (d.claimed) out.push('player said ' + money(d.claimed, p.country));
      if (d.transferRef) out.push('Transfer <span class="mono">' + esc(d.transferRef) + '</span>');
      if (d.source === 'support') out.push('<span class="pill info">Added by support</span>');
    } else {
      if (d.account) out.push('<span class="mono">' + esc(d.account) + '</span>');
      else { if (d.bank) out.push(esc(d.bank)); if (d.acct) out.push('<span class="mono">' + esc(d.acct) + '</span>'); if (d.name) out.push(esc(d.name)); }
      if (d.payoutRef) out.push('Paid ref <span class="mono">' + esc(d.payoutRef) + '</span>');
    }
    if (d.reason && p.status !== 'success') out.push('<span class="muted">' + esc(d.reason) + '</span>');
    if (d.providerReason && p.status !== 'success') out.push('<span class="muted mono">' + esc(d.providerReason) + '</span>');
    if (d.apiError && p.status === 'pending' && !isApiPay(p)) out.push('<span class="pill bad">Not sent: ' + esc(d.apiError) + '</span>');
    return out.join(' · ') || '–';
  };
  // the transfer screenshot a player added (fetched with the session token)
  async function proofInto(box, id) {
    try { const b = await API.admin.proof(id), url = URL.createObjectURL(b); box.innerHTML = `<a href="${url}" target="_blank" rel="noopener" title="Open full size"><img src="${url}" alt="Transfer screenshot"></a>`; }
    catch { box.innerHTML = '<span class="muted small">The screenshot could not be loaded.</span>'; }
  }
  function proofModal(id) {
    const p = state.payRows.get(id) || {};
    openModal(`<h3>Transfer screenshot</h3><p class="sub">${p.uid ? `${esc(p.full_name || 'Player')} · ID ${p.uid} · ${money(p.amount, p.country)}` : ''} – check the amount, the date and the reference against your ${p.method === 'mobile_money' ? 'MoMo' : 'bank'} app before you credit it.</p>
      <div class="proof-box big" id="mProofBig"><span class="muted small">Loading…</span></div>
      <div class="m-actions"><button class="btn" data-close-modal>Close</button>${p.status === 'pending' ? `<button class="btn primary" data-pay="approve" data-id="${id}">Confirm this deposit</button>` : ''}</div>`);
    proofInto($('#mProofBig'), id);
  }
  const payActs = p => {
    if (p.status !== 'pending') { const at = d => d && (d.at || d.paidAt || d.confirmedAt); return `<span class="muted small">${at(p.details) ? 'handled ' + ago(at(p.details)) : ''}</span>`; }
    if (isApiPay(p)) return `<span class="muted small">${p.kind === 'deposit' ? 'Waiting for the player to approve on their phone – credited automatically when the payment is confirmed' : 'Sent – waiting for confirmation (refunded automatically if it fails)'}</span>`;
    // a withdrawal is only paid from the Review screen, after the account checks
    if (p.kind === 'withdrawal') return `<button class="btn xs primary" data-review="${p.id}">Review</button><button class="btn xs danger" data-pay="reject" data-id="${p.id}">Reject</button>`;
    return `${p.has_proof ? `<button class="btn xs" data-proof-view="${p.id}">Screenshot</button>` : ''}<button class="btn xs primary" data-pay="approve" data-id="${p.id}">Confirm</button><button class="btn xs danger" data-pay="reject" data-id="${p.id}">Reject</button>`;
  };

  /* Withdrawal review: the account checks (lib/withdrawals.js), then Approve & send / Mark paid / Reject. Red flags
     must be acknowledged before anything can be paid; the server enforces it for API payouts and records it. */
  const KYC_PILL = { verified: ['ok', 'Verified'], pending: ['warn', 'Waiting'], rejected: ['bad', 'Rejected'], none: ['bad', 'Not verified'] };
  const NAME_PILL = { match: ['ok', 'Matches the player'], partial: ['warn', 'Partly matches'], mismatch: ['bad', 'Does not match'], unknown: ['', 'Not compared'] };
  async function reviewModal(id, refresh) {
    openModal('<div class="loading">Checking the account…</div>');
    let c;
    try { c = await API.admin.paymentChecks(id, refresh); } catch (e) { closeModal(); return toast(errMsg(e), 'err'); }
    const p = c.payment, pl = c.player, m = c.money, cc = pl.country || 'GH', n = c.number;
    if (p.status !== 'pending') { closeModal(); render(true); return toast('This withdrawal was already handled', 'ok'); }
    const momo = !c.momo ? '–' : c.momo.status === 'found' ? `<b>${esc(c.momo.name)}</b> ${pill(c.momo.match, NAME_PILL)}`
      : c.momo.status === 'not_found' ? '<span class="pill bad">No MoMo wallet on this number</span>' : `<span class="muted">${esc(c.momo.reason || 'Lookup unavailable')}</span>`;
    const api = p.method === 'mobile_money' && state.api && state.api.enabled;
    const payTo = p.details.account || [p.details.bank, p.details.acct, p.details.name].filter(Boolean).join(' · ') || '–';
    openModal(`<h3>Review withdrawal · ${money(p.amount, cc)}</h3><p class="sub">Check the account before paying. Nothing is paid until you approve it here; rejecting returns the money to the player.</p>
      <div class="rv-flags">${c.flags.length ? c.flags.map(f => `<div class="rv-flag ${f.level}">${f.level === 'bad' ? '✕' : '!'} ${esc(f.text)}</div>`).join('') : '<div class="rv-flag ok">✓ No flags – the account checks are clean</div>'}</div>
      <dl class="kv">
        <dt>Pay to</dt><dd><span class="mono">${esc(payTo)}</span>${p.details.name ? ` · name given: ${esc(p.details.name)}` : ''}</dd>
        ${c.momo ? `<dt>MoMo name</dt><dd>${momo} <button class="btn xs" id="rvRefresh">Check again</button></dd>` : ''}
        <dt>Player</dt><dd>${esc(pl.name || '–')} · ID ${pl.uid} · ${esc(pl.phone ? phoneFmt(cc, pl.phone) : pl.email || '')} · joined ${when(pl.createdAt)}</dd>
        <dt>Account</dt><dd>${esc(String(pl.status).replace('_', ' '))}</dd>
        <dt>Deposits</dt><dd>${money(m.deposits, cc)} <span class="muted">(${m.depositCount})</span>${m.lastDepositAt ? ` · last ${ago(m.lastDepositAt)}` : ''}</dd>
        <dt>Withdrawn</dt><dd>${money(m.withdrawn, cc)} <span class="muted">(${m.withdrawCount} paid)</span>${m.pendingCount ? ` · <b>${m.pendingCount} more waiting</b> (${money(m.pending, cc)})` : ''}</dd>
        <dt>Staked</dt><dd>${money(m.staked, cc)} in total · ${money(m.stakedSinceDeposit, cc)} since the last deposit</dd>
        <dt>Balance</dt><dd>${money(m.balance, cc)} ${m.ledgerOk ? '<span class="pill ok">matches the ledger</span>' : '<span class="pill bad">does not match the ledger</span>'}</dd>
        ${n ? `<dt>This number</dt><dd>${n.depositsFromIt ? `${n.depositsFromIt} deposit${n.depositsFromIt === 1 ? '' : 's'} from it by this player` : 'never deposited from by this player'}${n.otherAccounts.length ? ` · <b>also used by ID ${n.otherAccounts.map(esc).join(', ')}</b>` : ' · no other account uses it'}</dd>` : ''}
      </dl>
      ${c.bad ? '<label class="chk"><input type="checkbox" id="rvOverride"> I have checked the red flags above and still approve this payout</label>' : ''}
      <div class="m-actions"><button class="btn danger" id="rvReject">Reject</button><span class="spacer"></span><button class="btn" id="rvManual">Mark paid (sent by hand)</button>${api ? `<button class="btn primary" id="rvSend">Approve &amp; send via ${esc(apiName())}</button>` : ''}</div>`);
    const allowed = () => !c.bad || $('#rvOverride').checked;
    const sync = () => { for (const b of [$('#rvSend'), $('#rvManual')]) if (b) b.disabled = !allowed(); };
    if (c.bad) { $('#rvOverride').onchange = sync; sync(); }
    const review = () => ({ reviewed: true, override: !!c.bad });
    if ($('#rvRefresh')) $('#rvRefresh').onclick = () => reviewModal(id, true);
    $('#rvReject').onclick = () => payAction(id, 'reject');
    $('#rvManual').onclick = () => { if (allowed()) payAction(id, 'approve', review()); };
    if ($('#rvSend')) $('#rvSend').onclick = async () => {
      if (!allowed()) return;
      try { $('#rvSend').disabled = true; $('#rvSend').textContent = 'Sending…'; const r = await API.admin.payout(id, review()); closeModal(); toast(r.status === 'success' ? 'Paid' : `Sent – waiting for ${apiName()} to confirm`, 'ok'); chips(); render(true); if (state.drawer && state.drawer.type === 'user') openUser(state.drawer.id); }
      catch (e) { toast(errMsg(e), 'err'); closeModal(); render(true); }
    };
  }

  function payAction(id, action, review) {
    const p = state.payRows.get(id) || {}, approve = action === 'approve', dep = p.kind === 'deposit', cc = p.country || 'NG';
    const quick = approve ? [] : dep ? ['No transfer received', 'The amount does not match the transfer', 'The sender name does not match'] : ['The account name does not match yours', 'The account details are not valid', 'Please verify your ID first'];
    openModal(`<h3>${approve ? (dep ? 'Confirm this deposit' : 'Mark this withdrawal as paid') : (dep ? 'Reject this deposit' : 'Reject this withdrawal')}</h3>
      <p class="sub">${approve ? (dep ? 'Only confirm once you can see the money in the account. The player is credited at once (with their Deposit 1 · 2 · 3 bonus when it applies) and gets a receipt by email.' : 'Only mark it paid after the money has left your account. The player gets an email.') : (dep ? 'The player is told by email with your reason.' : 'The player is told by email and the money goes back to their balance at once.')}</p>
      ${p.id ? `<dl class="kv"><dt>Player</dt><dd>${esc(p.full_name || phoneFmt(cc, p.phone))} · ID ${p.uid}</dd><dt>${dep ? 'Amount sent' : 'Amount'}</dt><dd><b>${money(p.amount, cc)}</b></dd><dt>${dep ? 'Details' : 'Pay to'}</dt><dd>${payDetails(p)}</dd></dl>` : ''}
      ${approve && dep ? `<label class="field"><span>Amount that arrived (${SYM[cc] || ''})</span><input id="mAmt" type="number" step="0.01" min="0.01" value="${p.amount || ''}"></label>` : ''}
      ${approve && dep && p.has_proof ? '<div class="proof-box" id="mProof"><span class="muted small">Loading the screenshot…</span></div>' : ''}
      ${approve && dep ? '<label class="field"><span>Transfer reference from your bank or MoMo app (required – each transfer can be credited only once)</span><input id="mRef" placeholder="e.g. the session ID or transaction ID" value="' + esc((p.details && p.details.txid) || '') + '"></label>' : ''}
      ${approve && !dep ? '<label class="field"><span>Payout reference (optional)</span><input id="mRef" placeholder="Bank or MoMo transaction ID"></label>' : ''}
      ${approve ? '<label class="field"><span>Note (optional)</span><input id="mNote"></label>' : `<div class="quick">${quick.map(x => `<button type="button" class="btn xs" data-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div><label class="field"><span>Reason shown to the player</span><input id="mReason"></label>`}
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn ${approve ? 'primary' : 'danger solid'}" id="mGo">${approve ? (dep ? 'Credit the player' : 'Mark paid') : 'Reject'}</button></div>`);
    $$('#modalBody [data-quick]').forEach(b => b.onclick = () => { $('#mReason').value = b.dataset.quick; });
    if (approve && dep && p.has_proof) proofInto($('#mProof'), id);
    if (approve && dep) { const upd = () => { const v = +$('#mAmt').value; $('#mGo').textContent = v > 0 ? 'Credit ' + money(v, cc) : 'Credit the player'; }; $('#mAmt').oninput = upd; upd(); }
    $('#mGo').onclick = async () => {
      const body = {};
      if (approve) {
        if (dep) { const v = +$('#mAmt').value; if (!(v > 0)) return $('#mAmt').focus(); if (Math.abs(v - Number(p.amount)) > 0.001) body.amount = v; if (!$('#mRef').value.trim()) { toast('Enter the transfer reference first', 'err'); return $('#mRef').focus(); } }
        if (dep) { const r = $('#mRef').value.trim(); if (r) body.reference = r; }
        else { const r = $('#mRef').value.trim(); if (r) body.reference = r; if (review) Object.assign(body, review); }
        const n = $('#mNote').value.trim(); if (n) body.note = n;
      } else { const r = $('#mReason').value.trim(); if (!r) return $('#mReason').focus(); body.reason = r; }
      try { $('#mGo').disabled = true; await API.admin.payment(id, action, body); closeModal(); toast(approve ? (dep ? 'Deposit confirmed – player credited' : 'Withdrawal marked as paid') : 'Payment rejected', 'ok'); chips(); render(true); if (state.drawer && state.drawer.type === 'user') openUser(state.drawer.id); }
      catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; if (e.message === 'not_pending') { closeModal(); render(true); } }
    };
  }


  /* ---------- Bets ---------- */
  PAGES.bets = async main => {
    const [status = '', q = ''] = (state.arg || '').split(':').map(decodeURIComponent);
    const rows = await API.admin.betsQ(status || undefined, q || undefined);
    const cc = state.me.country;
    const tot = rows.reduce((a, b) => { a.stake += Number(b.stake); a.pot += b.status === 'open' ? Number(b.potential) : 0; return a; }, { stake: 0, pot: 0 });
    main.innerHTML = `
      <div class="page-head"><div><h2>Bets</h2><p>Sports tickets, newest first. Open a ticket to see its legs; void an open ticket to refund the stake.</p></div>
        <div class="page-actions"><span class="chip">Shown stake ${compact(tot.stake, cc)}</span><span class="chip warn">Open potential ${compact(tot.pot, cc)}</span></div></div>
      <div class="card"><div class="toolbar"><div class="seg">${[['', 'All'], ['open', 'Open'], ['won', 'Won'], ['lost', 'Lost'], ['cashout', 'Cashed out'], ['void', 'Void']].map(([v, l]) => `<button class="${v === status ? 'on' : ''}" data-st="${v}">${l}</button>`).join('')}</div>
        <form class="search" id="bq"><i>${IC.search}</i><input placeholder="Ticket, phone or player ID" value="${esc(q)}"></form><span class="spacer"></span><span class="muted small">${rows.length} shown</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Player</th><th>Type</th><th class="r">Stake</th><th class="r">Odds</th><th class="r">Potential</th><th>Status</th><th class="r">Paid</th><th>Placed</th><th></th></tr></thead><tbody>
        ${rows.map(b => `<tr class="click" data-bet="${esc(b.id)}"><td class="id">${esc(b.id)}</td><td><div class="who"><b>${esc(phoneFmt(b.country, b.phone))}</b><small>ID ${b.uid}</small></div></td><td>${b.type === 'multiple' ? `Multiple · ${b.legs} legs` : 'Single'}${b.boost_pct ? ` <span class="pill gold plain">+${b.boost_pct}%</span>` : ''}</td>
          <td class="r">${money(b.stake, b.country)}</td><td class="r">${Number(b.odds).toFixed(2)}</td><td class="r">${money(b.potential, b.country)}</td><td>${pill(b.status, P_BET)}</td><td class="r amt ${Number(b.paid) > 0 ? 'in' : ''}">${b.paid != null ? money(b.paid, b.country) : '–'}</td><td class="muted">${when(b.placed_at)}</td>
          <td><div class="acts">${b.status === 'open' ? `<button class="btn xs danger" data-void="${esc(b.id)}">Void</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="10"><div class="empty"><b>No bets</b>Nothing matches this filter.</div></td></tr>'}
      </tbody></table></div></div>`;
    $$('#main [data-st]').forEach(x => x.onclick = () => { location.hash = `#/bets/${x.dataset.st}:${encodeURIComponent(q)}`; });
    $('#bq').onsubmit = e => { e.preventDefault(); location.hash = `#/bets/${status}:${encodeURIComponent($('#bq input').value.trim())}`; };
  };
  async function openBet(id) {
    openDrawer('<div class="loading">Loading ticket…</div>');
    const { bet: b, legs } = await API.admin.bet(id); const cc = b.country;
    $('#drawerBody').innerHTML = `
      <div class="d-head"><div><h3>Ticket ${esc(b.id)}</h3><p>${b.type === 'multiple' ? `Multiple · ${legs.length} legs` : 'Single'}${b.boost_pct ? ` · win boost +${b.boost_pct}%` : ''} · placed ${when(b.placed_at)}</p></div></div>
      <div class="d-actions">${pill(b.status, P_BET)} <span class="lnk" data-user="${b.user_id}">${esc(phoneFmt(cc, b.phone))} · ID ${b.uid}</span></div>
      <div class="stat-row"><div class="stat"><small>Stake</small><b>${money(b.stake, cc)}</b></div><div class="stat"><small>Total odds</small><b>${Number(b.odds).toFixed(2)}</b></div><div class="stat"><small>Potential</small><b>${money(b.potential, cc)}</b></div><div class="stat"><small>Paid</small><b>${b.paid != null ? money(b.paid, cc) : '–'}</b></div></div>
      ${b.status === 'open' ? `<div class="d-actions"><button class="btn sm danger" data-void="${esc(b.id)}">Void ticket and refund stake</button></div>` : ''}
      <div class="section-t">Selections</div>
      <table class="mini"><thead><tr><th>Match</th><th>Market · pick</th><th class="r">Odd</th><th>Result</th></tr></thead><tbody>
        ${legs.map(l => `<tr><td><span class="lnk" data-event="${l.event_id}">${esc(l.match_name)}</span><div class="muted small">${l.ev_status === 'finished' ? `FT ${l.score_home}–${l.score_away}` : l.ev_status === 'live' ? `live ${l.score_home}–${l.score_away}` : when(l.kickoff)}</div></td><td>${esc(l.market_name)}<div class="muted small">${esc(l.label)}</div></td><td class="r">${Number(l.odd).toFixed(2)}</td><td>${l.result ? pill(l.result, { won: ['ok', 'Won'], lost: ['bad', 'Lost'], void: ['warn', 'Void'] }) : '<span class="muted">pending</span>'}</td></tr>`).join('')}
      </tbody></table>`;
    state.drawer = { type: 'bet', id };
  }
  function voidBet(id) {
    openModal(`<h3>Void ticket ${esc(id)}?</h3><p class="sub">The full stake goes back to the player's wallet and the ticket is closed as void. This cannot be undone.</p><div class="m-actions"><button class="btn" data-close-modal>Keep it</button><button class="btn danger solid" id="mGo">Void and refund</button></div>`);
    $('#mGo').onclick = async () => { try { $('#mGo').disabled = true; await API.admin.voidBet(id); closeModal(); toast('Ticket voided and refunded', 'ok'); render(true); if (state.drawer && state.drawer.type === 'bet') openBet(id); } catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; } };
  }

  /* ---------- Trading desk ---------- */
  PAGES.trading = async main => {
    const [status = 'open', q = ''] = (state.arg || '').split(':').map(decodeURIComponent);
    const rows = await API.admin.events(status, q || undefined);
    const cc = state.me.country, f = state.feed || {};
    main.innerHTML = `
      <div class="page-head"><div><h2>Trading desk</h2><p>Every event on the book with its markets and open exposure. Suspend a market during a key moment, correct a price, or enter a result when the feed cannot.</p></div>
        <div class="page-actions"><span class="chip ${(f.provider || 'demo') === 'demo' ? 'warn' : 'ok'}"><i class="dot"></i>${(f.provider || 'demo') === 'demo' ? 'Demo odds feed' : 'Feed: ' + esc(f.provider)}</span><button class="btn primary" id="addMatch">${IC.plus} Add match</button></div></div>
      <div class="card"><div class="toolbar"><div class="seg">${[['open', 'Open'], ['live', 'Live'], ['scheduled', 'Upcoming'], ['finished', 'Finished'], ['cancelled', 'Cancelled']].map(([v, l]) => `<button class="${v === status ? 'on' : ''}" data-st="${v}">${l}</button>`).join('')}</div>
        <form class="search" id="eq"><i>${IC.search}</i><input placeholder="Team, league or event ID" value="${esc(q)}"></form><span class="spacer"></span><span class="muted small">${rows.length} events</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Event</th><th>Kick-off</th><th>Status</th><th class="r">Markets</th><th class="r">Exposure</th><th></th></tr></thead><tbody>
        ${rows.map(e => `<tr class="click" data-event="${e.id}"><td><div class="who"><b>${esc(e.home)} – ${esc(e.away)}</b><small>${esc(e.country)} · ${esc(e.league)} · ID ${e.id}${e.ext_id && !e.ext_id.startsWith('demo:') ? ' · ' + esc(e.ext_id.split(':')[0]) : ''}</small></div></td><td class="muted">${when(e.kickoff)}</td>
          <td>${e.status === 'live' ? `${pill('live', P_EV)} <b class="num">${e.minute}' ${e.score_home}–${e.score_away}</b>` : e.status === 'finished' ? `${pill(e.status, P_EV)} <span class="num">${e.score_home}–${e.score_away}</span>` : pill(e.status, P_EV)}</td>
          <td class="r">${int(e.markets)}${e.suspended ? ` <span class="pill bad plain">${e.suspended} off</span>` : ''}</td><td class="r"><span class="amt">${e.liability ? compact(e.liability, cc) : '–'}</span>${e.open_legs ? `<div class="small muted">${int(e.open_legs)} open legs</div>` : ''}</td>
          <td><div class="acts">${e.status !== 'finished' && e.status !== 'cancelled' ? `<button class="btn xs" data-event="${e.id}">Markets</button><button class="btn xs" data-result="${e.id}">Result</button>` : `<button class="btn xs" data-event="${e.id}">View</button>`}</div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty"><b>No events</b>Nothing matches this filter.</div></td></tr>'}
      </tbody></table></div></div>`;
    $$('#main [data-st]').forEach(x => x.onclick = () => { location.hash = `#/trading/${x.dataset.st}:${encodeURIComponent(q)}`; });
    $('#eq').onsubmit = e => { e.preventDefault(); location.hash = `#/trading/${status}:${encodeURIComponent($('#eq input').value.trim())}`; };
    $('#addMatch').onclick = () => addMatchModal().catch(e => toast(errMsg(e), 'err'));
  };

  /* ---------- Hand-added matches: crests, flags, Add match, live scoring ---------- */
  // country / region names for every flag the site has (betting/img/flags), from the browser's own list
  const SPECIAL_REGIONS = { 'gb-eng': 'England', 'gb-sct': 'Scotland', 'gb-wls': 'Wales', 'gb-nir': 'Northern Ireland', eu: 'Europe', un: 'United Nations', arab: 'Arab League',
    cefta: 'CEFTA', eac: 'East African Community', xk: 'Kosovo', pc: 'Pacific Community', 'sh-ac': 'Ascension Island', 'sh-hl': 'Saint Helena', 'sh-ta': 'Tristan da Cunha', world: 'International' };
  let regionNames = null; try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch {}
  const regionName = c => SPECIAL_REGIONS[c] || (() => { try { return regionNames && /^[a-z]{2}$/.test(c) ? regionNames.of(c.toUpperCase()) : c.toUpperCase(); } catch { return c.toUpperCase(); } })();
  let FLAG_LIST = null;
  const flagList = async () => FLAG_LIST || (FLAG_LIST = (await API.admin.flags()).map(code => ({ code, name: regionName(code) })).sort((a, b) => a.name.localeCompare(b.name)));
  const flagImg = code => code && code !== 'world' ? `<img class="fl-img" src="img/flags/${esc(code)}.svg" alt="">` : '<span class="fl-img fl-none"></span>';
  /** A searchable list of every flag inside `host`; onPick(code). */
  async function flagPicker(host, onPick) {
    const list = await flagList();
    host.hidden = false;
    host.innerHTML = `<input class="fp-q" placeholder="Search a country or region…" autocomplete="off"><div class="fp-list"></div>`;
    const box = host.querySelector('.fp-list'), q = host.querySelector('.fp-q');
    const draw = v => { const t = v.trim().toLowerCase(); box.innerHTML = list.filter(f => !t || f.name.toLowerCase().includes(t) || f.code === t).slice(0, 90)
      .map(f => `<button type="button" class="fp-it" data-fp="${esc(f.code)}">${flagImg(f.code)}<span>${esc(f.name)}</span></button>`).join('') || '<p class="muted small">Nothing found</p>'; };
    draw(''); q.oninput = () => draw(q.value); q.focus();
    box.onclick = e => { const b = e.target.closest('[data-fp]'); if (b) { host.hidden = true; onPick(b.dataset.fp); } };
  }
  const teamInitials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const tileHTML = (logo, name) => (logo ? `<img src="${esc(logo)}" alt="">` : `<span>${esc(teamInitials(name))}</span>`);
  /** Shrink an image file to ≤160 px and ≤44 KB (WebP, else PNG) as a data URL. */
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This file is not an image we can read.')); i.src = url; });
      const W = img.naturalWidth || 160, H = img.naturalHeight || 160;
      for (const size of [160, 128, 96]) {
        const k = Math.min(1, size / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
        const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }); cv.getContext('2d').drawImage(img, 0, 0, w, h);
        for (const [type, qual] of [['image/webp', 0.9], ['image/png'], ['image/webp', 0.7]]) {
          const d = cv.toDataURL(type, qual);
          if (d.startsWith('data:' + type) && d.length * 0.75 < 44000) return d;
        }
      }
      throw new Error('This image is too large even after shrinking – use a simpler logo.');
    } finally { URL.revokeObjectURL(url); }
  }
  /** Crest tile + Upload / Flag / Link / Find for one team. getName() = the team name now; the crest is remembered
   *  for that name, so every match of the team shows it. */
  function crestEditor(box, getName, logo) {
    box.classList.add('ct');
    box.innerHTML = `<div class="ct-tile" title="Crest">${tileHTML(logo, getName())}</div>
      <div class="ct-acts"><button type="button" class="btn xs" data-ct="upload">Upload</button><button type="button" class="btn xs" data-ct="flag">Flag</button><button type="button" class="btn xs" data-ct="link">Link</button><button type="button" class="btn xs" data-ct="find">Find</button>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div>
      <div class="ct-pop" hidden></div>`;
    const tile = box.querySelector('.ct-tile'), pop = box.querySelector('.ct-pop'), file = box.querySelector('input[type=file]');
    const show = url => { logo = url; tile.innerHTML = tileHTML(url, getName()); };
    const named = () => { const n = getName().trim(); if (n.length < 2) { toast('Type the team name first', 'err'); return null; } return n; };
    const run = async (fn, okMsg) => {
      tile.classList.add('busy');
      try { const r = await fn(); if (r && r.logo) { show(r.logo); toast(okMsg, 'ok'); } else toast('No crest found for this name – upload one or use a flag', 'err'); }
      catch (e) { toast(errMsg(e), 'err'); } finally { tile.classList.remove('busy'); }
    };
    box.querySelector('.ct-acts').onclick = e => {
      const b = e.target.closest('[data-ct]'); if (!b) return;
      const n = named(); if (!n) return;
      const k = b.dataset.ct;
      if (k === 'upload') return file.click();
      if (k === 'find') return run(() => API.admin.crestFind(n), 'Crest found');
      if (k === 'flag') return flagPicker(pop, code => run(() => API.admin.crestFlag(n, code), 'Flag set as the crest'));
      pop.hidden = false;
      pop.innerHTML = '<div class="ct-link"><input placeholder="https://…/crest.png" autocomplete="off"><button type="button" class="btn xs primary">Use</button></div>';
      const i = pop.querySelector('input'); i.focus();
      pop.querySelector('button').onclick = () => { const u = i.value.trim(); if (!/^https:\/\/\S{6,}$/.test(u)) return toast('Use an https:// link to an image', 'err'); pop.hidden = true; run(() => API.admin.crestLink(n, u), 'Crest saved'); };
    };
    file.onchange = async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      const n = named(); if (!n) return;
      try { const d = await shrinkImage(f); await run(() => API.admin.crestUpload(n, d), 'Crest uploaded'); } catch (e) { toast(e.message, 'err'); }
    };
    return { show };
  }
  /** Type-ahead from teams already seen (with their crests) for a team input; keeps the crest tile in step. */
  function teamInput(input, list, editor) {
    const known = new Map(); let t = 0;
    const look = async () => { try { const rows = await API.admin.teams(input.value.trim()); rows.forEach(r => known.set(r.name, r.logo || null)); list.innerHTML = rows.map(r => `<option value="${esc(r.name)}"></option>`).join(''); sync(); } catch {} };
    const sync = () => { const v = input.value.trim(); editor.show(known.has(v) ? known.get(v) : null); };
    input.addEventListener('input', () => { sync(); clearTimeout(t); t = setTimeout(look, 220); });
    look();
  }
  const pad2 = n => String(n).padStart(2, '0');
  const localInput = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  function kickoffChips() {
    const now = new Date(), out = [], at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
    const add = (label, d) => { if (d - now > 10 * 60000 && !out.some(o => +o[1] === +d)) out.push([label, d]); };
    add('In 1 hour', new Date(Math.ceil((now.getTime() + 3600e3) / 9e5) * 9e5));
    [13, 15, 16, 18, 20].forEach(h => add(`Today ${h}:00`, at(now, h)));
    const tom = new Date(now.getTime() + 864e5); [15, 18].forEach(h => add(`Tomorrow ${h}:00`, at(tom, h)));
    for (let i = 2; i <= 7; i++) { const d = new Date(now.getTime() + i * 864e5); if (d.getDay() === 6 || d.getDay() === 0) add(`${d.toLocaleDateString([], { weekday: 'short' })} 15:00`, at(d, 15)); }
    return out.slice(0, 8);
  }

  // A real fixture the odds feed does not carry. The admin sets the teams (crests), the kick-off and the 1X2; the
  // server prices every other full-time market from it. Betting closes at kick-off; settle with the real score.
  async function addMatchModal(pre = {}) {
    const leagues = await API.admin.leagues();
    let lgSel = pre.leagueId ? String(pre.leagueId) : pre.leagueName ? String((leagues.find(l => l.name === pre.leagueName && l.country === pre.leagueCountry) || {}).id || '') : '';
    let newFlag = 'gh';
    const ko0 = pre.ko || (() => { const d = new Date(Date.now() + 3 * 3600e3); d.setMinutes(0, 0, 0); return localInput(d); })();
    const odd = (id, l) => `<label class="field"><span>${l}</span><input id="${id}" type="number" inputmode="decimal" step="0.01" min="1.01" max="100" placeholder="e.g. 2.10"></label>`;
    const team = side => `<div class="am-team"><div class="am-crest" id="mCr${side}"></div><label class="field"><span>${side === 'H' ? 'Home team' : 'Away team'}</span><input id="m${side === 'H' ? 'Home' : 'Away'}" maxlength="60" list="mTeams${side}" autocomplete="off" placeholder="Type or pick a team"><datalist id="mTeams${side}"></datalist></label></div>`;
    openModal(`<h3>Add a match</h3><p class="sub">A real fixture the odds feed does not carry. Pick the teams (their crests are remembered), the kick-off and your 1X2 odds; every other full-time market is priced from them. Betting closes at kick-off. Score it live from the match drawer if you like, then settle it with the real final score.</p>
      <div class="am-lg"><span class="am-lgflag" id="mLgFlagShow"></span><label class="field"><span>League</span><select id="mLg"><option value="">Choose a league…</option>${leagues.map(l => `<option value="${l.id}" ${String(l.id) === lgSel ? 'selected' : ''}>${esc(l.country)} · ${esc(l.name)}</option>`).join('')}<option value="new">+ New league…</option></select></label></div>
      <div id="mNewLg" hidden><div class="field-row"><label class="field"><span>League name</span><input id="mLgName" maxlength="60" placeholder="e.g. Division One League"></label><label class="field"><span>Country / region</span><input id="mLgCountry" maxlength="40" placeholder="e.g. Ghana"></label></div>
        <div class="am-flagpick"><span>Flag</span><button type="button" class="btn sm" id="mFlagBtn"></button></div><div class="ct-pop" id="mFlagPop" hidden></div></div>
      <div class="am-teams">${team('H')}<span class="am-vs">vs</span>${team('A')}</div>
      <label class="field"><span>Kick-off (your local time)</span><input id="mKo" type="datetime-local" value="${esc(ko0)}"></label>
      <div class="ko-chips">${kickoffChips().map(([l, d]) => `<button type="button" class="btn xs" data-ko="${localInput(d)}">${esc(l)}</button>`).join('')}</div>
      <div class="field-row">${odd('mO1', 'Home win (1)')}${odd('mOX', 'Draw (X)')}${odd('mO2', 'Away win (2)')}</div>
      <p class="help" id="mPrev">Enter the three prices to see the margin and some of the markets priced from them.</p>
      <label class="chk am-live"><input type="checkbox" id="mLive" checked><span><b>Live betting during the match</b><small>Opens by itself at kick-off; stays open while you keep the score on the Live desk.</small></span></label>
      <p class="form-err" id="mErr" hidden></p>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Add match</button></div>`);
    const lgFlag = () => { const v = $('#mLg').value, l = leagues.find(x => String(x.id) === v); $('#mLgFlagShow').innerHTML = v === 'new' ? flagImg(newFlag) : l ? flagImg(l.flag) : ''; };
    const flagBtn = () => { $('#mFlagBtn').innerHTML = `${flagImg(newFlag)}<span>${esc(regionName(newFlag))}</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`; lgFlag(); };
    $('#mLg').onchange = () => { $('#mNewLg').hidden = $('#mLg').value !== 'new'; lgFlag(); };
    $('#mFlagBtn').onclick = () => flagPicker($('#mFlagPop'), code => { newFlag = code; if (!$('#mLgCountry').value.trim()) $('#mLgCountry').value = regionName(code); flagBtn(); });
    flagBtn(); lgFlag();
    const edH = crestEditor($('#mCrH'), () => $('#mHome').value), edA = crestEditor($('#mCrA'), () => $('#mAway').value);
    teamInput($('#mHome'), $('#mTeamsH'), edH); teamInput($('#mAway'), $('#mTeamsA'), edA);
    $$('#modalBody [data-ko]').forEach(b => b.onclick = () => { $('#mKo').value = b.dataset.ko; $$('#modalBody [data-ko]').forEach(x => x.classList.toggle('primary', x === b)); });
    const odds = () => ({ home: +$('#mO1').value, draw: +$('#mOX').value, away: +$('#mO2').value });
    let timer = 0, seq = 0;
    const preview = () => {
      clearTimeout(timer);
      const o = odds(); if (!(o.home >= 1.01 && o.draw >= 1.01 && o.away >= 1.01)) { $('#mPrev').textContent = 'Enter the three prices to see the margin and some of the markets priced from them.'; return; }
      timer = setTimeout(async () => {
        const n = ++seq;
        try {
          const r = await API.admin.previewMatch(o); if (n !== seq) return;
          const pick = (k, o2) => { const m = r.sample.find(x => x.key === k); const v = m && m.outcomes[o2]; return v && v.o ? Number(v.o).toFixed(2) : '–'; };
          $('#mPrev').innerHTML = `Margin <b>${r.margin}%</b> · ${r.markets} markets · e.g. 1X ${pick('dc', '1X')} · X2 ${pick('dc', 'X2')} · Over 2.5 ${pick('ou', 'o2.5')} · Under 2.5 ${pick('ou', 'u2.5')} · Both score ${pick('gg', 'gg')}`;
        } catch (e) { if (n === seq) $('#mPrev').textContent = errMsg(e); }
      }, 250);
    };
    ['#mO1', '#mOX', '#mO2'].forEach(s => { $(s).oninput = preview; });
    $('#mGo').onclick = async () => {
      const er = $('#mErr'), show = m => { er.textContent = m; er.hidden = false; }; er.hidden = true;
      const lg = $('#mLg').value, home = $('#mHome').value.trim(), away = $('#mAway').value.trim(), when0 = new Date($('#mKo').value), o = odds();
      if (!lg) return show('Pick a league (or add a new one).');
      const league = lg === 'new' ? { name: $('#mLgName').value.trim(), country: $('#mLgCountry').value.trim(), flag: newFlag } : { id: +lg };
      if (lg === 'new' && (league.name.length < 2 || league.country.length < 2)) return show('Give the new league a name and a country.');
      if (home.length < 2 || away.length < 2) return show('Enter both team names.');
      if (isNaN(when0)) return show('Set the kick-off date and time.');
      if (!(o.home >= 1.01 && o.draw >= 1.01 && o.away >= 1.01)) return show('Enter the three 1X2 prices (1.01 or more).');
      try {
        $('#mGo').disabled = true;
        const r = await API.admin.createMatch({ league, home, away, kickoff: when0.toISOString(), odds: o, inplay: $('#mLive') ? $('#mLive').checked : true });
        const again = lg === 'new' ? { leagueName: league.name, leagueCountry: league.country, ko: $('#mKo').value } : { leagueId: +lg, ko: $('#mKo').value };
        $('#modalBody').innerHTML = `<div class="am-done"><div class="am-done-ic">${IC.check}</div><h3>Match added</h3>
          <p class="sub">${esc(home)} vs ${esc(away)} · ${when(when0)} · ID ${r.id} · ${r.markets} markets open until kick-off.${r.homeLogo && r.awayLogo ? '' : ' Missing crests are being looked up; you can also set them in the match.'}</p>
          <div class="m-actions"><button class="btn" data-close-modal>Done</button><button class="btn" id="mOpen">Open the match</button><button class="btn primary" id="mAgain">Add another in this league</button></div></div>`;
        $('#mOpen').onclick = () => { closeModal(); openEvent(r.id); };
        $('#mAgain').onclick = () => addMatchModal(again).catch(e => toast(errMsg(e), 'err'));
        render(true);
      } catch (e) { show(errMsg(e)); $('#mGo').disabled = false; }
    };
  }

  /** Hand-added match in the drawer: crests for both teams and, once it has kicked off, live scoring. */
  function manualPanel(e) {
    const started = new Date(e.kickoff) <= new Date(), open = e.status === 'scheduled' || e.status === 'live';
    const per = e.period || 'H1', st = e.stats || {};
    const side = (name, logo, sc, k) => `<div class="lsc-row"><span class="lsc-team"><span class="lsc-crest">${tileHTML(logo, name)}</span><b>${esc(name)}</b></span>
      <button class="btn sm" data-lsc="${k}-" aria-label="Take a goal back">−</button><b class="lsc-sc">${sc}</b><button class="btn sm primary" data-lsc="${k}+">+ Goal</button></div>`;
    return `<div class="section-t">Teams &amp; crests <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· remembered for every match of the team</span></div>
      <div class="tm-crests"><div class="tm-c"><b>${esc(e.home)}</b><div data-crest-ed="home"></div></div><div class="tm-c"><b>${esc(e.away)}</b><div data-crest-ed="away"></div></div></div>
      ${!open ? '' : !started ? '<p class="muted small" style="margin:12px 0">Live scoring opens at kick-off.</p>' : `
      <div class="section-t">Live scoring <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· players see the score and a running clock</span></div>
      <div class="lsc-bet ${st.inplay ? 'on' : ''}"><div><b>Live betting ${st.inplay ? 'ON' : 'OFF'}</b><small>${st.inplay ? 'Markets are open while you keep the score up to date: enter every goal, or tap <b>Score is still</b> at least every 3 minutes. If you stop, betting closes by itself. A goal pauses betting for 10 seconds.' : 'Turn on to let players bet while the match plays – only if you are following it live.'}</small>
        ${st.inplay ? `<span class="lsc-left" data-lsc-left="${esc(st.scoreAt || '')}"></span>` : ''}</div>
        <div class="acts">${st.inplay ? `<button class="btn sm primary" data-lsc-ok>Score is still ${e.score_home}–${e.score_away} ✓</button>` : ''}<button class="btn sm ${st.inplay ? 'danger' : 'primary'}" data-lsc-bet="${st.inplay ? 'off' : 'on'}">${st.inplay ? 'Stop live betting' : 'Turn on live betting'}</button></div></div>
      <div class="lsc">${side(e.home, e.home_logo, e.score_home, 'h')}${side(e.away, e.away_logo, e.score_away, 'a')}
        <div class="seg lsc-per">${[['H1', '1st half'], ['HT', 'Half-time'], ['H2', '2nd half']].map(([v, l]) => `<button data-lsp="${v}" class="${per === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${st.liveScoring ? `<p class="muted small">Clock: ${per === 'HT' ? 'half-time' : `${e.minute}'`} · goals: ${(st.goals || []).map(g => `${g.side ? esc(e.away) : esc(e.home)} ${g.min}'`).join(', ') || 'none yet'}</p>` : '<p class="muted small">Until you enter something here, players see the match as started without a score.</p>'}
        <div class="d-actions"><button class="btn primary" data-lsc-ft>Full time – settle ${e.score_home}–${e.score_away}…</button></div></div>`}`;
  }
  function wireManualPanel(e) {
    const body = $('#drawerBody');
    const hb = body.querySelector('[data-crest-ed="home"]'), ab = body.querySelector('[data-crest-ed="away"]');
    if (hb) crestEditor(hb, () => e.home, e.home_logo);
    if (ab) crestEditor(ab, () => e.away, e.away_logo);
    let sc = { home: e.score_home, away: e.score_away, period: e.period || 'H1' }, busy = false;
    const send = async next => {
      if (busy) return; busy = true;
      try { await API.admin.liveScore(e.id, next); toast(`Live: ${e.home} ${next.home}–${next.away} ${e.away}${next.period === 'HT' ? ' · half-time' : ''}`, 'ok'); openEvent(e.id); render(true); }
      catch (x) { toast(errMsg(x), 'err'); } finally { busy = false; }
    };
    $$('#drawerBody [data-lsc]').forEach(b => b.onclick = () => {
      const [k, op] = [b.dataset.lsc[0], b.dataset.lsc[1]], key = k === 'h' ? 'home' : 'away';
      const v = Math.max(0, sc[key] + (op === '+' ? 1 : -1)); if (v === sc[key]) return;
      send({ ...sc, [key]: v });
    });
    $$('#drawerBody [data-lsp]').forEach(b => b.onclick = () => { if (b.dataset.lsp !== sc.period) send({ ...sc, period: b.dataset.lsp }); });
    const okB = body.querySelector('[data-lsc-ok]'); if (okB) okB.onclick = () => send({ ...sc });   // same score again = confirmed
    const betB = body.querySelector('[data-lsc-bet]');
    if (betB) betB.onclick = () => { const on = betB.dataset.lscBet === 'on'; if (on && !confirm('Open live betting on this match? Only do this if you are following it live – keep the score up to date.')) return; send({ ...sc, inplay: on }); };
    // countdown until live betting closes by itself without a new score / confirmation
    const left = body.querySelector('[data-lsc-left]');
    clearInterval(state.lscTimer);
    if (left && left.dataset.lscLeft) state.lscTimer = setInterval(() => {
      if (!document.body.contains(left)) return clearInterval(state.lscTimer);
      const s = Math.round((Date.parse(left.dataset.lscLeft) + 180000 - Date.now()) / 1000);
      left.textContent = s > 0 ? `Open for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} – confirm the score to keep it open` : 'Closed – the score is stale. Confirm it to reopen.';
      left.classList.toggle('bad', s <= 30);
    }, 1000);
    const ft = body.querySelector('[data-lsc-ft]');
    if (ft) ft.onclick = () => resultModal(e.id, false, { home: e.score_home, away: e.score_away, htHome: e.ht_home, htAway: e.ht_away });
  }
  async function openEvent(id) {
    openDrawer('<div class="loading">Loading event…</div>');
    const { event: e, markets, exposure } = await API.admin.event(id); const cc = state.me.country;
    const groups = ['Main', 'Goals', 'Corners', 'Half', 'Combo', 'Bookings'];
    markets.sort((a, b) => (groups.indexOf(a.grp) - groups.indexOf(b.grp)) || a.name.localeCompare(b.name));
    const allOff = markets.length && markets.every(m => m.suspended);
    const maxL = Math.max(...exposure.map(x => x.liability), 1);
    const open = e.status === 'scheduled' || e.status === 'live';
    // a hand-added match that has kicked off: no in-play betting, so its markets cannot be reopened
    const closedLive = String(e.ext_id || '').startsWith('man:') && new Date(e.kickoff) <= new Date();
    $('#drawerBody').innerHTML = `
      <div class="d-head"><div><h3>${esc(e.home)} – ${esc(e.away)}</h3><p>${esc(e.country)} · ${esc(e.league)} · ID ${e.id} · ${when(e.kickoff)}</p></div></div>
      <div class="d-actions">${e.status === 'live' ? `${pill('live', P_EV)} <b class="num">${e.minute}' ${e.score_home}–${e.score_away}</b>` : pill(e.status, P_EV)}${e.ht_home != null ? ` <span class="muted small">HT ${e.ht_home}–${e.ht_away}</span>` : ''}</div>
      ${open ? `<div class="d-actions">${closedLive ? '<span class="muted small">Markets closed at kick-off</span>' : `<button class="btn sm ${allOff ? 'primary' : 'danger'}" data-suspend-all="${e.id}" data-v="${allOff ? 'false' : 'true'}">${allOff ? IC.unlock + ' Reopen all markets' : IC.lock + ' Suspend all markets'}</button>`}<button class="btn sm" data-result="${e.id}">Enter result</button><button class="btn sm" data-cancel="${e.id}">Cancel event</button></div>` : ''}
      ${exposure.length ? `<div class="section-t">Open exposure (${exposure.length} selections)</div><div class="exp">${exposure.slice(0, 10).map(x => `<div class="exp-row"><span>${esc(x.label)} <span class="muted">· ${esc(x.market_key)}</span></span><span class="muted">${x.n} bets</span><span class="bar"><i style="width:${(x.liability / maxL) * 100}%"></i></span><b class="r num">${compact(x.liability, cc)}</b></div>`).join('')}</div>` : '<p class="muted small" style="margin:10px 0">No open bets on this event.</p>'}
      ${String(e.ext_id || '').startsWith('man:') ? manualPanel(e) : ''}
      <div class="section-t">Markets (${markets.length}) <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· tap a price to change it, the lock to suspend</span></div>
      <div class="mk-grid">${markets.map(m => { const outs = Object.entries(m.outcomes).sort((a, b) => (a[1].i ?? 0) - (b[1].i ?? 0)); return `<div class="mk ${m.suspended ? 'susp' : ''}"><div class="mk-h"><span>${esc(m.name)}</span><span class="grp">${esc(m.grp)}</span>${closedLive && m.suspended ? '' : `<button class="btn xs ${m.suspended ? 'primary' : ''}" data-mk-susp="${esc(m.key)}" data-ev="${e.id}" data-v="${m.suspended ? 'false' : 'true'}">${m.suspended ? 'Reopen' : 'Suspend'}</button>`}</div>
        <div class="mk-o" style="--c:${Math.min(m.cols || 3, 3)}">${outs.slice(0, 12).map(([k, o]) => `<button data-price="${esc(k)}" data-mk="${esc(m.key)}" data-ev="${e.id}" data-l="${esc(o.l)}" data-o="${o.o ?? ''}" class="${o.o == null ? 'off' : ''}"><span>${esc(o.l)}</span><b>${o.o == null ? '–' : Number(o.o).toFixed(2)}</b></button>`).join('')}${outs.length > 12 ? `<button class="muted" data-mk-more="${esc(m.key)}">+${outs.length - 12} more</button>` : ''}</div></div>`; }).join('')}</div>`;
    if (String(e.ext_id || '').startsWith('man:')) wireManualPanel(e);
    state.drawer = { type: 'event', id };
  }
  function priceModal(ev, mk, ok, label, cur) {
    openModal(`<h3>Set a price</h3><p class="sub">${esc(label)} · market <span class="mono">${esc(mk)}</span> · event ${ev}. The new price applies to new bets only; open bets keep the odds they were placed at.</p>
      <label class="field"><span>Decimal odds (min 1.01)</span><input id="mPrice" type="number" step="0.01" min="1.01" value="${cur || ''}"></label>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Save price</button></div>`);
    $('#mPrice').focus();
    $('#mGo').onclick = async () => { const v = +$('#mPrice').value; if (!(v >= 1.01)) return $('#mPrice').focus(); try { await API.admin.market(ev, mk, { outcome: ok, price: v }); closeModal(); toast('Price updated', 'ok'); openEvent(ev); } catch (e) { toast(errMsg(e), 'err'); } };
  }
  function resultModal(ev, cancel, pre) {
    openModal(cancel ? `<h3>Cancel event ${ev}?</h3><p class="sub">Every open bet on this event is voided and the stakes refunded. Use it for postponed or abandoned matches.</p><div class="m-actions"><button class="btn" data-close-modal>Back</button><button class="btn danger solid" id="mGo">Cancel event and refund</button></div>`
      : `<h3>Enter the final result</h3><p class="sub">Event ${ev} is marked finished and every bet on it is settled at once. Enter the real final score (for feed matches, only when the feed has not delivered it).</p>
        <div class="field-row"><label class="field"><span>Home goals (FT)</span><input id="rH" type="number" min="0" value="${pre ? pre.home : 0}"></label><label class="field"><span>Away goals (FT)</span><input id="rA" type="number" min="0" value="${pre ? pre.away : 0}"></label></div>
        <div class="field-row"><label class="field"><span>Home goals (HT)</span><input id="rHH" type="number" min="0" placeholder="optional" value="${pre && pre.htHome != null ? pre.htHome : ''}"></label><label class="field"><span>Away goals (HT)</span><input id="rHA" type="number" min="0" placeholder="optional" value="${pre && pre.htAway != null ? pre.htAway : ''}"></label></div>
        <p class="help">Half-time goals settle the half markets; leave them blank to void those markets instead.</p>
        <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Settle event</button></div>`);
    $('#mGo').onclick = async () => {
      try {
        $('#mGo').disabled = true;
        const body = cancel ? { home: 0, away: 0, cancelled: true } : { home: +$('#rH').value, away: +$('#rA').value, ...($('#rHH').value !== '' ? { htHome: +$('#rHH').value } : {}), ...($('#rHA').value !== '' ? { htAway: +$('#rHA').value } : {}) };
        const r = await API.admin.result(ev, body); closeModal(); toast(cancel ? 'Event cancelled, bets refunded' : `Settled · ${r.settled || 0} bets closed`, 'ok'); render(true); if (state.drawer && state.drawer.type === 'event') openEvent(ev);
      } catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; }
    };
  }

  /* ---------- Games ---------- */
  PAGES.games = async main => {
    const game = state.arg || '';
    const [games, plays] = await Promise.all([API.admin.games(), API.admin.plays(game || undefined)]);
    const cc = state.me.country;
    const NAMES = { crash: 'Rocket Crash', dice: 'Lucky Dice', spin: 'Spin & Win', penalty: 'Penalty Kick', rush: 'Number Rush', keno: 'Keno', scratch: 'Scratch Cards', hilo: 'Hi-Lo', instant: 'Instant Football' };
    const tot = games.reduce((a, g) => { a.s += g.staked; a.p += g.paid; a.n += g.plays; return a; }, { s: 0, p: 0, n: 0 });
    main.innerHTML = `
      <div class="page-head"><div><h2>Games</h2><p>Instant games and Rocket Crash, last 24 hours. Results are drawn server-side from a cryptographic random source; use the round audit for disputes.</p></div>
        <div class="page-actions"><button class="btn" id="crashAudit">Audit a crash round</button></div></div>
      <div class="grid g-kpi"><div class="card kpi"><div class="k">Turnover 24h</div><div class="v num">${compact(tot.s, cc)}</div><div class="s"><b>${int(tot.n)}</b> plays</div></div><div class="card kpi"><div class="k">Paid out 24h</div><div class="v num">${compact(tot.p, cc)}</div></div><div class="card kpi ${tot.s - tot.p < 0 ? 'bad' : 'good'}"><div class="k">House result 24h</div><div class="v num">${compact(tot.s - tot.p, cc)}</div><div class="s">hold ${tot.s ? ((1 - tot.p / tot.s) * 100).toFixed(1) + '%' : '–'}</div></div></div>
      <div class="grid g-2 mt">
        <div class="card"><div class="card-h"><h3>Per game <span class="sub">24 hours</span></h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Game</th><th class="r">Plays</th><th class="r">Staked</th><th class="r">Paid</th><th class="r">Hold</th><th></th></tr></thead><tbody>
          ${games.map(g => `<tr><td><b>${esc(NAMES[g.game] || g.game)}</b></td><td class="r">${int(g.plays)}</td><td class="r">${money(g.staked, cc)}</td><td class="r">${money(g.paid, cc)}</td><td class="r ${g.margin < 0 ? 'amt out' : ''}">${g.margin == null ? '–' : (g.margin * 100).toFixed(1) + '%'}</td><td><div class="acts"><a class="btn xs" href="#/games/${esc(g.game)}">Plays</a></div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No plays in the last 24 hours.</div></td></tr>'}
        </tbody></table></div></div>
        <div class="card"><div class="card-h"><h3>Recent plays ${game ? `<span class="sub">${esc(NAMES[game] || game)} · <a class="lnk" href="#/games">all games</a></span>` : ''}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Game</th><th>Player</th><th class="r">Stake</th><th class="r">Mult</th><th class="r">Payout</th><th>Status</th></tr></thead><tbody>
          ${plays.slice(0, 60).map(p => `<tr><td class="muted">${when(p.created_at)}</td><td>${esc(NAMES[p.game] || p.game)}${p.round ? ` <span class="muted small">#${p.round}</span>` : ''}</td><td><span class="lnk" data-user-uid="${p.uid}">ID ${p.uid}</span></td><td class="r">${money(p.stake, cc)}</td><td class="r">${p.mult ? Number(p.mult).toFixed(2) + 'x' : '–'}</td><td class="r amt ${Number(p.payout) > 0 ? 'in' : ''}">${money(p.payout, cc)}</td><td>${pill(p.status, P_GAME)}</td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">No plays yet.</div></td></tr>'}
        </tbody></table></div></div>
      </div>`;
    $('#crashAudit').onclick = () => {
      openModal(`<h3>Rocket Crash round audit</h3><p class="sub">Recomputes the crash point from the round's stored seed and checks it against the published hash.</p><label class="field"><span>Round number</span><input id="mRound" type="number" min="1" placeholder="e.g. 10234"></label><div id="auditOut"></div><div class="m-actions"><button class="btn" data-close-modal>Close</button><button class="btn primary" id="mGo">Verify</button></div>`);
      $('#mGo').onclick = async () => { try { const r = await API.admin.crashVerify(+$('#mRound').value); $('#auditOut').innerHTML = `<dl class="kv" style="margin:6px 0 12px"><dt>Round</dt><dd>${r.id}</dd><dt>Crash point</dt><dd>${r.point}x</dd><dt>Recomputed</dt><dd>${r.check.point}x</dd><dt>Hash check</dt><dd>${r.check.hashOk ? pill('ok', { ok: ['ok', 'Matches'] }) : pill('bad', { bad: ['bad', 'MISMATCH'] })}</dd><dt>Seed</dt><dd class="mono">${esc(r.seed)}</dd><dt>Hash</dt><dd class="mono">${esc(r.hash)}</dd></dl>`; } catch (e) { $('#auditOut').innerHTML = `<p class="form-err">${esc(e.message === 'not_finished' ? 'That round has not finished (or does not exist).' : errMsg(e))}</p>`; } };
    };
  };

  /* ---------- Jackpot ---------- */
  PAGES.jackpot = async main => {
    const [rounds, settings] = await Promise.all([API.admin.jackpot(), API.admin.settings()]);
    const jp = settings.jackpot || {}; const cc = state.me.country;
    main.innerHTML = `
      <div class="page-head"><div><h2>Weekly Jackpot</h2><p>Rounds of 12 fixtures. A round closes at its first kick-off and settles itself when all 12 are over; you can force settlement once the games have finished.</p></div>
        <div class="page-actions"><a class="btn" href="#/settings">Prizes &amp; line price</a><button class="btn primary" id="jpSettle">Settle closed rounds now</button></div></div>
      <div class="grid g-kpi">${['NG', 'GH'].map(c => jp[c] ? `<div class="card kpi"><div class="k">${flag(c)} Jackpot prize</div><div class="v num">${compact(jp[c].jackpot, c)}</div><div class="s">11 correct ${money(jp[c].t11, c)} · 10 correct ${money(jp[c].t10, c)} · line ${money(jp[c].line, c)}</div></div>` : '').join('')}</div>
      <div class="card mt"><div class="card-h"><h3>Rounds</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Round</th><th>Closes</th><th>Status</th><th class="r">Tickets</th><th class="r">Lines</th><th class="r">Sales</th><th class="r">Prizes paid</th><th>Winners</th><th></th></tr></thead><tbody>
        ${rounds.map(r => { const s = r.summary || {}; const win = Object.entries(s).map(([c, t]) => `${c}: ${t.t12.lines}×12 · ${t.t11.lines}×11 · ${t.t10.lines}×10`).join(' | '); return `<tr><td><b>#${esc(r.code)}</b><div class="muted small">${r.games} games</div></td><td class="muted">${when(r.closes_at)}</td><td>${r.status === 'settled' ? pill('s', { s: ['ok', 'Settled ' + ago(r.settled_at)] }) : new Date(r.closes_at) > Date.now() ? pill('o', { o: ['info', 'Open for tickets'] }) : pill('c', { c: ['warn', 'Closed – awaiting results'] })}</td><td class="r">${int(r.tickets)}</td><td class="r">${int(r.lines)}</td><td class="r">${compact(r.sales, cc)}</td><td class="r amt ${r.prizes > 0 ? 'out' : ''}">${compact(r.prizes, cc)}</td><td class="small muted">${win || '–'}</td><td><div class="acts">${r.status === 'open' && new Date(r.closes_at) <= Date.now() ? `<button class="btn xs" data-jp-settle="${esc(r.code)}">Settle</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="9"><div class="empty"><b>No rounds yet</b>A round is created when the first ticket is bought.</div></td></tr>'}
      </tbody></table></div></div>`;
    const settle = async code => { try { const r = await API.admin.jackpotSettle(code); toast(r.settled.length ? `Settled round ${r.settled.join(', ')}` : 'No round could be settled yet – games still running', r.settled.length ? 'ok' : ''); render(true); } catch (e) { toast(errMsg(e), 'err'); } };
    $('#jpSettle').onclick = () => settle();
    $$('#main [data-jp-settle]').forEach(b => b.onclick = () => settle(b.dataset.jpSettle));
  };

  /* ---------- Ledger ---------- */
  PAGES.finance = async main => {
    const [type = '', q = ''] = (state.arg || '').split(':').map(decodeURIComponent);
    const rows = await API.admin.transactions(type || undefined, q || undefined);
    const TYPES = ['deposit', 'withdrawal', 'bet', 'win', 'refund', 'cashout', 'bonus', 'adjustment', 'game_bet', 'game_win', 'transfer_in', 'transfer_out', 'jackpot'];
    main.innerHTML = `
      <div class="page-head"><div><h2>Ledger</h2><p>Every movement of player money, newest first. Balances are the running total after each entry, so the book always reconciles.</p></div></div>
      <div class="card"><div class="toolbar"><div class="seg"><button class="${!type ? 'on' : ''}" data-t="">All</button>${TYPES.map(t => `<button class="${t === type ? 'on' : ''}" data-t="${t}">${t.replace('_', ' ')}</button>`).join('')}</div>
        <form class="search" id="fq"><i>${IC.search}</i><input placeholder="Phone, player ID or reference" value="${esc(q)}"></form><span class="spacer"></span><span class="muted small">${rows.length} shown</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Player</th><th>Type</th><th class="wrap">Reference / note</th><th class="r">Amount</th><th class="r">Balance after</th></tr></thead><tbody>
        ${rows.map(x => `<tr><td class="muted">${when(x.created_at)}</td><td><div class="who"><b>${esc(phoneFmt(x.country, x.phone))}</b><small>ID ${x.uid}</small></div></td><td>${esc(x.type.replace('_', ' '))}</td><td class="wrap small"><span class="id">${esc(x.ref || '')}</span>${x.meta && (x.meta.reason || x.meta.method || x.meta.note) ? `<div class="muted">${esc(x.meta.reason || x.meta.method || x.meta.note)}</div>` : ''}</td><td class="r amt ${Number(x.amount) >= 0 ? 'in' : 'out'}">${Number(x.amount) >= 0 ? '+' : ''}${money(x.amount, x.country)}</td><td class="r">${money(x.balance_after, x.country)}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty"><b>No entries</b>Nothing matches this filter.</div></td></tr>'}
      </tbody></table></div></div>`;
    $$('#main [data-t]').forEach(b => b.onclick = () => { location.hash = `#/finance/${b.dataset.t}:${encodeURIComponent(q)}`; });
    $('#fq').onsubmit = e => { e.preventDefault(); location.hash = `#/finance/${type}:${encodeURIComponent($('#fq input').value.trim())}`; };
  };

  /* ---------- Settings ---------- */
  PAGES.settings = async main => {
    const s = await API.admin.settings();
    const cc2 = (key, title, desc, fields) => { const v = s[key] || {}; return `<div class="card set-card" data-set="${key}"><div class="card-b"><h4>${title}</h4><div class="desc">${desc}</div><div class="set-head"><span></span><span>${flag('NG')}Nigeria</span><span>${flag('GH')}Ghana</span></div>
      ${fields.map(([f, l]) => `<div class="set-row"><label>${l}</label><input type="number" step="any" data-f="NG.${f}" value="${esc(v.NG ? v.NG[f] : '')}"><input type="number" step="any" data-f="GH.${f}" value="${esc(v.GH ? v.GH[f] : '')}"></div>`).join('')}
      <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" data-save="${key}">Save</button></div></div></div>`; };
    const flat = (key, title, desc, fields) => { const v = s[key] || {}; return `<div class="card set-card" data-set="${key}"><div class="card-b"><h4>${title}</h4><div class="desc">${desc}</div>
      ${fields.map(([f, l, step]) => `<div class="set-row one"><label>${l}</label><input type="number" step="${step || 'any'}" data-f="${f}" value="${esc(f === '' ? v : v[f])}"></div>`).join('')}
      <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" data-save="${key}">Save</button></div></div></div>`; };
    const wb = s.welcome_bonus || {};
    const L = s.deposit_bonuses || { enabled: false, requireId: true, NG: [{}, {}, {}], GH: [{}, {}, {}], times: 5, min_odds: 1.5, days: 14 };
    const ladderCard = () => `<div class="card set-card wide" data-set="deposit_bonuses"><div class="card-b"><h4>Deposit bonuses 1 · 2 · 3</h4>
      <div class="desc">A bonus on each of the first three deposits a player makes once their ID is approved (it replaces the welcome bonus while it is on). Bonus money stays locked until the player has staked it the number of times below on multiples, within the days below – it can never be withdrawn before that.</div>
      <div class="lad-flags"><label class="chk"><input type="checkbox" id="ladOn" ${L.enabled ? 'checked' : ''}> On</label></div>
      <div class="lad-grid"><span></span><span>${flag('NG')}Bonus %</span><span>Max ₦</span><span>${flag('GH')}Bonus %</span><span>Max GH₵</span>
        ${[0, 1, 2].map(i => `<label>Deposit ${i + 1}</label>${['NG', 'GH'].map(cc => `<input type="number" min="0" max="500" step="1" data-lad="${cc}.${i}.pct" value="${esc((L[cc] && L[cc][i] || {}).pct ?? '')}"><input type="number" min="0" step="any" data-lad="${cc}.${i}.max" value="${esc((L[cc] && L[cc][i] || {}).max ?? '')}">`).join('')}`).join('')}</div>
      <div class="set-row one"><label>Stake the bonus this many times</label><input type="number" min="1" max="50" step="1" id="ladTimes" value="${esc(L.times ?? 5)}"></div>
      <div class="set-row one"><label>Minimum odds of every selection</label><input type="number" min="1.01" max="10" step="0.01" id="ladOdds" value="${esc(L.min_odds ?? 1.5)}"></div>
      <div class="set-row one"><label>Days to play it through</label><input type="number" min="1" max="90" step="1" id="ladDays" value="${esc(L.days ?? 14)}"></div>
      <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" id="ladSave">Save</button></div></div></div>`;
    const boost = Array.isArray(s.boost) ? s.boost : [];
    main.innerHTML = `
      <div class="page-head"><div><h2>Settings</h2><p>Live configuration of the book. Changes apply to new bets and new deposits immediately and are written to the audit log.</p></div></div>
      <div class="set-grid">
        ${flat('margin', 'Pricing margin', 'The payout ratio used to turn a probability into odds. 0.94 means a 6% theoretical margin on every market; lower it to widen the margin.', [['', 'Margin (0.80 – 0.99)', '0.01']])}
        ${cc2('min_stake', 'Minimum stake', 'The smallest sports stake a player can place.', [])}
        ${cc2('max_payout', 'Maximum payout', 'The most one ticket can win. Tickets above it are refused at placement.', [])}
        ${cc2('games', 'Game stakes', 'Stake limits for instant games and Rocket Crash.', [['min', 'Minimum'], ['max', 'Maximum']])}
        ${cc2('jackpot', 'Jackpot prizes', 'Prize money and the price of one line.', [['jackpot', '12 correct (shared)'], ['t11', '11 correct (per line)'], ['t10', '10 correct (per line)'], ['line', 'Line price']])}
        ${ladderCard()}
        ${cc2('welcome_bonus', 'Welcome bonus (old)', `First-deposit bonus, used only while Deposit bonuses 1 · 2 · 3 is off. Released after ${wb.times || 5}× turnover on multiples with every selection at ${wb.min_odds || 1.5}+ within ${wb.days || 14} days.`, [['pct', 'Bonus %'], ['max', 'Maximum bonus']])}
        <div class="card set-card" data-set="boost"><div class="card-b"><h4>Accumulator win boost</h4><div class="desc">Extra percentage added to winnings by number of selections (each at odds 1.20 or more).</div>
          <div class="boost-rows" id="boostRows">${boost.map(([n, p]) => `<div class="boost-row"><input type="number" min="2" value="${n}" placeholder="selections"><input type="number" min="0" value="${p}" placeholder="boost %"><button class="btn xs" data-rm-row>×</button></div>`).join('')}</div>
          <div class="set-foot"><button class="btn sm" id="boostAdd">Add tier</button><span class="spacer" style="flex:1"></span><span class="saved" hidden>Saved</span><button class="btn sm primary" data-save="boost">Save</button></div></div></div>
        <div class="card set-card" data-set="inplay"><div class="card-b"><h4>In-play betting</h4><div class="desc">Football markets stay open from kick-off until the closing minute and move with the score and the clock; a new score pauses betting for 10 s, and every in-play bet is confirmed after a short delay (a goal in between refuses it). Real matches without a fresh live score (no live-score feed): <b>1</b> = still open with the stake cap per player per match, <b>0</b> = paused until a fresh score.</div>
          ${[['closeMinute', 'Close at minute', '1'], ['delaySec', 'Bet delay (s)', '1'], ['blind', 'Open without a live score (1 / 0)', '1'], ['blindDelaySec', 'Bet delay without a live score (s)', '1']].map(([f, l, st2]) => `<div class="set-row one"><label>${l}</label><input type="number" step="${st2}" data-f="${f}" value="${esc((s.inplay || {})[f] ?? '')}"></div>`).join('')}
          <div class="set-row"><label>Stake cap without a live score</label><input type="number" step="any" data-f="blindMaxStake.NG" value="${esc(((s.inplay || {}).blindMaxStake || {}).NG ?? '')}" placeholder="NG ₦"><input type="number" step="any" data-f="blindMaxStake.GH" value="${esc(((s.inplay || {}).blindMaxStake || {}).GH ?? '')}" placeholder="GH ₵"></div>
          <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" data-save="inplay">Save</button></div></div></div>
        <div class="card set-card" data-set="referral"><div class="card-b"><h4>Refer &amp; Earn</h4><div class="desc">Reward paid to the referrer once the friend has staked the reward amount.</div><div class="set-head"><span></span><span>${flag('NG')}Nigeria</span><span>${flag('GH')}Ghana</span></div>
          <div class="set-row"><label>Reward</label><input type="number" step="any" data-f="NG" value="${esc((s.referral || {}).NG ?? '')}"><input type="number" step="any" data-f="GH" value="${esc((s.referral || {}).GH ?? '')}"></div>
          <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" data-save="referral">Save</button></div></div></div>
        <div class="card set-card" data-set="raw"><div class="card-b"><h4>All settings (advanced)</h4><div class="desc">Raw JSON of every key. Edit a value here only when there is no form for it.</div>
          <select id="rawKey" class="btn" style="margin-bottom:8px">${Object.keys(s).sort().map(k => `<option>${esc(k)}</option>`).join('')}</select>
          <textarea class="json" id="rawVal"></textarea>
          <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn sm primary" id="rawSave">Save key</button></div></div></div>
      </div>`;
    // min_stake / max_payout are {NG: n, GH: n} (no sub-field): render their rows by hand
    const simpleCC = (key, label) => { const card = $(`[data-set="${key}"] .card-b`); const v = s[key] || {}; card.querySelector('.set-head').insertAdjacentHTML('afterend', `<div class="set-row"><label>${label}</label><input type="number" step="any" data-f="NG" value="${esc(v.NG ?? '')}"><input type="number" step="any" data-f="GH" value="${esc(v.GH ?? '')}"></div>`); };
    simpleCC('min_stake', 'Per bet'); simpleCC('max_payout', 'Per ticket');
    const rawShow = () => { $('#rawVal').value = JSON.stringify(s[$('#rawKey').value], null, 2); }; rawShow(); $('#rawKey').onchange = rawShow;
    $('#rawSave').onclick = async () => { try { const v = JSON.parse($('#rawVal').value); await API.admin.setSetting($('#rawKey').value, v); s[$('#rawKey').value] = v; toast('Saved', 'ok'); } catch (e) { toast(e instanceof SyntaxError ? 'That is not valid JSON' : errMsg(e), 'err'); } };
    $('#ladSave').onclick = async () => {
      const card = $('[data-set="deposit_bonuses"]'), v = { enabled: $('#ladOn').checked, requireId: false, NG: [{}, {}, {}], GH: [{}, {}, {}], times: +$('#ladTimes').value, min_odds: +$('#ladOdds').value, days: +$('#ladDays').value };
      $$('[data-lad]', card).forEach(i => { const [cc, k, f] = i.dataset.lad.split('.'); v[cc][+k][f] = +i.value || 0; });
      try { $('#ladSave').disabled = true; await API.admin.setSetting('deposit_bonuses', v); s.deposit_bonuses = v; const ok = card.querySelector('.saved'); ok.hidden = false; setTimeout(() => ok.hidden = true, 2500); toast('Deposit bonuses saved', 'ok'); }
      catch (e) { toast(e.message === 'invalid' ? 'Check the numbers: % 0–500, a maximum for every deposit, times 1–50, odds 1.01–10, days 1–90' : errMsg(e), 'err'); }
      finally { $('#ladSave').disabled = false; }
    };
    $('#boostAdd').onclick = () => $('#boostRows').insertAdjacentHTML('beforeend', '<div class="boost-row"><input type="number" min="2" placeholder="selections"><input type="number" min="0" placeholder="boost %"><button class="btn xs" data-rm-row>×</button></div>');
    main.onclick = e => { const rm = e.target.closest('[data-rm-row]'); if (rm) rm.parentElement.remove(); };
    $$('#main [data-save]').forEach(b => b.onclick = async () => {
      const key = b.dataset.save, card = b.closest('.set-card'); let value;
      if (key === 'boost') value = $$('.boost-row', card).map(r => [+r.children[0].value, +r.children[1].value]).filter(x => x[0] >= 2 && x[1] >= 0).sort((a, b2) => a[0] - b2[0]);
      else if (key === 'margin') value = +card.querySelector('input').value;
      else { value = JSON.parse(JSON.stringify(s[key] || {})); $$('input[data-f]', card).forEach(i => { const path = i.dataset.f.split('.'); const num = i.value === '' ? null : +i.value; if (path.length === 1) value[path[0]] = num; else { value[path[0]] = value[path[0]] || {}; value[path[0]][path[1]] = num; } }); }
      if (key === 'margin' && !(value >= 0.8 && value <= 0.99)) return toast('Margin must be between 0.80 and 0.99', 'err');
      try { b.disabled = true; await API.admin.setSetting(key, value); s[key] = value; const ok = card.querySelector('.saved'); ok.hidden = false; setTimeout(() => ok.hidden = true, 2500); toast('Settings saved', 'ok'); } catch (e) { toast(errMsg(e), 'err'); } finally { b.disabled = false; }
    });
  };

  /* ---------- Sub-agents ---------- */
  const P_AGP = { pending: ['warn', 'Waiting'], paid: ['ok', 'Paid'], rejected: ['bad', 'Rejected'] };
  /* ---------- Live support ---------- */
  const SUP_ST = { waiting: ['Waiting', 'bad'], open: ['Open', 'ok'], bot: ['Assistant', ''], closed: ['Closed', ''] };
  const SUP_CANNED = ['Hi, I am checking this for you now.', 'Your deposit has been confirmed and credited to your balance.', 'Your withdrawal has been approved and sent – it should arrive in a few minutes.',
    'Please send the transaction ID from your MoMo SMS so I can trace the payment.', 'Thanks for waiting – it is sorted now.', 'Is there anything else I can help you with?'];
  const supMsg = m => m.from === 'system' ? `<div class="sup-sys">${esc(m.text)}</div>`
    : `<div class="sup-m ${m.from}"><small>${m.from === 'user' ? 'Player' : m.from === 'bot' ? 'Assistant' : esc(m.name || 'Support')} · ${when(m.at)}</small><div>${esc(m.text).replace(/\n/g, '<br>')}</div></div>`;
  PAGES.support = async (main, silent) => {
    const tab = state.supTab || 'active', sel = state.arg ? Number(state.arg) : null;
    const [inbox, chat] = await Promise.all([API.admin.support(tab), sel ? API.admin.supportThread(sel) : null]);
    supportBadge(inbox.waiting);
    if (silent && main.querySelector('.sup')) return supRefresh(inbox, chat);
    main.innerHTML = `
      <div class="page-head"><div><h2>Live support</h2><p>Players chat with the assistant first – it answers from their own account. When they ask for a person (or the assistant cannot help) the chat lands here. While this page is open players see the team as <b>online</b>. Their profile, payments and bets are next to the chat, with the tools to fix things.</p></div></div>
      <div class="sup">
        <div class="card sup-list"><div class="sup-tabs"><button data-suptab="active" class="${tab === 'active' ? 'on' : ''}">Active</button><button data-suptab="closed" class="${tab === 'closed' ? 'on' : ''}">Closed</button></div><div id="supItems"></div></div>
        <div class="card sup-chat" id="supChat"></div>
      </div>`;
    const box = main.querySelector('.sup');
    box.addEventListener('click', async e => {
      const t = e.target;
      const tb = t.closest('[data-suptab]'); if (tb) { state.supTab = tb.dataset.suptab; return render(); }
      const it = t.closest('[data-sup]'); if (it) { location.hash = '#/support/' + it.dataset.sup; return; }
      const cn = t.closest('[data-canned]'); if (cn) { const ta = $('#supText'); ta.value = cn.dataset.canned; ta.focus(); return; }
      const ck = t.closest('[data-supcheck]');
      if (ck) { ck.disabled = true; try { const r = await API.admin.checkPayment(ck.dataset.supcheck); toast(r && r.status ? `Payment: ${r.status}` : 'Checked with the provider', 'ok'); render(true); } catch (err) { toast(errMsg(err), 'err'); ck.disabled = false; } return; }
      if (t.closest('[data-supclose]')) { const id = state.arg; if (!confirm('Close this chat? The player can start a new one any time.')) return; try { await API.admin.supportClose(id); toast('Chat closed', 'ok'); render(true); } catch (err) { toast(errMsg(err), 'err'); } }
    });
    box.addEventListener('submit', async e => {
      if (!e.target.matches('#supForm')) return; e.preventDefault();
      const ta = $('#supText'), text = ta.value.trim(), id = state.arg; if (!text || !id) return;
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try { await API.admin.supportReply(id, text); ta.value = ''; render(true); } catch (err) { toast(errMsg(err), 'err'); } finally { btn.disabled = false; }
    });
    box.addEventListener('keydown', e => { if (e.target.id === 'supText' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#supForm').requestSubmit(); } });
    supRefresh(inbox, chat, true);
    clearInterval(state.supTimer);
    state.supTimer = setInterval(() => { if (state.page !== 'support') return clearInterval(state.supTimer); if (!document.hidden && !document.querySelector('.modal.open')) render(true); }, 4000);
  };
  function supRefresh(inbox, chat, first) {
    const sel = state.arg ? Number(state.arg) : null;
    $('#supItems').innerHTML = inbox.threads.map(t => { const s = SUP_ST[t.status] || [t.status, '']; return `<button class="sup-it${t.id == sel ? ' on' : ''}" data-sup="${t.id}">
        <span class="sup-top"><b>${esc(t.full_name || phoneFmt(t.country, t.phone) || t.email || 'Player')}</b>${t.staff_unread ? `<i class="sup-n">${t.staff_unread}</i>` : ''}<span class="pill ${s[1]}">${s[0]}</span></span>
        <small class="sup-last">${esc(t.last || '')}</small><small class="muted">ID ${t.uid} · ${flag(t.country)}${t.is_agent ? ' · agent' : ''} · ${ago(t.last_at)}</small></button>`; }).join('') || `<div class="empty"><b>No ${state.supTab === 'closed' ? 'closed' : 'active'} chats</b>${state.supTab === 'closed' ? '' : 'When a player asks for a person, the chat appears here.'}</div>`;
    const el = $('#supChat');
    if (!chat) { el.innerHTML = '<div class="empty"><b>Pick a chat</b>Waiting chats are at the top.</div>'; return; }
    const P = chat.player, cc = P.country, list = el.querySelector('.sup-msgs');
    const keepText = $('#supText') ? $('#supText').value : '', hadFocus = document.activeElement && document.activeElement.id === 'supText';
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const st = SUP_ST[chat.thread.status] || ['', ''];
    const PST = { success: 'Paid', pending: 'Pending', failed: 'Failed', rejected: 'Rejected', cancelled: 'Cancelled' }, MNAME = { mobile_money: 'Mobile Money', bank_transfer: 'Bank transfer' };
    const payRow = p => `<tr><td><b>${p.kind === 'deposit' ? 'Deposit' : 'Withdrawal'}</b> <span class="pill ${p.status === 'success' ? 'ok' : p.status === 'pending' ? 'warn' : 'bad'}">${PST[p.status] || esc(p.status)}</span><div class="small muted">${when(p.created_at)} · ${esc(p.account || MNAME[p.method] || p.method || '')}</div>${p.reason ? `<div class="small muted">${esc(p.reason)}</div>` : ''}</td><td class="r"><b>${money(p.amount, cc)}</b></td>
      <td>${p.status === 'pending' && p.provider && p.provider !== 'manual' ? `<button class="btn xs" data-supcheck="${p.id}">Check now</button>` : p.status === 'pending' && p.kind === 'withdrawal' ? `<button class="btn xs primary" data-review="${p.id}">Review</button>` : ''}</td></tr>`;
    el.innerHTML = `
      <div class="sup-head"><div class="who"><b>${esc(P.name || 'No name yet')}</b><small>ID ${P.uid} · ${flag(cc)} ${esc(P.phone ? phoneFmt(cc, P.phone) : P.email || '')}</small></div>
        <div class="acts"><span class="pill ${st[1]}">${st[0]}</span><button class="btn xs" data-user="${P.id}">Full profile &amp; tools</button>${chat.thread.status !== 'closed' ? '<button class="btn xs danger" data-supclose>Close chat</button>' : ''}</div></div>
      <div class="sup-body">
        <div class="sup-conv">
          <div class="sup-msgs">${chat.messages.map(supMsg).join('')}</div>
          ${chat.thread.status !== 'closed' ? `<div class="sup-canned">${SUP_CANNED.map(c => `<button type="button" class="btn xs" data-canned="${esc(c)}">${esc(c.length > 34 ? c.slice(0, 32) + '…' : c)}</button>`).join('')}</div>
          <form id="supForm" class="sup-form"><textarea id="supText" rows="2" maxlength="4000" placeholder="Reply to the player… (Enter sends, Shift+Enter for a new line)"></textarea><button class="btn primary">Send</button></form>` : '<div class="empty small">This chat is closed. A new message from the player opens a new chat.</div>'}
        </div>
        <div class="sup-ctx">
          <div class="sup-kpis"><div><small>Balance</small><b>${money(P.balance, cc)}</b></div><div><small>Deposited</small><b>${money(P.deposited, cc)}</b></div><div><small>Withdrawn</small><b>${money(P.withdrawn, cc)}</b></div><div><small>Open bets</small><b>${int(P.openBets)}</b></div></div>
          <dl class="kv small"><dt>Account</dt><dd>${P.status === 'active' ? 'Active' : esc(P.status)}${P.isAgent ? ' · <b>Agent</b>' : ''}</dd><dt>Joined</dt><dd>${when(P.joined)}</dd></dl>
          <h4 class="sup-h">Payments</h4><div class="tbl-wrap"><table class="tbl"><tbody>${chat.payments.map(payRow).join('') || '<tr><td><span class="muted">No payments yet</span></td></tr>'}</tbody></table></div>
          <h4 class="sup-h">Recent bets</h4><div class="tbl-wrap"><table class="tbl"><tbody>${chat.bets.map(b => `<tr class="click" data-bet="${esc(b.id)}"><td class="mono small">${esc(b.id)}</td><td class="r">${money(b.stake, cc)}</td><td>${esc(b.status)}</td><td class="r">${b.paid != null ? money(b.paid, cc) : '–'}</td></tr>`).join('') || '<tr><td><span class="muted">No bets yet</span></td></tr>'}</tbody></table></div>
        </div>
      </div>`;
    const ta = $('#supText'); if (ta && keepText) ta.value = keepText;
    const nl = el.querySelector('.sup-msgs'); if (nl && (first || atBottom)) nl.scrollTop = nl.scrollHeight;
    if (ta && (first || hadFocus)) ta.focus();
  }

  /* ---------- Live desk: run live betting on your own matches ---------- */
  PAGES.livedesk = async (main, silent) => {
    const { matches, freshSec } = await API.admin.liveDesk();
    state.desk = { matches, freshSec, at: Date.now() };
    const live = matches.filter(m => m.status === 'live'), soon = matches.filter(m => m.status !== 'live');
    deskBadge(matches, freshSec);
    const card = m => {
      const st = m.stats || {}, c = m.clock || {}, on = !!st.inplay;
      const crestImg = (logo, name) => `<span class="ld-crest">${logo ? `<img src="${esc(logo)}" alt="">` : esc((name || '?').slice(0, 2).toUpperCase())}</span>`;
      const clk = m.period === 'HT' ? 'Half-time' : `${c.minute || m.minute || 1}${c.plus ? '+' + c.plus : ''}'`;
      return `<div class="card ld-card${on ? ' on' : ''}" data-desk="${m.id}">
        <div class="ld-top"><span class="muted small">${esc(m.league)} · ${esc(m.country)}</span><span class="ld-clock">${m.status === 'live' ? `<i class="dot live"></i>${clk}` : 'Kicks off ' + when(m.kickoff)}</span></div>
        ${[['home', m.home, m.home_logo, m.score_home, 'h'], ['away', m.away, m.away_logo, m.score_away, 'a']].map(([, n, lg, sc, k]) => `<div class="ld-row">${crestImg(lg, n)}<b class="ld-team">${esc(n)}</b>
          ${m.status === 'live' ? `<button class="btn sm" data-dk="${k}-" aria-label="Take a goal back">−</button><b class="ld-sc">${sc}</b><button class="btn sm primary" data-dk="${k}+">+ Goal</button>` : ''}</div>`).join('')}
        ${m.status === 'live' ? `<div class="seg ld-per">${[['H1', '1st half'], ['HT', 'Half-time'], ['H2', '2nd half']].map(([v, l]) => `<button data-dkp="${v}" class="${(m.period || 'H1') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="ld-state" data-dkstate="${m.id}"></div>
          <div class="ld-acts">${on ? `<button class="btn primary" data-dk-ok>Score is still ${m.score_home}–${m.score_away} ✓</button>` : ''}
            <button class="btn ${on ? 'danger' : 'primary'}" data-dk-bet="${on ? 'off' : 'on'}">${on ? 'Stop live betting' : 'Turn on live betting'}</button>
            <button class="btn" data-dk-ft>Full time…</button></div>
          <div class="small muted">${m.open_bets ? `${int(m.open_bets)} open tickets · ${money(m.stake, state.me.country)} staked` : 'No open tickets on this match'}</div>`
        : `<div class="small muted">${on ? 'Live betting opens by itself at kick-off (score 0–0); keep the score here.' : 'Live betting is off for this match.'}</div>
           <div class="ld-acts"><button class="btn ${on ? '' : 'primary'}" data-dk-pre="${on ? 'off' : 'on'}">${on ? 'Don’t open live betting' : 'Open live betting at kick-off'}</button></div>`}
      </div>`;
    };
    if (!silent || !main.querySelector('.ld-grid')) {
      main.innerHTML = `<div class="page-head"><div><h2>Live desk</h2><p>Your own matches in play. Live betting opens by itself at kick-off and stays open while you keep the score: <b>+ Goal</b> for every goal, or <b>Score is still</b> at least every ${Math.round(freshSec / 60)} minutes. A goal pauses betting for 10 seconds; odds move with the score and the clock. If nobody keeps the score, that match pauses by itself (you hear a beep 30 seconds before) and reopens the moment you tap.</p></div></div>
        <div class="ld-grid" id="ldGrid"></div>`;
      const grid = $('#ldGrid');
      grid.addEventListener('click', async e => {
        const cardEl = e.target.closest('[data-desk]'); if (!cardEl) return;
        const m = state.desk.matches.find(x => String(x.id) === cardEl.dataset.desk); if (!m) return;
        const sc = { home: m.score_home, away: m.score_away, period: m.period || 'H1' };
        const go = async (next, msg) => { try { const r = await API.admin.liveScore(m.id, next); toast(msg || `${m.home} ${r.home}–${r.away} ${m.away}${r.open ? ' · betting open' : ' · betting paused'}`, 'ok'); render(true); } catch (x) { toast(errMsg(x), 'err'); } };
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.dk) { const key = b.dataset.dk[0] === 'h' ? 'home' : 'away', v = Math.max(0, sc[key] + (b.dataset.dk[1] === '+' ? 1 : -1)); if (v !== sc[key]) go({ ...sc, [key]: v }); return; }
        if (b.dataset.dkp) { if (b.dataset.dkp !== sc.period) go({ ...sc, period: b.dataset.dkp }); return; }
        if ('dkOk' in b.dataset) return go({ ...sc }, `${m.home} v ${m.away}: score confirmed`);
        if (b.dataset.dkBet) { const on = b.dataset.dkBet === 'on'; if (on && !confirm('Open live betting on this match? Only while you are following it live – keep the score up to date.')) return; return go({ ...sc, inplay: on }); }
        if (b.dataset.dkPre) { try { await API.admin.setLiveBetting(m.id, b.dataset.dkPre === 'on'); toast('Saved', 'ok'); render(true); } catch (x) { toast(errMsg(x), 'err'); } return; }
        if ('dkFt' in b.dataset) return resultModal(m.id, false, { home: m.score_home, away: m.score_away, htHome: m.ht_home, htAway: m.ht_away });
      });
    }
    $('#ldGrid').innerHTML = [...live, ...soon].map(card).join('') || '<div class="card"><div class="empty"><b>No matches of yours in play</b>Matches you add appear here from 30 minutes before kick-off.</div></div>';
    deskTick();
    clearInterval(state.deskTimer);
    state.deskTimer = setInterval(() => { if (state.page !== 'livedesk') return clearInterval(state.deskTimer); deskTick(); if (Date.now() - state.desk.at > 4000 && !document.querySelector('.modal.open')) render(true); }, 1000);
  };
  // each card's live-betting state, to the second (open · closes in / paused for a goal / closed – stale / off)
  function deskTick() {
    const d = state.desk; if (!d) return;
    let beep = false;
    for (const m of d.matches.filter(x => x.status === 'live')) {
      const el = document.querySelector(`[data-dkstate="${m.id}"]`); if (!el) continue;
      const st = m.stats || {}, now = Date.now(), until = st.scoreAt ? Date.parse(st.scoreAt) + d.freshSec * 1000 : 0, left = Math.round((until - now) / 1000);
      const stop = st.betStopUntil && Date.parse(st.betStopUntil) > now;
      let cls = '', txt = '';
      if (!st.inplay) { cls = 'off'; txt = 'Live betting off'; }
      else if (stop) { cls = 'wait'; txt = 'Goal – betting paused for a few seconds'; }
      else if (left > 0) { cls = left <= 30 ? 'warn' : 'ok'; txt = `Betting OPEN · confirm the score within ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (left <= 30 && left > 0 && !(state.deskBeeped || {})[m.id + ':' + st.scoreAt]) { (state.deskBeeped ||= {})[m.id + ':' + st.scoreAt] = true; beep = true; } }
      else { cls = 'bad'; txt = 'PAUSED – the score is stale. Tap + Goal or Score is still to reopen'; }
      el.className = 'ld-state ' + cls; el.textContent = txt;
      el.closest('.ld-card').classList.toggle('alert', cls === 'warn' || cls === 'bad');
    }
    if (beep) deskBeep();
  }
  function deskBeep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); setTimeout(() => { o.stop(); a.close(); }, 350); } catch {} }
  function deskBadge(matches, freshSec) {
    const now = Date.now(), need = matches.filter(m => m.status === 'live' && m.stats && m.stats.inplay && (!m.stats.scoreAt || Date.parse(m.stats.scoreAt) + freshSec * 1000 - now < 60000)).length;
    const b = $('#navDesk'); if (b) { b.hidden = !need; b.textContent = need; }
  }

  PAGES.agents = async main => {
    const [{ agents, rules }, queue, done] = await Promise.all([API.admin.agents(), API.admin.agentPayouts('pending'), API.admin.agentPayouts('all')]);
    const nb = $('#navAgents'); if (nb) { nb.hidden = !queue.length; nb.textContent = queue.length; }
    state.agentPays = new Map(queue.map(p => [String(p.id), p]));
    main.innerHTML = `
      <div class="page-head"><div><h2>Agents</h2><p>An agent earns <b>${rules.pct}%</b> of each new player's <b>first deposit</b>. The earning can be requested once that player has staked ${rules.turnover > 0 ? `${rules.turnover}× their deposit` : 'anything'} on settled bets, so deposits made only to be withdrawn earn nothing. Agents request payouts to their Mobile Money (Ghana) or bank account (Nigeria): send the money there, then press Mark as paid. Agents see their members and deposits day by day, from 6 AM to 6 AM Ghana time. Make a player an agent from their drawer (Players → the player → Make agent). Change the rules in Settings (<span class="mono">agents</span>).</p></div></div>
      <div class="card"><div class="card-h"><h3>Payout requests <span class="sub">${queue.length} waiting</span></h3></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Requested</th><th>Agent</th><th class="r">Amount</th><th>Send to</th><th class="wrap">From these players' first deposits</th><th></th></tr></thead><tbody>
        ${queue.map(p => `<tr><td class="muted">${when(p.created_at)}<div class="small">${ago(p.created_at)}</div></td><td><div class="who"><b>${esc(p.full_name || phoneFmt(p.country, p.phone))}</b><small>ID ${p.uid} · ${flag(p.country)}<span class="mono">${esc(p.agent_code || '')}</span></small></div></td>
          <td class="r amt in">${money(p.amount, p.country)}</td><td>${p.details ? `<div class="who"><b class="mono">${esc(p.to || '')}</b><small>${esc(p.details.name || '')}</small></div>` : '<span class="muted small">Agent balance (old request)</span>'}</td><td class="wrap small">${p.players.map(x => `${esc(x.name || 'Player')} (ID ${x.uid}) · deposit ${money(x.deposit, p.country)} → ${money(x.earning, p.country)}`).join('<br>') || '–'}</td>
          <td><div class="acts"><button class="btn xs primary" data-agpay="${p.id}" data-act="approve">Approve</button><button class="btn xs danger" data-agpay="${p.id}" data-act="reject">Reject</button></div></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty"><b>No requests waiting</b>Agents\' payout requests appear here.</div></td></tr>'}
      </tbody></table></div></div>
      <div class="card"><div class="card-h"><h3>Agents <span class="sub">${agents.filter(a => a.is_agent).length} active</span></h3></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Code &amp; link</th><th class="r">Players</th><th class="r">First deposits</th><th class="r">Waiting for play</th><th class="r">Owed</th><th class="r">Paid</th><th></th></tr></thead><tbody>
        ${agents.map(a => `<tr><td><div class="who"><b class="lnk" data-user="${a.id}">${esc(a.full_name || phoneFmt(a.country, a.phone))}</b><small>ID ${a.uid} · ${flag(a.country)}${a.is_agent ? '' : ' · <span class="pill">stopped</span>'}</small></div></td>
          <td><span class="mono">${esc(a.agent_code || '')}</span>${a.link ? `<div class="agent-link"><input readonly value="${esc(location.origin + '/?agent=' + a.agent_code)}" onclick="this.select()"></div>` : ''}</td>
          <td class="r">${int(a.players)}</td><td class="r">${int(a.deposited)}<div class="small muted">${money(a.deposits, a.country)}</div></td><td class="r">${money(a.pending, a.country)}</td><td class="r"><b>${money(a.owed, a.country)}</b></td><td class="r">${money(a.paid, a.country)}</td>
          <td>${a.is_agent ? `<button class="btn xs" data-agent-set="${a.id}" data-v="false">Stop</button>` : `<button class="btn xs" data-agent-set="${a.id}" data-v="true">Restart</button>`}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>No agents yet</b>Open a player (Players) and press Make agent.</div></td></tr>'}
      </tbody></table></div></div>
      ${done.filter(p => p.status !== 'pending').length ? `<div class="card"><div class="card-h"><h3>Decided payouts</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Decided</th><th>Agent</th><th class="r">Amount</th><th>Sent to</th><th>Status</th></tr></thead><tbody>
        ${done.filter(p => p.status !== 'pending').slice(0, 50).map(p => `<tr><td class="muted">${when(p.decided_at)}</td><td>${esc(p.full_name || '')} · ID ${p.uid}</td><td class="r">${money(p.amount, p.country)}</td><td class="mono small">${esc(p.to || 'Balance')}</td><td>${pill(p.status, P_AGP)}${p.reason ? `<div class="small muted">${esc(p.reason)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  };
  function agentPayoutAction(id, act) {
    const p = (state.agentPays && state.agentPays.get(String(id))) || {}, ok = act === 'approve', cc = p.country || 'GH', D = p.details;
    openModal(`<h3>${ok ? (D ? 'Mark this agent payout as paid' : 'Approve this agent payout') : 'Reject this agent payout'}</h3>
      <p class="sub">${ok ? (D ? `First send <b>${money(p.amount, cc)}</b> to the ${D.method === 'mobile_money' ? 'MoMo number' : 'bank account'} below, then press Mark as paid. Nothing goes into the agent's balance.` : `${money(p.amount, cc)} goes into the agent's balance at once (ledger: agent commission). They can then withdraw it like any player.`) : 'The earnings go back to the agent as available; tell them why.'}</p>
      <dl class="kv"><dt>Agent</dt><dd>${esc(p.full_name || '')} · ID ${p.uid} · <span class="mono">${esc(p.agent_code || '')}</span></dd><dt>Amount</dt><dd><b>${money(p.amount, cc)}</b></dd>${D ? `<dt>Send to</dt><dd><b class="mono">${esc(p.to || '')}</b> <button type="button" class="btn xs" data-copytxt="${esc(D.method === 'mobile_money' ? '0' + D.phone : D.acct)}">Copy</button><div class="small">${esc(D.name || '')}</div></dd>` : ''}<dt>Players</dt><dd class="small">${(p.players || []).map(x => `${esc(x.name || 'Player')} (ID ${x.uid}) · ${money(x.deposit, cc)}`).join('<br>') || '–'}</dd></dl>
      ${ok ? '' : '<label class="field"><span>Reason the agent sees</span><input id="agReason" maxlength="200"></label>'}
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn ${ok ? 'primary' : 'danger solid'}" id="mGo">${ok ? (D ? 'Mark as paid · ' : 'Approve ') + money(p.amount, cc) : 'Reject'}</button></div>`);
    $$('#modalBody [data-copytxt]').forEach(b => b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copytxt); toast('Copied', 'ok'); } catch {} });
    $('#mGo').onclick = async () => {
      const reason = ok ? '' : $('#agReason').value.trim(); if (!ok && !reason) return $('#agReason').focus();
      try { $('#mGo').disabled = true; await API.admin.agentPayout(id, act, reason); closeModal(); toast(ok ? (D ? 'Marked as paid – the agent sees it as sent' : 'Paid into the agent\'s balance') : 'Payout rejected', 'ok'); render(true); }
      catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; }
    };
  }

  /* ---------- Send money (from the Moolre wallet to any MoMo number) ---------- */
  const P_SEND = { pending: ['warn', 'Sending'], success: ['ok', 'Sent'], failed: ['bad', 'Failed'] };
  PAGES.sendmoney = async main => {
    const w = await API.admin.wallet(), L = w.limits;
    const bal = !w.enabled ? '<div class="banner warn">The payment API is not connected – set the Moolre keys in Railway.</div>'
      : w.balance && !w.balance.error ? `<div class="banner ok">${esc(w.label)} wallet <b>${esc(w.balance.name || '')}</b> · balance <b>${money(w.balance.amount, 'GH')}</b></div>`
      : `<div class="banner warn">Cannot read the ${esc(w.label)} wallet: ${esc((w.balance && w.balance.error) || 'unknown')}. Sending needs a working private key and this server's IP whitelisted in Moolre.</div>`;
    main.innerHTML = `
      <div class="page-head"><div><h2>Send money</h2><p>Send money from the ${esc(w.label || 'Moolre')} wallet to any Mobile Money number – to pay someone by hand or to move takings to your own wallet. No player balance changes. To pay a player's withdrawal, use <b>Payments → Review → Approve &amp; send</b> instead: it settles the withdrawal too.</p></div></div>
      ${bal}
      <div class="set-grid">
        <div class="card set-card"><div class="card-b"><h4>New transfer</h4>
          <div class="desc">Limits: ${money(L.maxPerTransfer, 'GH')} per transfer, ${money(L.maxPerDay, 'GH')} per 24 hours · <b>${money(w.leftToday, 'GH')}</b> left now. Change them in Settings (<span class="mono">wallet_payouts</span>).</div>
          <div class="field-row"><label class="field sm"><span>Network</span><select id="sNet">${Object.entries(NET).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
            <label class="field"><span>MoMo number</span><input id="sPhone" inputmode="numeric" maxlength="13" placeholder="024 123 4567"></label></div>
          <div class="field-row"><label class="field"><span>Amount (GH₵)</span><input id="sAmt" type="number" step="0.01" min="1"></label>
            <label class="field"><span>Reason (kept in the record)</span><input id="sReason" maxlength="200" placeholder="e.g. Takings to company wallet"></label></div>
          <p class="help" id="sName">Check the name on the number before sending.</p>
          <p class="form-err" id="sErr" hidden></p>
          <div class="m-actions"><button class="btn" id="sCheck">Check name</button><button class="btn primary" id="sGo" ${w.enabled ? '' : 'disabled'}>Send…</button></div>
        </div></div>
      </div>
      <div class="card"><div class="card-h"><h3>Transfers <span class="sub">${money(w.sentToday, 'GH')} in the last 24 hours</span></h3></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>To</th><th>Name on the wallet</th><th class="r">Amount</th><th>Reason</th><th>By</th><th>Status</th><th></th></tr></thead><tbody>
        ${w.payouts.map(x => `<tr><td class="muted">${when(x.at)}</td><td><span class="mono">${esc((NET[x.network] || x.network) + ' · 0' + x.phone)}</span></td><td>${esc(x.name || '–')}</td><td class="r amt out">${money(x.amount, 'GH')}</td>
          <td class="wrap small">${esc(x.reason)}${x.error ? `<div class="muted">${esc(x.error)}</div>` : ''}<div class="muted mono small">${esc(x.reference || '')}</div></td><td class="small">${esc(x.by)}</td><td>${pill(x.status, P_SEND)}</td>
          <td>${x.status === 'pending' ? `<button class="btn xs" data-wcheck="${x.id}">Check</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>No transfers yet</b>Money you send from the wallet appears here.</div></td></tr>'}
      </tbody></table></div></div>`;
    const val = () => ({ network: $('#sNet').value, phone: $('#sPhone').value.replace(/\D/g, ''), amount: +$('#sAmt').value, reason: $('#sReason').value.trim() });
    const err = m => { $('#sErr').textContent = m; $('#sErr').hidden = !m; };
    let checked = null;
    const lookup = async () => {
      const v = val(); err('');
      if (v.phone.replace(/^233/, '').replace(/^0/, '').length !== 9) { err('Enter a 10-digit MoMo number, e.g. 024 123 4567.'); return null; }
      $('#sName').textContent = 'Checking…';
      try {
        const r = await API.admin.walletLookup(v.phone, v.network);
        checked = { ...v, name: r.name || null, status: r.status };
        $('#sName').innerHTML = r.status === 'found' ? `Registered name: <b>${esc(r.name)}</b>` : r.status === 'not_found' ? '<span class="pill bad">No MoMo wallet on this number</span>' : `Name check failed: ${esc(r.reason || '')}`;
        return checked;
      } catch (e) { $('#sName').textContent = errMsg(e); return null; }
    };
    $('#sCheck').onclick = lookup;
    ['#sNet', '#sPhone'].forEach(s => { $(s).oninput = () => { checked = null; $('#sName').textContent = 'Check the name on the number before sending.'; }; });
    $('#sGo').onclick = async () => {
      const v = val(); err('');
      if (!(v.amount >= 1)) return err('Enter the amount (GH₵1 or more).');
      if (v.reason.length < 3) return err('Write the reason – it is kept with the transfer.');
      const c = checked && checked.phone === v.phone && checked.network === v.network ? checked : await lookup();
      if (!c) return;
      if (c.status === 'not_found') return err('There is no MoMo wallet on this number.');
      openModal(`<h3>Send ${money(v.amount, 'GH')}?</h3><p class="sub">This money leaves the ${esc(w.label)} wallet at once and cannot be called back.</p>
        <dl class="kv"><dt>To</dt><dd><span class="mono">${esc((NET[v.network] || v.network) + ' · ' + v.phone)}</span></dd><dt>Name on the wallet</dt><dd><b>${esc(c.name || 'not confirmed')}</b></dd><dt>Amount</dt><dd><b>${money(v.amount, 'GH')}</b></dd><dt>Reason</dt><dd>${esc(v.reason)}</dd></dl>
        <label class="field"><span>Your admin password</span><input id="sPw" type="password" autocomplete="current-password"></label>
        <p class="form-err" id="sPwErr" hidden></p>
        <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="sSend">Send ${money(v.amount, 'GH')}</button></div>`);
      $('#sSend').onclick = async () => {
        const pw = $('#sPw').value; if (!pw) return $('#sPw').focus();
        try {
          $('#sSend').disabled = true; $('#sSend').textContent = 'Sending…';
          const r = await API.admin.walletSend({ ...v, password: pw });
          closeModal(); toast(r.status === 'success' ? `Sent ${money(v.amount, 'GH')} to ${c.name || v.phone}` : `Sending – waiting for ${w.label} to confirm`, 'ok'); render(true);
        } catch (e) { const m = $('#sPwErr'); m.textContent = errMsg(e); m.hidden = false; $('#sSend').disabled = false; $('#sSend').textContent = `Send ${money(v.amount, 'GH')}`; if (e.message === 'payout_failed') render(true); }
      };
    };
    $$('#main [data-wcheck]').forEach(b => b.onclick = async () => { try { b.disabled = true; const r = await API.admin.walletCheck(b.dataset.wcheck); toast(r.status === 'pending' ? 'Still waiting for confirmation' : r.status === 'success' ? 'Confirmed: sent' : 'Failed: ' + (r.error || ''), r.status === 'failed' ? 'err' : 'ok'); render(true); } catch (e) { toast(errMsg(e), 'err'); b.disabled = false; } });
  };

  /* ---------- Promo codes ---------- */
  PAGES.promos = async main => {
    const rows = await API.admin.promos(), now = Date.now();
    const st = p => !p.active ? ['', 'Paused'] : p.ends_at && new Date(p.ends_at) <= now ? ['', 'Ended'] : p.max_uses && p.uses >= p.max_uses ? ['warn', 'Used up'] : ['ok', 'Live'];
    main.innerHTML = `
      <div class="page-head"><div><h2>Promo codes</h2><p>Codes players type on Me → Bonuses. Each player can use a code once, only in its country. The bonus stays locked until they stake the wagering multiple on multiples (every selection 1.50 or more) within the days you set. Set wagering to 0 to pay it as cash at once. By default a player must have made a deposit before a code works, which stops throw-away accounts collecting codes.</p></div>
        <div class="page-actions"><button class="btn primary" id="newPromo">${IC.plus} New promo code</button></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Country</th><th class="r">Bonus</th><th>Wagering</th><th class="r">Used</th><th>Ends</th><th>Status</th><th class="r">Given</th><th></th></tr></thead><tbody>
        ${rows.map(p => { const [cls, label] = st(p); return `<tr><td><b class="mono">${esc(p.code)}</b>${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td>${flag(p.country)}</td><td class="r">${money(p.amount, p.country)}</td>
          <td>${p.times > 0 ? `${p.times}× within ${p.days} days` : 'Cash at once'}<div class="small muted">${[p.requires_deposit ? 'after a deposit' : 'no deposit needed', p.new_players_only ? 'new players only' : ''].filter(Boolean).join(' · ')}</div></td>
          <td class="r">${int(p.uses)}${p.max_uses ? ' / ' + int(p.max_uses) : ''}</td><td class="muted">${p.ends_at ? when(p.ends_at) : 'No end date'}</td><td><span class="pill ${cls}">${label}</span></td>
          <td class="r">${money(p.given, p.country)}<div class="small muted">${money(p.released, p.country)} unlocked</div></td>
          <td><div class="acts"><button class="btn xs" data-promo-toggle="${esc(p.code)}" data-v="${p.active ? 'false' : 'true'}">${p.active ? 'Pause' : 'Resume'}</button></div></td></tr>`; }).join('') || '<tr><td colspan="9"><div class="empty"><b>No promo codes yet</b>Create one with “New promo code”.</div></td></tr>'}
      </tbody></table></div></div>`;
    $('#newPromo').onclick = promoModal;
    $$('#main [data-promo-toggle]').forEach(b => b.onclick = async () => {
      try { b.disabled = true; await API.admin.updatePromo(b.dataset.promoToggle, { active: b.dataset.v === 'true' }); toast(b.dataset.v === 'true' ? 'Code resumed' : 'Code paused – players can no longer use it', 'ok'); render(true); }
      catch (e) { toast(errMsg(e), 'err'); b.disabled = false; }
    });
  };
  function promoModal() {
    const cc = state.me.country || 'GH';
    openModal(`<h3>New promo code</h3><p class="sub">Players type the code on Me → Bonuses. The amount, wagering and days cannot be changed once the code exists. You can pause it, or change the use limit and end date.</p>
      <div class="field-row"><label class="field"><span>Code (4–20 letters / digits)</span><input id="pCode" maxlength="20" placeholder="e.g. WELCOME50" style="text-transform:uppercase"></label>
        <label class="field sm"><span>Country</span><select id="pCc"><option value="GH" ${cc === 'GH' ? 'selected' : ''}>Ghana (GH₵)</option><option value="NG" ${cc === 'NG' ? 'selected' : ''}>Nigeria (₦)</option></select></label></div>
      <div class="field-row"><label class="field"><span>Bonus amount</span><input id="pAmt" type="number" step="0.01" min="1"></label>
        <label class="field"><span>Wagering (× bonus, 0 = cash)</span><input id="pTimes" type="number" step="0.5" min="0" max="50" value="5"></label>
        <label class="field"><span>Days to unlock</span><input id="pDays" type="number" step="1" min="1" max="90" value="7"></label></div>
      <div class="field-row"><label class="field"><span>Max players (blank = no limit)</span><input id="pMax" type="number" step="1" min="1"></label>
        <label class="field"><span>Ends (optional, your local time)</span><input id="pEnd" type="datetime-local"></label></div>
      <label class="chk"><input type="checkbox" id="pDep" checked> Only after the player has made a deposit (recommended)</label>
      <label class="chk"><input type="checkbox" id="pNew"> Only players who sign up after the code is created</label>
      <label class="field"><span>Note for admins (optional)</span><input id="pNote" maxlength="200" placeholder="e.g. Instagram campaign, November"></label>
      <p class="form-err" id="pErr" hidden></p>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Create code</button></div>`);
    $('#mGo').onclick = async () => {
      const er = $('#pErr'), show = m => { er.textContent = m; er.hidden = false; }; er.hidden = true;
      const code = $('#pCode').value.trim().toUpperCase().replace(/\s+/g, ''), amount = +$('#pAmt').value, times = $('#pTimes').value === '' ? 5 : +$('#pTimes').value, days = +$('#pDays').value || 7;
      if (!/^[A-Z0-9]{4,20}$/.test(code)) return show('The code needs 4 to 20 letters or digits, without spaces or symbols.');
      if (!(amount > 0)) return show('Enter the bonus amount.');
      const body = { code, country: $('#pCc').value, amount, times, days, requiresDeposit: $('#pDep').checked, newPlayersOnly: $('#pNew').checked, note: $('#pNote').value.trim() };
      if ($('#pMax').value) body.maxUses = Math.floor(+$('#pMax').value);
      if ($('#pEnd').value) { const d = new Date($('#pEnd').value); if (isNaN(d) || d <= new Date()) return show('The end date must be in the future.'); body.endsAt = d.toISOString(); }
      try { $('#mGo').disabled = true; await API.admin.createPromo(body); closeModal(); toast(`Code ${code} is live`, 'ok'); render(true); }
      catch (e) { show(errMsg(e)); $('#mGo').disabled = false; }
    };
  }

  /* ---------- Payment settings ---------- */
  PAGES.paysettings = async main => {
    const { settings: st, api, withdrawals: wd } = await API.admin.paymentSettings();
    state.api = api;
    const ng = st.NG, gh = st.GH, b = ng.bank, m = gh.momo;
    const f = (name, label, val, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
    const lims = (cc, c) => `<div class="field-row">${f(cc + '.minDeposit', `Min deposit (${SYM[cc]})`, c.minDeposit, 'type="number" min="1" step="any"')}${f(cc + '.maxDeposit', `Max deposit (${SYM[cc]})`, c.maxDeposit, 'type="number" min="1" step="any"')}</div>
      <div class="field-row">${f(cc + '.minWithdraw', `Min withdrawal (${SYM[cc]})`, c.minWithdraw, 'type="number" min="1" step="any"')}${f(cc + '.maxWithdraw', `Max withdrawal (${SYM[cc]})`, c.maxWithdraw, 'type="number" min="1" step="any"')}</div>
      ${f(cc + '.payoutTime', 'Payout time shown to players', c.payoutTime, 'maxlength="40" placeholder="within 24 hours"')}`;
    const open = !!(b.bank && b.number && b.name);
    main.innerHTML = `
      <div class="page-head"><div><h2>Payment settings</h2><p>What players see when they deposit, and the limits for money in and out. Changes apply at once and are written to the audit log.</p></div></div>
      <form id="paySet" class="set-grid" novalidate>
        <div class="card set-card"><div class="card-b"><h4>${flag('NG')}Nigeria – bank transfer deposits</h4>
          <div class="desc">Players transfer to this account with their reference (LB + their ID) in the narration, then tap “I have sent it”. You confirm each deposit in Payments when the money shows up.</div>
          <div class="banner ${open ? 'ok' : 'warn'}">${open ? 'Open – players see this account on the deposit page.' : 'Closed – Nigerian players cannot deposit until the account is filled in.'}</div>
          ${f('NG.bank.bank', 'Bank name', b.bank, 'maxlength="60" placeholder="e.g. Access Bank"')}
          ${f('NG.bank.number', 'Account number', b.number, 'inputmode="numeric" maxlength="10" placeholder="10 digits"')}
          ${f('NG.bank.name', 'Account name', b.name, 'maxlength="80"')}
          ${f('NG.bank.note', 'Note for players (optional)', b.note, 'maxlength="200" placeholder="e.g. Transfers after 10pm are confirmed in the morning"')}
          ${lims('NG', ng)}
        </div></div>
        <div class="card set-card"><div class="card-b"><h4>${flag('GH')}Ghana – Mobile Money</h4>
          <div class="desc">Deposits go through the payment API: the player approves the prompt on their phone and the deposit is credited automatically once the provider confirms the money arrived – nobody confirms these by hand. Withdrawals are sent from here with one click. Without an API you can take manual MoMo deposits below.</div>
          ${api.enabled ? `<div class="banner ok">${esc(api.label)} connected${api.test ? ' – <b>test mode</b>, no real money' : ''}${Array.isArray(api.balance) ? ` · ${esc(api.label)} balance ` + api.balance.map(x => money(x.balance, x.currency === 'GHS' ? 'GH' : 'NG')).join(', ') : api.balance && api.balance.error ? ' · ' + esc(api.balance.error) : ''}</div>`
            : '<div class="banner warn">Payment API not connected – set the Moolre keys (<span class="mono">MOOLRE_USER</span>, <span class="mono">MOOLRE_PUBLIC_KEY</span>, <span class="mono">MOOLRE_PRIVATE_KEY</span>, <span class="mono">MOOLRE_ACCOUNT_NUMBER</span>) in Railway → Variables.</div>'}
          ${api.provider === 'moolre' && api.account ? `<div class="banner ${api.account.activated && api.account.callbackOk && api.signed ? 'ok' : 'warn'}">Wallet <b>${esc(api.account.name || '–')}</b> · API access ${api.account.activated ? 'on' : '<b>off – switch it on in Moolre</b>'} · webhook ${api.account.callbackOk ? 'registered' : '<b>not registered – run scripts/moolre-setup.js</b>'}${api.signed ? ' · signatures checked' : ' · <b>MOOLRE_WEBHOOK_SECRET not set</b>'}</div>` : ''}
          ${api.webhook ? `<label class="field"><span>Webhook URL${api.provider === 'paystack' ? ' – paste it in Paystack → Settings → API Keys &amp; Webhooks' : ' (set on the Moolre wallet)'}</span><input readonly value="${esc(api.webhook)}" onclick="this.select()"></label>` : ''}
          <h5>Manual MoMo ${api.enabled ? '(not used while the API is connected)' : ''}</h5>
          <label class="field"><span>Network</span><select name="GH.momo.network">${Object.entries(NET).map(([v, l]) => `<option value="${v}" ${m.network === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${f('GH.momo.number', 'MoMo number', m.number ? '0' + m.number : '', 'inputmode="numeric" maxlength="10" placeholder="024 123 4567"')}
          ${f('GH.momo.name', 'Name on the wallet', m.name, 'maxlength="80"')}
          ${f('GH.momo.note', 'Note for players (optional)', m.note, 'maxlength="200"')}
          <h5>USSD deposits (manual)</h5>
          <p class="small muted">Players dial this code, pay, and type the transaction ID; the deposit waits in Payments for you to confirm. Leave empty to hide the option.</p>
          ${f('GH.ussd.code', 'USSD code', (gh.ussd && gh.ussd.code) || '', 'maxlength="40" placeholder="*203*0778606#"')}
          ${f('GH.ussd.name', 'Pays to (name players see, optional)', (gh.ussd && gh.ussd.name) || '', 'maxlength="80"')}
          ${f('GH.ussd.note', 'Note for players (optional)', (gh.ussd && gh.ussd.note) || '', 'maxlength="200"')}
          ${lims('GH', gh)}
        </div></div>
      </form>
      <div class="set-foot sticky"><p class="form-err" id="psErr" hidden></p><span class="saved" hidden>Saved</span><button class="btn primary" id="psSave">Save payment settings</button></div>`;
    // withdrawals (and sending money to a friend): suspended for everyone, and only after Deposit 1, 2, 3 – saved on its own
    const W = wd || { suspended: false, requireDeposits: true, newMembersOpen: true, message: '' };
    $('#main .page-head').insertAdjacentHTML('afterend', `<div class="card set-card wd-card" data-set="withdrawals"><div class="card-b"><h4>Withdrawals</h4>
      <div class="banner ${W.suspended ? 'warn' : 'ok'}" id="wdState">${W.suspended ? '<b>Suspended</b> – no player can request a withdrawal or send money to a friend.' : W.requireDeposits !== false ? `<b>Open</b> – for players who have made Deposit 1, 2 and 3${W.newMembersOpen !== false ? ', and for new members who have not deposited yet' : ''}.` : '<b>Open</b> – for every player.'}</div>
      <label class="chk"><input type="checkbox" id="wdSusp" ${W.suspended ? 'checked' : ''}> Suspend all withdrawals <span class="muted">(you can still pay or reject the ones already waiting)</span></label>
      <label class="chk"><input type="checkbox" id="wdDeps" ${W.requireDeposits !== false ? 'checked' : ''}> Only after Deposit 1, 2 and 3 are all done <span class="muted">(with Deposit bonuses 1 · 2 · 3 on)</span></label>
      <label class="chk"><input type="checkbox" id="wdNew" ${W.newMembersOpen !== false ? 'checked' : ''}> New members can withdraw before their first deposit <span class="muted">(the rule starts with their first deposit – the deposit page tells them)</span></label>
      <label class="field"><span>Message to players while suspended (optional)</span><input id="wdMsg" maxlength="200" value="${esc(W.message || '')}" placeholder="e.g. Withdrawals reopen on Monday"></label>
      <div class="set-foot"><span class="saved" hidden>Saved</span><button class="btn primary" id="wdSave">Save withdrawals</button></div></div></div>`);
    $('#wdSave').onclick = async () => {
      const v = { suspended: $('#wdSusp').checked, requireDeposits: $('#wdDeps').checked, newMembersOpen: $('#wdNew').checked, message: $('#wdMsg').value.trim() };
      try { $('#wdSave').disabled = true; await API.admin.setSetting('withdrawals', v); toast(v.suspended ? 'Withdrawals suspended' : 'Withdrawals saved', 'ok'); render(true); }
      catch (e) { toast(errMsg(e), 'err'); } finally { $('#wdSave').disabled = false; }
    };
    $('#psSave').onclick = async () => {
      const v = { NG: { bank: {} }, GH: { momo: {}, ussd: {} } };
      $$('#paySet [name]').forEach(i => { const path = i.name.split('.'); let o = v; for (let k = 0; k < path.length - 1; k++) o = o[path[k]] = o[path[k]] || {}; o[path[path.length - 1]] = i.type === 'number' ? +i.value : i.value.trim(); });
      v.NG.bank.number = v.NG.bank.number.replace(/\D/g, ''); v.GH.momo.number = v.GH.momo.number.replace(/\D/g, '');
      const er = $('#psErr'); er.hidden = true;
      if (v.NG.bank.number && v.NG.bank.number.length !== 10) { er.textContent = 'A Nigerian account number has 10 digits.'; er.hidden = false; return; }
      try { $('#psSave').disabled = true; await API.admin.savePaymentSettings(v); toast('Payment settings saved', 'ok'); chips(); render(true); }
      catch (e) { er.textContent = e.data && e.data.details ? 'Check: ' + Object.keys(e.data.details).join(', ') : errMsg(e); er.hidden = false; toast(errMsg(e), 'err'); }
      finally { $('#psSave').disabled = false; }
    };
  };

  /* ---------- Email ---------- */
  PAGES.email = async main => {
    const [st, log] = await Promise.all([API.admin.emailStatus(), API.admin.emailLog()]);
    const P = { sent: ['ok', 'Sent'], logged: ['', 'Logged only'], failed: ['bad', 'Failed'] };
    main.innerHTML = `
      <div class="page-head"><div><h2>Email</h2><p>Transactional email: sign-up codes, receipts, bet confirmations and settlements. Provider settings live in the server environment; this page shows whether delivery works.</p></div>
        <div class="page-actions"><button class="btn" id="mailCheck">Test connection</button><button class="btn primary" id="mailTest">Send a test email</button></div></div>
      <div class="card"><div class="card-b mail-status">
        <div class="stat"><small>Provider</small><b>${esc(st.provider || 'console')}</b></div><div class="stat"><small>Status</small><b>${st.provider === 'console' ? pill('c', { c: ['warn', 'Console – nothing is delivered'] }) : st.ready ? pill('r', { r: ['ok', 'Ready'] }) : pill('n', { n: ['bad', 'Not ready'] })}</b></div><div class="stat"><small>Sender</small><b class="small">${esc(st.from || '–')}</b></div><div class="stat"><small>Server</small><b class="small">${esc(st.server || st.host || '–')}</b></div>${st.error ? `<div class="stat" style="grid-column:1/-1"><small>Last error</small><b class="small" style="color:var(--red)">${esc(st.error)}</b></div>` : ''}
      </div></div>
      <div class="card mt"><div class="card-h"><h3>Recent emails <span class="sub">last 100</span></h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Template</th><th class="wrap">Subject</th><th>To</th><th>Status</th><th class="wrap">Error</th></tr></thead><tbody>
        ${log.map(m => `<tr><td class="muted">${when(m.sent_at)}</td><td>${esc(m.template)}</td><td class="wrap">${esc(m.subject)}</td><td>${m.email ? esc(m.email) : m.uid ? 'ID ' + m.uid : '–'}</td><td>${pill(m.status, P)}</td><td class="wrap small muted">${esc(m.error || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No emails sent yet.</div></td></tr>'}
      </tbody></table></div></div>`;
    $('#mailCheck').onclick = async () => { try { const r = await API.admin.emailStatus(true); toast(r.ready ? 'Connection OK' : 'Not ready: ' + (r.error || 'see status'), r.ready ? 'ok' : 'err'); render(true); } catch (e) { toast(errMsg(e), 'err'); } };
    $('#mailTest').onclick = () => { openModal(`<h3>Send a test email</h3><p class="sub">A sample welcome email goes through the configured provider.</p><label class="field"><span>To</span><input id="mTo" type="email" value="${esc(state.me.email || '')}"></label><div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Send</button></div>`);
      $('#mGo').onclick = async () => { try { $('#mGo').disabled = true; const r = await API.admin.emailTest($('#mTo').value.trim()); closeModal(); toast(`Sent via ${r.provider} (${r.status})`, 'ok'); render(true); } catch (e) { toast((e.data && e.data.error) || errMsg(e), 'err'); $('#mGo').disabled = false; } }; };
  };

  /* ---------- Audit log ---------- */
  PAGES.audit = async main => {
    const log = await API.admin.log();
    const describe = l => { const a = l.action, m = l.meta || {};
      if (/deposit-request/.test(a)) return `Asked a player to deposit${m.amount ? ' ' + esc(String(m.amount)) : ''}${m.note ? ' – “' + esc(m.note) + '”' : ''}`;
      if (/notices\/:id\/cancel/.test(a)) return 'Cancelled a deposit request';
      if (/users\/:id\/deposits/.test(a)) return `${m.credit ? 'Credited' : 'Added a pending'} deposit for a player – ${esc(String(m.amount))}${m.reference ? ' · ref ' + esc(m.reference) : ''}`;
      if (/payment-settings/.test(a)) return `Changed payment settings${m.NG && m.NG.bank ? ` · Nigeria account ${esc(m.NG.bank.bank || '')} ${esc(m.NG.bank.number || '')}` : ''}`;
      if (/payout/.test(a)) return `Sent payout ${esc((l.target || '').split('/')[0].slice(0, 8))} through the payment API`;
      if (/kyc/.test(a)) return `${m.approve ? 'Approved' : 'Rejected'} ID check${m.reason ? ' – ' + esc(m.reason) : ''}`;
      if (/payments/.test(a) && m.amount) return `Confirmed deposit ${esc((l.target || '').split('/')[0].slice(0, 8))} – credited ${m.amount}`;
      if (/payments/.test(a)) return `${l.target && l.target.endsWith('approve') ? 'Approved' : 'Rejected'} payment ${esc((l.target || '').split('/')[0].slice(0, 8))}${m.reason ? ' – ' + esc(m.reason) : ''}`; if (/adjust/.test(a)) return `Balance adjustment ${m.amount > 0 ? '+' : ''}${m.amount} (${esc(m.type || 'adjustment')}) – ${esc(m.reason || '')}`; if (/users\/:id$/.test(a)) return `Updated player: ${esc(Object.entries(m).map(([k, v]) => k + '=' + v).join(', '))}`; if (/void/.test(a)) return `Voided ticket ${esc(l.target)}`; if (/markets/.test(a)) return `Market ${esc(l.target)}: ${m.suspended != null ? (m.suspended ? 'suspended' : 'reopened') : ''}${m.outcome ? ` price ${esc(m.outcome)} → ${m.price}` : ''}`; if (/suspend/.test(a)) return `${m.suspended ? 'Suspended' : 'Reopened'} all markets on event ${esc(l.target)}`; if (/result/.test(a)) return m.cancelled ? `Cancelled event ${esc(l.target)}` : `Result entered for event ${esc(l.target)}: ${m.home}–${m.away}${m.htHome != null && m.htAway != null ? ` (HT ${m.htHome}–${m.htAway})` : ''}`; if (/settings/.test(a)) return `Setting <span class="mono">${esc(l.target)}</span> = <span class="mono">${esc(JSON.stringify(m.value))}</span>`; if (/jackpot/.test(a)) return `Jackpot settlement${m.round ? ' of round ' + esc(m.round) : ''}`; if (/email\/test/.test(a)) return `Test email to ${esc(m.to || '')}`; return esc(a); };
    main.innerHTML = `
      <div class="page-head"><div><h2>Audit log</h2><p>Every change made from this portal, by whom and when. Read-only.</p></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Administrator</th><th class="wrap">Action</th><th>Endpoint</th></tr></thead><tbody>
        ${log.map(l => `<tr><td class="muted">${when(l.at)}<div class="small">${ago(l.at)}</div></td><td><div class="who"><b>${esc(l.full_name || 'Admin')}</b><small>ID ${l.uid}</small></div></td><td class="wrap">${describe(l)}</td><td class="mono muted">${esc(l.action)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty"><b>Nothing yet</b>Actions taken in the portal appear here.</div></td></tr>'}
      </tbody></table></div></div>`;
  };

  /* =====================================================
     Charts – inline SVG, one y axis, hover tooltip, table view
     ===================================================== */
  const X = 44, R = 10, T = 12, B = 26, W = 640, H = 220;
  const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10; return m * p; };
  const labelSet = n => { const step = n <= 8 ? 1 : Math.ceil(n / 7); const set = new Set(); for (let i = 0; i < n; i += step) set.add(i); const last = Math.max(...set); if (last !== n - 1) { if (n - 1 - last >= step / 2) set.add(n - 1); else { set.delete(last); set.add(n - 1); } } return set; };
  const dayLbl = d => { const x = new Date(d + 'T00:00:00Z'); return x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
  function frame({ id, title, sub, series, days, kind }) {
    const legend = `<div class="legend">${series.map(s => `<span><i class="${kind === 'line' ? 'line' : ''}" style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>`;
    const table = `<div class="viz-table"><table><thead><tr><th>Day</th>${series.map(s => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${days.map(d => `<tr><td>${dayLbl(d.d)}</td>${series.map(s => `<td>${(s.fmt || int)(d[s.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    return { legend, table, head: `<div class="viz-top"><div><h3 style="font-size:14px;font-weight:700">${title}</h3><div class="muted small">${sub}</div></div><div style="display:flex;gap:10px;align-items:center">${legend}<button class="btn xs" data-viz-table="${id}">Table</button></div></div>` };
  }
  function axes(mx, fmt) {
    const ticks = [0, .25, .5, .75, 1].map(f => f * mx);
    const f = mx <= 10 ? v => (fmt === int ? (Number.isInteger(v) ? int(v) : '') : fmt(v)) : fmt;
    return ticks.map(v => { const y = T + (H - T - B) * (1 - v / mx); const lbl = f(v); return `<line class="grid" x1="${X}" x2="${W - R}" y1="${y}" y2="${y}"/>${lbl === '' ? '' : `<text x="${X - 6}" y="${y + 4}" text-anchor="end">${lbl}</text>`}`; }).join('');
  }
  function chartBars(o) {
    const { days, series, cc } = o; const fmt = o.fmt || (v => compact(v, cc)); series.forEach(s => s.fmt = s.fmt || (v => o.fmt ? o.fmt(v) : money(v, cc)));
    const mx = niceMax(Math.max(...days.flatMap(d => series.map(s => d[s.key])), 1));
    const n = days.length, gw = (W - X - R) / n, bw = Math.max(3, (gw - 8) / series.length - 2);
    const bars = days.map((d, i) => series.map((s, j) => { const v = d[s.key]; const h = Math.max(0, (H - T - B) * (v / mx)); const x = X + i * gw + 4 + j * (bw + 2); const y = H - B - h; const r = Math.min(3, h); return h ? `<path d="M${x} ${H - B}V${y + r}a${r} ${r} 0 0 1 ${r}-${r}h${bw - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${H - B}z" fill="${s.color}"/>` : ''; }).join('')).join('');
    const show = labelSet(n); const xl = days.map((d, i) => show.has(i) ? `<text x="${X + i * gw + gw / 2}" y="${H - 8}" text-anchor="middle">${dayLbl(d.d)}</text>` : '').join('');
    const hits = days.map((d, i) => `<rect class="hit" data-i="${i}" x="${X + i * gw}" y="${T}" width="${gw}" height="${H - T - B}"/>`).join('');
    const f = frame({ ...o, kind: 'bar' });
    return `<div class="viz" id="${o.id}" data-days='${JSON.stringify(days.map(d => ({ d: d.d, ...Object.fromEntries(series.map(s => [s.key, d[s.key]])) })))}' data-series='${JSON.stringify(series.map(s => ({ key: s.key, label: s.label, color: s.color })))}' data-cc="${cc || ''}" data-fmt="${o.fmt ? 'int' : 'money'}">${f.head}<div class="viz-wrap"><svg class="viz-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${axes(mx, fmt)}<line class="axis" x1="${X}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${bars}${xl}<line class="cross" id="${o.id}-x" y1="${T}" y2="${H - B}"/>${hits}</svg><div class="viz-tip"></div></div>${f.table}</div>`;
  }
  function chartLines(o) {
    const { days, series, cc } = o; const fmt = o.fmt || (v => compact(v, cc)); series.forEach(s => s.fmt = s.fmt || (v => o.fmt ? o.fmt(v) : money(v, cc)));
    const mx = niceMax(Math.max(...days.flatMap(d => series.map(s => d[s.key])), 1));
    const n = days.length, px = i => X + (n === 1 ? 0 : (W - X - R) * i / (n - 1)), py = v => H - B - (H - T - B) * (v / mx);
    const lines = series.map(s => { const pts = days.map((d, i) => `${px(i).toFixed(1)},${py(d[s.key]).toFixed(1)}`); return `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.join(' ')}"/><circle cx="${px(n - 1)}" cy="${py(days[n - 1][s.key])}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`; }).join('');
    const show = labelSet(n); const xl = days.map((d, i) => show.has(i) ? `<text x="${px(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${dayLbl(d.d)}</text>` : '').join('');
    const gw = (W - X - R) / Math.max(1, n - 1);
    const hits = days.map((d, i) => `<rect class="hit" data-i="${i}" x="${px(i) - gw / 2}" y="${T}" width="${gw}" height="${H - T - B}"/>`).join('');
    const marks = series.map(s => `<circle class="mark" data-s="${s.key}" r="4.5" fill="${s.color}" stroke="#fff" stroke-width="2" opacity="0"/>`).join('');
    const f = frame({ ...o, kind: 'line' });
    return `<div class="viz" id="${o.id}" data-days='${JSON.stringify(days.map(d => ({ d: d.d, ...Object.fromEntries(series.map(s => [s.key, d[s.key]])) })))}' data-series='${JSON.stringify(series.map(s => ({ key: s.key, label: s.label, color: s.color })))}' data-cc="${cc || ''}" data-fmt="${o.fmt ? 'int' : 'money'}" data-line="1">${f.head}<div class="viz-wrap"><svg class="viz-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${axes(mx, fmt)}<line class="axis" x1="${X}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${lines}${xl}<line class="cross" y1="${T}" y2="${H - B}"/>${marks}${hits}</svg><div class="viz-tip"></div></div>${f.table}</div>`;
  }
  function bindCharts(root) {
    $$('.viz', root).forEach(v => {
      const days = JSON.parse(v.dataset.days), series = JSON.parse(v.dataset.series), cc = v.dataset.cc, isMoney = v.dataset.fmt === 'money';
      const svg = $('svg', v), tip = $('.viz-tip', v), cross = $('.cross', v), marks = $$('.mark', v);
      const mx = niceMax(Math.max(...days.flatMap(d => series.map(s => d[s.key])), 1));
      const n = days.length, px = i => X + (n === 1 ? 0 : (W - X - R) * i / (n - 1)), py = val => H - B - (H - T - B) * (val / mx);
      svg.addEventListener('mousemove', e => {
        const hit = e.target.closest('.hit'); if (!hit) return; const i = +hit.dataset.i, d = days[i];
        const r = svg.getBoundingClientRect(), sx = r.width / W;
        const cx = v.dataset.line ? px(i) : X + i * ((W - X - R) / n) + ((W - X - R) / n) / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
        marks.forEach(m => { m.setAttribute('cx', cx); m.setAttribute('cy', py(d[m.dataset.s])); m.style.opacity = 1; });
        tip.innerHTML = `<b>${dayLbl(d.d)}</b>${series.map(s => `<div><span><i style="background:${s.color}"></i>${esc(s.label)}</span><span>${isMoney ? money(d[s.key], cc) : int(d[s.key])}</span></div>`).join('')}`;
        tip.style.opacity = 1; const left = cx * sx; tip.style.left = Math.min(r.width - 170, Math.max(0, left + 12)) + 'px'; tip.style.top = (e.clientY - r.top - 10) + 'px';
      });
      svg.addEventListener('mouseleave', () => { tip.style.opacity = 0; cross.style.opacity = 0; marks.forEach(m => m.style.opacity = 0); });
      $('[data-viz-table]', v).onclick = e => { v.classList.toggle('show-table'); e.target.textContent = v.classList.contains('show-table') ? 'Chart' : 'Table'; };
    });
  }

  /* =====================================================
     Drawer, modal, global events
     ===================================================== */
  function openDrawer(html) { $('#drawerBody').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); state.drawer = null; }
  function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false'); const f = $('#modalBody input, #modalBody select'); if (f) setTimeout(() => f.focus(), 50); }
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); }

  function adjustModal(id, cc) {
    openModal(`<h3>Adjust balance</h3><p class="sub">A signed amount moves through the ledger with your name on it. Use a negative amount to take money off the wallet (never below zero).</p>
      <div class="field-row"><label class="field"><span>Amount (${SYM[cc] || ''})</span><input id="mAmt" type="number" step="0.01" placeholder="e.g. 5000 or -1500"></label><label class="field sm" style="flex-basis:150px"><span>Type</span><select id="mType"><option value="adjustment">Adjustment</option><option value="bonus">Bonus</option></select></label></div>
      <label class="field"><span>Reason (required, shown in the ledger)</span><input id="mWhy" placeholder="e.g. manual deposit confirmation, bank ref 12345"></label>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Apply</button></div>`);
    $('#mGo').onclick = async () => {
      const amount = +$('#mAmt').value, reason = $('#mWhy').value.trim(); if (!amount) return $('#mAmt').focus(); if (reason.length < 3) return $('#mWhy').focus();
      try { $('#mGo').disabled = true; const r = await API.admin.adjust(id, { amount, reason, type: $('#mType').value }); closeModal(); toast(`Done – new balance ${money(r.balance, cc)}`, 'ok'); openUser(id); render(true); } catch (e) { toast(e.message === 'insufficient_funds' || /balance/.test(e.message) ? 'The wallet cannot go below zero' : errMsg(e), 'err'); $('#mGo').disabled = false; }
    };
  }
  function userSet(id, field, value) {
    const v = value === 'true' ? true : value === 'false' ? false : value;
    const needReason = field === 'verified' && v === false;
    const titles = { verified: v ? 'Approve this player\'s identity?' : 'Revoke verification?', status: v === 'suspended' ? 'Suspend this player?' : 'Reactivate this player?', role: v === 'admin' ? 'Make this player an administrator?' : 'Remove administrator access?' };
    const subs = { verified: v ? 'The player is told by email and can withdraw without further checks.' : 'The player is told by email and asked to verify again.', status: v === 'suspended' ? 'The player cannot sign in, bet or withdraw until reactivated.' : 'The player can sign in and play again.', role: v === 'admin' ? 'They get full access to this portal, including money and settings. Only do this for staff you trust.' : 'They keep their player account but lose access to this portal.' };
    openModal(`<h3>${titles[field]}</h3><p class="sub">${subs[field]}</p>${needReason ? '<label class="field"><span>Reason shown to the player</span><input id="mReason" placeholder="e.g. document not readable"></label>' : ''}<div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn ${v === 'suspended' || v === false ? 'danger solid' : 'primary'}" id="mGo">Confirm</button></div>`);
    $('#mGo').onclick = async () => { try { $('#mGo').disabled = true; await API.admin.updateUser(id, { [field]: v, ...(needReason ? { reason: $('#mReason').value.trim() } : {}) }); closeModal(); toast('Player updated', 'ok'); openUser(id); render(true); } catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; } };
  }

  function bind() {
    window.addEventListener('hashchange', route);
    $('#loginForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target, who = f.who.value.trim(), btn = f.querySelector('button'); btn.disabled = true; $('#loginErr').hidden = true;
      try {
        const u = await API.auth.login(f.country.value, /@/.test(who) ? { email: who } : who.replace(/\D/g, '').replace(/^(234|233)/, '').replace(/^0/, ''), f.password.value);
        if (u.role !== 'admin') { API.auth.logout(); throw new Error('admin_only'); }
        enter(u);
      } catch (err) { $('#loginErr').textContent = errMsg(err); $('#loginErr').hidden = false; } finally { btn.disabled = false; }
    };
    $('#logoutBtn').onclick = () => { API.auth.logout(); clearInterval(state.timer); location.hash = ''; showLogin(); };
    $('#refreshBtn').onclick = () => { chips(); render(); };
    $('#burger').onclick = () => document.body.classList.toggle('nav-open');
    $('#scrim').onclick = () => document.body.classList.remove('nav-open');
    $('#topSearch').onsubmit = e => { e.preventDefault(); const q = $('#topQ').value.trim(); if (q) { location.hash = '#/players/' + encodeURIComponent(q); $('#topQ').value = ''; } };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#modal').classList.contains('open')) closeModal(); else closeDrawer(); } });
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-close-modal]')) return closeModal();
      if (t.closest('[data-close-drawer]') || (t.id === 'drawer')) return closeDrawer();
      const b = t.closest('[data-pay],[data-review],[data-agent-set],[data-agpay],[data-kyc],[data-user],[data-user-uid],[data-bet],[data-event],[data-void],[data-adjust],[data-user-set],[data-result],[data-cancel],[data-suspend-all],[data-mk-susp],[data-price],[data-lad-req],[data-proof-view],[data-req-dep],[data-cancel-req],[data-add-dep],[data-payout]');
      if (!b) return;
      if (t.closest('a[href]') && !b.dataset.user) return;
      e.preventDefault(); e.stopPropagation();
      const d = b.dataset;
      if (d.ladReq) return requestDepositModal(d.ladReq, state.ladRows && state.ladRows.get(d.ladReq));
      if (d.proofView) return proofModal(d.proofView);
      if (d.addDep) return addDepositModal(d.addDep);
      if (d.reqDep) return requestDepositModal(d.reqDep);
      if (d.cancelReq) { API.admin.cancelNotice(d.cancelReq).then(() => { toast('Request cancelled', 'ok'); refreshDrawer(); }).catch(err => toast(errMsg(err), 'err')); return; }
      if (d.pay) return payAction(d.id, d.pay);
      if (d.review) return reviewModal(d.review);
      if (d.agentSet) { const on = d.v === 'true'; if (!on && !confirm('Stop this agent? Their players stay linked to them, but new sign-ups and new first deposits no longer earn them anything.')) return;
        API.admin.setAgent(d.agentSet, on).then(r => { toast(on ? `Agent created · code ${r.code}` : 'Agent stopped', 'ok'); if (state.drawer && state.drawer.type === 'user') openUser(state.drawer.id); render(true); }).catch(err => toast(errMsg(err), 'err')); return; }
      if (d.agpay) return agentPayoutAction(d.agpay, d.act);
      if (d.user) return openUser(d.user);
      if (d.userUid) { location.hash = '#/players/' + d.userUid; return; }
      if (d.bet) return openBet(d.bet).catch(err => toast(errMsg(err), 'err'));
      if (d.event) return openEvent(d.event).catch(err => toast(errMsg(err), 'err'));
      if (d.void) return voidBet(d.void);
      if (d.adjust) return adjustModal(d.adjust, d.cc);
      if (d.userSet) return userSet(d.userSet, d.field, d.value);
      if (d.result) return resultModal(d.result, false);
      if (d.cancel) return resultModal(d.cancel, true);
      if (d.suspendAll) { API.admin.suspendEvent(d.suspendAll, d.v === 'true').then(() => { toast(d.v === 'true' ? 'All markets suspended' : 'All markets reopened', 'ok'); openEvent(d.suspendAll); render(true); }).catch(err => toast(errMsg(err), 'err')); return; }
      if (d.mkSusp) { API.admin.market(d.ev, d.mkSusp, { suspended: d.v === 'true' }).then(() => { toast(d.v === 'true' ? 'Market suspended' : 'Market reopened', 'ok'); openEvent(d.ev); }).catch(err => toast(errMsg(err), 'err')); return; }
      if (d.price) return priceModal(d.ev, d.mk, d.price, d.l, d.o);
    });
  }

  boot();
})();
