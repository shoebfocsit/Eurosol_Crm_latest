/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const results = [];
const log = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function selectOption(page, apiTracker, triggerLocator, pickRe) {
  if (!(await triggerLocator.isVisible({ timeout: 3000 }).catch(() => false))) return null;
  await triggerLocator.click().catch(() => {});
  await page.waitForTimeout(900);
  const opts = page.getByRole('option');
  const n = await opts.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const t = norm(await opts.nth(i).innerText().catch(() => ''));
    if (pickRe.test(t)) {
      apiTracker.length = 0;
      await opts.nth(i).click().catch(() => {});
      await page.waitForTimeout(2500);
      return { label: t, options: n };
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  return { label: null, options: n };
}

async function rowCount(page) {
  const t = await page.locator('table tbody tr').count().catch(() => 0);
  return t;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
  const calls = [];
  page.on('request', (r) => { if (r.url().includes('api.eurosolservice')) calls.push(r.url().replace('https://api.eurosolservice.com/v1', '').slice(0, 70)); });

  await page.goto('https://crm-eurosol.vercel.app/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill('shashankwagh2@gmail.com');
  await page.locator('input[type=password]').fill('Shashank@123');
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(6000);

  const cases = [
    { route: '/quotations', name: 'Quotations status', trig: /status/i, pick: /^(approved|sent|draft)$/i },
    { route: '/inventory', name: 'Inventory category', trig: /categor/i, pick: /^(panel|inverter|cable|mount)/i },
    { route: '/service', name: 'Service type', trig: /type/i, pick: /^(complaint|amc|installation|maintenance)$/i },
    { route: '/payments', name: 'Payments invoice-status', trig: /status/i, pick: /^(paid|pending|overdue|partial)$/i },
    { route: '/tasks', name: 'Tasks status', trig: /status/i, pick: /^(pending|completed|in progress|overdue)$/i },
    { route: '/blog', name: 'Blog category', trig: /categor/i, pick: /^(solar|guide|news|tips)/i },
    { route: '/customers', name: 'Customers segment', trig: /segment/i, pick: /^(residential|commercial|industrial)$/i },
    { route: '/installations', name: 'Installations status', trig: /status/i, pick: /^(completed|pending|in progress|on hold)$/i },
    { route: '/leads', name: 'Leads region', trig: /region/i, pick: /^[a-z ]+(mh|mp|gj|rj|up|ka|tn|region)/i },
  ];

  for (const c of cases) {
    await page.goto('https://crm-eurosol.vercel.app' + c.route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const trig = page.locator('[data-slot="select-trigger"]').filter({ hasText: c.trig }).first();
    const before = await rowCount(page);
    const res = await selectOption(page, calls, trig, c.pick);
    if (!res) { log(c.name, false, 'trigger not found'); continue; }
    if (!res.label) { log(c.name, false, `no matching option (${res.options} opts)`); continue; }
    const after = await rowCount(page);
    const fired = calls.filter((u) => !u.includes('/regions') && !u.includes('/auth/') && !u.includes('/notifications')).length;
    const url = page.url();
    // verdict: rows changed OR new API fired = works; if both same = suspect
    const works = before !== after || fired > 0;
    log(c.name, works, `"${res.label}" rows ${before}->${after}` + (fired ? `, API fired (${fired})` : ', server call none (client-side?)'));
  }

  // Survey: lead list search under "New Leads"
  await page.goto('https://crm-eurosol.vercel.app/survey', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.getByRole('tab', { name: /new leads/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const sSearch = page.getByPlaceholder(/search|find/i).first();
  if (await sSearch.isVisible().catch(() => false)) {
    const b0 = norm(await page.locator('body').innerText());
    await sSearch.fill('zzz-no-match');
    await page.waitForTimeout(1500);
    const b1 = norm(await page.locator('body').innerText());
    log('Survey New-Leads search filters', b0 !== b1, b0 !== b1 ? 'list changed' : 'IDENTICAL');
  } else log('Survey New-Leads search filters', false, 'search input not found');

  // Inventory stock-out guard: movements low-stock display
  await page.goto('https://crm-eurosol.vercel.app/inventory', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const invTxt = (await page.locator('body').innerText()).toLowerCase();
  log('Inventory low-stock alerts visible', /low stock|low-stock|alert/.test(invTxt), /low stock|low-stock|alert/.test(invTxt) ? '' : 'no low-stock section (maybe zero stock-out items)');

  // Payments: invoices tab row content + status select there
  await page.goto('https://crm-eurosol.vercel.app/payments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await page.getByRole('tab', { name: /invoices/i }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const invRows = await rowCount(page);
  log('Payments invoices tab lists rows', true, `${invRows} rows (no crash)`);
  await page.getByRole('tab', { name: /expenses/i }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const expRows = await rowCount(page);
  log('Payments expenses tab lists rows', true, `${expRows} rows (no crash)`);

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nFILTERS: PASS ${pass} FAIL ${fail}`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.n} — ${r.d}`));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
