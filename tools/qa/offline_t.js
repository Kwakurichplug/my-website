const { chromium, devices } = require('playwright');
(async()=>{const b=await chromium.launch();const c=await b.newContext({...devices['iPhone 13']});await c.addInitScript(()=>{try{sessionStorage.setItem('lba_splash','1')}catch{}});
const p=await c.newPage();await p.goto('http://127.0.0.1:8080/#/home');await p.waitForTimeout(2000);
await c.setOffline(true);await p.waitForTimeout(500);const a=await p.evaluate(()=>[document.querySelector('#netBar')?.className,document.querySelector('#netBar')?.textContent]);
await c.setOffline(false);await p.waitForTimeout(500);const z=await p.evaluate(()=>document.querySelector('#netBar').textContent);
console.log(a, '|', z);await b.close();})();
