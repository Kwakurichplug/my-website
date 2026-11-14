// Betslip sheet gestures with real touch events (Chrome DevTools protocol) on an iPhone-sized screen:
// swipe up on the pill opens it, short drag springs back, long drag / pull-down on the list closes it, rows fold away.
//   node e2e_slip.js <outDir> [baseUrl]      (default: demo mode, file://…/betting/index.html)
const { chromium, devices } = require('playwright');
const OUT = process.argv[2], BASE = process.argv[3] || 'file:///home/user/my-website/betting/index.html';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  async function swipe(x, y0, y1, steps = 12, ms = 16, shotAt) {
    await touch('touchStart', x, y0);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', x, y0 + (y1 - y0) * i / steps); await p.waitForTimeout(ms); if (shotAt && i === shotAt) await p.screenshot({ path: `${OUT}/swipe-mid.png` }); }
    await touch('touchEnd'); await p.waitForTimeout(600);
  }
  const isOpen = () => p.evaluate(() => document.querySelector('#betslip').classList.contains('open'));
  await p.goto(BASE + '#/list/football/all'); await p.waitForTimeout(2200);
  // five selections from five different matches
  let added = 0; for (let i = 0; i < 5; i++) added += await p.evaluate(i => { const ev = document.querySelectorAll('#page-list .ev')[i]; const o = ev && ev.querySelector('.odd[data-mid]'); if (o) { o.click(); return 1; } return 0; }, i);
  await p.waitForTimeout(700);
  const n = await p.evaluate(() => +document.querySelector('#pillCount').textContent);
  ok(n >= 4, `${n} selections in the slip (from ${added} matches)`);
  const pill = await (await p.$('#slipPill')).boundingBox();
  // 1. swipe up on the pill: the sheet follows the finger, then opens
  await swipe(pill.x + pill.width / 2, pill.y + pill.height / 2, pill.y - 320, 14, 18, 7);
  const mid = await p.evaluate(() => getComputedStyle(document.querySelector('#betslip')).transform);
  ok(await isOpen(), 'swipe up on the pill opens the betslip');
  await p.screenshot({ path: `${OUT}/swipe-open.png` });
  const head = await (await p.$('#betslip .bs-head')).boundingBox(), sheetH = (await (await p.$('#betslip')).boundingBox()).height;
  // 2. a short drag down springs back open
  await swipe(head.x + head.width / 2, head.y + 20, head.y + 20 + sheetH * 0.12, 6, 30);
  ok(await isOpen(), 'a short drag down springs back open');
  // 3. a long drag down closes it
  await swipe(head.x + head.width / 2, head.y + 20, head.y + 20 + sheetH * 0.55, 10, 30);
  ok(!(await isOpen()), 'dragging the header down past a third closes it');
  // 4. reopen with a tap, pull down on the list (scrolled to top) closes it
  await p.click('#slipPill'); await p.waitForTimeout(700);
  ok(await isOpen(), 'tapping the pill still opens it');
  const list = await (await p.$('#bsBody')).boundingBox();
  await swipe(list.x + list.width / 2, list.y + 30, list.y + 30 + sheetH * 0.5, 10, 25);
  ok(!(await isOpen()), 'pulling down on the list at the top closes it');
  // 5. remove a selection: the row folds away
  await p.click('#slipPill'); await p.waitForTimeout(700);
  const before = await p.evaluate(() => document.querySelectorAll('#bsBody .bs-item').length);
  await p.click('#bsBody .bs-item:first-child .bs-rm'); await p.waitForTimeout(90);
  const folding = await p.evaluate(() => !!document.querySelector('#bsBody .bs-item.bs-out'));
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => document.querySelectorAll('#bsBody .bs-item').length);
  ok(folding && after === before - 1, `remove: the row folds away (${before} → ${after})`);
  // 6. page behind does not scroll while the sheet is open
  ok(await p.evaluate(() => document.documentElement.classList.contains('slip-open')), 'page behind is locked while the betslip is open');
  console.log('mid-drag transform:', mid, '| JS errors:', errs.length ? errs : 'none');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
