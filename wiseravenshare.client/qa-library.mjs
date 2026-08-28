export default async function run(page, ui) {
  // What auth token key does the app actually use?
  const keys = await page.evaluate(() => Object.keys(localStorage));
  await page.evaluate(() => {
    // Seed plausible auth keys so isAuthenticated flips true after reload.
    // Seed the real keys the app reads (matches authStorage.js / Auth.jsx).
    localStorage.setItem('auth_token', 'fake-token-for-render-test');
    // User object lives under 'user_data' — isAuthenticated() requires both.
    localStorage.setItem('user_data', JSON.stringify({ id: 'test-user-1', name: 'QA User', email: 'qa@wise-ravens.com' }));
  });
  await page.reload();
  await page.waitForTimeout(3000);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 800));
  return { keys, text };
}
