import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:8000/quotes',{waitUntil:'networkidle',timeout:90000});
// list Amount column for the approved quote
const row=await p.locator('tr',{hasText:'Q-2026-0002'}).innerText();
console.log('LIST row:', row.replace(/\n/g,' | '));

await p.locator('tr',{hasText:'Q-2026-0002'}).click();
await p.waitForTimeout(700);
const totals=await p.locator('.q-totals').innerText();
console.log('\nDRAWER totals block:\n' + totals.split('\n').filter(Boolean).map(l=>'  '+l).join('\n'));
await b.close();
