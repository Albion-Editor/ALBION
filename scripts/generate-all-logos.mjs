import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const blueColor = '#2582F8';
const goldColor = '#FFAE00';

// Transparent SVG logo (centered in 512x512)
const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <!-- Left Blue Stripe 1 -->
  <path d="M 224 112 L 160 133 C 149 137 143 144 140 154 L 53 400 L 117 379 C 128 375 134 368 137 358 Z" fill="${blueColor}"/>
  <!-- Left Blue Stripe 2 -->
  <path d="M 320 112 L 256 133 C 245 137 239 144 236 154 L 149 400 L 213 379 C 224 375 230 368 233 358 Z" fill="${blueColor}"/>
  <!-- Gold Sun/Energy Circle -->
  <circle cx="338.5" cy="327.5" r="61.5" fill="${goldColor}"/>
  <!-- Gold A -->
  <path d="M 354 113 L 459 386 L 433 386 L 354 178 L 324 254 A 75 75 0 0 0 296 264 Z" fill="${goldColor}"/>
</svg>`;

// App Icon with Dark Rounded Square Backdrop (for OS launcher / installer)
const svgAppIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="104" fill="#0F172A"/>
  <!-- Left Blue Stripe 1 -->
  <path d="M 224 112 L 160 133 C 149 137 143 144 140 154 L 53 400 L 117 379 C 128 375 134 368 137 358 Z" fill="${blueColor}"/>
  <!-- Left Blue Stripe 2 -->
  <path d="M 320 112 L 256 133 C 245 137 239 144 236 154 L 149 400 L 213 379 C 224 375 230 368 233 358 Z" fill="${blueColor}"/>
  <!-- Gold Sun/Energy Circle -->
  <circle cx="338.5" cy="327.5" r="61.5" fill="${goldColor}"/>
  <!-- Gold A -->
  <path d="M 354 113 L 459 386 L 433 386 L 354 178 L 324 254 A 75 75 0 0 0 296 264 Z" fill="${goldColor}"/>
</svg>`;

async function run() {
  const root = path.resolve('..');
  console.log('Generating all logo files across workspace:', root);

  // 1. Write SVGs
  const svgTargets = [
    path.join(root, 'Async', 'resources', 'icons', 'albion-logo.svg'),
    path.join(root, 'Async', 'docs', 'assets', 'async-logo.svg'),
    path.join(root, 'Async', 'docs', 'assets', 'async-logo-desktop.svg'),
    path.join(root, 'albion-branding', 'albion-logo.svg'),
    path.join(root, 'albion-website', 'public', 'albion-logo.svg'),
  ];

  for (const t of svgTargets) {
    await fs.mkdir(path.dirname(t), { recursive: true });
    await fs.writeFile(t, svgLogo, 'utf8');
    console.log('Wrote SVG:', t);
  }

  // 2. Generate master App Icon PNG (1024x1024)
  const masterIconBuffer = await sharp(Buffer.from(svgAppIcon))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  // Transparent logo PNG (1024x1024)
  const transparentLogoBuffer = await sharp(Buffer.from(svgLogo))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  // 3. Generate multi-resolution ICO file
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoFrames = await Promise.all(
    icoSizes.map((sizePx) => sharp(masterIconBuffer).resize(sizePx, sizePx).png().toBuffer())
  );
  const icoBuffer = await pngToIco(icoFrames);

  // 4. Save PNG and ICO to targets
  const iconTargets = [
    // Async app icons
    { path: path.join(root, 'Async', 'resources', 'icons', 'icon.png'), buf: masterIconBuffer },
    { path: path.join(root, 'Async', 'resources', 'icons', 'icon.ico'), buf: icoBuffer },
    { path: path.join(root, 'Async', 'public', 'favicon.png'), buf: await sharp(masterIconBuffer).resize(32, 32).png().toBuffer() },
    { path: path.join(root, 'Async', 'public', 'favicon.ico'), buf: icoBuffer },
    { path: path.join(root, 'Async', 'public', 'logo.png'), buf: transparentLogoBuffer },
    // Branding folder
    { path: path.join(root, 'albion-branding', 'icon.ico'), buf: icoBuffer },
    { path: path.join(root, 'albion-branding', 'icon.png'), buf: masterIconBuffer },
    { path: path.join(root, 'albion-branding', 'albion-logo.png'), buf: transparentLogoBuffer },
    { path: path.join(root, 'albion-branding', 'logo.png'), buf: transparentLogoBuffer },
  ];

  for (const item of iconTargets) {
    await fs.mkdir(path.dirname(item.path), { recursive: true });
    await fs.writeFile(item.path, item.buf);
    console.log('Wrote image/icon:', item.path);
  }

  console.log('All logo and icon assets successfully generated!');
}

run().catch(console.error);
