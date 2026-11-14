// Instant Football in demo or live mode. usage: node e2e_instant.js <scratch> <base>
const { chromium, devices } = require('playwright');
const [, , S, BASE] = process.argv;
const LIVE = BASE.startsWith('http');
let failures = 0;
const expect = (c, m) => { if (!c) { failures++; console.log('  ✗ FAIL:', m); } else console.log('  ✓', m); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const go = async (h, w = 800) => { await p.goto(BASE + '#/' + h); await p.waitForTimeout(w); };
  await go('home', 2500);
  const phone = '80' + String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
  let token;
  if (LIVE) {
    const api = async (path, body, t) => (await fetch(BASE + 'api' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
    const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
    const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123' });
    token = r.token; await api('/wallet/deposit', { amount: 10000, method: 'card' }, token);
    await p.evaluate(t => localStorage.setItem('lba_token', t), token); await p.reload(); await p.waitForTimeout(2500);
    p.api = api;
  } else {
    await p.evaluate(() => localStorage.clear());
    await go('login'); await p.fill('#loginForm [name=phone]', '0' + phone); await p.fill('#loginForm [name=pw]', 'x'); await p.click('#loginBtn'); await p.waitForTimeout(1200);
  }
  await go('virtuals'); expect(await p.isVisible('.v-switch'), 'virtuals page links to Instant Football');
  await p.click('.v-switch a[href="#/instant"]'); await p.waitForTimeout(1500);
  expect((await p.$$('.vi-r')).length === 10, 'round of 10 matches');
  expect(await p.isDisabled('[data-pg=vikick]'), 'Kick Off disabled with no picks');
  for (const k of [0, 1, 2]) await p.click(`.vi-r >> nth=${k} >> .jp-o >> nth=0`);
  await p.waitForTimeout(200);
  expect((await p.textContent('.vi-sum')).includes('3 picks'), '3 picks counted');
  await p.fill('#viStake', '200'); await p.waitForTimeout(100);
  const kick = await p.textContent('[data-pg=vikick]');
  expect(kick.includes('200'), 'Kick Off shows the stake: ' + kick.trim());
  const bal0 = LIVE ? (await p.api('/wallet', null, token)).balance : await p.evaluate(() => JSON.parse(localStorage.getItem('lba_NG_user')).balance);
  await p.click('[data-pg=vikick]'); await p.waitForTimeout(1500);
  expect(await p.isVisible('.vi-clock'), 'matches in play with a running clock');
  await p.waitForSelector('.vi-res', { timeout: 15000 });
  const res = await p.textContent('.vi-res');
  expect(/You won|No win/.test(res), 'result shown: ' + res.trim().slice(0, 40));
  const won = (await p.$$('.vi-r.won')).length, lost = (await p.$$('.vi-r.lost')).length;
  expect(won + lost === 3, `picked rows marked won/lost (${won}/${lost})`);
  const payout = /You won/.test(res) ? +res.match(/₦([\d,.]+)/)[1].replace(/,/g, '') : 0;
  const bal1 = LIVE ? (await p.api('/wallet', null, token)).balance : await p.evaluate(() => JSON.parse(localStorage.getItem('lba_NG_user')).balance);
  expect(Math.abs(bal1 - (bal0 - 200 + payout)) < 0.01, `balance ${bal0} → ${bal1} matches stake 200 and payout ${payout}`);
  expect(won === 3 ? payout > 0 : payout === 0, 'multiple pays only when every pick wins');
  await p.click('[data-pg=vinext]'); await p.waitForTimeout(1500);
  expect(!(await p.$('.vi-res')) && (await p.$$('.vi-r')).length === 10, 'Next Round loads fresh fixtures');
  if (LIVE) {
    const round = await p.api('/virtuals/instant/round');
    const again = async () => p.api('/virtuals/instant/play', { roundId: round.id, type: 'single', stake: 100, picks: [{ i: 0, o: '1' }] }, token);
    const first = await again(), second = await again();
    expect(first.ref && second.error === 'round_expired', 'a round can only be played once');
    const forged = await p.api('/virtuals/instant/play', { roundId: '00000000-0000-4000-8000-000000000000', type: 'single', stake: 100, picks: [{ i: 0, o: '1' }] }, token);
    expect(forged.error === 'round_expired', 'unknown round rejected');
  }
  expect(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await b.close();
})().catch(e => { console.log('CRASH', e.message); process.exit(1); });
