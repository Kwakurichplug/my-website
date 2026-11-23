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
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    trade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 6v12"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1s3.5 1 5 1c1.5 0 5 1.5 5-1s-3.5-2-5 1"/></svg>',
    agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="18.5" r="2.6"/><circle cx="19" cy="18.5" r="2.6"/><path d="M12 7.6V12M12 12l-5.4 4.3M12 12l5.4 4.3"/></svg>',
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
  const ERR = { reference_required: 'Enter the transfer reference from your bank or MoMo app – each transfer can be credited only once.', bad_image: 'That file is not a picture.', duplicate_reference: 'This transfer reference was already used for a deposit – check the player’s payments.', not_agent: 'This player is not an agent.', admin_only: 'This account is not an administrator.', bad_login: 'Wrong phone/email or password.', suspended: 'This account is suspended.', not_pending: 'This payment was already handled.', not_open: 'This bet is no longer open.', invalid: 'Some values are not valid.', invalid_email: 'Enter a valid email address.', too_many_attempts: 'Too many attempts – wait a few minutes.', offline: 'The API is unreachable.' };
  Object.assign(ERR, { not_pending: 'Someone already handled this one – the list is refreshed.', reason_required: 'Write the reason the player will see.',
    api_payment: 'Paid through the payment API – it is settled automatically.', api_not_configured: 'The payment API is not connected yet.', already_sent: 'This payout was already sent.',
    payout_failed: 'The payment API refused the payout.', momo_details: 'This withdrawal has no valid MoMo number.', min_over_max: 'A minimum is higher than its maximum.', invalid: 'Some fields are not valid.' });
  const errMsg = e => ERR[e && e.message] || (e && e.detail) || (e && e.message) || 'Something went wrong';
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
      const k = $('#navKyc'); k.hidden = !o.pending_kyc; k.textContent = o.pending_kyc || ''; state.pending = o;
    } catch {}
    try {
      const L = await API.admin.ladder(); const nl = $('#navLadder'); if (nl) { const n = (L.counts && L.counts.left) || 0; nl.hidden = !n; nl.textContent = n; nl.title = n + ' players with deposit bonuses left'; }
    } catch {}
    try { state.api = (await API.admin.paymentSettings()).api; } catch {}
  }

  /* ---------- router ---------- */
  const TITLES = { ladder: 'Deposit 1·2·3', overview: 'Overview', players: 'Players', payments: 'Payments', bets: 'Bets', trading: 'Trading desk', games: 'Games', jackpot: 'Jackpot', finance: 'Ledger', settings: 'Settings', email: 'Email', audit: 'Audit log', kyc: 'ID checks', agents: 'Agents', paysettings: 'Payment settings' };
  function route() {
    const [page = 'overview', arg = null] = location.hash.replace(/^#\/?/, '').split('/');
    const before = state.page;
    state.page = TITLES[page] ? page : 'overview'; state.arg = arg ? decodeURIComponent(arg) : null;
    if (before && before !== state.page && $('#drawer').classList.contains('open')) closeDrawer();   // another page: the side panel closes
    $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === state.page));
    $('#pageTitle').textContent = TITLES[state.page];
    document.body.classList.remove('nav-open');
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
    const [o, days, pend, live, ps] = await Promise.all([API.admin.overview(cc), API.admin.series(14, cc), API.admin.paymentsQ('pending'), API.admin.events('open'), API.admin.paymentSettings().catch(() => null)]);
    state.overview = o; keepPays(pend);
    const setup = [];
    if (ps) {
      const b = ps.settings.NG.bank, m = ps.settings.GH.momo; state.api = ps.api;
      if (!(b.bank && b.number && b.name)) setup.push(['Nigerian players cannot deposit yet', 'Add the bank account players pay into.', '#/paysettings']);
      if (!ps.api.enabled && !(m.number && m.name)) setup.push(['Ghana deposits are closed', 'Connect the payment API (PAYSTACK_SECRET_KEY) or add a MoMo number.', '#/paysettings']);
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
            ${(state.pending || o).pending_kyc ? `<div class="q-item"><div class="who"><b>${int((state.pending || o).pending_kyc)} ID check${(state.pending || o).pending_kyc === 1 ? '' : 's'} waiting</b><small>Approve or reject from ID checks</small></div><a class="btn xs" href="#/kyc">Open</a></div>` : ''}
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
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Player</th><th>Contact</th><th>Status</th><th>KYC</th><th>Role</th><th class="r">Balance</th><th>Joined</th><th></th></tr></thead><tbody>
        ${users.map(u => `<tr class="click" data-user="${u.id}"><td><div class="who"><b>${esc(u.full_name || 'No name yet')}</b><small>ID ${u.uid}</small></div></td><td><div class="who">${flag(u.country)}${esc(phoneFmt(u.country, u.phone))}<small>${esc(u.email || '')}</small></div></td>
          <td>${pill(u.status, P_USER)}</td><td>${u.verified ? pill('ok', { ok: ['ok', 'Verified'] }) : pill('no', { no: ['warn', 'Not verified'] })}</td><td>${u.role === 'admin' ? pill('a', { a: ['gold', 'Admin'] }) : u.agent ? pill('g', { g: ['info', 'Agent'] }) : '<span class="muted">Player</span>'}</td>
          <td class="r amt">${money(u.balance, u.country)}</td><td class="muted">${when(u.created_at)}</td><td><div class="acts"><button class="btn xs" data-user="${u.id}">Open</button></div></td></tr>`).join('') || '<tr><td colspan="8"><div class="empty"><b>No players found</b>Try another phone number or ID.</div></td></tr>'}
      </tbody></table></div></div>`;
    $('#pq').onsubmit = e => { e.preventDefault(); location.hash = '#/players/' + encodeURIComponent($('#pq input').value.trim()); };
  };

  async function openUser(id) {
    openDrawer('<div class="loading">Loading player…</div>');
    const d = await API.admin.user(id);
    const u = d.user, cc = u.country;
    const tab = (t) => {
      if (t === 'bets') return `<table class="mini"><thead><tr><th>Ticket</th><th>Type</th><th class="r">Stake</th><th class="r">Odds</th><th>Status</th><th class="r">Paid</th><th>Placed</th></tr></thead><tbody>${d.bets.map(b => `<tr><td><span class="lnk" data-bet="${esc(b.id)}">${esc(b.id)}</span></td><td>${b.type}</td><td class="r">${money(b.stake, cc)}</td><td class="r">${Number(b.odds).toFixed(2)}</td><td>${pill(b.status, P_BET)}</td><td class="r">${b.paid != null ? money(b.paid, cc) : '–'}</td><td class="muted">${when(b.placed_at)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No bets yet</td></tr>'}</tbody></table>`;
      if (t === 'pay') return `<table class="mini"><thead><tr><th>Kind</th><th>Method</th><th class="r">Amount</th><th>Status</th><th>When</th><th></th></tr></thead><tbody>${d.payments.map(p => `<tr><td>${p.kind}</td><td>${esc(mName(p))}${p.provider === 'paystack' ? ' <span class="pill info">API</span>' : ''}</td><td class="r">${money(p.amount, cc)}</td><td>${payPill(p)}</td><td class="muted">${when(p.created_at)}</td><td>${p.status === 'pending' ? `<button class="btn xs primary" data-pay="approve" data-id="${p.id}">Approve</button> <button class="btn xs danger" data-pay="reject" data-id="${p.id}">Reject</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No payments yet</td></tr>'}</tbody></table>`;
      if (t === 'tx') return `<table class="mini"><thead><tr><th>Type</th><th class="r">Amount</th><th class="r">Balance</th><th>Ref</th><th>When</th></tr></thead><tbody>${d.transactions.map(x => `<tr><td>${esc(x.type)}${x.meta && x.meta.reason ? `<div class="muted small">${esc(x.meta.reason)}</div>` : ''}</td><td class="r amt ${Number(x.amount) >= 0 ? 'in' : 'out'}">${Number(x.amount) >= 0 ? '+' : ''}${money(x.amount, cc)}</td><td class="r">${money(x.balance_after, cc)}</td><td class="id">${esc(x.ref || '')}</td><td class="muted">${when(x.created_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No transactions yet</td></tr>'}</tbody></table>`;
      if (t === 'games') return `<table class="mini"><thead><tr><th>Game</th><th class="r">Plays</th><th class="r">Staked</th><th class="r">Paid</th><th class="r">Hold</th></tr></thead><tbody>${d.games.map(g => `<tr><td>${esc(g.game)}</td><td class="r">${int(g.plays)}</td><td class="r">${money(g.staked, cc)}</td><td class="r">${money(g.paid, cc)}</td><td class="r">${g.staked > 0 ? ((1 - g.paid / g.staked) * 100).toFixed(1) + '%' : '–'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No game plays yet</td></tr>'}</tbody></table>`;
    };
    const lim = u.limits || {}, kyc = lim.kyc || {};
    keepPays(d.payments.map(p => ({ ...p, user_id: u.id, country: cc, uid: u.uid, full_name: u.full_name, phone: u.phone, verified: u.verified, kyc: kyc.status })));
    $('#drawerBody').innerHTML = `
      <div class="d-head"><span class="avatar">${initials(u)}</span><div><h3>${esc(u.full_name || 'No name yet')}</h3><p>ID ${u.uid} · ${flag(cc)}${esc(phoneFmt(cc, u.phone))}${u.email ? ' · ' + esc(u.email) : ''}</p></div></div>
      <div class="d-actions">${pill(u.status, P_USER)} ${u.verified ? pill('ok', { ok: ['ok', 'KYC verified'] }) : pill('no', { no: ['warn', 'KYC pending'] })} ${u.role === 'admin' ? pill('a', { a: ['gold', 'Administrator'] }) : ''} ${u.status === 'self_excluded' && lim.selfExclude ? pill('x', { x: ['warn', 'Self-excluded until ' + when(lim.selfExclude)] }) : ''}</div>
      <div class="stat-row"><div class="stat"><small>Balance</small><b>${money(u.balance, cc)}</b></div><div class="stat"><small>Deposited</small><b>${money(d.totals.deposited, cc)}</b></div><div class="stat"><small>Withdrawn</small><b>${money(d.totals.withdrawn, cc)}</b></div><div class="stat"><small>Staked / won</small><b>${compact(d.totals.staked, cc)} / ${compact(d.totals.won, cc)}</b></div></div>
      <div class="d-actions">
        <button class="btn sm primary" data-add-dep="${u.id}">Add deposit</button>
        <button class="btn sm" data-req-dep="${u.id}">Request deposit</button>
        <button class="btn sm" data-adjust="${u.id}" data-cc="${cc}">Adjust balance</button>
        ${u.verified ? `<button class="btn sm" data-kyc="reject" data-id="${u.id}">Revoke ID check</button>` : kyc.status === 'pending' ? `<button class="btn sm primary" data-kyc="approve" data-id="${u.id}">Approve ID</button><button class="btn sm danger" data-kyc="reject" data-id="${u.id}">Reject ID</button>` : ''}
        ${u.status === 'suspended' ? `<button class="btn sm" data-user-set="${u.id}" data-field="status" data-value="active">Reactivate</button>` : `<button class="btn sm danger" data-user-set="${u.id}" data-field="status" data-value="suspended">Suspend</button>`}
        ${u.role === 'admin' ? (u.id !== state.me.id ? `<button class="btn sm" data-user-set="${u.id}" data-field="role" data-value="user">Remove admin</button>` : '') : `<button class="btn sm" data-user-set="${u.id}" data-field="role" data-value="admin">Make admin</button>`}
        ${d.agent && d.agent.active ? `<button class="btn sm" data-agent="${u.id}">Agent · ${esc(basisShort(d.agent))}</button>` : `<button class="btn sm" data-agent-edit="${u.id}">${d.agent ? 'Restore agent' : 'Make agent'}</button>`}
      </div>
      <dl class="kv">${d.ladder ? `<dt>Deposit bonuses</dt><dd class="lad">${d.ladder.steps.map(x => `<span class="pill ${x.done ? 'ok' : x.status === 'checking' ? 'gold' : x.status === 'next' ? 'info' : ''}">${x.done ? '✓ ' : ''}Deposit ${x.n} · ${x.done ? (x.deposit != null ? money(x.deposit, cc) + ' · ' : '') + 'bonus ' + money(x.bonus, cc) + (x.status === 'active' ? ` ${x.required ? Math.floor(100 * x.wagered / x.required) : 0}% played` : ' ' + x.status) : x.status === 'checking' ? 'being checked' : x.status === 'next' ? 'next' : x.status === 'locked' ? 'after the ID check' : 'left'}</span>`).join(' ')}</dd>` : ''}${(d.requests || []).length ? `<dt>Deposit request</dt><dd>${d.requests.map(r => `${r.data && r.data.amount ? money(r.data.amount, cc) : 'Any amount'} · sent ${ago(r.created_at)} · waiting for the player <button class="btn xs" data-cancel-req="${r.id}">Cancel</button>`).join('<br>')}</dd>` : ''}${d.referrer ? `<dt>Signed up with</dt><dd>code LB${d.referrer.uid} · <span class="lnk" data-${d.referrer.agent ? 'agent' : 'user'}="${d.referrer.id}">${esc(d.referrer.full_name || 'ID ' + d.referrer.uid)}</span>${d.referrer.agent ? ' (agent)' : ''}</dd>` : ''}<dt>ID check</dt><dd>${u.verified ? 'Verified' : kyc.status === 'pending' ? 'Waiting for review' : kyc.status === 'rejected' ? 'Rejected – ' + esc(kyc.reason || '') : 'Not sent'}${kyc.idType ? ` · ${esc(kyc.idType)} <span class="mono">${esc(kyc.idNumber || '')}</span> · ${esc(kyc.fullName || '')} · born ${esc(kyc.dob || '')}` : ''}</dd><dt>Deposit reference</dt><dd class="mono">LB${String(u.uid).padStart(6, '0')}</dd><dt>Joined</dt><dd>${when(u.created_at)}</dd><dt>Country</dt><dd>${cc === 'GH' ? 'Ghana' : 'Nigeria'}</dd><dt>Deposit limit</dt><dd>${lim.amt ? money(lim.amt, cc) + ' per ' + esc(lim.period || 'week') : 'None set'}</dd><dt>Referral code</dt><dd>LB${u.uid}</dd></dl>
      <div class="d-tabs"><button class="on" data-dtab="bets">Bets</button><button data-dtab="pay">Payments</button><button data-dtab="tx">Ledger</button><button data-dtab="games">Games</button></div>
      <div id="dtab">${tab('bets')}</div>`;
    $$('#drawerBody [data-dtab]').forEach(b => b.onclick = () => { $$('#drawerBody [data-dtab]').forEach(x => x.classList.toggle('on', x === b)); $('#dtab').innerHTML = tab(b.dataset.dtab); });
    state.drawer = { type: 'user', id }; state.drawerUser = u; state.drawerPays = d.payments;
  }

  /* ---------- Agents: players who bring in players and earn the commission you set ---------- */
  const basisShort = a => `${Number(a.rate)}% of ${a.basis === 'revenue' ? 'net revenue' : a.basis === 'deposits' ? 'deposits' : 'stakes'}`;
  const BASIS_OPTS = { revenue: 'Net revenue – what their players lose (recommended)', deposits: 'Deposits – what their players pay in', stakes: 'Stakes – everything their players bet' };
  const refreshDrawer = () => { if (!state.drawer || !$('#drawer').classList.contains('open')) return; if (state.drawer.type === 'user') openUser(state.drawer.id); else if (state.drawer.type === 'agent') openAgent(state.drawer.id); };
  PAGES.agents = async main => {
    const { agents } = await API.admin.agents();
    state.agents = new Map(agents.map(a => [a.user_id, a]));
    const due = cc => agents.filter(a => a.active && a.country === cc).reduce((s, a) => s + a.commission, 0);
    main.innerHTML = `
      <div class="page-head"><div><h2>Agents</h2><p>Players you made agents. Their players are the people who signed up with their code or link. They earn the commission you set on what those players do, counted from the start of the unpaid period. You pay it into the agent’s balance when you decide; each payment starts a new period. Agents get this instead of the Refer &amp; Earn reward.</p></div>
        <div class="page-actions">${['NG', 'GH'].map(cc => `<span class="chip">${flag(cc)}Due ${money(due(cc), cc)}</span>`).join('')}<button class="btn primary" data-agent-new="1">Add agent</button></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agent</th><th>Commission</th><th class="r">Players</th><th>Unpaid since</th><th class="r">This period</th><th class="r">Due</th><th class="r">Paid so far</th><th>Status</th><th></th></tr></thead><tbody>
        ${agents.map(a => { const cc = a.country; return `<tr class="click" data-agent="${a.user_id}"><td><div class="who"><b>${esc(a.full_name || 'No name yet')}</b><small>ID ${a.uid} · ${flag(cc)}${esc(a.phone ? phoneFmt(cc, a.phone) : a.email || '')}</small></div></td>
          <td>${esc(basisShort(a))}</td><td class="r">${int(a.players)}<div class="small muted">${int(a.totals.active)} active</div></td><td class="muted">${when(a.period_start)}<div class="small">${ago(a.period_start)}</div></td>
          <td class="r">${money(a.base, cc)}<div class="small muted">${esc(a.basisName)}</div></td><td class="r amt ${a.commission > 0 ? 'in' : ''}"><b>${money(a.commission, cc)}</b></td><td class="r">${money(a.paid_total, cc)}</td>
          <td>${a.active ? pill('a', { a: ['ok', 'Active'] }) : pill('r', { r: ['', 'Removed'] })}</td>
          <td><div class="acts">${a.active ? `<button class="btn xs primary" data-agent-pay="${a.user_id}">Pay</button>` : ''}<button class="btn xs" data-agent-edit="${a.user_id}">${a.active ? 'Edit' : 'Restore'}</button></div></td></tr>`; }).join('')
          || '<tr><td colspan="9"><div class="empty"><b>No agents yet</b>Press “Add agent”, or open a player and press “Make agent”.</div></td></tr>'}
      </tbody></table></div></div>`;
  };
  // make a player an agent, change their commission, restore or remove them; id = null picks the player first
  async function agentModal(id) {
    let a = null, u = null;
    if (id) {
      try { a = (await API.admin.agent(id)).agent; } catch { a = null; }
      u = a ? { id: a.user_id, uid: a.uid, full_name: a.full_name, country: a.country, phone: a.phone, email: a.email } : state.drawerUser && state.drawerUser.id === id ? state.drawerUser : null;
      if (!u) { try { u = (await API.admin.user(id)).user; } catch (e) { return toast(errMsg(e), 'err'); } }
    }
    const due = a && a.active ? (state.agents && state.agents.get(a.user_id) || {}).commission || 0 : 0;
    const form = () => `
      <h3>${a && a.active ? 'Agent commission' : a ? 'Restore this agent' : 'Make an agent'}</h3>
      <p class="sub">${u ? `${esc(u.full_name || 'No name yet')} · ID ${u.uid} · ${flag(u.country)}${esc(u.phone ? phoneFmt(u.country, u.phone) : u.email || '')} · referral code LB${u.uid}` : 'Find the player who will bring in other players.'}</p>
      ${u ? '' : `<form class="search ag-find" id="agFind"><i>${IC.search}</i><input placeholder="Phone, ID, name or email – then press Enter"></form><div id="agHits" class="ag-hits"></div>`}
      <label class="field"><span>Commission is paid on</span><select id="agBasis">${Object.entries(BASIS_OPTS).map(([k, l]) => `<option value="${k}" ${(a ? a.basis : 'revenue') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Rate (%)</span><input id="agRate" type="number" min="0.1" max="100" step="0.1" value="${a ? a.rate : 20}"></label>
      <p class="sub small" id="agEx"></p>
      <label class="field"><span>Note (optional – only admins see it)</span><input id="agNote" maxlength="200" value="${esc((a && a.note) || '')}"></label>
      ${a && a.active && due > 0 ? `<p class="form-err">${money(due, a.country)} commission is unpaid. Pay it before removing the agent, or it is dropped.</p>` : ''}
      <div class="m-actions">${a && a.active ? '<button class="btn danger" id="agRemove" type="button">Remove agent</button><span class="spacer"></span>' : ''}<button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo" ${u ? '' : 'disabled'}>${a && a.active ? 'Save' : 'Make agent'}</button></div>`;
    const ex = () => {
      const r = +$('#agRate').value || 0, b = $('#agBasis').value, cc = (u && u.country) || 'NG', x = cc === 'GH' ? 1000 : 100000;
      $('#agEx').textContent = `Example: if their players ${b === 'revenue' ? 'lose' : b === 'deposits' ? 'deposit' : 'stake'} ${money(x, cc)} in a period, the agent earns ${money(x * r / 100, cc)}.`;
    };
    const bind = () => {
      $('#agRate').oninput = ex; $('#agBasis').onchange = ex; ex();
      if ($('#agFind')) {
        $('#agFind input').focus();
        $('#agFind').onsubmit = async e => {
          e.preventDefault(); const s = $('#agFind input').value.trim(); if (!s) return;
          const list = await API.admin.users(s).catch(() => []);
          $('#agHits').innerHTML = list.slice(0, 6).map(x => `<button type="button" class="ag-hit" data-pick="${x.id}"><b>${esc(x.full_name || 'No name yet')}</b><small>ID ${x.uid} · ${flag(x.country)}${esc(x.phone ? phoneFmt(x.country, x.phone) : x.email || '')}${x.agent ? ' · already an agent' : ''}</small></button>`).join('') || '<p class="muted small">No player found.</p>';
          $$('#agHits [data-pick]').forEach(b => b.onclick = () => { closeModal(); agentModal(b.dataset.pick); });
        };
      }
      if ($('#agRemove')) $('#agRemove').onclick = async () => {
        try { await API.admin.saveAgent(a.user_id, { rate: a.rate, basis: a.basis, active: false, ...(a.note ? { note: a.note } : {}) }); closeModal(); toast('Agent removed', 'ok'); render(true); refreshDrawer(); }
        catch (e) { toast(errMsg(e), 'err'); }
      };
      $('#mGo').onclick = async () => {
        const rate = +$('#agRate').value; if (!(rate > 0 && rate <= 100)) return $('#agRate').focus();
        const note = $('#agNote').value.trim();
        try { $('#mGo').disabled = true; await API.admin.saveAgent(u.id, { rate, basis: $('#agBasis').value, active: true, ...(note ? { note } : {}) }); closeModal(); toast(a && a.active ? 'Commission saved' : 'Agent added', 'ok'); if (state.page === 'agents') render(true); refreshDrawer(); }
        catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; }
      };
    };
    openModal(form()); bind();
  }
  async function agentPayModal(id) {
    const d = await API.admin.agent(id), a = d.agent, p = d.period, cc = a.country;
    openModal(`<h3>Pay commission</h3>
      <p class="sub">${esc(a.full_name || 'No name yet')} · ID ${a.uid} · ${esc(basisShort(a))}. The money goes into the agent’s balance (they can bet or withdraw it) and a new period starts.</p>
      <dl class="kv"><dt>Period</dt><dd>${when(p.from)} – now</dd><dt>Players</dt><dd>${int(p.players.length)} (${int(p.totals.active)} active)</dd>
        <dt>Deposits</dt><dd>${money(p.totals.deposits, cc)}</dd><dt>Stakes</dt><dd>${money(p.totals.staked, cc)}</dd><dt>Winnings paid</dt><dd>${money(p.totals.returned, cc)}</dd>${p.totals.bonus ? `<dt>Bonuses released</dt><dd>${money(p.totals.bonus, cc)}</dd>` : ''}<dt>Net revenue</dt><dd>${money(p.totals.revenue, cc)}</dd>
        <dt>Commission</dt><dd><b>${money(p.commission, cc)}</b> · ${a.rate}% of ${money(p.base, cc)}</dd></dl>
      <label class="field"><span>Amount to pay (${SYM[cc]}) – you decide</span><input id="mAmt" type="number" min="0" step="0.01" value="${p.commission.toFixed(2)}"></label>
      <label class="field"><span>Note (optional)</span><input id="mNote" maxlength="200"></label>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo"></button></div>`);
    const upd = () => { const v = +$('#mAmt').value; $('#mGo').textContent = v > 0 ? 'Pay ' + money(v, cc) : 'Close the period without paying'; };
    $('#mAmt').oninput = upd; upd();
    $('#mGo').onclick = async () => {
      const v = +$('#mAmt').value; if (!(v >= 0)) return $('#mAmt').focus();
      const n = $('#mNote').value.trim();
      try { $('#mGo').disabled = true; await API.admin.payAgent(id, { amount: Math.round(v * 100) / 100, ...(n ? { note: n } : {}) }); closeModal(); toast(v > 0 ? 'Commission paid into the agent’s balance' : 'Period closed', 'ok'); if (state.page === 'agents') render(true); refreshDrawer(); }
      catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; }
    };
  }
  async function openAgent(id) {
    openDrawer('<div class="loading">Loading agent…</div>');
    const d = await API.admin.agent(id), a = d.agent, p = d.period, cc = a.country;
    $('#drawerBody').innerHTML = `
      <div class="d-head"><span class="avatar">${initials(a)}</span><div><h3>${esc(a.full_name || 'No name yet')}</h3><p>Agent · ID ${a.uid} · ${flag(cc)}${esc(a.phone ? phoneFmt(cc, a.phone) : '')}${a.email ? ' · ' + esc(a.email) : ''}</p></div></div>
      <div class="d-actions">${a.active ? pill('a', { a: ['ok', 'Active agent'] }) : pill('r', { r: ['', 'Removed'] })} <span class="pill gold plain">${esc(basisShort(a))}</span> <span class="muted small">Referral code LB${a.uid}</span></div>
      <div class="stat-row"><div class="stat"><small>Due now</small><b>${money(p.commission, cc)}</b></div><div class="stat"><small>${esc(a.basisName)} this period</small><b>${money(p.base, cc)}</b></div><div class="stat"><small>Players</small><b>${int(p.players.length)}</b></div><div class="stat"><small>Paid so far</small><b>${money(a.paid_total, cc)}</b></div></div>
      <div class="d-actions">${a.active ? `<button class="btn sm primary" data-agent-pay="${a.user_id}">Pay commission</button>` : ''}<button class="btn sm" data-agent-edit="${a.user_id}">${a.active ? 'Change commission' : 'Restore agent'}</button><button class="btn sm" data-user="${a.user_id}">Open player</button></div>
      ${a.note ? `<dl class="kv"><dt>Note</dt><dd>${esc(a.note)}</dd></dl>` : ''}
      <h4 class="d-sub">Players this period <span class="muted small">since ${when(p.from)}</span></h4>
      <table class="mini"><thead><tr><th>Player</th><th>Joined</th><th class="r">Deposits</th><th class="r">Stakes</th><th class="r">Won</th><th class="r">Net revenue</th></tr></thead><tbody>
        ${p.players.map(x => `<tr><td><span class="lnk" data-user="${x.id}">${esc(x.full_name || 'ID ' + x.uid)}</span><div class="muted small">ID ${x.uid}</div></td><td class="muted">${when(x.created_at)}</td><td class="r">${money(x.deposits, cc)}</td><td class="r">${money(x.staked, cc)}</td><td class="r">${money(x.returned, cc)}</td><td class="r amt ${x.revenue >= 0 ? 'in' : 'out'}">${money(x.revenue, cc)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">No players yet – they sign up with code LB${a.uid}.</td></tr>`}
      </tbody></table>
      <h4 class="d-sub">Commission paid</h4>
      <table class="mini"><thead><tr><th>Paid</th><th>Period</th><th class="r">Base</th><th class="r">Commission</th><th class="r">Paid</th></tr></thead><tbody>
        ${d.payouts.map(x => `<tr><td class="muted">${when(x.created_at)}</td><td class="small">${when(x.period_start)} – ${when(x.period_end)}</td><td class="r">${money(x.base, cc)}</td><td class="r">${money(x.commission, cc)}</td><td class="r amt in">${money(x.amount, cc)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nothing paid yet.</td></tr>'}
      </tbody></table>`;
    state.drawer = { type: 'agent', id };
  }

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
  PAGES.payments = async main => {
    const [status = 'pending', kind = ''] = (state.arg || '').split(':');
    const rows = keepPays(await API.admin.paymentsQ(status, kind || undefined));
    const seg = (cur, items, fn) => `<div class="seg">${items.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-f="${fn}" data-v="${v}">${l}</button>`).join('')}</div>`;
    main.innerHTML = `
      <div class="page-head"><div><h2>Payments</h2><p>Deposits waiting for you to confirm the money arrived, and withdrawals waiting for payout. Confirm a deposit only when you can see it in the account; mark a withdrawal paid only after you have sent it. Rejecting a withdrawal refunds the player at once. Mobile Money through the payment API settles by itself.</p></div></div>
      <div class="card"><div class="toolbar">${seg(status, [['pending', 'Pending'], ['success', 'Done'], ['rejected', 'Rejected'], ['failed', 'Failed'], ['cancelled', 'Cancelled'], ['all', 'All']], 'status')}${seg(kind, [['', 'Both'], ['withdrawal', 'Withdrawals'], ['deposit', 'Deposits']], 'kind')}<span class="spacer"></span><span class="muted small">${rows.length} shown</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Requested</th><th>Player</th><th>Kind</th><th>Method</th><th class="wrap">Pay to / reference</th><th class="r">Amount</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(p => `<tr><td class="muted">${when(p.created_at)}<div class="small">${ago(p.created_at)}</div></td><td><div class="who"><b class="lnk" data-user="${p.user_id}">${esc(p.full_name || phoneFmt(p.country, p.phone))}</b><small>ID ${p.uid} · ${flag(p.country)}${esc(phoneFmt(p.country, p.phone))}</small></div></td>
          <td>${p.kind === 'withdrawal' ? pill('w', { w: ['warn', 'Withdrawal'] }) : pill('d', { d: ['info', 'Deposit'] })}</td><td>${esc(mName(p))}${p.provider === 'paystack' ? ' <span class="pill info">API</span>' : ''}</td><td class="wrap small">${payDetails(p)}</td><td class="r amt ${p.kind === 'deposit' ? 'in' : 'out'}">${money(p.amount, p.country)}</td><td>${payPill(p)}</td>
          <td><div class="acts">${payActs(p)}</div></td></tr>`).join('') || `<tr><td colspan="8"><div class="empty"><b>Nothing here</b>No ${status === 'all' ? '' : status} payments${kind ? ' of this kind' : ''}.</div></td></tr>`}
      </tbody></table></div></div>`;
    $$('#main [data-f]').forEach(b => b.onclick = () => { const s = b.dataset.f === 'status' ? b.dataset.v : status, k = b.dataset.f === 'kind' ? b.dataset.v : kind; location.hash = `#/payments/${s}:${k}`; });
  };
  const payDetails = p => {
    const d = p.details || {}, out = [];
    if (p.kind === 'deposit') {
      if (d.sender) out.push('From <b>' + esc(d.sender) + '</b>');
      if (d.phone) out.push(esc((NET[d.network] || d.network || 'MoMo') + ' · 0' + d.phone));
      if (p.provider_ref) out.push('Ref <span class="mono">' + esc(p.provider_ref) + '</span>');
      if (d.claimed) out.push('player said ' + money(d.claimed, p.country));
      if (d.transferRef) out.push('Transfer <span class="mono">' + esc(d.transferRef) + '</span>');
      if (d.source === 'support') out.push('<span class="pill info">Added by support</span>');
    } else {
      if (d.account) out.push('<span class="mono">' + esc(d.account) + '</span>');
      else { if (d.bank) out.push(esc(d.bank)); if (d.acct) out.push('<span class="mono">' + esc(d.acct) + '</span>'); if (d.name) out.push(esc(d.name)); }
      if (p.status === 'pending') out.push(p.verified ? '<span class="pill ok">ID verified</span>' : p.kyc === 'pending' ? '<span class="pill warn">ID check waiting</span>' : '<span class="pill bad">ID not verified</span>');
      if (d.payoutRef) out.push('Paid ref <span class="mono">' + esc(d.payoutRef) + '</span>');
    }
    if (d.reason && p.status !== 'success') out.push('<span class="muted">' + esc(d.reason) + '</span>');
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
    if (p.provider === 'paystack') return `<span class="muted small">${p.kind === 'deposit' ? 'Waiting for the player to approve on their phone' : 'Sent via the payment API – waiting for confirmation'}</span>`;
    return `${p.kind === 'deposit' && p.has_proof ? `<button class="btn xs" data-proof-view="${p.id}">Screenshot</button>` : ''}<button class="btn xs primary" data-pay="approve" data-id="${p.id}">${p.kind === 'withdrawal' ? 'Mark paid' : 'Confirm'}</button>${p.kind === 'withdrawal' && p.method === 'mobile_money' && state.api && state.api.enabled ? `<button class="btn xs" data-payout="${p.id}">Send via Paystack</button>` : ''}<button class="btn xs danger" data-pay="reject" data-id="${p.id}">Reject</button>`;
  };

  function payAction(id, action) {
    const p = state.payRows.get(id) || {}, approve = action === 'approve', dep = p.kind === 'deposit', cc = p.country || 'NG';
    const quick = approve ? [] : dep ? ['No transfer received', 'The amount does not match the transfer', 'The sender name does not match'] : ['The account name does not match yours', 'The account details are not valid', 'Please verify your ID first'];
    openModal(`<h3>${approve ? (dep ? 'Confirm this deposit' : 'Mark this withdrawal as paid') : (dep ? 'Reject this deposit' : 'Reject this withdrawal')}</h3>
      <p class="sub">${approve ? (dep ? 'Only confirm once you can see the money in the account. The player is credited at once (with their Deposit 1 · 2 · 3 bonus when it applies) and gets a receipt by email.' : 'Only mark it paid after the money has left your account. The player gets an email.') : (dep ? 'The player is told by email with your reason.' : 'The player is told by email and the money goes back to their balance at once.')}</p>
      ${p.id ? `<dl class="kv"><dt>Player</dt><dd>${esc(p.full_name || phoneFmt(cc, p.phone))} · ID ${p.uid}</dd><dt>${dep ? 'Amount sent' : 'Amount'}</dt><dd><b>${money(p.amount, cc)}</b></dd><dt>${dep ? 'Details' : 'Pay to'}</dt><dd>${payDetails(p)}</dd></dl>` : ''}
      ${approve && dep ? `<label class="field"><span>Amount that arrived (${SYM[cc] || ''})</span><input id="mAmt" type="number" step="0.01" min="0.01" value="${p.amount || ''}"></label>` : ''}
      ${approve && dep && p.has_proof ? '<div class="proof-box" id="mProof"><span class="muted small">Loading the screenshot…</span></div>' : ''}
      ${approve && dep ? '<label class="field"><span>Transfer reference from your bank or MoMo app (required – each transfer can be credited only once)</span><input id="mRef" placeholder="e.g. the session ID or transaction ID"></label>' : ''}
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
        { const r = $('#mRef').value.trim(); if (r) body.reference = r; }
        const n = $('#mNote').value.trim(); if (n) body.note = n;
      } else { const r = $('#mReason').value.trim(); if (!r) return $('#mReason').focus(); body.reason = r; }
      try { $('#mGo').disabled = true; await API.admin.payment(id, action, body); closeModal(); toast(approve ? (dep ? 'Deposit confirmed – player credited' : 'Withdrawal marked as paid') : 'Payment rejected', 'ok'); chips(); render(true); if (state.drawer && state.drawer.type === 'user') openUser(state.drawer.id); }
      catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; if (e.message === 'not_pending') { closeModal(); render(true); } }
    };
  }
  function payoutAction(id) {
    const p = state.payRows.get(id) || {};
    openModal(`<h3>Send this payout through Paystack?</h3><p class="sub">${money(p.amount, p.country)} goes to ${esc((p.details && p.details.account) || 'the player’s MoMo wallet')} from your Paystack balance. It is marked paid when Paystack confirms; if the transfer fails, the money goes back to the player.</p>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Send ${money(p.amount, p.country)}</button></div>`);
    $('#mGo').onclick = async () => { try { $('#mGo').disabled = true; const r = await API.admin.payout(id); closeModal(); toast(r.status === 'success' ? 'Paid' : 'Sent – waiting for Paystack to confirm', 'ok'); chips(); render(true); } catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; } };
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
        <div class="page-actions"><span class="chip ${(f.provider || 'demo') === 'demo' ? 'warn' : 'ok'}"><i class="dot"></i>${(f.provider || 'demo') === 'demo' ? 'Demo odds feed' : 'Feed: ' + esc(f.provider)}</span></div></div>
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
  };
  async function openEvent(id) {
    openDrawer('<div class="loading">Loading event…</div>');
    const { event: e, markets, exposure } = await API.admin.event(id); const cc = state.me.country;
    const groups = ['Main', 'Goals', 'Corners', 'Half', 'Combo', 'Bookings'];
    markets.sort((a, b) => (groups.indexOf(a.grp) - groups.indexOf(b.grp)) || a.name.localeCompare(b.name));
    const allOff = markets.length && markets.every(m => m.suspended);
    const maxL = Math.max(...exposure.map(x => x.liability), 1);
    const open = e.status === 'scheduled' || e.status === 'live';
    $('#drawerBody').innerHTML = `
      <div class="d-head"><div><h3>${esc(e.home)} – ${esc(e.away)}</h3><p>${esc(e.country)} · ${esc(e.league)} · ID ${e.id} · ${when(e.kickoff)}</p></div></div>
      <div class="d-actions">${e.status === 'live' ? `${pill('live', P_EV)} <b class="num">${e.minute}' ${e.score_home}–${e.score_away}</b>` : pill(e.status, P_EV)}${e.ht_home != null ? ` <span class="muted small">HT ${e.ht_home}–${e.ht_away}</span>` : ''}</div>
      ${open ? `<div class="d-actions"><button class="btn sm ${allOff ? 'primary' : 'danger'}" data-suspend-all="${e.id}" data-v="${allOff ? 'false' : 'true'}">${allOff ? IC.unlock + ' Reopen all markets' : IC.lock + ' Suspend all markets'}</button><button class="btn sm" data-result="${e.id}">Enter result</button><button class="btn sm" data-cancel="${e.id}">Cancel event</button></div>` : ''}
      ${exposure.length ? `<div class="section-t">Open exposure (${exposure.length} selections)</div><div class="exp">${exposure.slice(0, 10).map(x => `<div class="exp-row"><span>${esc(x.label)} <span class="muted">· ${esc(x.market_key)}</span></span><span class="muted">${x.n} bets</span><span class="bar"><i style="width:${(x.liability / maxL) * 100}%"></i></span><b class="r num">${compact(x.liability, cc)}</b></div>`).join('')}</div>` : '<p class="muted small" style="margin:10px 0">No open bets on this event.</p>'}
      <div class="section-t">Markets (${markets.length}) <span class="muted" style="font-weight:400;text-transform:none;letter-spacing:0">· tap a price to change it, the lock to suspend</span></div>
      <div class="mk-grid">${markets.map(m => { const outs = Object.entries(m.outcomes).sort((a, b) => (a[1].i ?? 0) - (b[1].i ?? 0)); return `<div class="mk ${m.suspended ? 'susp' : ''}"><div class="mk-h"><span>${esc(m.name)}</span><span class="grp">${esc(m.grp)}</span><button class="btn xs ${m.suspended ? 'primary' : ''}" data-mk-susp="${esc(m.key)}" data-ev="${e.id}" data-v="${m.suspended ? 'false' : 'true'}">${m.suspended ? 'Reopen' : 'Suspend'}</button></div>
        <div class="mk-o" style="--c:${Math.min(m.cols || 3, 3)}">${outs.slice(0, 12).map(([k, o]) => `<button data-price="${esc(k)}" data-mk="${esc(m.key)}" data-ev="${e.id}" data-l="${esc(o.l)}" data-o="${o.o ?? ''}" class="${o.o == null ? 'off' : ''}"><span>${esc(o.l)}</span><b>${o.o == null ? '–' : Number(o.o).toFixed(2)}</b></button>`).join('')}${outs.length > 12 ? `<button class="muted" data-mk-more="${esc(m.key)}">+${outs.length - 12} more</button>` : ''}</div></div>`; }).join('')}</div>`;
    state.drawer = { type: 'event', id };
  }
  function priceModal(ev, mk, ok, label, cur) {
    openModal(`<h3>Set a price</h3><p class="sub">${esc(label)} · market <span class="mono">${esc(mk)}</span> · event ${ev}. The new price applies to new bets only; open bets keep the odds they were placed at.</p>
      <label class="field"><span>Decimal odds (min 1.01)</span><input id="mPrice" type="number" step="0.01" min="1.01" value="${cur || ''}"></label>
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" id="mGo">Save price</button></div>`);
    $('#mPrice').focus();
    $('#mGo').onclick = async () => { const v = +$('#mPrice').value; if (!(v >= 1.01)) return $('#mPrice').focus(); try { await API.admin.market(ev, mk, { outcome: ok, price: v }); closeModal(); toast('Price updated', 'ok'); openEvent(ev); } catch (e) { toast(errMsg(e), 'err'); } };
  }
  function resultModal(ev, cancel) {
    openModal(cancel ? `<h3>Cancel event ${ev}?</h3><p class="sub">Every open bet on this event is voided and the stakes refunded. Use it for postponed or abandoned matches.</p><div class="m-actions"><button class="btn" data-close-modal>Back</button><button class="btn danger solid" id="mGo">Cancel event and refund</button></div>`
      : `<h3>Enter the final result</h3><p class="sub">Event ${ev} is marked finished and every bet on it is settled at once. Only do this when the feed has not delivered the result.</p>
        <div class="field-row"><label class="field"><span>Home goals (FT)</span><input id="rH" type="number" min="0" value="0"></label><label class="field"><span>Away goals (FT)</span><input id="rA" type="number" min="0" value="0"></label></div>
        <div class="field-row"><label class="field"><span>Home goals (HT)</span><input id="rHH" type="number" min="0" placeholder="optional"></label><label class="field"><span>Away goals (HT)</span><input id="rHA" type="number" min="0" placeholder="optional"></label></div>
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
    const TYPES = ['deposit', 'withdrawal', 'bet', 'win', 'refund', 'cashout', 'bonus', 'commission', 'adjustment', 'game_bet', 'game_win', 'transfer_in', 'transfer_out', 'jackpot'];
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
      <div class="lad-flags"><label class="chk"><input type="checkbox" id="ladOn" ${L.enabled ? 'checked' : ''}> On</label><label class="chk"><input type="checkbox" id="ladId" ${L.requireId !== false ? 'checked' : ''}> Only after the ID is approved</label></div>
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
      const card = $('[data-set="deposit_bonuses"]'), v = { enabled: $('#ladOn').checked, requireId: $('#ladId').checked, NG: [{}, {}, {}], GH: [{}, {}, {}], times: +$('#ladTimes').value, min_odds: +$('#ladOdds').value, days: +$('#ladDays').value };
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

  /* ---------- ID checks ---------- */
  PAGES.kyc = async main => {
    const users = await API.admin.kyc();
    main.innerHTML = `
      <div class="page-head"><div><h2>ID checks</h2><p>Players who sent their ID details. Approve when they match the account; reject with a reason the player will see – they can send them again.</p></div></div>
      <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sent</th><th>Player</th><th>Name on ID</th><th>Date of birth</th><th>ID</th><th></th></tr></thead><tbody>
        ${users.map(u => { const k = u.kyc || {}; return `<tr><td class="muted">${when(k.submittedAt)}<div class="small">${ago(k.submittedAt)}</div></td>
          <td><div class="who"><b class="lnk" data-user="${u.id}">${esc(u.full_name || 'No name yet')}</b><small>ID ${u.uid} · ${flag(u.country)}${esc(u.phone ? phoneFmt(u.country, u.phone) : u.email || '')}</small></div></td>
          <td>${esc(k.fullName || '')}</td><td>${esc(k.dob || '')}</td><td>${esc(k.idType || '')}<div class="mono small">${esc(k.idNumber || '')}</div></td>
          <td><div class="acts"><button class="btn xs primary" data-kyc="approve" data-id="${u.id}">Approve</button><button class="btn xs danger" data-kyc="reject" data-id="${u.id}">Reject</button></div></td></tr>`; }).join('')
          || '<tr><td colspan="6"><div class="empty"><b>No ID checks waiting</b>New submissions appear here.</div></td></tr>'}
      </tbody></table></div></div>`;
  };
  function kycAction(id, action) {
    const approve = action === 'approve';
    const quick = ['The name does not match your account', 'The ID number is not valid', 'The date of birth does not match', 'The details could not be read'];
    openModal(`<h3>${approve ? 'Approve this ID?' : 'Reject this ID?'}</h3><p class="sub">${approve ? 'The player is told by email and can withdraw.' : 'The player is told by email with your reason and can send their details again.'}</p>
      ${approve ? '' : `<div class="quick">${quick.map(x => `<button type="button" class="btn xs" data-quick="${esc(x)}">${esc(x)}</button>`).join('')}</div><label class="field"><span>Reason shown to the player</span><input id="mReason"></label>`}
      <div class="m-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn ${approve ? 'primary' : 'danger solid'}" id="mGo">${approve ? 'Approve' : 'Reject'}</button></div>`);
    $$('#modalBody [data-quick]').forEach(b => b.onclick = () => { $('#mReason').value = b.dataset.quick; });
    $('#mGo').onclick = async () => {
      const reason = approve ? '' : $('#mReason').value.trim(); if (!approve && !reason) return $('#mReason').focus();
      try { $('#mGo').disabled = true; await API.admin.kycDecide(id, approve, reason || undefined); closeModal(); toast(approve ? 'ID approved' : 'ID rejected', 'ok'); chips(); render(true); if (state.drawer && state.drawer.type === 'user') openUser(state.drawer.id); }
      catch (e) { toast(errMsg(e), 'err'); $('#mGo').disabled = false; }
    };
  }

  /* ---------- Payment settings ---------- */
  PAGES.paysettings = async main => {
    const { settings: st, api } = await API.admin.paymentSettings();
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
          <div class="desc">Deposits and payouts go through the payment API (Paystack) once its secret key is set on the server. Until then you can take manual MoMo deposits below.</div>
          ${api.enabled ? `<div class="banner ok">Payment API connected${api.test ? ' – <b>test mode</b>, no real money' : ''}${Array.isArray(api.balance) ? ' · Paystack balance ' + api.balance.map(x => money(x.balance, x.currency === 'GHS' ? 'GH' : 'NG')).join(', ') : api.balance && api.balance.error ? ' · ' + esc(api.balance.error) : ''}</div>`
            : '<div class="banner warn">Payment API not connected – set <span class="mono">PAYSTACK_SECRET_KEY</span> in the server environment (Railway → Variables).</div>'}
          <label class="field"><span>Webhook URL – paste it in Paystack → Settings → API Keys &amp; Webhooks</span><input readonly value="${esc(api.webhook)}" onclick="this.select()"></label>
          <h5>Manual MoMo ${api.enabled ? '(not used while the API is connected)' : ''}</h5>
          <label class="field"><span>Network</span><select name="GH.momo.network">${Object.entries(NET).map(([v, l]) => `<option value="${v}" ${m.network === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${f('GH.momo.number', 'MoMo number', m.number ? '0' + m.number : '', 'inputmode="numeric" maxlength="10" placeholder="024 123 4567"')}
          ${f('GH.momo.name', 'Name on the wallet', m.name, 'maxlength="80"')}
          ${f('GH.momo.note', 'Note for players (optional)', m.note, 'maxlength="200"')}
          ${lims('GH', gh)}
        </div></div>
      </form>
      <div class="set-foot sticky"><p class="form-err" id="psErr" hidden></p><span class="saved" hidden>Saved</span><button class="btn primary" id="psSave">Save payment settings</button></div>`;
    $('#psSave').onclick = async () => {
      const v = { NG: { bank: {} }, GH: { momo: {} } };
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
      if (/agents\/:id\/pay/.test(a)) return `Paid agent commission${m.amount != null ? ' – ' + esc(String(m.amount)) : ''}${m.note ? ' – ' + esc(m.note) : ''}`;
      if (/agents/.test(a)) return m.active === false ? 'Removed an agent' : `Set agent commission – ${esc(String(m.rate))}% of ${esc({ revenue: 'net revenue', deposits: 'deposits', stakes: 'stakes' }[m.basis] || '')}`;
      if (/payment-settings/.test(a)) return `Changed payment settings${m.NG && m.NG.bank ? ` · Nigeria account ${esc(m.NG.bank.bank || '')} ${esc(m.NG.bank.number || '')}` : ''}`;
      if (/payout/.test(a)) return `Sent payout ${esc((l.target || '').split('/')[0].slice(0, 8))} through the payment API`;
      if (/kyc/.test(a)) return `${m.approve ? 'Approved' : 'Rejected'} ID check${m.reason ? ' – ' + esc(m.reason) : ''}`;
      if (/payments/.test(a) && m.amount) return `Confirmed deposit ${esc((l.target || '').split('/')[0].slice(0, 8))} – credited ${m.amount}`;
      if (/payments/.test(a)) return `${l.target && l.target.endsWith('approve') ? 'Approved' : 'Rejected'} payment ${esc((l.target || '').split('/')[0].slice(0, 8))}${m.reason ? ' – ' + esc(m.reason) : ''}`; if (/adjust/.test(a)) return `Balance adjustment ${m.amount > 0 ? '+' : ''}${m.amount} (${esc(m.type || 'adjustment')}) – ${esc(m.reason || '')}`; if (/users\/:id$/.test(a)) return `Updated player: ${esc(Object.entries(m).map(([k, v]) => k + '=' + v).join(', '))}`; if (/void/.test(a)) return `Voided ticket ${esc(l.target)}`; if (/markets/.test(a)) return `Market ${esc(l.target)}: ${m.suspended != null ? (m.suspended ? 'suspended' : 'reopened') : ''}${m.outcome ? ` price ${esc(m.outcome)} → ${m.price}` : ''}`; if (/suspend/.test(a)) return `${m.suspended ? 'Suspended' : 'Reopened'} all markets on event ${esc(l.target)}`; if (/result/.test(a)) return m.cancelled ? `Cancelled event ${esc(l.target)}` : `Result entered for event ${esc(l.target)}: ${m.home}–${m.away}${m.htHome != null ? ` (HT ${m.htHome}–${m.htAway})` : ''}`; if (/settings/.test(a)) return `Setting <span class="mono">${esc(l.target)}</span> = <span class="mono">${esc(JSON.stringify(m.value))}</span>`; if (/jackpot/.test(a)) return `Jackpot settlement${m.round ? ' of round ' + esc(m.round) : ''}`; if (/email\/test/.test(a)) return `Test email to ${esc(m.to || '')}`; return esc(a); };
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
      const b = t.closest('[data-lad-req],[data-proof-view],[data-req-dep],[data-cancel-req],[data-add-dep],[data-agent],[data-agent-edit],[data-agent-pay],[data-agent-new],[data-pay],[data-payout],[data-kyc],[data-user],[data-user-uid],[data-bet],[data-event],[data-void],[data-adjust],[data-user-set],[data-result],[data-cancel],[data-suspend-all],[data-mk-susp],[data-price]');
      if (!b) return;
      if (t.closest('a[href]') && !b.dataset.user) return;
      e.preventDefault(); e.stopPropagation();
      const d = b.dataset;
      if (d.ladReq) return requestDepositModal(d.ladReq, state.ladRows && state.ladRows.get(d.ladReq));
      if (d.proofView) return proofModal(d.proofView);
      if (d.addDep) return addDepositModal(d.addDep);
      if (d.reqDep) return requestDepositModal(d.reqDep);
      if (d.cancelReq) { API.admin.cancelNotice(d.cancelReq).then(() => { toast('Request cancelled', 'ok'); refreshDrawer(); }).catch(err => toast(errMsg(err), 'err')); return; }
      if (d.agentPay) return agentPayModal(d.agentPay).catch(err => toast(errMsg(err), 'err'));
      if (d.agentEdit) return agentModal(d.agentEdit).catch(err => toast(errMsg(err), 'err'));
      if (d.agentNew) return agentModal(null).catch(err => toast(errMsg(err), 'err'));
      if (d.agent) return openAgent(d.agent).catch(err => toast(errMsg(err), 'err'));
      if (d.pay) return payAction(d.id, d.pay);
      if (d.payout) return payoutAction(d.payout);
      if (d.kyc) return kycAction(d.id, d.kyc);
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
