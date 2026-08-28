import { chromium } from 'playwright';

const url = process.env.QA_URL || 'http://localhost:4188/';
const API = process.env.QA_API || 'http://localhost:10000';
const EMAIL = process.env.QA_EMAIL || 'admin@wise-ravens.com';
const PASSWORD = process.env.QA_PASSWORD || '1@Chinchin234';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  if (m.type() === 'warning' && /video/i.test(m.text())) errors.push('[warn] ' + m.text().slice(0, 200));
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Real login against the Docker API, seed the same keys the app reads.
const seeded = await page.evaluate(async ({ API, EMAIL, PASSWORD }) => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, usernameOrEmail: EMAIL, password: PASSWORD })
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  localStorage.setItem('auth_token', data.token);
  localStorage.setItem('user_data', JSON.stringify(data.user || { email: EMAIL }));
  return { ok: true };
}, { API, EMAIL, PASSWORD });
console.log('login:', JSON.stringify(seeded));

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const text = await page.evaluate(() => document.body.innerText.slice(0, 800));
console.log('--- body text after real login ---');
console.log(text);

// Try to reach the video library page if there is a nav item for it.
const nav = page.getByText('Ravensight', { exact: false }).first();
if (await nav.isVisible().catch(() => false)) {
  await nav.click();
  await page.waitForTimeout(3000);
  const libText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  console.log('--- after clicking Ravensight ---');
  console.log(libText);
}

console.log('--- console errors ---');
if (errors.length === 0) console.log('(none)');
else errors.forEach((e) => console.log('[error]', e));

await browser.close();
