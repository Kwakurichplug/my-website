// Games lobby thumbnails, captured from the real game scenes (demo mode) + a consistent title band.
//   node tools/assets/thumbs.js            → betting/img/games/thumb-<id>.webp (300×300)
// Needs Playwright + Python Pillow. Demo outcomes are steered only for the picture (e.g. 7-7-7, 5x, a goal).
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), SITE = 'file://' + ROOT + '/betting/index.html', OUT = ROOT + '/betting/img/games', TMP = fs.mkdtempSync('/tmp/lbthumb-');
const TITLES = { crash: ['ROCKET', 'CRASH'], dice: ['LUCKY', 'DICE'], spin: ['SPIN', '& WIN'], rush: ['NUMBER', 'RUSH'], keno: ['KENO', ''], scratch: ['SCRATCH', 'CARDS'], hilo: ['HI-LO', 'CARDS'],
  penalty: ['PENALTY', 'KICK'], virtual: ['VIRTUAL', 'LEAGUE'], instant: ['INSTANT', 'FOOTBALL'], jackpot: ['WEEKLY', 'JACKPOT'] };
const FORCE = { dice: 0.999, spin: 11.2 / 20, rush: 0.0, scratch: 0.99892, penalty: 0.9 };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(SITE + '#/home'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const a = window.LBA_APP; a.state.user = { phone: '8031234567', balance: 99999, country: 'NG' }; a.saveUser(); a.renderAuth(); });
  await p.addInitScript(() => { window.__thumb = 1; });
  const quiet = () => p.evaluate(() => { if (window.Motion) Motion.confetti = () => {}; if (window.Pages) Pages.trophy = () => {}; });
  const shots = {};
  for (const g of ['dice', 'spin', 'rush', 'keno', 'scratch', 'hilo', 'penalty']) {
    await p.goto(SITE + '#/game/' + g); await p.waitForTimeout(900); await quiet();
    if (g === 'penalty') { shots.pkIdle = `${TMP}/pkIdle.png`; await (await p.$('#gxScene')).screenshot({ path: shots.pkIdle }); }
    if (g === 'keno') await p.click('[data-gx=knquick]');
    if (g !== 'hilo') await p.evaluate(v => { const r = Math.random; if (v != null) Math.random = () => v; document.querySelector('#gxGo').click(); Math.random = r; }, FORCE[g] ?? null);
    else await p.click('[data-gx=hilo]:not([disabled])');
    if (g === 'scratch') { await p.waitForSelector('[data-gx=scall]'); await p.waitForTimeout(300); await p.click('[data-gx=scall]'); }
    await p.waitForTimeout({ dice: 1900, spin: 5200, rush: 2600, keno: 4800, scratch: 1400, hilo: 1200, penalty: 1050 }[g]);
    await p.evaluate(() => { const r = document.querySelector('#gxResult'); if (r) r.style.display = 'none'; }); await p.waitForTimeout(80);
    const el = await p.$('#gxScene'); shots[g] = `${TMP}/${g}.png`; await el.screenshot({ path: shots[g] });
    await p.evaluate(() => { const r = document.querySelector('#gxResult'); if (r) r.style.display = ''; }); await p.waitForTimeout(600);
  }
  await p.goto(SITE + '#/play');
  shots.crash = `${TMP}/crash.png`;
  for (let tries = 0; tries < 8; tries++) {     // a round still flying 2.4 s after take-off
    await p.waitForFunction(() => /^\d/.test(document.querySelector('#crMult').textContent) && !document.querySelector('#crMult').classList.contains('dead'), null, { timeout: 60000 });
    const ok = await p.waitForFunction(() => { const m = document.querySelector('#crMult'); return m.classList.contains('dead') ? 'dead' : parseFloat(m.textContent) >= 2.6 ? 'up' : false; }, null, { timeout: 60000, polling: 50 }).then(h => h.jsonValue());
    if (ok === 'up') { await (await p.$('.cr-stage')).screenshot({ path: shots.crash }); break; }
    await p.waitForFunction(() => !document.querySelector('#crMult').classList.contains('dead'), null, { timeout: 60000 });
  }
  // sports games: compositions from our own art
  const plain = await b.newContext({ viewport: { width: 300, height: 300 }, deviceScaleFactor: 2 });
  const comp = async (id, html) => { const q = await plain.newPage(); await q.setContent(html, { waitUntil: 'load' }); await q.waitForTimeout(300); shots[id] = `${TMP}/${id}.png`; await q.screenshot({ path: shots[id] }); await q.close(); };
  const img = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const web = f => 'data:image/webp;base64,' + fs.readFileSync(ROOT + '/betting/img/' + f).toString('base64');
  await comp('jackpot', `<body style="margin:0"><div style="width:300px;height:300px;background:radial-gradient(70% 60% at 50% 40%,#3f6b1a,#0b2a12 60%,#050d07);display:grid;place-items:center"><img src="${web('trophy-lb-600.webp')}" style="height:280px;margin-top:-30px"></div></body>`);
  await comp('virtual', `<body style="margin:0;font-family:Arial,sans-serif"><div style="position:relative;width:300px;height:300px;background:url(${img(shots.pkIdle)}) center/cover"><div style="position:absolute;left:30px;right:30px;top:58px;padding:10px 12px;border-radius:12px;background:rgba(6,10,18,.82);box-shadow:0 0 0 2px #ffc20e,0 10px 24px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:space-between;color:#fff;font-weight:900"><span style="display:flex;flex-direction:column;align-items:center;gap:4px"><b style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#0a7d3e;font-size:13px">LAG</b><small style="font-size:9px;opacity:.8">LAGOS CITY</small></span><span style="font-size:34px;letter-spacing:2px">2<span style="color:#ffc20e">:</span>1</span><span style="display:flex;flex-direction:column;align-items:center;gap:4px"><b style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#c8102e;font-size:13px">ACC</b><small style="font-size:9px;opacity:.8">ACCRA UTD</small></span></div><div style="position:absolute;left:0;right:0;top:36px;text-align:center;color:#ffc20e;font-size:10px;font-weight:800;letter-spacing:2px">FULL TIME</div></div></body>`);
  await comp('instant', `<body style="margin:0"><div style="position:relative;width:300px;height:300px;background:url(${img(shots.pkIdle)}) 30% 80%/cover"><img src="${web('games/ball.webp')}" style="position:absolute;left:96px;top:120px;width:108px;filter:drop-shadow(0 12px 16px rgba(0,0,0,.6))"></div></body>`);
  // title band – drawn in the browser so it uses Kanit like the site
  const kanit = fs.readFileSync(ROOT + '/tools/trophy/kanit-800i.woff2').toString('base64');
  for (const [id, f] of Object.entries(shots)) {
    if (!TITLES[id]) continue;
    const [t1, t2] = TITLES[id], q = await plain.newPage();
    await q.setContent(`<style>@font-face{font-family:K;font-style:italic;font-weight:800;src:url(data:font/woff2;base64,${kanit})}body{margin:0}
      .t{position:relative;width:300px;height:300px;overflow:hidden;background:url(${img(f)}) center/cover}
      .t::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.82) 88%)}
      .n{position:absolute;left:16px;bottom:14px;z-index:2;font:italic 800 36px/0.95 K;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.6);letter-spacing:.5px}
      .n span{display:block;color:#ffc20e}
      .o{position:absolute;left:12px;top:12px;z-index:2;padding:4px 9px;border-radius:12px;background:rgba(0,0,0,.6);color:#ffc20e;font:700 11px/1 Arial,sans-serif;letter-spacing:1.6px}</style>
      <div class="t"><div class="o">LETBET${['virtual', 'instant', 'jackpot'].includes(id) ? '' : ' ORIGINALS'}</div><div class="n">${t1}${t2 ? `<span>${t2}</span>` : ''}</div></div>`, { waitUntil: 'load' });
    await q.evaluate(() => document.fonts.ready); await q.waitForTimeout(150);
    await q.screenshot({ path: `${TMP}/t-${id}.png` }); await q.close();
    execFileSync('python3', ['-I', '-c', `from PIL import Image; Image.open('${TMP}/t-${id}.png').convert('RGB').resize((300,300), Image.LANCZOS).save('${OUT}/thumb-${id}.webp','WEBP',quality=84,method=6)`]);
    console.log('thumb', id);
  }
  await b.close();
})();
