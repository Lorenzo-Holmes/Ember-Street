import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const assets = join(dist, 'assets');
const htmlPath = join(dist, 'index.html');

let html = readFileSync(htmlPath, 'utf8');
html = html
  .replace(/\s+crossorigin(?=[\s>])/g, '')
  .replace(/\stype=["']module["']/gi, '')
  .replace(/\b(src|href)=["']\/(?!\/)/gi, '$1="./');
writeFileSync(htmlPath, html);

const jsFiles = readdirSync(assets)
  .filter((name) => extname(name).toLowerCase() === '.js')
  .map((name) => join(assets, name));

for (const file of jsFiles) {
  let code = readFileSync(file, 'utf8');
  let patched = false;

  // React 19's DOM bundle contains optional resource-preload telemetry that uses
  // fetch() and navigator.connection. The mini-tool container is strictly offline,
  // so neutralize those optional paths in the release artifact.
  if (/\bfetch\s*\(/.test(code)) {
    code = `function __xhsOfflineFetch(){return undefined;}\n${code.replace(/\bfetch\s*\(/g, '__xhsOfflineFetch(')}`;
    patched = true;
  }
  if (/\bnavigator\.connection\b/.test(code)) {
    code = code.replace(/\bnavigator\.connection\b/g, 'navigator.__xhsOfflineConnection');
    patched = true;
  }

  if (patched) writeFileSync(file, code);
}

console.log(`Sanitized Xiaohongshu dist: ${jsFiles.length} JS file(s), offline-only classic entry.`);
