// Functional walk through the pages.js screens. usage: node e2e_pages.js <scratch> <baseUrl>
const { chromium, devices } = require('playwright');
const [, , S, BASE] = process.argv;
const LIVE = BASE.startsWith('http');
let failures = 0;
const expect = (c, m) => { if (!c) { failures++; console.log('  ✗ FAIL:', m); } else console.log('  ✓', m); };
const log = (...a) => console.log('•', ...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const go = async (h, w = 600) => { await p.goto(BASE + '#/' + h); await p.waitForTimeout(w); };
  await go('home', 2500);
  if (!LIVE) await p.evaluate(() => localStorage.clear());

  // log in (live: register a fresh player; demo: any number)
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  if (LIVE) {
    await go('register');
    await p.fill('#regForm [name=phone]', '0' + phone); await p.fill('#regForm [name=pw]', 'Strong123'); await p.check('#regForm [name=agree]'); await p.click('#regBtn');
    await p.waitForFunction(() => /Test code: \d{6}/.test(document.querySelector('#toast').textContent));
    const code = (await p.textContent('#toast')).match(/(\d{6})/)[1];
    await p.waitForSelector('#otpBoxes'); await p.fill('#otpBoxes input >> nth=0', code); await p.waitForSelector('.au-done', { timeout: 8000 });
    await go('deposit/opay'); await p.fill('#wlAmt', '20000'); await p.click('#depBtn'); await p.waitForSelector('.wl-res', { timeout: 8000 });
  } else {
    await go('login'); await p.fill('#loginForm [name=phone]', '0' + phone); await p.fill('#loginForm [name=pw]', 'x'); await p.click('#loginBtn'); await p.waitForTimeout(1200);
  }
  expect((await p.textContent('#authArea')).includes('Balance'), 'logged in with a balance');

  log('Live');
  await go('live');
  const groups = await p.$$('.lv-lg');
  expect(groups.length > 0, 'live page lists leagues');
  await groups[0].click(); await p.waitForTimeout(150);
  expect(await p.$eval('.lv-grp', e => e.classList.contains('shut')), 'league group collapses');
  await p.click('.lv-lg >> nth=0'); await p.waitForTimeout(150);
  await p.click('[data-pg=lvall]'); await p.waitForTimeout(200);
  expect(await p.$$eval('.lv-grp', l => l.every(e => e.classList.contains('shut'))), 'Collapse All collapses every league');
  expect((await p.textContent('[data-pg=lvall]')).includes('Expand All'), 'button then offers Expand All');
  await p.click('[data-pg=lvall]'); await p.waitForTimeout(200);
  await p.selectOption('[data-pg=lvsort]', 'time'); await p.waitForTimeout(200);
  expect((await p.$$('.lv-lg')).length === 0 && (await p.$$('#page-live .ev')).length > 0, 'sort by match time shows a flat list');

  log('Sports filter → list');
  await go('sports');
  await p.click('[data-pg=sftab][data-v=top]');
  await p.click('.sf-row input[type=checkbox] >> nth=1'); await p.waitForTimeout(150);
  const viewTxt = await p.textContent('[data-pg=sfview]');
  expect(/View \(\d+\)/.test(viewTxt), 'View shows the match count: ' + viewTxt.trim());
  await p.click('[data-pg=sfview]'); await p.waitForTimeout(600);
  expect(p.url().includes('#/list/football/all/'), 'View opens the filtered list');
  expect((await p.$$('#page-list .ev')).length > 0, 'filtered list has matches');
  await p.selectOption('[data-pg=elsort]', 'league'); await p.waitForTimeout(300);
  expect((await p.$$('#page-list .el-lg')).length >= 1, 'sort by league groups the list');
  await p.click('#page-list [data-pg=eltab][data-v=out]'); await p.waitForTimeout(300);
  expect((await p.$$('#page-list .out-row')).length > 3, 'outrights tab lists winner prices');

  log('League page + add a bet');
  await go('league/0');
  const odd = await p.$('#page-league .ev .odd[data-mid]');
  await odd.click(); await p.waitForTimeout(300);
  expect(await p.$eval('#page-league .ev .odd[data-mid]', e => e.classList.contains('sel')), 'odds button selects into the betslip');
  await p.evaluate(() => document.querySelector('#slipPill')?.click()); await p.waitForTimeout(500);
  await p.fill('#bsStake', '500'); await p.click('#bsPlace'); await p.waitForTimeout(2500);
  await go('acct/bets', 1500);
  const card = await p.$('.bet-card .bh');
  expect(!!card, 'bet appears in bet history');

  log('Bet detail');
  await card.click(); await p.waitForTimeout(800);
  expect(p.url().includes('#/bet/'), 'bet card opens the bet detail page');
  expect((await p.textContent('#page-bet')).includes('Ticket ID'), 'bet detail shows the ticket');
  await p.click('[data-pg=rebet]'); await p.waitForTimeout(600);
  const slipN = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /_slip$/.test(k))) || '[]').length);
  expect(slipN === 1, 'Rebet puts the selection back in the betslip');
  await p.evaluate(() => document.querySelector('#bsClear')?.click()); await p.keyboard.press('Escape');

  log('Jackpot');
  await go('jackpot', 800);
  expect((await p.$$('.jp-r')).length === 12, '12 jackpot games');
  await p.click('[data-pg=jplucky]'); await p.waitForTimeout(200);
  const first = await p.$('.jp-r .jp-o:not(.on)'); await first.click(); await p.waitForTimeout(200);
  const bar = await p.textContent('.jp-bar');
  expect(bar.includes('12/12') && bar.includes('2 lines'), 'Lucky Pick fills 12 games, an extra pick makes 2 lines');
  await p.click('[data-pg=jpbuy]'); await p.waitForTimeout(1500);
  expect(p.url().includes('#/jackpot/tickets'), 'buying opens My Tickets');
  await p.waitForTimeout(800);
  expect((await p.textContent('#page-jackpot')).includes('2 lines'), 'ticket listed with 2 lines');
  await go('jackpot/results'); expect((await p.$$('.jp-past')).length === 3, 'previous results listed');
  await go('jackpot/how'); expect((await p.$$('.jp-how .how-step')).length === 5, 'how to play steps');

  log('Promotions');
  await go('promos'); const promos = (await p.$$('.pr-card')).length;
  await go('promos/games'); expect((await p.$$('.pr-card')).length < promos, 'Games tab filters promotions');
  await go('promo/welcome'); expect((await p.textContent('#page-promo')).includes('Terms & Conditions'), 'promo detail shows T&Cs');

  log('Results');
  await go('results');
  const before = await p.textContent('.rs-date b');
  await p.click('[data-pg=rsday][data-v="1"]'); await p.waitForTimeout(200);
  expect((await p.textContent('.rs-date b')) !== before, 'previous-day button changes the date');
  await p.click('[data-pg=rspick]'); await p.waitForTimeout(150);
  expect((await p.$$('.rs-pick button')).length >= 1, 'Change opens the sport picker');

  log('Code Hub');
  await go('codes', 800);
  expect((await p.$$('.ch-card')).length >= 4, 'feed lists booking codes');
  await p.click('.ch-card [data-pg=chfollow]'); await p.waitForTimeout(200);
  expect((await p.textContent('.ch-card .ch-follow')).includes('Following'), 'Follow toggles');
  await p.click('.ch-card [data-pg=chadd]'); await p.waitForTimeout(700);
  expect(await p.evaluate(() => document.querySelector('#betslip').classList.contains('open')), 'Add to Betslip opens the slip');
  const legs = await p.$$eval('.ch-card:first-child .ch-legs li', l => l.length);
  const inSlip = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /_slip$/.test(k))) || '[]').length);
  expect(inSlip === legs, `all ${legs} selections added (${inSlip})`);
  await p.evaluate(() => document.querySelector('#bsClear')?.click()); await p.keyboard.press('Escape');
  if (!LIVE) {
    const code = await p.textContent('.ch-card:nth-child(2) .ch-code b');
    await go('codes'); await p.fill('.ch-load [name=code]', code); await p.click('.ch-load .au-btn'); await p.waitForTimeout(700);
    expect((await p.textContent('#toast')).includes('Loaded'), 'Load works for a feed code');
  }

  log('Home');
  await go('home', 1200);
  expect((await p.$$('.icon-row > a')).length === 6, 'shortcut row has 6 entries');
  expect(await p.$eval('.fcard .fc-odds .odd span', e => e.textContent.trim()) === '1', 'featured odds labelled 1 / X / 2');
  await p.click('[data-hview=countries]'); await p.waitForTimeout(200);
  expect(!(await p.isHidden('#leagueAcc')) && await p.isHidden('#matchList'), 'Countries tab shows the league list');

  expect(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
