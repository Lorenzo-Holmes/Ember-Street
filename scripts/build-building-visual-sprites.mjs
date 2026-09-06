import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceDirArg = process.argv[2];
if (!sourceDirArg) {
  console.error('Usage: npm run build:building-assets -- <approved-source-directory>');
  console.error('Expected files are named by canonical ID (A30..A47) as PNG/JPG/JPEG/WebP.');
  process.exit(1);
}

const pythonScript = fileURLToPath(new URL('./build-building-visual-sprites.py', import.meta.url));
const candidates = [
  ...(process.env.PYTHON ? [{ command: process.env.PYTHON, prefix: [] }] : []),
  { command: 'python3', prefix: [] },
  { command: 'python', prefix: [] },
  { command: 'py', prefix: ['-3'] },
];

let selected = null;
for (const candidate of candidates) {
  const probe = spawnSync(candidate.command, [...candidate.prefix, '-c', 'from PIL import Image, ImageOps'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  if (!probe.error && probe.status === 0) {
    selected = candidate;
    break;
  }
}

if (!selected) {
  console.error('Building sprite production requires Python with Pillow installed.');
  console.error('Install Pillow for the Python interpreter used by this repository, then retry.');
  process.exit(1);
}

const result = spawnSync(
  selected.command,
  [...selected.prefix, pythonScript, sourceDirArg],
  { cwd: process.cwd(), stdio: 'inherit' },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
