// Mock of the Paystack API for tests (no real money, no network): Mobile Money charges, the Telecel OTP step,
// verify, payouts, balance – and signed webhooks back to our server, like the real thing.
//   node tools/qa/mock_paystack.js <port> <ourServerUrl>      (server env: PAYSTACK_BASE=http://127.0.0.1:<port>
//                                                              PAYSTACK_SECRET_KEY=sk_test_mock)
// Test hooks: POST /__approve/<ref> (player approves → charge.success webhook), POST /__decline/<ref>,
//             POST /__state {"failTransfers":true}
const http = require('http');
const { createHmac } = require('crypto');
const PORT = +process.argv[2] || 9098, SERVER = (process.argv[3] || 'http://127.0.0.1:8096').replace(/\/$/, ''), KEY = 'sk_test_mock';
const charges = new Map(), transfers = new Map(), state = { failTransfers: false };
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const ok = (res, data, message = 'ok') => json(res, 200, { status: true, message, data });
async function hook(event, data) {
  const body = JSON.stringify({ event, data });
  const sig = createHmac('sha512', KEY).update(body).digest('hex');
  try { await fetch(SERVER + '/api/payments/paystack/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-paystack-signature': sig }, body }); } catch (e) { console.error('webhook', e.message); }
}
http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', async () => {
    const u = new URL(req.url, 'http://x'), b = raw ? JSON.parse(raw) : {};
    if (u.pathname.startsWith('/__')) {
      const ref = decodeURIComponent(u.pathname.split('/')[2] || ''), c = charges.get(ref);
      if (u.pathname.startsWith('/__approve/') && c) { c.status = 'success'; await hook('charge.success', { reference: ref, amount: c.amount, currency: c.currency, status: 'success' }); return ok(res, c); }
      if (u.pathname.startsWith('/__approve_silent/') && c) { c.status = 'success'; return ok(res, c); }       // no webhook: our verify must find it
      if (u.pathname.startsWith('/__decline/') && c) { c.status = 'failed'; return ok(res, c); }
      if (u.pathname === '/__state') { Object.assign(state, b); return ok(res, state); }
      if (u.pathname === '/__replay') { await hook(b.event, b.data); return ok(res, {}); }
      return json(res, 404, { status: false, message: 'not found' });
    }
    if (req.headers.authorization !== 'Bearer ' + KEY) return json(res, 401, { status: false, message: 'Invalid key' });
    if (req.method === 'POST' && u.pathname === '/charge') {
      if (!b.reference || !b.amount || b.currency !== 'GHS' || !b.mobile_money?.phone) return json(res, 400, { status: false, message: 'Invalid charge' });
      if (charges.has(b.reference)) return json(res, 400, { status: false, message: 'Duplicate Transaction Reference' });
      const c = { reference: b.reference, amount: b.amount, currency: b.currency, provider: b.mobile_money.provider, phone: b.mobile_money.phone, status: 'pay_offline' };
      if (b.mobile_money.phone.endsWith('0000')) c.status = 'failed';
      else if (c.provider === 'vod') c.status = 'send_otp';
      charges.set(b.reference, c);
      return ok(res, { reference: c.reference, status: c.status, display_text: c.status === 'send_otp' ? 'Enter the code sent to your phone' : c.status === 'failed' ? 'Declined' : 'Please complete authorization process on your mobile phone' });
    }
    if (req.method === 'POST' && u.pathname === '/charge/submit_otp') {
      const c = charges.get(b.reference); if (!c) return json(res, 404, { status: false, message: 'Charge not found' });
      if (b.otp !== '123456') return json(res, 400, { status: false, message: 'Invalid OTP' });
      c.status = 'success'; return ok(res, { reference: c.reference, status: 'success' });
    }
    if (req.method === 'GET' && u.pathname.startsWith('/transaction/verify/')) {
      const c = charges.get(decodeURIComponent(u.pathname.split('/').pop())); if (!c) return json(res, 404, { status: false, message: 'Transaction reference not found' });
      return ok(res, { reference: c.reference, status: c.status === 'pay_offline' || c.status === 'send_otp' ? 'ongoing' : c.status, amount: c.amount, currency: c.currency });
    }
    if (req.method === 'POST' && u.pathname === '/transferrecipient') {
      if (b.type !== 'mobile_money' || !['MTN', 'VOD', 'ATL'].includes(b.bank_code) || !/^0\d{9}$/.test(b.account_number)) return json(res, 400, { status: false, message: 'Invalid recipient' });
      return ok(res, { recipient_code: 'RCP_' + b.account_number });
    }
    if (req.method === 'POST' && u.pathname === '/transfer') {
      if (!b.reference || !b.recipient || !b.amount) return json(res, 400, { status: false, message: 'Invalid transfer' });
      transfers.set(b.reference, b);
      setTimeout(() => hook(state.failTransfers ? 'transfer.failed' : 'transfer.success', { reference: b.reference, amount: b.amount, status: state.failTransfers ? 'failed' : 'success', reason: state.failTransfers ? 'Recipient wallet not found' : undefined }), 400);
      return ok(res, { reference: b.reference, status: 'pending', transfer_code: 'TRF_' + transfers.size });
    }
    if (req.method === 'GET' && u.pathname === '/balance') return ok(res, [{ currency: 'GHS', balance: 1234500 }]);
    json(res, 404, { status: false, message: 'Not found' });
  });
}).listen(PORT, () => console.log('mock paystack on', PORT, '→ webhooks to', SERVER));
