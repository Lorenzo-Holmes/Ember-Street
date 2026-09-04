import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root = path.resolve(process.argv[2]);
const port = Number(process.argv[3] || 4185);
const legacy = process.argv.includes('--legacy');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const fixture = `
Object.fromEntries = undefined; Array.prototype.flatMap = undefined; Array.prototype.at = undefined;
window.queueMicrotask = undefined;
HTMLDialogElement.prototype.showModal = undefined;
var nativeSupports = CSS.supports.bind(CSS);
CSS.supports = function(p,v) { return /aspect-ratio|env|clamp|min\\(|max\\(|cqw|svh|dvh/.test(p+' '+v) ? false : nativeSupports(p,v); };
var heightDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
Object.defineProperty(Element.prototype,'scrollHeight',{configurable:true,get:function(){
  if(this.style && this.style.visibility === 'hidden' && this.style.rowGap === '1px') return 0;
  return heightDescriptor.get.call(this);
}});
`;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'");
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  if (legacy && url.pathname === '/preview/legacy-test.js') { res.setHeader('Content-Type', types['.js']); res.end(fixture); return; }
  const relative = decodeURIComponent(url.pathname.replace(/^\/preview\//, '')) || 'index.html';
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
  const extension = path.extname(file);
  res.setHeader('Content-Type', types[extension] || 'application/octet-stream');
  let content = fs.readFileSync(file);
  if (legacy && extension === '.html') content = content.toString().replace('<script defer', '<script src="./legacy-test.js"></script><script defer');
  if (legacy && extension === '.css') {
    const ast = postcss.parse(content.toString());
    ast.walkAtRules('supports', (rule) => { if (/\b(?:min|max|clamp)\(|aspect-ratio/.test(rule.params)) rule.remove(); });
    ast.walkDecls((declaration) => {
      if (/\b(?:min|max|clamp|env)\(|\d(?:cqw|svh|dvh|lvh)\b/.test(declaration.value) || /^(aspect-ratio|gap|row-gap|column-gap|container-type)$/.test(declaration.prop)) declaration.remove();
    });
    content = ast.toString();
  }
  res.end(content);
}).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}/preview/index.html (${legacy ? 'missing modern features simulation' : 'strict offline-container CSP'})`));
