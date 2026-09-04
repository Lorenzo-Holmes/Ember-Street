import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const registryPath = join(root, 'src', 'ui', 'buildingVisuals.ts');
const registry = readFileSync(registryPath, 'utf8');
const assetDir = join(root, 'public', 'assets', 'buildings');

const expected = [
  ['searchStation', 'search-station.webp'],
  ['workshop', 'workshop.webp'],
  ['clinic', 'clinic.webp'],
  ['watchPost', 'watch-post.webp'],
  ['radio', 'radio-room.webp'],
];

function statusFor(id) {
  const block = registry.match(new RegExp(`${id}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`));
  if (!block) return 'missing-registry-entry';
  return block[1].match(/status:\s*'(ready|pending)'/)?.[1] ?? 'missing-status';
}

function validateWebP(name) {
  const absolute = join(assetDir, name);
  if (!existsSync(absolute)) return { exists: false, valid: false, size: 0, issue: 'missing' };
  const bytes = readFileSync(absolute);
  const size = statSync(absolute).size;
  if (size < 12) return { exists: true, valid: false, size, issue: 'too short for RIFF/WebP header' };
  const riff = bytes.subarray(0, 4).toString('ascii');
  const webp = bytes.subarray(8, 12).toString('ascii');
  const declared = bytes.readUInt32LE(4) + 8;
  if (riff !== 'RIFF' || webp !== 'WEBP') return { exists: true, valid: false, size, issue: `bad header ${riff}/${webp}` };
  if (declared !== size) return { exists: true, valid: false, size, issue: `truncated/corrupt RIFF: declares ${declared} bytes, file has ${size}` };
  return { exists: true, valid: true, size, issue: '' };
}

const rows = expected.map(([id, file]) => ({ id, file, status: statusFor(id), ...validateWebP(file) }));

console.log('Facility visual pass:');
for (const row of rows) {
  const payload = row.exists ? `${(row.size / 1024).toFixed(1)} KiB` : 'no file';
  const bytes = row.valid ? 'RIFF OK' : row.issue;
  console.log(`  - ${row.id}: ${row.status} · ${row.file} · ${payload} · ${bytes}`);
}
console.log('  - shelter: ready · canonical A06');

const invalidReady = rows.filter((row) => row.status === 'ready' && !row.valid);
const pending = rows.filter((row) => row.status !== 'ready');
const invalidRegistry = rows.filter((row) => !['ready', 'pending'].includes(row.status));

if (invalidReady.length) console.log(`\nReady entries with invalid/missing files: ${invalidReady.map((row) => row.id).join(', ')}`);
if (pending.length) console.log(`\nPending facility art: ${pending.map((row) => row.id).join(', ')}`);
if (invalidRegistry.length) console.log(`\nRegistry errors: ${invalidRegistry.map((row) => `${row.id}:${row.status}`).join(', ')}`);

const failed = invalidReady.length || invalidRegistry.length || (strict && pending.length);
if (!failed && !pending.length) console.log('\nAll six facility visuals are release-ready.');
if (!failed && pending.length) console.log('\nRegistry is valid; facility visual pass is still in progress.');
if (failed) {
  console.error(strict ? '\nStrict facility visual audit failed.' : '\nFacility visual registry/file mismatch detected.');
  process.exit(1);
}
