/**
 * Regenerates all app icons from design/gdo-icon.svg.
 *
 *   node design/generate-icons.js   (run from the repo root)
 *
 * Outputs: favicon.ico + apple-icon.png (src/app/) and the PWA icons
 * (public/icons/, including a padded maskable variant). Brand: navy #003F66,
 * gold #FFB915 — "GDO" wordmark with a hard hat resting on the O.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const mainSvg = fs.readFileSync(path.join(__dirname, 'gdo-icon.svg'));

// Maskable: full-bleed navy (the OS mask defines the shape) with the mark scaled
// into the central ~72% safe zone so a circle/squircle mask never clips it.
const content = `
  <text x="256" y="342" font-family="Arial, 'DejaVu Sans', 'Liberation Sans', sans-serif" font-weight="bold" font-size="152" letter-spacing="-3" fill="#FFB915" text-anchor="middle">GDO</text>
  <g fill="#FFB915">
    <rect x="325" y="220" width="100" height="17" rx="8.5"/>
    <path d="M337 222 a38 42 0 0 1 76 0 Z"/>
    <rect x="367" y="182" width="16" height="16" rx="6"/>
  </g>`;
const maskableSvg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#003F66"/><g transform="translate(256 256) scale(0.72) translate(-256 -256)">${content}</g></svg>`
);

function buildIco(sizes, pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const dirs = [];
  let offset = 6 + sizes.length * 16;
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    const dir = Buffer.alloc(16);
    dir.writeUInt8(s >= 256 ? 0 : s, 0);
    dir.writeUInt8(s >= 256 ? 0 : s, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(pngs[i].length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    offset += pngs[i].length;
  }
  return Buffer.concat([header, ...dirs, ...pngs]);
}

(async () => {
  await sharp(mainSvg).resize(192, 192).png().toFile(path.join(ROOT, 'public/icons/icon-192x192.png'));
  await sharp(mainSvg).resize(512, 512).png().toFile(path.join(ROOT, 'public/icons/icon-512x512.png'));
  await sharp(maskableSvg).resize(512, 512).png().toFile(path.join(ROOT, 'public/icons/icon-maskable-512x512.png'));
  await sharp(mainSvg).resize(180, 180).png().toFile(path.join(ROOT, 'src/app/apple-icon.png'));

  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map((s) => sharp(mainSvg).resize(s, s).png().toBuffer()));
  fs.writeFileSync(path.join(ROOT, 'src/app/favicon.ico'), buildIco(sizes, pngs));

  console.log('Icons regenerated from design/gdo-icon.svg');
})().catch((e) => { console.error(e); process.exit(1); });
