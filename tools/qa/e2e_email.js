// Sign up, log in, reset password and add an email – with an EMAIL address, in the real UI.
//   node e2e_email.js <outDir> <baseUrl|file://…/index.html> [mailboxDir]
// Live test mode: codes come from the "Test code" toast. With a mailboxDir (an SMTP sink that writes .eml files,
// server in production mode) codes are read from the delivered emails, exactly as a player would.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [, , OUT = '.', BASE, MAILBOX] = process.argv;
const LIVE = BASE.startsWith('http');
let failures = 0;
const expect = (c, m) => { if (!c) { failures++; console.log('  ✗ FAIL:', m); } else console.log('  ✓', m); };
const log = m => console.log('•', m);
const tag = Date.now().toString(36);
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const go = async (h, w = 900) => { await p.goto(BASE + '#/' + h); await p.waitForTimeout(w); };
  const codeFor = async email => {
    if (MAILBOX) {
      for (let i = 0; i < 50; i++) {
        const hit = fs.readdirSync(MAILBOX).sort().reverse().map(f => fs.readFileSync(MAILBOX + '/' + f, 'utf8')).find(m => m.includes(email) && /is your LetBetAfrika code/.test(m) && !m.includes('X-Used'));
        if (hit) { const c = hit.match(/^Subject: (\d{6})/m)[1]; return c; }
        await p.waitForTimeout(200);
      }
      throw new Error('no email for ' + email);
    }
    await p.waitForFunction(() => /code(?: is)?:? (\d{6})/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
    return (await p.textContent('#toast')).match(/(\d{6})/)[1];
  };
  const typeCode = async c => { await p.waitForSelector('#otpBoxes'); await p.fill('#otpBoxes input >> nth=0', c); };
  const email = `e2e.${tag}@example.com`;
  await go('home', 2500);
  if (!LIVE) await p.evaluate(() => localStorage.clear());

  log('Sign up with email');
  await go('register');
  const tabs = await p.$$eval('.au-via [data-via]', l => l.map(x => x.dataset.via));
  if (MAILBOX) expect(!tabs.length && await p.$('#regForm [name=email]'), 'production without SMS: only the email form is offered');
  else { expect(tabs.join() === 'phone,email', 'Mobile Number | Email switch shown'); await p.click('.au-via [data-via=email]'); }
  await p.screenshot({ path: `${OUT}/email-register.png` });
  await p.fill('#regForm [name=email]', email.toUpperCase()); await p.fill('#regForm [name=pw]', 'Strong123'); await p.check('#regForm [name=agree]');
  expect(!(await p.$eval('#regBtn', x => x.disabled)), 'Create Account enabled for a valid email + password');
  await p.click('#regBtn');
  const c1 = await codeFor(email);
  expect((await p.textContent('#otpForm')).includes(email), 'code screen names the email address');
  await p.screenshot({ path: `${OUT}/email-code.png` });
  await typeCode(c1);
  await p.waitForSelector('.au-done', { timeout: 10000 });
  expect((await p.textContent('.au-done')).includes(email), 'welcome screen shows the email account');
  await go('me', 1200);
  expect((await p.textContent('#meName')).includes(email), 'Me header shows the email');

  log('Log out, log in with email');
  await p.evaluate(() => document.querySelector('#logoutBtn').click()); await p.waitForTimeout(500);
  await go('login');
  expect(await p.$eval('.au-via [data-via=email]', x => x.classList.contains('on')), 'login remembers the email method');
  expect((await p.inputValue('#loginForm [name=email]')) === email, 'remembered email prefilled');
  await p.fill('#loginForm [name=pw]', 'Wrong999'); await p.click('#loginBtn'); await p.waitForTimeout(900);
  if (LIVE) expect((await p.textContent('#loginErr')).includes('Incorrect email or password'), 'wrong password refused');
  await p.fill('#loginForm [name=pw]', 'Strong123'); await p.click('#loginBtn'); await p.waitForTimeout(1500);
  expect((await p.textContent('#authArea')).includes('Balance') || (await p.textContent('#authArea')).includes('₦'), 'logged in with email');

  log('Forgot password by email');
  await p.evaluate(() => document.querySelector('#logoutBtn').click()); await p.waitForTimeout(500);
  await go('forgot');
  if (await p.$('.au-via [data-via=email]')) await p.click('.au-via [data-via=email]');
  await p.fill('#fpForm [name=email]', email); await p.click('#fpBtn');
  if (MAILBOX) await p.waitForTimeout(800);
  const c2 = await codeFor(email);
  await typeCode(c2);
  await p.waitForSelector('#fpForm [name=pw1]');
  await p.fill('#fpForm [name=pw1]', 'Newpass123'); await p.fill('#fpForm [name=pw2]', 'Newpass123'); await p.click('#fpBtn'); await p.waitForTimeout(1500);
  expect(p.url().includes('#/login'), 'back to login after the reset');
  await p.fill('#loginForm [name=pw]', 'Newpass123'); await p.click('#loginBtn'); await p.waitForTimeout(1500);
  expect((await p.textContent('#authArea')).includes('₦') || (await p.textContent('#authArea')).includes('Balance'), 'logged in with the new password');

  log('Email & Password page');
  await go('acct/security', 900);
  expect((await p.textContent('.ac-cur')).includes(email), 'current email shown as verified');
  const second = `e2e.change.${tag}@example.com`;
  await p.fill('[data-acform=email] [name=email]', second); await p.click('[data-acform=email] button.btn-accent'); await p.waitForTimeout(900);
  expect(!!(await p.$('[data-acform=email] [name=code]')), 'a code is asked for before the change');
  const c3 = MAILBOX ? [null, await codeFor(second)] : (await p.textContent('#toast')).match(/(\d{6})/);
  if (c3) {
    await p.fill('[data-acform=email] [name=code]', c3[1]); await p.click('[data-acform=email] button.btn-accent'); await p.waitForTimeout(1200);
    expect((await p.textContent('.ac-cur')).includes(second), 'new email verified and saved');
  }
  await p.screenshot({ path: `${OUT}/email-security.png` });

  expect(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
