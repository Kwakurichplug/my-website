const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
const shot=async(url,ours,f)=>{const c=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});if(ours)await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});const p=await c.newPage();await p.goto(url,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});await p.waitForTimeout(ours?2500:8000);
if(!ours)await p.evaluate(()=>document.querySelectorAll('[class*="dialog"],[class*="popup"],[class*="Popup"],[class*="mask"]').forEach(e=>{if(getComputedStyle(e).position==='fixed')e.style.display='none'}));
await p.screenshot({path:f});await c.close();};
await shot('https://www.sportybet.com/ng/','',process.argv[2]+'/desk-ref.png');
await shot('http://127.0.0.1:8080/#/home',1,process.argv[2]+'/desk-our.png');
await shot('http://127.0.0.1:8080/#/live',1,process.argv[2]+'/desk-our-live.png');
await b.close();})();
