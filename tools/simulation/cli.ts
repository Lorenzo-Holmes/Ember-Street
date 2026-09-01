import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditDay29Choices } from './day29';
import { assertStateInvariants, simulateRun } from './engine';
import type { AuditConfig } from './model';
import { allPolicies } from './policies';
import { AuditAccumulator, buildReportBundle } from './report';

function intArg(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function stringArg(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function configFromArgv(argv: string[]): AuditConfig {
  return {
    runs: intArg(argv, '--runs', 1000),
    day29States: intArg(argv, '--day29', 600),
    seed: intArg(argv, '--seed', 606000),
    outDir: stringArg(argv, '--out', 'reports/playtest'),
    docsDir: stringArg(argv, '--docs', 'docs/playtest'),
  };
}

async function main(): Promise<void> {
  const config = configFromArgv(process.argv.slice(2));
  const policies = allPolicies();
  const accumulator = new AuditAccumulator();
  let completed = 0;
  let seedIndex = 0;

  while (completed < config.runs) {
    const pairedSeed = config.seed + seedIndex;
    for (const policy of policies) {
      if (completed >= config.runs) break;
      const run = simulateRun(pairedSeed, policy);
      assertStateInvariants(run.finalState);
      accumulator.addRun(run);
      completed += 1;
      if (completed % 250 === 0 || completed === config.runs) process.stdout.write(`playtest ${completed}/${config.runs}\n`);
    }
    seedIndex += 1;
  }

  const day29Results = auditDay29Choices(config.seed ^ 0x29a029, config.day29States);
  const bundle = buildReportBundle(config, accumulator, day29Results);
  const outDir = resolve(config.outDir);
  const docsDir = resolve(config.docsDir);
  await mkdir(outDir, { recursive: true });
  await mkdir(docsDir, { recursive: true });

  for (const [name, content] of Object.entries(bundle.files)) {
    const target = name.endsWith('.md') ? resolve(docsDir, name) : resolve(outDir, name);
    await writeFile(target, content, 'utf8');
  }

  await writeFile(resolve(outDir, 'run-config.json'), `${JSON.stringify({ ...config, policyCount: policies.length, pairedSeedCount: seedIndex }, null, 2)}\n`, 'utf8');
  process.stdout.write(`baseline complete: ${config.runs} DAY1-DAY30 runs, ${config.day29States} DAY29 states, ${day29Results.length} DAY29 forks\n`);
  process.stdout.write(`anomalies: P0=${bundle.anomalies.filter((item) => item.priority === 'P0').length} P1=${bundle.anomalies.filter((item) => item.priority === 'P1').length} P2=${bundle.anomalies.filter((item) => item.priority === 'P2').length}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
