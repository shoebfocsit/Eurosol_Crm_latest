/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const BASE = 'http://localhost:5173';
const results = [];
const log = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };
const N = (s) => s.replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());
  const empCalls = [];
  page.on('request', (r) => { const u = r.url(); if (/\/employees(\?|$)/.test(u) && !u.includes('/permissions') && !u.includes('/roles/')) empCalls.push(decodeURIComponent(u.replace(/.*\/v1/, ''))); });

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('input[type=email]').fill('shashankwagh2@gmail.com');
  await page.locator('input[type=password]').fill('Shashank@123');
  await page.locator('button[type=submit]').click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  log('local login', !page.url().includes('/login'), page.url());

  /* FIX-1: employees tabs refetch */
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  for (const t of ['Active Only', 'Restored Only', 'Terminated']) {
    empCalls.length = 0;
    await page.locator('[role=tab]').filter({ hasText: t }).first().click();
    await page.waitForTimeout(3000);
    const fired = empCalls.filter((u) => u.includes('status='));
    const rows = await page.locator('table tbody tr').count().catch(() => 0);
    const body = await page.locator('body').innerText();
    const emptyOk = t === 'Active Only' ? rows === 4 : true; // all 4 are ACTIVE; terminated/restored expect empty
    const correctEmpty = (t === 'Terminated' || t === 'Restored Only') ? (/no employees found/i.test(body) || rows === 0) : rows > 0;
    log(`FIX employees tab "${t}" refetches`, fired.length > 0, fired.join(' | ') || 'NO API');
    if (t !== 'Active Only') log(`FIX employees tab "${t}" shows correct data`, correctEmpty, `rows=${rows}`);
  }
  // back to All Active
  empCalls.length = 0;
  await page.locator('[role=tab]').filter({ hasText: 'All Active' }).first().click();
  await page.waitForTimeout(3000);
  log('FIX employees All Active refetches', empCalls.length > 0, empCalls.join(' | ') || 'NO API');

  /* FIX-2: employees search */
  empCalls.length = 0;
  await page.getByPlaceholder(/search by name/i).fill('shoe');
  await page.waitForTimeout(3000);
  log('FIX employees search fires API', empCalls.length > 0, empCalls.join(' | ') || 'NO API');
  await page.getByPlaceholder(/search by name/i).fill('');
  await page.waitForTimeout(2500);

  /* FIX-3: employees role filter */
  empCalls.length = 0;
  const rt = page.locator('[data-slot=select-trigger]').filter({ hasText: /role/i }).first();
  await rt.click(); await page.waitForTimeout(900);
  await page.getByRole('option', { name: 'ENGINEER' }).click().catch(() => {});
  await page.waitForTimeout(3000);
  log('FIX employees role filter fires API', empCalls.some((u) => u.includes('role=')), empCalls.join(' | ') || 'NO API');

  /* FIX-4: navbar search -> /leads?q= */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const nav = page.getByPlaceholder('Search leads, clients...');
  await nav.fill('rahul');
  await nav.press('Enter');
  await page.waitForTimeout(4000);
  const onLeads = new URL(page.url()).pathname === '/leads';
  const leadSearchVal = await page.locator('main input[placeholder]').first().inputValue().catch(() => '');
  log('FIX navbar search navigates to leads', onLeads, page.url());
  log('FIX navbar query applied to leads filter', /rahul/i.test(leadSearchVal), `filter value="${leadSearchVal}"`);

  /* FIX-5: analytics rounding */
  await page.goto(BASE + '/analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  const aText = await page.locator('body').innerText();
  const bad = aText.match(/(\d+\.\d{5,})%/);
  log('FIX conversion % rounded', !bad, bad ? `still shows ${bad[1]}%` : 'no full-float % on page');

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nLOCAL VERIFY: PASS ${pass} FAIL ${fail}`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.n} — ${r.d}`));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
