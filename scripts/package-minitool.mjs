import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { auditMinitool } from './audit-minitool.mjs';

const root = process.cwd();
const artifact = path.resolve(process.argv[2] || '');
const releaseRoot = path.resolve(root, 'output', 'releases') + path.sep;
if (!artifact.startsWith(releaseRoot) || path.basename(artifact) !== 'app') throw new Error('Pass the app directory printed by build:minitool');
const report = auditMinitool(artifact);
if (!report.passed) throw new Error(report.errors.join('\n'));
const skill = path.join(root, '.codex', 'minitool-zip-builder', 'scripts', 'audit_artifact.py');
if (!fs.existsSync(skill)) throw new Error('Extract the requested minitool-zip-builder skill into .codex first');
const python = process.env.MINITOOL_PYTHON || 'python';
execFileSync(python, [skill, artifact], { stdio: 'inherit' });
const archive = path.join(path.dirname(artifact), 'ember-street-xhs.zip');
if (fs.existsSync(archive)) throw new Error('ZIP already exists; refusing to overwrite a delivered artifact');
execFileSync(python, ['-m', 'zipfile', '-c', archive, ...fs.readdirSync(artifact)], { cwd: artifact, stdio: 'inherit' });
execFileSync(python, [skill, archive], { stdio: 'inherit' });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const finalReport = { ...report, archive, archiveBytes: fs.statSync(archive).size, sha256,
  skillVersion: '1.6.0', skillArchiveSha256: '29c04115fd89d7eab7b81775f4287ae20c569ad3794d25d8404dc0ec3ec3b65e',
  deviceVerification: 'Actual Xiaohongshu simulator, Android 8.1/Chrome 61 and iOS devices: not tested' };
fs.writeFileSync(path.join(path.dirname(artifact), 'validation.json'), JSON.stringify(finalReport, null, 2));
fs.writeFileSync(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
console.log(JSON.stringify(finalReport, null, 2));
