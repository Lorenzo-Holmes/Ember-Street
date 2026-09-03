import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

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
  const name = `${id.toLowerCase()}-${slug}.webp`;
  const absolute = join(assetDir, name);
  assets.push({ id, slug, status, name, absolute });
}

const expectedIds = Array.from({ length: 29 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`);
const foundIds = assets.map((asset) => asset.id).sort();
const missingRegistryIds = expectedIds.filter((id) => !foundIds.includes(id));
const duplicateIds = [...new Set(foundIds)].filter((id) => foundIds.filter((item) => item === id).length !== 1);
const nonLocked = assets.filter((asset) => asset.status !== 'locked');
const unresolvedMatch = source.match(/UNRESOLVED_CANONICAL_IDS\s*=\s*\[([^\]]*)\]/);
const unresolved = unresolvedMatch ? [...unresolvedMatch[1].matchAll(/'(A\d+)'/g)].map((item) => item[1]) : [];

function validateWebP(asset) {
  if (!existsSync(asset.absolute)) return { ...asset, exists: false, size: 0, valid: false, issue: 'missing' };
  const bytes = readFileSync(asset.absolute);
  const size = statSync(asset.absolute).size;
  if (bytes.length < 12) return { ...asset, exists: true, size, valid: false, issue: 'too short for RIFF/WebP header' };
  const riff = bytes.subarray(0, 4).toString('ascii');
  const webp = bytes.subarray(8, 12).toString('ascii');
  const declared = bytes.readUInt32LE(4) + 8;
  if (riff !== 'RIFF' || webp !== 'WEBP') return { ...asset, exists: true, size, valid: false, issue: `bad header ${riff}/${webp}` };
  if (declared !== size) return { ...asset, exists: true, size, valid: false, issue: `truncated/corrupt RIFF: declares ${declared} bytes, file has ${size}` };
  return { ...asset, exists: true, size, valid: true, issue: '' };
}

const checked = assets.map(validateWebP);
const invalid = checked.filter((asset) => !asset.valid);
const present = checked.filter((asset) => asset.valid);
const expectedNames = new Set(assets.map((asset) => asset.name));
const files = existsSync(assetDir) ? readdirSync(assetDir) : [];
const temporary = files.filter((name) => /^(?:canonical-|characters-|places-|events-)|\.svg$|^\.upload-note$/.test(name));
const unexpectedWebP = files.filter((name) => name.endsWith('.webp') && !expectedNames.has(name));

console.log(`Canonical registry: ${assets.length}/29 entries`);
console.log(`Independent WebP masters valid: ${present.length}/29`);
console.log(`Image payload: ${(present.reduce((sum, asset) => sum + asset.size, 0) / 1024).toFixed(1)} KiB`);

if (missingRegistryIds.length) console.log(`\nMissing registry IDs: ${missingRegistryIds.join(', ')}`);
if (duplicateIds.length) console.log(`\nDuplicate registry IDs: ${duplicateIds.join(', ')}`);
if (nonLocked.length) console.log(`\nNon-locked entries: ${nonLocked.map((asset) => `${asset.id}:${asset.status}`).join(', ')}`);
if (unresolved.length) console.log(`\nUnresolved IDs: ${unresolved.join(', ')}`);
if (invalid.length) {
  console.log('\nMissing / invalid canonical WebP masters:');
  for (const asset of invalid) console.log(`  - ${asset.id}: ${asset.name} · ${asset.issue}`);
}
if (temporary.length) console.log(`\nTemporary/obsolete runtime assets still present: ${temporary.join(', ')}`);
if (unexpectedWebP.length) console.log(`\nUnexpected WebP files: ${unexpectedWebP.join(', ')}`);

const failed = assets.length !== 29 || missingRegistryIds.length || duplicateIds.length || nonLocked.length || unresolved.length || invalid.length || temporary.length || unexpectedWebP.length;
if (!failed) console.log('\nCanonical A01-A29 package is complete: 29 independent local WebP masters, byte-valid and release-clean.');
if (strict && failed) {
  console.error('\nStrict canonical asset audit failed.');
  process.exit(1);
}
