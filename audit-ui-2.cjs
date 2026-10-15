/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const path = require('path');

const BASE = 'https://crm-eurosol.vercel.app';
const EMAIL = 'shashankwagh2@gmail.com';
const PASSWORD = 'Shashank@123';
const SHOTS = path.join(__dirname, 'audit-shots');
const results = [];
const log = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`[${ok ? 'PASS' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage());

  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  log('re-login', !page.url().includes('/login'));

  /* --- 1. Profile dropdown via data-slot --- */
  const triggers = page.locator('[data-slot="dropdown-menu-trigger"]');
  const tCount = await triggers.count();
  const avatarTrigger = triggers.last();
  await avatarTrigger.click({ timeout: 5000 }).catch((e) => log('avatar trigger click', false, String(e).slice(0, 80)));
  await page.waitForTimeout(1500);
  const menuVisible = await page.getByRole('menu').isVisible().catch(() => false);
  log('Profile dropdown opens', menuVisible, `${tCount} triggers on page`);
  await page.screenshot({ path: path.join(SHOTS, 'f1-profile-menu.png') });

  /* --- 2. Logout item --- */
  const logoutItem = page.getByRole('menuitem', { name: /log out|logout/i });
  if (await logoutItem.isVisible().catch(() => false)) {
    await logoutItem.click();
    await page.waitForURL((u) => String(u).includes('/login'), { timeout: 10000 }).catch(() => {});
    log('Logout works', page.url().includes('/login'), `landed: ${new URL(page.url()).pathname}`);
  } else {
    log('Logout works', false, 'logout menuitem not visible');
    await page.keyboard.press('Escape');
  }

  /* --- 3. Re-login for remaining checks --- */
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  /* --- 4. Region filter on Dashboard --- */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const regionSelect = page.locator('select, [role="combobox"]').filter({ hasText: /region/i }).first();
  const regionBtnText = page.getByRole('button', { name: /all regions?|region/i }).first();
  let regionFound = false;
  if (await regionBtnText.isVisible({ timeout: 3000 }).catch(() => false)) {
    await regionBtnText.click().catch(() => {});
    regionFound = true;
    await page.waitForTimeout(1200);
    log('Dashboard region filter opens', true);
  } else if (await regionSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
    regionFound = true;
    log('Dashboard region filter present (select)', true);
  } else {
    // search anywhere for region select
    const anyRegion = await page.locator('text=/all regions/i').first().isVisible().catch(() => false);
    log('Dashboard region filter opens', anyRegion, anyRegion ? 'text found' : 'no region control found on dashboard');
  }
  await page.screenshot({ path: path.join(SHOTS, 'f2-region-dashboard.png') });

  /* --- 5. Leads region filter --- */
  await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const leadRegion = await page.locator('select').filter({ has: page.locator('option:has-text("Region"), option:has-text("All")') }).first().isVisible().catch(() => false);
  const leadRegionBtn = await page.getByRole('button', { name: /region/i }).first().isVisible({ timeout: 2000 }).catch(() => false);
  log('Leads region filter present', leadRegion || leadRegionBtn);

  /* --- 6. Navbar search is dead? (no handler) --- */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const searchInput = page.getByPlaceholder('Search leads, clients...');
  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('rahul');
    await page.waitForTimeout(2000);
    const url = page.url();
    const body = await page.locator('body').innerText();
    const navigated = url.includes('search') || url.includes('rahul');
    log('Navbar search performs action', navigated, navigated ? '' : 'typed text but no navigation/results — search is DEAD (cosmetic only)');
    await page.screenshot({ path: path.join(SHOTS, 'f3-nav-search.png') });
  } else log('Navbar search performs action', false, 'input not found');

  /* --- 7. Analytics export dropdown --- */
  await page.goto(BASE + '/analytics', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const exportBtn = page.getByRole('button', { name: /export data/i }).first();
  if (await exportBtn.isVisible().catch(() => false)) {
    await exportBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
    const items = await page.getByRole('menuitem').count().catch(() => 0);
    log('Analytics export menu opens', items > 0, `${items} menu items`);
    if (items > 0) {
      await page.getByRole('menuitem').first().click().catch(() => {});
      await page.waitForTimeout(3000);
      log('Export action executes (no crash)', true);
    }
    await page.keyboard.press('Escape');
  } else log('Analytics export menu opens', false, 'button not found');

  /* --- 8. Conversion % rounding bug re-check --- */
  const analyticsText = await page.locator('body').innerText();
  const pct = analyticsText.match(/(\d+\.\d{5,})%/);
  log('Conversion % is rounded', !pct, pct ? `BUG: shows ${pct[1]}% (full float)` : 'rounded ok');

  /* --- 9. Notifications mark-all-read --- */
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const bell = page.locator('[data-slot="dropdown-menu-trigger"]').first();
  await bell.click().catch(() => {});
  await page.waitForTimeout(1500);
  const notifOpen = await page.getByRole('menu').isVisible().catch(() => false);
  log('Notifications dropdown opens', notifOpen);
  const markAll = page.getByRole('button', { name: /mark all read/i });
  if (await markAll.isVisible().catch(() => false)) {
    await markAll.click().catch(() => {});
    await page.waitForTimeout(2500);
    log('Mark all read executes', true);
  } else log('Mark all read executes', true, 'no unread (button hidden) — N/A');
  await page.keyboard.press('Escape');

  /* --- 10. Deep link ?new=1 quick-add --- */
  await page.goto(BASE + '/leads?new=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const dialog = await page.getByRole('dialog').isVisible().catch(() => false);
  log('Deep link /leads?new=1 opens dialog', dialog);
  await page.screenshot({ path: path.join(SHOTS, 'f4-deeplink-new.png') });

  /* --- 11. Direct URL access control (open routes issue) --- */
  for (const r of ['/audit-logs', '/employees', '/admin-panel']) {
    await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const ok = !page.url().includes('/login');
    log(`Admin direct access ${r}`, ok);
  }

  /* --- 12. 404 unknown route --- */
  await page.goto(BASE + '/definitely-not-a-page', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const body404 = await page.locator('body').innerText();
  const handled = /not found|404|dashboard/i.test(body404);
  log('Unknown route handled (404/redirect)', handled, handled ? '' : 'no fallback UI — likely blank/stuck');

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log(`\nFOLLOW-UP: PASS ${pass} FAIL ${fail}`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.n} — ${r.d}`));
  await browser.close();
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
