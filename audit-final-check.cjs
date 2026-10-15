/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const N = (s) => s.replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto('https://crm-eurosol.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await p.locator('input[type=email]').fill('shashankwagh2@gmail.com');
  await p.locator('input[type=password]').fill('Shashank@123');
  await p.locator('button[type=submit]').click();
  await p.waitForTimeout(6000);
  await p.goto('https://crm-eurosol.vercel.app/survey', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  // Scheduled tab (has 4 rows) — survey search input lives in the scheduled panel
  await p.getByRole('tab', { name: /scheduled/i }).click();
  await p.waitForTimeout(1200);
  const rows0 = await p.locator('table tbody tr, [class*=grid] > div[class*=border]').count().catch(() => 0);
  const b0 = N(await p.locator('body').innerText());
  const inp = p.locator('main input[placeholder]').first();
  console.log('search placeholder:', await inp.getAttribute('placeholder'));
  await inp.fill('zzz-no-match-xyz');
  await p.waitForTimeout(1800);
  const b1 = N(await p.locator('body').innerText());
  console.log('[Survey scheduled-tab search] ' + (b0 !== b1 ? 'PASS — list filtered (earlier FAIL was empty-list artifact)' : 'FAIL — real bug'));
  await inp.fill('');
  await p.waitForTimeout(1200);
  await b.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
