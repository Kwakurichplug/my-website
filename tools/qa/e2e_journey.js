// A player's whole journey on the merged site (Nov 22 + Deposit 1·2·3 rules), as a team member would test it:
// sign up → deposit (bank transfer + screenshot, confirmed by the admin with the transfer reference) → a bet that wins →
// try a withdrawal (locked: verify the ID, then Deposit 1, 2, 3) → ID check with photos, approved → Deposit 1, 2, 3 →
// withdrawals go through (reviewed and paid by the admin, the player told each time). Every balance matches the ledger.
// Server: live payments (not demo) with its schedulers on, e.g. the Moolre test server of server/test/moolre-api.test.js.
//   node tools/qa/e2e_journey.js <outDir> [baseUrl] [dbUrl]
const { chromium, devices } = require('playwright');
const { execFileSync } = require('child_process');
const OUT = process.argv[2], BASE = process.argv[3] || 'http://127.0.0.1:8097/', DB = process.argv[4] || 'postgres://postgres@127.0.0.1:5433/letbet_moolre';
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const sql = s => execFileSync('psql', [DB, '-Atc', s]).toString().trim();
const api = async (path, body, token, method) => {
  const r = await fetch(BASE + 'api' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { http: r.status, ...(await r.json().catch(() => ({}))) };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { for (const t = Date.now() + ms; Date.now() < t; await sleep(500)) if (await fn()) return true; return false; };
const rnd = () => String(Math.floor(1e7 + Math.random() * 9e7)).slice(0, 8);
async function player(name) {
  const phone = '80' + rnd();
  const o = await api('/auth/otp', { country: 'NG', phone, purpose: 'register' });
  const r = await api('/auth/register', { country: 'NG', phone, code: o.devCode, password: 'Strong123', fullName: name });
  return { phone, token: r.token, user: r.user };
}
const ledgerOk = uid => sql(`SELECT (u.balance = (SELECT coalesce(sum(amount),0) FROM transactions WHERE user_id=u.id))::text FROM users u WHERE id='${uid}'`) === 'true';

(async () => {
  const b = await chromium.launch(), errs = [];
  const admin = await player('Journey Admin'); sql(`UPDATE users SET role='admin' WHERE id='${admin.user.id}'`);
  const A = admin.token;
  // the site as configured live: Nigerian bank account set; withdrawals after Deposit 1·2·3 (new members open); ladder on
  const ps = await api('/admin/payment-settings', null, A);
  ps.settings.NG.bank = { ...ps.settings.NG.bank, bank: 'Test MFB', number: '0123456789', name: 'LETBETAFRIKA TEST' };
  ok((await api('/admin/payment-settings', ps.settings, A, 'PUT')).http === 200, 'admin: Nigerian bank account set');
  await api('/admin/settings/withdrawals', { value: { suspended: false, requireDeposits: true, newMembersOpen: true, message: '' } }, A, 'PUT');
  const lad = (await api('/admin/settings', null, A)).deposit_bonuses;
  await api('/admin/settings/deposit_bonuses', { value: { ...lad, enabled: true, requireId: true } }, A, 'PUT');

  // ---------- 1. a fresh account ----------
  const p = await player('Journey Player'), uid = p.user.id;
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(t => { try { sessionStorage.setItem('lba_splash', '1'); localStorage.setItem('lba_token', t); } catch {} }, p.token);
  const P = await ctx.newPage(); P.on('pageerror', e => errs.push(e.message));
  // close the pop-ups that open by themselves (deposit confirmed, bet won, ID approved…) – each sheet has its own close button
  const closeSheets = async () => {
    // the "You won" trophy celebration goes first (it sits on top); its Close / View ticket button, then back
    for (let i = 0; i < 3 && await P.isVisible('#trophyOv.on'); i++) {
      console.log('      (closing the “You won” celebration)');
      const at = P.url(); await P.click('#trophyOv [data-tr="close"]'); await P.waitForTimeout(900);
      if (P.url() !== at) { await P.goto(at); await P.waitForTimeout(2500); }
    }
    const seen = [];
    for (let i = 0; i < 10 && await P.isVisible('#wlSheet.open'); i++) {
      const btn = await P.$('#wlSheet.open [data-close-sheet], #wlSheet.open [data-nt-later], #wlSheet.open .wl-sheet-btns button:last-child, #wlSheet.open [aria-label="Close"]');
      const txt = ((await P.textContent('#wlSheet').catch(() => '')) || '').replace(/\s+/g, ' ').trim(); seen.push(txt);
      console.log('      (pop-up: ' + txt.slice(0, 70) + ')');
      if (btn) await btn.click(); else await P.keyboard.press('Escape');
      await P.waitForTimeout(900);
    }
    return seen;
  };
  let n = 0; const shot = async (name, full = true) => P.screenshot({ path: `${OUT}/journey-${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full });
  await P.goto(BASE + '#/deposit'); await P.waitForTimeout(3000); await closeSheets();
  const dtxt = await P.textContent('#page-deposit');
  ok(/Good to know before you deposit/.test(dtxt) && /0123456789/.test(dtxt), '1 new member: deposit page shows the bank account and says the 3-deposit rule starts with the first deposit');
  await shot('new-member-deposit-page');

  // ---------- 2. first deposit: bank transfer + screenshot → the admin confirms with the transfer reference ----------
  const png = await P.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });
  const img = 'data:image/png;base64,' + png.toString('base64');
  const deposit = async (amount, ref) => {
    const d = await api('/wallet/deposit', { amount, method: 'bank_transfer', details: { sender: 'JOURNEY PLAYER' } }, p.token);
    const up = await api(`/wallet/payments/${d.paymentId}/proof`, { image: img }, p.token);
    const noRef = await api(`/admin/payments/${d.paymentId}/approve`, {}, A);
    const okd = await api(`/admin/payments/${d.paymentId}/approve`, { reference: ref }, A);
    return { d, up, noRef, okd };
  };
  const r1 = await deposit(5000, 'JRN-' + rnd());
  ok(r1.d.status === 'pending' && r1.up.ok && r1.noRef.error === 'reference_required' && r1.okd.http === 200, '2 deposit ₦5,000 waits for the admin; screenshot attached; no credit without the transfer reference');
  ok((await api('/wallet', null, p.token)).balance === 5000, '2 credited ₦5,000 once confirmed');

  // ---------- 3. first bet, and it wins ----------
  const ev = (await api('/events?status=scheduled&sport=football&limit=100')).events.find(e => new Date(e.kickoff) > Date.now() + 5 * 60e3 && e.markets.some(m => m.key === '1x2' && !m.suspended));
  const odd = ev.markets.find(m => m.key === '1x2').outcomes['1'].o;
  const bet = await api('/bets/place', { type: 'single', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odd }], stakes: [1000], acceptChanges: true }, p.token);
  ok(bet.bets && bet.bets[0], `3 first bet placed: ₦1,000 on ${ev.home} at ${odd}`);
  sql(`UPDATE events SET kickoff = now() - interval '100 minutes' WHERE id=${ev.id}`);       // the match has been played
  ok((await api(`/admin/events/${ev.id}/result`, { home: 2, away: 0, htHome: 1, htAway: 0 }, A)).http === 200, '3 result entered: 2-0');
  ok(await until(async () => sql(`SELECT status FROM bets WHERE id='${bet.bets[0].id}'`) === 'won'), '3 the bet is settled as won');
  const won = Math.round(1000 * odd * 100) / 100;
  ok(await until(async () => (await api('/wallet', null, p.token)).balance >= 4000 + won - 0.01), `3 winnings paid (${won})`);

  // ---------- 4. try a withdrawal: locked (verify the ID, then Deposit 1, 2, 3) ----------
  const wd = amount => api('/wallet/withdraw', { amount, method: 'bank_transfer', details: { bank: 'GTBank', acct: '0123456789', name: 'Journey Player' } }, p.token);
  let w = await wd(1000);
  ok(w.http === 403 && w.error === 'deposits_first' && w.unlocked === false, '4 withdrawal refused: deposits_first (ID not approved yet)');
  await P.goto(BASE + '?w=1#/withdraw'); await P.waitForTimeout(3000); await closeSheets();
  const wt = await P.textContent('#page-withdraw');
  ok(/Complete your 3 deposits to unlock withdrawals/.test(wt) && /Verify your ID first/.test(wt) && !(await P.isVisible('#wdForm')), '4 withdraw page: locked card – verify the ID first, then Deposit 1, 2, 3');
  await shot('withdraw-locked-verify-id');

  // ---------- 5. ID check with photos, approved → Deposit 1·2·3 open ----------
  const kyc = await api('/auth/verify', { fullName: 'Journey Player', dob: '1995-04-12', idType: 'NIN', idNumber: '12345678901', front: img, back: img }, p.token);
  ok(kyc.status === 'pending', '5 ID sent with front and back photos');
  ok((await api(`/admin/users/${uid}/kyc`, { approve: true }, A)).http === 200, '5 admin approves the ID');
  await P.goto(BASE + '?w=2#/home'); await P.waitForTimeout(3500);
  // pop-ups come one by one, oldest first ("Deposit confirmed" from step 2, then "Your ID is approved")
  let seen = [];
  for (let i = 0; i < 6 && await P.isVisible('#wlSheet.open'); i++) {
    const t = ((await P.textContent('#wlSheet').catch(() => '')) || ''); seen.push(t);
    if (/Your ID is approved/.test(t)) { await shot('id-approved-popup', false); break; }
    await P.click('#wlSheet.open [data-close-sheet], #wlSheet.open [data-nt-later], #wlSheet.open .wl-sheet-btns button:last-child'); await P.waitForTimeout(1200);
  }
  ok(seen.some(t => /Your ID is approved/.test(t) && /Deposit 1/.test(t)), '5 player sees “Your ID is approved” with Deposit 1 · 2 · 3');
  await closeSheets();

  // ---------- 6. Deposit 1, 2, 3 ----------
  for (const [i, amt] of [[1, 2000], [2, 3000], [3, 4000]]) {
    const r = await deposit(amt, `JRN-D${i}-` + rnd());
    ok(r.okd.http === 200, `6 Deposit ${i}: ₦${amt.toLocaleString()} confirmed`);
  }
  const o = await api('/wallet/options', null, p.token);
  ok(o.ladder && o.ladder.left === 0 && o.ladder.steps.every(s => s.done) && o.withdrawBlock === null, '6 all three steps marked done; withdrawals open');
  ok(Number(sql(`SELECT count(*) FROM bonuses WHERE user_id='${uid}' AND kind LIKE 'deposit_' AND status='active'`)) === 3, '6 three deposit bonuses granted (locked until wagered)');
  await P.goto(BASE + '?w=3#/deposit'); await P.waitForTimeout(3000); await closeSheets();
  ok((await P.textContent('#page-deposit').catch(() => '')).match(/✓ Done/g)?.length >= 3, '6 deposit page marks Deposit 1, 2, 3 ✓ Done');
  await shot('deposit-ladder-done');

  // ---------- 7. withdrawals go through: requested, reviewed and paid by the admin, the player told each time ----------
  await P.goto(BASE + '?w=4#/withdraw'); await P.waitForTimeout(3000); await closeSheets();
  ok(await P.isVisible('#wdForm') && !/Complete your 3 deposits/.test(await P.textContent('#page-withdraw')), '7 withdraw page open (form shown)');
  await shot('withdraw-open');
  const me = (await api('/auth/me', null, p.token)).user, free = Math.round((me.balance - (me.playLeft || 0)) * 100) / 100;
  ok(free >= 2000, `7 the winnings are free to withdraw (₦${free}); deposits not yet staked stay for play-through`);
  for (const k of [1, 2]) {
    w = await wd(1000);
    ok(w.status === 'pending', `7 withdrawal ${k}: ₦1,000 requested`);
    const paid = await api(`/admin/payments/${w.paymentId}/approve`, { reference: `NIP-JRN-${k}-` + rnd(), reviewed: true }, A);
    ok(paid.http === 200 && sql(`SELECT status FROM payments WHERE id='${w.paymentId}'`) === 'success', `7 withdrawal ${k}: reviewed and paid by the admin`);
  }
  const notes = await api('/auth/notices', null, p.token);
  ok((notes.notices || []).filter(x => x.kind === 'withdrawal_paid').length === 2, '7 the player is told twice: “withdrawal paid”');
  await P.goto(BASE + '?w=5#/home'); await P.waitForTimeout(3500);
  seen = [];
  for (let i = 0; i < 10 && await P.isVisible('#wlSheet.open'); i++) {
    const t = ((await P.textContent('#wlSheet').catch(() => '')) || ''); seen.push(t);
    if (/withdrawal/i.test(t) && /paid/i.test(t) && !seen.slice(0, -1).some(x => /withdrawal/i.test(x) && /paid/i.test(x))) await shot('withdrawal-paid-popup', false);
    await P.click('#wlSheet.open [data-close-sheet], #wlSheet.open [data-nt-later], #wlSheet.open .wl-sheet-btns button:last-child'); await P.waitForTimeout(1200);
  }
  ok(seen.filter(t => /withdrawal/i.test(t) && /paid/i.test(t)).length >= 1, '7 “Withdrawal paid” pop-up shows in the app');
  ok(ledgerOk(uid), 'balance = ledger (no money created or lost)');
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL PASSED');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(e => { console.log('CRASH ' + e.stack); process.exit(2); });
