export default async function run(page) {
  // Seed a fake session so the authenticated app shell renders
  // (AuthContext falls back to cached user_data when token verification fails).
  await page.evaluate(() => {
    localStorage.setItem('auth_token', 'qa-token');
    localStorage.setItem('user_data', JSON.stringify({
      id: 'user1',
      name: 'QA Raven',
      handle: '@qaraven',
      email: 'qa@example.com',
      avatar: 'QR'
    }));
  });
  await page.reload();
  await page.waitForSelector('.middle-column', { timeout: 25000 });
  const results = {};
  for (const width of [1920, 1440, 1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(400);
    results[width] = await page.evaluate(() => {
      const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) };
      };
      const root = rect('#root');
      const grid = rect('.grid-3');
      const mid = rect('.middle-column');
      const right = rect('.right-column');
      const vw = window.innerWidth;
      const asym = root ? Math.abs(root.left - (vw - root.right)) : null;
      return {
        viewport: vw,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow: document.documentElement.scrollWidth > vw,
        rootAsymmetry: asym,
        middleColumn: mid,
        gapMiddleToRight: right && mid ? right.left - mid.right : null
      };
    });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e:/NuRavenCorp/Wiseravenshare/Wiseravenshare/scripts/feed-layout-after.png' });
  return results;
}
