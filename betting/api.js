/* =========================================================
   LetBetAfrika – API client
   Talks to the backend (server/). Base URL rules:
     • served by the server itself  → same origin
     • opened as a file / static host → window.LBA_API or demo mode
   When the API is unreachable the app falls back to the built-in
   demo simulation so the site never shows an empty screen.
   ========================================================= */
(() => {
  'use strict';
  const origin = location.protocol.startsWith('http') ? location.origin : null;
  const BASE = (window.LBA_API || (origin && !/claude\.ai|localhost:\d{4}$/.test(origin) ? origin : null) || '').replace(/\/$/, '');
  const KEY = 'lba_token';
  let token = null;
  try { token = localStorage.getItem(KEY); } catch {}

  const setToken = t => { token = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

  // server time = Date.now() + skew, from each answer's Date header (match clocks run on it, not on the phone's clock)
  let skew = 0, skewN = 0;
  async function call(method, path, body, { timeout = 8000 } = {}) {
    if (!BASE) throw Object.assign(new Error('offline'), { offline: true });
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
    let res; const t0 = Date.now();
    try {
      res = await fetch(BASE + '/api' + path, {
        method, signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (e) { throw Object.assign(new Error('offline'), { offline: true, cause: e }); }
    finally { clearTimeout(t); }
    const d = Date.parse(res.headers.get('date') || ''), t1 = Date.now();
    if (d && t1 - t0 < 3000) { const est = d + 500 - (t0 + t1) / 2; skew = skewN++ ? skew * 0.8 + est * 0.2 : est; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) setToken(null);
      throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, detail: data.detail, data });
    }
    return data;
  }
  const get = (p, o) => call('GET', p, null, o), post = (p, b, o) => call('POST', p, b, o), patch = (p, b) => call('PATCH', p, b), put = (p, b) => call('PUT', p, b);

  const API = {
    base: BASE, enabled: !!BASE, now: () => Date.now() + skew,
    get token() { return token; }, setToken,
    async ping() { try { await get('/events/leagues', { timeout: 4000 }); return true; } catch { return false; } },

    auth: {
      // `who` is a phone number (string) or { email }
      otp: (country, who, purpose = 'register') => post('/auth/otp', { country, ...(typeof who === 'object' ? who : { phone: who }), purpose }),
      register: d => post('/auth/register', d).then(r => { setToken(r.token); return r.user; }),
      login: (country, who, password) => post('/auth/login', { country, ...(typeof who === 'object' ? who : { phone: who }), password }).then(r => { setToken(r.token); return r.user; }),
      methods: () => get('/auth/methods', { timeout: 5000 }),
      reset: d => post('/auth/reset', d),
      me: () => get('/auth/me').then(r => r.user),
      logout: () => setToken(null),
      password: (current, password) => post('/auth/password', { current, password }),
      verify: d => post('/auth/verify', d, { timeout: 90000 }),   // carries two ID photos
      email: email => post('/auth/email', { email }),   // sends a code to the new address
      emailConfirm: (email, code) => post('/auth/email/confirm', { email, code }).then(r => r.user),
      limits: d => post('/auth/limits', d),
      referrals: () => get('/auth/referrals'),
    },
    wallet: {
      balance: () => get('/wallet'),
      transactions: filter => get('/wallet/transactions' + (filter ? '?filter=' + filter : '')).then(r => r.transactions),
      deposit: (amount, method, details) => post('/wallet/deposit', { amount, method, ...(details && Object.keys(details).length ? { details } : {}) }),
      withdraw: (amount, method, details) => post('/wallet/withdraw', { amount, method, details }),
      payments: () => get('/wallet/payments').then(r => r.payments),
      // `who` is a phone number (string) or { email }
      transfer: (who, amount, note) => post('/wallet/transfer', { ...(typeof who === 'object' ? who : { phone: who }), amount, note }),
      bonuses: () => get('/wallet/bonuses'),
      promo: code => post('/wallet/promo', { code }),                            // redeem a promo code
      options: () => get('/wallet/options'),                                     // ways to pay open for this country
      payment: id => get('/wallet/payments/' + encodeURIComponent(id)),           // { payment, balance }
      otp: (id, otp) => post('/wallet/deposit/' + encodeURIComponent(id) + '/otp', { otp }),
    },
    agent: {
      dashboard: () => get('/agent'),                                            // the agent's own screen
      payout: () => post('/agent/payout', {}),                                   // ask for everything available
    },
    support: {                                                                   // Live support (the player's chat)
      get: after => get('/support' + (after ? '?after=' + after : '')),
      unread: () => get('/support/unread').then(r => r.unread),
      read: () => post('/support/read', {}),
      send: text => post('/support/message', { text }),
      human: () => post('/support/human', {}),
    },
    jackpot: {
      round: () => get('/jackpot/round'),
      results: () => get('/jackpot/results').then(r => r.rounds),
      buy: (round, picks) => post('/jackpot/tickets', { round, picks }),
      tickets: () => get('/jackpot/tickets').then(r => r.tickets),
    },
    virtuals: {
      round: () => get('/virtuals/instant/round'),
      play: d => post('/virtuals/instant/play', d),
    },
    games: {
      play: (game, d) => post('/games/' + game + '/play', d),
      deal: () => post('/games/hilo/deal', {}),
      history: game => get('/games/history' + (game ? '?game=' + encodeURIComponent(game) : '')).then(r => r.plays),
      crash: {
        state: () => get('/games/crash/state', { timeout: 5000 }),
        bet: (stake, auto) => post('/games/crash/bet', { stake, auto: auto || null }),
        cashout: () => post('/games/crash/cashout', {}),
        cancel: () => post('/games/crash/cancel', {}),
      },
    },
    events: {
      leagues: () => get('/events/leagues').then(r => r.leagues),
      list: (params = {}) => get('/events?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v != null)))).then(r => r.events),
      one: id => get('/events/' + id).then(r => r.event),
      results: sport => get('/events/results' + (sport ? '?sport=' + sport : '')).then(r => r.events),
      search: q => get('/events/search?q=' + encodeURIComponent(q)).then(r => r.events),
    },
    bets: {
      place: d => post('/bets/place', d, { timeout: 30000 }),   // in-play bets are confirmed after a short wait
      list: status => get('/bets' + (status ? '?status=' + status : '')).then(r => r.bets),
      cashout: id => post(`/bets/${id}/cashout`),
      book: selections => post('/bets/book', { selections }).then(r => r.code),
      load: code => get('/bets/book/' + encodeURIComponent(code)),   // { selections, expired }
      codes: sport => get('/bets/codes' + (sport && sport !== 'all' ? '?sport=' + sport : '')).then(r => r.codes),
    },
    admin: {
      overview: cc => get('/admin/overview' + (cc ? '?cc=' + cc : '')),
      users: q => get('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')).then(r => r.users),
      updateUser: (id, d) => patch('/admin/users/' + id, d),
      adjust: (id, d) => post(`/admin/users/${id}/adjust`, d),
      payments: status => get('/admin/payments?status=' + (status || 'pending')).then(r => r.payments),
      // approve: { amount (deposit: what arrived), reference (withdrawal: payout ref), note } · reject: { reason }
      payment: (id, action, body) => post(`/admin/payments/${id}/${action}`, typeof body === 'string' ? { reason: body } : (body || {})),
      payout: (id, d) => post(`/admin/payments/${id}/payout`, d || {}),   // Ghana MoMo payout through the payment API: { reviewed: true, override? }
      paymentChecks: (id, refresh) => get(`/admin/payments/${id}/checks${refresh ? '?refresh=1' : ''}`),   // account checks before paying a withdrawal
      kyc: () => get('/admin/kyc').then(r => r.users),
      kycDecide: (id, approve, reason, resubmit) => post(`/admin/users/${id}/kyc`, { approve, ...(resubmit ? { resubmit: true } : {}), ...(reason ? { reason } : {}) }),
      // the ID photo as an object URL (admin-only, sent with the token)
      kycPhoto: async (id, side) => { const r = await fetch(BASE + `/api/admin/users/${id}/kyc-photo/${side}`, { headers: { authorization: 'Bearer ' + token } }); if (!r.ok) return null; return URL.createObjectURL(await r.blob()); },
      paymentSettings: () => get('/admin/payment-settings'),
      savePaymentSettings: v => put('/admin/payment-settings', v),
      bets: status => get('/admin/bets' + (status ? '?status=' + status : '')).then(r => r.bets),
      voidBet: id => post(`/admin/bets/${id}/void`),
      market: (eventId, key, d) => post(`/admin/markets/${eventId}/${key}`, d),
      result: (eventId, d) => post(`/admin/events/${eventId}/result`, d),
      // matches added by hand: { league: {id} | {name, country, flag}, home, away, kickoff (ISO), odds: {home, draw, away} }
      leagues: () => get('/admin/leagues').then(r => r.leagues),
      previewMatch: odds => post('/admin/events/preview', { odds }),
      createMatch: d => post('/admin/events', d),
      liveDesk: () => get('/admin/live-desk'),
      payoutHealth: () => get('/admin/payout-health'),                                          // your own matches in play
      setLiveBetting: (id, on) => post(`/admin/events/${id}/inplay`, { on }),            // before kick-off: open live betting at kick-off or not
      flags: () => get('/admin/flags').then(r => r.flags),
      teams: q => get('/admin/teams?q=' + encodeURIComponent(q || '')).then(r => r.teams),
      crestUpload: (name, image) => post('/admin/teams/crest', { name, image }),
      crestLink: (name, url) => post('/admin/teams/crest-link', { name, url }),
      crestFind: name => post('/admin/teams/crest-find', { name }),
      crestFlag: (name, flag) => post('/admin/teams/crest-flag', { name, flag }),
      liveScore: (id, d) => post(`/admin/events/${id}/live`, d),        // hand-added match: { home, away, period: H1 | HT | H2 }
      checkPayment: id => post(`/admin/payments/${id}/check`, {}),
      // Send money: from the payment API wallet to any MoMo number (password asked again)
      wallet: () => get('/admin/wallet'),
      walletLookup: (phone, network) => post('/admin/wallet/lookup', { phone, network }),
      walletSend: d => post('/admin/wallet/send', d),
      walletCheck: id => post(`/admin/wallet/${id}/check`, {}),
      // sub-agents
      agents: () => get('/admin/agents'),
      setAgent: (userId, on) => post(`/admin/users/${userId}/agent`, { on }),
      agentPayouts: status => get('/admin/agent-payouts?status=' + (status || 'pending')).then(r => r.payouts),
      agentPayout: (id, action, reason) => post(`/admin/agent-payouts/${id}/${action}`, reason ? { reason } : {}),
      support: status => get('/admin/support?status=' + (status || 'active')),     // Live support inbox
      supportCount: () => get('/admin/support/count').then(r => r.waiting),
      supportThread: (id, after) => get(`/admin/support/${id}` + (after ? '?after=' + after : '')),
      supportReply: (id, text) => post(`/admin/support/${id}/message`, { text }),
      supportClose: id => post(`/admin/support/${id}/close`, {}),
      // promo codes
      promos: () => get('/admin/promos').then(r => r.promos),
      createPromo: d => post('/admin/promos', d),
      updatePromo: (code, d) => post('/admin/promos/' + encodeURIComponent(code), d),
      settings: () => get('/admin/settings'),
      setSetting: (key, value) => put('/admin/settings/' + key, { value }),
      series: (days, cc) => get('/admin/series?days=' + (days || 14) + (cc ? '&cc=' + cc : '')).then(r => r.days),
      user: id => get('/admin/users/' + id),
      bet: id => get('/admin/bets/' + encodeURIComponent(id)),
      paymentsQ: (status, kind) => get(`/admin/payments?status=${status || 'pending'}${kind ? '&kind=' + kind : ''}`).then(r => r.payments),
      betsQ: (status, q) => get(`/admin/bets?${status ? 'status=' + status + '&' : ''}${q ? 'q=' + encodeURIComponent(q) : ''}`).then(r => r.bets),
      events: (status, q) => get(`/admin/events?status=${status || 'open'}${q ? '&q=' + encodeURIComponent(q) : ''}`).then(r => r.events),
      event: id => get('/admin/events/' + id),
      suspendEvent: (id, suspended) => post(`/admin/events/${id}/suspend`, { suspended }),
      feed: () => get('/admin/feed'),
      emailStatus: check => get('/admin/email/status' + (check ? '?check=1' : '')),
      emailLog: () => get('/admin/email/log').then(r => r.emails),
      emailTest: to => post('/admin/email/test', { to }),
      games: () => get('/admin/games').then(r => r.games),
      plays: game => get('/admin/games/plays' + (game ? '?game=' + game : '')).then(r => r.plays),
      crashVerify: id => get('/admin/games/crash/verify/' + id),
      jackpot: () => get('/admin/jackpot').then(r => r.rounds),
      jackpotSettle: round => post('/admin/jackpot/settle', round ? { round } : {}),
      transactions: (type, q) => get(`/admin/transactions?${type ? 'type=' + type + '&' : ''}${q ? 'q=' + encodeURIComponent(q) : ''}`).then(r => r.transactions),
      log: () => get('/admin/log').then(r => r.log),
    },
  };
  window.API = API;
})();
