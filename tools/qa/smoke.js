const { chromium, devices } = require('playwright');
const routes = ['home','live','live/basketball','sports','list/football/today','list/football/all/0,1','list/football/all/out','league/0','jackpot','jackpot/results','jackpot/how','jackpot/tickets','promos','promos/games','promo/welcome','results','codes','bet/x','me','acct/bets','acct/tx','match/','virtuals','games','deposit','withdraw','register','login','legal/terms'];
(async()=>{const b=await chromium.launch();
for (const base of ['http://127.0.0.1:8080/','file:///home/user/my-website/betting/index.html']) {
 const ctx=await b.newContext({...devices['iPhone 13']}); await ctx.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(p.url().split('#')[1]+': '+e.message));
 await p.goto(base+'#/home'); await p.waitForTimeout(2500);
 const mid = await p.evaluate(()=>document.querySelector('[data-mid]')?.dataset.mid);
 const over=[];
 for (const r of routes){ await p.goto(base+'#/'+(r==='match/'?'match/'+mid:r)); await p.waitForTimeout(450);
   const o=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1); if(o) over.push(r);
   const empty=await p.evaluate(()=>{const s=document.querySelector('.page.active'); return !s || s.innerText.trim().length<5}); if(empty) over.push('EMPTY:'+r); }
 console.log(base.slice(0,22), 'errors:', errs.length? errs : 'none', '| overflow/empty:', over.length?over:'none');
 await ctx.close(); }
await b.close();})();
