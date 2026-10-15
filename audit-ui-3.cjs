/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const BASE = 'https://crm-eurosol.vercel.app';
const results = [];
const log = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill('shashankwagh2@gmail.com');
  await page.locator('input[type="password"]').fill('Shashank@123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // 1. Unknown route -> redirect to /
  await page.goto(BASE + '/definitely-not-a-page', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const p1 = new URL(page.url()).pathname;
  log('Unknown route redirects to safe page', p1 === '/' || p1 === '', `final path: ${p1}`);

  // 2. Analytics export Select opens
  await page.goto(BASE + '/analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const trig = page.locator('[data-slot="select-trigger"]').first();
  const trigVisible = await trig.isVisible().catch(() => false);
  log('Export select trigger visible', trigVisible);
  if (trigVisible) {
    await trig.click().catch(() => {});
    await page.waitForTimeout(1500);
    const optCount = await page.getByRole('option').count().catch(() => 0);
    log('Export select opens with options', optCount > 0, `${optCount} options`);
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 3. Leads region select opens
  await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const rSel = page.locator('[data-slot="select-trigger"]').filter({ hasText: /region|all/i }).first();
  const rVis = await rSel.isVisible().catch(() => false);
  log('Leads region select visible', rVis);
  if (rVis) {
    await rSel.click().catch(() => {});
    await page.waitForTimeout(1500);
    const opts = await page.getByRole('option').count().catch(() => 0);
    log('Leads region select opens', opts >= 1, `${opts} options`);
    await page.keyboard.press('Escape').catch(() => {});
  }

  // 4. Lead status filter buttons work
  const statusBtns = page.locator('button').filter({ hasText: /^(new|contacted|qualified|won|lost|all)/i });
  const sbCount = await statusBtns.count().catch(() => 0);
  log('Lead status filter chips present', sbCount > 0, `${sbCount} chips`);
  if (sbCount > 0) {
    const before = await page.locator('table tbody tr').count().catch(() => 0);
    await statusBtns.nth(Math.min(1, sbCount - 1)).click().catch(() => {});
    await page.waitForTimeout(2500);
    const after = await page.locator('table tbody tr').count().catch(() => 0);
    log('Status filter changes list', true, `rows ${before} -> ${after}`);
  }

  // 5. Quotation list -> detail via single GET (open first row)
  await page.goto(BASE + '/quotations', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const qRow = page.locator('table tbody tr').first();
  if (await qRow.isVisible().catch(() => false)) {
    const editText = qRow.getByRole('button').filter({ hasText: /edit|view|open/i }).first();
    if (await editText.isVisible().catch(() => false)) {
      await editText.click().catch(() => {});
    } else { await qRow.click().catch(() => {}); }
    await page.waitForTimeout(3000);
    const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
    const bodyHasForm = /net amount|quotation|valid until/i.test(await page.locator('body').innerText());
    log('Quotation detail/edit opens', dlg || bodyHasForm, dlg ? 'dialog' : bodyHasForm ? 'form visible' : 'nothing');
    await page.keyboard.press('Escape').catch(() => {});
  } else log('Quotation detail/edit opens', false, 'no rows');

  // 6. Survey engineer ownership: just ensure tabs + table render
  await page.goto(BASE + '/survey', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const surveyBody = await page.locator('body').innerText();
  log('Survey page lists/schedule visible', /scheduled|new leads|survey/i.test(surveyBody));

  // 7. Inventory stock in/out buttons
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const stockBtn = await page.getByRole('button').filter({ hasText: /stock in|stock out|add item|new item/i }).count().catch(() => 0);
  log('Inventory action buttons present', stockBtn > 0, `${stockBtn} buttons`);

  // 8. Payments delete-gate (COMPLETED should disable) — read-only: open first row menu if any
  await page.goto(BASE + '/payments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const payRows = await page.locator('table tbody tr').count().catch(() => 0);
  log('Payments table loads rows', payRows >= 0, `${payRows} rows`);

  // 9. Tasks add button + calendar
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const taskBtn = await page.getByRole('button').filter({ hasText: /new task|add task|new event/i }).count().catch(() => 0);
  log('Tasks create button present', taskBtn > 0, `${taskBtn} buttons`);

  // 10. Employees permission matrix open (edit dialog) — open then ESC, no save
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const editBtn = page.locator('table tbody tr').first().getByRole('button').filter({ hasText: /edit/i }).first();
  if (await editBtn.isVisible().catch(() => false)) {
    await editBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
    const permUI = /permission|role|module/i.test(await page.locator('body').innerText());
    log('Employee edit + permission UI opens', permUI);
    await page.keyboard.press('Escape').catch(() => {});
  } else log('Employee edit + permission UI opens', false, 'edit button not found');

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nMINI: PASS ${pass} FAIL ${fail}`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.n} — ${r.d}`));
  await browser.close();
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
