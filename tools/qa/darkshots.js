const { chromium, devices } = require('playwright');
const S = process.argv[2];
const routes = ['home','sports','list/football/all','league/0','codes','promos','promo/welcome','results','me','acct/bets','acct/tx','acct/verify','deposit','withdraw','login','register','match'];
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13'],deviceScaleFactor:1});
await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1');localStorage.setItem('lba_theme','dark')}catch{}});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:8080/#/home');await p.waitForTimeout(2500);
const mid=await p.evaluate(()=>document.querySelector('[data-mid]').dataset.mid);
const imgs=[];
for(const r of routes){await p.goto('http://127.0.0.1:8080/#/'+(r==='match'?'match/'+mid:r));await p.waitForTimeout(700);imgs.push((await p.screenshot()).toString('base64'));}
const q=await (await b.newContext({viewport:{width:6*200+70,height:3*440+40},deviceScaleFactor:1})).newPage();
await q.setContent('<body style="margin:0;background:#888;display:flex;flex-wrap:wrap;gap:10px;padding:10px">'+imgs.map(x=>`<img src="data:image/png;base64,${x}" style="width:195px;height:422px">`).join('')+'</body>');
await q.screenshot({path:S+'/dark-grid.png'});console.log('errors',errs);await b.close();})();
