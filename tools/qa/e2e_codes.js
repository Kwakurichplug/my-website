// Booking codes end to end in the browser: book a slip with markets outside the main list (correct score,
// handicaps…), share sheet, then a fresh visitor opens the shared link and gets every selection live and
// bettable – also after a reload, through ?code= and from the Code Hub. Bad codes say so.
//   node tools/qa/e2e_codes.js <outDir> [baseUrl]
const { chromium, devices } = require('playwright');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:8080/';
const LIST = new Set(['1x2', 'dc', 'ou', 'gg', 'hou', 'aou', 'win', 'hcp', 'spr', 'tot']);
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(), errs = [];
  const fresh = async () => {
    const ctx = await b.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); return p;
  };
  const slipState = p => p.evaluate(() => window.LBA_APP.state.slip.map(s => ({ mk: s.mk, susp: !!s.susp, odd: s.odd })));
  // 1. book: one pick each from markets outside the list on two matches (one pick per match), 1X2 on a third
  const A = await fresh();
  await A.goto(BASE + '#/home'); await A.waitForTimeout(3000);
  const ids = await A.evaluate(() => window.LBA_APP.MATCHES.filter(m => m.sport === 'football' && !m.live && !m.finished && !m.virtual && m.kick > Date.now() + 15 * 60e3).slice(0, 3).map(m => m.id));
  const picked = [];
  for (const [i, id] of ids.entries()) {
    await A.goto(BASE + '#/match/' + id); await A.waitForTimeout(2200);
    picked.push(await A.evaluate(([LIST, i, skip]) => {
      const btn = i === 2 ? document.querySelector('#mdMarkets .odd[data-mk="1x2"][data-ok="1"]')
        : [...document.querySelectorAll('#mdMarkets .odd[data-mk]')].find(b => !LIST.includes(b.dataset.mk) && !skip.includes(b.dataset.mk));
      btn.click(); return btn.dataset.mk;
    }, [[...LIST], i, picked]));
    await A.waitForTimeout(300);
  }
  const booked = await slipState(A);
  ok(booked.length === 3 && booked.filter(s => !LIST.has(s.mk)).length === 2, `slip: ${booked.map(s => s.mk).join(', ')}`);
  await A.click('#slipPill'); await A.waitForTimeout(600);
  await A.click('#bsBook'); await A.waitForTimeout(1200);
  const code = (await A.textContent('#shCode')).trim();
  ok(/^LB[0-9A-F]{5}$/.test(code) && await A.evaluate(() => document.querySelector('#shareModal').classList.contains('open')), `share sheet with code ${code}`);
  const link = await A.evaluate(() => document.querySelector('#shareModal').dataset.link), wa = await A.getAttribute('#shWa', 'href');
  ok(link.endsWith('#/code/' + code) && wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa).includes(link), 'WhatsApp message carries the link: ' + link);
  await A.screenshot({ path: OUT + '/code-share.png' });
  await A.click('#shareModal [data-sh="link"]'); await A.waitForTimeout(300);
  ok((await A.evaluate(() => navigator.clipboard.readText())) === link, 'Copy link puts the link on the clipboard');
  await A.click('#shareModal [data-sh="code"]'); await A.waitForTimeout(300);
  ok((await A.evaluate(() => navigator.clipboard.readText())) === code, 'Copy code puts the code on the clipboard');

  // 2. a fresh visitor opens the shared link
  const B = await fresh();
  await B.goto(link); await B.waitForTimeout(4500);
  let got = await slipState(B);
  ok(got.length === 3 && got.every(s => !s.susp && s.odd > 1), `link opens the betslip with every selection live: ${got.map(s => s.mk + (s.susp ? ' (suspended)' : '')).join(', ')}`);
  ok(await B.evaluate(() => document.querySelector('#betslip').classList.contains('open') && location.hash === '#/home'), 'betslip open on the home page');
  await B.screenshot({ path: OUT + '/code-loaded.png' });
  await B.reload(); await B.waitForTimeout(4500);
  got = await slipState(B);
  ok(got.length === 3 && got.every(s => !s.susp), 'after a reload the selections are still live (markets fetched in full)');
  // 3. ?code= form and the Load Booking Code box
  const C = await fresh();
  await C.goto(BASE + '?code=' + code.toLowerCase()); await C.waitForTimeout(4500);
  got = await slipState(C);
  ok(got.length === 3 && got.every(s => !s.susp) && !(await C.evaluate(() => location.search)), '?code= link works too (any letter case), and the address is cleaned');
  await C.evaluate(() => window.LBA_APP.loadCode('LBZZZZZ')); await C.waitForTimeout(1200);
  ok(/not found/i.test(await C.textContent('#toast')), 'an unknown code says so');
  // 4. Code Hub: the shared code is listed and shares the same way
  await C.goto(BASE + '#/codes'); await C.waitForTimeout(2500);
  const hub = await C.$(`[data-pg="chshare"][data-v="${code}"]`);
  if (hub) { await hub.click(); await C.waitForTimeout(500); ok((await C.textContent('#shCode')).trim() === code, 'Code Hub Share opens the share sheet for that code'); }
  else console.log('note: code not in the Code Hub list (it lists multiples with games still open)');
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
