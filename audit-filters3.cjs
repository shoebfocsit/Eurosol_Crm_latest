/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const N = (s) => s.replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  const calls = [];
  p.on('request', (r) => { if (r.url().includes('api.eurosolservice')) calls.push(r.url().replace('https://api.eurosolservice.com/v1', '').slice(0, 80)); });
  await p.goto('https://crm-eurosol.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await p.locator('input[type=email]').fill('shashankwagh2@gmail.com');
  await p.locator('input[type=password]').fill('Shashank@123');
  await p.locator('button[type=submit]').click();
  await p.waitForTimeout(6000);

  // 1. Survey REAL search (page-level, not navbar)
  await p.goto('https://crm-eurosol.vercel.app/survey', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.getByRole('tab', { name: /new leads/i }).click();
  await p.waitForTimeout(1500);
  const realSearch = p.getByPlaceholder('Search leads by name, phone, city...');
  const before = N(await p.locator('body').innerText());
  await realSearch.fill('zzz-no-match-xyz');
  await p.waitForTimeout(1500);
  const after = N(await p.locator('body').innerText());
  console.log('[Survey page search] ' + (before !== after ? 'PASS — list changed' : 'FAIL — IDENTICAL (real bug)'));

  // 2. Customers STANDARD segment
  await p.goto('https://crm-eurosol.vercel.app/customers', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const cr0 = await p.locator('table tbody tr').count().catch(() => 0);
  const t = p.locator('[data-slot=select-trigger]').filter({ hasText: /segment/i }).first();
  await t.click(); await p.waitForTimeout(900);
  await p.getByRole('option', { name: 'STANDARD' }).click();
  await p.waitForTimeout(2500);
  const cr1 = await p.locator('table tbody tr').count().catch(() => 0);
  const trigTxt = N(await t.innerText().catch(() => ''));
  console.log(`[Customers segment STANDARD] rows ${cr0}->${cr1} trigger="${trigTxt}" ` + (cr0 !== cr1 || /standard/i.test(trigTxt) ? 'PASS' : 'FAIL'));

  // 3. Installations region: pick non-default region
  await p.goto('https://crm-eurosol.vercel.app/installations', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const ir0 = await p.locator('table tbody tr').count().catch(() => 0);
  const it = p.locator('[data-slot=select-trigger]').filter({ hasText: /region/i }).first();
  await it.click(); await p.waitForTimeout(900);
  const iopts = await p.getByRole('option').allInnerTexts().then((a) => a.map(N));
  const ipi = iopts.findIndex((x) => !/^all/i.test(x) && x.length > 0);
  if (ipi >= 0) {
    await p.getByRole('option').nth(ipi).click();
    await p.waitForTimeout(2500);
    const ir1 = await p.locator('table tbody tr').count().catch(() => 0);
    console.log(`[Installations region] pick="${iopts[ipi]}" rows ${ir0}->${ir1} ` + (ir0 !== ir1 ? 'PASS' : 'same — ' + (await p.locator('body').innerText()).includes('No ') ? 'empty state shown (PASS — correct filter)' : 'CHECK'));
  }

  // 4. Employees role filter — same race? (role select change on page 1)
  await p.goto('https://crm-eurosol.vercel.app/employees', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  calls.length = 0;
  const rt = p.locator('[data-slot=select-trigger]').filter({ hasText: /role/i }).first();
  await rt.click(); await p.waitForTimeout(900);
  await p.getByRole('option', { name: 'ENGINEER' }).click().catch(() => {});
  await p.waitForTimeout(2500);
  const empCalls = calls.filter((u) => u.includes('/employees'));
  console.log('[Employees role filter API] ' + (empCalls.length ? 'PASS — ' + empCalls.join(';') : 'FAIL — NO API (same race bug)'));

  await b.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
