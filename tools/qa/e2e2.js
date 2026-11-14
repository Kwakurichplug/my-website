// End-to-end walk through the new account pages. Usage: node e2e.js <scratchdir>
const { chromium, devices } = require('playwright');
const S = process.argv[2];
const URL = 'file:///home/user/my-website/betting/index.html';
const shot = async (p, n) => p.screenshot({ path: `${S}/e2e/${n}.png`, fullPage: true });
const log = (...a) => console.log('•', ...a);
let failures = 0;
const expect = (cond, msg) => { if (!cond) { failures++; console.log('  ✗ FAIL:', msg); } else console.log('  ✓', msg); };

async function otpFromToast(p) {
  await p.waitForFunction(() => /code is \d{6}/.test(document.querySelector('#toast').textContent));
  const t = await p.textContent('#toast');
  return t.match(/(\d{6})/)[1];
}

(async () => {
  require('fs').mkdirSync(`${S}/e2e`, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text())) errs.push(m.text()); });
  // skip splash
  await p.goto(URL + '#/home');
  await p.evaluate(() => { sessionStorage.setItem('lba_splash', '1'); localStorage.clear(); localStorage.setItem('lba_country', 'NG'); });
  await p.goto(URL + '#/home'); await p.waitForTimeout(3500);

  // ---------- Register (NG) ----------
  log('Register');
  await p.click('text=Join Now'); await p.waitForTimeout(400);
  expect(p.url().includes('#/register'), 'Join Now opens the register page');
  await shot(p, '01-register-empty');
  expect(await p.isDisabled('#regBtn'), 'Create Account disabled while empty');
  await p.fill('#regForm [name=phone]', '08031234567');
  await p.fill('#regForm [name=pw]', 'weak');
  expect((await p.$$('.au-rules li.ok')).length === 1, 'only "lower case" rule ticks for "weak"');
  await p.fill('#regForm [name=pw]', 'Strong123');
  await p.check('#regForm [name=agree]');
  expect((await p.$$('.au-rules li.ok')).length === 4, 'all 4 password rules tick');
  expect(!(await p.isDisabled('#regBtn')), 'Create Account enabled when valid');
  await shot(p, '02-register-filled');
  await p.click('#regBtn');
  const code = await otpFromToast(p);
  await p.waitForSelector('#otpBoxes'); await shot(p, '03-otp');
  await p.fill('#otpBoxes input >> nth=0', '111111'); await p.waitForTimeout(800);
  expect(await p.isVisible('#otpErr'), 'wrong code shows an error');
  await p.fill('#otpBoxes input >> nth=0', code); await p.waitForTimeout(1200);
  expect(await p.isVisible('.au-done'), 'correct code creates the account');
  await shot(p, '04-register-done');

  // ---------- Deposit: card ----------
  log('Deposit card');
  await p.click('.au-done a[href="#/deposit"]'); await p.waitForTimeout(500);
  expect(p.url().includes('#/deposit'), 'Deposit Now opens deposit page');
  expect(await p.isVisible('.wx-bonus'), 'first-deposit welcome bonus banner shown');
  await shot(p, '05-deposit-card');
  await p.click('[data-set="1000"]');
  expect(await p.inputValue('#wlAmt') === '1000', 'quick amount chip sets the amount (1000)');
  expect((await p.textContent('#wlHint')).includes('welcome bonus'), 'first-deposit bonus hint shown');
  expect((await p.textContent('#depBtn')).includes('Deposit ₦1,000.00'), 'button shows the amount');
  expect(!(await p.$('#page-deposit [name=num]')), 'no card number fields on our page (the payment partner takes them)');
  await p.click('#depBtn'); await p.waitForSelector('.wl-res', { timeout: 6000 }); await shot(p, '07-deposit-success');
  expect((await p.textContent('.wl-res')).includes('Deposit successful'), 'card deposit succeeds');
  expect((await p.textContent('.wl-res')).includes('Welcome bonus'), 'welcome bonus shown on the first deposit');
  await p.click('.wl-res [data-close-sheet]'); await p.waitForTimeout(300);
  expect((await p.textContent('#wxRecent')).includes('+₦1,000.00'), 'recent deposits list shows it');
  expect(!(await p.isVisible('.wx-bonus')), 'bonus banner gone after the first deposit');

  // ---------- other NG methods ----------
  for (const t of ['transfer', 'ussd', 'opay', 'palmpay']) { await p.click(`[data-method="${t}"]`); await p.waitForTimeout(400); await shot(p, `08-deposit-${t}`); }
  expect(!(await p.evaluate(() => /TEST|SOON|Simulate|pretend|LetBet Wallet/.test(document.querySelector('#page-deposit').textContent))), 'no test or placeholder wording on the deposit page');
  log('Deposit USSD');
  await p.click('[data-method="ussd"]'); await p.waitForTimeout(300);
  await p.fill('#wlAmt', '2000'); await p.waitForTimeout(100);
  expect((await p.textContent('#depBtn')).includes('Select your bank') && await p.isDisabled('#depBtn'), 'USSD asks for the bank first');
  await p.selectOption('[name=bank]', 'GTBank'); await p.click('#depBtn'); await p.waitForSelector('.wl-res', { timeout: 6000 });
  await p.click('.wl-res [data-close-sheet]');
  log('Deposit OPay');
  await p.click('[data-method="opay"]'); await p.waitForTimeout(300);
  await p.fill('#wlAmt', '50'); await p.waitForTimeout(100);
  expect(await p.isDisabled('#depBtn') && (await p.textContent('#wlHint')).includes('Minimum'), 'below minimum blocked');
  await p.fill('#wlAmt', '3000'); await p.click('#depBtn'); await p.waitForSelector('.wl-res', { timeout: 6000 });
  await p.click('.wl-res [data-close-sheet]'); await p.waitForTimeout(300);
  expect((await p.textContent('.wx-hero-amt')).includes('6,000.00'), 'balance card shows 1,000 + 2,000 + 3,000');

  // ---------- Withdraw (NG) ----------
  log('Withdraw NG');
  await p.goto(URL + '#/withdraw'); await p.waitForTimeout(500);
  await shot(p, '09-withdraw-unverified');
  expect(await p.isVisible('.wl-verify'), 'unverified users see the verify prompt');
  expect((await p.textContent('#wdBtn')).includes('Verify your ID'), 'the button says to verify first');
  await p.click('.wl-verify'); await p.waitForTimeout(400);
  await p.fill('[data-acform=verify] [name=name]', 'Chinedu Okafor'); await p.fill('[data-acform=verify] [name=dob]', '1995-04-02'); await p.fill('[data-acform=verify] [name=idn]', '12345678901');
  await p.click('[data-acform=verify] button'); await p.waitForTimeout(600);
  expect(p.url().includes('#/withdraw'), 'after verifying, user returns to withdraw');
  await p.click('#addBank'); await p.selectOption('#bankForm [name=bank]', 'GTBank'); await p.fill('#bankForm [name=acct]', '0123456789');
  expect((await p.inputValue('#bankForm [name=name]')) === 'Chinedu Okafor', 'account name prefilled with the verified name');
  await shot(p, '10-add-bank');
  await p.click('#bankSave'); await p.waitForTimeout(400);
  expect((await p.textContent('.wx-accts')).includes('CHINEDU OKAFOR'), 'saved account listed');
  await p.click('[data-frac="0.5"]'); await shot(p, '11-withdraw-bank');
  const balBefore = await p.textContent('.wx-hero-amt');
  await p.click('#wdBtn'); await p.waitForSelector('.wl-sheet [data-yes]'); await shot(p, '12-withdraw-confirm');
  await p.click('.wl-sheet [data-yes]'); await p.waitForSelector('.wl-res', { timeout: 5000 }); await shot(p, '13-withdraw-submitted');
  expect((await p.textContent('.wl-res')).includes('Processing'), 'withdrawal shows Processing');
  await p.click('.wl-res [data-close-sheet]'); await p.waitForTimeout(300);
  expect((await p.textContent('.wx-hero-amt')) !== balBefore, 'balance reduced');
  expect((await p.textContent('#wxRecent')).includes('Processing'), 'recent withdrawals shows it as Processing');
  await p.waitForTimeout(6500);
  await p.goto(URL + '#/acct/tx'); await p.waitForTimeout(500); await shot(p, '14-transactions');
  expect((await p.textContent('#acBody')).includes('Successful'), 'withdrawal later marked Successful');

  log('Transfer to friend');
  await p.goto(URL + '#/withdraw/friend'); await p.waitForTimeout(400);
  await p.fill('#wdForm [name=to]', '08031234567'); await p.waitForTimeout(100);
  expect((await p.textContent('#friendName')).includes('yourself'), 'cannot send to own number');
  await p.fill('#wdForm [name=to]', '08099998888'); await p.waitForTimeout(100);
  expect(await p.isDisabled('#wdBtn') && (await p.textContent('#friendName')).includes('No LetBetAfrika account'), 'unregistered friend blocked');
  await p.evaluate(() => { const a = JSON.parse(localStorage.getItem('lba_NG_accounts')); a['8099998888'] = { h: 'x', profile: { phone: '8099998888', balance: 0, uid: 1 } }; localStorage.setItem('lba_NG_accounts', JSON.stringify(a)); });
  await p.fill('#wdForm [name=to]', '08099998887'); await p.fill('#wdForm [name=to]', '08099998888'); await p.fill('#wlAmt', '500'); await shot(p, '15-friend');
  await p.click('#wdBtn'); await p.click('.wl-sheet [data-yes]'); await p.waitForSelector('.wl-res', { timeout: 5000 });
  expect((await p.textContent('.wl-res')).includes('Money sent'), 'transfer to friend works');
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('lba_NG_accounts'))['8099998888'].profile.balance === 500), 'friend received the money');
  await p.click('.wl-res [data-close-sheet]');

  // ---------- Logout / login / forgot ----------
  log('Login + forgot password');
  await p.goto(URL + '#/me'); await p.waitForTimeout(400); await p.click('#logoutBtn button'); await p.waitForTimeout(300);
  await p.goto(URL + '#/deposit'); await p.waitForTimeout(500);
  expect(p.url().includes('#/login/deposit'), 'deposit while logged out → login');
  await shot(p, '16-login');
  expect(await p.inputValue('#loginForm [name=phone]') === '8031234567', 'Remember me pre-fills number');
  await p.fill('#loginForm [name=pw]', 'Wrong123'); await p.click('#loginBtn'); await p.waitForTimeout(900);
  expect(await p.isVisible('#loginErr'), 'wrong password rejected');
  await p.click('text=Forgot Password?'); await p.waitForTimeout(300);
  await p.fill('#fpForm [name=phone]', '8031234567'); await p.click('#fpBtn');
  const code2 = await otpFromToast(p); await p.waitForSelector('#otpBoxes');
  await p.fill('#otpBoxes input >> nth=0', code2); await p.waitForTimeout(1200);
  await p.fill('#fpForm [name=pw1]', 'NewPass99'); await p.fill('#fpForm [name=pw2]', 'NewPass99'); await shot(p, '17-reset');
  await p.click('#fpBtn'); await p.waitForTimeout(1000);
  await p.fill('#loginForm [name=pw]', 'NewPass99'); await p.click('#loginBtn'); await p.waitForTimeout(1000);
  expect(p.url().includes('#/home'), 'login with new password works');
  expect((await p.textContent('#authArea')).includes('Balance'), 'header shows balance after login');
  expect(await p.evaluate(() => JSON.parse(localStorage.getItem('lba_NG_prefs_8031234567')).banks.length === 1), 'saved bank account kept after logout/login');

  // ---------- Ghana ----------
  log('Ghana');
  await p.evaluate(() => localStorage.setItem('lba_country', 'GH'));
  await p.reload(); await p.waitForTimeout(800); await p.goto(URL + '#/login'); await p.waitForTimeout(500);
  await p.fill('#loginForm [name=phone]', '0241234567'); await p.fill('#loginForm [name=pw]', 'x'); await p.click('#loginBtn'); await p.waitForTimeout(1000);
  await p.goto(URL + '#/deposit'); await p.waitForTimeout(500); await shot(p, '18-gh-momo');
  expect(await p.$eval('input[name=prov][value=mtn]', e => e.checked), 'MTN detected from the 024 number');
  await p.click('[data-set="20"]'); await p.click('#depBtn'); await p.waitForSelector('.wl-res', { timeout: 6000 });
  await shot(p, '19-gh-momo-done');
  expect((await p.textContent('.wl-res')).includes('Mobile Money'), 'mobile money deposit succeeds');
  await p.click('.wl-res [data-close-sheet]');
  await p.click('[data-method="card"]'); await p.waitForTimeout(300); await shot(p, '20-gh-deposit-card');
  await p.goto(URL + '#/withdraw/bank'); await p.waitForTimeout(400); await shot(p, '21-gh-withdraw-bank');
  expect(await p.isVisible('#addBank'), 'Ghana players can withdraw to a bank account');
  await p.goto(URL + '#/withdraw/momo'); await p.waitForTimeout(400); await shot(p, '22-gh-withdraw-momo');

  // ---------- desktop ----------
  const d = await b.newPage({ viewport: { width: 1366, height: 900 } });
  d.on('pageerror', e => errs.push('desktop: ' + e.message));
  await d.goto(URL + '#/home'); await d.evaluate(() => { sessionStorage.setItem('lba_splash', '1'); localStorage.setItem('lba_country', 'NG'); }); await d.reload(); await d.waitForTimeout(800);
  for (const r of ['register', 'deposit', 'withdraw']) { await d.goto(URL + '#/' + r); await d.waitForTimeout(700); await d.screenshot({ path: `${S}/e2e/30-desktop-${r}.png` }); }
  // horizontal overflow check on phone
  const ov = [];
  for (const r of ['register', 'login', 'forgot', 'deposit/card', 'deposit/momo', 'withdraw/bank', 'withdraw/momo', 'withdraw/friend']) {
    await p.goto(URL + '#/' + r); await p.waitForTimeout(250);
    if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) ov.push(r);
  }
  expect(!ov.length, 'no horizontal scrolling on phone' + (ov.length ? ': ' + ov.join(', ') : ''));
  expect(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
