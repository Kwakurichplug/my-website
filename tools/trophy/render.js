// node render.js "<query string>" out.png  – serves this folder, renders trophy.html in headless Chromium (WebGL via SwiftShader)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1', async () => {
  const port = srv.address().port, qs = process.argv[2] || '', out = process.argv[3] || 'out.png';
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const pg = await b.newPage();
  pg.on('console', m => console.log('page:', m.text()));
  pg.on('pageerror', e => console.log('PAGE ERROR', e.message));
  const t0 = Date.now();
  await pg.goto(`http://127.0.0.1:${port}/trophy.html?${qs}`);
  await pg.waitForFunction(() => window.__png || window.__err, null, { timeout: 600000 });
  const r = await pg.evaluate(() => ({ err: window.__err, png: window.__png, info: window.__info }));
  if (r.err) console.log('render error:', r.err);
  else { fs.writeFileSync(out, Buffer.from(r.png.split(',')[1], 'base64')); console.log('saved', out, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(r.info || {})); }
  await b.close(); srv.close();
});
