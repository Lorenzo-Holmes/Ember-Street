import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const cacheRoot = path.join(root, '.audio-source-cache', 'mixkit-v2');
const outRoot = path.join(root, 'public', 'assets', 'audio', 'sfx');
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Ember-Street-audio-import/2.0';

const SOURCES = [
  {
    runtime: 'sfx_door_knock.mp3',
    category: 'doors',
    title: 'Knocking on a thick wooden door',
    maxSeconds: 1.4,
    bitrate: '56k',
    filters: ['highpass=f=80', 'lowpass=f=6500'],
  },
  {
    runtime: 'sfx_dogs.mp3',
    category: 'dog',
    title: 'Medium size angry dog bark',
    maxSeconds: 2.1,
    bitrate: '56k',
    filters: ['highpass=f=120', 'lowpass=f=6200'],
  },
  {
    runtime: 'sfx_infected_vocal.mp3',
    category: 'monster',
    title: 'Zombie monster growl',
    maxSeconds: 1.8,
    bitrate: '56k',
    filters: ['highpass=f=90', 'lowpass=f=4200'],
  },
  {
    runtime: 'sfx_page_turn.mp3',
    category: 'paper',
    title: 'Page turn single',
    maxSeconds: 0.72,
    bitrate: '48k',
    filters: ['highpass=f=180', 'lowpass=f=7200'],
  },
  {
    runtime: 'sfx_pen_circle.mp3',
    category: 'write',
    title: 'Writing scribble on paper',
    maxSeconds: 0.7,
    bitrate: '48k',
    filters: ['highpass=f=220', 'lowpass=f=6800'],
  },
  {
    runtime: 'sfx_expedition_loot.mp3',
    category: 'misc',
    title: 'Metal tools browsing',
    maxSeconds: 0.9,
    bitrate: '48k',
    filters: ['highpass=f=120', 'lowpass=f=6200'],
  },
];

function fail(message) {
  console.error(`Audio import failed: ${message}`);
  process.exit(1);
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': userAgent } });
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function resolveItemId(html, title) {
  const titleIndex = html.indexOf(title);
  if (titleIndex < 0) fail(`could not find Mixkit title: ${title}`);
  const prefix = html.slice(Math.max(0, titleIndex - 2400), titleIndex);
  const ids = [...prefix.matchAll(/data-audio-player-item-id-value="(\d+)"/g)].map((match) => match[1]);
  if (!ids.length) fail(`could not resolve Mixkit item id for: ${title}`);
  return ids.at(-1);
}

function resolveDownloadUrl(html, title) {
  const match = html.match(/data-download--modal-url-value="([^"]+)"/);
  if (!match) fail(`could not resolve Mixkit WAV URL for: ${title}`);
  return match[1].replaceAll('&amp;', '&');
}

function runFfmpeg(input, output, source) {
  const fade = [
    `atrim=start=0:end=${source.maxSeconds}`,
    'afade=t=in:st=0:d=0.015',
    'areverse',
    'afade=t=in:st=0:d=0.055',
    'areverse',
    'loudnorm=I=-20:TP=-2:LRA=7',
  ];
  const filters = [...source.filters, ...fade].join(',');
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input,
    '-af', filters,
    '-ac', '1', '-ar', '32000', '-b:a', source.bitrate,
    '-map_metadata', '-1',
    output,
  ], { stdio: 'inherit' });
  if (result.status !== 0) fail(`ffmpeg failed for ${source.runtime}`);
}

fs.mkdirSync(cacheRoot, { recursive: true });
fs.mkdirSync(outRoot, { recursive: true });

const report = [];
for (const source of SOURCES) {
  const pageUrl = `https://mixkit.co/free-sound-effects/${source.category}/`;
  const pageHtml = await fetchText(pageUrl);
  const itemId = resolveItemId(pageHtml, source.title);
  const modalUrl = `https://mixkit.co/free-sound-effects/download/${itemId}/?context=item+grid`;
  const modalHtml = await fetchText(modalUrl);
  const sourceUrl = resolveDownloadUrl(modalHtml, source.title);
  const wav = await fetchBytes(sourceUrl);
  const rawPath = path.join(cacheRoot, `${itemId}.wav`);
  const runtimePath = path.join(outRoot, source.runtime);
  fs.writeFileSync(rawPath, wav);
  runFfmpeg(rawPath, runtimePath, source);
  const runtimeBytes = fs.readFileSync(runtimePath);
  report.push({
    runtime: source.runtime,
    title: source.title,
    category: source.category,
    itemId,
    pageUrl,
    sourceUrl,
    bytes: runtimeBytes.length,
    sha256: createHash('sha256').update(runtimeBytes).digest('hex'),
  });
}

const reportPath = path.join(cacheRoot, 'import-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify({ importedAt: new Date().toISOString(), sources: report }, null, 2)}\n`);
console.log(`Imported ${report.length} selected Mixkit SFX into ${path.relative(root, outRoot)}.`);
for (const item of report) {
  console.log(`  ${item.runtime} <- ${item.title} (#${item.itemId}) · ${(item.bytes / 1024).toFixed(1)} KiB · ${item.sha256.slice(0, 12)}`);
}
console.log(`Source report: ${path.relative(root, reportPath)}`);
