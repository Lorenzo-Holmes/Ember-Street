import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';

export function auditMinitool(directory) {
  const root = path.resolve(directory);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const files = walk(root);
  const errors = [];
  const allowed = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json']);
  const references = [];
  let largestBase64 = 0;
  const checkReference = (source, url) => {
    if (/^(data:|blob:|#)/.test(url)) return;
    if (/^(?:[a-z]+:|\/)/i.test(url)) { errors.push(`${path.basename(source)}: non-relative resource ${url}`); return; }
    const target = path.resolve(path.dirname(source), decodeURIComponent(url.split(/[?#]/)[0]));
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target)) errors.push(`${path.basename(source)}: missing local resource ${url}`);
    references.push(url);
  };
  const htmlFiles = files.filter((file) => file.endsWith('.html'));
  if (htmlFiles.length !== 1 || htmlFiles[0] !== path.join(root, 'index.html')) errors.push('Exactly one root index.html is required');
  for (const file of files) {
    const relative = path.relative(root, file);
    const extension = path.extname(file).toLowerCase();
    if (!allowed.has(extension) || /(?:^|[\\/])(?:node_modules|\.git)(?:[\\/]|$)|\.map$|vite\.config/.test(relative)) errors.push(`Forbidden package file: ${relative}`);
    if (!['.html', '.css', '.js', '.json'].includes(extension)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/data:[^;,\s]+;base64,([A-Za-z0-9+/=]+)/g)) {
      const size = Buffer.from(match[1], 'base64').length;
      largestBase64 = Math.max(largestBase64, size);
      if (size > 1048576) errors.push(`${relative}: oversized inline base64`);
    }
    if (extension === '.html') {
      if (!/<!doctype html>/i.test(content) || !/lang="zh-CN"/.test(content) || !/charset="UTF-8"/i.test(content)) errors.push('Missing HTML language/encoding metadata');
      for (const required of ['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover']) if (!content.includes(required)) errors.push(`Missing viewport ${required}`);
      if (/type=["']module["']|<base\b|<iframe\b|<object\b|http-equiv=["']Content-Security-Policy|\son\w+\s*=|javascript:|\bdownload\s*[=>]|target=["']_blank/i.test(content)) errors.push(`${relative}: forbidden HTML capability`);
      for (const script of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc=/.test(script[1]) || script[2].trim()) errors.push('Inline script is forbidden');
      for (const match of content.matchAll(/<(?:script|link|img|audio|video)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) checkReference(file, match[1]);
    }
    if (extension === '.css') {
      if (/:has\(|:where\(|(?<!-)\b:is\(|@(?:container|layer|property)\b/.test(content)) errors.push(`${relative}: unlowered modern selector or layout rule`);
      for (const match of content.matchAll(/url\(\s*['"]?([^'"\)]+)['"]?\s*\)/g)) checkReference(file, match[1].trim());
    }
    if (extension === '.js') {
      const forbidden = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bnew\s+(?:Worker|SharedWorker|WebSocket|EventSource|RTCPeerConnection)\s*\(/,
        /\bnavigator\.(?:geolocation|clipboard|bluetooth|usb|hid|serial|connection|credentials|locks|getBattery|serviceWorker)\b/,
        /\b(?:eval|WebAssembly)\s*[.(]/, /\bnew\s+Function\s*\(/, /\bwindow\.(?:open|prompt)\s*\(/,
        /\b(?:requestFullscreen|webkitRequestFullscreen|getDisplayMedia|enumerateDevices)\s*\(/];
      forbidden.forEach((pattern) => { if (pattern.test(content)) errors.push(`${relative}: forbidden runtime pattern ${pattern.source}`); });
      for (const match of content.matchAll(/["'`]((?:\.\/|\/)assets\/[^"'`]+)["'`]/g)) checkReference(path.join(root, 'index.html'), match[1]);
      try { parse(content, { ecmaVersion: 2017, sourceType: 'script' }); }
      catch (error) { errors.push(`${relative}: not an ES2017 classic script: ${error.message}`); }
    }
  }
  return { passed: errors.length === 0, errors: [...new Set(errors)], fileCount: files.length,
    referencedResourceCount: references.length, largestBase64Bytes: largestBase64,
    unpackedBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
    compatibility: 'Chrome 61 syntax/feature-fallback review; real Android/iOS device testing still required' };
}

if (process.argv[1]?.endsWith('audit-minitool.mjs')) {
  const report = auditMinitool(process.argv[2]);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
