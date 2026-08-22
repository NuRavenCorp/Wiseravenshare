export default async function run(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(600);
  const shot = 'e:/NuRavenCorp/Wiseravenshare/Wiseravenshare/scripts/qa-sidebar-clip.png';
  await page.screenshot({ path: shot, clip: { x: 640, y: 0, width: 640, height: 800 } });
  return { saved: shot };
}
