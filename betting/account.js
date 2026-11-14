/* =========================================================
   LetBetAfrika – account pages
   ---------------------------------------------------------
   #/register[/next]   sign up: phone + password → SMS code → done
   #/login[/next]      login, remember me
   #/forgot            reset password: phone → SMS code → new password
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
      curCode: 'NGN', depMin: 100, depMax: 9999999, wdMin: 100, wdMax: 9999999, chips: [100, 500, 1000, 5000, 10000],
      acctLen: [10, 10], banks: NG_BANKS,
      dep: [
        { id: 'card', name: 'Card', api: 'card' },
        { id: 'transfer', name: 'Bank Transfer', api: 'bank_transfer' },
        { id: 'opay', name: 'OPay', api: 'opay', color: '#1dcf9f' },
        { id: 'palmpay', name: 'PalmPay', api: 'palmpay', color: '#6c2bd9' },
        { id: 'ussd', name: 'USSD', api: 'ussd' },
        { id: 'others', name: 'Others' },
      ],
      wd: [{ id: 'bank', name: 'Bank' }, { id: 'friend', name: 'Transfer to Friend' }],
      others: ['Kuda', 'GTBank', 'Zenith Bank', 'Access Bank', 'Quickteller', 'Moniepoint', 'FairMoney'],
    },
    GH: {
      curCode: 'GHS', depMin: 1, depMax: 100000, wdMin: 1, wdMax: 100000, chips: [2, 5, 10, 50, 100],
      acctLen: [10, 16], banks: GH_BANKS,
      dep: [{ id: 'momo', name: 'Mobile Money', api: 'mobile_money' }, { id: 'paybill', name: 'Paybill' }, { id: 'card', name: 'Card', api: 'card', isNew: true }],
      wd: [{ id: 'momo', name: 'Mobile Money' }, { id: 'bank', name: 'Bank', isNew: true }, { id: 'friend', name: 'Transfer to Friend' }],
    },
  };

  /* ---------------- Helpers ---------------- */
  const P = () => PAY[app().CC];
  const user = () => app().state.user;
  const fmt = n => Number(n || 0).toLocaleString(app().C.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ref = p => p + Date.now().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 5).toUpperCase();
  const digits = s => String(s || '').replace(/\D/g, '');
  const normPhone = s => digits(s).replace(/^(234|233)/, '').replace(/^0/, '');
  const fmtPhone = p => app().C.dial + ' ' + p;
  const mask = p => p.length > 6 ? p.slice(0, 3) + '****' + p.slice(-3) : p;
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
  };

  // Demo-only checksum so demo accounts need their password. The server uses bcrypt.
  const hashPw = (phone, pw) => { let h = 2166136261; for (const c of phone + ':' + pw) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

  /* ---------------- Demo "accounts database" (demo mode only) ---------------- */
  const accounts = {
    all: () => app().store.get('accounts', {}),
    get: phone => accounts.all()[phone],
    put: (phone, rec) => { const a = accounts.all(); a[phone] = { ...(a[phone] || {}), ...rec }; app().store.set('accounts', a); },
  };
  function persist(u) { if (u && u.phone && !live()) accounts.put(u.phone, { profile: u }); }
  function saveUser() { app().saveUser(); persist(user()); }

  /* ---------------- Device preferences per player (both modes) ----------------
     Saved payout accounts and cards live on the device, keyed by phone, so the
     server's user refresh never wipes them.  PROVIDER: card tokens move to the
     payment provider's vault once it is connected.                           */
  const prefs = {
    get: () => ({ banks: [], cards: [], wdBank: 0, cardDeposited: false, ...app().store.get('prefs_' + (user()?.phone || ''), {}) }),
    set: patch => { const v = { ...prefs.get(), ...patch }; app().store.set('prefs_' + user().phone, v); return v; },
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
      ${opts.help ? `<a class="icon-btn" href="#/acct/help" aria-label="Help">${ICON.help}</a>` : ''}
      <a class="icon-btn" href="#/home" aria-label="Home">${ICON.home}</a>
    </div>`;
  }
  const countryRow = () => `<div class="au-cc"><span class="cc-flag">${window.LBA ? LBA.flag(app().C.flag) : ''}</span><b>${app().C.name}</b><button type="button" class="au-link" data-open-cc>Change ${ICON.chev}</button></div>`;
  const phoneField = (name = 'phone', val = '', ro = false) => `<div class="au-field au-phone"><span class="au-dial">${app().C.dial}</span><input name="${name}" inputmode="tel" autocomplete="tel-national" placeholder="Mobile Number" aria-label="Mobile number" value="${app().esc(val)}" ${ro ? 'readonly' : ''} maxlength="13"></div>`;
  const pwField = (name, ph, ac = 'current-password') => `<div class="au-field au-pw"><input name="${name}" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}"><button type="button" class="au-eye" data-eye aria-label="Show password">${ICON.eye}</button></div>`;
  const demoNote = txt => live() ? '' : `<p class="wl-demo"><b>DEMO</b> ${txt}</p>`;
  const testNote = txt => `<p class="wl-demo"><b>TEST</b> ${txt}</p>`;
  const root = page => $(`#page-${page} .acc-root`);
  const remember = { get: () => { try { return localStorage.getItem('lba_' + app().CC + '_remember') || ''; } catch { return ''; } },
    set: p => { try { p ? localStorage.setItem('lba_' + app().CC + '_remember', p) : localStorage.removeItem('lba_' + app().CC + '_remember'); } catch {} } };
  async function signedIn(u, msg) {
    const a = app();
    a.state.user = u; a.saveUser(); wl.hasDeposit = null;
    if (live()) await a.liveBets();
    a.renderAuth(); a.renderMe();
    if (msg) a.toast(msg);
  }

  /* =========================================================
     SIGN UP
     ========================================================= */
  const reg = { step: 1, phone: '', pw: '', refCode: '', code: '', timer: null, next: '' };

  function renderRegister(next) {
    reg.next = next ? decodeURIComponent(next) : '';
    if (reg.step === 3 && !user()) reg.step = 1;
    if (user() && reg.step !== 3) return app().go(reg.next || 'home');
    const el = root('register');
    if (reg.step === 2) return renderOtp(el, reg, {
      title: 'Verify your number',
      onBack: () => { reg.step = 1; renderRegister(next); },
      onCode: code => createAccount(code),
    });
    if (reg.step === 3) return renderRegDone(el);
    el.innerHTML = `
      <div class="au-top">
        <button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>
        <a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a>
      </div>
      <div class="au-tabs"><a class="on" href="#/register${next ? '/' + next : ''}">Register</a><a href="#/login${next ? '/' + next : ''}">Login</a></div>
      <form class="au-form" id="regForm" novalidate>
        <div class="au-bonus">${ICON.gift}<span><b>200% Welcome Bonus</b> up to ${app().whole(app().C.bonusMax)} on your first deposit</span></div>
        ${countryRow()}
        <div class="au-group">
          ${phoneField('phone', reg.phone)}
          ${pwField('pw', 'Set Password', 'new-password')}
        </div>
        <p class="au-err" id="regErr" role="alert" hidden></p>
        ${rulesHTML()}
        <details class="au-ref" ${reg.refCode ? 'open' : ''}><summary>Have a referral code? <span class="muted">(optional)</span></summary>
          <div class="au-field"><input name="refCode" placeholder="Referral code" aria-label="Referral code" value="${app().esc(reg.refCode)}" maxlength="12" autocapitalize="characters"></div>
        </details>
        <label class="au-check"><input type="checkbox" name="agree"><span>I am 18 or older and I accept the <a href="#/legal/terms">Terms &amp; Conditions</a> and <a href="#/legal/privacy">Privacy Policy</a>.</span></label>
        <button class="au-btn" id="regBtn" disabled>Create Account</button>
        <p class="au-alt">Already have an account? <a href="#/login${next ? '/' + next : ''}">Log in</a></p>
        <p class="au-lic"><b>18+</b> Betting can be addictive. Please play responsibly.</p>
      </form>`;
    const f = $('#regForm'), btn = $('#regBtn');
    bindRules(f, f.pw);
    const check = () => { btn.disabled = !(normPhone(f.phone.value).length >= app().C.digits && pwOk(f.pw.value) && f.agree.checked); };
    f.addEventListener('input', check); f.addEventListener('change', check); check();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const phone = normPhone(f.phone.value), er = $('#regErr');
      er.hidden = true;
      if (phone.length !== app().C.digits) return showErr(er, `Enter a valid ${app().C.name} mobile number (${app().C.digits} digits after ${app().C.dial}).`);
      if (!pwOk(f.pw.value)) return showErr(er, 'Your password does not meet the rules below.');
      if (!live() && accounts.get(phone)?.h) return showErr(er, taken());
      Object.assign(reg, { phone, pw: f.pw.value, refCode: f.refCode.value.trim().toUpperCase() });
      const stop = spin(btn, 'Sending code…');
      try { await sendCode(reg, 'register'); reg.step = 2; renderRegister(next); }
      catch (x) { showErr(er, x.message === 'phone_taken' ? taken() : err(x, 'Could not send the code')); }
      finally { stop(); }
    });
  }
  const taken = () => `This number is already registered. <a href="#/login">Log in</a> or <a href="#/forgot">reset your password</a>.`;

  async function createAccount(code) {
    const a = app();
    let u;
    if (live()) {
      // server checks the code, hashes the password and opens the wallet
      u = a.mapUser(await API.auth.register({ country: a.CC, phone: reg.phone, code, password: reg.pw }));
      if (reg.refCode) u.referredBy = reg.refCode;
    } else {
      if (code !== reg.code) throw new Error('bad_code');
      u = { phone: reg.phone, balance: 0, uid: Math.floor(1e7 + Math.random() * 9e7), created: Date.now(), referredBy: reg.refCode || null, verified: false };
      accounts.put(reg.phone, { h: hashPw(reg.phone, reg.pw), profile: u });
    }
    await signedIn(u);
    remember.set(reg.phone);
    reg.pw = ''; reg.step = 3; renderRegister(reg.next ? encodeURIComponent(reg.next) : '');
  }

  function renderRegDone(el) {
    const a = app();
    el.innerHTML = `
      <div class="au-top"><span></span><a class="icon-btn" href="#/home" data-reg-reset aria-label="Close">${ICON.close}</a></div>
      <div class="au-done">
        <div class="au-tick">${ICON.check}</div>
        <h2>Welcome to LetBetAfrika!</h2>
        <p>Your account <b>${fmtPhone(reg.phone)}</b> is ready.</p>
        <div class="au-bonus big">${ICON.gift}<span><b>Claim your 200% Welcome Bonus</b>Deposit now and we'll triple it, up to ${a.whole(a.C.bonusMax)}.</span></div>
        <a class="au-btn" href="#/deposit" data-reg-reset>Deposit Now</a>
        <a class="au-btn ghost" href="#/${a.esc(reg.next || 'home')}" data-reg-reset>Start Betting</a>
        <a class="au-link center" href="#/acct/verify" data-reg-reset>Verify your ID now for faster withdrawals ${ICON.chev}</a>
      </div>`;
    $$('[data-reg-reset]', el).forEach(x => x.addEventListener('click', () => { reg.step = 1; reg.phone = ''; reg.refCode = ''; }));
    if (window.Motion && Motion.confetti) Motion.confetti();
  }

  /* ---------------- SMS code step (sign up + reset) ---------------- */
  async function sendCode(flow, purpose) {
    const a = app();
    if (live()) {
      const r = await API.auth.otp(a.CC, flow.phone, purpose);
      flow.devCode = r.devCode || '';
      a.toast(r.devCode ? `Test code: ${r.devCode}` : `We sent a 6-digit code to ${fmtPhone(mask(flow.phone))}`);
    } else {
      flow.code = String(Math.floor(100000 + Math.random() * 900000)); flow.devCode = flow.code;
      a.toast(`Demo SMS to ${fmtPhone(mask(flow.phone))}: your LetBetAfrika code is ${flow.code}`);
    }
    flow.sentAt = Date.now();
  }

  function renderOtp(el, flow, { title, onBack, onCode }) {
    const purpose = flow === fp ? 'reset' : 'register';
    el.innerHTML = `
      <div class="au-top">
        <button class="icon-btn" data-otp-back aria-label="Back">${ICON.back}</button>
        <a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a>
      </div>
      <form class="au-form" id="otpForm" novalidate>
        <h2 class="au-h">${title}</h2>
        <p class="au-sub">Enter the 6-digit code we sent by SMS to <b>${fmtPhone(flow.phone)}</b>. <button type="button" class="au-link" data-otp-back>Change number</button></p>
        <div class="au-otp" id="otpBoxes" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i ? 'off' : 'one-time-code'}" maxlength="6" aria-label="Digit ${i + 1}">`).join('')}</div>
        <p class="au-err" id="otpErr" role="alert" hidden></p>
        <button class="au-btn" id="otpBtn" disabled>Verify</button>
        <p class="au-resend" id="otpResend"></p>
        ${flow.devCode ? (live() ? testNote('The SMS provider is in test mode, so the code is shown at the top of the screen.') : demoNote('The code is shown at the top of the screen instead of being sent by SMS.')) : ''}
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
        showErr(er, x.message === 'bad_code' ? 'That code is wrong or has expired. Check the SMS and try again.' : err(x, 'Could not verify the code'));
      } finally { busy = false; if (btn.isConnected) stop(); }
    });
  }

  /* =========================================================
     LOGIN
     ========================================================= */
  function renderLogin(next) {
    next = next || '';
    const nextRoute = decodeURIComponent(next);
    if (user()) return app().go(nextRoute || 'home');
    const a = app(), el = root('login'), remembered = remember.get();
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
        <div class="au-group">
          ${phoneField('phone', remembered)}
          ${pwField('pw', 'Password')}
        </div>
        <p class="au-err" id="loginErr" role="alert" hidden></p>
        <div class="au-row">
          <label class="au-check sm"><input type="checkbox" name="remember" checked><span>Remember me</span></label>
          <label class="au-check sm"><input type="checkbox" name="keep" checked><span>Keep me signed in</span></label>
        </div>
        <button class="au-btn" id="loginBtn" disabled>Login</button>
        <div class="au-row links"><a href="#/forgot">Forgot Password?</a><a href="#/register${next ? '/' + next : ''}">Create New Account</a></div>
        ${demoNote(`A number that has not registered logs in with a ${a.whole(a.C.demo)} demo balance. Registered numbers need their password.`)}
      </form>`;
    const f = $('#loginForm'), btn = $('#loginBtn'), er = $('#loginErr');
    const check = () => { btn.disabled = !(normPhone(f.phone.value).length >= a.C.digits && f.pw.value.length > 0); };
    f.addEventListener('input', () => { er.hidden = true; check(); }); check();
    if (remembered) setTimeout(() => f.pw.focus(), 50);
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const phone = normPhone(f.phone.value);
      if (phone.length !== a.C.digits) return showErr(er, `Enter a valid ${a.C.name} mobile number.`);
      const stop = spin(btn, 'Logging in…');
      try {
        let u, greet = 'Welcome back!';
        if (live()) u = a.mapUser(await API.auth.login(a.CC, phone, f.pw.value));
        else {
          await sleep(500);
          const rec = accounts.get(phone);
          if (rec && rec.h) { if (rec.h !== hashPw(phone, f.pw.value)) throw new Error('bad_login'); u = rec.profile; }
          else { u = (rec && rec.profile) || { phone, balance: a.C.demo, uid: Math.floor(1e7 + Math.random() * 9e7), demo: true }; greet = `Welcome! Demo balance ${a.whole(u.balance)}`; }
        }
        remember.set(f.remember.checked ? phone : '');
        await signedIn(u, greet);
        a.go(nextRoute || 'home');
      } catch (x) { showErr(er, x.message === 'bad_login' ? 'Incorrect mobile number or password.' : err(x, 'Could not log in')); }
      finally { if (btn.isConnected) stop(); }
    });
  }

  /* =========================================================
     FORGOT PASSWORD
     ========================================================= */
  const fp = { step: 1, phone: '', code: '', entered: '', timer: null };
  function renderForgot() {
    const a = app(), el = root('forgot');
    if (fp.step === 2) return renderOtp(el, fp, {
      title: 'Reset password',
      onBack: () => { fp.step = 1; renderForgot(); },
      // the server checks the code together with the new password; demo checks it now
      onCode: async code => { if (!live() && code !== fp.code) throw new Error('bad_code'); fp.entered = code; fp.step = 3; renderForgot(); },
    });
    if (fp.step === 3) {
      el.innerHTML = `
        <div class="au-top"><button class="icon-btn" data-back aria-label="Back">${ICON.back}</button><a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a></div>
        <form class="au-form" id="fpForm" novalidate>
          <h2 class="au-h">Set a new password</h2>
          <p class="au-sub">For ${fmtPhone(fp.phone)}</p>
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
          if (live()) await API.auth.reset({ country: a.CC, phone: fp.phone, code: fp.entered, password: f.pw1.value });
          else { await sleep(500); accounts.put(fp.phone, { h: hashPw(fp.phone, f.pw1.value) }); }
          remember.set(fp.phone);
          fp.step = 1; a.toast('Password reset. Please log in with your new password.'); a.go('login');
        } catch (x) {
          if (x.message === 'bad_code') { fp.step = 2; renderForgot(); return a.toast('That code is wrong or has expired. Request a new one.', 'err'); }
          showErr($('#fpErr'), err(x, 'Could not reset the password'));
        } finally { if (btn.isConnected) stop(); }
      });
      return;
    }
    el.innerHTML = `
      <div class="au-top"><button class="icon-btn" data-back aria-label="Back">${ICON.back}</button><a class="icon-btn" href="#/home" aria-label="Close">${ICON.close}</a></div>
      <form class="au-form" id="fpForm" novalidate>
        <h2 class="au-h">Forgot password?</h2>
        <p class="au-sub">Enter the mobile number you registered with. We'll send you a code to reset your password.</p>
        ${countryRow()}
        <div class="au-group">${phoneField('phone', fp.phone || remember.get())}</div>
        <p class="au-err" id="fpErr" role="alert" hidden></p>
        <button class="au-btn" id="fpBtn">Send Code</button>
        <p class="au-alt">Remembered it? <a href="#/login">Log in</a></p>
      </form>`;
    const f = $('#fpForm'), btn = $('#fpBtn');
    const check = () => { btn.disabled = normPhone(f.phone.value).length < a.C.digits; };
    f.addEventListener('input', check); check();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const phone = normPhone(f.phone.value), er = $('#fpErr');
      const none = `No account is registered with ${fmtPhone(phone)}. <a href="#/register">Create one</a>.`;
      if (!live() && !accounts.get(phone)?.h) return showErr(er, none);
      const stop = spin(btn, 'Sending code…');
      try { fp.phone = phone; await sendCode(fp, 'reset'); fp.step = 2; renderForgot(); }
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
        const rec = accounts.get(u.phone);
        if (rec && rec.h && rec.h !== hashPw(u.phone, f.cur.value)) return a.toast('Current password is not correct', 'err');
        accounts.put(u.phone, { h: hashPw(u.phone, f.pw1.value), profile: u });
      }
      a.toast('Password updated'); f.reset();
    } catch (x) { a.toast(err(x, 'Could not update the password'), 'err'); }
  }

  /* =========================================================
     WALLET – shared pieces
     ========================================================= */
  const wl = { dep: null, wd: null, busy: false, hasDeposit: null };
  function tabsHTML(list, active, base) {
    return `<nav class="wl-tabs" role="tablist">${list.map(t => `<a role="tab" href="#/${base}/${t.id}" class="${t.id === active ? 'on' : ''}" aria-selected="${t.id === active}">${t.name}${t.isNew ? '<em>NEW</em>' : ''}</a>`).join('')}</nav>`;
  }
  const balanceRow = label => `<div class="wl-bal"><span>${label || 'Balance'} (${P().curCode})</span><b>${fmt(user().balance)}</b></div>`;
  function amountBlock(kind) {
    const p = P(), min = kind === 'wd' ? p.wdMin : p.depMin;
    return `<div class="wl-amt">
        <label class="wl-lbl" for="wlAmt">Amount (${p.curCode})</label>
        <div class="wl-amt-in"><span>${app().C.cur}</span><input id="wlAmt" name="amount" inputmode="decimal" placeholder="Min. ${fmt(min)}" autocomplete="off"><button type="button" class="wl-clear" data-clear aria-label="Clear amount" hidden>${ICON.close}</button></div>
        ${kind === 'dep' ? `<div class="wl-chips">${p.chips.map(v => `<button type="button" data-plus="${v}">+${v.toLocaleString()}</button>`).join('')}</div>` : `<div class="wl-chips">${[0.25, 0.5, 1].map(f => `<button type="button" data-frac="${f}">${f === 1 ? 'All' : f * 100 + '%'}</button>`).join('')}</div>`}
        <p class="wl-hint" id="wlHint" aria-live="polite"></p>
      </div>`;
  }
  function bindAmount(form, kind, onChange) {
    const p = P(), min = kind === 'wd' ? p.wdMin : p.depMin, max = kind === 'wd' ? p.wdMax : p.depMax;
    const inp = $('#wlAmt', form), hint = $('#wlHint', form), clr = $('[data-clear]', form);
    const get = () => +String(inp.value).replace(/,/g, '') || 0;
    const upd = () => {
      const v = get();
      clr.hidden = !inp.value;
      let msg = '', bad = false;
      if (v && v < min) { msg = `Minimum is ${app().whole(min)}`; bad = true; }
      else if (v > max) { msg = `Maximum is ${app().whole(max)}`; bad = true; }
      else if (kind === 'wd' && v > user().balance) { msg = 'Amount is more than your balance'; bad = true; }
      else if (kind === 'dep' && v && firstDeposit()) msg = `+ ${app().whole(Math.min(v * 2, app().C.bonusMax))} welcome bonus`;
      hint.textContent = msg; hint.className = 'wl-hint' + (bad ? ' bad' : msg ? ' good' : '');
      onChange && onChange(v, !bad && v >= min);
    };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2}).+/, '$1'); upd(); });
    form.addEventListener('click', e => {
      const b = e.target.closest('[data-plus],[data-frac],[data-clear]'); if (!b) return;
      if (b.dataset.plus) inp.value = String(app().r2(get() + +b.dataset.plus));
      if (b.dataset.frac) inp.value = String(Math.floor(user().balance * +b.dataset.frac * 100) / 100);
      if ('clear' in b.dataset) inp.value = '';
      upd(); inp.focus();
    });
    upd();
    return { get, valid: () => { const v = get(); return v >= min && v <= max && (kind !== 'wd' || v <= user().balance); } };
  }
  const rules = list => `<ol class="wl-rules">${list.map(x => `<li>${x}</li>`).join('')}</ol>`;
  const firstDeposit = () => live() ? wl.hasDeposit === false : !app().state.tx.some(t => t.type === 'Deposit' && t.status !== 'failed');
  function depositLimit() {
    const u = user(), L = live() ? u.limits?.deposit : u.limits;
    const amt = L && (L.amount ?? L.amt); if (!amt) return null;
    const period = L.period || 'Daily';
    if (live()) return { period, amt, left: null };
    const span = { Daily: 864e5, Weekly: 6048e5, Monthly: 2592e6 }[period] || 864e5;
    const used = app().state.tx.filter(t => t.type === 'Deposit' && t.status !== 'failed' && Date.now() - t.at < span).reduce((s, t) => s + t.amt, 0);
    return { period, amt, left: Math.max(0, amt - used) };
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
  const refresh = () => { const a = app(); a.renderAuth(); a.renderMe(); };

  /* ---------------- Deposit core ---------------- */
  async function deposit(amount, tab, method) {
    const a = app(), u = user(), first = firstDeposit();
    let r, status = 'success';
    if (live()) {
      // PROVIDER: with PAYMENTS_MODE=demo the server credits at once; with a provider it returns pending + a checkout
      const res = await API.wallet.deposit(amount, tab.api);
      u.balance = res.balance; status = res.status; r = String(res.paymentId).slice(0, 8).toUpperCase();
      if (status === 'success') wl.hasDeposit = true;
    } else {
      u.balance = a.r2(u.balance + amount); r = ref('DP');
      a.addTx('Deposit', amount, { method, ref: r, status: 'success' });
      if (first) { u.bonus = Math.min(amount * 2, a.C.bonusMax); a.addTx('Welcome bonus (locked)', 0, { method: `${a.whole(u.bonus)} bonus – unlocks as you play`, status: 'success' }); }
    }
    if (tab.id === 'card') prefs.set({ cardDeposited: true });
    saveUser(); refresh(); rerender();
    if (status !== 'success') return resultSheet({ ok: 'pending', title: 'Deposit pending', amount, note: 'Complete the payment with your provider. Your balance updates as soon as it is confirmed.', rows: [['Method', method], ['Reference', r]], primary: ['View Transaction Records', '#/acct/tx'], secondary: 'Done' });
    if (window.Motion && Motion.confetti) Motion.confetti();
    resultSheet({
      ok: 'ok', title: 'Deposit successful', amount,
      rows: [['Method', method], ['Reference', r], ['New balance', a.money(u.balance)], ...(first && !live() ? [['Welcome bonus', `<b class="gold">+${a.whole(u.bonus)}</b>`]] : [])],
      primary: ['Bet Now', '#/home'], secondary: 'Done',
    });
  }
  async function depositFlow(amount, tab, method, waitMs) {
    processingSheet(waitMs.title, waitMs.sub);
    try { await sleep(waitMs.ms); await deposit(amount, tab, method); }
    catch (x) { failSheet(x, method); }
  }

  /* =========================================================
     DEPOSIT
     ========================================================= */
  function renderDeposit(tab) {
    const a = app(), p = P(), el = root('deposit');
    if (!user()) return a.go('login/deposit' + (tab ? encodeURIComponent('/' + tab) : ''));
    migratePrefs();
    if (!p.dep.find(t => t.id === tab)) tab = p.dep[0].id;
    wl.dep = tab;
    if (live() && wl.hasDeposit == null) {
      wl.hasDeposit = undefined;
      API.wallet.transactions('in').then(l => { wl.hasDeposit = l.some(t => t.type === 'deposit'); if (a.state.route === 'deposit') rerender(); }).catch(() => { wl.hasDeposit = true; });
    }
    const lim = depositLimit();
    el.innerHTML = `${pageHead('Deposit', { help: true })}
      ${tabsHTML(p.dep, tab, 'deposit')}
      <div class="wl-body">
        ${firstDeposit() ? `<div class="au-bonus">${ICON.gift}<span><b>200% Welcome Bonus</b> – your first deposit is tripled, up to ${a.whole(a.C.bonusMax)}.</span></div>` : ''}
        ${lim ? `<div class="wl-note">${ICON.shield}<span>Your ${lim.period.toLowerCase()} deposit limit is <b>${a.whole(lim.amt)}</b>${lim.left != null ? ` – <b>${a.whole(lim.left)}</b> left` : ''}. <a href="#/acct/limits">Change</a></span></div>` : ''}
        <div id="depPane"></div>
        ${demoNote('No real money moves. Payments are simulated so the full flow can be tested.')}
      </div>`;
    const t = p.dep.find(x => x.id === tab);
    ({ card: depCard, transfer: depTransfer, opay: depWallet, palmpay: depWallet, ussd: depUssd, others: depOthers, momo: depMomo, paybill: depPaybill })[tab]($('#depPane', el), t);
  }
  function limitBlocked(v) {
    const lim = depositLimit();
    if (lim && lim.left != null && v > lim.left) { app().toast(`That is over your deposit limit. You can deposit up to ${app().whole(lim.left)} right now.`, 'err'); return true; }
    return false;
  }
  function depRules(extra = []) {
    const p = P();
    return rules([`Minimum per transaction is ${p.curCode} ${fmt(p.depMin)}.`, `Maximum per transaction is ${p.curCode} ${fmt(p.depMax)}.`, 'LetBetAfrika does not charge any fees on deposits.', ...extra]);
  }

  /* ----- Card (both countries) ----- */
  const luhn = n => { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return s % 10 === 0; };
  const brandOf = n => /^4/.test(n) ? 'VISA' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^(5061|5078|6500)/.test(n) ? 'Verve' : '';
  function depCard(pane, t) {
    const a = app(), cards = prefs.get().cards;
    pane.innerHTML = `<form class="wl-form" id="depForm" novalidate>
      ${balanceRow()}
      ${amountBlock('dep')}
      ${cards.length ? `<p class="wl-lbl">Pay with</p><div class="wl-opts">${cards.map((c, i) => `<label class="wl-opt"><input type="radio" name="card" value="${i}" ${i === 0 ? 'checked' : ''}><span class="wl-opt-i">${ICON.card}</span><span><b>${c.brand} •••• ${c.last4}</b><small>Expires ${c.exp}</small></span><button type="button" class="wl-del" data-delcard="${i}" aria-label="Remove card">${ICON.trash}</button></label>`).join('')}
        <label class="wl-opt"><input type="radio" name="card" value="new"><span class="wl-opt-i">${ICON.plus}</span><span><b>Use a new card</b></span></label></div>` : '<input type="hidden" name="card" value="new">'}
      <div class="wl-card" id="newCard" ${cards.length ? 'hidden' : ''}>
        <label class="wl-lbl">Card number<div class="wl-in"><input name="num" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="23"><em id="cardBrand"></em></div></label>
        <div class="wl-2">
          <label class="wl-lbl">Expiry<input name="exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></label>
          <label class="wl-lbl">CVV<input name="cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" type="password"></label>
        </div>
        <label class="au-check sm"><input type="checkbox" name="save" checked><span>Save card for faster deposits</span></label>
      </div>
      <button class="au-btn" id="depBtn" disabled>Top Up Now</button>
      <p class="wl-secure">${ICON.lock} Card payments are encrypted and protected by your bank's verification.</p>
      ${depRules(a.CC === 'GH' ? ['Depositing with a card unlocks withdrawals to a bank account.'] : [])}
    </form>`;
    const f = $('#depForm', pane), btn = $('#depBtn', pane), nc = $('#newCard', pane);
    const isNew = () => (f.querySelector('input[name=card]:checked') || f.card).value === 'new';
    const cardOk = () => { const n = digits(f.num.value); const [mm, yy] = f.exp.value.split('/').map(Number); const exp = new Date(2000 + yy, mm);
      return n.length >= 13 && luhn(n) && mm >= 1 && mm <= 12 && exp > new Date() && /^\d{3,4}$/.test(f.cvv.value); };
    let amt;
    const sync = () => { nc.hidden = !isNew(); btn.disabled = !(amt.valid() && (!isNew() || cardOk())); };
    amt = bindAmount(f, 'dep', () => amt && sync());
    f.num.addEventListener('input', () => { const n = digits(f.num.value).slice(0, 19); f.num.value = n.replace(/(.{4})/g, '$1 ').trim(); $('#cardBrand', pane).textContent = brandOf(n); f.num.classList.toggle('bad', n.length >= 13 && !luhn(n)); });
    f.exp.addEventListener('input', () => { let d = digits(f.exp.value).slice(0, 4); if (d.length === 1 && +d > 1) d = '0' + d; f.exp.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
    f.cvv.addEventListener('input', () => { f.cvv.value = digits(f.cvv.value); });
    f.addEventListener('input', sync); f.addEventListener('change', sync); sync();
    f.addEventListener('click', e => { const d = e.target.closest('[data-delcard]'); if (!d) return; e.preventDefault(); const c = prefs.get().cards; c.splice(+d.dataset.delcard, 1); prefs.set({ cards: c }); rerender(); a.toast('Card removed'); });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = amt.get(); if (limitBlocked(v)) return;
      let card;
      if (isNew()) { const n = digits(f.num.value); card = { brand: brandOf(n) || 'Card', last4: n.slice(-4), exp: f.exp.value }; }
      else card = cards[+f.querySelector('input[name=card]:checked').value];
      const label = `${card.brand} •••• ${card.last4}`;
      // PROVIDER: card checkout + 3-D Secure happens on the provider's page
      processingSheet('Contacting your bank…', label);
      await sleep(1000);
      const otp = String(Math.floor(1000 + Math.random() * 9000));
      wl.busy = false;
      const s = sheet(`<h3>Bank verification</h3><p class="wl-p">Enter the one-time PIN your bank sent to the phone linked to ${label}.</p>
        <div class="au-field"><input id="bankOtp" inputmode="numeric" maxlength="6" placeholder="Enter OTP" aria-label="Bank OTP" autocomplete="one-time-code"></div>
        ${testNote(`Card checkout is simulated until the payment provider is connected. Your bank's code is <b>${otp}</b>.`)}
        <div class="wl-sheet-btns"><button class="au-btn ghost" data-no>Cancel</button><button class="au-btn" data-yes>Authorise ${a.whole(v)}</button></div>`);
      $('[data-no]', s).onclick = () => { closeSheet(); if (!live()) a.addTx('Deposit', 0, { method: label, ref: ref('DP'), status: 'failed' }); a.toast('Payment cancelled', 'err'); };
      $('[data-yes]', s).onclick = () => {
        if ($('#bankOtp', s).value.trim() !== otp) { $('#bankOtp', s).classList.add('bad'); return a.toast('Incorrect OTP', 'err'); }
        if (isNew() && f.save.checked && !prefs.get().cards.some(c => c.last4 === card.last4)) prefs.set({ cards: [card, ...prefs.get().cards].slice(0, 3) });
        depositFlow(v, t, label, { title: 'Confirming payment…', sub: 'Please don’t close this page.', ms: 900 });
      };
    });
  }

  /* ----- NG Bank transfer (dedicated virtual account) ----- */
  function depTransfer(pane, t) {
    const a = app(), u = user();
    // PROVIDER: each player gets a dedicated virtual account from the payment provider
    const acct = '9' + String(u.uid).padStart(9, '0').slice(-9);
    pane.innerHTML = `<div class="wl-form">
      ${balanceRow()}
      <p class="wl-p">Transfer any amount from any bank app to your personal LetBetAfrika account below. Your balance is credited automatically, usually within a minute.</p>
      <div class="wl-va">
        <div><span>Bank</span><b>LetBet Wallet MFB <em class="wl-tag">TEST</em></b></div>
        <div><span>Account number</span><b class="big">${acct.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</b>${copyBtn(acct)}</div>
        <div><span>Account name</span><b>LetBetAfrika – ${a.esc(u.fullName || fmtPhone(u.phone))}</b></div>
      </div>
      <form id="trForm" class="wl-sim" novalidate>
        <p class="wl-lbl">Test the flow: pretend you sent a transfer</p>
        ${amountBlock('dep')}
        <button class="au-btn" id="trBtn" disabled>I have sent the money</button>
      </form>
      ${depRules(['This account number is yours only – save it as a beneficiary in your bank app.'])}
    </div>`;
    const f = $('#trForm', pane), btn = $('#trBtn', pane);
    const amt = bindAmount(f, 'dep', (v, ok) => { btn.disabled = !ok; });
    f.addEventListener('submit', e => {
      e.preventDefault(); const v = amt.get(); if (limitBlocked(v)) return;
      depositFlow(v, t, 'Bank Transfer', { title: 'Waiting for your transfer…', sub: `Looking for ${a.whole(v)} sent to ${acct}`, ms: 1800 });
    });
  }

  /* ----- NG wallets: OPay / PalmPay ----- */
  function depWallet(pane, t) {
    const a = app();
    pane.innerHTML = `<form class="wl-form" id="depForm" novalidate>
      <div class="wl-brand" style="--bc:${t.color}"><b>${t.name}</b><span>Pay from your ${t.name} balance. Instant, no fees.</span></div>
      ${balanceRow()}
      ${amountBlock('dep')}
      <button class="au-btn" id="depBtn" disabled>Pay with ${t.name}</button>
      ${depRules([`You'll approve the payment in your ${t.name} app.`])}
    </form>`;
    const f = $('#depForm', pane), btn = $('#depBtn', pane);
    const amt = bindAmount(f, 'dep', (v, ok) => { btn.disabled = !ok; });
    f.addEventListener('submit', e => {
      e.preventDefault(); const v = amt.get(); if (limitBlocked(v)) return;
      // PROVIDER: redirect / push to the wallet app
      depositFlow(v, t, t.name, { title: `Opening ${t.name}…`, sub: `Approve the payment of ${a.whole(v)} in your ${t.name} app.`, ms: 2000 });
    });
  }

  /* ----- NG USSD ----- */
  function depUssd(pane, t) {
    const a = app(), banks = Object.keys(NG_USSD);
    pane.innerHTML = `<form class="wl-form" id="depForm" novalidate>
      ${balanceRow()}
      <label class="wl-lbl">Your bank<select name="bank"><option value="">Select a bank</option>${banks.map(b => `<option>${b}</option>`).join('')}</select></label>
      ${amountBlock('dep')}
      <button class="au-btn" id="depBtn" disabled>Get USSD Code</button>
      <div id="ussdOut"></div>
      ${depRules(['Works on any phone, no data needed.', 'Your bank may charge a small USSD fee.'])}
    </form>`;
    const f = $('#depForm', pane), btn = $('#depBtn', pane), out = $('#ussdOut', pane);
    let amt;
    const sync = () => { btn.disabled = !(f.bank.value && amt.valid()); out.innerHTML = ''; };
    amt = bindAmount(f, 'dep', () => amt && sync());
    f.bank.addEventListener('change', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault(); const v = amt.get(); if (limitBlocked(v)) return;
      const stop = spin(btn, 'Generating…'); await sleep(500); stop();
      // PROVIDER: the payment provider issues the real merchant code + reference
      const r = String(Math.floor(1e5 + Math.random() * 9e5)), base = NG_USSD[f.bank.value].slice(0, -1);
      const code = `${base}*000*${Math.round(v)}*${r}#`;
      out.innerHTML = `<div class="wl-ussd"><span>Dial this code on the phone number linked to your ${a.esc(f.bank.value)} account</span>
        <b>${code}</b><div class="wl-2">${copyBtn(code, 'Copy code')}<a class="wl-copy" href="tel:${encodeURIComponent(code)}">${ICON.phone}Dial now</a></div>
        <small>Code expires in 10 minutes. <em class="wl-tag">TEST CODE</em></small>
        <button type="button" class="au-btn" id="ussdDone">I have completed the payment</button></div>`;
      $('#ussdDone', out).onclick = () => depositFlow(v, t, `USSD · ${f.bank.value}`, { title: 'Checking your payment…', sub: `Reference ${r}`, ms: 1500 });
    });
  }

  /* ----- NG Others: pay from your bank / fintech app ----- */
  function depOthers(pane) {
    const u = user();
    pane.innerHTML = `<div class="wl-form">
      <p class="wl-p">Fund your wallet from your bank or fintech app using <b>Pay Bills → Betting → LetBetAfrika</b>. Tap a provider for the steps.</p>
      <div class="wl-acc">${P().others.map(n => `<details class="wl-step"><summary><span class="wl-logo">${n.slice(0, 2).toUpperCase()}</span>${n}${ICON.chev}</summary>
        <ol>
          <li>Log in to your <b>${n}</b> app or website.</li>
          <li>Tap <b>Payments</b> or <b>Pay Bills</b>.</li>
          <li>Choose <b>Betting</b>, then <b>LetBetAfrika</b>.</li>
          <li>Enter the amount and your LetBetAfrika number <b>0${u.phone}</b> ${copyBtn('0' + u.phone)}</li>
          <li>Confirm. Your balance is credited instantly and you'll get a notification.</li>
        </ol></details>`).join('')}</div>
      <p class="wl-demo"><b>SOON</b> LetBetAfrika is being listed in these apps – the steps show how it works once the payment partners are live.</p>
    </div>`;
  }

  /* ----- GH Mobile money ----- */
  const providerOf = phone => GH_MOMO.find(m => m.prefixes.includes(String(phone).slice(0, 2)));
  const momoPicker = sel => `<p class="wl-lbl">Select your mobile provider</p><div class="wl-mm" role="radiogroup">${GH_MOMO.map(m => `<label class="wl-mmo" style="--bc:${m.color};--bi:${m.ink}"><input type="radio" name="prov" value="${m.id}" ${sel && sel.id === m.id ? 'checked' : ''}><span class="wl-mm-logo">${m.short}</span><small>${m.name}</small></label>`).join('')}</div>`;
  function depMomo(pane, t) {
    const a = app(), u = user(), prov = providerOf(u.phone);
    pane.innerHTML = `<form class="wl-form" id="depForm" novalidate>
      <label class="wl-lbl">Mobile money number${phoneField('mm', u.phone, true)}</label>
      <p class="wl-small">Deposits and withdrawals use the number you registered with.</p>
      ${momoPicker(prov)}
      ${balanceRow()}
      ${amountBlock('dep')}
      <button class="au-btn" id="depBtn" disabled>Top Up Now</button>
      ${depRules(['Your balance can only be withdrawn to the mobile number you registered with.'])}
    </form>`;
    const f = $('#depForm', pane), btn = $('#depBtn', pane);
    let amt;
    const sync = () => { btn.disabled = !(f.querySelector('input[name=prov]:checked') && amt.valid()); };
    amt = bindAmount(f, 'dep', () => amt && sync());
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', e => {
      e.preventDefault(); const v = amt.get(); if (limitBlocked(v)) return;
      const m = GH_MOMO.find(x => x.id === f.querySelector('input[name=prov]:checked').value);
      // PROVIDER: collection request → the network sends a payment prompt to the phone
      wl.busy = true;
      let left = 60;
      const s = sheet(`<div class="wl-proc"><div class="wl-phone-anim" style="--bc:${m.color}">${ICON.phone}</div>
        <h3>Check your phone</h3><p>We've sent a ${m.name} prompt to <b>${fmtPhone(u.phone)}</b>. Enter your MoMo PIN to approve <b>${a.whole(v)}</b>.</p>
        <p class="wl-count">Waiting for approval… <b id="mmLeft">${left}s</b></p>
        <p class="wl-small">No prompt? Dial <b>${m.dial}</b> and check <b>My Approvals</b>.</p>
        ${testNote('Mobile money is simulated until the payment provider is connected.')}
        <div class="wl-sheet-btns"><button class="au-btn ghost" data-no>Cancel</button><button class="au-btn" data-yes>Simulate approval</button></div></div>`);
      const timer = setInterval(() => { left--; const x = $('#mmLeft', s); if (x) x.textContent = left + 's'; if (left <= 0) { clearInterval(timer); fail('The prompt expired before it was approved.'); } }, 1000);
      const fail = why => { wl.busy = false; if (!live()) a.addTx('Deposit', 0, { method: m.name, ref: ref('DP'), status: 'failed' }); resultSheet({ ok: 'fail', title: 'Deposit not completed', rows: [['Reason', why], ['Method', m.name]], secondary: 'Close' }); };
      $('[data-no]', s).onclick = () => { clearInterval(timer); fail('You cancelled the payment.'); };
      $('[data-yes]', s).onclick = () => { clearInterval(timer); depositFlow(v, t, m.name, { title: 'Confirming payment…', sub: m.name, ms: 900 }); };
    });
  }

  /* ----- GH Paybill (dial the merchant menu) ----- */
  function depPaybill(pane) {
    const u = user();
    pane.innerHTML = `<div class="wl-form">
      <p class="wl-p">Pay from your mobile money menu – no app or data needed.</p>
      <div class="wl-acc">${GH_MOMO.map((m, i) => `<details class="wl-step" ${i === 0 ? 'open' : ''}><summary><span class="wl-logo" style="background:${m.color};color:${m.ink}">${m.short}</span>${m.name}${ICON.chev}</summary>
        <ol>
          <li>Dial <b>${m.dial}</b> on ${fmtPhone(u.phone)}.</li>
          <li>Choose <b>${m.id === 'mtn' ? 'MoMoPay &amp; Pay Bill' : 'Pay Bill'}</b>, then <b>General Payment</b>.</li>
          <li>Enter merchant code <b>LETBET</b> ${copyBtn('LETBET')}</li>
          <li>Enter the amount and use your number <b>0${u.phone}</b> as the reference.</li>
          <li>Enter your MoMo PIN to confirm. Your balance is credited instantly.</li>
        </ol></details>`).join('')}</div>
      ${depRules(['Your balance can only be withdrawn to the mobile number you registered with.'])}
      <p class="wl-demo"><b>SOON</b> Merchant code LETBET is a placeholder until the mobile money partners are live.</p>
    </div>`;
  }

  /* =========================================================
     WITHDRAW
     ========================================================= */
  // live: the server holds payouts for admin approval; demo: they pay out after a few seconds
  const kyc = u => live() ? (u.verified ? 'ok' : u.limits?.kyc?.status === 'pending' ? 'pending' : 'none') : (u.verified ? 'ok' : 'none');
  function renderWithdraw(tab) {
    const a = app(), p = P(), el = root('withdraw'), u = user();
    if (!u) return a.go('login/withdraw' + (tab ? encodeURIComponent('/' + tab) : ''));
    migratePrefs();
    if (!p.wd.find(t => t.id === tab)) tab = p.wd[0].id;
    wl.wd = tab;
    const k = kyc(u);
    const pending = live() ? [] : a.state.tx.filter(t => t.status === 'pending' && t.amt < 0);
    el.innerHTML = `${pageHead('Withdraw', { help: true })}
      ${tabsHTML(p.wd, tab, 'withdraw')}
      <div class="wl-body">
        ${k === 'none' && tab !== 'friend' ? `<a class="wl-verify" href="#/acct/verify" data-after-verify="withdraw/${tab}">${ICON.shield}<span><b>Verify your ID to withdraw</b>It takes 2 minutes. We need it by law before paying out winnings.</span>${ICON.chev}</a>` : ''}
        ${k === 'pending' && tab !== 'friend' ? `<div class="wl-note">${ICON.clock}<span><b>ID check in progress.</b> You can request a withdrawal now – it is paid as soon as your ID is approved.</span></div>` : ''}
        ${pending.length ? `<a class="wl-note" href="#/acct/tx">${ICON.clock}<span><b>${pending.length}</b> withdrawal${pending.length > 1 ? 's' : ''} processing – ${a.whole(-pending.reduce((s, t) => s + t.amt, 0))}. View records</span></a>` : ''}
        <div id="wdPane"></div>
        ${demoNote('No real money moves. Payouts are simulated so the full flow can be tested.')}
      </div>`;
    $$('[data-after-verify]', el).forEach(x => x.addEventListener('click', () => { a.state.afterVerify = x.dataset.afterVerify; }));
    ({ bank: wdBank, friend: wdFriend, momo: wdMomo })[tab]($('#wdPane', el));
  }
  const canWithdraw = () => kyc(user()) !== 'none';
  function wdRules(extra = []) {
    const p = P();
    return rules([`Minimum per transaction is ${p.curCode} ${fmt(p.wdMin)}.`, `Maximum per transaction is ${p.curCode} ${fmt(p.wdMax)}.`, 'Withdrawal is free, no transaction fees.', 'Bonus funds can only be withdrawn after the wagering requirements are met.', ...extra]);
  }
  async function payout({ amount, method, apiMethod, details, to, ms = 6000 }) {
    const a = app(), u = user();
    if (!await confirmSheet('Confirm withdrawal', [['Amount', `<b>${a.money(amount)}</b>`], ['To', to], ['Fee', 'Free'], ['Balance after', a.money(u.balance - amount)]], 'Withdraw')) return;
    processingSheet('Submitting withdrawal…', to);
    let r;
    try {
      if (live()) { const res = await API.wallet.withdraw(amount, apiMethod, details); u.balance = res.balance; r = String(res.paymentId).slice(0, 8).toUpperCase(); }
      else { await sleep(1000); u.balance = a.r2(u.balance - amount); r = ref('WD'); a.addTx('Withdrawal', -amount, { method, ref: r, status: 'pending' }); setTimeout(() => settleWithdrawal(r), ms); }
    } catch (x) { return failSheet(x, method); }
    saveUser(); refresh(); rerender();
    resultSheet({ ok: 'pending', title: 'Withdrawal submitted', amount,
      rows: [['To', to], ['Reference', r], ['Status', '<em class="tx-st pending">Processing</em>'], ['Usually arrives', kyc(u) === 'pending' ? 'After your ID is approved' : 'Within 5 minutes']],
      primary: ['View Transaction Records', '#/acct/tx'], secondary: 'Done' });
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

  /* ----- Bank (NG main tab, GH needs a card deposit first) ----- */
  function wdBank(pane) {
    const a = app(), p = P(), pr = prefs.get(), banks = pr.banks;
    if (a.CC === 'GH' && !pr.cardDeposited) {
      pane.innerHTML = `<div class="wl-lockbox">${ICON.lock}<h3>Enhanced Protection</h3><p>To withdraw to a bank account, you must have deposited with a card first. This keeps your money safe from fraud.</p><a class="au-btn" href="#/deposit/card">Deposit with Card</a><a class="au-btn ghost" href="#/withdraw/momo">Withdraw to Mobile Money</a></div>`;
      return;
    }
    const sel = Math.min(pr.wdBank || 0, Math.max(0, banks.length - 1));
    pane.innerHTML = `<form class="wl-form" id="wdForm" novalidate>
      <div class="wl-row"><p class="wl-lbl">Withdraw To</p>${banks.length ? '<button type="button" class="au-link" id="manageBtn">Manage Accounts</button>' : ''}</div>
      ${banks.length ? `<div class="wl-opts">${banks.map((b, i) => `<label class="wl-opt"><input type="radio" name="bank" value="${i}" ${i === sel ? 'checked' : ''}><span class="wl-opt-i">${ICON.bank}</span><span><b>${a.esc(b.bank)}</b><small>${b.acct.replace(/\d(?=\d{4})/g, '•')} · ${a.esc(b.name)}</small></span></label>`).join('')}</div>` : ''}
      <button type="button" class="wl-add" id="addBank">${ICON.plus}${banks.length ? 'Add another bank account' : 'Add a bank account'}</button>
      ${balanceRow('Withdrawable balance')}
      ${amountBlock('wd')}
      <button class="au-btn" id="wdBtn" disabled>Withdraw</button>
      ${wdRules(['The account name must match the name on your verified ID.'])}
    </form>`;
    const f = $('#wdForm', pane), btn = $('#wdBtn', pane);
    let amt;
    const sync = () => { btn.disabled = !(canWithdraw() && banks.length && amt.valid()); };
    amt = bindAmount(f, 'wd', () => amt && sync());
    f.addEventListener('change', sync); sync();
    $('#addBank', pane).onclick = () => bankSheet(p);
    if (banks.length) $('#manageBtn', pane).onclick = manageSheet;
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (!canWithdraw()) return a.toast('Please verify your ID first', 'err');
      const i = +f.querySelector('input[name=bank]:checked').value, b = banks[i]; prefs.set({ wdBank: i });
      payout({ amount: amt.get(), method: `${b.bank} ••${b.acct.slice(-4)}`, apiMethod: 'bank_transfer',
        details: { account: `${b.bank} · ${b.acct} · ${b.name}`, bank: b.bank, acct: b.acct, name: b.name },
        to: `${a.esc(b.bank)} ${b.acct.replace(/\d(?=\d{4})/g, '•')}<br><small>${a.esc(b.name)}</small>` });
    });
  }
  function bankSheet(p) {
    const a = app(), u = user();
    if (prefs.get().banks.length >= 3) return a.toast('You can save up to 3 bank accounts. Remove one first.', 'err');
    const [minL, maxL] = p.acctLen;
    const s = sheet(`<h3>Add bank account</h3>
      <form id="bankForm" class="wl-form" novalidate>
        <label class="wl-lbl">Bank<select name="bank"><option value="">Select a Bank</option>${p.banks.map(b => `<option>${b}</option>`).join('')}</select></label>
        <label class="wl-lbl">Account number<input name="acct" inputmode="numeric" maxlength="${maxL}" placeholder="${minL === maxL ? minL + '-digit account number' : 'Account number'}"></label>
        <div class="wl-resolve" id="resolve" aria-live="polite"></div>
        <div class="wl-sheet-btns"><button type="button" class="au-btn ghost" data-no>Cancel</button><button class="au-btn" id="bankSave" disabled>Save Account</button></div>
      </form>`);
    const f = $('#bankForm', s), out = $('#resolve', s), save = $('#bankSave', s);
    let resolved = null, seq = 0;
    const look = async () => {
      f.acct.value = digits(f.acct.value); resolved = null; save.disabled = true;
      const n = f.acct.value;
      if (!f.bank.value || n.length < minL) { out.innerHTML = ''; out.className = 'wl-resolve'; return; }
      const my = ++seq; out.innerHTML = '<i class="spin"></i> Checking account…'; out.className = 'wl-resolve';
      // PROVIDER: account-name enquiry (NIBSS NIP name enquiry / GhIPSS)
      await sleep(800); if (my !== seq) return;
      resolved = (u.fullName || 'ACCOUNT HOLDER').toUpperCase();
      out.innerHTML = `${ICON.check}<b>${a.esc(resolved)}</b>${u.fullName ? '' : '<small>Verify your ID so we can check this name matches yours.</small>'}`;
      out.className = 'wl-resolve ok';
      save.disabled = false;
    };
    f.bank.onchange = look; f.acct.oninput = look;
    $('[data-no]', s).onclick = closeSheet;
    f.addEventListener('submit', e => {
      e.preventDefault(); if (!resolved) return;
      const banks = prefs.get().banks;
      if (banks.some(b => b.acct === f.acct.value && b.bank === f.bank.value)) return a.toast('That account is already saved', 'err');
      banks.push({ bank: f.bank.value, acct: f.acct.value, name: resolved }); prefs.set({ banks, wdBank: banks.length - 1 });
      closeSheet(); a.toast('Bank account saved'); rerender();
    });
  }
  function manageSheet() {
    const a = app(), banks = prefs.get().banks;
    const s = sheet(`<h3>Manage accounts</h3><div class="wl-opts">${banks.map((b, i) => `<div class="wl-opt"><span class="wl-opt-i">${ICON.bank}</span><span><b>${a.esc(b.bank)}</b><small>${b.acct} · ${a.esc(b.name)}</small></span><button type="button" class="wl-del" data-del="${i}" aria-label="Remove ${a.esc(b.bank)} account">${ICON.trash}</button></div>`).join('')}</div>
      <div class="wl-sheet-btns"><button class="au-btn ghost" data-no>Close</button></div>`);
    $('[data-no]', s).onclick = closeSheet;
    $$('[data-del]', s).forEach(b => b.onclick = () => { banks.splice(+b.dataset.del, 1); prefs.set({ banks, wdBank: 0 }); a.toast('Bank account removed'); closeSheet(); rerender(); });
  }

  /* ----- GH Mobile money ----- */
  function wdMomo(pane) {
    const u = user(), prov = providerOf(u.phone);
    pane.innerHTML = `<form class="wl-form" id="wdForm" novalidate>
      <label class="wl-lbl">Withdraw to${phoneField('mm', u.phone, true)}</label>
      <p class="wl-small">For your security, winnings are paid only to the number you registered with.</p>
      ${momoPicker(prov)}
      ${balanceRow('Withdrawable balance')}
      ${amountBlock('wd')}
      <button class="au-btn" id="wdBtn" disabled>Withdraw</button>
      ${wdRules()}
    </form>`;
    const f = $('#wdForm', pane), btn = $('#wdBtn', pane);
    let amt;
    const sync = () => { btn.disabled = !(canWithdraw() && f.querySelector('input[name=prov]:checked') && amt.valid()); };
    amt = bindAmount(f, 'wd', () => amt && sync());
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', e => {
      e.preventDefault();
      const m = GH_MOMO.find(x => x.id === f.querySelector('input[name=prov]:checked').value);
      payout({ amount: amt.get(), method: m.name, apiMethod: 'mobile_money', details: { account: `${m.name} · 0${u.phone}`, net: m.short, phone: u.phone },
        to: `${m.name}<br><small>${fmtPhone(u.phone)}</small>`, ms: 4000 });
    });
  }

  /* ----- Transfer to friend (both countries) ----- */
  function wdFriend(pane) {
    const a = app(), u = user();
    pane.innerHTML = `<form class="wl-form" id="wdForm" novalidate>
      <p class="wl-p">Send money from your balance to another LetBetAfrika player instantly. It's free.</p>
      <label class="wl-lbl">Friend's mobile number${phoneField('to', '')}</label>
      <div class="wl-resolve" id="friendName" aria-live="polite"></div>
      ${balanceRow()}
      ${amountBlock('wd')}
      <label class="wl-lbl">Note <span class="muted">(optional)</span><input name="note" maxlength="40" placeholder="e.g. Share of our win"></label>
      <button class="au-btn" id="wdBtn" disabled>Send</button>
      ${rules(['Transfers between players are instant and free.', 'You can’t transfer bonus funds.', 'Check the number carefully – transfers can’t be reversed.'])}
    </form>`;
    const f = $('#wdForm', pane), btn = $('#wdBtn', pane), nm = $('#friendName', pane);
    let amt;
    const toOk = () => { const t = normPhone(f.to.value); return t.length === a.C.digits && t !== u.phone; };
    const sync = () => {
      const t = normPhone(f.to.value);
      if (t === u.phone) { nm.innerHTML = 'You can’t send money to yourself.'; nm.className = 'wl-resolve bad'; }
      else if (toOk()) {
        if (live()) { nm.innerHTML = `<small>We'll check this number is a LetBetAfrika player before sending.</small>`; nm.className = 'wl-resolve'; }
        else { const rec = accounts.get(t); nm.innerHTML = rec ? `${ICON.check}<b>LetBetAfrika player ${mask(t)}</b>` : `<small>This number isn't registered yet.</small>`; nm.className = 'wl-resolve ' + (rec ? 'ok' : 'bad'); }
      } else { nm.innerHTML = ''; nm.className = 'wl-resolve'; }
      btn.disabled = !(toOk() && amt.valid() && (live() || accounts.get(t)));
    };
    amt = bindAmount(f, 'wd', () => amt && sync());
    f.addEventListener('input', sync); sync();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const t = normPhone(f.to.value), v = amt.get();
      if (!await confirmSheet('Send money', [['To', fmtPhone(t)], ['Amount', `<b>${a.money(v)}</b>`], ...(f.note.value ? [['Note', a.esc(f.note.value)]] : []), ['Fee', 'Free']], 'Send')) return;
      processingSheet('Sending…', fmtPhone(t));
      let r;
      try {
        if (live()) { const res = await API.wallet.transfer(t, v, f.note.value || undefined); u.balance = res.balance; r = res.ref; }
        else {
          await sleep(800);
          u.balance = a.r2(u.balance - v); r = ref('TF');
          a.addTx('Transfer to friend', -v, { method: fmtPhone(mask(t)), ref: r, status: 'success' });
          const rec = accounts.get(t);
          if (rec && rec.profile) { rec.profile.balance = a.r2((rec.profile.balance || 0) + v); accounts.put(t, { profile: rec.profile }); }
        }
      } catch (x) { return failSheet(x, 'Transfer to friend'); }
      saveUser(); refresh(); rerender();
      resultSheet({ ok: 'ok', title: 'Money sent', amount: v, rows: [['To', fmtPhone(t)], ['Reference', r], ['New balance', a.money(u.balance)]], secondary: 'Done' });
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

  window.Account = { handles: page => page in RENDER, render, persist, changePassword };
  setTimeout(settleStale, 0);
})();
