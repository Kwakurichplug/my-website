// Mock of the Moolre API for tests (no real money, no network): Mobile Money collections with the number check (SMS
// code → TP14 / TP15 / TP17), the USSD prompt (TR099), the status call, payouts (final, in progress, refused,
// dropped answer), account status / callback update – and signed webhooks back to our server, like the real thing.
//   node tools/qa/mock_moolre.js <port> <ourServerUrl>
//   server env: MOOLRE_BASE=http://127.0.0.1:<port> MOOLRE_USER=letbet MOOLRE_PUBLIC_KEY=pub_mock
//               MOOLRE_PRIVATE_KEY=priv_mock MOOLRE_ACCOUNT_NUMBER=10000000001 MOOLRE_WEBHOOK_SECRET=whsec_mock
// Payers starting 020 / 050 must pass the number check once (code 123456). Payers ending 0000 are refused at once.
// Test hooks: POST /__approve/<ref> (paid → payment.succeeded webhook), /__approve_silent/<ref> (paid, no webhook),
//             /__decline/<ref> (failed → payment.failed webhook), /__state {...}, /__replay {event,data,sign},
//             GET /__charges/<ref>, GET /__transfers/<ref>
const http = require('http');
const { createHmac, randomUUID } = require('crypto');
const PORT = +process.argv[2] || 9099, SERVER = (process.argv[3] || 'http://127.0.0.1:8097').replace(/\/$/, '');
const USER = 'letbet', PUB = 'pub_mock', PRIV = 'priv_mock', ACCT = '10000000001', SECRET = 'whsec_mock';
const charges = new Map(), transfers = new Map(), verified = new Set(), idem = new Map();
const state = { failTransfers: false, instantPayout: false, lowBalance: false, notWhitelisted: false, dropTransferResponse: false, balance: 1234.5, callback: '' };
let txid = 31770000;
const json = (res, body) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ go: null, meta: { requestid: randomUUID(), notices: [] }, ...body })); };

async function hook(event, data, sign = true) {
  const body = JSON.stringify({ status: data.txstatus === 1 ? 1 : 0, code: event.endsWith('succeeded') ? 'P01' : 'P02', message: event.endsWith('succeeded') ? 'Transaction Successful' : 'Transaction Failed',
    data: sign === 'legacy' ? { ...data, secret: SECRET } : data, go: null, event_id: 'evt_' + randomUUID().replace(/-/g, '').slice(0, 24), event, created: new Date().toISOString() });
  const t = Math.floor(Date.now() / 1000) - (sign === 'old' ? 600 : 0);
  const headers = { 'content-type': 'application/json', 'user-agent': 'Moolre-Webhooks/1', 'x-moolre-event': event };
  if (sign === true || sign === 'old') headers['x-moolre-signature'] = `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
  if (sign === 'bad') headers['x-moolre-signature'] = `t=${t},v1=${'0'.repeat(64)}`;
  try { const r = await fetch(SERVER + '/api/payments/moolre/webhook', { method: 'POST', headers, body }); return r.status; } catch (e) { console.error('webhook', e.message); return 0; }
}
const chargeData = c => ({ txstatus: c.txstatus, payer: c.payer, payername: 'TEST PAYER', payernetwork: c.channel, accountnumber: ACCT, amount: c.amount, value: (Number(c.amount) * 0.99).toFixed(2), transactionid: c.txstatus === 1 ? c.transactionid : null, externalref: c.ref, thirdpartyref: '', ts: new Date().toISOString().slice(0, 19).replace('T', ' '), ...(c.txstatus === 2 ? { reason: c.reason } : {}) });
const transferData = t => ({ txstatus: t.txstatus, receiver: t.receiver, transactionid: t.transactionid, externalref: t.ref, receivername: 'TEST RECEIVER', amount: t.amount, amountfee: (Number(t.amount) * 1.01).toFixed(2), fee: (Number(t.amount) * 0.01).toFixed(2) });

http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', async () => {
    const u = new URL(req.url, 'http://x'); let b = {};
    try { b = raw ? JSON.parse(raw) : {}; } catch { return json(res, { status: 0, code: 'BAD_JSON', message: 'Invalid JSON' }); }
    const h = req.headers;
    // ---- test hooks ----
    if (u.pathname.startsWith('/__')) {
      const ref = decodeURIComponent(u.pathname.split('/')[2] || ''), c = charges.get(ref);
      if (u.pathname.startsWith('/__approve/') && c) { c.txstatus = 1; c.transactionid = String(++txid); return json(res, { status: 1, data: { webhook: await hook('payment.succeeded', chargeData(c)) } }); }
      if (u.pathname.startsWith('/__approve_silent/') && c) { c.txstatus = 1; c.transactionid = String(++txid); return json(res, { status: 1 }); }
      if (u.pathname.startsWith('/__decline/') && c) { c.txstatus = 2; c.reason = 'LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED'; return json(res, { status: 1, data: { webhook: await hook('payment.failed', chargeData(c)) } }); }
      if (u.pathname.startsWith('/__charges/')) return json(res, { status: c ? 1 : 0, data: c || null });
      if (u.pathname.startsWith('/__transfers/')) return json(res, { status: transfers.has(ref) ? 1 : 0, data: transfers.get(ref) || null });
      if (u.pathname === '/__state') { Object.assign(state, b); return json(res, { status: 1, data: state }); }
      if (u.pathname === '/__replay') return json(res, { status: 1, data: { webhook: await hook(b.event, b.data, b.sign === undefined ? true : b.sign) } });
      return json(res, { status: 0, code: 'NOT_FOUND' });
    }
    if (req.method !== 'POST') return json(res, { status: 0, code: 'METHOD', message: 'POST only' });
    if (h['x-api-user'] !== USER) return json(res, { status: 0, code: 'AIN05', message: 'Credentials rejected' });
    const pub = h['x-api-pubkey'] === PUB, priv = h['x-api-key'] === PRIV, anyKey = pub || priv || h['x-api-key'] === PUB;
    if (b.type !== 1) return json(res, { status: 0, code: 'TP10', message: 'Request type invalid' });
    if (b.accountnumber !== ACCT) return json(res, { status: 0, code: 'TP04', message: 'Account not found' });

    if (u.pathname === '/open/transact/payment') {
      if (!pub) return json(res, { status: 0, code: 'TP00', message: 'Authentication failed' });
      if (b.currency !== 'GHS') return json(res, { status: 0, code: 'TP01', message: 'Currency invalid' });
      if (!/^0\d{9}$/.test(String(b.payer || ''))) return json(res, { status: 0, code: 'TP06', message: 'Payer details required' });
      if (!['MTN', 'TELECEL', 'AT'].includes(String(b.channel).toUpperCase())) return json(res, { status: 0, code: 'TP08', message: 'Request incomplete' });
      if (!(typeof b.amount === 'string' && Number(b.amount) > 0.01)) return json(res, { status: 0, code: 'TP05', message: 'Amount must be greater than 0.01' });
      if (!b.externalref) return json(res, { status: 0, code: 'TP07', message: 'External Reference is required' });
      if (/^0(20|50)/.test(b.payer) && !verified.has(b.payer)) {
        if (b.otpcode == null) return json(res, { status: 0, code: 'TP14', message: 'Please complete the verification process sent to you via SMS and try again.', data: 'all' });
        if (String(b.otpcode) !== '123456') return json(res, { status: 0, code: 'TP15', message: 'Invalid Phone no. Verification Code, Please request a code.' });
        verified.add(b.payer); return json(res, { status: 1, code: 'TP17', message: 'Phone number verification successful.' });
      }
      if (charges.has(b.externalref)) return json(res, { status: 0, code: 'TP13', message: 'External Reference is required and must be unique.' });
      if (b.payer.endsWith('0000')) return json(res, { status: 0, code: 'TP99', message: 'This wallet cannot receive payment requests.' });
      charges.set(b.externalref, { ref: b.externalref, amount: b.amount, payer: b.payer, channel: String(b.channel).toUpperCase(), txstatus: 0 });
      return json(res, { status: 1, code: 'TR099', message: null, data: randomUUID() });
    }
    if (u.pathname === '/open/transact/status') {
      if (!anyKey) return json(res, { status: 0, code: 'SS00', message: 'Authentication failed' });
      if (b.idtype !== '1') return json(res, { status: 0, code: 'SS06', message: 'idtype invalid' });
      const c = charges.get(b.id), t = transfers.get(b.id);
      if (!c && !t) return json(res, { status: 0, code: 'SS07', message: 'Transaction not found', data: null });
      const d = c ? chargeData(c) : transferData(t);
      if (d.txstatus === 1) return json(res, { status: 1, code: 'SS01', message: 'Transaction Successful', data: d });
      if (d.txstatus === 2) return json(res, { status: 0, code: 'SS02', message: 'Transaction Failed', data: d });
      return json(res, { status: 1, code: 'SS08', message: 'Transaction Pending', data: d });
    }
    if (u.pathname === '/open/transact/transfer') {
      if (!priv) return json(res, { status: 0, code: 'AIN05', message: 'Credentials rejected' });
      const key = h['idempotency-key'];
      if (key && idem.has(key)) { const prev = idem.get(key); if (prev.raw !== raw) return json(res, { status: 0, code: 'IDEM01', message: 'Idempotency key reused' }); return json(res, { ...prev.body, meta: { replayed: true } }); }
      const send = body => { if (key) idem.set(key, { raw, body }); return json(res, body); };
      if (state.notWhitelisted) return send({ status: 0, code: 'TK01', message: 'IP not whitelisted' });
      if (state.lowBalance) return send({ status: 0, code: 'APY21', message: 'Insufficient wallet balance' });
      if (!/^0\d{9}$/.test(String(b.receiver || '')) || !['MTN', 'TELECEL', 'AT'].includes(String(b.channel).toUpperCase())) return send({ status: 0, code: 'APY06', message: 'Recipient details required' });
      if (transfers.has(b.externalref)) return send({ status: 0, code: 'PY05', message: 'externalref already used' });
      const t = { ref: b.externalref, amount: b.amount, receiver: b.receiver, txstatus: 0, transactionid: String(++txid), sendername: b.sendername };
      transfers.set(b.externalref, t);
      const finish = () => { t.txstatus = state.failTransfers ? 2 : 1; return hook(state.failTransfers ? 'payout.failed' : 'payout.succeeded', transferData(t)); };
      if (state.dropTransferResponse) { setTimeout(finish, 400); return req.socket.destroy(); }
      if (state.instantPayout) { t.txstatus = 1; return send({ status: '1', code: 'OBGH01', message: ['Pay out Successful', 'Click close to view transactions.'], data: transferData(t) }); }
      setTimeout(finish, 400);
      return send({ status: 1, code: 'APY16', message: 'Pay out in Progress', data: transferData(t) });
    }
    if (u.pathname === '/open/transact/validate') {
      if (!anyKey) return json(res, { status: 0, code: 'AVD00', message: 'Authentication failed' });
      const rcv = String(b.receiver || '');
      if (!/^0\d{9}$/.test(rcv)) return json(res, { status: 0, code: 'AVD05', message: 'Recipient details required' });
      if (rcv.endsWith('9999')) return json(res, { status: 0, code: 'AVD02', message: 'Request type invalid.' });   // no wallet on this number
      return json(res, { status: 1, code: 'AVD01', message: 'Successful', data: (state.names || {})[rcv] || 'KOFI TEST' });
    }
    if (u.pathname === '/open/account/status') {
      if (!priv) return json(res, { status: 0, code: 'SW05', message: 'Authentication required' });
      return json(res, { status: 1, code: 'SW01', message: 'Wallet Found', data: { balance: state.balance, accountname: 'LETBETAFRIKA TEST', activated: '1', callback: state.callback } });
    }
    if (u.pathname === '/open/account/update') {
      if (!priv) return json(res, { status: 0, code: 'AIN05', message: 'Credentials rejected' });
      state.callback = String(b.callback || ''); return json(res, { status: 1, code: 'AU01', message: 'Account updated', data: { callback: state.callback, secret: SECRET } });
    }
    json(res, { status: 0, code: 'NOT_FOUND', message: 'Unknown endpoint' });
  });
}).listen(PORT, () => console.log('mock moolre on', PORT, '→ webhooks to', SERVER));
