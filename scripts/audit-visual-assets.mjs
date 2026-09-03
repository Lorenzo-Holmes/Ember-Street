import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const sourcePath = join(root, 'src', 'ui', 'visualAssets.ts');
const source = readFileSync(sourcePath, 'utf8');
const strict = process.argv.includes('--strict');
const assetDir = join(root, 'public', 'assets', 'canonical');

const registryMatches = [...source.matchAll(/canonicalId:\s*'(A\d+)'[\s\S]*?status:\s*'(locked|needs-correction|unresolved)'/g)];
const registry = registryMatches.map((match) => ({ id: match[1], status: match[2] }));
const expectedIds = Array.from({ length: 29 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`);
const foundIds = [...new Set(registry.map((asset) => asset.id))].sort();
const missingIds = expectedIds.filter((id) => !foundIds.includes(id));
const extraIds = foundIds.filter((id) => !expectedIds.includes(id));
const duplicates = foundIds.filter((id) => registry.filter((asset) => asset.id === id).length !== 1);
const nonLocked = registry.filter((asset) => asset.status !== 'locked');

const unresolvedMatch = source.match(/UNRESOLVED_CANONICAL_IDS\s*=\s*\[([^\]]*)\]/);
const unresolved = unresolvedMatch ? [...unresolvedMatch[1].matchAll(/'(A\d+)'/g)].map((item) => item[1]) : [];

const spriteSpecs = [
  ['characters-a.webp', ['A01', 'A02', 'A07']],
  ['characters-b.webp', ['A08', 'A09', 'A10']],
  ['places-a.webp', ['A03', 'A04', 'A06', 'A11', 'A12', 'A13']],
  ['places-b.webp', ['A14', 'A15', 'A16', 'A17', 'A18']],
  ['events-a.webp', ['A05', 'A19', 'A20', 'A21', 'A22', 'A23']],
  ['events-b1.webp', ['A24', 'A25', 'A26']],
  ['events-b2.webp', ['A27', 'A28', 'A29']],
];

function validateWebP(name) {
  const absolute = join(assetDir, name);
  if (!existsSync(absolute)) return { name, exists: false, size: 0, valid: false, issue: 'missing' };
  const bytes = readFileSync(absolute);
  const size = statSync(absolute).size;
  if (bytes.length < 12) return { name, exists: true, size, valid: false, issue: 'too short for RIFF/WebP header' };
  const riff = bytes.subarray(0, 4).toString('ascii');
  const webp = bytes.subarray(8, 12).toString('ascii');
  const declared = bytes.readUInt32LE(4) + 8;
  if (riff !== 'RIFF' || webp !== 'WEBP') return { name, exists: true, size, valid: false, issue: `bad header ${riff}/${webp}` };
  if (declared !== size) return { name, exists: true, size, valid: false, issue: `truncated/corrupt RIFF: declares ${declared} bytes, file has ${size}` };
  return { name, exists: true, size, valid: true, issue: '' };
}

const sprites = spriteSpecs.map(([name, ids]) => ({ ...validateWebP(name), ids }));
const spriteIssues = sprites.filter((sprite) => !sprite.valid);
const coveredIds = spriteSpecs.flatMap(([, ids]) => ids).sort();
const coverageMissing = expectedIds.filter((id) => !coveredIds.includes(id));
const coverageExtra = coveredIds.filter((id) => !expectedIds.includes(id));
const coverageDuplicates = [...new Set(coveredIds)].filter((id) => coveredIds.filter((item) => item === id).length !== 1);

const oldSprites = ['canonical-characters.webp', 'canonical-places.webp', 'canonical-events.webp']
  .filter((name) => existsSync(join(assetDir, name)));

console.log(`Canonical registry: ${registry.length} entries, ${foundIds.length} unique IDs`);
console.log(`Locked canonical IDs: ${registry.filter((asset) => asset.status === 'locked').length}/29`);
console.log(`Runtime sprite sheets valid: ${sprites.filter((sprite) => sprite.valid).length}/${sprites.length}`);
for (const sprite of sprites) console.log(`  - ${sprite.name}: ${(sprite.size / 1024).toFixed(1)} KiB · ${sprite.valid ? 'RIFF OK' : sprite.issue}`);

if (missingIds.length) console.log(`\nMissing registry IDs: ${missingIds.join(', ')}`);
if (extraIds.length) console.log(`\nUnexpected registry IDs: ${extraIds.join(', ')}`);
if (duplicates.length) console.log(`\nDuplicate registry IDs: ${duplicates.join(', ')}`);
if (nonLocked.length) console.log(`\nNon-locked registry entries: ${nonLocked.map((asset) => `${asset.id}:${asset.status}`).join(', ')}`);
if (unresolved.length) console.log(`\nUnresolved IDs: ${unresolved.join(', ')}`);
if (coverageMissing.length) console.log(`\nSprite coverage missing: ${coverageMissing.join(', ')}`);
if (coverageExtra.length) console.log(`\nUnexpected sprite coverage: ${coverageExtra.join(', ')}`);
if (coverageDuplicates.length) console.log(`\nDuplicate sprite coverage: ${coverageDuplicates.join(', ')}`);
if (spriteIssues.length) console.log(`\nInvalid sprite files: ${spriteIssues.map((sprite) => sprite.name).join(', ')}`);
if (oldSprites.length) console.log(`\nObsolete large sprite files still present: ${oldSprites.join(', ')}`);

const failed = registry.length !== 29 || missingIds.length || extraIds.length || duplicates.length || nonLocked.length || unresolved.length || coverageMissing.length || coverageExtra.length || coverageDuplicates.length || spriteIssues.length || oldSprites.length;
if (!failed) console.log('\nCanonical A01-A29 runtime package is complete, fully covered, and byte-valid.');
if (strict && failed) {
  console.error('\nStrict canonical asset audit failed.');
  process.exit(1);
}
