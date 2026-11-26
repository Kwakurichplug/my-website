// Demo-mode games (file://, no server): every instant game plays with the same pay tables in the
// browser and the local balance moves by exactly stake and payout.   node tools/qa/e2e_games_demo.js <outDir>
const { chromium, devices } = require('playwright');
const path = require('path');
const out = process.argv[2] || '.', BASE = 'file://' + path.resolve(__dirname, '../../betting/index.html');
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '#/home'); await p.waitForTimeout(1500);
  await p.evaluate(() => { const a = window.LBA_APP; a.state.user = { phone: '8031234567', name: 'Demo Player', balance: 25000, country: 'NG', verified: true }; a.saveUser(); a.renderAuth(); });
  const bal = () => p.evaluate(() => window.LBA_APP.state.user.balance);
  let bad = 0;
  for (const g of ['dice', 'spin', 'penalty', 'rush', 'keno', 'scratch', 'hilo']) {
    await p.goto(BASE + '#/game/' + g); await p.waitForTimeout(700);
    const b0 = await bal();
    if (g === 'keno') await p.click('[data-gx=knquick]');
    if (g === 'hilo') await p.click('[data-gx=hilo]:not([disabled])'); else await p.click('#gxGo');
    if (g === 'scratch') { await p.waitForSelector('[data-gx=scall]'); await p.click('[data-gx=scall]'); }
    await p.waitForFunction(() => document.querySelector('#gxResult')?.classList.contains('on'), null, { timeout: 15000 });
    await p.waitForTimeout(900);
    if (await p.$('.tr-ov.on')) { await p.screenshot({ path: `${out}/demo-${g}-trophy.png` }); await p.keyboard.press('Escape'); }
    const last = (await p.textContent('#gxResult')).replace(/\s+/g, ' '), b1 = await bal();
    const won = /YOU WIN/.test(last), amt = won ? +last.match(/₦([\d,]+\.\d{2})/)[1].replace(/,/g, '') : 0;
    const ok = Math.abs(b1 - (b0 - 100 + amt)) < 0.01;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${g}: ${b0} → ${b1} (${last.trim()})`);
  }
  await p.goto(BASE + '#/play'); await p.waitForTimeout(2500);
  const crashOk = await p.evaluate(() => !!document.querySelector('#crBtn') && document.querySelectorAll('#crBets .cr-row').length >= 0);
  console.log(crashOk ? 'ok   crash demo renders' : 'FAIL crash demo');
  await p.goto(BASE + '#/jackpot/results'); await p.waitForTimeout(800);
  const jr = await p.textContent('#page-jackpot');
  const noFake = /No settled rounds yet/.test(jr) && !/winners?\b/.test(jr.replace('No winners', ''));
  console.log(noFake ? 'ok   jackpot results show no invented winners in demo mode' : 'FAIL jackpot results');
  console.log(errs.length ? 'JS errors: ' + errs.join(' | ') : 'ok   no JavaScript errors');
  await b.close();
  process.exit(bad || !crashOk || !noFake || errs.length ? 1 : 0);
})();
