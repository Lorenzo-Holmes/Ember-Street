import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import sharp from 'sharp';
import { compileMinitoolCss } from './minitool-css.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const parent = path.join(root, 'output', 'releases', `ember-street-xhs-${stamp}`);
const outDir = path.join(parent, 'app');
if (fs.existsSync(outDir)) throw new Error('Release directory already exists; refusing to overwrite it.');
fs.mkdirSync(outDir, { recursive: true });

await build({
  configFile: false, root, base: './',
  // React's optional bandwidth heuristic reads a prohibited device API; use its built-in fallback.
  define: { 'navigator.connection': 'undefined' },
  plugins: [{ name: 'minitool-entry', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return `import './minitool/runtime';\n${code}\nimport './minitool/compat.css';`;
    if (id.replaceAll('\\', '/').endsWith('/src/typography.css')) return code
      .replace(/@font-face\s*\{[^}]+\}/g, (block) => /font-family:\s*"(?:Noto Sans SC|ZCOOL XiaoWei)"/.test(block) ? '' : block)
      .replace(/--font-game-body:[^;]+;/, '--font-game-body: "LXGW WenKai", "PingFang SC", "Microsoft YaHei", serif;')
      .replace(/--font-game-display:[^;]+;/, '--font-game-display: "Ma Shan Zheng", serif;');
  } }, react()],
  build: { outDir, emptyOutDir: false, target: ['es2017', 'chrome61'], cssTarget: 'chrome61',
    assetsInlineLimit: 0, modulePreload: false, sourcemap: false, cssCodeSplit: false, cssMinify: false,
    rolldownOptions: { output: { format: 'iife' } } },
});

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const replacements = new Map();
const optimized = [];
for (const name of ['notebook-cover-worn.png', 'notebook-binding-transparent.png']) {
  const input = path.join(outDir, 'assets', 'ui', name);
  const output = input.replace(/\.png$/, '.webp');
  const before = fs.statSync(input).size;
  await sharp(input).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 100, effort: 5 }).toFile(output);
  replacements.set(name, path.basename(output));
  optimized.push({ file: name, before, after: fs.statSync(output).size });
  fs.unlinkSync(input); // Only generated copies in this newly created release directory.
}
for (const file of walk(outDir)) {
  if (!['.css', '.js', '.html'].includes(path.extname(file))) continue;
  let contents = fs.readFileSync(file, 'utf8');
  for (const [oldName, newName] of replacements) contents = contents.split(oldName).join(newName);
  if (file.endsWith('.html')) {
    contents = contents.replace(/<script\s+type="module"\s+crossorigin/g, '<script defer')
      .replace(/<link\s+rel="stylesheet"\s+crossorigin/g, '<link rel="stylesheet"');
  } else if (file.endsWith('.css')) {
    contents = contents.replace(/url\((['"]?)\/assets\//g, 'url($1./');
    contents = compileMinitoolCss(contents);
  } else {
    contents = contents.replace(/(['"`])\/assets\//g, '$1./assets/');
  }
  fs.writeFileSync(file, contents);
}

const python = process.env.MINITOOL_PYTHON || 'python';
const fontResult = execFileSync(python, [path.join(root, 'scripts', 'prepare-minitool-fonts.py'), outDir], { encoding: 'utf8' });
const fontLicenses = {};
for (const name of ['ibm-plex-mono', 'lxgw-wenkai', 'ma-shan-zheng']) {
  fontLicenses[name] = fs.readFileSync(path.join(root, 'node_modules', '@fontsource', name, 'LICENSE'), 'utf8');
}
fs.writeFileSync(path.join(outDir, 'font-licenses.json'), JSON.stringify({ note: 'Project-specific subsets of OFL fonts; original notices retained.', licenses: fontLicenses }, null, 2));
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  builtAt: new Date().toISOString(), directory: outDir, target: ['es2017', 'chrome61'], format: 'classic iife',
  optimizedImages: optimized, fonts: JSON.parse(fontResult),
  files: walk(outDir).map((file) => ({ path: path.relative(outDir, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size })) };
fs.writeFileSync(path.join(parent, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(`MINITOOL_ARTIFACT=${outDir}`);
console.log(`Total unpacked: ${(report.files.reduce((sum, file) => sum + file.bytes, 0) / 1048576).toFixed(2)} MiB`);
