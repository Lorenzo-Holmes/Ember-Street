import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sourceDirArg = process.argv[2];
if (!sourceDirArg) {
  console.error('Usage: npm run build:building-assets -- <approved-source-directory>');
  console.error('Expected files are named by canonical ID (A30..A46) as PNG/JPG/JPEG/WebP.');
  process.exit(1);
}

const root = process.cwd();
const sourceDir = path.resolve(root, sourceDirArg);
const outputDir = path.join(root, 'public', 'assets', 'canonical');
const tileWidth = 480;
const tileHeight = 320;
const columns = 3;
const extensions = ['.png', '.jpg', '.jpeg', '.webp'];

const groups = [
  {
    name: 'buildings-a.webp',
    ids: ['A30', 'A31', 'A32', 'A33', 'A34', 'A35', 'A36', 'A37', 'A38'],
  },
  {
    name: 'buildings-b.webp',
    ids: ['A39', 'A40', 'A41', 'A42', 'A43', 'A44', 'A45', 'A46'],
  },
];

function findSource(id) {
  for (const extension of extensions) {
    const candidate = path.join(sourceDir, `${id}${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing approved building master ${id} in ${sourceDir}`);
}

async function tileBuffer(id) {
  const input = findSource(id);
  return sharp(input)
    .rotate()
    .resize(tileWidth, tileHeight, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  throw new Error(`Approved source directory does not exist: ${sourceDir}`);
}
fs.mkdirSync(outputDir, { recursive: true });

for (const group of groups) {
  const rows = Math.ceil(group.ids.length / columns);
  const composites = [];
  for (const [index, id] of group.ids.entries()) {
    composites.push({
      input: await tileBuffer(id),
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    });
  }

  const output = path.join(outputDir, group.name);
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 55, alphaQuality: 100, effort: 5, smartSubsample: true })
    .toFile(output);

  console.log(`${group.name}: ${group.ids.join(', ')} · ${(fs.statSync(output).size / 1024).toFixed(1)} KiB`);
}

console.log('Building sprites built. Next: run npm test, npm run audit:assets:strict, npm run build, npm run audit:xhs, and npm run test:ui-smoke.');
