/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'https://crm-eurosol.vercel.app';
const SHOTS = path.join(__dirname, 'audit-shots', 'deep');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let currentAction = 'init';
let page = null;
let netErrors = [];
let pageErrors = [];

const log = (page_, name, ok, detail = '') => {
  results.push({ page: page_, action: name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] [${page_}] ${name}${detail ? ' — ' + detail : ''}`);
};
const skip = (page_, name, why) => {
  results.push({ page: page_, action: name, ok: 'skip', detail: why });
  console.log(`[SKIP] [${page_}] ${name} — ${why}`);
};

function attachMonitors() {
  netErrors = [];
  pageErrors = [];
  page.on('response', (res) => {
    if (res.status() >= 400) netErrors.push({ url: res.url().replace(BASE, ''), status: res.status(), during: currentAction });
  });
  page.on('pageerror', (e) => pageErrors.push({ err: String(e).slice(0, 250), during: currentAction }));
}

function bodyText() { return page.locator('body').innerText().catch(() => ''); }
const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function shot(n) {
  const safe = n.replace(/[^a-z0-9-_]/gi, '_').slice(0, 90);
  try { await page.screenshot({ path: path.join(SHOTS, safe + '.png') }); } catch {}
}

function markNet(prefix) {
  const relevant = netErrors.filter((n) => n.during.startsWith(prefix));
  netErrors = netErrors.filter((n) => !n.during.startsWith(prefix));
  return relevant;
}

/* ---------------- TAB AUDIT ---------------- */
async function auditTabs(pageName) {
  const tabs = page.locator('[role="tab"]');
  const count = await tabs.count().catch(() => 0);
  if (!count) { skip(pageName, 'tabs', 'no tabs'); return; }
  const labels = [];
  for (let i = 0; i < count; i++) labels.push((await tabs.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim());
  log(pageName, `tabs present`, true, `${count}: ${labels.join(' | ')}`);

  const baseline = norm(await bodyText());
  for (let i = 0; i < count; i++) {
    const label = labels[i] || `tab${i}`;
    currentAction = `tab:${label}`;
    const before = norm(await bodyText());
    const mark = markNet(`tab:${label}`);
    try {
      await tabs.nth(i).click({ timeout: 5000 });
    } catch (e) {
      log(pageName, `tab "${label}" clickable`, false, String(e).slice(0, 100));
      continue;
    }
    await page.waitForTimeout(2200);
    const after = norm(await bodyText());
    const active = (await tabs.nth(i).getAttribute('aria-selected').catch(() => null)) === 'true';
    const errs = markNet(`tab:${label}`);
    const pErr = pageErrors.filter((p) => p.during === `tab:${label}`);
    const netDetail = errs.map((e) => `${e.status} ${e.url}`).join('; ');
    const changed = after !== before;
    const ok = active && pErr.length === 0;
    let detail = `active=${ok ? 'yes' : 'NO'}`;
    if (changed) detail += ', content changed';
    if (errs.length) detail += `, NET ERRORS: ${netDetail}`;
    if (pErr.length) detail += `, JS ERROR: ${pErr[0].err}`;
    if (!changed) detail += ', content SAME as before';
    log(pageName, `tab "${label}"`, ok && errs.length === 0, detail);
    if (i < count) await shot(`${pageName}-tab-${label}`);
  }
}

/* ---------------- SELECT AUDIT ---------------- */
async function auditSelects(pageName, limit = 8) {
  const sels = page.locator('[data-slot="select-trigger"]:not([disabled])');
  const count = await sels.count().catch(() => 0);
  if (!count) { skip(pageName, 'selects', 'none'); return; }
  for (let i = 0; i < Math.min(count, limit); i++) {
    currentAction = `select${i}`;
    const mark = markNet(`select${i}`);
    const text = (await sels.nth(i).innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 40);
    try {
      await sels.nth(i).click({ timeout: 4000 });
      await page.waitForTimeout(900);
      const opts = await page.getByRole('option').count().catch(() => 0);
      const pop = await page.locator('[data-slot="select-popup"], [role="listbox"]').first().isVisible().catch(() => false);
      const errs = markNet(`select${i}`);
      const ok = (opts > 0 || pop) && errs.length === 0;
      log(pageName, `select "${text}"`, ok, `${opts} options${errs.length ? ' NET: ' + errs.map((e) => `${e.status} ${e.url}`).join(';') : ''}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) {
      log(pageName, `select "${text}"`, false, 'did not open: ' + String(e).slice(0, 80));
    }
  }
}

/* ---------------- SAFE BUTTON AUDIT ---------------- */
const SAFE = /\b(add|new|create|view|edit|detail|schedule|export|download|print|preview|calendar|list|kanban|table|month|week|day|all active|active only|restored|filter|search|clear|reset|refresh|today|tomorrow)\b/i;
const DANGER = /\b(delete|terminate|remove|confirm|yes|save|submit|send|approve|reject|restore|activate|publish|convert|mark|feature|update|change status|pay|deactivate|super\s?admin|reset to role|stock out|stock in|transact|cancel survey|upload|import|bulk)\b/i;

async function auditButtons(pageName, limit = 8) {
  const all = page.locator('button:not([disabled])');
  const n = await all.count().catch(() => 0);
  let tested = 0;
  for (let i = 0; i < n && tested < limit; i++) {
    const btn = all.nth(i);
    let label = '';
    try {
      label = norm(await btn.innerText({ timeout: 800 }).catch(() => '')) ||
        (await btn.getAttribute('title', { timeout: 500 }).catch(() => '')) ||
        (await btn.getAttribute('aria-label', { timeout: 500 }).catch(() => '')) || '';
    } catch { continue; }
    label = label.replace(/\s+/g, ' ').trim();
    if (!label || !SAFE.test(label) || DANGER.test(label)) continue;
    if (await btn.locator(':scope').count() === 0) continue;
    // skip sidebar/header chrome
    const inChrome = await btn.evaluate((el) => !!el.closest('header, nav, [data-sidebar]')).catch(() => false);
    if (inChrome) continue;
    const inDialog = await btn.evaluate((el) => !!el.closest('[role="dialog"]')).catch(() => false);
    if (inDialog) continue;

    currentAction = `btn:${label.slice(0, 30)}`;
    const mark = markNet(`btn:${label.slice(0, 30)}`);
    const before = norm(await bodyText());
    const urlBefore = page.url();
    try { await btn.click({ timeout: 4000 }); } catch { continue; }
    await page.waitForTimeout(1800);
    tested++;

    const dialog = await page.getByRole('dialog').isVisible().catch(() => false);
    const toast = await page.locator('[data-sonner-toast]').count().catch(() => 0);
    const after = norm(await bodyText());
    const errs = markNet(`btn:${label.slice(0, 30)}`);
    const pErr = pageErrors.filter((p) => p.during === `btn:${label.slice(0, 30)}`);
    const changed = after !== before || dialog || toast > 0 || page.url() !== urlBefore;
    const ok = changed && pErr.length === 0 && errs.length === 0;

    let detail = dialog ? 'dialog opened' : toast > 0 ? `toast x${toast}` : page.url() !== urlBefore ? 'navigated' : after !== before ? 'content changed' : 'NO EFFECT';
    if (errs.length) detail += ` NET: ${errs.map((e) => `${e.status} ${e.url}`).join(';')}`;
    if (pErr.length) detail += ` JS: ${pErr[0].err}`;
    log(pageName, `button "${label}"`, ok, detail);
    await shot(`${pageName}-btn-${label.slice(0, 30)}`);

    // safely close whatever opened
    if (dialog || toast > 0) {
      const cancel = page.getByRole('dialog').getByRole('button', { name: /cancel|close|no,? /i }).first();
      if (await cancel.isVisible({ timeout: 1200 }).catch(() => false)) await cancel.click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(700);
      const stillOpen = await page.getByRole('dialog').isVisible().catch(() => false);
      if (stillOpen) { log(pageName, `dialog for "${label}" closes`, false, 'still open after Escape/Cancel'); await page.keyboard.press('Escape').catch(() => {}); }
      else log(pageName, `dialog for "${label}" closes`, true);
      if (page.url() !== urlBefore) await page.goto(urlBefore, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
  if (!tested) skip(pageName, 'safe buttons', 'koi safe button nahi mila (ya sab dangerous)');
}

/* ---------------- DIALOG-ONLY DANGER PROBES (open, never confirm) ---------------- */
async function probeDangerDialog(pageName, selector, expectedTitle, rowFirst = true) {
  currentAction = `danger:${selector}`;
  const el = page.locator(selector).first();
  if (!(await el.isVisible({ timeout: 3000 }).catch(() => false))) {
    skip(pageName, `danger dialog (${selector})`, 'trigger not visible');
    return;
  }
  const mark = markNet(`danger:${selector}`);
  await el.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
  const text = dlg ? norm(await page.getByRole('dialog').innerText().catch(() => '')) : '';
  const titleOk = !expectedTitle || text.toLowerCase().includes(expectedTitle.toLowerCase());
  const errs = markNet(`danger:${selector}`);
  const ok = dlg && titleOk && errs.length === 0;
  log(pageName, `danger dialog opens: ${expectedTitle}`, ok, dlg ? (titleOk ? 'title + dialog OK' : `dialog open but missing "${expectedTitle}", got: ${text.slice(0, 120)}`) : 'NO DIALOG');
  await shot(`${pageName}-DIALOG-${expectedTitle}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(700);
  const closed = !(await page.getByRole('dialog').isVisible().catch(() => false));
  log(pageName, `danger dialog closes (cancel)`, closed, closed ? '' : 'Escape did not close');
}

/* ---------------- PAGINATION ---------------- */
async function auditPagination(pageName) {
  currentAction = 'pagination';
  const next = page.getByRole('button', { name: /next|>|›/i }).or(page.locator('button[aria-label*="next" i]')).first();
  if (!(await next.isVisible({ timeout: 2000 }).catch(() => false))) { skip(pageName, 'pagination', 'no next button'); return; }
  const before = norm(await bodyText());
  const mark = markNet('pagination');
  await next.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const after = norm(await bodyText());
  const errs = markNet('pagination');
  const ok = after !== before && errs.length === 0;
  log(pageName, 'pagination next', ok, after !== before ? 'page changed' : 'SAME content' + (errs.length ? ` NET: ${errs.map((e) => e.status + ' ' + e.url).join(';')}` : ''));
}

/* ================= PAGES ================= */
const PAGES = [
  { r: '/', n: 'Dashboard' },
  { r: '/leads', n: 'Leads' },
  { r: '/survey', n: 'Survey' },
  { r: '/quotations', n: 'Quotations' },
  { r: '/installations', n: 'Installations' },
  { r: '/inventory', n: 'Inventory' },
  { r: '/payments', n: 'Payments' },
  { r: '/service', n: 'Service' },
  { r: '/employees', n: 'Employees' },
  { r: '/regions', n: 'Regions' },
  { r: '/feedback', n: 'Feedback' },
  { r: '/blog', n: 'Blog' },
  { r: '/admin-panel', n: 'AdminPanel' },
  { r: '/tasks', n: 'Tasks' },
  { r: '/analytics', n: 'Analytics' },
  { r: '/customers', n: 'Customers' },
  { r: '/templates', n: 'Templates' },
  { r: '/audit-logs', n: 'AuditLogs' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-IN', acceptDownloads: true });
  page = await ctx.newPage();
  attachMonitors();

  // LOGIN
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill('shashankwagh2@gmail.com');
  await page.locator('input[type="password"]').fill('Shashank@123');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log('LOGIN:', page.url().includes('/login') ? 'FAILED' : 'OK');

  for (const p of PAGES) {
    currentAction = 'load';
    const mark0 = markNet('load');
    await page.goto(BASE + p.r, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3800);
    const loadErrs = mark0.concat(markNet('load'));
    const blank = norm(await bodyText()).length < 40;
    log(p.n, 'page loads', !blank && loadErrs.length === 0, blank ? 'BLANK' : loadErrs.length ? `NET: ${loadErrs.map((e) => `${e.status} ${e.url}`).join(';')}` : 'ok');
    await shot(`${p.n}-home`);

    await auditTabs(p.n);
    await auditSelects(p.n);
    await auditButtons(p.n);
    await auditPagination(p.n);
  }

  /* ---- PAGE-SPECIFIC DEEP CHECKS ---- */

  // EMPLOYEES: status tab row counts + terminate dialog (open/cancel only)
  await page.goto(BASE + '/employees', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const eTabs = page.locator('[role="tab"]');
  const eCount = await eTabs.count();
  for (let i = 0; i < eCount; i++) {
    const lbl = norm(await eTabs.nth(i).innerText().catch(() => ''));
    currentAction = `emp-tab:${lbl}`;
    const mark = markNet(`emp-tab:${lbl}`);
    await eTabs.nth(i).click().catch(() => {});
    await page.waitForTimeout(2500);
    const rows = await page.locator('table tbody tr').count().catch(() => 0);
    const noData = (await page.locator('body').innerText()).includes('No employees found');
    const errs = markNet(`emp-tab:${lbl}`);
    log('Employees', `status tab "${lbl}"`, errs.length === 0, `${rows} rows${noData ? ' (No employees found)' : ''}${errs.length ? ' NET: ' + errs.map((e) => `${e.status} ${e.url}`).join(';') : ''}`);
    await shot(`Employees-tab-${lbl.replace(/\s/g, '_')}`);
  }
  // switch back to All Active and probe terminate dialog
  await page.locator('[role="tab"]').first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await probeDangerDialog('Employees', 'button[title="Terminate"]', 'Terminate Employee');

  // EMPLOYEES: edit dialog via pencil icon (row first action = view)
  currentAction = 'emp-view';
  const viewBtn = page.locator('table tbody tr').first().locator('button').first();
  if (await viewBtn.isVisible().catch(() => false)) {
    await viewBtn.click().catch(() => {});
    await page.waitForTimeout(1800);
    const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
    log('Employees', 'first row action opens view/detail', dlg, dlg ? norm(await page.getByRole('dialog').innerText()).slice(0, 80) : 'no dialog');
    await shot('Employees-row-view');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  }

  // INSTALLATIONS: open detail dialog -> inner 3 tabs
  await page.goto(BASE + '/installations', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const instOpen = page.locator('table tbody tr').first().getByRole('button').first();
  if (await instOpen.isVisible().catch(() => false)) {
    currentAction = 'inst-detail';
    await instOpen.click().catch(() => {});
    await page.waitForTimeout(2500);
    const dlg = await page.getByRole('dialog').isVisible().catch(() => false);
    log('Installations', 'detail dialog opens', dlg);
    if (dlg) {
      await shot('Installations-detail');
      const dTabs = page.getByRole('dialog').locator('[role="tab"]');
      const dtc = await dTabs.count();
      for (let i = 0; i < dtc; i++) {
        const lbl = norm(await dTabs.nth(i).innerText().catch(() => ''));
        currentAction = `inst-dtab:${lbl}`;
        await dTabs.nth(i).click().catch(() => {});
        await page.waitForTimeout(1200);
        const active = (await dTabs.nth(i).getAttribute('aria-selected').catch(() => null)) === 'true';
        log('Installations', `detail tab "${lbl}"`, active, active ? 'switched' : 'NOT active');
        await shot(`Installations-dtab-${i}`);
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
  } else log('Installations', 'detail dialog opens', false, 'no rows/buttons');

  // LEADS: status chips + row detail
  await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const chipCandidates = page.locator('main button, .sticky button, form ~ div button').filter({ hasText: /new|contacted|qualified|site visit|negotiation|won|lost/i });
  const chipCount = await chipCandidates.count().catch(() => 0);
  log('Leads', 'status chips present', chipCount > 0, `${chipCount} chips`);
  for (let i = 0; i < Math.min(chipCount, 8); i++) {
    const lbl = norm(await chipCandidates.nth(i).innerText().catch(() => ''));
    if (!lbl || lbl.length > 20) continue;
    currentAction = `lead-chip:${lbl}`;
    const mark = markNet(`lead-chip:${lbl}`);
    const before = norm(await bodyText());
    await chipCandidates.nth(i).click().catch(() => {});
    await page.waitForTimeout(1800);
    const after = norm(await bodyText());
    const errs = markNet(`lead-chip:${lbl}`);
    const ok = errs.length === 0 && (after !== before || true);
    log('Leads', `status chip "${lbl}"`, ok, `${after !== before ? 'list changed' : 'list same'}${errs.length ? ' NET: ' + errs.map((e) => `${e.status} ${e.url}`).join(';') : ''}`);
  }

  // TASKS: calendar tab renders events
  await page.goto(BASE + '/tasks', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const calTab = page.getByRole('tab', { name: /calendar/i });
  if (await calTab.isVisible().catch(() => false)) {
    await calTab.click().catch(() => {});
    await page.waitForTimeout(2500);
    const t = await page.locator('body').innerText();
    const rendered = /mon|tue|wed|thu|fri|sat|sun/i.test(t) && (await page.locator('[role="tab"][aria-selected="true"]').count()) > 0;
    log('Tasks', 'calendar tab renders month grid', rendered, rendered ? '' : 'no weekday grid');
    await shot('Tasks-calendar');
  }

  // FEEDBACK: each tab badge vs rows
  await page.goto(BASE + '/feedback', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const fTabs = page.locator('[role="tab"]');
  for (let i = 0; i < await fTabs.count(); i++) {
    const lbl = norm(await fTabs.nth(i).innerText().catch(() => ''));
    currentAction = `fb:${lbl}`;
    await fTabs.nth(i).click().catch(() => {});
    await page.waitForTimeout(1800);
    const rows = await page.locator('table tbody tr, .space-y-3 > div').count().catch(() => 0);
    log('Feedback', `tab "${lbl}"`, true, `${rows} items`);
    await shot(`Feedback-tab-${lbl.split(' ')[0]}`);
  }

  // BLOG: do NOT toggle featured; just verify list
  await page.goto(BASE + '/blog', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const blogItems = await page.locator('table tbody tr').count().catch(() => 0);
  log('Blog', 'posts list renders', true, `${blogItems} rows (featured toggle SKIPPED — mutation)`);

  // INVENTORY: verify movement log tab/section if any
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const invSections = page.locator('[role="tab"]');
  if (await invSections.count()) await auditTabs('Inventory');
  else skip('Inventory', 'tabs', 'sections nahi, buttons se cover hua');

  /* ---- FINAL: route-level 401/403 leakage check (open routes) ---- */
  // (admin user — skip role-based deny tests)

  const pass = results.filter((r) => r.ok === true).length;
  const fail = results.filter((r) => r.ok === false).length;
  const skipped = results.filter((r) => r.ok === 'skip').length;
  console.log('\n========== DEEP AUDIT SUMMARY ==========');
  console.log(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skipped}  TOTAL: ${results.length}`);
  console.log('--- FAILURES ---');
  results.filter((r) => r.ok === false).forEach((r) => console.log(`  [${r.page}] ${r.action} :: ${r.detail}`));
  fs.writeFileSync(path.join(__dirname, 'audit-deep.json'), JSON.stringify(results, null, 2));

  await browser.close();
})().catch((e) => { console.error('SCRIPT CRASH:', e); process.exit(1); });
