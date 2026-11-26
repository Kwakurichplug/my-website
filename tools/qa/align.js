const { chromium, devices } = require('playwright');
(async()=>{const b=await chromium.launch();
for (const [name,opts] of [['desktop',{viewport:{width:1440,height:900}}],['phone',{...devices['iPhone 13']}]]) {
const c=await b.newContext(opts);await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});const p=await c.newPage();
for (const r of ['home','live','list/football/all','league/0']) {
 await p.goto('http://127.0.0.1:8080/#/'+r);await p.waitForTimeout(1800);
 const res=await p.evaluate(()=>{const out=[];document.querySelectorAll('.page.active .day-sep, .page.active .league-head').forEach(h=>{
   const labels=[...h.querySelectorAll('.cols span')].filter(s=>s.offsetParent);
   let row=h.nextElementSibling; while(row&&!row.classList.contains('ev'))row=row.nextElementSibling; if(!row)return;
   const btns=[...row.querySelectorAll('.ev-odds > *')].filter(s=>s.offsetParent);
   if(labels.length!==btns.length){out.push('count '+labels.length+'≠'+btns.length);return;}
   labels.forEach((l,i)=>{const a=l.getBoundingClientRect(),bb=btns[i].getBoundingClientRect();const d=Math.round((a.left+a.width/2)-(bb.left+bb.width/2));if(Math.abs(d)>2)out.push(`col${i} off ${d}px`);});});
   return out.length?[...new Set(out)].slice(0,4).join(', '):'aligned';});
 console.log(name.padEnd(8),r.padEnd(18),res);}
await c.close();}
await b.close();})();
