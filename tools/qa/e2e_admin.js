// Money flows end to end in the browser, player site + admin portal, no demo shortcuts:
//   admin fills the Nigeria bank account → a player sees it, sends "I have sent ₦5,000" → admin confirms ₦4,500 →
//   player credited; ID check approved; withdrawal marked paid; Ghana MoMo deposit approved on the phone (mock
//   Paystack) and a Ghana payout sent through the API. Screenshots of every portal page.
//   Server: PAYMENTS_MODE=live PAYSTACK_BASE=<mock> PAYSTACK_SECRET_KEY=sk_test_mock, fresh DB; mock_paystack.js running.
//   node tools/qa/e2e_admin.js <outDir> <baseUrl> <dbUrl> [mockUrl]
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:8096/', DB = process.argv[4], MOCK = process.argv[5] || 'http://127.0.0.1:9098';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sql = s => execFileSync('psql', [DB, '-Atc', s]).toString().trim();
const api = async (path, body, token) => { const r = await fetch(BASE + 'api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
const rnd = n => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0');
async function player(cc, name) {
  const phone = (cc === 'GH' ? '24' : '80') + rnd(cc === 'GH' ? 7 : 8);
  const o = await api('/auth/otp', { country: cc, phone, purpose: 'register' });
  const r = await api('/auth/register', { country: cc, phone, code: o.devCode, password: 'Strong123', fullName: name });
  return { phone, token: r.token, user: r.user };
}
(async () => {
  const b = await chromium.launch(), errs = [];
  const admin = await player('NG', 'Ops Admin'); sql(`UPDATE users SET role='admin' WHERE id='${admin.user.id}'`);
  const ng = await player('NG', 'Ada Obi'), gh = await player('GH', 'Kofi Mensah');
  sql(`DELETE FROM settings WHERE key='payments'`);
  // ---------- admin portal: sign in, fill the Nigeria bank account ----------
  const actx = await b.newContext({ viewport: { width: 1366, height: 860 } }), A = await actx.newPage(); A.on('pageerror', e => errs.push('admin: ' + e.message));
  await A.goto(BASE + 'admin.html'); await A.waitForTimeout(800);
  await A.selectOption('#loginForm select[name=country]', 'NG'); await A.fill('#loginForm input[name=who]', '0' + admin.phone); await A.fill('#loginForm input[name=password]', 'Strong123');
  await A.click('#loginForm button[type=submit]'); await A.waitForTimeout(2500);
  ok(await A.isVisible('#app') && (await A.textContent('#pageTitle')).trim() === 'Overview', 'admin signs in to the portal');
  ok(/Nigerian players cannot deposit yet/.test(await A.textContent('#main')), 'overview warns that Nigeria deposits are closed');
  await A.screenshot({ path: OUT + '/adm-1-overview.png' });
  await A.goto(BASE + 'admin.html#/paysettings'); await A.waitForTimeout(1500);
  await A.fill('input[name="NG.bank.bank"]', 'Test MFB'); await A.fill('input[name="NG.bank.number"]', '0123456789'); await A.fill('input[name="NG.bank.name"]', 'LETBETAFRIKA TEST'); await A.fill('input[name="NG.bank.note"]', 'Confirmed within 15 minutes, 7am–11pm');
  await A.click('#psSave'); await A.waitForTimeout(1500);
  ok(/Open – players see this account/.test(await A.textContent('#main')), 'bank account saved – Nigeria deposits open');
  ok(/Payment API connected – test mode/.test(await A.textContent('#main')), 'Ghana: payment API shown as connected (test mode)');
  await A.screenshot({ path: OUT + '/adm-2-paysettings.png', fullPage: true });

  // ---------- Nigerian player: bank transfer deposit ----------
  const pctx = await b.newContext({ ...devices['iPhone 13'] });
  await pctx.addInitScript(t => { try { sessionStorage.setItem('lba_splash', '1'); localStorage.setItem('lba_token', t); } catch {} }, ng.token);
  const P = await pctx.newPage(); P.on('pageerror', e => errs.push('player: ' + e.message));
  await P.goto(BASE + '#/deposit'); await P.waitForTimeout(3500);
  const page = await P.textContent('#page-deposit');
  ok(/Test MFB/.test(page) && /0123456789/.test(page) && /LETBETAFRIKA TEST/.test(page) && /LB0*\d+/.test(page), 'player sees the bank account and their reference');
  ok(!/Card|USSD|OPay|PalmPay/.test(await P.textContent('#depForm .wx-methods')), 'only bank transfer offered (no card / USSD / wallets)');
  await P.fill('#wlAmt', '5000'); await P.fill('input[name=sender]', 'ADA OBI'); await P.waitForTimeout(300);
  ok(/Add the screenshot of your transfer/.test(await P.textContent('#depBtn')) && await P.isDisabled('#depBtn'), 'asks for the screenshot of the transfer first');
  // a real picture (a screenshot of the bank details on the page) as the transfer screenshot
  const shotPng = await P.screenshot({ clip: { x: 0, y: 0, width: 360, height: 420 } });
  await P.setInputFiles('#proofFile', { name: 'transfer.png', mimeType: 'image/png', buffer: shotPng }); await P.waitForTimeout(1200);
  ok(await P.isVisible('.wx-proof-prev img'), 'the screenshot preview shows');
  ok(/I have sent ₦5,000/.test(await P.textContent('#depBtn')), 'button: "I have sent ₦5,000.00"');
  await P.screenshot({ path: OUT + '/ply-1-deposit.png', fullPage: true });
  await P.click('#depBtn'); await P.waitForTimeout(2200);
  ok(/Deposit being checked/.test(await P.textContent('#wlSheet')) && /Screenshot\s*Sent/.test(await P.textContent('#wlSheet')), 'player told the deposit is being checked – screenshot sent');
  await P.screenshot({ path: OUT + '/ply-2-checking.png' });

  // ---------- admin: confirm what arrived (₦4,500) ----------
  await A.goto(BASE + 'admin.html#/payments'); await A.waitForTimeout(1800);
  ok(/From ADA OBI/.test(await A.textContent('#main')), 'payments queue shows the sender name and reference');
  const dep0 = sql(`SELECT id FROM payments WHERE user_id='${ng.user.id}' AND kind='deposit' AND status='pending'`);
  await A.click(`#main [data-proof-view="${dep0}"]`); await A.waitForTimeout(1500);
  ok(await A.isVisible('#mProofBig img'), 'admin opens the transfer screenshot');
  await A.screenshot({ path: OUT + '/adm-3b-screenshot.png' });
  await A.click('#modalBody [data-close-modal]'); await A.waitForTimeout(300);
  await A.screenshot({ path: OUT + '/adm-3-payments.png' });
  const dep = sql(`SELECT id FROM payments WHERE user_id='${ng.user.id}' AND kind='deposit' AND status='pending'`);
  await A.click(`#main [data-pay="approve"][data-id="${dep}"]`); await A.waitForTimeout(500);
  await A.fill('#mAmt', '4500'); await A.waitForTimeout(1200);
  ok(/Credit ₦4,500/.test(await A.textContent('#mGo')), 'confirm button names the amount');
  ok(await A.isVisible('#mProof img'), 'the screenshot is in the confirm dialog');
  await A.click('#mGo'); await A.waitForTimeout(800);
  ok((await api('/wallet', null, ng.token)).balance === 0 && await A.isVisible('#mRef'), 'no transfer reference → not credited (no double credit possible)');
  await A.fill('#mRef', 'NIP-' + Date.now());
  await A.screenshot({ path: OUT + '/adm-4-confirm.png' });
  await A.click('#mGo'); await A.waitForTimeout(1500);
  ok((await api('/wallet', null, ng.token)).balance === 4500, 'player credited ₦4,500');
  await P.goto(BASE + '#/home'); await P.goto(BASE + '#/deposit'); await P.waitForTimeout(3000);
  ok(/Successful/.test(await P.textContent('#wxRecent')), 'player sees the deposit as successful');

  // ---------- ID check approved; withdrawal marked paid ----------
  await api('/auth/verify', { fullName: 'Ada Obi', dob: '1994-03-02', idType: 'NIN', idNumber: '12345678901' }, ng.token);
  await A.goto(BASE + 'admin.html#/kyc'); await A.waitForTimeout(1500);
  ok(/12345678901/.test(await A.textContent('#main')), 'ID check waiting with the ID details');
  await A.screenshot({ path: OUT + '/adm-5-kyc.png' });
  await A.click('#main [data-kyc="approve"]'); await A.waitForTimeout(400); await A.click('#mGo'); await A.waitForTimeout(1200);
  ok((await api('/auth/me', null, ng.token)).user.verified === true, 'ID approved');
  const lad = await api('/wallet/options', null, ng.token);
  ok(lad.ladder && lad.ladder.unlocked && lad.ladder.steps.length === 3, 'ID approved → Deposit 1 · 2 · 3 unlocked');
  ok((await api('/auth/notices', null, ng.token)).notices.some(x => x.kind === 'kyc_approved'), 'the player gets the “ID approved” pop-up');
  const w = await api('/wallet/withdraw', { amount: 2000, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Ada Obi' } }, ng.token);
  await A.goto(BASE + 'admin.html#/payments/pending:withdrawal'); await A.waitForTimeout(1500);
  await A.click(`#main [data-pay="approve"][data-id="${w.paymentId}"]`); await A.waitForTimeout(400);
  await A.fill('#mRef', 'NIP-445566'); await A.click('#mGo'); await A.waitForTimeout(1200);
  ok(sql(`SELECT status || ':' || (details->>'payoutRef') FROM payments WHERE id='${w.paymentId}'`) === 'success:NIP-445566', 'withdrawal marked paid with its reference');

  // ---------- Ghana player: MoMo through the payment API (mock) ----------
  const gctx = await b.newContext({ ...devices['iPhone 13'] });
  await gctx.addInitScript(t => { try { sessionStorage.setItem('lba_splash', '1'); localStorage.setItem('lba_token', t); localStorage.setItem('lba_country', 'GH'); } catch {} }, gh.token);
  const G = await gctx.newPage(); G.on('pageerror', e => errs.push('gh: ' + e.message));
  await G.goto(BASE + '#/deposit'); await G.waitForTimeout(3500);
  await G.fill('#wlAmt', '50'); await G.waitForTimeout(300);
  await G.click('#depBtn'); await G.waitForTimeout(2500);
  ok(/Approve on your phone/.test(await G.textContent('#wlSheet')), 'Ghana: approve the prompt on your phone');
  await G.screenshot({ path: OUT + '/gh-1-approve.png' });
  const ref = sql(`SELECT provider_ref FROM payments WHERE user_id='${gh.user.id}' AND kind='deposit' ORDER BY created_at DESC LIMIT 1`);
  await fetch(MOCK + '/__approve/' + ref, { method: 'POST' }); await G.waitForTimeout(4500);
  ok(/Deposit successful/.test(await G.textContent('#wlSheet')), 'Ghana: deposit successful once approved');
  await G.screenshot({ path: OUT + '/gh-2-done.png' });
  const gw = await api('/wallet/withdraw', { amount: 20, method: 'mobile_money', details: { phone: gh.phone, network: 'mtn', name: 'Kofi Mensah' } }, gh.token);
  await A.goto(BASE + 'admin.html#/payments/pending:withdrawal'); await A.click('#refreshBtn'); await A.waitForTimeout(1800);   // same page as before: refresh the list
  await A.click(`#main [data-payout="${gw.paymentId}"]`); await A.waitForTimeout(400); await A.click('#mGo'); await A.waitForTimeout(2000);
  ok(sql(`SELECT status FROM payments WHERE id='${gw.paymentId}'`) === 'success', 'Ghana payout sent through the API and confirmed');

  // ---------- the rest of the portal renders ----------
  await A.goto(BASE + 'admin.html#/settings'); await A.waitForTimeout(1500);
  ok(/Deposit bonuses 1 · 2 · 3/.test(await A.textContent('#main')) && (await A.inputValue('[data-lad="NG.0.pct"]')) === '200', 'settings: Deposit 1 · 2 · 3 card with the % per deposit');
  await A.fill('[data-lad="NG.1.pct"]', '120'); await A.click('#ladSave'); await A.waitForTimeout(1200);
  ok(sql(`SELECT value->'NG'->1->>'pct' FROM settings WHERE key='deposit_bonuses'`) === '120', 'the admin changes Deposit 2 to 120%');
  await A.screenshot({ path: OUT + '/adm-10-ladder-settings.png', fullPage: true });
  for (const pg of ['overview', 'players', 'bets', 'trading', 'finance', 'games', 'jackpot', 'settings', 'email', 'audit']) {
    await A.goto(BASE + 'admin.html#/' + pg); await A.waitForTimeout(1300);
    const txt = await A.textContent('#main');
    ok(!/Could not load this page/.test(txt), `portal page ${pg} loads`);
  }
  await A.goto(BASE + 'admin.html#/overview'); await A.waitForTimeout(1500);
  await A.click('[data-occ="GH"]'); await A.waitForTimeout(1500);
  ok(/GH₵/.test(await A.textContent('#main .g-kpi')), 'overview switches to Ghana cedis');
  await A.screenshot({ path: OUT + '/adm-6-overview-gh.png' });
  await A.goto(BASE + 'admin.html#/audit'); await A.waitForTimeout(1500);
  ok(/Changed payment settings/.test(await A.textContent('#main')) && /Confirmed deposit/.test(await A.textContent('#main')), 'audit log reads in plain words');
  await A.screenshot({ path: OUT + '/adm-7-audit.png' });
  await A.goto(BASE + 'admin.html#/players'); await A.waitForTimeout(1200);
  await A.click(`#main [data-user="${ng.user.id}"]`); await A.waitForTimeout(1500);
  ok(/Deposit reference/.test(await A.textContent('#drawerBody')), 'player drawer shows the deposit reference and ID check');
  await A.screenshot({ path: OUT + '/adm-8-player.png' });
  // support: the player says their deposit is not showing – add it from their profile
  const before = (await api('/wallet', null, ng.token)).balance;
  await A.click('#drawerBody [data-add-dep]'); await A.waitForTimeout(500);
  await A.fill('#dAmt', '1000'); await A.fill('#dRef', 'NIP-SUPPORT-1'); await A.fill('#dNote', 'Player messaged support'); await A.waitForTimeout(200);
  ok(/Credit ₦1,000\.00 now/.test(await A.textContent('#mGo')), 'support: Add deposit on the player profile names the amount');
  await A.screenshot({ path: OUT + '/adm-8b-add-deposit.png' });
  await A.click('#mGo'); await A.waitForTimeout(1800);
  ok((await api('/wallet', null, ng.token)).balance === before + 1000, 'support deposit credited to the player');
  ok(/Added by support/.test(await A.textContent('#drawerBody')) || /NIP-SUPPORT-1/.test(sql(`SELECT details->>'transferRef' FROM payments WHERE user_id='${ng.user.id}' AND details->>'source'='support'`)), 'recorded as added by support with its transfer reference');
  await A.click('#drawerBody [data-add-dep]'); await A.waitForTimeout(500);
  await A.fill('#dAmt', '1000'); await A.fill('#dRef', 'nip-support-1'); await A.click('#mGo'); await A.waitForTimeout(1200);
  ok(/already used/.test(await A.textContent('#dErr')), 'the same transfer reference is refused (no double credit)');
  await A.click('#modalBody [data-close-modal]'); await A.waitForTimeout(300);
  // support asks the Nigerian player to deposit → a pop-up when they open the app → the deposit page with the amount filled in
  await A.click('#drawerBody [data-req-dep]'); await A.waitForTimeout(400);
  await A.fill('#rAmt', '5000'); await A.fill('#rNote', 'Please use the account below – we confirm it quickly.');
  await A.screenshot({ path: OUT + '/adm-8c-request.png' });
  await A.click('#mGo'); await A.waitForTimeout(1500);
  ok(/Deposit request/.test(await A.textContent('#drawerBody')), 'the profile shows the open deposit request');
  await P.goto(BASE + '?open=1#/home'); await P.waitForSelector('#wlSheet.open .nt', { timeout: 15000 }).catch(() => {});
  const pop = await P.textContent('#wlSheet').catch(() => '');
  ok(!/undefined|NaN/.test(pop) && /Complete your deposit/.test(pop) && /₦5,000\.00/.test(pop) && /Please use the account below/.test(pop), 'Nigeria: pop-up when the player opens the app, with the amount and support’s message');
  ok(/Test MFB/.test(pop) && /0123456789/.test(pop) && /LB\d+/.test(pop) && /I have sent it/.test(pop), 'the pop-up shows the bank account, their reference and the steps');
  await P.screenshot({ path: OUT + '/ply-3-request-popup.png' });
  await P.click('[data-nt-go]'); await P.waitForTimeout(2000);
  ok(P.url().includes('#/deposit/transfer') && (await P.inputValue('#wlAmt')) === '5000', 'Deposit now opens the bank transfer page with ₦5,000 filled in');
  // Deposit 1 was made after the ID check (the support deposit) → marked ✓; the sticky bar offers Deposit 2
  ok(/✓ Done/.test(await P.textContent('.wx-ladder')) && /1 of 3 done/.test(await P.textContent('.wx-ladder')), 'deposit page: Deposit 1 marked done (1 of 3)');
  await P.goto(BASE + '#/home'); await P.waitForTimeout(2500);
  // earlier pop-ups waiting for this player (deposit confirmed, withdrawal paid…) show one by one – close them
  for (let i = 0; i < 8 && await P.isVisible('#wlSheet.open'); i++) { await P.click('#wlSheet.open [data-close-sheet]'); await P.waitForTimeout(1500); }
  ok(await P.isVisible('#ladBar') && /Deposit 2 of 3/.test(await P.textContent('#ladBar')), 'sticky bar: "Deposit 2 of 3" with a Deposit button');
  await P.screenshot({ path: OUT + '/ply-4-sticky-bar.png' });
  await P.goto(BASE + '#/sports'); await P.waitForTimeout(800);
  ok(await P.isVisible('#ladBar'), 'the bar stays while browsing');
  await P.click('#ladBar .lb-in'); await P.waitForTimeout(1200);
  ok(P.url().includes('#/deposit') && !(await P.isVisible('#ladBar')), 'the bar opens the deposit page (and hides there)');
  // the admin's tracker: players with deposits left first, each step marked
  await A.goto(BASE + 'admin.html#/ladder'); await A.waitForTimeout(1800);
  const trk = await A.textContent('#main');
  ok(/Deposits left/.test(trk) && /1 of 3 done/.test(trk) && /Ada Obi/.test(trk) && /✓ ₦1,000\.00/.test(trk), 'tracker: the player with Deposit 1 ✓ and deposits left');
  await A.screenshot({ path: OUT + '/adm-11-ladder-tracker.png' });
  await A.click(`#main [data-lad-req="${ng.user.id}"]`); await A.waitForTimeout(500);
  ok(/Deposit 2 bonus is waiting/.test(await A.inputValue('#rNote')), 'Request deposit from the tracker names the next step');
  await A.click('#modalBody [data-close-modal]'); await A.waitForTimeout(300);
  // Ghana: the MoMo steps, then Mobile Money with the amount filled in
  await api(`/admin/users/${gh.user.id}/deposit-request`, { amount: 50 }, admin.token);
  await G.goto(BASE + '?open=1#/home'); await G.waitForSelector('#wlSheet.open .nt', { timeout: 15000 }).catch(() => {});
  const gpop = await G.textContent('#wlSheet').catch(() => '');
  ok(!/undefined|NaN/.test(gpop) && /Complete your deposit/.test(gpop) && /GH₵50\.00/.test(gpop) && /Approve the prompt on your phone/.test(gpop), 'Ghana: pop-up with the MoMo steps');
  await G.screenshot({ path: OUT + '/gh-3-request-popup.png' });
  await G.click('[data-nt-go]'); await G.waitForTimeout(2000);
  ok(G.url().includes('#/deposit/momo') && (await G.inputValue('#wlAmt')) === '50', 'Deposit now opens Mobile Money with GH₵50 filled in');
  // phone-sized portal
  await A.setViewportSize({ width: 390, height: 844 }); await A.goto(BASE + 'admin.html#/payments'); await A.waitForTimeout(1500);
  await A.screenshot({ path: OUT + '/adm-9-phone.png' });
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
