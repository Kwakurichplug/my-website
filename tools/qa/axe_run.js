const { chromium, devices } = require('playwright');
const fs = require('fs');
const AXE = fs.readFileSync(process.argv[2] + '/axe/node_modules/axe-core/axe.min.js', 'utf8');
const routes = ['home','live','sports','list/football/all','league/0','match','jackpot','promos','results','codes','me','deposit','withdraw','register','login','instant','virtuals','games','acct/tx'];
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});
const p=await c.newPage();await p.goto('file:///home/user/my-website/betting/index.html#/login');await p.waitForTimeout(1500);
await p.fill('#loginForm [name=phone]','08033334444');await p.fill('#loginForm [name=pw]','x');await p.click('#loginBtn');await p.waitForTimeout(1200);
const mid=await p.evaluate(()=>document.querySelector('[data-mid]')?.dataset.mid);
const agg={};
for(const r of routes){await p.goto('file:///home/user/my-website/betting/index.html#/'+(r==='match'?'match/'+mid:r));await p.waitForTimeout(700);
 await p.evaluate(AXE);
 const res=await p.evaluate(async()=>{const r=await axe.run(document.querySelector('.page.active')||document,{runOnly:['wcag2a','wcag2aa'],resultTypes:['violations']});return r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:v.nodes.slice(0,3).map(x=>x.target.join(' ')+' :: '+(x.failureSummary||'').split('\n')[1])}))});
 res.forEach(v=>{agg[v.id]=agg[v.id]||{impact:v.impact,pages:[],n:0,ex:[]};agg[v.id].pages.push(r);agg[v.id].n+=v.n;if(agg[v.id].ex.length<30)agg[v.id].ex.push(...v.ex.slice(0,3).map(e=>r+': '+e));});}
for(const [id,v] of Object.entries(agg).sort((a,b)=>b[1].n-a[1].n)){console.log(`${id} [${v.impact}] x${v.n} on ${v.pages.length} pages`);v.ex.slice(0,30).forEach(e=>console.log('    ',e.slice(0,220)));}
await b.close();})();
