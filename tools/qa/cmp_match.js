// Match detail + betslip, reference vs ours.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const S = process.argv[2], OUT = S + '/cmp4';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const dev = { ...devices['iPhone 13'], deviceScaleFactor: 1 };
  const shots = {};
  // reference
  const r = await (await b.newContext(dev)).newPage();
  await r.goto('https://www.sportybet.com/ng/m/sport/football/sr:category:1/sr:tournament:17?time=all&sort=2', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await r.waitForTimeout(7000);
  const hide = () => r.evaluate(() => document.querySelectorAll('[class*="dialog"],[class*="popup"],[class*="Popup"],[class*="download"],[class*="guide"]').forEach(e => { if (getComputedStyle(e).position === 'fixed' && !/nav|slip/i.test(e.className)) e.style.display = 'none'; }));
  await hide();
  const ev = await r.$('a[href*="/sport/football/"][href*="sr:match"], [class*="teams"], .m-teams');
  if (ev) { await ev.click(); await r.waitForTimeout(6000); await hide(); }
  console.log('ref match url', r.url());
  shots.refMatch1 = await r.screenshot();
  await r.evaluate(() => window.scrollTo(0, 700)); await r.waitForTimeout(600); shots.refMatch2 = await r.screenshot();
  // add two outcomes, open slip
  await r.evaluate(() => window.scrollTo(0, 0)); await r.waitForTimeout(400);
  const outs = await r.$$('[class*="outcome"]:not([class*="disable"]), [class*="m-outcome"]');
  console.log('ref outcomes', outs.length);
  for (const o of outs.slice(0, 1)) { await o.click().catch(() => {}); await r.waitForTimeout(500); }
  const slipBtn = await r.$('[class*="betslip"], [class*="bet-slip"], [class*="BetSlip"]');
  if (slipBtn) { await slipBtn.click().catch(() => {}); await r.waitForTimeout(2500); }
  shots.refSlip = await r.screenshot();
  // ours
  const ctx = await b.newContext(dev); await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const o = await ctx.newPage();
  await o.goto('http://127.0.0.1:8080/#/league/0'); await o.waitForTimeout(2500);
  await o.click('#page-league .ev-teams'); await o.waitForTimeout(1500);
  shots.ourMatch1 = await o.screenshot();
  await o.evaluate(() => window.scrollTo(0, 700)); await o.waitForTimeout(600); shots.ourMatch2 = await o.screenshot();
  await o.evaluate(() => window.scrollTo(0, 0));
  await o.click('#page-match .odd[data-mid] >> nth=0'); await o.waitForTimeout(400);
  await o.evaluate(() => document.querySelector('#slipPill').click()); await o.waitForTimeout(1200);
  shots.ourSlip = await o.screenshot();
  const page = await (await b.newContext({ viewport: { width: 810, height: 854 * 3 + 10 }, deviceScaleFactor: 1 })).newPage();
  const im = k => `<img src="data:image/png;base64,${shots[k].toString('base64')}" style="display:block;width:390px;height:844px;margin-bottom:10px">`;
  await page.setContent(`<body style="margin:0;background:#666;display:flex;gap:10px;padding:10px 10px 0"><div>${im('refMatch1')}${im('refMatch2')}${im('refSlip')}</div><div>${im('ourMatch1')}${im('ourMatch2')}${im('ourSlip')}</div></body>`);
  await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/match.png' });
  await b.close(); console.log('saved');
})();
