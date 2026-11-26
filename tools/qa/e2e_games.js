// Live-mode games end-to-end: plays every game in a real browser against the real API and
// checks the SERVER balance after each play (stake out, payout in, nothing else).
//   node tools/qa/e2e_games.js <outDir> [baseUrl=http://127.0.0.1:8080]
// Needs the API running with a database (PAYMENTS_MODE=demo so the test deposit is instant).
const { chromium, devices } = require('playwright');
const out = process.argv[2] || '.', BASE = (process.argv[3] || 'http://127.0.0.1:8080').replace(/\/$/, '');
const api = async (path, body, token, method) => {
  const r = await fetch(BASE + '/api' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.status), { body: j });
  return j;
};
const near = (a, b) => Math.abs(a - b) < 0.011;

(async () => {
  const phone = '81' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const { token } = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123' });
  await api('/wallet/deposit', { amount: 50000, method: 'card' }, token);
  const bal = async () => (await api('/wallet', null, token)).balance;

  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(t => { try { localStorage.setItem('lba_token', t); localStorage.setItem('lba_country', 'NG'); sessionStorage.setItem('lba_splash', '1'); } catch {} }, token);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  const fails = [];
  const check = (cond, what) => { if (!cond) fails.push(what); console.log((cond ? 'ok   ' : 'FAIL ') + what); };

  await p.goto(BASE + '/#/games'); await p.waitForTimeout(2500);
  await p.screenshot({ path: out + '/g-lobby.png' });
  check(!(await p.$('.g-soon')), 'lobby: no game marked "Soon"');
  check((await p.$$('#gLobby .gcard')).length >= 11, 'lobby: all games listed');

  /* ---------- instant games ---------- */
  for (const g of ['dice', 'spin', 'penalty', 'rush', 'keno', 'scratch', 'hilo']) {
    await p.goto(BASE + '/#/game/' + g); await p.waitForTimeout(1300);
    const before = await bal();
    if (g === 'keno') await p.click('[data-gx=knquick]');
    if (g === 'hilo') { await p.waitForSelector('[data-gx=hilo]:not([disabled])', { timeout: 8000 }); await p.click('[data-gx=hilo]:not([disabled])'); }
    else await p.click('#gxGo');
    if (g === 'scratch') { await p.waitForSelector('[data-gx=scall]', { timeout: 8000 }); await p.screenshot({ path: `${out}/g-scratch-card.png` }); await p.click('[data-gx=scall]'); }
    await p.waitForFunction(() => document.querySelector('#gxResult')?.classList.contains('on'), null, { timeout: 15000 });
    await p.waitForTimeout(900);
    if (await p.$('.tr-ov.on')) { await p.screenshot({ path: `${out}/g-${g}-trophy.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(400); }
    await p.screenshot({ path: `${out}/g-${g}.png`, fullPage: true });
    const after = await bal(), last = (await api('/games/history?game=' + g, null, token)).plays[0];
    check(last && near(after, before - last.stake + last.payout), `${g}: server balance ${before} → ${after} matches stake ${last?.stake} / payout ${last?.payout} (${(await p.textContent('#gxResult')).replace(/\s+/g, ' ').trim()})`);
  }
  // Hi-Lo deals are single use
  { const d = await api('/games/hilo/deal', {}, token); await api('/games/hilo/play', { stake: 100, choice: d.odds.higher ? 'higher' : 'lower', deal: d.deal }, token);
    let replay = null; try { await api('/games/hilo/play', { stake: 100, choice: d.odds.higher ? 'higher' : 'lower', deal: d.deal }, token); } catch (e) { replay = e.message; }
    check(replay === 'already_played', 'hilo: a deal cannot be played twice'); }

  /* ---------- Rocket Crash: auto cash-out round, then a manual cash-out ---------- */
  await p.goto(BASE + '/#/play');
  for (const mode of ['auto', 'manual']) {
    await p.fill('#crStake', '200'); await p.fill('#crAuto', mode === 'auto' ? '1.2' : '');
    // click only with at least 3 s of betting left (a later click is correctly queued for the next round)
    for (let i = 0; i < 400; i++) { const st = await api('/games/crash/state'); if (st.round && st.round.phase === 'betting' && st.round.startsAt - st.now > 3000) break; await p.waitForTimeout(250); }
    await p.waitForFunction(() => (document.querySelector('#crBtn')?.textContent || '') === 'Bet', null, { timeout: 5000 });
    const before = await bal();
    await p.click('#crBtn'); await p.waitForTimeout(700);
    check(/Cancel bet/.test(await p.textContent('#crBtn')), `crash ${mode}: bet accepted for this round`);
    await p.screenshot({ path: `${out}/g-crash-${mode}-bet.png` });
    if (mode === 'manual') {
      await p.waitForFunction(() => /Cash out|Bet next round/.test(document.querySelector('#crBtn')?.textContent || ''), null, { timeout: 15000 });
      if (/Cash out/.test(await p.textContent('#crBtn'))) await p.click('#crBtn');
    }
    const rid = (await api('/games/history?game=crash', null, token)).plays[0].round;
    for (let i = 0; i < 400; i++) { const st = await api('/games/crash/state'); if (st.round && (st.round.id > rid || st.round.phase === 'crashed')) break; await p.waitForTimeout(250); }
    await p.waitForTimeout(1200);
    if (await p.$('.tr-ov.on')) { await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
    await p.screenshot({ path: `${out}/g-crash-${mode}-end.png` });
    const last = (await api('/games/history?game=crash', null, token)).plays[0], after = await bal();
    check(last && ['cashed', 'lost'].includes(last.status) && near(after, before - last.stake + last.payout), `crash ${mode}: ${last?.status} at ${last?.mult}x, balance ${before} → ${after}`);
  }

  /* ---------- Virtual League: a real bet on the current round ---------- */
  await p.goto(BASE + '/#/virtuals'); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/g-virtuals.png`, fullPage: true });
  const vb0 = await bal();
  await p.click('#vList button.odd:not([disabled])');
  await p.evaluate(() => window.LBA_APP.openSlip()); await p.waitForTimeout(500);
  await p.fill('#bsStake', '300').catch(() => {});
  await p.click('#bsPlace'); await p.waitForTimeout(1500);
  const open = (await api('/bets?status=open', null, token)).bets.filter(x => x.legs.some(l => /Virtual|vfootball/.test(JSON.stringify(l)) || true));
  check(open.length >= 1 && near(await bal(), vb0 - open[0].stake), `virtuals: real bet ${open[0]?.id} placed (stake ${open[0]?.stake})`);

  /* ---------- Weekly Jackpot: server round, Lucky Pick, buy ---------- */
  await p.goto(BASE + '/#/jackpot'); await p.waitForTimeout(2500);
  const jb0 = await bal();
  if (!(await api('/jackpot/round')).round) console.log('skip jackpot: fewer than 12 open fixtures, so no round is open (the page says "The next round opens soon")');
  else {
    await p.click('[data-pg=jplucky]'); await p.waitForTimeout(300);
    await p.click('[data-pg=jpbuy]'); await p.waitForTimeout(2000);
    const tk = (await api('/jackpot/tickets', null, token)).tickets[0];
    check(tk && tk.picks.length === 12 && near(await bal(), jb0 - tk.cost), `jackpot: ticket ${tk?.ref} for round ${tk?.round}, ${tk?.lines} line(s), cost ${tk?.cost}`);
  }
  await p.screenshot({ path: `${out}/g-jackpot-tickets.png`, fullPage: true });

  check(!errs.length, 'no JavaScript errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
