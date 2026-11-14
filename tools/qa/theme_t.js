const { chromium, devices } = require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});
const p=await c.newPage();await p.goto('http://127.0.0.1:8080/#/me');await p.waitForTimeout(2000);
await p.click('#themeBtn');const a=await p.evaluate(()=>[document.documentElement.dataset.theme,localStorage.getItem('lba_theme'),document.querySelector('#themeBtn span').textContent]);
await p.reload();await p.waitForTimeout(1500);const b2=await p.evaluate(()=>document.documentElement.dataset.theme);
await p.click('#themeBtn');const c2=await p.evaluate(()=>document.documentElement.dataset.theme);
console.log('toggle on:',a.join(','),'| after reload:',b2,'| toggle off:',c2);await b.close();})();
