import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

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

function localAssetExists(fromFile, url) {
  if (!url || /^(?:data:|blob:|#)/i.test(url)) return true;
  const clean = url.split(/[?#]/, 1)[0];
  if (!clean || clean.startsWith('/')) return false;
  const target = normalize(resolve(dirname(fromFile), clean));
  return target.startsWith(resolve(dist)) && existsSync(target);
}

if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('dist/ does not exist. Run npm run build:xhs first.');
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
    if (!/^\s*<!doctype html>/i.test(text)) fail(`${rel}: missing <!DOCTYPE html>`, failures);
    if (!/<html\b[^>]*\blang=["']zh-CN["']/i.test(text)) fail(`${rel}: html lang must be zh-CN`, failures);
    if (!/<meta\b[^>]*charset=["']?UTF-8["']?/i.test(text)) fail(`${rel}: missing UTF-8 charset`, failures);
    const viewport = text.match(/<meta\b[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ?? '';
    for (const token of ['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover']) {
      if (!viewport.includes(token)) fail(`${rel}: viewport missing ${token}`, failures);
    }
    if (/<iframe\b/i.test(text) || /<object\b/i.test(text)) fail(`${rel}: iframe/object is forbidden`, failures);
    if (/<base\b/i.test(text)) fail(`${rel}: <base> is forbidden`, failures);
    if (/<meta\b[^>]*http-equiv=["']Content-Security-Policy["']/i.test(text)) fail(`${rel}: custom CSP meta is forbidden`, failures);
    if (/target\s*=\s*["']_blank["']/i.test(text)) fail(`${rel}: target=_blank is forbidden`, failures);
    if (/<a\b[^>]*\bdownload(?:\s|=|>)/i.test(text)) fail(`${rel}: download links are forbidden`, failures);
    if (/\son[a-z]+\s*=/i.test(text)) fail(`${rel}: inline event handler is forbidden`, failures);
    if (/javascript\s*:/i.test(text)) fail(`${rel}: javascript: URI is forbidden`, failures);
    if (/<script\b[^>]*\btype=["']module["']/i.test(text)) fail(`${rel}: module scripts are forbidden`, failures);
    if (/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(text)) fail(`${rel}: inline script is forbidden`, failures);

    for (const match of text.matchAll(/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const url = match[1];
      if (/^(?:https?:)?\/\//i.test(url)) fail(`${rel}: external resource reference ${url}`, failures);
      if (url.startsWith('/')) fail(`${rel}: root-absolute resource reference ${url}`, failures);
      if (!localAssetExists(file, url)) fail(`${rel}: missing or invalid local resource ${url}`, failures);
    }
  }

  if (ext === '.css') {
    if (/url\(\s*["']?(?:https?:)?\/\//i.test(text)) fail(`${rel}: external CSS resource URL`, failures);
    if (/url\(\s*["']?\/(?!\/)/i.test(text)) fail(`${rel}: root-absolute CSS resource URL`, failures);
  }

  if (ext === '.js') {
    const forbidden = [
      [/\bfetch\s*\(/, 'fetch()'],
      [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
      [/\bnew\s+WebSocket\s*\(/, 'WebSocket'],
      [/\bnew\s+EventSource\s*\(/, 'EventSource'],
      [/\bnew\s+RTCPeerConnection\s*\(/, 'RTCPeerConnection'],
      [/\bnavigator\.(?:geolocation|clipboard|bluetooth|usb|hid|serial|getBattery|connection|credentials|locks)\b/, 'forbidden navigator API'],
      [/\bnavigator\.mediaDevices\.(?:enumerateDevices|getDisplayMedia)\b/, 'forbidden mediaDevices API'],
      [/\bnavigator\.storage\.persist\b/, 'storage.persist'],
      [/\bnavigator\.serviceWorker\b/, 'serviceWorker'],
      [/\bnew\s+(?:Worker|SharedWorker)\s*\(/, 'Worker'],
      [/\b(?:Accelerometer|Gyroscope|Magnetometer|DeviceMotionEvent|DeviceOrientationEvent)\b/, 'sensor API'],
      [/\b(?:requestFullscreen|webkitRequestFullscreen)\s*\(/, 'fullscreen API'],
      [/\beval\s*\(/, 'eval()'],
      [/\bnew\s+Function\s*\(/, 'new Function()'],
      [/\bWebAssembly\b/, 'WebAssembly'],
      [/\bwindow\.(?:open|prompt)\s*\(/, 'forbidden window API'],
      [/\bimport\s*\(/, 'dynamic import()'],
      [/\bexport\s+(?:default|\{|\*|const|let|var|function|class)\b/, 'ES module export'],
    ];
    for (const [pattern, label] of forbidden) {
      if (pattern.test(text)) fail(`${rel}: ${label} is forbidden`, failures);
    }
  }
}

if (htmlFiles.length !== 1) fail(`expected exactly one HTML entry, found ${htmlFiles.length}`, failures);
if (htmlFiles.length === 1 && relative(dist, htmlFiles[0]).replaceAll('\\', '/') !== 'index.html') {
  fail(`HTML entry must be dist/index.html, found ${relative(dist, htmlFiles[0])}`, failures);
}

console.log(`Total uncompressed package size: ${(totalBytes / 1024).toFixed(1)} KiB`);
console.log(`Image payload: ${(imageBytes / 1024).toFixed(1)} KiB`);

if (failures.length) {
  console.error(`XHS package audit failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log('XHS package audit passed: skill 1.6.0 static/container gates look clean.');
