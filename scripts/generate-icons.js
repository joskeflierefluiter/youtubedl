const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');
const pngToIco = require('png-to-ico');

const ROOT = process.cwd();
const BUILD_DIR = path.join(ROOT, 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return;
  }
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > radius) {
        setPixel(png, x, y, 0, 0, 0, 0);
        continue;
      }

      const t = clamp((dx + dy + radius) / (radius * 2), 0, 1);
      const r = Math.round(14 + t * 32);
      const g = Math.round(116 + t * 90);
      const b = Math.round(180 + t * 60);

      const edge = clamp((radius - distance) / (size * 0.035), 0, 1);
      const alpha = Math.round(255 * edge);
      setPixel(png, x, y, r, g, b, alpha);
    }
  }

  const triLeft = size * 0.39;
  const triRight = size * 0.67;
  const triTop = size * 0.33;
  const triBottom = size * 0.67;

  for (let y = Math.floor(triTop); y < Math.ceil(triBottom); y += 1) {
    const rowT = (y - triTop) / (triBottom - triTop);
    const xStart = triLeft;
    const xEnd = triLeft + rowT * (triRight - triLeft);
    for (let x = Math.floor(xStart); x < Math.ceil(xEnd); x += 1) {
      setPixel(png, x, y, 245, 250, 255, 250);
    }
  }

  return png;
}

async function writePng(filePath, size) {
  const png = drawIcon(size);
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    png.pack().pipe(stream);
  });
}

function ensureDirs() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

function clearDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

async function generatePngs() {
  const fileMap = {};
  for (const size of SIZES) {
    const outputFile = path.join(ICONS_DIR, `icon-${size}.png`);
    await writePng(outputFile, size);
    fileMap[size] = outputFile;
  }

  fs.copyFileSync(fileMap[1024], path.join(BUILD_DIR, 'icon.png'));
  return fileMap;
}

async function generateIco(fileMap) {
  const buffers = [16, 24, 32, 48, 64, 128, 256].map((size) => fileMap[size]);
  const icoBuffer = await pngToIco(buffers);
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), icoBuffer);
}

function generateIcns(fileMap) {
  if (process.platform !== 'darwin') {
    return;
  }

  clearDir(ICONSET_DIR);
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  const iconsetMap = {
    'icon_16x16.png': 16,
    'icon_16x16@2x.png': 32,
    'icon_32x32.png': 32,
    'icon_32x32@2x.png': 64,
    'icon_128x128.png': 128,
    'icon_128x128@2x.png': 256,
    'icon_256x256.png': 256,
    'icon_256x256@2x.png': 512,
    'icon_512x512.png': 512,
    'icon_512x512@2x.png': 1024
  };

  for (const [target, sourceSize] of Object.entries(iconsetMap)) {
    fs.copyFileSync(fileMap[sourceSize], path.join(ICONSET_DIR, target));
  }

  const result = spawnSync('iconutil', ['-c', 'icns', ICONSET_DIR, '-o', path.join(BUILD_DIR, 'icon.icns')], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error('iconutil kon icon.icns niet genereren.');
  }
}

async function run() {
  ensureDirs();
  const fileMap = await generatePngs();
  await generateIco(fileMap);
  generateIcns(fileMap);
  console.log('Icons generated in build/: icon.png, icon.ico, icon.icns (darwin only).');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
