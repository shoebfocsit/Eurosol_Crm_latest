/* eslint-disable no-console */
const { chromium } = require('@playwright/test');
const N = (s) => s.replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  let termBody = null;
  p.on('response', async (r) => {
    if (r.url().includes('/employees') && r.url().includes('status=TERMINATED') && r.request().method() === 'GET') {
      try { termBody = JSON.stringify(await r.json()).slice(0, 1500); } catch {}
    }
  });
  await p.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.locator('input[type=email]').fill('shashankwagh2@gmail.com');
  await p.locator('input[type=password]').fill('Shashank@123');
  await p.locator('button[type=submit]').click();
  await p.waitForTimeout(6000);
  await p.goto('http://localhost:5173/employees', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4500);
  await p.locator('[role=tab]').filter({ hasText: 'Terminated' }).first().click();
  await p.waitForTimeout(3500);
  console.log('API RESPONSE (truncated):', termBody);
  const badges = await p.locator('table tbody tr td:nth-child(6)').allInnerTexts().then((a) => a.map(N)).catch(() => []);
  const names = await p.locator('table tbody tr td:first-child').allInnerTexts().then((a) => a.map((x) => N(x).slice(0, 20))).catch(() => []);
  console.log('rows:', badges.length, 'badges:', JSON.stringify(badges.slice(0, 12)));
  console.log('names:', JSON.stringify(names.slice(0, 12)));
  const sub = (await p.locator('body').innerText()).match(/[A-Za-z ]*employees: \d+/)?.[0];
  console.log('subtitle:', sub);
  await b.close(); process.exit(0);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
