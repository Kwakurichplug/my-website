// Integration: Live support. The assistant answers from the player's own account; "talk to a person" hands the chat to
// the team; the admin sees it with the player's profile, replies, the player sees the reply (unread badge), the admin
// closes it and the next message starts a new chat with the assistant. Runs on the Moolre test server (see agents.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { detect } from '../src/lib/support.js';

const BASE = process.env.MOOLRE_API_URL, MOCK = process.env.MOCK_MOOLRE || 'http://127.0.0.1:9099';
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
async function player(name) {
  const phone = '24' + String(Math.floor(1e6 + Math.random() * 9e6));
  const r = await api('/auth/register', { country: 'GH', phone, password: 'Strong123', fullName: name });
  assert.ok(r.token, JSON.stringify(r)); return { token: r.token, user: r.user, phone };
}
let ADMIN, adminUser;
before(async () => { if (skip) return; const a = await player('Ama Support'); await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.user.id]); ADMIN = a.token; adminUser = a; });
after(() => db.end());

test('the assistant understands what players ask', () => {
  const cases = { 'hi': 'greet', 'Hello bro': 'greet', 'where is my deposit': 'deposit', 'momo not credited': 'deposit', 'I want to withdraw': 'withdraw', 'my withdrawal never came': 'withdraw',
    'how do I get my bonus': 'bonus', 'my ticket lost': 'bet', 'forgot password': 'password', 'verify my ghana card': 'verify', 'talk to a person': 'human', 'I want to speak with an agent': 'human',
    'promo code not working': 'promo', 'thanks': 'thanks', 'blah qwerty': 'unknown' };
  for (const [s, k] of Object.entries(cases)) assert.equal(detect(s), k, s);
});

test('live support: assistant from the account, hand-off, admin reply with the player profile, close', { skip }, async () => {
  const p = await player('Kofi Mensah');
  let v = await api('/support', null, p.token);
  assert.equal(v.thread, null); assert.ok(v.greeting && /Kofi/.test(v.greeting.text), 'greets by first name');

  // the assistant answers from the account
  let r = await api('/support/message', { text: 'where is my deposit?' }, p.token);
  assert.equal(r.thread.status, 'bot');
  assert.ok(r.messages.some(m => m.from === 'bot' && /not made a deposit/.test(m.text)), JSON.stringify(r.messages));
  const d = await api('/wallet/deposit', { amount: 25, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
  const ref = (await db.query('SELECT provider_ref FROM payments WHERE id=$1', [d.paymentId])).rows[0].provider_ref;
  r = await api('/support/message', { text: 'my deposit has not reflected' }, p.token);
  assert.ok(r.messages.some(m => m.from === 'bot' && /GHS 25\.00/.test(m.text) && /waiting for confirmation/.test(m.text)), 'sees the pending deposit');
  await fetch(`${MOCK}/__approve/${ref}`, { method: 'POST' });
  for (let i = 0; i < 40; i++) { if ((await db.query('SELECT status FROM payments WHERE id=$1', [d.paymentId])).rows[0].status === 'success') break; await sleep(200); }
  r = await api('/support/message', { text: 'deposit?' }, p.token);
  assert.ok(r.messages.some(m => m.from === 'bot' && /was credited/.test(m.text)), 'sees it credited');
  r = await api('/support/message', { text: 'my bets' }, p.token);
  assert.ok(r.messages.some(m => m.from === 'bot' && /no open tickets/.test(m.text)));
  assert.ok(r.messages.find(m => m.from === 'bot').chips.includes('Talk to a person'), 'quick replies');

  // hand-off to a person
  r = await api('/support/human', {}, p.token);
  assert.equal(r.thread.status, 'waiting'); assert.ok(r.messages.some(m => m.from === 'system'));
  r = await api('/support/message', { text: 'please help me' }, p.token);
  assert.ok(!r.messages.some(m => m.from === 'bot'), 'the assistant steps back once a person is asked for');

  // the admin's inbox: the chat with the player's profile
  assert.equal((await api('/admin/support', null, p.token)).status, 403, 'players cannot see the inbox');
  const inbox = await api('/admin/support', null, ADMIN);
  const it = inbox.threads.find(t => t.uid == p.user.uid);
  assert.ok(it && it.status === 'waiting' && it.staff_unread > 0); assert.ok(inbox.waiting >= 1);
  const th = await api(`/admin/support/${it.id}`, null, ADMIN);
  assert.equal(th.player.uid, p.user.uid); assert.equal(th.player.balance, 25); assert.equal(th.player.deposited, 25);
  assert.ok(th.payments.some(x => x.kind === 'deposit' && x.status === 'success' && x.id));
  assert.ok(th.messages.some(m => m.from === 'user' && m.text === 'please help me'));
  assert.equal((await api('/support', null, p.token)).online, true, 'the team shows as online while the inbox is open');

  // reply → the player sees it (unread), reads it
  const rep = await api(`/admin/support/${it.id}/message`, { text: 'Hi Kofi, your deposit is in.' }, ADMIN);
  assert.equal(rep.from, 'staff'); assert.equal(rep.name, 'Ama');
  assert.equal((await api('/support/unread', null, p.token)).unread, 1);
  v = await api('/support', null, p.token);
  assert.equal(v.thread.status, 'open'); assert.equal(v.thread.staff, 'Ama');
  assert.ok(v.messages.some(m => m.from === 'staff' && /deposit is in/.test(m.text)));
  await api('/support/read', {}, p.token);
  assert.equal((await api('/support/unread', null, p.token)).unread, 0);

  // close → the next message starts a new chat with the assistant
  assert.equal((await api(`/admin/support/${it.id}/close`, {}, ADMIN)).from, 'system');
  assert.equal((await api(`/admin/support/${it.id}/close`, {}, ADMIN)).error, 'closed');
  r = await api('/support/message', { text: 'hello again' }, p.token);
  assert.notEqual(r.thread.id, it.id); assert.equal(r.thread.status, 'bot');

  // two questions it cannot answer → a person
  await api('/support/message', { text: 'qwerty zxcv' }, p.token);
  r = await api('/support/message', { text: 'asdf ghjk' }, p.token);
  assert.equal(r.thread.status, 'waiting', 'hands over after two misses');
  assert.equal((await api('/support/message', { text: '' }, p.token)).error, 'empty');
});

test('withdraw and bonus answers follow the same rules as the withdraw and deposit pages', { skip }, async () => {
  const RULES = {};
  for (const k of ['withdrawals', 'deposit_bonuses']) RULES[k] = (await db.query('SELECT value FROM settings WHERE key=$1', [k])).rows[0]?.value;
  const put = (k, value) => api('/admin/settings/' + k, { value }, ADMIN, 'PUT');
  const open = { ...(RULES.withdrawals || {}), suspended: false, requireDeposits: true, newMembersOpen: true, message: '' };
  const said = async (p, text) => { const r = await api('/support/message', { text }, p.token); return [...r.messages].reverse().find(m => m.from === 'bot').text; };
  try {
    await put('withdrawals', open);
    await put('deposit_bonuses', { ...RULES.deposit_bonuses, enabled: true, requireId: true });
    const p = await player('Esi Rules');
    assert.match(await said(p, 'my bonus'), /Deposit 1 earns a \d+% bonus/);
    assert.match(await said(p, 'I want to withdraw'), /not made a withdrawal yet.*Me > Withdraw/, 'a new member can withdraw before a first deposit');
    // after a first deposit the 3-deposit rule applies, exactly as on the withdraw page
    const d = await api('/wallet/deposit', { amount: 25, method: 'mobile_money', details: { phone: p.phone, network: 'mtn' } }, p.token);
    const ref = (await db.query('SELECT provider_ref FROM payments WHERE id=$1', [d.paymentId])).rows[0].provider_ref;
    await fetch(`${MOCK}/__approve/${ref}`, { method: 'POST' });
    for (let i = 0; i < 40; i++) { if ((await db.query('SELECT status FROM payments WHERE id=$1', [d.paymentId])).rows[0].status === 'success') break; await sleep(200); }
    assert.equal((await api('/wallet/options', null, p.token)).withdrawBlock.error, 'deposits_first');
    assert.match(await said(p, 'I want to withdraw'), /Deposit 1, 2 and 3 are done – 1 of 3/);
    // paused for everyone, with the admin's own words
    await put('withdrawals', { ...open, suspended: true, message: 'Bank maintenance until 6pm.' });
    assert.match(await said(p, 'I want to withdraw'), /paused for now – Bank maintenance until 6pm\. Your balance is safe/);
    // agents are not held by the 3-deposit rule (as with play-through), but a pause applies to them too
    await api(`/admin/users/${p.user.id}/agent`, { on: true }, ADMIN);
    assert.match(await said(p, 'I want to withdraw'), /paused/);
    await put('withdrawals', open);
    assert.equal((await api('/wallet/options', null, p.token)).withdrawBlock, null, 'an agent can withdraw');
    assert.match(await said(p, 'I want to withdraw'), /Me > Withdraw.*As an agent/);
    // with the ladder off, the welcome bonus is quoted from its own settings
    await put('deposit_bonuses', { ...RULES.deposit_bonuses, enabled: false });
    const wb = (await db.query(`SELECT value FROM settings WHERE key='welcome_bonus'`)).rows[0].value;
    assert.match(await said(await player('Yaw Welcome'), 'my bonus'), new RegExp(`${wb.GH.pct}% welcome bonus`));
  } finally { for (const [k, v] of Object.entries(RULES)) if (v) await put(k, v); }
});
