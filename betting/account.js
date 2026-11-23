/* =========================================================
   LetBetAfrika – account pages
   ---------------------------------------------------------
   #/register[/next]   sign up: mobile number or email + password → 6-digit code (SMS / email) → done
   #/login[/next]      login with mobile number or email, remember me
   #/forgot            reset password: number or email → code → new password
   #/deposit[/tab]     country-specific deposit methods
   #/withdraw[/tab]    bank / mobile money / transfer to friend

   Two modes, picked by app.js:
     • live – the API server is reachable (window.API); every
       account and money action goes through it.
     • demo – opened as a file / no server; everything is
       simulated in localStorage so the full flow can be tested.
   Places where a payment provider still has to plug in are
   marked  PROVIDER:  .
   ========================================================= */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = () => window.LBA_APP;
  const live = () => !!(app() && app().live);

  /* ---------------- Payment configuration ---------------- */
  const NG_BANKS = ['Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'FCMB', 'Globus Bank', 'GTBank', 'Jaiz Bank', 'Keystone Bank', 'Kuda', 'Moniepoint MFB', 'OPay', 'PalmPay', 'Polaris Bank', 'Providus Bank', 'Stanbic IBTC', 'Sterling Bank', 'SunTrust Bank', 'Titan Trust Bank', 'Union Bank', 'UBA', 'Unity Bank', 'VFD MFB', 'Wema Bank', 'Zenith Bank'];
  const NG_USSD = { 'Access Bank': '*901#', 'Ecobank': '*326#', 'Fidelity Bank': '*770#', 'First Bank': '*894#', 'FCMB': '*329#', 'GTBank': '*737#', 'Keystone Bank': '*7111#', 'Polaris Bank': '*833#', 'Stanbic IBTC': '*909#', 'Sterling Bank': '*822#', 'UBA': '*919#', 'Union Bank': '*826#', 'Unity Bank': '*7799#', 'Wema Bank': '*945#', 'Zenith Bank': '*966#' };
  const GH_BANKS = ['Absa Bank', 'Access Bank', 'ADB', 'CalBank', 'Consolidated Bank Ghana', 'Ecobank', 'Fidelity Bank', 'First Atlantic Bank', 'FNB Ghana', 'GCB Bank', 'National Investment Bank', 'OmniBSIC', 'Prudential Bank', 'Republic Bank', 'Societe Generale', 'Stanbic Bank', 'Standard Chartered', 'UBA', 'Universal Merchant Bank', 'Zenith Bank'];
  const GH_MOMO = [
    { id: 'mtn', short: 'MTN', name: 'MTN MoMo', color: '#ffcc00', ink: '#1c1600', prefixes: ['24', '25', '53', '54', '55', '59'], dial: '*170#' },
    { id: 'telecel', short: 'Telecel', name: 'Telecel Cash', color: '#e60000', ink: '#fff', prefixes: ['20', '50'], dial: '*110#' },
    { id: 'at', short: 'AT', name: 'AirtelTigo Money', color: '#0a3d91', ink: '#fff', prefixes: ['26', '27', '56', '57'], dial: '*110#' },
  ];
  const PAY = {
    NG: {
      curCode: 'NGN', depMin: 100, depMax: 9999999, wdMin: 100, wdMax: 9999999, tfMin: 100, tfMax: 9999999, chips: [500, 1000, 2000, 5000, 10000],
      acctLen: [10, 10], banks: NG_BANKS,
      dep: [{ id: 'transfer' }],
      wd: [{ id: 'bank' }, { id: 'friend' }],
    },
    GH: {
      curCode: 'GHS', depMin: 1, depMax: 100000, wdMin: 1, wdMax: 100000, tfMin: 1, tfMax: 100000, chips: [5, 10, 20, 50, 100],
      acctLen: [10, 16], banks: GH_BANKS,
      dep: [{ id: 'momo' }],
      wd: [{ id: 'momo' }, { id: 'friend' }],
    },
  };

  /* ---------------- Helpers ---------------- */
  // live: what the server has open for this country (GET /api/wallet/options) – ways to pay, limits, the bank / MoMo
  // details the admin set and the player's reference. Refreshed at most every 30 s.
  const opt = { data: null, at: 0, busy: false };
  function loadOptions(force) {
    if (!live() || opt.busy || (!force && opt.data && Date.now() - opt.at < 30000)) return;
    opt.busy = true;
    API.wallet.options().then(o => { opt.data = o; opt.at = Date.now(); }).catch(() => {})
      .finally(() => { opt.busy = false; if (['deposit', 'withdraw'].includes(app().state.route)) rerender(); });
  }
  const P = () => {
    const p = PAY[app().CC], L = live() && opt.data && opt.data.limits;
    return L ? { ...p, depMin: L.minDeposit, depMax: L.maxDeposit, wdMin: L.minWithdraw, wdMax: L.maxWithdraw } : p;
  };
  // deposit ways: live from the server (null while loading), demo from PAY
  const depWays = () => !live() ? P().dep.map(t => ({ ...t, mode: 'demo' }))
    : opt.data ? opt.data.deposit.map(x => ({ ...x, id: x.method === 'bank_transfer' ? 'transfer' : x.method === 'ussd' ? 'ussd' : 'momo' })) : null;
  const refCode = () => (live() && opt.data ? opt.data.reference : 'LB' + String(user().uid || 0).padStart(6, '0'));
  const user = () => app().state.user;
  const fmt = n => Number(n || 0).toLocaleString(app().C.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ref = p => p + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const digits = s => String(s || '').replace(/\D/g, '');
  const normPhone = s => digits(s).replace(/^(234|233)/, '').replace(/^0/, '');
  const fmtPhone = p => app().C.dial + ' ' + p;
  const mask = p => p.length > 6 ? p.slice(0, 3) + '****' + p.slice(-3) : p;
  const normEmail = s => String(s || '').trim().toLowerCase();
  const isEmail = s => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(normEmail(s));
  const maskEmail = e => { const [n, d] = String(e).split('@'); return (n.length > 2 ? n.slice(0, 2) : n.slice(0, 1)) + '***@' + d; };
  // a player is identified by their mobile number, or by their email if they signed up with email
  const idOf = u => (u && (u.phone || u.email)) || '';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const err = (e, fb) => app().apiErr ? app().apiErr(e, fb) : (fb || 'Something went wrong');
  const ICON = {
    back: '<svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.5-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    chev: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    card: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>',
    bank: '<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    gift: '<svg viewBox="0 0 24 24"><rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-2-4-6-4-6-1s6 1 6 1c2-4 6-4 6-1s-6 1-6 1"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/></svg>',
    hash: '<svg viewBox="0 0 24 24"><path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  };

  // Demo-only checksum so demo accounts need their password. The server uses bcrypt.
  const hashPw = (phone, pw) => { let h = 2166136261; for (const c of phone + ':' + pw) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  /* ---------------- Demo "accounts database" (demo mode only) ---------------- */
  const accounts = {
    all: () => app().store.get('accounts', {}),
    get: phone => accounts.all()[phone],
    put: (phone, rec) => { const a = accounts.all(); a[phone] = { ...(a[phone] || {}), ...rec }; app().store.set('accounts', a); },
  };
  function persist(u) { if (idOf(u) && !live()) accounts.put(idOf(u), { profile: u }); }
  function saveUser() { app().saveUser(); persist(user()); }

  /* ---------------- Device preferences per player (both modes) ----------------
     Saved payout accounts and cards live on the device, keyed by phone, so the
     server's user refresh never wipes them.  PROVIDER: card tokens move to the
     payment provider's vault once it is connected.                           */
  const prefs = {
    get: () => ({ banks: [], cards: [], wdBank: 0, cardDeposited: false, ...app().store.get('prefs_' + idOf(user()), {}) }),
    set: patch => { const v = { ...prefs.get(), ...patch }; app().store.set('prefs_' + idOf(user()), v); return v; },
  };
  // move anything saved on an older demo profile into prefs
  function migratePrefs() {
    const u = user(); if (!u) return;
    if ((u.banks && u.banks.length) || (u.cards && u.cards.length) || u.cardDeposited) {
      const p = prefs.get();
      prefs.set({ banks: p.banks.length ? p.banks : (u.banks || []), cards: p.cards.length ? p.cards : (u.cards || []), cardDeposited: p.cardDeposited || !!u.cardDeposited });
      delete u.banks; delete u.cards; delete u.cardDeposited; delete u.wdBank; app().saveUser();
    }
  }

  /* ---------------- Password rules (same as the reference site) ---------------- */
  const RULES = [
    ['len', 'At least 8 characters', p => p.length >= 8],
    ['up', 'One upper case letter', p => /[A-Z]/.test(p)],
    ['low', 'One lower case letter', p => /[a-z]/.test(p)],
    ['num', 'One number', p => /\d/.test(p)],
  ];
  const pwOk = p => RULES.every(r => r[2](p));
  const rulesHTML = () => `<ul class="au-rules">${RULES.map(([k, t]) => `<li data-rule="${k}">${ICON.check}${t}</li>`).join('')}</ul>`;
  function bindRules(form, input) {
    const upd = () => RULES.forEach(([k, , fn]) => { const li = $(`[data-rule="${k}"]`, form); if (li) li.classList.toggle('ok', fn(input.value)); });
    input.addEventListener('input', upd); upd();
  }

  /* ---------------- Shared page chrome ---------------- */
  function pageHead(title, opts = {}) {
    return `<div class="wl-head">
      <button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>
      <h1>${title}</h1>
      ${opts.help ? `<a class="icon-btn" href="#/support" aria-label="Live support">${ICON.help}</a>` : ''}
      <a class="icon-btn" href="#/home" aria-label="Home">${ICON.home}</a>
    </div>`;
  }
  const countryRow = () => `<div class="au-cc"><span class="cc-flag">${window.LBA ? LBA.flag(app().C.flag) : ''}</span><b>${app().C.name}</b><button type="button" class="au-link" data-open-cc>Change ${ICON.chev}</button></div>`;
  const phoneField = (name = 'phone', val = '', ro = false) => `<div class="au-field au-phone"><span class="au-dial">${app().C.dial}</span><input name="${name}" inputmode="tel" autocomplete="tel-national" placeholder="Mobile Number" aria-label="Mobile number" value="${app().esc(val)}" ${ro ? 'readonly' : ''} maxlength="13"></div>`;
  const emailField = (name = 'email', val = '') => `<div class="au-field au-mail"><span class="au-dial">${ICON.mail}</span><input name="${name}" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="Email Address" aria-label="Email address" value="${app().esc(val)}" maxlength="120"></div>`;
  const pwField = (name, ph, ac = 'current-password') => `<div class="au-field au-pw"><input name="${name}" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}"><button type="button" class="au-eye" data-eye aria-label="Show password">${ICON.eye}</button></div>`;
  const demoNote = txt => live() ? '' : `<p class="wl-demo"><b>DEMO</b> ${txt}</p>`;
  const testNote = txt => `<p class="wl-demo"><b>TEST</b> ${txt}</p>`;
  const root = page => $(`#page-${page} .acc-root`);
  const remember = { get: () => { try { return localStorage.getItem('lba_' + app().CC + '_remember') || ''; } catch { return ''; } },
    set: p => { try { p ? localStorage.setItem('lba_' + app().CC + '_remember', p) : localStorage.removeItem('lba_' + app().CC + '_remember'); } catch {} } };
  async function signedIn(u, msg) {
    const a = app();
    // an email login can belong to the other country's site: switch to the player's country (the token is kept)
    if (live() && u.country && u.country !== a.CC) { try { localStorage.setItem('lba_country', u.country); } catch {} location.reload(); return new Promise(() => {}); }
    a.state.user = u; a.saveUser(); wl.hasDeposit = null;
    if (live()) await a.liveBets();
    a.renderAuth(); a.renderMe();
    if (msg) a.toast(msg);
  }

  /* =========================================================
     SIGN UP  (mobile number or email, verified by a 6-digit code)
     ========================================================= */
  // a sign-up link with ?ref=LB10000123 (Refer & Earn, agents) fills in the referral code
  const refFromLink = () => { try { const v = (new URLSearchParams(location.search).get('ref') || sessionStorage.getItem('lba_ref') || '').trim().toUpperCase(); if (/^(LB)?\d{6,12}$/.test(v)) { sessionStorage.setItem('lba_ref', v); return v; } } catch {} return ''; };
  const reg = { step: 1, via: '', phone: '', email: '', pw: '', pwKeep: '', refCode: refFromLink(), agree: false, code: '', timer: null, next: '' };
  // Channels that can deliver a code right now. Live: asked once from the server (a channel without a working
  // provider is not offered); demo: both. If the server offers neither, email is shown and the server explains.
  const methods = { phone: true, email: true, signupCode: !live(), loaded: false };
  async function loadMethods() {
    if (!live() || methods.loaded) return false;
    try {
      const m = await API.auth.methods();
      const phone = !!m.phone, email = !!m.email || !m.phone;
      const signupCode = !!m.signupCode;
      const changed = phone !== methods.phone || email !== methods.email || signupCode !== methods.signupCode;
      Object.assign(methods, { phone, email, signupCode, loaded: true });
      return changed;
    } catch { return false; }
  }
  const codeVias = () => ['phone', 'email'].filter(v => methods[v]);
  // sign-up: any channel when no code is asked (SIGNUP_CODE off), else only channels that can deliver one
  const signupVias = () => (methods.signupCode ? codeVias() : ['phone', 'email']);
  const pristine = form => !form || $$('input[name=phone], input[name=email], input[name=pw]', form).every(i => !i.value);
  const viaTabs = (cur, vias) => vias.length < 2 ? '' : `<div class="au-via" role="tablist" aria-label="Use mobile number or email">${vias.map(v =>
    `<button type="button" role="tab" data-via="${v}" aria-selected="${v === cur}" class="${v === cur ? 'on' : ''}">${v === 'email' ? ICON.mail + 'Email' : ICON.phone + 'Mobile Number'}</button>`).join('')}</div>`;

  function renderRegister(next) {
    reg.next = next ? decodeURIComponent(next) : '';
    if (reg.step === 3 && !user()) reg.step = 1;
    // opened from an agent's link (?agent=AG…): their code is filled in
    if (reg.step === 1 && !reg.refCode) { try { reg.refCode = localStorage.getItem('lba_agent') || ''; } catch {} }
    if (user() && reg.step !== 3) return app().go(reg.next || 'home');
    const el = root('register');
    if (reg.step === 2) return renderOtp(el, reg, {
      title: reg.via === 'email' ? 'Verify your email' : 'Verify your number',
      onBack: () => { reg.step = 1; renderRegister(next); },
      onCode: code => createAccount(code),
    });
    if (reg.step === 3) return renderRegDone(el);
    if (live() && !methods.loaded) loadMethods().then(ch => { if (ch && reg.step === 1 && app().state.route === 'register' && pristine($('#regForm'))) renderRegister(next); });
    const vias = signupVias();
    if (!vias.includes(reg.via)) reg.via = vias[0];
    const byEmail = reg.via === 'email';
    el.innerHTML = `
      <div class="au-top">
        <button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>
        <a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a>
      </div>
      <div class="au-tabs"><a class="on" href="#/register${next ? '/' + next : ''}">Register</a><a href="#/login${next ? '/' + next : ''}">Login</a></div>
      <form class="au-form" id="regForm" novalidate>
        <div class="au-bonus">${ICON.gift}<span><b>Deposit bonuses</b> on your first 3 deposits after your ID check</span></div>
        ${countryRow()}
        ${viaTabs(reg.via, vias)}
        <div class="au-group">
          ${byEmail ? emailField('email', reg.email) : phoneField('phone', reg.phone)}
          ${pwField('pw', 'Set Password', 'new-password')}
        </div>
        <p class="au-err" id="regErr" role="alert" hidden></p>
        ${rulesHTML()}
        <details class="au-ref" ${reg.refCode ? 'open' : ''}><summary>${/^AG/i.test(reg.refCode) ? 'Joining with agent code' : 'Have a referral or agent code?'} <span class="muted">(optional)</span></summary>
          <div class="au-field"><input name="refCode" placeholder="Referral or agent code" aria-label="Referral or agent code" value="${app().esc(reg.refCode)}" maxlength="12" autocapitalize="characters"></div>
        </details>
        <label class="au-check"><input type="checkbox" name="agree" ${reg.agree ? 'checked' : ''}><span>I am 18 or older and I accept the <a href="#/legal/terms">Terms &amp; Conditions</a> and <a href="#/legal/privacy">Privacy Policy</a>.</span></label>
        <button class="au-btn" id="regBtn" disabled>Create Account</button>
        <p class="au-alt">Already have an account? <a href="#/login${next ? '/' + next : ''}">Log in</a></p>
        <p class="au-lic"><b>18+</b> Betting can be addictive. Please play responsibly.</p>
      </form>`;
    const f = $('#regForm'), btn = $('#regBtn');
    if (reg.pwKeep) { f.pw.value = reg.pwKeep; reg.pwKeep = ''; }
    bindRules(f, f.pw);
    const idOk = () => (byEmail ? isEmail(f.email.value) : normPhone(f.phone.value).length >= app().C.digits);
    const check = () => { btn.disabled = !(idOk() && pwOk(f.pw.value) && f.agree.checked); };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    $$('[data-via]', f).forEach(b => b.addEventListener('click', () => {
      if (b.dataset.via === reg.via) return;
      Object.assign(reg, { via: b.dataset.via, pwKeep: f.pw.value, refCode: f.refCode.value.trim().toUpperCase(), agree: f.agree.checked });
      if (f.email) reg.email = f.email.value.trim(); if (f.phone) reg.phone = normPhone(f.phone.value);
      renderRegister(next);
      const n = $(`#regForm [name=${reg.via}]`); if (n) n.focus();
    }));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const er = $('#regErr'); er.hidden = true;
      const id = byEmail ? normEmail(f.email.value) : normPhone(f.phone.value);
      if (byEmail && !isEmail(id)) return showErr(er, 'Enter a valid email address.');
      if (!byEmail && id.length !== app().C.digits) return showErr(er, `Enter a valid ${app().C.name} mobile number (${app().C.digits} digits after ${app().C.dial}).`);
      if (!pwOk(f.pw.value)) return showErr(er, 'Your password does not meet the rules below.');
      if (!live() && accounts.get(id)?.h) return showErr(er, taken(reg.via));
      Object.assign(reg, byEmail ? { email: id } : { phone: id }, { pw: f.pw.value, refCode: f.refCode.value.trim().toUpperCase(), agree: true });
      // no code at sign-up: the account opens straight away
      if (live() && !methods.signupCode) {
        const stop = spin(btn, 'Creating your account…');
        try { await createAccount(null); }
        catch (x) { showErr(er, ['phone_taken', 'email_taken'].includes(x.message) ? taken(reg.via) : err(x, 'Could not create the account')); }
        finally { stop(); }
        return;
      }
      const stop = spin(btn, 'Sending code…');
      try { await sendCode(reg, 'register'); reg.step = 2; renderRegister(next); }
      catch (x) { showErr(er, ['phone_taken', 'email_taken'].includes(x.message) ? taken(reg.via) : err(x, 'Could not send the code')); }
      finally { stop(); }
    });
  }
  const taken = via => `This ${via === 'email' ? 'email' : 'number'} is already registered. <a href="#/login">Log in</a> or <a href="#/forgot">reset your password</a>.`;

  async function createAccount(code) {
    const a = app(), byEmail = reg.via === 'email', id = byEmail ? reg.email : reg.phone;
    let u;
    if (live()) {
      // server checks the code, hashes the password and opens the wallet
      u = a.mapUser(await API.auth.register({ country: a.CC, ...(byEmail ? { email: id } : { phone: id }), ...(code ? { code } : {}), password: reg.pw, ...(reg.refCode ? { ref: reg.refCode } : {}) }));
      if (reg.refCode) u.referredBy = reg.refCode;
    } else {
      if (code !== reg.code) throw new Error('bad_code');
      u = { ...(byEmail ? { email: id } : { phone: id }), balance: 0, uid: Math.floor(1e7 + Math.random() * 9e7), created: Date.now(), referredBy: reg.refCode || null, verified: false };
      accounts.put(id, { h: hashPw(id, reg.pw), profile: u });
    }
    await signedIn(u);
    remember.set(id);
    reg.pw = ''; reg.step = 3; renderRegister(reg.next ? encodeURIComponent(reg.next) : '');
  }

  function renderRegDone(el) {
    const a = app();
    el.innerHTML = `
      <div class="au-top"><span></span><a class="icon-btn" href="#/home" data-reg-reset aria-label="Close">${ICON.close}</a></div>
      <div class="au-done">
        <div class="au-tick">${ICON.check}</div>
        <h2>Welcome to LetBetAfrika!</h2>
        <p>Your account <b>${reg.via === 'email' ? a.esc(reg.email) : fmtPhone(reg.phone)}</b> is ready.</p>
        <div class="au-bonus big">${ICON.gift}<span><b>Get bonuses on your first 3 deposits</b>Verify your ID – it takes 2 minutes – then each of your first 3 deposits earns a bonus.</span></div>
        <a class="au-btn" href="#/deposit" data-reg-reset>Deposit Now</a>
        <a class="au-btn ghost" href="#/${a.esc(reg.next || 'home')}" data-reg-reset>Start Betting</a>
        <a class="au-link center" href="#/acct/verify" data-reg-reset>Verify your ID now for faster withdrawals ${ICON.chev}</a>
      </div>`;
    $$('[data-reg-reset]', el).forEach(x => x.addEventListener('click', () => { Object.assign(reg, { step: 1, phone: '', email: '', refCode: refFromLink(), agree: false }); }));
    if (window.Motion && Motion.confetti) Motion.confetti();
  }

  /* ---------------- Code step (sign up + reset), by SMS or email ---------------- */
  async function sendCode(flow, purpose) {
    const a = app(), byEmail = flow.via === 'email';
    const to = byEmail ? maskEmail(flow.email) : fmtPhone(mask(flow.phone));
    if (live()) {
      const r = await API.auth.otp(a.CC, byEmail ? { email: flow.email } : flow.phone, purpose);
      flow.devCode = r.devCode || '';
      a.toast(r.devCode ? `Test code: ${r.devCode}` : `We sent a 6-digit code to ${to}`);
    } else {
      flow.code = String(Math.floor(100000 + Math.random() * 900000)); flow.devCode = flow.code;
      a.toast(`Demo ${byEmail ? 'email' : 'SMS'} to ${to}: your LetBetAfrika code is ${flow.code}`);
    }
    flow.sentAt = Date.now();
  }

  function renderOtp(el, flow, { title, onBack, onCode }) {
    const purpose = flow === fp ? 'reset' : 'register', byEmail = flow.via === 'email', chan = byEmail ? 'email' : 'SMS';
    el.innerHTML = `
      <div class="au-top">
        <button class="icon-btn" data-otp-back aria-label="Back">${ICON.back}</button>
        <a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a>
      </div>
      <form class="au-form" id="otpForm" novalidate>
        <h2 class="au-h">${title}</h2>
        <p class="au-sub">Enter the 6-digit code we sent by ${chan} to <b>${byEmail ? app().esc(flow.email) : fmtPhone(flow.phone)}</b>. <button type="button" class="au-link" data-otp-back>Change ${byEmail ? 'email' : 'number'}</button></p>
        <div class="au-otp" id="otpBoxes" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="6" aria-label="Digit ${i + 1}">`).join('')}</div>
        <p class="au-err" id="otpErr" role="alert" hidden></p>
        <button class="au-btn" id="otpBtn" disabled>Verify</button>
        <p class="au-resend" id="otpResend"></p>
        ${byEmail && !flow.devCode ? '<p class="au-hint">Not in your inbox? Check the spam or promotions folder.</p>' : ''}
        ${flow.devCode ? (live() ? testNote(`The ${byEmail ? 'email service' : 'SMS provider'} is in test mode, so the code is shown at the top of the screen.`) : demoNote(`The code is shown at the top of the screen instead of being sent by ${chan}.`)) : ''}
      </form>`;
    $$('[data-otp-back]', el).forEach(b => b.addEventListener('click', onBack));
    const boxes = $$('#otpBoxes input', el), btn = $('#otpBtn', el), er = $('#otpErr', el);
    const val = () => boxes.map(b => b.value).join('');
    const sync = () => { btn.disabled = val().length !== 6; };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = digits(b.value);
        if (d.length > 1) { d.slice(0, 6 - i).split('').forEach((c, j) => { boxes[i + j].value = c; }); boxes[Math.min(5, i + d.length - 1)].focus(); }
        else { b.value = d; if (d && i < 5) boxes[i + 1].focus(); }
        er.hidden = true; sync();
        if (val().length === 6) $('#otpForm', el).requestSubmit();
      });
      b.addEventListener('keydown', e => { if (e.key === 'Backspace' && !b.value && i) { boxes[i - 1].focus(); boxes[i - 1].value = ''; sync(); } });
    });
    setTimeout(() => boxes[0].focus(), 50);
    const tick = () => {
      const left = 60 - Math.floor((Date.now() - flow.sentAt) / 1000), r = $('#otpResend', el);
      if (!r || !r.isConnected) return clearInterval(flow.timer);
      if (left > 0) r.innerHTML = `Resend code in <b>${left}s</b>`;
      else {
        r.innerHTML = `Didn't get it? <button type="button" class="au-link" id="otpAgain">Resend code</button>`; clearInterval(flow.timer);
        $('#otpAgain', el).onclick = async () => { try { await sendCode(flow, purpose); boxes.forEach(b => b.value = ''); sync(); flow.timer = setInterval(tick, 1000); tick(); } catch (x) { showErr(er, err(x, 'Could not resend the code')); } };
      }
    };
    clearInterval(flow.timer); flow.timer = setInterval(tick, 1000); tick();
    let busy = false;
    $('#otpForm', el).addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return; busy = true;
      const stop = spin(btn, 'Verifying…');
      try { await onCode(val()); clearInterval(flow.timer); }
      catch (x) {
        boxes.forEach(b => b.classList.add('bad')); setTimeout(() => boxes.forEach(b => b.classList.remove('bad')), 500);
        showErr(er, x.message === 'bad_code' ? `That code is wrong or has expired. Check the ${chan} and try again.` : err(x, 'Could not verify the code'));
      } finally { busy = false; if (btn.isConnected) stop(); }
    });
  }

  /* =========================================================
     LOGIN  (mobile number or email + password)
     ========================================================= */
  const login = { via: '' };
  function renderLogin(next) {
    next = next || '';
    const nextRoute = decodeURIComponent(next);
    if (user()) return app().go(nextRoute || 'home');
    const a = app(), el = root('login'), remembered = remember.get(), remEmail = remembered.includes('@');
    if (!login.via) login.via = remEmail ? 'email' : 'phone';
    const byEmail = login.via === 'email';
    const why = { deposit: 'Log in to deposit', withdraw: 'Log in to withdraw', acct: 'Log in to view your account' }[nextRoute.split('/')[0]];
    el.innerHTML = `
      <div class="au-top">
        <button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>
        <a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a>
      </div>
      <div class="au-tabs"><a href="#/register${next ? '/' + next : ''}">Register</a><a class="on" href="#/login${next ? '/' + next : ''}">Login</a></div>
      <form class="au-form" id="loginForm" novalidate>
        ${why ? `<p class="au-why">${ICON.lock}${why}</p>` : ''}
        ${countryRow()}
        ${viaTabs(login.via, ['phone', 'email'])}
        <div class="au-group">
          ${byEmail ? emailField('email', remEmail ? remembered : '') : phoneField('phone', remEmail ? '' : remembered)}
          ${pwField('pw', 'Password')}
        </div>
        <p class="au-err" id="loginErr" role="alert" hidden></p>
        <div class="au-row">
          <label class="au-check sm"><input type="checkbox" name="remember" checked><span>Remember me</span></label>
          <label class="au-check sm"><input type="checkbox" name="keep" checked><span>Keep me signed in</span></label>
        </div>
        <button class="au-btn" id="loginBtn" disabled>Login</button>
        <div class="au-row links"><a href="#/forgot">Forgot Password?</a><a href="#/register${next ? '/' + next : ''}">Create New Account</a></div>
        ${demoNote(`An unregistered ${byEmail ? 'email' : 'number'} logs in with a ${a.whole(a.C.demo)} demo balance. Registered accounts need their password.`)}
      </form>`;
    const f = $('#loginForm'), btn = $('#loginBtn'), er = $('#loginErr');
    const idv = () => (byEmail ? normEmail(f.email.value) : normPhone(f.phone.value));
    const check = () => { btn.disabled = !((byEmail ? isEmail(idv()) : idv().length >= a.C.digits) && f.pw.value.length > 0); };
    f.addEventListener('input', () => { er.hidden = true; check(); }); check();
    $$('[data-via]', f).forEach(b => b.addEventListener('click', () => { if (b.dataset.via !== login.via) { login.via = b.dataset.via; renderLogin(next); const n = $(`#loginForm [name=${login.via}]`); if (n) n.focus(); } }));
    if (remembered && remEmail === byEmail) setTimeout(() => f.pw.focus(), 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const id = idv();
      if (byEmail ? !isEmail(id) : id.length !== a.C.digits) return showErr(er, byEmail ? 'Enter a valid email address.' : `Enter a valid ${a.C.name} mobile number.`);
      const stop = spin(btn, 'Logging in…');
      try {
        let u, greet = 'Welcome back!';
        if (live()) u = a.mapUser(await API.auth.login(a.CC, byEmail ? { email: id } : id, f.pw.value));
        else {
          await sleep(500);
          const rec = accounts.get(id);
          if (rec && rec.h) { if (rec.h !== hashPw(id, f.pw.value)) throw new Error('bad_login'); u = rec.profile; }
          else { u = (rec && rec.profile) || { ...(byEmail ? { email: id } : { phone: id }), balance: a.C.demo, uid: Math.floor(1e7 + Math.random() * 9e7), demo: true }; greet = `Welcome! Demo balance ${a.whole(u.balance)}`; }
        }
        remember.set(f.remember.checked ? id : '');
        await signedIn(u, greet);
        a.go(nextRoute || 'home');
      } catch (x) { showErr(er, x.message === 'bad_login' ? `Incorrect ${byEmail ? 'email' : 'mobile number'} or password.` : err(x, 'Could not log in')); }
      finally { if (btn.isConnected) stop(); }
    });
  }

  /* =========================================================
     FORGOT PASSWORD  (code by SMS or email)
     ========================================================= */
  const fp = { step: 1, via: '', phone: '', email: '', code: '', entered: '', timer: null };
  function renderForgot() {
    const a = app(), el = root('forgot');
    if (fp.step === 2) return renderOtp(el, fp, {
      title: 'Reset password',
      onBack: () => { fp.step = 1; renderForgot(); },
      // the server checks the code together with the new password; demo checks it now
      onCode: async code => { if (!live() && code !== fp.code) throw new Error('bad_code'); fp.entered = code; fp.step = 3; renderForgot(); },
    });
    const id = () => (fp.via === 'email' ? fp.email : fp.phone);
    if (fp.step === 3) {
      el.innerHTML = `
        <div class="au-top"><button class="icon-btn" data-back aria-label="Back">${ICON.back}</button><a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a></div>
        <form class="au-form" id="fpForm" novalidate>
          <h2 class="au-h">Set a new password</h2>
          <p class="au-sub">For ${fp.via === 'email' ? a.esc(fp.email) : fmtPhone(fp.phone)}</p>
          <div class="au-group">${pwField('pw1', 'New Password', 'new-password')}${pwField('pw2', 'Confirm New Password', 'new-password')}</div>
          <p class="au-err" id="fpErr" role="alert" hidden></p>
          ${rulesHTML()}
          <button class="au-btn" id="fpBtn" disabled>Reset Password</button>
        </form>`;
      const f = $('#fpForm'), btn = $('#fpBtn');
      bindRules(f, f.pw1);
      f.addEventListener('input', () => { btn.disabled = !(pwOk(f.pw1.value) && f.pw2.value); });
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (f.pw1.value !== f.pw2.value) return showErr($('#fpErr'), 'The two passwords do not match.');
        const stop = spin(btn, 'Saving…');
        try {
          if (live()) await API.auth.reset({ country: a.CC, ...(fp.via === 'email' ? { email: fp.email } : { phone: fp.phone }), code: fp.entered, password: f.pw1.value });
          else { await sleep(500); accounts.put(id(), { h: hashPw(id(), f.pw1.value) }); }
          remember.set(id()); login.via = fp.via;
          fp.step = 1; a.toast('Password reset. Please log in with your new password.'); a.go('login');
        } catch (x) {
          if (x.message === 'bad_code') { fp.step = 2; renderForgot(); return a.toast('That code is wrong or has expired. Request a new one.', 'err'); }
          showErr($('#fpErr'), err(x, 'Could not reset the password'));
        } finally { if (btn.isConnected) stop(); }
      });
      return;
    }
    if (live() && !methods.loaded) loadMethods().then(ch => { if (ch && fp.step === 1 && app().state.route === 'forgot' && pristine($('#fpForm'))) renderForgot(); });
    const vias = codeVias(), rem = remember.get(), remEmail = rem.includes('@');
    if (!vias.includes(fp.via)) fp.via = vias.includes(remEmail ? 'email' : 'phone') ? (remEmail ? 'email' : 'phone') : vias[0];
    const byEmail = fp.via === 'email';
    el.innerHTML = `
      <div class="au-top"><button class="icon-btn" data-back aria-label="Back">${ICON.back}</button><a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a></div>
      <form class="au-form" id="fpForm" novalidate>
        <h2 class="au-h">Forgot password?</h2>
        <p class="au-sub">Enter the ${byEmail ? 'email address' : 'mobile number'} you registered with. We'll send you a code to reset your password.</p>
        ${countryRow()}
        ${viaTabs(fp.via, vias)}
        <div class="au-group">${byEmail ? emailField('email', fp.email || (remEmail ? rem : '')) : phoneField('phone', fp.phone || (remEmail ? '' : rem))}</div>
        <p class="au-err" id="fpErr" role="alert" hidden></p>
        <button class="au-btn" id="fpBtn">Send Code</button>
        <p class="au-alt">Remembered it? <a href="#/login">Log in</a></p>
      </form>`;
    const f = $('#fpForm'), btn = $('#fpBtn');
    const val = () => (byEmail ? normEmail(f.email.value) : normPhone(f.phone.value));
    const check = () => { btn.disabled = byEmail ? !isEmail(val()) : val().length < a.C.digits; };
    f.addEventListener('input', check); check();
    $$('[data-via]', f).forEach(b => b.addEventListener('click', () => { if (b.dataset.via !== fp.via) { fp.via = b.dataset.via; renderForgot(); } }));
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const v = val(), er = $('#fpErr');
      const none = `No account is registered with ${byEmail ? a.esc(v) : fmtPhone(v)}. <a href="#/register">Create one</a>.`;
      if (!live() && !accounts.get(v)?.h) return showErr(er, none);
      const stop = spin(btn, 'Sending code…');
      try { fp[byEmail ? 'email' : 'phone'] = v; await sendCode(fp, 'reset'); fp.step = 2; renderForgot(); }
      catch (x) { showErr(er, x.message === 'no_account' ? none : err(x, 'Could not send the code')); }
      finally { if (btn.isConnected) stop(); }
    });
  }

  async function changePassword(f) {
    const a = app(), u = user();
    if (!pwOk(f.pw1.value)) return a.toast('Use 8+ characters with an upper case letter, a lower case letter and a number', 'err');
    if (f.pw1.value !== f.pw2.value) return a.toast('New passwords do not match', 'err');
    try {
      if (live()) await API.auth.password(f.cur.value, f.pw1.value);
      else {
        const rec = accounts.get(idOf(u));
        if (rec && rec.h && rec.h !== hashPw(idOf(u), f.cur.value)) return a.toast('Current password is not correct', 'err');
        accounts.put(idOf(u), { h: hashPw(idOf(u), f.pw1.value), profile: u });
      }
      a.toast('Password updated'); f.reset();
    } catch (x) { a.toast(err(x, 'Could not update the password'), 'err'); }
  }

  /* =========================================================
     WALLET – deposit & withdraw
     One layout for both: balance card → method → method details → amount → one button → recent activity.
     Live: money moves only through the API. PAYMENTS_MODE=demo credits a deposit at once; with a payment provider
     the server answers `pending` and `next` = { url } (hosted checkout – card details are never typed on our pages)
     or { message, rows } (bank transfer account, USSD code, mobile-money prompt) – see PROVIDER: in routes/wallet.js.
     Demo (opened as a file): simulated in localStorage with the same screens.
     ========================================================= */
  const wl = { dep: null, wd: null, busy: false, hasDeposit: null, amt: { dep: '', wd: '' }, recent: null, recentAt: 0 };
  const METHOD = {
    card: { name: 'Card', sub: cc => (cc === 'GH' ? 'Visa and Mastercard · instant' : 'Visa, Mastercard and Verve · instant'), icon: 'card', api: 'card' },
    transfer: { name: 'Bank Transfer', sub: () => 'From any Nigerian bank app to our account · credited once it arrives', icon: 'bank', api: 'bank_transfer' },
    ussd: { name: 'USSD', sub: () => 'Dial a short code and pay – no data needed', icon: 'hash', api: 'ussd' },
    opay: { name: 'OPay', sub: () => 'Pay from your OPay wallet · instant', mark: 'O', color: '#1dcf9f', api: 'opay' },
    palmpay: { name: 'PalmPay', sub: () => 'Pay from your PalmPay wallet · instant', mark: 'P', color: '#6c2bd9', api: 'palmpay' },
    momo: { name: 'Mobile Money', sub: () => 'MTN MoMo, Telecel Cash and AirtelTigo Money', icon: 'phone', api: 'mobile_money' },
    // (card, USSD, OPay and PalmPay return when a payment partner is connected for them)
    bank: { name: 'Bank Account', sub: () => 'Paid to a bank account in your name', icon: 'bank', api: 'bank_transfer' },
    friend: { name: 'To a Friend', sub: () => 'Send to another LetBetAfrika player · instant and free', icon: 'send' },
  };
  const API_NAME = { card: 'Card', bank_transfer: 'Bank transfer', ussd: 'USSD', mobile_money: 'Mobile money', opay: 'OPay', palmpay: 'PalmPay' };
  const mIcon = m => (m.mark ? `<span class="wx-mi mark" style="--mc:${m.color}">${m.mark}</span>` : `<span class="wx-mi">${ICON[m.icon]}</span>`);
  function methodsHTML(list, active, label) {
    return `<div class="wx-methods n${list.length}" role="radiogroup" aria-label="${label}">${list.map(t => {
      const m = METHOD[t.id], on = t.id === active;
      return `<button type="button" class="wx-method${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-method="${t.id}">${mIcon(m)}<b>${m.name}</b></button>`;
    }).join('')}</div><p class="wx-mdesc">${METHOD[active].sub(app().CC)}</p>`;
  }
  // switching method keeps the typed amount and does not add browser history entries
  function bindMethods(el, base, key) {
    $$('[data-method]', el).forEach(b => b.addEventListener('click', () => {
      if (b.classList.contains('on')) return;
      const i = $('#wlAmt', el); if (i) wl.amt[key] = i.value;
      location.replace('#/' + base + '/' + b.dataset.method);
    }));
  }
  function heroHTML(kind) {
    const a = app(), u = user();
    return `<section class="wx-hero" aria-label="Balance">
      <div class="wx-hero-t"><span>${kind === 'wd' ? 'Withdrawable balance' : 'Main balance'}</span><em>${P().curCode}</em></div>
      <b class="wx-hero-amt">${a.money(u.balance)}</b>
      <nav class="wx-hero-nav">${kind === 'wd' ? `<a href="#/deposit">${ICON.plus}Deposit</a>` : `<a href="#/withdraw">${ICON.up}Withdraw</a>`}<a href="#/acct/tx">${ICON.clock}Transactions</a></nav>
    </section>`;
  }
  const bonusHTML = () => `<div class="wx-bonus">${ICON.gift}<div><b>200% Welcome Bonus</b><span>Get 200% extra on your first deposit, up to ${app().whole(app().C.bonusMax)}.</span></div></div>`;
  function amountHTML(kind) {
    const p = P(), a = app(), key = kind === 'dep' ? 'dep' : 'wd';
    const chips = kind === 'dep' ? p.chips.map(v => [`${a.C.cur}${v.toLocaleString()}`, v]) : [['25%', 0.25], ['50%', 0.5], ['Max', 1]];
    return `<div class="wx-amount">
      <label class="wx-h" for="wlAmt">${kind === 'dep' ? 'Amount to deposit' : kind === 'tf' ? 'Amount to send' : 'Amount to withdraw'}</label>
      <div class="wx-amt-in"><span>${a.C.cur}</span><input id="wlAmt" name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${a.esc(wl.amt[key] || '')}"><button type="button" class="wx-clear" data-clear aria-label="Clear amount" hidden>${ICON.close}</button></div>
      <div class="wx-chips${kind === 'dep' ? '' : ' frac'}">${chips.map(([l, v]) => `<button type="button" ${kind === 'dep' ? `data-set="${v}"` : `data-frac="${v}"`}>${l}</button>`).join('')}</div>
      <p class="wx-hint" id="wlHint" aria-live="polite"></p>
    </div>`;
  }
  function bindAmount(form, kind, onChange) {
    const p = P(), a = app(), dep = kind === 'dep', tf = kind === 'tf', min = dep ? p.depMin : tf ? p.tfMin : p.wdMin, max = dep ? p.depMax : tf ? p.tfMax : p.wdMax, key = dep ? 'dep' : 'wd';
    const inp = $('#wlAmt', form), hint = $('#wlHint', form), clr = $('[data-clear]', form);
    const get = () => +String(inp.value).replace(/,/g, '') || 0;
    const base = dep ? `Min ${a.whole(min)} · Max ${a.whole(max)} · No fees` : kind === 'tf' ? `Min ${a.whole(min)} · Instant and free` : `Min ${a.whole(min)} · No fees`;
    const upd = () => {
      const v = get(); wl.amt[key] = inp.value; clr.hidden = !inp.value;
      let msg = base, cls = '';
      if (v && v < min) { msg = `Minimum is ${a.whole(min)}`; cls = 'bad'; }
      else if (v > max) { msg = `Maximum is ${a.whole(max)}`; cls = 'bad'; }
      else if (!dep && v > user().balance) { msg = 'That is more than your balance'; cls = 'bad'; }
      else if (dep && v && ladder()) { const lb = ladderBonus(v); if (lb && lb.locked) { msg = 'Verify your ID to get a bonus on this deposit'; cls = ''; } else if (lb && lb.amount > 0) { msg = `+${a.whole(lb.amount)} bonus with this deposit (Deposit ${lb.n})`; cls = 'good'; } }
      else if (dep && v && firstDeposit()) { msg = `+${a.whole(Math.min(v * 2, a.C.bonusMax))} welcome bonus with this deposit`; cls = 'good'; }
      hint.textContent = msg; hint.className = 'wx-hint ' + cls;
      $$('[data-set]', form).forEach(b => b.classList.toggle('on', +b.dataset.set === v));
      onChange && onChange(v);
    };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2}).+/, '$1'); upd(); });
    form.addEventListener('click', e => {
      const b = e.target.closest('[data-set],[data-frac],[data-clear]'); if (!b) return;
      if (b.dataset.set) inp.value = b.dataset.set;
      if (b.dataset.frac) inp.value = String(Math.floor(Math.min(user().balance, max) * +b.dataset.frac * 100) / 100);
      if ('clear' in b.dataset) inp.value = '';
      upd(); inp.focus();
    });
    upd();
    return { get, valid: () => { const v = get(); return v >= min && v <= max && (dep || v <= user().balance); } };
  }
  const firstDeposit = () => live() ? wl.hasDeposit === false : !app().state.tx.some(t => t.type === 'Deposit' && t.status !== 'failed');
  /* ----- Deposit 1, 2, 3 (live, settings deposit_bonuses): a bonus on each of the first three deposits after the ID check ----- */
  const ladder = () => (live() && opt.data && opt.data.ladder) || null;
  // the server's withdrawal rule for this player right now: held until Deposit 1, 2, 3 are done (wording follows it)
  const heldByRule = () => !!(live() && opt.data && opt.data.withdrawBlock && opt.data.withdrawBlock.error === 'deposits_first');
  const nth = n => ['first', 'second', 'third'][n - 1];
  function ladderHTML() {
    const L = ladder(), a = app(); if (!L || !L.steps.length) return '';
    const ST = { released: ['Bonus released', 'ok'], active: ['Bonus locked', 'pend'], expired: ['Bonus expired', 'bad'], forfeited: ['Bonus ended', 'bad'], checking: ['Being checked', 'pend'], next: ['Next', 'next'], later: ['', ''], locked: ['', ''] };
    const day = d => new Date(d).toLocaleDateString(a.C.locale, { day: 'numeric', month: 'short' });
    return `<section class="wx-card wx-ladder"><div class="wx-ladder-h"><h2 class="wx-h">${ICON.gift}Deposit bonuses</h2>${L.unlocked ? `<em class="wx-st ${L.left ? 'next' : 'ok'}">${L.done} of ${L.steps.length} done</em>` : '<em class="wx-st pend">ID check needed</em>'}</div>
      ${!L.unlocked ? `<a class="wl-verify" href="#/acct/verify" data-after-verify="deposit">${ICON.shield}<span><b>Verify your ID to unlock your deposit bonuses</b>It takes 2 minutes. Then each of your next 3 deposits earns a bonus.</span>${ICON.chev}</a>` : ''}
      <ol class="wx-steps">${L.steps.map(s => { const [lab, cls] = ST[s.status] || ['', '']; return `<li class="${s.done ? 'done ' : ''}${s.status}"><span class="wx-step-n">${s.done ? ICON.check : s.n}</span>
        <span class="wx-step-m"><b>Deposit ${s.n} · ${s.pct}% bonus${s.done ? ' <i class="wx-done">✓ Done</i>' : ''}</b><small>${s.done
          ? `${s.deposit != null ? a.money(s.deposit) + (s.depositAt ? ' on ' + day(s.depositAt) : '') + ' · ' : ''}${s.bonus != null ? `bonus ${a.money(s.bonus)}` : 'no bonus on this step'}${s.status === 'active' && s.required ? ` · ${Math.min(100, Math.floor(100 * s.wagered / s.required))}% played through` : ''}`
          : s.status === 'checking' ? `${a.money(s.deposit)} sent – we credit it as soon as it arrives` : `Up to ${a.whole(s.max)} on your ${nth(s.n)} deposit`}</small></span>
        ${lab ? `<em class="wx-st ${cls}">${lab}</em>` : ''}</li>`; }).join('')}</ol>
      <p class="wx-note">${ICON.shield}<span>${heldByRule() ? 'Withdrawals open once all three deposits are done. ' : ''}Bonus money is released into your balance once you have staked ${L.times}× the bonus on multiples with every selection at ${L.min_odds}+ odds, within ${L.days} days.</span></p></section>`;
  }

  /* ----- the sticky "next deposit" bar: once the ID is approved, until Deposit 1, 2 and 3 are all done ----- */
  const lb = { at: 0, busy: false, data: undefined };
  const LB_ROUTES = ['home', 'live', 'sports', 'list', 'league', 'match', 'me', 'acct', 'promos', 'results', 'jackpot', 'games', 'virtuals'];
  function renderLadderBar() {
    const el = $('#ladBar'); if (!el) return;
    const a = app(), L = live() && user() ? lb.data : null;
    const s = L && L.unlocked && L.next ? L.steps.find(x => x.n === L.next) : null;
    const show = !!s && LB_ROUTES.includes(a.state.route);
    el.hidden = !show; document.body.classList.toggle('has-ladbar', show);
    if (!show) return;
    const wait = s.status === 'checking';
    el.innerHTML = `<a class="lb-in" href="#/deposit"><span class="lb-dots" aria-hidden="true">${L.steps.map(x => `<i class="${x.done ? 'done' : x.n === s.n ? 'now' : ''}">${x.done ? ICON.check : x.n}</i>`).join('')}</span>
      <span class="lb-txt"><b>${wait ? `Deposit ${s.n} is being checked` : `Deposit ${s.n} of ${L.steps.length} · ${s.pct}% bonus`}</b><small>${wait ? `${a.money(s.deposit)} sent – we credit it as soon as it arrives` : `Up to ${a.whole(s.max)} extra`}</small></span>
      <span class="lb-go${wait ? ' wait' : ''}">${wait ? 'View' : 'Deposit'}</span></a>`;
  }
  async function ladderBar(force) {
    const u = user();
    if (!live() || !u) { lb.data = undefined; return renderLadderBar(); }
    renderLadderBar();
    if (lb.busy || (!force && (Date.now() - lb.at < 60000 || kyc(u) !== 'ok'))) return;
    lb.at = Date.now(); lb.busy = true;
    try { const o = await API.wallet.options(); opt.data = o; opt.at = Date.now(); lb.data = o.ladder || null; } catch {} finally { lb.busy = false; }
    renderLadderBar();
  }

  /* ----- withdrawals closed (server: withdrawBlock): paused for everyone, or Deposit 1, 2, 3 not all done ----- */
  function withdrawBlockHTML(B, tab, k, why) {
    const a = app(), L = ladder(), friend = tab === 'friend';
    const idText = k === 'pending' ? 'Your ID check is in progress – once it is approved, make Deposit 1, 2 and 3. Each one earns a bonus.'
      : k === 'rejected' ? `Your ID check was not approved${why ? ' (' + a.esc(why) + ')' : ''} – send it again, then make Deposit 1, 2 and 3.`
      : 'Verify your ID first – then make Deposit 1, 2 and 3. Each one earns a bonus.';
    if (B.error === 'withdrawals_suspended') return `<section class="wx-card wx-closed wx-paused">${ICON.clock}<b>${friend ? 'Sending money is' : 'Withdrawals are'} paused for now</b>
      <span>${B.message ? a.esc(B.message) + ' ' : ''}Your balance is safe and you can keep playing. We will let you know as soon as ${friend ? 'it opens' : 'withdrawals open'} again.</span></section>`;
    const steps = (L && L.steps) || [];
    return `<section class="wx-card wx-unlock"><div class="wx-unlock-h">${ICON.lock}<div><b>Complete your 3 deposits to unlock ${friend ? 'sending money' : 'withdrawals'}</b>
      <span>${B.unlocked === false ? idText : `${B.done} of 3 done – ${B.left} to go. Each deposit earns a bonus.`}</span></div></div>
      ${steps.length ? `<ol class="wx-steps">${steps.map(s => `<li class="${s.done ? 'done ' : ''}${s.status}"><span class="wx-step-n">${s.done ? ICON.check : s.n}</span>
        <span class="wx-step-m"><b>Deposit ${s.n}${s.done ? ' <i class="wx-done">✓ Done</i>' : ''}</b><small>${s.done ? (s.deposit != null ? a.money(s.deposit) : 'Done') : s.status === 'checking' ? 'Being checked' : `${s.pct}% bonus · up to ${a.whole(s.max)}`}</small></span></li>`).join('')}</ol>` : ''}
      ${B.unlocked === false ? (k === 'pending' ? '' : `<a class="au-btn wx-cta" href="#/acct/verify" data-after-verify="deposit">${k === 'rejected' ? 'Send my ID again' : 'Verify my ID'}</a>`) : B.next ? `<a class="au-btn wx-cta" href="#/deposit">Make deposit ${B.next} now</a>` : ''}
      <p class="wx-note">${ICON.shield}<span>Withdrawals open once all three deposits are done. Your balance is safe until then – you can keep playing with it.</span></p></section>`;
  }
  // the bonus this deposit earns (next step of the ladder), for the amount hint
  function ladderBonus(v) {
    const L = ladder(); if (!L) return null;
    if (!L.unlocked) return { locked: true };
    const s = L.steps.find(x => x.status === 'next' || x.status === 'checking'); if (!s) return null;
    return { n: s.n, amount: Math.min(s.max, v * s.pct / 100) };
  }

  /* ----- the transfer screenshot (manual deposits): shrunk in the browser to a JPEG before it is sent ----- */
  function shrinkImage(file, maxSide = 1400, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('bad_image'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
      img.src = url;
    });
  }
  const proofHTML = momo => `<div class="wx-proof" id="wxProof"><span class="wx-l-t">Screenshot of your ${momo ? 'MoMo payment' : 'transfer'}</span>
    <input type="file" accept="image/*" id="proofFile" hidden>
    <button type="button" class="wx-proof-btn" data-proof-pick>${ICON.plus}<span>Add screenshot</span></button>
    <div class="wx-proof-prev" hidden><img alt="Your screenshot"><button type="button" class="wx-proof-x" data-proof-clear aria-label="Remove screenshot">${ICON.close}</button></div>
    <small class="wx-proof-hint">Take a screenshot of the successful ${momo ? 'payment' : 'transfer'} in your ${momo ? 'MoMo' : 'bank'} app – it helps us confirm it fast.</small></div>`;
  function bindProof(form, onChange) {
    const box = $('#wxProof', form); if (!box) return () => null;
    const file = $('#proofFile', box), prev = $('.wx-proof-prev', box), pick = $('[data-proof-pick]', box);
    const show = () => { const on = !!wl.proof; prev.hidden = !on; pick.hidden = on; if (on) $('img', prev).src = wl.proof; onChange && onChange(); };
    pick.onclick = () => file.click();
    $('[data-proof-clear]', box).onclick = () => { wl.proof = null; file.value = ''; show(); };
    file.onchange = async () => { try { wl.proof = await shrinkImage(file.files[0]); } catch { app().toast('That file is not a picture – choose a screenshot', 'err'); } show(); };
    show();
    return () => wl.proof;
  }
  // a pending manual deposit without a screenshot: add one later from Recent deposits
  async function addProofLater(id) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      try { const img = await shrinkImage(inp.files[0]); await API.wallet.proof(id, img); app().toast('Screenshot sent – thank you', 'ok'); wl.recentAt = 0; loadRecent('dep'); }
      catch (x) { app().toast(err(x, 'The screenshot could not be sent'), 'err'); }
    };
    inp.click();
  }

  function depositLimit() {
    const u = user(), L = live() ? u.limits?.deposit : u.limits;
    const amt = L && (L.amount ?? L.amt); if (!amt) return null;
    const period = L.period || 'Daily';
    if (live()) return { period, amt, left: null };
    const span = { Daily: 864e5, Weekly: 6048e5, Monthly: 2592e6 }[period] || 864e5;
    const used = app().state.tx.filter(t => t.type === 'Deposit' && t.status !== 'failed' && Date.now() - t.at < span).reduce((s, t) => s + t.amt, 0);
    return { period, amt, left: Math.max(0, amt - used) };
  }
  function limitBlocked(v) {
    const lim = depositLimit();
    if (lim && lim.left != null && v > lim.left) { app().toast(`That is over your deposit limit. You can deposit up to ${app().whole(lim.left)} right now.`, 'err'); return true; }
    return false;
  }

  /* ----- recent activity (live: the server's payment records; demo: local history) ----- */
  const ST = { success: ['Successful', 'ok'], pending: ['Processing', 'pend'], rejected: ['Rejected', 'bad'], failed: ['Failed', 'bad'], cancelled: ['Cancelled', 'bad'] };
  function recentRows(kind) {
    const a = app(), dep = kind === 'dep';
    if (live() && wl.recent == null) return `<p class="wx-empty"><i class="spin"></i>Loading…</p>`;
    const list = (live()
      // a deposit that did not go through moved no money: only the latest one of the last 24 h is shown (so the player
      // knows what happened), older failed attempts are left out
      ? wl.recent.filter(x => x.kind === (dep ? 'deposit' : 'withdrawal'))
        .filter((x, i, all) => !(dep && ['failed', 'rejected', 'cancelled'].includes(x.status)) || (Date.now() - new Date(x.created_at).getTime() < 86400000 && all.findIndex(y => y.kind === 'deposit' && ['failed', 'rejected', 'cancelled'].includes(y.status)) === i))
        .map(x => ({ amt: +x.amount, method: API_NAME[x.method] || x.method, at: new Date(x.created_at).getTime(), st: x.status, why: x.reason }))
      : a.state.tx.filter(t => t.type === (dep ? 'Deposit' : 'Withdrawal')).map(t => ({ amt: Math.abs(t.amt), method: t.method, at: t.at, st: t.status || 'success' }))).slice(0, 5);
    if (live()) list.forEach((x, i) => { const src = wl.recent.filter(y => y.kind === (dep ? 'deposit' : 'withdrawal'))[i]; if (src) { x.id = src.id; x.needProof = dep && src.status === 'pending' && src.provider === 'manual' && !src.proof; } });
    if (!list.length) return `<p class="wx-empty">No ${dep ? 'deposits' : 'withdrawals'} yet.</p>`;
    return list.map(x => {
      const [label, cls] = dep && x.st === 'pending' ? ['Being checked', 'pend'] : ST[x.st] || [x.st, ''];
      return `<div class="wx-tx"><span class="wx-tx-i ${kind}">${dep ? ICON.down : ICON.up}</span>
        <span class="wx-tx-m"><b>${a.esc(x.method || (dep ? 'Deposit' : 'Withdrawal'))}</b><small>${new Date(x.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>${x.why && x.st !== 'success' ? `<small class="wx-why">${a.esc(x.why)}</small>` : ''}${x.needProof ? `<button type="button" class="wx-proof-later" data-proof-later="${x.id}">${ICON.plus}Add screenshot</button>` : ''}</span>
        <span class="wx-tx-r">${dep && ['failed', 'rejected', 'cancelled'].includes(x.st) ? `<b class="wx-none">${a.money(x.amt)}</b><em class="wx-st ${cls}">Not completed · no money taken</em>` : `<b>${dep ? '+' : '−'}${a.money(x.amt)}</b><em class="wx-st ${cls}">${label}</em>`}</span></div>`;
    }).join('');
  }
  const recentHTML = kind => `<section class="wx-card wx-recent"><div class="wx-recent-h"><h2 class="wx-h">Recent ${kind === 'dep' ? 'deposits' : 'withdrawals'}</h2><a href="#/acct/tx">See all</a></div><div id="wxRecent">${recentRows(kind)}</div></section>`;
  function loadRecent(kind) {
    if (!live() || Date.now() - wl.recentAt < 3000) return;
    wl.recentAt = Date.now();
    API.wallet.payments().then(l => { wl.recent = l; const box = $('#wxRecent'); if (box) box.innerHTML = recentRows(kind); })
      .catch(() => { if (wl.recent == null) wl.recent = []; const box = $('#wxRecent'); if (box) box.innerHTML = recentRows(kind); });
  }

  // spinner on a button; returns a function that restores it
  function spin(btn, label) {
    const txt = btn.innerHTML, dis = btn.disabled; btn.disabled = true; btn.classList.add('loading'); btn.innerHTML = `<i class="spin"></i>${label}`;
    return () => { btn.classList.remove('loading'); btn.innerHTML = txt; btn.disabled = dis; };
  }
  function showErr(el, html) { el.innerHTML = html; el.hidden = false; return false; }
  function copyBtn(text, label = 'Copy') { return `<button type="button" class="wl-copy" data-copy-text="${app().esc(text)}">${ICON.copy}${label}</button>`; }
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy-text]'); if (c) { navigator.clipboard?.writeText(c.dataset.copyText).catch(() => {}); app().toast('Copied'); }
    const pl = e.target.closest('[data-proof-later]'); if (pl) return addProofLater(pl.dataset.proofLater);
    const eye = e.target.closest('[data-eye]');
    if (eye) { const i = eye.previousElementSibling, show = i.type === 'password'; i.type = show ? 'text' : 'password'; eye.innerHTML = show ? ICON.eyeOff : ICON.eye; eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); }
  });

  /* ---------------- Bottom sheet (confirm / processing / result) ---------------- */
  function sheet(html) {
    let s = $('#wlSheet');
    if (!s) {
      s = document.createElement('div'); s.id = 'wlSheet'; s.className = 'wl-sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      document.body.appendChild(s);
      s.addEventListener('click', e => { if (e.target === s && !wl.busy) closeSheet(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && s.classList.contains('open') && !wl.busy) closeSheet(); });
    }
    s.innerHTML = `<div class="wl-sheet-card">${html}</div>`; s.classList.add('open');
    setTimeout(() => { const f = s.querySelector('input, [data-yes], a, button'); f && f.focus({ preventScroll: true }); }, 60);
    return s;
  }
  function closeSheet() { const s = $('#wlSheet'); if (s) s.classList.remove('open'); }
  window.addEventListener('hashchange', () => { wl.busy = false; closeSheet(); });
  const confirmRows = rows => `<dl class="wl-dl">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  function confirmSheet(title, rows, okLabel) {
    return new Promise(res => {
      const s = sheet(`<h3>${title}</h3>${confirmRows(rows)}<div class="wl-sheet-btns"><button class="au-btn ghost" data-no>Cancel</button><button class="au-btn" data-yes>${okLabel}</button></div>`);
      $('[data-no]', s).onclick = () => { closeSheet(); res(false); };
      $('[data-yes]', s).onclick = () => res(true);
    });
  }
  function processingSheet(title, sub) {
    wl.busy = true;
    sheet(`<div class="wl-proc"><i class="spin big"></i><h3>${title}</h3><p>${sub}</p></div>`);
  }
  function resultSheet({ ok, title, amount, rows, primary, secondary, note }) {
    wl.busy = false;
    const a = app();
    const s = sheet(`<div class="wl-res ${ok}">
      <div class="au-tick ${ok === 'fail' ? 'fail' : ok === 'pending' ? 'pend' : ''}">${ok === 'fail' ? ICON.close : ok === 'pending' ? ICON.clock : ICON.check}</div>
      <h3>${title}</h3>${amount != null ? `<b class="wl-res-amt">${a.money(amount)}</b>` : ''}
      ${note ? `<p class="wl-p">${note}</p>` : ''}
      ${confirmRows(rows)}
      <div class="wl-sheet-btns col">${primary ? `<a class="au-btn" href="${primary[1]}">${primary[0]}</a>` : ''}${secondary ? `<button class="au-btn ghost" data-close-sheet>${secondary}</button>` : ''}</div></div>`);
    $$('[data-close-sheet]', s).forEach(b => b.onclick = closeSheet);
    $$('a', s).forEach(x => x.addEventListener('click', closeSheet));
  }
  function failSheet(x, method) {
    resultSheet({ ok: 'fail', title: 'Not completed', rows: [['Reason', err(x, 'Something went wrong')], ...(method ? [['Method', method]] : [])], secondary: 'Close' });
  }

  /* ---------------- Payment pop-ups (server lib/notices.js): support's deposit requests and payment outcomes ----------------
     Checked when the app opens, after login and at most once a minute while the player browses (never in the middle of
     a payment, a sign-up or a game). A deposit request shows how to pay in the player's country and opens the deposit
     page with the amount filled in; "Later" hides it until the next visit. The other pop-ups show once. */
  const nt = { at: 0, busy: false };
  const NT_QUIET = ['register', 'login', 'forgot', 'deposit', 'withdraw', 'game', 'play', 'instant', 'virtuals'];
  const ntLater = () => { try { return JSON.parse(sessionStorage.getItem('lba_nt_later') || '[]'); } catch { return []; } };
  const ntBusy = () => !!document.querySelector('#wlSheet.open') || NT_QUIET.includes(app().state.route);
  async function checkNotices(force) {
    if (!live() || !user() || nt.busy || ntBusy() || (!force && Date.now() - nt.at < 60000)) return;
    nt.at = Date.now(); nt.busy = true;
    try {
      const skip = ntLater(), n = (await API.auth.notices()).find(x => !skip.includes(x.id));
      if (n && !ntBusy()) await showNotice(n);
    } catch {} finally { nt.busy = false; }
  }
  async function showNotice(n) {
    const a = app(), d = n.data || {}, amt = d.amount ? Number(d.amount) : null, esc = a.esc;
    if (n.kind === 'deposit_request') {
      let o = null; try { o = await API.wallet.options(); opt.data = o; opt.at = Date.now(); } catch {}
      const way = o && o.deposit && o.deposit[0], bank = !!way && way.method === 'bank_transfer', api = !!way && way.mode === 'api', tab = bank ? 'transfer' : 'momo';
      const rc = (o && o.reference) || refCode(), how = amt ? `<b>${a.money(amt)}</b>` : 'the amount you want';
      const steps = !way ? [] : api ? ['Tap <b>Deposit now</b> below.', 'Enter your MoMo number and pick your network.', 'Approve the prompt on your phone – your balance updates at once.']
        : bank ? [`Open your bank app and transfer ${how} to the account below.`, `Put your reference <b>${esc(rc)}</b> in the narration.`, 'Tap <b>Deposit now</b>, add the <b>screenshot</b> of your transfer and tap <b>I have sent it</b>.']
        : [`Send ${how} by MoMo to the number below.`, `Use <b>${esc(rc)}</b> as the reference.`, 'Tap <b>Deposit now</b>, add the <b>screenshot</b> of your payment and tap <b>I have sent it</b>.'];
      const s = sheet(`<div class="nt">
        <div class="nt-ico">${bank ? ICON.bank : ICON.phone}</div>
        <h3>Complete your deposit</h3>
        <p class="wl-p">Our support team set this up for you – it takes about 2 minutes.</p>
        ${amt ? `<b class="wl-res-amt">${a.money(amt)}</b>` : ''}
        ${d.note ? `<div class="nt-msg"><b>Message from support</b><span>${esc(d.note)}</span></div>` : ''}
        ${way ? `<ol class="nt-steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>${api ? '' : payToHTML({ ...way, id: tab })}`
          : '<p class="wl-p">Deposits are not open for your country right now. Our team will contact you – or write to us and we will help.</p>'}
        <div class="wl-sheet-btns col">${way ? `<button class="au-btn" data-nt-go>${amt ? 'Deposit ' + a.money(amt) + ' now' : 'Deposit now'}</button>` : '<a class="au-btn" href="#/acct/help" data-nt-help>Contact support</a>'}<button class="au-btn ghost" data-nt-later>Later</button></div>
      </div>`);
      const go = $('[data-nt-go]', s);
      // "Deposit now" also answers the pop-up for this visit (the sticky bar and the deposit page take it from here)
      if (go) go.onclick = () => { try { sessionStorage.setItem('lba_nt_later', JSON.stringify([...ntLater(), n.id])); } catch {} if (amt) wl.amt.dep = String(amt); closeSheet(); a.go('deposit/' + tab); };
      $('[data-nt-later]', s).onclick = () => { try { sessionStorage.setItem('lba_nt_later', JSON.stringify([...ntLater(), n.id])); } catch {} closeSheet(); };
      return;
    }
    if (n.kind === 'kyc_approved') {
      let o = null; try { o = await API.wallet.options(); opt.data = o; opt.at = Date.now(); } catch {}
      const L = o && o.ladder, steps = (L && L.steps) || [];
      if (o) { lb.data = L || null; lb.at = Date.now(); renderLadderBar(); }
      API.auth.closeNotice(n.id).catch(() => {});
      const s = sheet(`<div class="nt">
        <div class="nt-ico ok">${ICON.check}</div>
        <h3>Your ID is approved</h3>
        <p class="wl-p">${steps.length ? `Your deposit bonuses are open. Each of your next 3 deposits earns a bonus${o.withdrawRuleAhead ? ' – from your first deposit, withdrawals open once all three are done' : o.withdrawBlock && o.withdrawBlock.error === 'deposits_first' ? ' – and withdrawals open once all three are done' : ''}:` : 'You can now withdraw your winnings.'}</p>
        ${steps.length ? `<ol class="nt-ladder">${steps.map(x => `<li class="${x.status}"><span>${x.n}</span><b>Deposit ${x.n}</b><em>${x.bonus != null ? 'Done' : `${x.pct}% bonus · up to ${a.whole(x.max)}`}</em></li>`).join('')}</ol>
          <p class="wx-note">${ICON.shield}<span>Bonus money is released once you have staked ${L.times}× the bonus on multiples at ${L.min_odds}+ odds, within ${L.days} days.</span></p>` : ''}
        <div class="wl-sheet-btns col">${steps.length && L.next ? `<a class="au-btn" href="#/deposit" data-nt-dep>Make deposit ${L.next} now</a>` : '<a class="au-btn" href="#/withdraw">Go to my wallet</a>'}<button class="au-btn ghost" data-close-sheet>Later</button></div>
      </div>`);
      $$('[data-close-sheet]', s).forEach(b => b.onclick = () => { closeSheet(); setTimeout(() => checkNotices(true), 350); });
      $$('a', s).forEach(x => x.addEventListener('click', closeSheet));
      return;
    }
    const R = {
      kyc_rejected: { ok: 'fail', title: 'Your ID check was not approved', primary: ['Send it again', '#/acct/verify'],
        note: `${d.reason ? '<b>Reason:</b> ' + esc(d.reason) + '<br>' : ''}Please check your details and send them again – it takes 2 minutes.`, rows: [] },
      deposit_credited: { ok: 'ok', title: d.support ? 'Your deposit was added' : 'Deposit confirmed', primary: ['Start betting', '#/home'],
        note: `${d.support ? 'Our support team added your deposit' : 'We confirmed your deposit'}${d.method ? ' (' + esc(d.method) + ')' : ''}. It is in your balance – you are ready to bet.`,
        rows: [['Balance now', `<b>${a.money(user().balance)}</b>`]] },
      deposit_rejected: { ok: 'fail', title: 'We could not confirm your deposit', primary: ['Contact support', '#/acct/help'],
        note: `${d.reason ? '<b>Reason:</b> ' + esc(d.reason) + '<br>' : ''}If you sent the money, contact support with your transfer receipt and we will sort it out.`, rows: [] },
      withdrawal_paid: { ok: 'ok', title: 'Withdrawal paid', primary: ['View transactions', '#/acct/tx'],
        note: 'We sent your money. It can take a few minutes to show in your account.',
        rows: [...(d.account ? [['To', esc(d.account)]] : []), ...(d.reference ? [['Reference', esc(d.reference)]] : [])] },
      withdrawal_rejected: { ok: 'fail', title: 'Withdrawal returned to your balance', primary: ['Withdraw again', '#/withdraw'],
        note: `${d.reason ? '<b>Reason:</b> ' + esc(d.reason) + '<br>' : ''}The money is back in your balance.`, rows: [] },
    }[n.kind];
    API.auth.closeNotice(n.id).catch(() => {});   // shown once
    if (!R) return;
    resultSheet({ ok: R.ok, title: R.title, amount: amt, note: R.note, rows: R.rows, primary: R.primary, secondary: 'Close' });
    // closing it brings up the next waiting pop-up straight away
    $$('#wlSheet [data-close-sheet]').forEach(b => b.addEventListener('click', () => setTimeout(() => checkNotices(true), 350)));
  }
  const refresh = () => { const a = app(); a.renderAuth(); a.renderMe(); };

  /* ----- GH mobile money: the payer's number (registered one, or typed for email sign-ups) + network ----- */
  const providerOf = phone => GH_MOMO.find(m => m.prefixes.includes(String(phone).slice(0, 2)));
  const momoOf = u => u.phone || prefs.get().momo || '';
  function momoHTML() {
    const u = user(), num = momoOf(u), prov = providerOf(num);
    return `<div class="wx-sub">
      <label class="wx-l">Mobile money number${phoneField('mm', num, !!u.phone)}</label>
      <div class="wx-nets" role="radiogroup" aria-label="Network">${GH_MOMO.map(n => `<label class="wx-net" style="--nc:${n.color};--ni:${n.ink}"><input type="radio" name="prov" value="${n.id}" ${prov && prov.id === n.id ? 'checked' : ''}><span>${n.short}</span><small>${n.name}</small></label>`).join('')}</div>
      <p class="wx-note">${u.phone ? 'Mobile money uses the number you registered with.' : 'Use a mobile money number registered in your name.'}</p>
    </div>`;
  }
  function bindMomo(f, u, onChange) {
    const num = () => (u.phone ? u.phone : normPhone(f.mm.value));
    if (!u.phone) f.mm.addEventListener('input', () => { const p = providerOf(num()); if (p) { const r = f.querySelector(`input[name=prov][value=${p.id}]`); if (r) r.checked = true; } onChange(); });
    return () => (num().length === app().C.digits && f.querySelector('input[name=prov]:checked') ? num() : '');
  }

  /* =========================================================
     DEPOSIT
     ========================================================= */
  /** Where to send the money for a manual deposit (admin-set bank account or MoMo number) + the player's reference. */
  function payToHTML(way) {
    const a = app(), bank = way.id === 'transfer', rc = refCode();
    if (way.id === 'ussd') {
      const u = way.account || {}, code = String(u.code || ''), tel = 'tel:' + code.replace(/#/g, '%23');
      return `<div class="wx-sub wx-payto">
        <p class="wx-payto-h">Pay with USSD – any network, no data needed</p>
        <a class="wx-ussd" href="${a.esc(tel)}"><b>${a.esc(code)}</b><span>${ICON.phone || ''}Tap to dial</span></a>
        <ol class="wx-steps"><li>Dial <b>${a.esc(code)}</b> (tap above) and follow the prompts</li><li>Enter the amount and approve with your MoMo PIN</li><li>Type the <b>transaction ID</b> from the payment SMS below and tap <b>I have paid</b></li></ol>
        <dl class="wx-acct-dl">${u.name ? `<div><dt>Pays to</dt><dd><span>${a.esc(u.name)}</span></dd></div>` : ''}<div class="ref"><dt>Your reference (if asked)</dt><dd><span>${rc}</span>${copyBtn(rc)}</dd></div></dl>
        ${u.note ? `<p class="wx-note">${ICON.shield}<span>${a.esc(u.note)}</span></p>` : ''}
      </div>`;
    }
    const acc = way.account || (bank ? { bank: 'Demo Bank', number: '0000000000', name: 'LETBETAFRIKA (DEMO)' } : { networkName: 'MTN MoMo', number: '000000000', name: 'LETBETAFRIKA (DEMO)' });
    const rows = bank ? [['Bank', acc.bank], ['Account number', acc.number, true], ['Account name', acc.name]]
      : [['Network', acc.networkName || 'MTN MoMo'], ['MoMo number', '0' + acc.number, true], ['Name', acc.name]];
    return `<div class="wx-sub wx-payto">
      <p class="wx-payto-h">${bank ? 'Transfer to this account from your bank app' : 'Send to this MoMo number'}</p>
      <dl class="wx-acct-dl">${rows.map(([k, v, c]) => `<div><dt>${k}</dt><dd><span>${a.esc(v || '')}</span>${c ? copyBtn(v) : ''}</dd></div>`).join('')}
        <div class="ref"><dt>Your reference</dt><dd><span>${rc}</span>${copyBtn(rc)}</dd></div></dl>
      <p class="wx-note">${ICON.shield}<span>Put <b>${rc}</b> in the ${bank ? 'transfer narration (description)' : 'MoMo reference'} so we can match the money to your account.${acc.note ? ' ' + a.esc(acc.note) : ''}</span></p>
    </div>`;
  }
  function closedHTML() {
    return `<section class="wx-card wx-closed">${ICON.bank}<b>Deposits are not available right now</b><span>Please try again a little later, or contact us at <a href="mailto:info@letbetafrika.online">info@letbetafrika.online</a>.</span></section>`;
  }
  function renderDeposit(tab) {
    const a = app(), el = root('deposit'), u = user();
    if (!u) return a.go('login/deposit' + (tab ? encodeURIComponent('/' + tab) : ''));
    migratePrefs();
    loadOptions();
    const ways = depWays();
    if (!ways || !ways.length) {
      el.innerHTML = `${pageHead('Deposit', { help: true })}<div class="wx">${heroHTML('dep')}${!ways ? '<section class="wx-card"><p class="wx-empty"><i class="spin"></i>Loading payment options…</p></section>' : closedHTML() + recentHTML('dep')}</div>`;
      if (ways) loadRecent('dep');
      return;
    }
    if (!ways.find(t => t.id === tab)) { const lastUsed = prefs.get().lastDep; tab = ways.find(t => t.id === lastUsed) ? lastUsed : ways[0].id; }
    const way = ways.find(t => t.id === tab), manual = way.mode === 'manual' || (way.mode === 'demo' && tab === 'transfer');
    wl.dep = tab;
    if (live() && wl.hasDeposit == null) {
      wl.hasDeposit = undefined;
      API.wallet.transactions('in').then(l => { wl.hasDeposit = l.some(t => t.type === 'deposit'); if (a.state.route === 'deposit') rerender(); }).catch(() => { wl.hasDeposit = true; });
    }
    loadRecent('dep');
    const lim = depositLimit(), m = METHOD[tab];
    el.innerHTML = `${pageHead('Deposit', { help: true })}
      <div class="wx">
        ${heroHTML('dep')}
        ${ladder() ? ladderHTML() : firstDeposit() ? bonusHTML() : ''}
        ${live() && opt.data && opt.data.withdrawRuleAhead ? `<div class="wl-note wx-rule">${ICON.shield}<span><b>Good to know before you deposit:</b> you can withdraw now, but once you make your first deposit, withdrawals open again after Deposit 1, 2 and 3 are all done.</span></div>` : ''}
        ${lim ? `<div class="wl-note">${ICON.shield}<span>Your ${lim.period.toLowerCase()} deposit limit is <b>${a.whole(lim.amt)}</b>${lim.left != null ? ` – <b>${a.whole(lim.left)}</b> left` : ''}. <a href="#/acct/limits">Change</a></span></div>` : ''}
        <form class="wx-form" id="depForm" novalidate>
          <section class="wx-card">
            <h2 class="wx-h">Payment method</h2>
            ${methodsHTML(ways, tab, 'Payment method')}
            ${manual ? payToHTML(way) : tab === 'momo' ? momoHTML() : ''}
          </section>
          <section class="wx-card">${amountHTML('dep')}
            ${manual && tab === 'transfer' ? `<label class="wx-l">Name on the account you are sending from<input name="sender" maxlength="80" autocomplete="name" value="${a.esc(prefs.get().sender || u.fullName || '')}" placeholder="e.g. ADA OBI"></label>` : ''}
            ${manual && tab === 'momo' ? `<h3 class="wx-h sm">The MoMo number you are sending from</h3>${momoHTML()}` : ''}
            ${tab === 'ussd' ? `<label class="wx-l">Transaction ID (from the payment SMS)<input name="txid" maxlength="40" autocomplete="off" inputmode="text" placeholder="e.g. 51234567890"></label><h3 class="wx-h sm">The MoMo number you paid from</h3>${momoHTML()}` : ''}
            ${way.mode === 'manual' ? proofHTML(tab !== 'transfer') : ''}
          </section>
          <button class="au-btn wx-cta" id="depBtn" disabled>Deposit</button>
          <p class="wx-secure">${ICON.lock}<span>${manual ? `We add it to your balance as soon as the money arrives – ${a.esc(way.eta || 'usually within 15 minutes')}. We email you too.` : 'You approve the payment on your phone with your MoMo PIN. Credited as soon as it is approved.'}</span></p>
          <p class="wx-secure pt-rule">${ICON.shield}<span><b>Bet it before you withdraw:</b> a deposit must be staked once on bets or games before it can be withdrawn. Winnings can be withdrawn any time.</span></p>
        </form>
        ${recentHTML('dep')}
      </div>`;
    bindMethods(el, 'deposit', 'dep');
    const f = $('#depForm', el), btn = $('#depBtn', el);
    let amt = null, mm = () => true;
    // the button says what is still missing, then the exact amount
    const sync = () => {
      if (!amt) return;
      const need = !mm() ? 'Enter your mobile money number' : manual && tab === 'transfer' && f.sender.value.trim().length < 3 ? 'Enter the sender’s name'
        : tab === 'ussd' && !/^[A-Za-z0-9.\-]{4,40}$/.test(f.txid.value.trim()) ? 'Enter the transaction ID' : way.mode === 'manual' && !proof() ? 'Add the screenshot of your transfer' : '';
      btn.disabled = !amt.valid() || !!need;
      const sent = tab === 'ussd' ? 'I have paid' : 'I have sent';
      btn.textContent = !amt.valid() ? (manual ? `${sent} the money` : 'Deposit') : need || (manual ? `${sent} ${a.money(amt.get())}` : `Deposit ${a.money(amt.get())}`);
    };
    if (tab === 'momo' || tab === 'ussd') mm = bindMomo(f, u, sync);
    const proof = bindProof(f, sync);
    amt = bindAmount(f, 'dep', sync);
    f.addEventListener('input', sync); f.addEventListener('change', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const v = amt.get(); if (btn.disabled || limitBlocked(v)) return;
      const details = tab === 'momo' || tab === 'ussd' ? { phone: mm(), network: f.querySelector('input[name=prov]:checked').value } : {};
      if (tab === 'ussd') details.txid = f.txid.value.trim();
      if (manual && tab === 'transfer') { details.sender = f.sender.value.trim(); prefs.set({ sender: details.sender }); }
      if (tab === 'momo' && !u.phone) prefs.set({ momo: details.phone });
      prefs.set({ lastDep: tab });
      processingSheet(manual ? 'Sending your deposit…' : 'Starting your payment…', `${m.name} · ${a.money(v)}`);
      try { await deposit(v, tab, details, way); } catch (x) { failSheet(x, m.name); }
    });
  }

  async function deposit(amount, tab, details, way) {
    const a = app(), u = user(), m = METHOD[tab], first = firstDeposit(), bonus = first ? Math.min(amount * 2, a.C.bonusMax) : 0, t0 = Date.now();
    let r, status = 'success', next = null, res = null;
    if (live()) {
      res = await API.wallet.deposit(amount, m.api, details);
      if (res.balance != null) u.balance = res.balance;
      if (res.mode === 'manual' && wl.proof) { try { await API.wallet.proof(res.paymentId, wl.proof); wl.proof = null; } catch { res.proofFailed = true; } }
      status = res.status; next = res.next || null; r = res.reference || String(res.paymentId).slice(0, 8).toUpperCase();
      if (status === 'success') wl.hasDeposit = true;
      wl.recentAt = 0;
    } else {
      u.balance = a.r2(u.balance + amount); r = ref('DP');
      a.addTx('Deposit', amount, { method: m.name, ref: r, status: 'success' });
      if (first) { u.bonus = bonus; a.addTx('Welcome bonus (locked)', 0, { method: `${a.whole(bonus)} bonus – unlocks as you play`, status: 'success' }); }
    }
    await sleep(Math.max(0, 700 - (Date.now() - t0)));   // let the processing state register
    if (live()) ladderBar(true);
    wl.amt.dep = '';
    saveUser(); refresh(); rerender();
    if (status === 'failed') return resultSheet({ ok: 'fail', title: 'Payment not approved', rows: [['Reason', a.esc(res.message || 'The payment was declined')], ['Method', m.name]], note: 'No money was taken. You can try again.', secondary: 'Close' });
    if (next && next.otp) return otpSheet(res.paymentId, amount, m, next.message);
    if (next && next.poll) return approveSheet(res.paymentId, amount, m, next.message);
    if (status !== 'success') {
      return resultSheet({ ok: 'pending', title: 'Deposit being checked', amount,
        note: a.esc((next && next.message) || 'We add it to your balance as soon as the money arrives.'),
        rows: [['Method', m.name], ['Your reference', a.esc(r)], ['Screenshot', res && res.proofFailed ? 'Not sent – add it from Recent deposits' : res && res.mode === 'manual' ? 'Sent' : '–'], ['Status', '<em class="wx-st pend">Being checked</em>']],
        primary: ['Keep browsing', '#/home'], secondary: 'Done' });
    }
    depositDone(amount, m, r, bonus);
  }
  function depositDone(amount, m, r, bonus) {
    const a = app(), u = user();
    if (window.Motion && Motion.confetti) Motion.confetti();
    const rows = [['Method', m.name], ['Reference', a.esc(r)], ['New balance', a.money(u.balance)], ...(bonus ? [['Welcome bonus', `<b class="gold">+${a.whole(bonus)}</b> · unlocks as you play`]] : [])];
    if (!live() || u.isAgent) return resultSheet({ ok: 'ok', title: 'Deposit successful', amount, rows, primary: ['Start betting', '#/home'], secondary: 'Done' });
    // the play-through pop-up: the locked amount comes from the server (until then: what this deposit adds)
    lockSheet({ amount, left: Math.min(a.r2((u.playLeft || 0) + amount), u.balance), rows });
    API.auth.me().then(x => { u.playLeft = Number(x.playLeft || 0); saveUser(); ptSeen(u, u.playLeft); const n = $('#ptLeft'); if (n) n.textContent = a.money(u.playLeft); }).catch(() => {});
  }

  /* ----- play-through: a deposit must be staked once before it can be withdrawn (the server enforces it) ----- */
  const ptKey = u => 'lba_pt_' + u.uid;
  function ptSeen(u, v) {
    try {
      const k = ptKey(u), o = JSON.parse(localStorage.getItem(k) || '{}');
      if (v == null) return o;
      const top = v > 0 ? Math.max(Number(o.top) || 0, v) : 0;   // the lock's size when it was set (for the progress bar)
      localStorage.setItem(k, JSON.stringify({ seen: v, top })); return { seen: v, top };
    } catch { return {}; }
  }
  const ptPct = u => { const t = Number(ptSeen(u).top) || u.playLeft; return t > 0 ? Math.max(0, Math.min(100, Math.round((1 - u.playLeft / t) * 100))) : 100; };
  const freeNow = u => Math.max(0, app().r2(u.balance - (u.isAgent ? 0 : u.playLeft || 0)));
  function lockNeed(v) {
    const u = user(), a = app();
    if (!live() || !u || u.isAgent || !(u.playLeft > 0) || !(v > freeNow(u))) return '';
    return freeNow(u) > 0 ? `You can withdraw up to ${a.money(freeNow(u))} now` : `Stake ${a.money(u.playLeft)} first`;
  }
  function lockHTML(u) {
    const a = app();
    if (!live() || !u || u.isAgent || !(u.playLeft > 0)) return '';
    return `<section class="pt-lock" role="status">
      <div class="pt-lock-h"><span class="pt-ic">${ICON.lock}</span><b>${a.money(u.playLeft)} is locked until you bet it</b></div>
      <p>A deposit must be staked once on bets or games before it can be withdrawn. Every stake counts – win or lose, the lock goes down by what you stake. Winnings are never locked.</p>
      <div class="pt-bar" aria-hidden="true"><i style="width:${ptPct(u)}%"></i></div>
      <div class="pt-lock-f"><span>You can withdraw <b>${a.money(freeNow(u))}</b> now</span><a class="au-btn sm" href="#/home">Bet now</a></div>
    </section>`;
  }
  /** The pop-up after a deposit (or when a deposit confirmed later is first seen): it must be acknowledged. */
  function lockSheet({ amount, left, rows, later }) {
    const a = app(), u = user();
    wl.busy = true;   // no closing by tapping outside: one of the two buttons
    const s = sheet(`<div class="wl-res ok pt-pop">
      <div class="au-tick">${ICON.check}</div>
      <h3>${later ? 'Your deposit is in' : 'Deposit successful'}</h3>${amount != null ? `<b class="wl-res-amt">${a.money(amount)}</b>` : ''}
      <div class="pt-hard">
        <div class="pt-hard-h">${ICON.lock}<span>Bet it before you withdraw</span></div>
        <p>Your deposit must be <b>staked once</b> on bets or games before it can be withdrawn.</p>
        <div class="pt-hard-n"><span>Still to stake</span><b id="ptLeft">${a.money(left)}</b></div>
        <ul><li>Every stake counts: sports, live, virtuals, games and jackpot.</li><li>Win or lose, the lock goes down by what you stake.</li><li>Winnings can be withdrawn any time.</li></ul>
      </div>
      ${rows ? confirmRows(rows) : ''}
      <div class="wl-sheet-btns col"><a class="au-btn" href="#/home" data-pt-ok>Bet now</a><button class="au-btn ghost" data-pt-ok>I understand</button></div></div>`);
    $$('[data-pt-ok]', s).forEach(b => b.addEventListener('click', () => { wl.busy = false; ptSeen(u, u.playLeft || left); closeSheet(); }));
  }
  /** The admin asked for the ID again: tell the player once per request (it stays on the Withdraw and Verify pages). */
  function kycAsk(u) {
    const k = u.limits?.kyc; if (!k || k.status !== 'resubmit' || u.verified || document.querySelector('#wlSheet.open')) return false;
    const key = 'lba_kyc_ask_' + u.uid; let seen = ''; try { seen = localStorage.getItem(key) || ''; } catch {}
    if (seen === String(k.requestedAt || k.decidedAt || '1')) return false;
    const a = app(), s = sheet(`<div class="wl-res pend"><div class="au-tick pend">${ICON.shield}</div><h3>Please send your ID again</h3>
      <p class="wl-p">${a.esc(k.reason || 'We need a clear photo of the front and the back of your own ID.')}</p>
      <p class="wl-p">It takes 2 minutes. Your withdrawals are paid once your ID is approved.</p>
      <div class="wl-sheet-btns col"><a class="au-btn" href="#/acct/verify">Send my ID</a><button class="au-btn ghost" data-close-sheet>Later</button></div></div>`);
    const done = () => { try { localStorage.setItem(key, String(k.requestedAt || k.decidedAt || '1')); } catch {} closeSheet(); };
    $$('[data-close-sheet], a', s).forEach(b => b.addEventListener('click', done));
    return true;
  }
  /** After the account refreshes: a lock that grew since this device last showed it (a deposit confirmed by an
   *  admin later, or made on another device) gets the pop-up once. */
  function playCheck() {
    const u = user(); if (!live() || !u || u.isAgent) return;
    if (kycAsk(u)) return;
    const v = Number(u.playLeft) || 0, o = ptSeen(u);
    if (v > (Number(o.seen) || 0) + 0.009 && !document.querySelector('#wlSheet.open')) { lockSheet({ left: v, later: true }); return; }
    if (v !== Number(o.seen)) ptSeen(u, v);   // went down (bets) – remember, so the next deposit pops up again
  }
  /** Mobile Money through the payment API: wait for the player to approve the prompt on their phone. */
  async function approveSheet(id, amount, m, msg) {
    const a = app(), u = user(), first = wl.hasDeposit === false;
    wl.busy = true;
    const s = sheet(`<div class="wl-proc"><i class="spin big"></i><h3>Approve on your phone</h3><p>${a.esc(msg || 'Approve the payment prompt with your MoMo PIN.')}</p>
      <p class="wl-p"><b>${a.money(amount)}</b> · ${m.name}</p><p class="wx-note" id="apWait">Waiting for your approval…</p>
      <div class="wl-sheet-btns col"><button class="au-btn ghost" data-close-sheet>Close – I will approve later</button></div></div>`);
    let closed = false;
    $$('[data-close-sheet]', s).forEach(b => b.onclick = () => { closed = true; wl.busy = false; closeSheet(); });
    for (let i = 0; i < 60 && !closed; i++) {
      await sleep(3000);
      if (closed || !s.classList.contains('open')) return;
      let st; try { st = await API.wallet.payment(id); } catch { continue; }
      if (st.payment.status === 'success') { u.balance = st.balance; wl.hasDeposit = true; wl.recentAt = 0; saveUser(); refresh(); rerender(); return depositDone(Number(st.payment.amount), m, String(id).slice(0, 8).toUpperCase(), first ? Math.min(amount * 2, a.C.bonusMax) : 0); }
      if (st.payment.status !== 'pending') { wl.recentAt = 0; rerender(); return resultSheet({ ok: 'fail', title: 'Payment not approved', rows: [['Method', m.name], ['Amount', a.money(amount)]], note: 'No money was taken. You can try again.', secondary: 'Close' }); }
    }
    if (!closed) resultSheet({ ok: 'pending', title: 'Still waiting for approval', amount, note: 'If you approve the prompt later, your balance updates by itself.', rows: [['Method', m.name]], secondary: 'Done' });
  }
  /** Telecel Cash: the code sent to the player's phone. */
  function otpSheet(id, amount, m, msg) {
    const a = app();
    wl.busy = false;
    const s = sheet(`<h3>Enter the code</h3><p class="wl-p">${a.esc(msg || 'Enter the code sent to your phone to approve the payment.')}</p>
      <form id="otpForm" class="wx-sheetform" novalidate><label class="wx-l">Code<input name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code"></label>
      <p class="wl-resolve bad" id="otpErr" hidden></p>
      <div class="wl-sheet-btns"><button type="button" class="au-btn ghost" data-no>Cancel</button><button class="au-btn" id="otpGo">Approve ${a.money(amount)}</button></div></form>`);
    const f = $('#otpForm', s);
    $('[data-no]', s).onclick = closeSheet;
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const code = digits(f.otp.value); if (code.length < 4) return;
      const done = spin($('#otpGo', s), 'Approving…');
      try {
        const r = await API.wallet.otp(id, code);
        if (r.status === 'success') { user().balance = r.balance; wl.hasDeposit = true; wl.recentAt = 0; saveUser(); refresh(); rerender(); return depositDone(amount, m, String(id).slice(0, 8).toUpperCase(), 0); }
        if (r.next && r.next.poll) return approveSheet(id, amount, m, r.next.message);
        if (r.status === 'failed') return resultSheet({ ok: 'fail', title: 'Payment not approved', rows: [['Method', m.name]], note: 'No money was taken. You can try again.', secondary: 'Close' });
        done();
      } catch (x) { done(); const e2 = $('#otpErr', s); e2.textContent = x.status === 400 ? 'That code is not right – check it and try again.' : err(x, 'Could not approve'); e2.hidden = false; }
    });
  }

  /* =========================================================
     WITHDRAW
     ========================================================= */
  // live: the server holds payouts for admin approval; demo: they pay out after a few seconds
  // agents withdraw without an ID check
  const kyc = u => u && u.isAgent ? 'ok' : live() ? (u.verified ? 'ok' : u.limits?.kyc?.status === 'pending' ? 'pending' : ['rejected', 'resubmit'].includes(u.limits?.kyc?.status) ? 'rejected' : 'none') : (u.verified ? 'ok' : 'none');
  const canWithdraw = () => ['ok', 'pending'].includes(kyc(user()));
  const wdEta = () => (live() ? (opt.data && opt.data.withdraw[0] && opt.data.withdraw[0].eta) || 'within 24 hours' : 'Within minutes');
  function renderWithdraw(tab) {
    const a = app(), p = P(), el = root('withdraw'), u = user();
    if (!u) return a.go('login/withdraw' + (tab ? encodeURIComponent('/' + tab) : ''));
    migratePrefs();
    if (!p.wd.find(t => t.id === tab)) tab = p.wd[0].id;
    wl.wd = tab;
    loadOptions();
    loadRecent('wd');
    const k = kyc(u), friend = tab === 'friend', blocked = (live() && opt.data && opt.data.withdrawBlock) || null;
    el.innerHTML = `${pageHead('Withdraw', { help: true })}
      <div class="wx">
        ${heroHTML('wd')}
        ${k === 'none' && !friend && !blocked ? `<a class="wl-verify" href="#/acct/verify" data-after-verify="withdraw/${tab}">${ICON.shield}<span><b>Verify your ID to withdraw</b>It takes 2 minutes. We need it by law before paying out winnings.</span>${ICON.chev}</a>` : ''}
        ${k === 'pending' && !friend && !blocked ? `<div class="wl-note">${ICON.clock}<span><b>ID check in progress.</b> You can request a withdrawal now – it is paid as soon as your ID is approved.</span></div>` : ''}
        ${k === 'rejected' && !friend && !blocked ? `<a class="wl-verify bad" href="#/acct/verify" data-after-verify="withdraw/${tab}">${ICON.shield}<span><b>${u.limits?.kyc?.status === 'resubmit' ? 'Please send your ID again' : 'Your ID check was not approved'}</b>${a.esc(u.limits?.kyc?.reason || 'Please check your details')} – tap to submit it again.</span>${ICON.chev}</a>` : ''}
        ${friend || blocked ? '' : lockHTML(u)}
        ${blocked ? withdrawBlockHTML(blocked, tab, k, u.limits?.kyc?.reason) : ''}
        <form class="wx-form" id="wdForm" novalidate ${blocked ? 'hidden' : ''}>
          <section class="wx-card">
            <h2 class="wx-h">${friend ? 'Send to' : 'Withdraw to'}</h2>
            ${methodsHTML(p.wd, tab, 'Withdraw to')}
            ${tab === 'bank' ? banksHTML() : tab === 'momo' ? momoHTML() : friendHTML()}
          </section>
          <section class="wx-card">${amountHTML(friend ? 'tf' : 'wd')}
            ${friend ? `<label class="wx-l"><span>Note <span class="muted">(optional)</span></span><input name="note" maxlength="40" placeholder="e.g. Share of our win"></label>` : ''}</section>
          <button class="au-btn wx-cta" id="wdBtn" disabled>${friend ? 'Send' : 'Withdraw'}</button>
          <p class="wx-secure">${ICON.shield}<span>${friend ? 'Transfers are instant and can’t be reversed – check the details first.' : 'Withdrawals are free and paid only to accounts in your name.'}</span></p>
        </form>
        ${friend ? '' : recentHTML('wd')}
      </div>`;
    $$('[data-after-verify]', el).forEach(x => x.addEventListener('click', () => { a.state.afterVerify = x.dataset.afterVerify; }));
    bindMethods(el, 'withdraw', 'wd');
    ({ bank: wdBank, momo: wdMomo, friend: wdFriend })[tab](el);
  }
  // shared button state: label with the amount, enabled only when everything needed is filled in
  // shared button state: `need()` names what is still missing (shown on the button), then "Withdraw ₦5,000.00"
  function wdButton(btn, amt, need, verb) {
    return () => {
      if (!amt()) return;
      const missing = need() || (verb === 'Withdraw' ? lockNeed(amt().get()) : ''), ok = amt().valid() && !missing;
      btn.disabled = !ok;
      btn.textContent = missing && (amt().valid() || missing.startsWith('Verify')) ? missing : amt().valid() ? `${verb} ${app().money(amt().get())}` : verb;
    };
  }
  async function payout({ amount, method, apiMethod, details, to, ms = 6000 }) {
    const a = app(), u = user();
    if (!await confirmSheet('Confirm withdrawal', [['Amount', `<b>${a.money(amount)}</b>`], ['To', to], ['Fee', 'Free'], ['Balance after', a.money(u.balance - amount)]], 'Withdraw')) return;
    processingSheet('Submitting withdrawal…', to);
    let r;
    let auto = null;
    try {
      if (live()) { const res = await API.wallet.withdraw(amount, apiMethod, details); u.balance = res.balance; r = String(res.paymentId).slice(0, 8).toUpperCase(); wl.recentAt = 0; auto = res.auto || null; }
      else { await sleep(800); u.balance = a.r2(u.balance - amount); r = ref('WD'); a.addTx('Withdrawal', -amount, { method, ref: r, status: 'pending' }); setTimeout(() => settleWithdrawal(r), ms); }
    } catch (x) { return failSheet(x, method); }
    wl.amt.wd = '';
    saveUser(); refresh(); rerender();
    const sent = auto === 'sent' || auto === 'paid';
    resultSheet({ ok: 'pending', title: sent ? 'Withdrawal sent' : 'Withdrawal submitted', amount,
      rows: [['To', to], ['Reference', r], ['Status', `<em class="wx-st pend">${auto === 'paid' ? 'Paid' : sent ? 'Sent to your wallet' : 'Processing'}</em>`], ['Usually arrives', sent ? 'In a few minutes' : kyc(u) === 'pending' ? 'After your ID is approved' : wdEta()]],
      primary: ['View transactions', '#/acct/tx'], secondary: 'Done' });
  }
  function settleWithdrawal(r) {
    const a = app(), t = a.state.tx.find(x => x.ref === r);
    if (!t || t.status !== 'pending') return;
    t.status = 'success'; a.store.set('tx', a.state.tx);
    a.toast(`Withdrawal of ${a.money(-t.amt)} paid to ${t.method}`);
    if (a.state.route === 'withdraw') rerender();
    else if (a.state.route === 'acct' && a.state.arg === 'tx') window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  function settleStale() {
    const a = app(); if (!a || live()) return;
    a.state.tx.filter(t => t.status === 'pending').forEach(t => setTimeout(() => settleWithdrawal(t.ref), Math.max(500, 6000 - (Date.now() - t.at))));
  }

  /* ----- bank account (saved on this device; the account must be in the player's name) ----- */
  const bankMark = n => n.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
  function banksHTML() {
    const a = app(), pr = prefs.get(), banks = pr.banks, sel = Math.min(pr.wdBank || 0, Math.max(0, banks.length - 1));
    return `<div class="wx-sub">
      ${banks.length ? `<div class="wx-accts" role="radiogroup" aria-label="Bank account">${banks.map((b, i) => `<label class="wx-acct"><input type="radio" name="bank" value="${i}" ${i === sel ? 'checked' : ''}><span class="wx-acct-i">${a.esc(bankMark(b.bank))}</span><span class="wx-acct-m"><b>${a.esc(b.bank)}</b><small>${b.acct.replace(/\d(?=\d{4})/g, '•')} · ${a.esc(b.name)}</small></span><button type="button" class="wx-del" data-delbank="${i}" aria-label="Remove ${a.esc(b.bank)} account">${ICON.trash}</button></label>`).join('')}</div>` : ''}
      <button type="button" class="wx-add" id="addBank">${ICON.plus}${banks.length ? 'Add another bank account' : 'Add a bank account'}</button>
    </div>`;
  }
  function wdBank(el) {
    const a = app(), f = $('#wdForm', el), btn = $('#wdBtn', el);
    let amt = null;
    const sync = wdButton(btn, () => amt, () => (!canWithdraw() ? 'Verify your ID to withdraw' : !f.querySelector('input[name=bank]:checked') ? 'Add a bank account' : ''), 'Withdraw');
    amt = bindAmount(f, 'wd', sync);
    f.addEventListener('change', sync); sync();
    $('#addBank', el).onclick = bankSheet;
    $$('[data-delbank]', el).forEach(d => d.addEventListener('click', e => {
      e.preventDefault(); const banks = prefs.get().banks; banks.splice(+d.dataset.delbank, 1); prefs.set({ banks, wdBank: 0 }); a.toast('Bank account removed'); rerender();
    }));
    f.addEventListener('submit', e => {
      e.preventDefault(); if (btn.disabled) return;
      if (!canWithdraw()) return a.toast('Please verify your ID first', 'err');
      const i = +f.querySelector('input[name=bank]:checked').value, b = prefs.get().banks[i]; prefs.set({ wdBank: i });
      payout({ amount: amt.get(), method: `${b.bank} ••${b.acct.slice(-4)}`, apiMethod: 'bank_transfer',
        details: { account: `${b.bank} · ${b.acct} · ${b.name}`, bank: b.bank, acct: b.acct, name: b.name },
        to: `${a.esc(b.bank)} ${b.acct.replace(/\d(?=\d{4})/g, '•')}<br><small>${a.esc(b.name)}</small>` });
    });
  }
  function bankSheet() {
    const a = app(), u = user(), p = P();
    if (prefs.get().banks.length >= 3) return a.toast('You can save up to 3 bank accounts. Remove one first.', 'err');
    const [minL, maxL] = p.acctLen;
    // PROVIDER: account-name enquiry (NIBSS NIP / GhIPSS) fills the name automatically once the payout partner is live
    const s = sheet(`<h3>Add bank account</h3>
      <form id="bankForm" class="wx-sheetform" novalidate>
        <label class="wx-l">Bank<select name="bank"><option value="">Select your bank</option>${p.banks.map(b => `<option>${b}</option>`).join('')}</select></label>
        <label class="wx-l">Account number<input name="acct" inputmode="numeric" maxlength="${maxL}" placeholder="${minL === maxL ? minL + '-digit account number' : 'Account number'}"></label>
        <label class="wx-l">Account name<input name="name" maxlength="80" autocomplete="name" value="${a.esc(u.fullName || '')}" placeholder="As shown on your bank account"></label>
        <p class="wx-note">${ICON.shield}<span>The account must be in your own name – the same name as on your verified ID.</span></p>
        <div class="wl-sheet-btns"><button type="button" class="au-btn ghost" data-no>Cancel</button><button class="au-btn" id="bankSave" disabled>Save account</button></div>
      </form>`);
    const f = $('#bankForm', s), save = $('#bankSave', s);
    const ok = () => !!f.bank.value && f.acct.value.length >= minL && f.name.value.trim().length >= 3;
    f.addEventListener('input', () => { f.acct.value = digits(f.acct.value); save.disabled = !ok(); });
    f.addEventListener('change', () => { save.disabled = !ok(); });
    $('[data-no]', s).onclick = closeSheet;
    f.addEventListener('submit', e => {
      e.preventDefault(); if (!ok()) return;
      const banks = prefs.get().banks;
      if (banks.some(b => b.acct === f.acct.value && b.bank === f.bank.value)) return a.toast('That account is already saved', 'err');
      banks.push({ bank: f.bank.value, acct: f.acct.value, name: f.name.value.trim().toUpperCase() }); prefs.set({ banks, wdBank: banks.length - 1 });
      closeSheet(); a.toast('Bank account saved'); rerender();
    });
  }

  /* ----- GH mobile money ----- */
  function wdMomo(el) {
    const u = user(), f = $('#wdForm', el), btn = $('#wdBtn', el);
    let amt = null, mm = () => '';
    const sync = wdButton(btn, () => amt, () => (!canWithdraw() ? 'Verify your ID to withdraw' : !mm() ? 'Enter your mobile money number' : ''), 'Withdraw');
    mm = bindMomo(f, u, sync);
    amt = bindAmount(f, 'wd', sync);
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', e => {
      e.preventDefault(); if (btn.disabled) return;
      const num = mm(); if (!u.phone) prefs.set({ momo: num });
      const m = GH_MOMO.find(x => x.id === f.querySelector('input[name=prov]:checked').value);
      payout({ amount: amt.get(), method: m.name, apiMethod: 'mobile_money', details: { account: `${m.name} · 0${num}`, network: m.id, phone: num, name: u.fullName || '' },
        to: `${m.name}<br><small>${fmtPhone(num)}</small>`, ms: 4000 });
    });
  }

  /* ----- to a friend: another player, found by mobile number or email (same country) ----- */
  const friendHTML = () => `<div class="wx-sub"><label class="wx-l">Friend's mobile number or email<input name="to" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="080 1234 5678 or name@email.com"></label><div class="wl-resolve" id="friendName" aria-live="polite"></div></div>`;
  function wdFriend(el) {
    const a = app(), u = user(), f = $('#wdForm', el), btn = $('#wdBtn', el), nm = $('#friendName', el);
    const target = () => { const raw = f.to.value.trim(); if (raw.includes('@')) return isEmail(raw) ? { email: normEmail(raw) } : null; const t = normPhone(raw); return t.length === a.C.digits ? { phone: t } : null; };
    const self = t => t && ((t.phone && t.phone === u.phone) || (t.email && t.email === (u.email || '').toLowerCase()));
    let amt = null;
    const known = t => live() || !!accounts.get(t.phone || t.email);
    const check = () => {
      const t = target();
      if (self(t)) { nm.innerHTML = 'You can’t send money to yourself.'; nm.className = 'wl-resolve bad'; }
      else if (t && !live()) { const rec = accounts.get(t.phone || t.email); nm.innerHTML = rec ? `${ICON.check}<b>LetBetAfrika player ${a.esc(t.phone ? mask(t.phone) : maskEmail(t.email))}</b>` : `<small>No LetBetAfrika account uses this ${t.phone ? 'number' : 'email'}.</small>`; nm.className = 'wl-resolve ' + (rec ? 'ok' : 'bad'); }
      else if (t) { nm.innerHTML = '<small>We check this is a LetBetAfrika player before sending.</small>'; nm.className = 'wl-resolve'; }
      else { nm.innerHTML = ''; nm.className = 'wl-resolve'; }
    };
    const sync = wdButton(btn, () => amt, () => { const t = target(); return !t ? 'Enter your friend’s number or email' : self(t) || !known(t) ? 'Check the number or email' : ''; }, 'Send');
    amt = bindAmount(f, 'tf', sync);
    f.addEventListener('input', () => { check(); sync(); }); check(); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault(); if (btn.disabled) return;
      const t = target(), v = amt.get(), shown = t.phone ? fmtPhone(t.phone) : a.esc(t.email);
      if (!await confirmSheet('Send money', [['To', shown], ['Amount', `<b>${a.money(v)}</b>`], ...(f.note.value ? [['Note', a.esc(f.note.value)]] : []), ['Fee', 'Free']], 'Send')) return;
      processingSheet('Sending…', shown);
      let r;
      try {
        if (live()) { const res = await API.wallet.transfer(t.phone ? t.phone : { email: t.email }, v, f.note.value || undefined); u.balance = res.balance; r = res.ref; }
        else {
          await sleep(800);
          u.balance = a.r2(u.balance - v); r = ref('TF');
          a.addTx('Transfer to friend', -v, { method: t.phone ? fmtPhone(mask(t.phone)) : maskEmail(t.email), ref: r, status: 'success' });
          const id = t.phone || t.email, rec = accounts.get(id);
          if (rec && rec.profile) { rec.profile.balance = a.r2((rec.profile.balance || 0) + v); accounts.put(id, { profile: rec.profile }); }
        }
      } catch (x) { return failSheet(x, 'Transfer to friend'); }
      wl.amt.wd = '';
      saveUser(); refresh(); rerender();
      resultSheet({ ok: 'ok', title: 'Money sent', amount: v, rows: [['To', shown], ['Reference', r], ['New balance', a.money(u.balance)]], secondary: 'Done' });
    });
  }

  /* =========================================================
     Router glue
     ========================================================= */
  const RENDER = { register: renderRegister, login: renderLogin, forgot: renderForgot, deposit: renderDeposit, withdraw: renderWithdraw };
  let last = { page: null, arg: null };
  function render(page, arg, prev) {
    // only one account page holds a form at a time, so ids like #wlAmt stay unique
    $$('.acc-root').forEach(r => { if (!r.closest('#page-' + page)) r.innerHTML = ''; });
    if (page === 'forgot' && prev !== 'forgot') fp.step = 1;
    if (page === 'register' && prev && prev !== 'register' && reg.step === 2) reg.step = 1;
    last = { page, arg }; RENDER[page](arg);
  }
  function rerender() { const a = app(); if (a.state.route === last.page) RENDER[last.page](last.page === 'deposit' ? wl.dep : last.page === 'withdraw' ? wl.wd : last.arg); }

  window.Account = { handles: page => page in RENDER, render, persist, changePassword, prefetch: loadMethods, playCheck, notices: checkNotices, ladderBar };
  setTimeout(settleStale, 0);
})();
