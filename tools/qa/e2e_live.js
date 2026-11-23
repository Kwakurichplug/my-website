// Live-mode walk: the page is served by the API server and every action hits the real endpoints.
const { chromium, devices } = require('playwright');
const S = process.argv[2];
const URL = 'http://127.0.0.1:8080/';
let failures = 0;
const expect = (c, m) => { if (!c) { failures++; console.log('  ✗ FAIL:', m); } else console.log('  ✓', m); };
const log = (...a) => console.log('•', ...a);
const shot = (p, n) => p.screenshot({ path: `${S}/e2e/live-${n}.png`, fullPage: true });
const api = async (path, body, token) => {
  const r = await fetch(URL + 'api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};
async function codeFromToast(p) {
  await p.waitForFunction(() => /Test code: \d{6}/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  return (await p.textContent('#toast')).match(/(\d{6})/)[1];
}
const rnd = () => '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);

(async () => {
  // withdrawals only after Deposit 1, 2, 3 (settings 'withdrawals'): a helper admin opens them for every player for this test
  {
    const ph = rnd(), oo = await api('/auth/otp', { country: 'NG', phone: ph, purpose: 'register' });
    const ad = await api('/auth/register', { country: 'NG', phone: ph, code: oo.devCode, password: 'Admin1234' });
    require('child_process').execFileSync('psql', [process.argv[3] || 'postgres://postgres@127.0.0.1:5433/letbet', '-Atc', `UPDATE users SET role='admin' WHERE id='${ad.user.id}'`]);
    await fetch(URL + 'api/admin/settings/withdrawals', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ad.token }, body: JSON.stringify({ value: { suspended: false, requireDeposits: false, message: '' } }) });
  }
  // a second player to receive a transfer
  const friend = rnd();
  const o = await api('/auth/otp', { country: 'NG', phone: friend, purpose: 'register' });
  const fr = await api('/auth/register', { country: 'NG', phone: friend, code: o.devCode, password: 'Friend123' });
  const me = rnd();

  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '#/home'); await p.waitForTimeout(2500);
  expect(await p.evaluate(() => document.documentElement.dataset.live === '1'), 'front end runs in live mode');

  log('Register (live)');
  await p.goto(URL + '#/register'); await p.waitForTimeout(500);
  await p.fill('#regForm [name=phone]', '0' + me); await p.fill('#regForm [name=pw]', 'Strong123'); await p.check('#regForm [name=agree]');
  await p.click('#regBtn');
  // a code at sign-up only when the server asks for one (SIGNUP_CODE=on → GET /api/auth/methods signupCode)
  if ((await api('/auth/methods')).signupCode) {
    const code = await codeFromToast(p);
    await p.waitForSelector('#otpBoxes');
    await p.fill('#otpBoxes input >> nth=0', code === '000000' ? '111111' : '000000'); await p.waitForTimeout(1200);
    expect(await p.isVisible('#otpErr'), 'server rejects a wrong code');
    await p.fill('#otpBoxes input >> nth=0', code);
  }
  await p.waitForSelector('.au-done', { timeout: 8000 });
  expect(true, 'server creates the account');
  const token = await p.evaluate(() => localStorage.getItem('lba_token'));
  expect(!!token, 'session token stored');

  log('Deposit (live)');
  await p.goto(URL + '#/deposit/transfer'); await p.waitForTimeout(800);
  await shot(p, 'deposit');
  await p.fill('#wlAmt', '5000'); await p.fill('input[name=sender]', 'Test Player'); await p.click('#depBtn');
  await p.waitForSelector('.wl-res', { timeout: 10000 });
  expect((await p.textContent('.wl-res')).includes('Deposit successful'), 'deposit succeeds through the API');
  let w = await api('/wallet', null, token);
  expect(w.balance === 5000, 'server balance is 5000 (got ' + w.balance + ')');
  await p.click('.wl-res [data-close-sheet]');

  log('Withdraw (live)');
  await p.goto(URL + '#/withdraw'); await p.waitForTimeout(600);
  expect(await p.isVisible('.wl-verify'), 'asks for ID before withdrawing');
  await p.click('.wl-verify'); await p.waitForTimeout(500);
  await p.fill('[data-acform=verify] [name=name]', 'Ada Obi'); await p.fill('[data-acform=verify] [name=dob]', '1990-01-01'); await p.fill('[data-acform=verify] [name=idn]', '12345678901');
  await p.click('[data-acform=verify] button'); await p.waitForTimeout(1500);
  expect(p.url().includes('#/withdraw'), 'returns to withdraw after submitting ID');
  expect((await p.textContent('#page-withdraw')).includes('ID check in progress'), 'shows ID check in progress');
  await p.click('#addBank'); await p.selectOption('#bankForm [name=bank]', 'GTBank'); await p.fill('#bankForm [name=acct]', '0123456789');
  await p.fill('#bankForm [name=name]', 'Ada Obi'); await p.click('#bankSave'); await p.waitForTimeout(300);
  await p.fill('#wlAmt', '1000'); await p.click('#wdBtn'); await p.click('.wl-sheet [data-yes]');
  await p.waitForSelector('.wl-res', { timeout: 10000 });
  expect((await p.textContent('.wl-res')).includes('Withdrawal submitted'), 'withdrawal request accepted by the API');
  await shot(p, 'withdraw-done');
  const pays = await api('/wallet/payments', null, token);
  expect(pays.payments.some(x => x.kind === 'withdrawal' && x.status === 'pending' && +x.amount === 1000), 'pending withdrawal stored on the server');
  await p.click('.wl-res [data-close-sheet]');

  log('Transfer to friend (live)');
  await p.goto(URL + '#/withdraw/friend'); await p.waitForTimeout(500);
  await p.fill('#wdForm [name=to]', '08000000001'); await p.fill('#wlAmt', '100'); await p.click('#wdBtn'); await p.click('.wl-sheet [data-yes]');
  await p.waitForSelector('.wl-res', { timeout: 10000 });
  expect((await p.textContent('.wl-res')).includes('Not completed') && (await p.textContent('.wl-res')).includes('No account'), 'unknown recipient rejected by server');
  await p.click('.wl-res [data-close-sheet]');
  await p.fill('#wdForm [name=to]', '0' + friend); await p.fill('#wlAmt', '700'); await p.click('#wdBtn'); await p.click('.wl-sheet [data-yes]');
  await p.waitForSelector('.wl-res', { timeout: 10000 });
  expect((await p.textContent('.wl-res')).includes('Money sent'), 'transfer to a real player succeeds');
  const fw = await api('/wallet', null, fr.token);
  expect(fw.balance === 700, 'friend balance is 700 (got ' + fw.balance + ')');
  w = await api('/wallet', null, token);
  expect(w.balance === 3300, 'my balance is 3300 (got ' + w.balance + ')');
  await p.click('.wl-res [data-close-sheet]');

  log('Transactions (live)');
  await p.goto(URL + '#/acct/tx'); await p.waitForTimeout(2500);
  const txt = await p.textContent('#acBody');
  expect(txt.includes('Transfer to friend') && txt.includes('Deposit') && txt.includes('Withdrawal'), 'records list deposit, withdrawal and transfer');
  await shot(p, 'tx');

  log('Logout / login / reset (live)');
  await p.goto(URL + '#/me'); await p.waitForTimeout(500); await p.click('#logoutBtn button'); await p.waitForTimeout(500);
  await p.goto(URL + '#/login'); await p.waitForTimeout(500);
  await p.fill('#loginForm [name=phone]', '0' + me); await p.fill('#loginForm [name=pw]', 'Wrong999'); await p.click('#loginBtn'); await p.waitForTimeout(1200);
  expect((await p.textContent('#loginErr')).includes('Incorrect'), 'wrong password rejected by server');
  await p.goto(URL + '#/forgot'); await p.waitForTimeout(400);
  await p.fill('#fpForm [name=phone]', '0' + me); await p.click('#fpBtn');
  const code2 = await codeFromToast(p); await p.waitForSelector('#otpBoxes');
  await p.fill('#otpBoxes input >> nth=0', code2); await p.waitForTimeout(800);
  await p.fill('#fpForm [name=pw1]', 'Changed99'); await p.fill('#fpForm [name=pw2]', 'Changed99'); await p.click('#fpBtn'); await p.waitForTimeout(1500);
  expect(p.url().includes('#/login'), 'password reset through the API');
  await p.fill('#loginForm [name=pw]', 'Changed99'); await p.click('#loginBtn'); await p.waitForTimeout(2000);
  expect((await p.textContent('#authArea')).includes('3,300'), 'logged back in with the new password, balance 3,300');
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('lba_NG_prefs_' + document.querySelector('#meName')?.textContent.replace(/\D/g, '').slice(3)) || '{"banks":[]}').banks.length) === 1, 'saved bank kept on this device');

  log('Betting still works (live)');
  await p.goto(URL + '#/home'); await p.waitForTimeout(1500);
  const odds = await p.$$('#page-home [data-mid]');
  await odds[0].click(); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#slipPill, #navSlip')?.click()); await p.waitForTimeout(500);
  await p.fill('#bsStake', '200'); await p.click('#bsPlace'); await p.waitForTimeout(2500);
  const bets = await api('/bets?status=open', null, await p.evaluate(() => localStorage.getItem('lba_token')));
  expect(bets.bets && bets.bets.length === 1, 'bet placed on the server');

  expect(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
