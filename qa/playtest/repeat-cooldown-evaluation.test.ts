import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { V2_AUDIT_POLICIES, runAuditGameV2, type AuditV2RunResult } from '../../src/game/v060/playtestAuditV2';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
};

function normalEventCounts(run: AuditV2RunResult) {
  return Object.fromEntries(Object.entries(run.eventCounts).filter(([id]) => !id.startsWith('final-horde-') && !id.startsWith('horde-') && !id.startsWith('emergency-') && !id.startsWith('mortality-')));
}

describe('cross-night cooldown diversity evaluation', () => {
  auditIt('runs 600+ corrected-policy games and writes repeat metrics', () => {
    const runsPerPolicy = Number(process.env.PLAYTEST_REPEAT_RUNS ?? 150);
    let seed = 970001;
    const allRuns: AuditV2RunResult[] = [];
    const eventTotals: Record<string, number> = {};
    const perEventRunCounts: Record<string, number[]> = {};
    const maxRepeatPerRun: number[] = [];

    for (const policy of V2_AUDIT_POLICIES) {
      for (let index = 0; index < runsPerPolicy; index += 1) {
        const run = runAuditGameV2(seed++, policy);
        expect(run.completed).toBe(true);
        allRuns.push(run);
        const counts = normalEventCounts(run);
        const maxRepeat = Math.max(0, ...Object.values(counts));
        maxRepeatPerRun.push(maxRepeat);
        for (const [id, count] of Object.entries(counts)) {
          eventTotals[id] = (eventTotals[id] ?? 0) + count;
          (perEventRunCounts[id] ??= []).push(count);
        }
      }
    }

    const totalRuns = allRuns.length;
    const eventRows = Object.entries(eventTotals).map(([eventId, occurrences]) => {
      const observed = perEventRunCounts[eventId] ?? [];
      const padded = [...observed, ...Array(Math.max(0, totalRuns - observed.length)).fill(0)];
      return {
        eventId,
        occurrences,
        averagePerRun: occurrences / Math.max(1, totalRuns),
        p90PerRun: percentile(padded, 0.9),
        maxPerRun: Math.max(0, ...padded),
      };
    }).sort((a, b) => b.averagePerRun - a.averagePerRun);

    const highAverage = eventRows.filter((row) => row.averagePerRun > 3);
    const result = {
      runsPerPolicy,
      totalRuns,
      maxRepeatPerRun: {
        average: maxRepeatPerRun.reduce((a, b) => a + b, 0) / Math.max(1, maxRepeatPerRun.length),
        p90: percentile(maxRepeatPerRun, 0.9),
        max: Math.max(0, ...maxRepeatPerRun),
      },
      topEvents: eventRows.slice(0, 30),
      eventsAboveThreePerRun: highAverage,
      aggregate: {
        averageDeaths: allRuns.reduce((sum, run) => sum + run.deaths, 0) / Math.max(1, totalRuns),
        averageHotMealDays: allRuns.reduce((sum, run) => sum + run.hotMealDays, 0) / Math.max(1, totalRuns),
        successRate: allRuns.filter((run) => run.finalHordeResult === 'held' || run.finalHordeResult === 'perfect').length / Math.max(1, totalRuns),
      },
    };

    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/repeat-cooldown-evaluation.json', `${JSON.stringify(result, null, 2)}\n`);
    const lines = [
      '# Cross-night cooldown evaluation',
      '',
      `Runs: ${totalRuns}`,
      `Max normal-event repeats/run: avg ${result.maxRepeatPerRun.average.toFixed(2)} · P90 ${result.maxRepeatPerRun.p90} · max ${result.maxRepeatPerRun.max}`,
      `Average deaths: ${result.aggregate.averageDeaths.toFixed(2)}`,
      `Average hot-meal days: ${result.aggregate.averageHotMealDays.toFixed(2)}`,
      `Hold+Perfect: ${(result.aggregate.successRate * 100).toFixed(1)}%`,
      '',
      '## Most repeated normal events',
      '',
      ...result.topEvents.slice(0, 20).map((row) => `- ${row.eventId}: ${row.averagePerRun.toFixed(2)}/run · P90 ${row.p90PerRun} · max ${row.maxPerRun}`),
    ];
    writeFileSync('qa/playtest/out/repeat-cooldown-evaluation.md', `${lines.join('\n')}\n`);
    expect(totalRuns).toBe(V2_AUDIT_POLICIES.length * runsPerPolicy);
  }, 120_000);
});
