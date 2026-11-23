// Sub-agents in the browser: a sign-up link ?ref=LB… fills in the code; the admin makes a player an agent in the portal
// (find → rate → Make agent), sees the commission build up on settled bets of the agent's players, pays it; the agent
// sees their dashboard on Refer & Earn. Server: PAYMENTS_MODE=demo on a test DB (default http://127.0.0.1:8081/).
//   node tools/qa/e2e_agents.js <outDir> [baseUrl] [dbUrl]
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:8081/', DB = process.argv[4] || 'postgres://postgres@127.0.0.1:5433/letbet_oa';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sql = s => execFileSync('psql', [DB, '-Atc', s]).toString().trim();
const api = async (path, body, token, method) => { const r = await fetch(BASE + 'api' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
async function player(name, ref) {
  const phone = '80' + rnd();
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123', fullName: name, ...(ref ? { ref } : {}) });
  return { phone, token: r.token, user: r.user };
}
(async () => {
  const b = await chromium.launch(), errs = [];
  const admin = await player('Ops Admin'); sql(`UPDATE users SET role='admin' WHERE id='${admin.user.id}'`);
  const agent = await player('Kunle Agent');

  // ---------- a friend opens the agent's sign-up link: the code is filled in ----------
  const fctx = await b.newContext({ ...devices['iPhone 13'] });
  await fctx.addInitScript(() => { try { sessionStorage.setItem('lba_splash', '1'); } catch {} });
  const F = await fctx.newPage(); F.on('pageerror', e => errs.push('friend: ' + e.message));
  await F.goto(BASE + '?ref=LB' + agent.user.uid + '#/register'); await F.waitForTimeout(2500);
  ok((await F.inputValue('#regForm [name=refCode]')) === 'LB' + agent.user.uid, 'sign-up link fills in the referral code');
  const fphone = '80' + rnd();
  await F.fill('#regForm [name=phone]', '0' + fphone); await F.fill('#regForm [name=pw]', 'Strong123'); await F.check('#regForm [name=agree]'); await F.click('#regBtn');
  await F.waitForFunction(() => /Test code: \d{6}/.test(document.querySelector('#toast').textContent), null, { timeout: 8000 });
  const code = (await F.textContent('#toast')).match(/(\d{6})/)[1];
  await F.waitForSelector('#otpBoxes'); await F.fill('#otpBoxes input >> nth=0', code); await F.waitForSelector('.au-done', { timeout: 8000 });
  ok(sql(`SELECT r.uid FROM users u JOIN users r ON r.id=u.referred_by WHERE u.phone='${fphone}'`) === String(agent.user.uid), 'the friend is the agent’s player');
  const friend = { token: await F.evaluate(() => localStorage.getItem('lba_token')) };

  // ---------- admin portal: Add agent → find → 20% of net revenue ----------
  const actx = await b.newContext({ viewport: { width: 1366, height: 860 } }), A = await actx.newPage(); A.on('pageerror', e => errs.push('admin: ' + e.message));
  await A.goto(BASE + 'admin.html'); await A.waitForTimeout(800);
  await A.selectOption('#loginForm select[name=country]', 'NG'); await A.fill('#loginForm input[name=who]', '0' + admin.phone); await A.fill('#loginForm input[name=password]', 'Strong123');
  await A.click('#loginForm button[type=submit]'); await A.waitForTimeout(2500);
  await A.goto(BASE + 'admin.html#/agents'); await A.waitForTimeout(1500);
  { const t = await A.textContent('#main'); ok(/No agents yet/.test(t) || /Paid so far/.test(t), 'Agents page loads (empty state or the agents table)'); }
  await A.click('[data-agent-new]'); await A.waitForTimeout(400);
  await A.fill('#agFind input', String(agent.user.uid)); await A.press('#agFind input', 'Enter'); await A.waitForTimeout(1200);
  await A.click('#agHits [data-pick]'); await A.waitForTimeout(1200);
  ok(/referral code LB/.test(await A.textContent('#modalBody')), 'the picked player is shown with their code');
  await A.selectOption('#agBasis', 'revenue'); await A.fill('#agRate', '20'); await A.waitForTimeout(200);
  ok(/the agent earns ₦20,000/.test(await A.textContent('#agEx')), 'live example of the commission');
  await A.screenshot({ path: OUT + '/ag-1-make-agent.png' });
  await A.click('#mGo'); await A.waitForTimeout(1500);
  ok(/20% of net revenue/.test(await A.textContent('#main')) && /Kunle Agent/.test(await A.textContent('#main')), 'agent listed with their commission');

  // ---------- the friend plays: one losing bet settles ----------
  await api('/wallet/deposit', { amount: 20000, method: 'card' }, friend.token);
  const ev = (await api('/events?status=scheduled&sport=football&limit=200')).events.find(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended));
  const odd = ev.markets.find(m => m.key === '1x2').outcomes['1'].o;
  await api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd }], stakes: [5000], acceptChanges: true }, friend.token);
  await api(`/admin/events/${ev.id}/result`, { home: 0, away: 2 }, admin.token || (await api('/auth/login', { country: 'NG', phone: admin.phone, password: 'Strong123' })).token);
  await new Promise(r => setTimeout(r, 6000));
  await A.click('#refreshBtn'); await A.waitForTimeout(1500);
  ok(/₦1,000\.00/.test(await A.textContent('#main')), 'commission due: 20% of the ₦5,000 the player lost');
  await A.screenshot({ path: OUT + '/ag-2-agents.png' });
  await A.click(`#main tr[data-agent="${agent.user.id}"] td`); await A.waitForTimeout(1500);
  ok(/Players this period/.test(await A.textContent('#drawerBody')) && /₦5,000\.00/.test(await A.textContent('#drawerBody')), 'agent drawer lists the player and their net revenue');
  await A.screenshot({ path: OUT + '/ag-3-drawer.png' });
  await A.click('#drawerBody [data-agent-pay]'); await A.waitForTimeout(1200);
  ok(/Pay ₦1,000\.00/.test(await A.textContent('#mGo')), 'pay dialog proposes the commission, editable');
  await A.screenshot({ path: OUT + '/ag-4-pay.png' });
  await A.click('#mGo'); await A.waitForTimeout(1500);
  ok((await api('/wallet', null, agent.token)).balance === 1000, 'agent’s balance credited ₦1,000');

  // ---------- the agent's dashboard ----------
  const gctx = await b.newContext({ ...devices['iPhone 13'] });
  await gctx.addInitScript(t => { try { sessionStorage.setItem('lba_splash', '1'); localStorage.setItem('lba_token', t); } catch {} }, agent.token);
  const G = await gctx.newPage(); G.on('pageerror', e => errs.push('agent: ' + e.message));
  await G.goto(BASE + '#/acct/refer'); await G.waitForTimeout(3500);
  const txt = await G.textContent('#acBody');
  ok(/Agent/.test(txt) && /20% of your players' net revenue/.test(txt) && /Paid so far: ₦1,000\.00/.test(txt), 'agent sees rate, players and what was paid');
  ok(/\?ref=LB\d+#\/register/.test(txt), 'agent gets their sign-up link');
  await G.screenshot({ path: OUT + '/ag-5-agent-dashboard.png', fullPage: true });
  await G.goto(BASE + '#/acct/tx'); await G.waitForTimeout(2500);
  ok(/Agent commission/.test(await G.textContent('#acBody')), 'transaction records show “Agent commission”');
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
  process.exit(fails || errs.length ? 1 : 0);
})();
