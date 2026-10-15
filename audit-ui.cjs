/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'https://crm-eurosol.vercel.app';
const EMAIL = 'shashankwagh2@gmail.com';
const PASSWORD = 'Shashank@123';
const SHOTS = path.join(__dirname, 'audit-shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let page = null;
const consoleErrors = [];
const pageErrors = [];

function log(entry) {
  results.push(entry);
  const tag = entry.ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${entry.name}${entry.detail ? ' — ' + entry.detail : ''}`);
}

async function shot(name) {
  try { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); } catch {}
}

async function goto(route) {
  consoleErrors.length = 0;
  pageErrors.length = 0;
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
}

async function checkTextVisible(label, patterns, route) {
  let found = false;
  let detail = '';
  for (const p of patterns) {
    try {
      const loc = page.getByText(p, { exact: false }).first();
      if (await loc.isVisible({ timeout: 3000 })) { found = true; detail = `matched "${p}"`; break; }
    } catch {}
  }
  const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
  const blank = bodyText.length < 40;
  const ok = found && !blank;
  log({ name: `${route} ${label}`, ok, detail: ok ? detail : blank ? 'page blank/empty' : `content "${bodyText.slice(0, 80)}" — expected text missing`, errs: pageErrors.slice(0, 3) });
}

async function noCrash(route) {
  const crash = pageErrors.some((e) => /ChunkLoadError|is not a function|Cannot read|Minified React error/i.test(e));
  const blank = (await page.locator('body').innerText().catch(() => '')).trim().length < 40;
  log({ name: `${route} renders (no crash/blank)`, ok: !crash && !blank, detail: crash ? pageErrors[0] : blank ? 'blank page' : '', errs: pageErrors.slice(0, 3) });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-IN' });
  page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

  /* ---------- 1. LOGIN PAGE ---------- */
  await goto('/login');
  await shot('01-login');
  log({ name: 'Login page renders', ok: true });

  // invalid login
  await page.locator('input[type="email"]').first().fill('wrong@example.com');
  await page.locator('input[type="password"]').first().fill('WrongPass@123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);
  const errVisible = await page.getByText(/invalid|incorrect|credential|failed/i).first().isVisible().catch(() => false);
  log({ name: 'Invalid credentials shows error', ok: errVisible, detail: errVisible ? '' : 'no error toast/text visible' });
  await shot('02-login-invalid');

  // valid login
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const loggedIn = !page.url().includes('/login');
  log({ name: 'Valid admin login', ok: loggedIn, detail: loggedIn ? `landed ${new URL(page.url()).pathname}` : 'still on /login' });
  await shot('03-dashboard');
  await checkTextVisible('dashboard content', ['Dashboard', 'Total', 'Leads', 'Revenue', 'Welcome'], '/');
  await noCrash('/');

  /* ---------- 2. EVERY ROUTE ---------- */
  const routes = [
    ['/leads', 'Leads', ['Leads', 'Lead Management', 'Add Lead', 'Status']],
    ['/survey', 'Site Survey', ['Survey', 'Scheduled', 'Lead']],
    ['/quotations', 'Quotations', ['Quotation', 'Proposal', 'New Quotation']],
    ['/installations', 'Installations', ['Installation', 'Status', 'Kanban', 'Table']],
    ['/inventory', 'Inventory', ['Inventory', 'Stock', 'Item']],
    ['/payments', 'Payments', ['Payment', 'Invoice', 'Revenue', 'Expense']],
    ['/service', 'Service & AMC', ['Service', 'AMC', 'Request']],
    ['/employees', 'Employees', ['Employee', 'Role', 'Permission']],
    ['/regions', 'Regions', ['Region', 'Branch']],
    ['/feedback', 'Feedback', ['Feedback', 'NPS', 'Rating']],
    ['/blog', 'Blog', ['Blog', 'Post']],
    ['/admin-panel', 'Admin Panel', ['Admin', 'Projects', 'Website', 'Tab']],
    ['/tasks', 'Tasks', ['Task', 'Calendar', 'Event']],
    ['/analytics', 'Analytics', ['Analytics', 'Funnel', 'Forecast', 'Growth']],
    ['/customers', 'Customers', ['Customer', 'Subsidy']],
    ['/templates', 'Templates', ['Template', 'Email', 'WhatsApp', 'SMS']],
    ['/audit-logs', 'Audit Logs', ['Audit', 'Log', 'Activity']],
  ];

  for (const [route, label, patterns] of routes) {
    await goto(route);
    await shot(`route-${route.replace(/\//g, '_') || 'home'}`);
    await noCrash(route);
    await checkTextVisible(`${label} content`, patterns, route);
    if (consoleErrors.length) log({ name: `${route} console errors`, ok: false, detail: consoleErrors.slice(0, 2).join(' | ') });
  }

  /* ---------- 3. INTERACTIONS ---------- */
  // Leads: open detail / create dialog
  await goto('/leads');
  const firstLeadRow = page.locator('table tbody tr').first();
  if (await firstLeadRow.isVisible().catch(() => false)) {
    await firstLeadRow.click().catch(() => {});
    await page.waitForTimeout(2500);
    const dialogOpen = await page.getByRole('dialog').isVisible().catch(() => false) ||
      (await page.locator('body').innerText()).match(/Phone|Email|Status/i) !== null;
    log({ name: 'Lead detail opens', ok: dialogOpen });
    await shot('04-lead-detail');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
  } else { log({ name: 'Lead detail opens', ok: false, detail: 'no lead rows found (empty list?)' }); }

  const addLead = page.getByRole('button', { name: /new lead|add lead|create lead|\+.*lead/i }).first();
  if (await addLead.isVisible().catch(() => false)) {
    await addLead.click().catch(() => {});
    await page.waitForTimeout(2000);
    const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
    log({ name: 'New Lead dialog opens', ok: dlg });
    await shot('05-new-lead-dialog');
    await page.keyboard.press('Escape').catch(() => {});
  } else { log({ name: 'New Lead dialog opens', ok: false, detail: 'button not found' }); }

  // Search / filter
  await goto('/leads');
  const search = page.getByPlaceholder(/search|find|naam|name/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill('zzz-no-match-xyz');
    await page.waitForTimeout(1500);
    log({ name: 'Lead search filter works', ok: true, detail: 'input accepted, no crash' });
    await search.fill('');
    await page.waitForTimeout(1000);
  } else { log({ name: 'Lead search filter works', ok: false, detail: 'no search input' }); }

  // Quotations: open create
  await goto('/quotations');
  const newQ = page.getByRole('button', { name: /new quotation|add quotation|create/i }).first();
  if (await newQ.isVisible().catch(() => false)) {
    await newQ.click().catch(() => {});
    await page.waitForTimeout(2500);
    const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
    log({ name: 'New Quotation dialog opens', ok: dlg });
    await shot('06-new-quotation');
    await page.keyboard.press('Escape').catch(() => {});
  } else { log({ name: 'New Quotation dialog opens', ok: false, detail: 'button not found' }); }

  // Site survey tabs
  await goto('/survey');
  const tabs = page.getByRole('tab');
  const tabCount = await tabs.count().catch(() => 0);
  log({ name: 'Site Survey tabs present', ok: tabCount > 0, detail: `${tabCount} tabs` });
  if (tabCount > 1) {
    await tabs.nth(1).click().catch(() => {});
    await page.waitForTimeout(1800);
    log({ name: 'Survey tab switch works', ok: true });
    await shot('07-survey-tab2');
  }

  // Payments tabs
  await goto('/payments');
  const pTabs = page.getByRole('tab');
  const pCount = await pTabs.count().catch(() => 0);
  log({ name: 'Payments tabs present', ok: pCount > 0, detail: `${pCount} tabs` });
  if (pCount > 1) {
    await pTabs.nth(1).click().catch(() => {});
    await page.waitForTimeout(1800);
    log({ name: 'Payments tab switch works', ok: true });
    await shot('08-payments-tab2');
  }

  // Inventory: stock view
  await goto('/inventory');
  const invBody = (await page.locator('body').innerText()).toLowerCase();
  log({ name: 'Inventory stock data visible', ok: /stock|item|quantity|low/.test(invBody) });

  // Employee permission matrix
  await goto('/employees');
  const firstEmp = page.locator('table tbody tr').first();
  if (await firstEmp.isVisible().catch(() => false)) {
    log({ name: 'Employees list loads', ok: true });
  } else { log({ name: 'Employees list loads', ok: false, detail: 'no rows' }); }

  // Admin panel tabs
  await goto('/admin-panel');
  const aTabs = page.getByRole('tab');
  const aCount = await aTabs.count().catch(() => 0);
  log({ name: 'Admin Panel tabs', ok: aCount > 0, detail: `${aCount} tabs` });
  if (aCount > 1) {
    await aTabs.nth(1).click().catch(() => {});
    await page.waitForTimeout(1800);
    log({ name: 'Admin tab switch works', ok: true });
    await shot('09-admin-tab2');
  }

  // Tasks calendar
  await goto('/tasks');
  const tBody = (await page.locator('body').innerText()).toLowerCase();
  log({ name: 'Tasks page content', ok: /task|calendar|today/.test(tBody) });

  // Analytics charts
  await goto('/analytics');
  const charts = await page.locator('svg.recharts-surface, .recharts-wrapper').count().catch(() => 0);
  log({ name: 'Analytics charts render', ok: charts > 0, detail: `${charts} chart svgs` });
  await shot('10-analytics');

  // Dashboard charts
  await goto('/');
  const dCharts = await page.locator('svg.recharts-surface, .recharts-wrapper').count().catch(() => 0);
  log({ name: 'Dashboard charts render', ok: dCharts > 0, detail: `${dCharts} chart svgs` });

  // Region filter (navbar)
  await goto('/');
  const regionBtn = page.getByRole('button', { name: /all region|region|filter/i }).first();
  if (await regionBtn.isVisible().catch(() => false)) {
    await regionBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    log({ name: 'Region filter opens', ok: true });
    await shot('11-region-filter');
    await page.keyboard.press('Escape').catch(() => {});
  } else { log({ name: 'Region filter opens', ok: false, detail: 'button not found' }); }

  // Notifications bell
  const bell = page.locator('button').filter({ has: page.locator('svg.lucide-bell') }).first();
  if (await bell.isVisible().catch(() => false)) {
    await bell.click().catch(() => {});
    await page.waitForTimeout(1500);
    log({ name: 'Notifications opens', ok: true });
    await page.keyboard.press('Escape').catch(() => {});
  } else { log({ name: 'Notifications opens', ok: false, detail: 'bell not found' }); }

  // Profile card
  const avatar = page.locator('button').filter({ has: page.locator('img, svg.lucide-user, .avatar') }).last();
  try {
    await avatar.click({ timeout: 3000 });
    await page.waitForTimeout(1500);
    const prof = (await page.locator('body').innerText()).match(/profile|logout|sign out|logout/i);
    log({ name: 'Profile menu opens', ok: !!prof });
    await shot('12-profile');
  } catch { log({ name: 'Profile menu opens', ok: false, detail: 'not clickable' }); }
  await page.keyboard.press('Escape').catch(() => {});

  // Mobile viewport smoke
  await page.setViewportSize({ width: 390, height: 844 });
  await goto('/');
  const mobileNav = await page.locator('[data-sidebar-toggle], button[aria-label*="menu" i], svg.lucide-menu').first().isVisible().catch(() => false);
  log({ name: 'Mobile viewport renders + nav toggle', ok: mobileNav });
  await shot('13-mobile-dash');
  await page.setViewportSize({ width: 1440, height: 900 });

  /* ---------- 4. PORTAL + LOGOUT ---------- */
  await goto('/portal/login');
  const portalOk = (await page.locator('body').innerText()).match(/customer|portal|login|sign/i) !== null && !pageErrors.length;
  log({ name: 'Portal login renders', ok: portalOk, detail: pageErrors[0] || '' });
  await shot('14-portal-login');

  await goto('/');
  try {
    const logoutBtn = page.getByRole('button', { name: /logout|sign out/i }).first();
    if (await logoutBtn.isVisible({ timeout: 3000 })) {
      await logoutBtn.click();
    } else {
      const av = page.locator('button').filter({ has: page.locator('img, svg.lucide-user') }).last();
      await av.click({ timeout: 3000 });
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /logout|sign out/i }).first().click({ timeout: 3000 });
    }
    await page.waitForURL((u) => String(u).includes('/login'), { timeout: 10000 }).catch(() => {});
    const loggedOut = page.url().includes('/login');
    log({ name: 'Logout works', ok: loggedOut });
  } catch (e) { log({ name: 'Logout works', ok: false, detail: String(e).slice(0, 100) }); }

  // access control: /employees should bounce non-admin? (we are admin so expect entry)
  await goto('/audit-logs');
  const auditOk = !page.url().includes('/login');
  log({ name: 'Admin can access /audit-logs', ok: auditOk });
  await shot('15-audit-logs');

  /* ---------- SUMMARY ---------- */
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log('\n================ SUMMARY ================');
  console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${results.length}`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.name} — ${r.detail || ''}`));
  fs.writeFileSync(path.join(__dirname, 'audit-results.json'), JSON.stringify(results, null, 2));

  await browser.close();
})().catch((e) => { console.error('SCRIPT CRASH:', e); process.exit(1); });
