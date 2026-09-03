import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourcePath = join(root, 'src', 'ui', 'visualAssets.ts');
const source = readFileSync(sourcePath, 'utf8');
const strict = process.argv.includes('--strict');
const assetDir = join(root, 'public', 'assets', 'canonical');

const assetPattern = /canonicalId:\s*'(A\d+)'[\s\S]*?path:\s*canonicalPath\('\1',\s*'([^']+)'\)[\s\S]*?status:\s*'(locked|needs-correction|unresolved)'/g;
const assets = [];
let match;
while ((match = assetPattern.exec(source))) {
  const [, id, slug, status] = match;
  const relative = `public/assets/canonical/${id.toLowerCase()}-${slug}.svg`;
  const absolute = join(root, relative);
  assets.push({ id, slug, status, relative, absolute, exists: existsSync(absolute), size: existsSync(absolute) ? statSync(absolute).size : 0 });
}

const unresolvedMatch = source.match(/UNRESOLVED_CANONICAL_IDS\s*=\s*\[([^\]]*)\]/);
const unresolved = unresolvedMatch ? [...unresolvedMatch[1].matchAll(/'(A\d+)'/g)].map((item) => item[1]) : [];
const locked = assets.filter((asset) => asset.status === 'locked');
const missingLocked = locked.filter((asset) => !asset.exists);
const blocked = assets.filter((asset) => asset.status === 'needs-correction');
const blockedPresent = blocked.filter((asset) => asset.exists);
const presentLocked = locked.filter((asset) => asset.exists);

const sprites = [
  { name: 'canonical-characters.webp', minBytes: 20_000 },
  { name: 'canonical-places.webp', minBytes: 12_000 },
  { name: 'canonical-events.webp', minBytes: 12_000 },
].map((sprite) => {
  const absolute = join(assetDir, sprite.name);
  return { ...sprite, absolute, exists: existsSync(absolute), size: existsSync(absolute) ? statSync(absolute).size : 0 };
});
const missingSprites = sprites.filter((sprite) => !sprite.exists);
const suspiciousSprites = sprites.filter((sprite) => sprite.exists && sprite.size < sprite.minBytes);
const wrapperIssues = [];
for (const asset of presentLocked) {
  const svg = readFileSync(asset.absolute, 'utf8');
  if (!/^<svg\b/.test(svg.trim())) wrapperIssues.push(`${asset.id}: wrapper is not SVG`);
  if (!/href="canonical-(?:characters|places|events)\.webp"/.test(svg)) wrapperIssues.push(`${asset.id}: wrapper does not reference a canonical local sprite`);
  if (/(?:https?:)?\/\//i.test(svg.replace('http://www.w3.org/2000/svg', ''))) wrapperIssues.push(`${asset.id}: external URL found in wrapper`);
}

console.log(`Canonical registry: ${assets.length} mapped assets + ${unresolved.length} unresolved ID(s)`);
console.log(`Locked wrappers present: ${presentLocked.length}/${locked.length}`);
console.log(`Runtime sprite sheets present: ${sprites.filter((sprite) => sprite.exists).length}/${sprites.length}`);
for (const sprite of sprites) if (sprite.exists) console.log(`  - ${sprite.name}: ${(sprite.size / 1024).toFixed(1)} KiB`);

if (missingLocked.length) {
  console.log('\nMissing locked wrappers:');
  for (const asset of missingLocked) console.log(`  - ${asset.id}: ${asset.relative}`);
}
if (missingSprites.length) {
  console.log('\nMissing runtime sprite sheets:');
  for (const sprite of missingSprites) console.log(`  - public/assets/canonical/${sprite.name}`);
}
if (suspiciousSprites.length) {
  console.log('\nSuspiciously small runtime sprite sheets:');
  for (const sprite of suspiciousSprites) console.log(`  - ${sprite.name}: ${sprite.size} bytes`);
}
if (blocked.length) {
  console.log('\nBlocked / needs-correction assets:');
  for (const asset of blocked) console.log(`  - ${asset.id}: ${asset.relative}${asset.exists ? ' [FILE PRESENT]' : ''}`);
}
if (unresolved.length) console.log(`\nUnresolved canonical IDs: ${unresolved.join(', ')}`);
if (wrapperIssues.length) {
  console.log('\nWrapper validation issues:');
  for (const issue of wrapperIssues) console.log(`  - ${issue}`);
}

const failed = missingLocked.length || missingSprites.length || suspiciousSprites.length || blockedPresent.length || unresolved.length || wrapperIssues.length;
if (!failed) console.log('\nCanonical A01-A29 runtime package is complete and locally bundled.');
if (strict && failed) {
  console.error('\nStrict canonical asset audit failed.');
  process.exit(1);
}
