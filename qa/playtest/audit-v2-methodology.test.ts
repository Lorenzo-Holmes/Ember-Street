import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS, effectiveFinalHordeChoice } from '../../src/game/v060/finalHorde';
import { nightCheckContext } from '../../src/game/v060/nightScheduler';
import type { NightChoice, NightEffect } from '../../src/game/v060/nightEvents';
import { V2_AUDIT_POLICIES, runAuditGameV2, type AuditV2RunResult } from '../../src/game/v060/playtestAuditV2';
import { SURVIVOR_ROSTER } from '../../src/game/progression';
import type { GameState } from '../../src/game/types';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const won = (run: AuditV2RunResult) => run.finalHordeResult === 'held' || run.finalHordeResult === 'perfect';

function summarize(runs: AuditV2RunResult[]) {
  const visits: Record<string, number> = {};
  for (const run of runs) for (const [id, count] of Object.entries(run.locationVisits)) visits[id] = (visits[id] ?? 0) + count;
  const totalVisits = Object.values(visits).reduce((a, b) => a + b, 0);
  return {
    runs: runs.length,
    completionRate: runs.filter((run) => run.completed).length / Math.max(1, runs.length),
    successRate: runs.filter(won).length / Math.max(1, runs.length),
    averageDeaths: average(runs.map((run) => run.deaths)),
    averageRescued: average(runs.map((run) => run.rescued)),
    averagePeakResidents: average(runs.map((run) => run.peakResidents)),
    averageHotMealDays: average(runs.map((run) => run.hotMealDays)),
    averageFirstShortageDay: average(runs.map((run) => run.firstShortageDay ?? 30)),
    routeKnownRate: runs.filter((run) => run.routeKnown).length / Math.max(1, runs.length),
    locationVisitShare: Object.fromEntries(Object.entries(visits).map(([id, count]) => [id, totalVisits ? count / totalVisits : 0])),
  };
}

function effectScore(effect?: NightEffect): number {
  if (!effect) return 0;
  const injury: Record<string, number> = { fatigued: -2, minor: -5, serious: -14, critical: -25, dead: -50, missing: -35 };
  return (effect.hope ?? 0) * 1.8
    + (effect.defense ?? 0) * 1.25
    + (effect.power ?? 0) * 0.18
    + (effect.inventory?.ration ?? 0) * 1.1
    + (effect.inventory?.medicine ?? 0) * 2.2
    + (effect.inventory?.materials ?? 0) * 0.75
    + (effect.inventory?.parts ?? 0) * 1.05
    + (effect.actorCondition ? injury[effect.actorCondition] ?? 0 : 0);
}

function costScore(choice: NightChoice): number {
  const cost = choice.cost;
  if (!cost) return 0;
  return (cost.ration ?? 0) * 1.2 + (cost.medicine ?? 0) * 2.5 + (cost.materials ?? 0) * 0.85 + (cost.parts ?? 0) * 1.15 + (cost.power ?? 0) * 0.2;
}

function fixedDay29State(seed: number): GameState {
  const base = createV060InitialState(seed);
  const survivors = SURVIVOR_ROSTER.slice(0, 6).map((survivor) => ({ ...survivor, energy: 80, trust: 3, condition: 'healthy' as const }));
  return {
    ...base,
    day: 29,
    phase: 'night',
    survivors,
    civilianResidents: 8,
    communityState: { pendingResidents: 0, activeResidents: 8, supportMode: 'defense', lastSupportDay: 29 },
    buildings: { searchStation: 3, workshop: 3, clinic: 3, watchPost: 3, shelter: 3, radio: 3 },
    inventory: { ration: 30, medicine: 12, power: 70, materials: 24, parts: 14 },
    hope: 62,
    defense: 66,
    dayAssignments: { 'lin-xia': 'expedition', zhou: 'repair', ahe: 'cook', cheng: 'medical', aliang: 'watch', xiaoman: 'radio' },
    socialState: { ...base.socialState, principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'], pressure: 1, fulfilledPromises: 2, brokenPromises: 0 },
    storyFlags: [...new Set([...base.storyFlags, 'community_rotation_unlocked', 'subway_exit_known', 'evacuation_route_known', 'final_horde_supplies', 'medical_cache', 'generator_backup', 'working_vehicle_parts'])],
  };
}

function outcomeFor(total: number, a: number, b: number) {
  if (a === 1 && b === 1) return 'failure' as const;
  if (a === 6 && b === 6) return 'critical' as const;
  if (total <= 6) return 'failure' as const;
  if (total <= 9) return 'partial' as const;
  if (total <= 11) return 'success' as const;
  return 'critical' as const;
}

function checkExpectedValue(state: GameState, choice: NightChoice): number {
  const context = nightCheckContext(state, choice);
  const modifier = context.modifiers.reduce((sum, item) => sum + item.value, 0);
  let total = 0;
  let cases = 0;
  const diceCount = context.mode === 'normal' ? 2 : 3;
  for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) for (let c = 1; c <= (diceCount === 3 ? 6 : 1); c += 1) {
    const dice = diceCount === 3 ? [a, b, c] : [a, b];
    const ordered = [...dice].sort((x, y) => x - y);
    const kept = context.mode === 'advantage' ? ordered.slice(-2) : context.mode === 'disadvantage' ? ordered.slice(0, 2) : ordered;
    const outcome = outcomeFor(kept[0] + kept[1] + modifier, kept[0], kept[1]);
    total += effectScore(choice.outcomes?.[outcome]);
    cases += 1;
  }
  return cases ? total / cases : 0;
}

function day29ExpectedValues(state: GameState) {
  return FINAL_HORDE_EVENTS.map((event) => ({
    eventId: event.id,
    choices: event.choices.map((rawChoice) => {
      const choice = effectiveFinalHordeChoice(state, rawChoice);
      const expectedValue = choice.check ? checkExpectedValue(state, choice) : effectScore(choice.direct) - costScore(choice);
      return { choiceId: choice.id, strategy: choice.strategy, expectedValue };
    }).sort((a, b) => b.expectedValue - a.expectedValue),
  }));
}

describe('playtest audit v2 methodology', () => {
  auditIt('writes corrected policy, controlled resident and fixed DAY29 outputs', () => {
    const baselineRuns = Number(process.env.PLAYTEST_V2_RUNS ?? 80);
    const controlledRuns = Number(process.env.PLAYTEST_CONTROLLED_RUNS ?? 40);
    let seed = 940001;

    const baseline: Record<string, ReturnType<typeof summarize>> = {};
    for (const policy of V2_AUDIT_POLICIES) {
      const runs = Array.from({ length: baselineRuns }, () => runAuditGameV2(seed++, policy));
      expect(runs.every((run) => run.completed)).toBe(true);
      baseline[policy.id] = summarize(runs);
    }

    const residentExperiment: Record<string, Record<string, ReturnType<typeof summarize>>> = {};
    for (const residentCount of [0, 5, 8, 10]) {
      residentExperiment[String(residentCount)] = {};
      for (const policyId of ['balanced-v2', 'rescue-v2']) {
        const policy = V2_AUDIT_POLICIES.find((item) => item.id === policyId)!;
        const runs = Array.from({ length: controlledRuns }, () => runAuditGameV2(seed++, policy, { residentInjection: { day: 14, count: residentCount } }));
        expect(runs.every((run) => run.completed)).toBe(true);
        residentExperiment[String(residentCount)][policyId] = summarize(runs);
      }
    }

    const day29 = day29ExpectedValues(fixedDay29State(949999));
    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/audit-v2-methodology.json', `${JSON.stringify({ baselineRuns, controlledRuns, baseline, residentExperiment, day29 }, null, 2)}\n`);

    const lines = ['# Ember Street v0.6 Audit V2', '', '## Corrected baseline', ''];
    for (const [id, row] of Object.entries(baseline)) lines.push(`- ${id}: success ${(row.successRate * 100).toFixed(1)}% · hot meals ${row.averageHotMealDays.toFixed(1)}/29 · first shortage ${row.averageFirstShortageDay.toFixed(1)} · route known ${(row.routeKnownRate * 100).toFixed(1)}%`);
    lines.push('', '## Controlled residents (DAY14 injection)', '');
    for (const [count, byPolicy] of Object.entries(residentExperiment)) for (const [id, row] of Object.entries(byPolicy)) lines.push(`- residents ${count} / ${id}: success ${(row.successRate * 100).toFixed(1)}% · deaths ${row.averageDeaths.toFixed(2)} · hot meals ${row.averageHotMealDays.toFixed(1)}`);
    lines.push('', '## DAY29 fixed-state expected value', '');
    for (const stage of day29) lines.push(`- ${stage.eventId}: ${stage.choices.map((choice) => `${choice.choiceId}=${choice.expectedValue.toFixed(2)}`).join(' · ')}`);
    writeFileSync('qa/playtest/out/audit-v2-methodology.md', `${lines.join('\n')}\n`);
  }, 120_000);
});
