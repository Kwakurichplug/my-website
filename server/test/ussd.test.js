// Integration: Ghana manual deposits by USSD. The admin sets the code in Payment settings; Ghana players see a USSD
// option next to Mobile Money; they pay and type the transaction ID; the deposit waits for the admin, who confirms it.
// Runs on the Moolre test server (see agents.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.MOOLRE_API_URL;
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
async function api(path, body, tok, method) {
  const res = await fetch(API + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { http: res.status, ...(await res.json().catch(() => ({}))) };
}
async function player(name, cc = 'GH') {
  const phone = cc === 'GH' ? '24' + String(Math.floor(1e6 + Math.random() * 9e6)) : '80' + String(Math.floor(1e7 + Math.random() * 9e7));
  const r = await api('/auth/register', { country: cc, phone, password: 'Strong123', fullName: name });
  assert.ok(r.token, JSON.stringify(r)); return { token: r.token, user: r.user, phone };
}
let ADMIN, saved;
before(async () => { if (skip) return; const a = await player('Admin USSD'); await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.user.id]); ADMIN = a.token; });
after(async () => { if (saved && ADMIN) await api('/admin/payment-settings', saved, ADMIN, 'PUT'); await db.end(); });

test('USSD deposits: set by the admin, paid by the player with a transaction ID, confirmed by the admin', { skip }, async () => {
  const st = (await api('/admin/payment-settings', null, ADMIN)).settings;
  saved = { NG: st.NG, GH: { ...st.GH, ussd: st.GH.ussd } };
  assert.equal((await api('/admin/payment-settings', { NG: st.NG, GH: { ...st.GH, ussd: { code: '203*0778606', name: '', note: '' } } }, ADMIN, 'PUT')).http, 400, 'a code must look like *203*0778606#');
  const ok = await api('/admin/payment-settings', { NG: st.NG, GH: { ...st.GH, ussd: { code: '*203*0778606#', name: 'LetBetAfrika', note: 'Use your account reference if asked' } } }, ADMIN, 'PUT');
  assert.equal(ok.http, 200, JSON.stringify(ok));

  const p = await player('Kwabena Ussd');
  const o = await api('/wallet/options', null, p.token);
  const way = o.deposit.find(d => d.method === 'ussd');
  assert.ok(way, JSON.stringify(o.deposit)); assert.equal(way.mode, 'manual'); assert.equal(way.account.code, '*203*0778606#');
  assert.ok(o.deposit.some(d => d.method === 'mobile_money' && d.mode === 'api'), 'automatic MoMo stays');
  const ng = await player('Ngozi', 'NG');
  assert.ok(!(await api('/wallet/options', null, ng.token)).deposit.some(d => d.method === 'ussd'), 'Ghana only');

  assert.equal((await api('/wallet/deposit', { amount: 30, method: 'ussd', details: { phone: p.phone, network: 'mtn' } }, p.token)).error, 'txid_required');
  const d = await api('/wallet/deposit', { amount: 30, method: 'ussd', details: { phone: p.phone, network: 'mtn', txid: '51234567890' } }, p.token);
  assert.equal(d.status, 'pending'); assert.ok(d.next.rows.some(r => r[0] === 'Transaction ID' && r[1] === '51234567890'));
  const row = (await db.query('SELECT provider, status, method, details FROM payments WHERE id=$1', [d.paymentId])).rows[0];
  assert.equal(row.provider, 'manual'); assert.equal(row.method, 'ussd'); assert.equal(row.details.txid, '51234567890'); assert.equal(row.details.ussd, '*203*0778606#');
  assert.equal((await api('/wallet', null, p.token)).balance, 0, 'not credited before the admin confirms');

  // the admin confirms it → credited
  const q = (await api('/admin/payments?status=pending', null, ADMIN)).payments.find(x => x.id === d.paymentId);
  assert.ok(q && q.details.txid === '51234567890');
  const c = await api(`/admin/payments/${d.paymentId}/approve`, { amount: 30 }, ADMIN);
  assert.ok(c.http === 200, JSON.stringify(c));
  assert.equal((await api('/wallet', null, p.token)).balance, 30);
});
