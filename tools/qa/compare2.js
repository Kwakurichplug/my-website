// Side-by-side viewport captures: reference (left) vs LetBetAfrika (right), iPhone 13.
// usage: node compare2.js <outdir> <pairs.json>
// pairs: [{ name, ref, our, screens: 2, refPrep?: "js", ourPrep?: "js" }]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [, , OUT, PAIRS] = process.argv;
const OURS = process.env.OURS || 'http://127.0.0.1:8080/';
const pairs = JSON.parse(fs.readFileSync(PAIRS, 'utf8'));
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const dev = { ...devices['iPhone 13'], deviceScaleFactor: 1 };
  const VH = dev.viewport.height;
  const refCtx = await b.newContext(dev);
  const ourCtx = await b.newContext(dev);
  await ourCtx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  if (process.env.OUR_TOKEN) await ourCtx.addInitScript(t => { try { localStorage.setItem('lba_token', t); } catch {} }, process.env.OUR_TOKEN);
  async function shots(ctx, url, n, prep, ours) {
    const p = await ctx.newPage();
    try { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { console.log('nav', e.message); }
    await p.waitForTimeout(ours ? 2600 : 7500);
    if (!ours) await p.evaluate(() => document.querySelectorAll('[class*="dialog"],[class*="popup"],[class*="Popup"],[class*="download"],[class*="guide"]').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && !/nav|bet-?slip|betslip/i.test(e.className)) e.style.display = 'none'; }));
    if (prep) { try { await p.evaluate(prep); } catch (e) { console.log('prep', e.message); } await p.waitForTimeout(1500); }
    const out = [];
    for (let i = 0; i < n; i++) {
      await p.evaluate(y => window.scrollTo(0, y), i * (VH - 120)); await p.waitForTimeout(500);
      out.push((await p.screenshot()).toString('base64'));
    }
    const metrics = await p.evaluate(() => ({ url: location.href, h: document.documentElement.scrollHeight }));
    await p.close();
    return { out, metrics };
  }
  for (const pr of pairs) {
    if (only && !only.includes(pr.name)) continue;
    const n = pr.screens || 2;
    const [r, o] = await Promise.all([shots(refCtx, pr.ref, n, pr.refPrep, false), shots(ourCtx, OURS + pr.our, n, pr.ourPrep, true)]);
    const page = await (await b.newContext({ viewport: { width: 390 * 2 + 30, height: (VH + 10) * n + 10 }, deviceScaleFactor: 1 })).newPage();
    const col = arr => arr.map(x => `<img src="data:image/png;base64,${x}" style="display:block;width:390px;height:${VH}px;margin-bottom:10px">`).join('');
    await page.setContent(`<body style="margin:0;background:#666;display:flex;gap:10px;padding:10px 10px 0"><div>${col(r.out)}</div><div>${col(o.out)}</div></body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${pr.name}.png` });
    await page.context().close();
    console.log('saved', pr.name, '| ref', r.metrics.url, '| ours', o.metrics.url);
  }
  await b.close();
})();
