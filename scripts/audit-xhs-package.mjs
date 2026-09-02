import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const ALLOWED = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);
const TEXT = new Set(['.html', '.css', '.js', '.svg', '.json']);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function fail(message, failures) {
  failures.push(message);
  console.error(`  ✗ ${message}`);
}

if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('dist/ does not exist. Run npm run build first.');
  process.exit(1);
}

const files = walk(dist);
const failures = [];
const htmlFiles = files.filter((file) => extname(file).toLowerCase() === '.html');
let totalBytes = 0;
let imageBytes = 0;

console.log(`XHS package audit: ${files.length} files`);

for (const file of files) {
  const ext = extname(file).toLowerCase();
  const rel = relative(dist, file).replaceAll('\\', '/');
  const size = statSync(file).size;
  totalBytes += size;
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) imageBytes += size;
  if (!ALLOWED.has(ext)) fail(`unsupported package file type: ${rel}`, failures);
  if (!TEXT.has(ext)) continue;

  const text = readFileSync(file, 'utf8');
  if (ext === '.html') {
    if (/<iframe\b/i.test(text) || /<object\b/i.test(text)) fail(`${rel}: iframe/object is forbidden`, failures);
    if (/target\s*=\s*["']_blank["']/i.test(text)) fail(`${rel}: target=_blank is forbidden`, failures);
    if (/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(text)) fail(`${rel}: inline script is forbidden`, failures);
    for (const match of text.matchAll(/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const url = match[1];
      if (/^(?:https?:)?\/\//i.test(url)) fail(`${rel}: external resource reference ${url}`, failures);
    }
  }

  if (ext === '.css' && /url\(\s*["']?(?:https?:)?\/\//i.test(text)) fail(`${rel}: external CSS resource URL`, failures);
  if (ext === '.js') {
    if (/\beval\s*\(/.test(text)) fail(`${rel}: eval() is forbidden`, failures);
    if (/\bnew\s+Function\s*\(/.test(text)) fail(`${rel}: new Function() is forbidden`, failures);
    if (/\bWebAssembly\b/.test(text)) fail(`${rel}: WebAssembly is forbidden`, failures);
    if (/\bwindow\.open\s*\(/.test(text)) fail(`${rel}: window.open() is forbidden`, failures);
    if (/\bnavigator\.(?:geolocation|clipboard)\b/.test(text)) fail(`${rel}: forbidden navigator API reference`, failures);
    if (/\b(?:WebSocket|EventSource)\s*\(/.test(text)) fail(`${rel}: realtime network API is forbidden`, failures);
  }
}

if (htmlFiles.length !== 1) fail(`expected exactly one HTML entry, found ${htmlFiles.length}`, failures);
if (htmlFiles.length === 1 && relative(dist, htmlFiles[0]).replaceAll('\\', '/') !== 'index.html') {
  fail(`HTML entry must be dist/index.html, found ${relative(dist, htmlFiles[0])}`, failures);
}

console.log(`Total package size: ${(totalBytes / 1024).toFixed(1)} KiB`);
console.log(`Image payload: ${(imageBytes / 1024).toFixed(1)} KiB`);

if (failures.length) {
  console.error(`XHS package audit failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log('XHS package audit passed: offline-compatible file surface and container restrictions look clean.');
