import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const registryPath = path.join(root, 'src', 'audio', 'audioRegistry.ts');
const audioRoot = path.join(root, 'public', 'assets', 'audio');
const maxAudioBytes = 3.2 * 1024 * 1024;
const maxSingleBytes = 700 * 1024;

const fail = (message, errors) => { errors.push(message); console.error(`  ✗ ${message}`); };
const registry = fs.readFileSync(registryPath, 'utf8');
const refs = [...registry.matchAll(/src:\s*['"](\/assets\/audio\/[^'"]+\.mp3)['"]/g)].map((match) => match[1]);
const uniqueRefs = [...new Set(refs)];
const errors = [];
let totalBytes = 0;

if (refs.length !== uniqueRefs.length) fail('audio registry contains duplicate file references', errors);
if (uniqueRefs.length !== 26) fail(`expected 26 registered MP3 files, found ${uniqueRefs.length}`, errors);

const rows = [];
for (const ref of uniqueRefs) {
  const relative = ref.replace(/^\/assets\/audio\//, '');
  const file = path.join(audioRoot, relative);
  if (!fs.existsSync(file)) { fail(`missing registered audio: ${relative}`, errors); continue; }
  const bytes = fs.readFileSync(file);
  const size = bytes.length;
  totalBytes += size;
  if (size > maxSingleBytes) fail(`${relative} is ${(size / 1024).toFixed(1)} KiB; per-file budget is 700 KiB`, errors);
  const id3 = bytes.length >= 3 && bytes.subarray(0, 3).toString('ascii') === 'ID3';
  const frame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (!id3 && !frame) fail(`${relative} does not begin with an MP3 ID3/frame signature`, errors);
  rows.push({ relative, size, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}

if (totalBytes > maxAudioBytes) fail(`audio payload ${(totalBytes / 1048576).toFixed(2)} MiB exceeds 3.2 MiB budget`, errors);
const manifest = path.join(audioRoot, 'audio-manifest.json');
if (!fs.existsSync(manifest)) fail('audio-manifest.json is missing', errors);

console.log(`Audio registry: ${uniqueRefs.length} MP3 references`);
console.log(`Runtime audio payload: ${(totalBytes / 1048576).toFixed(2)} MiB`);
for (const row of rows) console.log(`  - ${row.relative}: ${(row.size / 1024).toFixed(1)} KiB · ${row.sha256.slice(0, 12)}`);
if (errors.length) process.exit(1);
console.log('Audio audit passed: all registered files exist, are MP3-shaped, local, and within budget.');
