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

  async function call(method, path, body, { timeout = 8000 } = {}) {
    if (!BASE) throw Object.assign(new Error('offline'), { offline: true });
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(BASE + '/api' + path, {
        method, signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        body: body == null ? undefined : JSON.stringify(body),
      });
    } catch (e) { throw Object.assign(new Error('offline'), { offline: true, cause: e }); }
    finally { clearTimeout(t); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) setToken(null);
      throw Object.assign(new Error(data.error || 'request_failed'), { status: res.status, detail: data.detail, data });
    }
    return data;
  }
  const get = (p, o) => call('GET', p, null, o), post = (p, b, o) => call('POST', p, b, o), patch = (p, b) => call('PATCH', p, b), put = (p, b) => call('PUT', p, b);

  const API = {
    base: BASE, enabled: !!BASE,
    get token() { return token; }, setToken,
    async ping() { try { await get('/events/leagues', { timeout: 4000 }); return true; } catch { return false; } },

    auth: {
      otp: (country, phone, purpose = 'register') => post('/auth/otp', { country, phone, purpose }),
      register: d => post('/auth/register', d).then(r => { setToken(r.token); return r.user; }),
      login: (country, phone, password) => post('/auth/login', { country, phone, password }).then(r => { setToken(r.token); return r.user; }),
      reset: d => post('/auth/reset', d),
      me: () => get('/auth/me').then(r => r.user),
      logout: () => setToken(null),
      password: (current, password) => post('/auth/password', { current, password }),
      verify: d => post('/auth/verify', d),
      email: email => post('/auth/email', { email }).then(r => r.user),
      limits: d => post('/auth/limits', d),
      referrals: () => get('/auth/referrals'),
    },
    wallet: {
      balance: () => get('/wallet'),
      transactions: filter => get('/wallet/transactions' + (filter ? '?filter=' + filter : '')).then(r => r.transactions),
      deposit: (amount, method) => post('/wallet/deposit', { amount, method }),
      withdraw: (amount, method, details) => post('/wallet/withdraw', { amount, method, details }),
      payments: () => get('/wallet/payments').then(r => r.payments),
      transfer: (phone, amount, note) => post('/wallet/transfer', { phone, amount, note }),
      bonuses: () => get('/wallet/bonuses'),
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
      place: d => post('/bets/place', d),
      list: status => get('/bets' + (status ? '?status=' + status : '')).then(r => r.bets),
      cashout: id => post(`/bets/${id}/cashout`),
      book: selections => post('/bets/book', { selections }).then(r => r.code),
      load: code => get('/bets/book/' + encodeURIComponent(code)).then(r => r.selections),
      codes: sport => get('/bets/codes' + (sport && sport !== 'all' ? '?sport=' + sport : '')).then(r => r.codes),
    },
    admin: {
      overview: () => get('/admin/overview'),
      users: q => get('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')).then(r => r.users),
      updateUser: (id, d) => patch('/admin/users/' + id, d),
      adjust: (id, d) => post(`/admin/users/${id}/adjust`, d),
      payments: status => get('/admin/payments?status=' + (status || 'pending')).then(r => r.payments),
      payment: (id, action, reason) => post(`/admin/payments/${id}/${action}`, { reason }),
      bets: status => get('/admin/bets' + (status ? '?status=' + status : '')).then(r => r.bets),
      voidBet: id => post(`/admin/bets/${id}/void`),
      market: (eventId, key, d) => post(`/admin/markets/${eventId}/${key}`, d),
      result: (eventId, d) => post(`/admin/events/${eventId}/result`, d),
      settings: () => get('/admin/settings'),
      setSetting: (key, value) => put('/admin/settings/' + key, { value }),
    },
  };
  window.API = API;
})();
