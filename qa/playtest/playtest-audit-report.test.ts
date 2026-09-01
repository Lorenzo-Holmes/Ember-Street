import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runFullAudit } from '../../src/game/v060/playtestAudit';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number | null) => value === null ? '—' : value.toFixed(2);

function markdown(report: ReturnType<typeof runFullAudit>): string {
  const lines: string[] = [
    '# Ember Street v0.6 Playtest Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Runs: ${report.totalRuns}`,
    '',
    '## Policy pressure',
    '',
    '| Policy | Complete | Hold+Perfect | Perfect | Avg deaths | Avg rescued | Peak residents | First shortage |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of report.policies) {
    lines.push(`| ${row.policyId} | ${pct(row.completionRate)} | ${pct(row.successRate)} | ${pct(row.perfectRate)} | ${row.averageDeaths.toFixed(2)} | ${row.averageRescued.toFixed(2)} | ${row.averagePeakResidents.toFixed(2)} | ${num(row.averageFirstShortageDay)} |`);
  }
  lines.push('', '## Principle isolation', '', '| Day | Principle | Hold+Perfect | Perfect | Avg deaths | Avg rescued |', '| ---: | --- | ---: | ---: | ---: | ---: |');
  for (const row of report.principles) lines.push(`| ${row.stage} | ${row.principle} | ${pct(row.successRate)} | ${pct(row.perfectRate)} | ${row.averageDeaths.toFixed(2)} | ${row.averageRescued.toFixed(2)} |`);
  lines.push('', '## Resident bands', '');
  for (const [band, value] of Object.entries(report.diagnostics.residentSuccessBands)) lines.push(`- ${band}: ${value.runs} runs · success ${pct(value.successRate)}`);
  lines.push('', '## DAY29 choice concentration', '');
  for (const item of report.diagnostics.dominantDay29Choices.slice(0, 12)) lines.push(`- ${item.choiceId}: ${item.uses} uses · ${pct(item.share)}`);
  lines.push('', '## Underused locations', '');
  if (!report.diagnostics.underusedLocations.length) lines.push('- none below the 2.5% visit-share threshold');
  for (const item of report.diagnostics.underusedLocations) lines.push(`- ${item.locationId}: ${item.visits} visits · ${pct(item.visitShare)}`);
  lines.push('', '## Repetition flags', '');
  if (!report.diagnostics.highRepeatEvents.length) lines.push('- no night event averages more than 1.25 appearances per run');
  for (const item of report.diagnostics.highRepeatEvents.slice(0, 20)) lines.push(`- ${item.eventId}: ${item.occurrences} occurrences · ${item.averagePerRun.toFixed(2)}/run`);
  lines.push('', '## Automatic warnings', '');
  if (!report.diagnostics.warnings.length) lines.push('- no threshold warnings');
  for (const warning of report.diagnostics.warnings) lines.push(`- ${warning}`);
  lines.push('', '## Interpretation rule', '', 'This is a policy-model audit, not a human-player win-rate estimate. Use it to find dominant choices, dead locations, cliffs, and repetition; confirm balance changes with human playtests before shipping.');
  return `${lines.join('\n')}\n`;
}

describe('playtest audit artifact', () => {
  auditIt('runs the full audit matrix and writes JSON + Markdown', () => {
    const policyRuns = Number(process.env.PLAYTEST_POLICY_RUNS ?? 200);
    const principleRuns = Number(process.env.PLAYTEST_PRINCIPLE_RUNS ?? 80);
    const report = runFullAudit({ policyRuns, principleRuns, seedBase: 860901 });
    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/playtest-audit.json', `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync('qa/playtest/out/playtest-audit.md', markdown(report));
    expect(report.totalRuns).toBe(3 * policyRuns + 9 * principleRuns);
    expect(report.policies.every((row) => row.completionRate >= 0.95)).toBe(true);
  }, 120_000);
});
