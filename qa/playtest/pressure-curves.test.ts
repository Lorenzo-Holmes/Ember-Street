import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIT_POLICIES, runAuditGame, type AuditRunResult } from '../../src/game/v060/playtestAudit';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const STAGES = ['gate', 'grid', 'clinic', 'community', 'route', 'last'] as const;

function stageOf(choiceId: string): typeof STAGES[number] | null {
  if (choiceId.startsWith('final-gate-')) return 'gate';
  if (choiceId.startsWith('final-grid-')) return 'grid';
  if (choiceId.startsWith('final-clinic-')) return 'clinic';
  if (choiceId.startsWith('final-community-')) return 'community';
  if (choiceId.startsWith('final-route-')) return 'route';
  if (choiceId.startsWith('final-last-')) return 'last';
  return null;
}

function average(values: number[]): number { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function dailyRows(policyId: string, runs: AuditRunResult[]) {
  const rows = [] as Array<Record<string, number | string>>;
  for (let day = 1; day <= 29; day += 1) {
    const snapshots = runs.map((run) => run.days.find((entry) => entry.day === day)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    if (!snapshots.length) continue;
    rows.push({
      policy: policyId,
      day,
      ration: average(snapshots.map((x) => x.ration)),
      medicine: average(snapshots.map((x) => x.medicine)),
      power: average(snapshots.map((x) => x.power)),
      materials: average(snapshots.map((x) => x.materials)),
      parts: average(snapshots.map((x) => x.parts)),
      hope: average(snapshots.map((x) => x.hope)),
      defense: average(snapshots.map((x) => x.defense)),
      residents: average(snapshots.map((x) => x.residents)),
      corePresent: average(snapshots.map((x) => x.corePresent)),
      severe: average(snapshots.map((x) => x.severe)),
    });
  }
  return rows;
}

function csv(rows: Array<Record<string, number | string>>): string {
  const headers = ['policy', 'day', 'ration', 'medicine', 'power', 'materials', 'parts', 'hope', 'defense', 'residents', 'corePresent', 'severe'];
  return `${headers.join(',')}\n${rows.map((row) => headers.map((key) => typeof row[key] === 'number' ? (row[key] as number).toFixed(3) : row[key]).join(',')).join('\n')}\n`;
}

describe('playtest pressure curves', () => {
  auditIt('writes daily resource curves and DAY29 stage convergence', () => {
    const runsPerPolicy = Number(process.env.PLAYTEST_CURVE_RUNS ?? 120);
    let seed = 890001;
    const allRows: Array<Record<string, number | string>> = [];
    const choiceTotals: Record<string, Record<string, number>> = Object.fromEntries(STAGES.map((stage) => [stage, {}]));
    const byPolicy: Record<string, Record<string, Record<string, number>>> = {};

    for (const policy of DEFAULT_AUDIT_POLICIES) {
      const runs = Array.from({ length: runsPerPolicy }, () => runAuditGame(seed++, policy));
      expect(runs.every((run) => run.completed)).toBe(true);
      allRows.push(...dailyRows(policy.id, runs));
      byPolicy[policy.id] = Object.fromEntries(STAGES.map((stage) => [stage, {}]));
      for (const run of runs) {
        for (const [choiceId, count] of Object.entries(run.finalChoiceCounts)) {
          const stage = stageOf(choiceId); if (!stage) continue;
          choiceTotals[stage][choiceId] = (choiceTotals[stage][choiceId] ?? 0) + count;
          byPolicy[policy.id][stage][choiceId] = (byPolicy[policy.id][stage][choiceId] ?? 0) + count;
        }
      }
    }

    const convergence = Object.fromEntries(STAGES.map((stage) => {
      const counts = choiceTotals[stage];
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const ordered = Object.entries(counts).map(([choiceId, uses]) => ({ choiceId, uses, share: total ? uses / total : 0 })).sort((a, b) => b.share - a.share);
      return [stage, { total, choices: ordered }];
    }));

    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/pressure-curves.csv', csv(allRows));
    writeFileSync('qa/playtest/out/day29-choice-convergence.json', `${JSON.stringify({ runsPerPolicy, convergence, byPolicy }, null, 2)}\n`);
  }, 120_000);
});
