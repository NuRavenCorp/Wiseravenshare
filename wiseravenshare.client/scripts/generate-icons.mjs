// Generates the full PWA icon set + TikTok submission icon (1024x1024)
// from public/favicon.svg. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'public', 'favicon.svg');
const iconsDir = join(root, 'public', 'icons');
const svg = readFileSync(svgPath);

const sizes = [72, 96, 128, 144, 152, 192, 256, 384, 512];

mkdirSync(iconsDir, { recursive: true });

for (const size of sizes) {
  await sharp(svg, { density: Math.max(72, size * 2) })
    .resize(size, size, { fit: 'contain', background: { r: 15, g: 20, b: 25, alpha: 1 } })
    .png()
    .toFile(join(iconsDir, `icon-${size}x${size}.png`));
  console.log(`icon-${size}x${size}.png`);
}

// TikTok developer submission: square, 1024x1024, no transparency (must be maskable-safe).
await sharp(svg, { density: 2048 })
  .resize(1024, 1024, { fit: 'contain', background: { r: 15, g: 20, b: 25, alpha: 1 } })
  .flatten({ background: { r: 15, g: 20, b: 25, alpha: 1 } })
  .png()
  .toFile(join(iconsDir, 'tiktok-app-icon-1024.png'));
console.log('tiktok-app-icon-1024.png');

// Manifest shortcut icons (96x96) referenced by Manifest.json.
// Each combines the brand mark (top-left, smaller) with a bold one-glyph badge
// (bottom-right, high contrast) so every shortcut is distinguishable at a glance.
const shortcuts = [
  { name: 'post-shortcut', glyph: '+', bg: '#7e14ff' },
  { name: 'truth-shortcut', glyph: '?', bg: '#2563eb' },
  { name: 'messages-shortcut', glyph: 'M', bg: '#059669' },
  { name: 'notifications-shortcut', glyph: '!', bg: '#d97706' },
  { name: 'ravensight-shortcut', glyph: '▶', bg: '#dc2626' },
  { name: 'planner-shortcut', glyph: '✓', bg: '#0891b2' }
];

function badgeOverlay(rgbaBg, glyph) {
  const glyphSvg = glyph === '▶'
    ? '<path d="M34 26 L60 44 L34 62 Z" fill="#ffffff"/>'
    : glyph === '✓'
      ? '<path d="M28 45 L40 57 L64 31" stroke="#ffffff" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      : `<text x="47" y="47" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="800" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${glyph}</text>`;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
      `<circle cx="68" cy="68" r="26" fill="${rgbaBg}" stroke="#0f1419" stroke-width="4"/>` +
      glyphSvg +
    `</svg>`
  );
}

for (const { name, glyph, bg } of shortcuts) {
  const target = join(iconsDir, `${name}.png`);
  const base = await sharp(svg, { density: 192 })
    .resize(96, 96, { fit: 'contain', background: { r: 15, g: 20, b: 25, alpha: 1 } })
    .png()
    .toBuffer();
  await sharp(base)
    .composite([{ input: badgeOverlay(bg, glyph), top: 0, left: 0 }])
    .png()
    .toFile(target);
  console.log(`${name}.png`);
}

console.log('done');
