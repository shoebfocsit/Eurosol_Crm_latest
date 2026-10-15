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

  // 1. customers segment options
  await p.goto('https://crm-eurosol.vercel.app/customers', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  let t = p.locator('[data-slot=select-trigger]').filter({ hasText: /segment/i }).first();
  await t.click(); await p.waitForTimeout(900);
  const segOpts = await p.getByRole('option').allInnerTexts().then((a) => a.map(N));
  console.log('SEGMENT OPTS:', JSON.stringify(segOpts));
  await p.keyboard.press('Escape');

  // 2. installations filter controls
  await p.goto('https://crm-eurosol.vercel.app/installations', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  const sels = await p.locator('[data-slot=select-trigger]').allInnerTexts().then((a) => a.map(N));
  console.log('INST SELECTS:', JSON.stringify(sels));

  // 3. leads region: pick REAL region
  await p.goto('https://crm-eurosol.vercel.app/leads', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  t = p.locator('[data-slot=select-trigger]').filter({ hasText: /region/i }).first();
  await t.click(); await p.waitForTimeout(900);
  const ro = await p.getByRole('option').allInnerTexts().then((a) => a.map(N));
  console.log('LEAD REGION OPTS(' + ro.length + '):', JSON.stringify(ro.slice(0, 15)));
  const pi = ro.findIndex((x) => !/^all/i.test(x) && x.length > 0 && x.length < 30);
  if (pi >= 0) {
    const r0 = await p.locator('table tbody tr').count();
    await p.getByRole('option').nth(pi).click();
    await p.waitForTimeout(2800);
    const r1 = await p.locator('table tbody tr').count();
    console.log('LEADS REGION FILTER: pick="' + ro[pi] + '" rows ' + r0 + '->' + r1 + (r0 !== r1 ? ' WORKS' : ' IDENTICAL'));
  }
  await p.keyboard.press('Escape');

  // 4. survey: list all search inputs + which panel
  await p.goto('https://crm-eurosol.vercel.app/survey', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  await p.getByRole('tab', { name: /new leads/i }).click();
  await p.waitForTimeout(1500);
  const inputs = await p.locator('input[placeholder]').evaluateAll((els) =>
    els.map((e) => ({ ph: e.getAttribute('placeholder'), vis: !!(e.offsetWidth || e.offsetHeight) }))
  );
  console.log('SURVEY INPUTS:', JSON.stringify(inputs));

  // 5. blog: try a different category (not News)
  await p.goto('https://crm-eurosol.vercel.app/blog', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4000);
  t = p.locator('[data-slot=select-trigger]').filter({ hasText: /categor/i }).first();
  await t.click(); await p.waitForTimeout(900);
  const bo = await p.getByRole('option').allInnerTexts().then((a) => a.map(N));
  console.log('BLOG CATEGORY OPTS:', JSON.stringify(bo));
  const bi = bo.findIndex((x) => !/^all/i.test(x) && !/^news$/i.test(x) && x.length > 0);
  if (bi >= 0) {
    const r0 = await p.locator('table tbody tr').count().catch(() => 0);
    await p.getByRole('option').nth(bi).click();
    await p.waitForTimeout(2500);
    const r1 = await p.locator('table tbody tr').count().catch(() => 0);
    const emptyState = (await p.locator('body').innerText()).includes('No posts') || (await p.locator('body').innerText()).includes('No blog');
    console.log('BLOG FILTER: pick="' + bo[bi] + '" rows ' + r0 + '->' + r1 + ' emptyMsg=' + emptyState);
  }
  await b.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
