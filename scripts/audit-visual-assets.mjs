import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourcePath = join(root, 'src', 'ui', 'visualAssets.ts');
const source = readFileSync(sourcePath, 'utf8');
const strict = process.argv.includes('--strict');

const assetPattern = /canonicalId:\s*'(A\d+)'[\s\S]*?path:\s*canonicalPath\('\1',\s*'([^']+)'\)[\s\S]*?status:\s*'(locked|needs-correction|unresolved)'/g;
const assets = [];
let match;
while ((match = assetPattern.exec(source))) {
  const [, id, slug, status] = match;
  const relative = `public/assets/canonical/${id.toLowerCase()}-${slug}.webp`;
  const absolute = join(root, relative);
  assets.push({ id, slug, status, relative, exists: existsSync(absolute), size: existsSync(absolute) ? statSync(absolute).size : 0 });
}

const unresolvedMatch = source.match(/UNRESOLVED_CANONICAL_IDS\s*=\s*\[([^\]]*)\]/);
const unresolved = unresolvedMatch ? [...unresolvedMatch[1].matchAll(/'(A\d+)'/g)].map((item) => item[1]) : [];
const locked = assets.filter((asset) => asset.status === 'locked');
const missingLocked = locked.filter((asset) => !asset.exists);
const blocked = assets.filter((asset) => asset.status === 'needs-correction');
const blockedPresent = blocked.filter((asset) => asset.exists);
const presentLocked = locked.filter((asset) => asset.exists);

console.log(`Canonical registry: ${assets.length} mapped assets + ${unresolved.length} unresolved ID(s)`);
console.log(`Locked binaries present: ${presentLocked.length}/${locked.length}`);

if (missingLocked.length) {
  console.log('\nMissing locked masters:');
  for (const asset of missingLocked) console.log(`  - ${asset.id}: ${asset.relative}`);
}

if (blocked.length) {
  console.log('\nBlocked / needs-correction assets (must not ship as canonical):');
  for (const asset of blocked) console.log(`  - ${asset.id}: ${asset.relative}${asset.exists ? ' [FILE PRESENT — REMOVE/REPLACE BEFORE RELEASE]' : ''}`);
}

if (unresolved.length) {
  console.log(`\nUnresolved canonical IDs: ${unresolved.join(', ')}`);
}

if (!missingLocked.length && !blockedPresent.length) console.log('\nAsset package is ready for locked-master release validation.');

if (strict && (missingLocked.length || blockedPresent.length || unresolved.length)) {
  console.error('\nStrict canonical asset audit failed.');
  process.exit(1);
}
