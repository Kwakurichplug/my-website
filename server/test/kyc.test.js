// Integration: ID verification with photos. The player sends details + the FRONT and BACK of the ID (a passport needs
// only the front); the photos are visible to admins only; the admin approves or rejects with a reason.
// Runs on the Moolre test server (see agents.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const BASE = process.env.MOOLRE_API_URL;
const skip = !BASE && 'set MOOLRE_API_URL to run';
const API = BASE + '/api';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/letbet_moolre' });
async function api(path, body, tok) {
  const res = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
async function player(name) {
  const phone = '24' + String(Math.floor(1e6 + Math.random() * 9e6));
  const r = await api('/auth/register', { country: 'GH', phone, password: 'Strong123', fullName: name });
  assert.ok(r.token, JSON.stringify(r)); return { token: r.token, user: r.user };
}
const photo = (n = 300000, b = 7) => 'data:image/jpeg;base64,' + Buffer.alloc(n, b).toString('base64');   // ~300 KB, like a phone photo after resizing
const details = { fullName: 'Akosua Mensah', dob: '1995-04-02', idType: 'Ghana Card', idNumber: 'GHA-123456789-0' };
let ADMIN;
before(async () => { if (skip) return; const a = await player('Admin KYC'); await db.query(`UPDATE users SET role='admin' WHERE id=$1`, [a.user.id]); ADMIN = a.token; });
after(() => db.end());

test('ID check: front and back photos, admin-only, approve / reject', { skip }, async () => {
  const p = await player('Akosua Mensah');
  assert.equal((await api('/auth/verify', details, p.token)).error, 'invalid', 'photos are required');
  assert.equal((await api('/auth/verify', { ...details, front: photo() }, p.token)).error, 'photo_back', 'a Ghana Card needs the back too');
  assert.equal((await api('/auth/verify', { ...details, front: 'data:image/jpeg;base64,AAAA', back: photo() }, p.token)).error, 'bad_photo', 'too small to read');
  assert.equal((await api('/auth/verify', { ...details, front: 'data:text/html;base64,' + Buffer.alloc(9000).toString('base64'), back: photo() }, p.token)).error, 'photo_front', 'images only');
  const ok = await api('/auth/verify', { ...details, front: photo(300000, 1), back: photo(250000, 2) }, p.token);
  assert.equal(ok.ok, true, JSON.stringify(ok)); assert.equal((await api('/auth/me', null, p.token)).user.limits.kyc.status, 'pending');

  // the admin's queue lists it with its photos; only admins can open them
  const q = (await api('/admin/kyc', null, ADMIN)).users.find(u => u.id === p.user.id);
  assert.ok(q); assert.deepEqual(q.kyc.photos, ['front', 'back']); assert.equal(q.kyc.idNumber, details.idNumber);
  const img = await fetch(`${API}/admin/users/${p.user.id}/kyc-photo/front`, { headers: { authorization: 'Bearer ' + ADMIN } });
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/jpeg'); assert.equal((await img.arrayBuffer()).byteLength, 300000);
  assert.match(img.headers.get('cache-control'), /no-store/);
  assert.equal((await fetch(`${API}/admin/users/${p.user.id}/kyc-photo/front`, { headers: { authorization: 'Bearer ' + p.token } })).status, 403, 'players cannot open ID photos');
  assert.ok([401, 403].includes((await fetch(`${API}/admin/users/${p.user.id}/kyc-photo/front`)).status), 'nor can anyone logged out');

  // reject with a reason → the player sends it again (photos replaced) → approve
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: false, reason: 'The photos are not clear – please retake them' }, ADMIN)).status, 'rejected');
  let me = (await api('/auth/me', null, p.token)).user;
  assert.equal(me.limits.kyc.status, 'rejected'); assert.match(me.limits.kyc.reason, /not clear/); assert.equal(me.verified, false);
  await api('/auth/verify', { ...details, front: photo(200000, 3), back: photo(200000, 4) }, p.token);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM kyc_documents WHERE user_id=$1', [p.user.id])).rows[0].n, 2, 'the new photos replace the old ones');
  assert.equal((await api(`/admin/users/${p.user.id}/kyc`, { approve: true }, ADMIN)).status, 'verified');
  me = (await api('/auth/me', null, p.token)).user;
  assert.equal(me.verified, true);

  // a passport needs only the front
  const p2 = await player('Kojo Asante');
  assert.equal((await api('/auth/verify', { ...details, fullName: 'Kojo Asante', idType: 'Passport', idNumber: 'G1234567', front: photo() }, p2.token)).ok, true);
});
