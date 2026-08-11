/**
 * post-build-pwa.mjs
 * Chạy sau `vite build` để patch dist/index.html:
 *  - Embed manifest.json thành data URI (không cần file riêng)
 *  - Embed apple-touch-icon PNGs thành base64 data URI (không cần upload ảnh)
 *  - Embed favicon SVG thành data URI
 * Kết quả: dist/index.html hoàn toàn self-contained, deploy lên Apps Script OK
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distHtml = join(__dirname, 'dist', 'index.html');
const publicDir = join(__dirname, 'public');

console.log('🔧 Patching dist/index.html for single-file PWA...');

// --- Đọc và encode icon PNG sang base64 ---
function pngToDataUri(relPath) {
  const fullPath = join(publicDir, relPath);
  try {
    const buf = readFileSync(fullPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    console.warn(`  ⚠ Could not read ${relPath}, skipping`);
    return null;
  }
}

// --- Đọc và encode SVG sang data URI ---
function svgToDataUri(relPath) {
  const fullPath = join(publicDir, relPath);
  try {
    const svg = readFileSync(fullPath, 'utf-8');
    const encoded = encodeURIComponent(svg);
    return `data:image/svg+xml,${encoded}`;
  } catch {
    console.warn(`  ⚠ Could not read ${relPath}, skipping`);
    return null;
  }
}

const icon192 = pngToDataUri('icons/icon-192.png');
const icon152 = pngToDataUri('icons/icon-152.png');
const icon144 = pngToDataUri('icons/icon-144.png');
const icon512 = pngToDataUri('icons/icon-512.png');
const icon96  = pngToDataUri('icons/icon-96.png');
const icon72  = pngToDataUri('icons/icon-72.png');
const faviconUri = svgToDataUri('favicon.svg');

// --- Build manifest object với icons embedded ---
const manifest = {
  name: 'OPS FTE - SPX SOC Tool',
  short_name: 'OPS FTE',
  description: 'Hệ thống quản lý SOC, kiểm tra sót TO và tạo biên bản sự vụ Shopee Express',
  start_url: './',
  scope: './',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#F53D2D',
  theme_color: '#F53D2D',
  lang: 'vi',
  icons: [
    ...(icon72  ? [{ src: icon72,  sizes: '72x72',   type: 'image/png', purpose: 'any' }] : []),
    ...(icon96  ? [{ src: icon96,  sizes: '96x96',   type: 'image/png', purpose: 'any' }] : []),
    ...(icon144 ? [{ src: icon144, sizes: '144x144', type: 'image/png', purpose: 'any' }] : []),
    ...(icon152 ? [{ src: icon152, sizes: '152x152', type: 'image/png', purpose: 'any' }] : []),
    ...(icon192 ? [{ src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }] : []),
    ...(icon512 ? [{ src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] : []),
  ],
};

// Encode manifest JSON thành data URI
const manifestJson = JSON.stringify(manifest);
const manifestDataUri = `data:application/json;charset=utf-8,${encodeURIComponent(manifestJson)}`;

// --- Patch index.html ---
let html = readFileSync(distHtml, 'utf-8');

// 1. Thay thế <link rel="manifest" href="..."> bằng data URI
html = html.replace(
  /<link rel="manifest" href="[^"]*"\s*\/>/,
  `<link rel="manifest" href="${manifestDataUri}" />`
);

// 2. Thay thế apple-touch-icon links
if (icon192) {
  html = html.replace(
    /<link rel="apple-touch-icon" href="\/icons\/icon-192\.png"\s*\/>/,
    `<link rel="apple-touch-icon" href="${icon192}" />`
  );
}
if (icon152) {
  html = html.replace(
    /<link rel="apple-touch-icon" sizes="152x152" href="\/icons\/icon-152\.png"\s*\/>/,
    `<link rel="apple-touch-icon" sizes="152x152" href="${icon152}" />`
  );
}
if (icon144) {
  html = html.replace(
    /<link rel="apple-touch-icon" sizes="144x144" href="\/icons\/icon-144\.png"\s*\/>/,
    `<link rel="apple-touch-icon" sizes="144x144" href="${icon144}" />`
  );
}

// 3. Thay thế favicon SVG
if (faviconUri) {
  html = html.replace(
    /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg"\s*\/>/,
    `<link rel="icon" type="image/svg+xml" href="${faviconUri}" />`
  );
}

// ZXing ships one control-character lookup table as a template literal whose
// literal tab lands at end-of-line after minification. Escape it without
// changing the runtime string so generated deploy artifacts stay diff-clean.
html = html.replace(/\t(?=\r?\n)/g, '\\t');

writeFileSync(distHtml, html, 'utf-8');

const finalSize = Buffer.byteLength(html, 'utf-8');
const finalKb = (finalSize / 1024).toFixed(1);
console.log(`✅ Patched dist/index.html — Total size: ${finalKb} KB`);
console.log('   ✓ manifest.json → inline data URI');
console.log('   ✓ apple-touch-icon PNGs → base64 data URIs');
console.log('   ✓ favicon SVG → data URI');
console.log('   ✓ trailing control tabs → JavaScript escapes');
console.log('\n🚀 dist/index.html ready for Apps Script deploy!');
