import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURVIVOR_ROSTER } from '../../src/game/progression';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS, effectiveFinalHordeChoice } from '../../src/game/v060/finalHorde';
import { canAffordNightChoice, nightCheckContext } from '../../src/game/v060/nightScheduler';
import type { NightChoice, NightEffect } from '../../src/game/v060/nightEvents';
import type { GameState } from '../../src/game/types';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;

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
  return (cost.ration ?? 0) * 1.2
    + (cost.medicine ?? 0) * 2.5
    + (cost.materials ?? 0) * 0.85
    + (cost.parts ?? 0) * 1.15
    + (cost.power ?? 0) * 0.2;
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
  const diceCount = context.mode === 'normal' ? 2 : 3;
  let total = 0;
  let cases = 0;
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

function preparedState(seed = 991001): GameState {
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
    storyFlags: [...new Set([...base.storyFlags, 'community_rotation_unlocked', 'subway_exit_known', 'evacuation_route_known', 'subway_maintenance_map', 'final_horde_supplies', 'medical_cache', 'generator_backup', 'working_vehicle_parts'])],
  };
}

const LEGACY_FLAGS = ['subway_exit_known', 'evacuation_route_known', 'subway_maintenance_map', 'final_horde_supplies', 'medical_cache', 'generator_backup', 'working_vehicle_parts'];

function withoutLegacy(state: GameState): GameState {
  return {
    ...state,
    storyFlags: state.storyFlags.filter((flag) => !LEGACY_FLAGS.includes(flag)),
    socialState: { ...state.socialState, principles: [], fulfilledPromises: 0, brokenPromises: 1 },
  };
}

function scenarioStates(): Array<{ id: string; state: GameState }> {
  const prepared = preparedState();
  const battered = {
    ...prepared,
    hope: 24,
    defense: 38,
    survivors: prepared.survivors.map((survivor, index) => ({
      ...survivor,
      energy: 24 + index * 3,
      condition: (index < 2 ? 'serious' : 'minor') as 'serious' | 'minor',
    })),
  };
  return [
    { id: 'prepared', state: prepared },
    { id: 'battered-roster', state: battered },
    { id: 'battered-no-legacy', state: withoutLegacy(battered) },
    { id: 'low-stock-no-legacy', state: { ...withoutLegacy(prepared), inventory: { ration: 4, medicine: 1, power: 18, materials: 3, parts: 1 } } },
  ];
}

function stageRows(state: GameState) {
  return FINAL_HORDE_EVENTS.map((event) => ({
    eventId: event.id,
    choices: event.choices.map((raw) => {
      const choice = effectiveFinalHordeChoice(state, raw);
      return {
        choiceId: choice.id,
        strategy: choice.strategy,
        affordable: canAffordNightChoice(state, raw),
        expectedValue: choice.check ? checkExpectedValue(state, choice) : effectScore(choice.direct) - costScore(choice),
      };
    }).sort((a, b) => b.expectedValue - a.expectedValue),
  }));
}

function spendChoiceCost(state: GameState, raw: NightChoice): { state: GameState; affordable: boolean; cost: NonNullable<NightChoice['cost']> } {
  const choice = effectiveFinalHordeChoice(state, raw);
  const cost = choice.cost ?? {};
  const affordable = canAffordNightChoice(state, raw);
  if (!affordable) return { state, affordable, cost };
  return {
    affordable,
    cost,
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        ration: Math.max(0, state.inventory.ration - (cost.ration ?? 0)),
        medicine: Math.max(0, state.inventory.medicine - (cost.medicine ?? 0)),
        materials: Math.max(0, state.inventory.materials - (cost.materials ?? 0)),
        parts: Math.max(0, state.inventory.parts - (cost.parts ?? 0)),
        power: Math.max(0, state.inventory.power - (cost.power ?? 0)),
      },
    },
  };
}

function sequentialResourcePath(input: GameState) {
  let state = input;
  return FINAL_HORDE_EVENTS.map((event) => {
    const raw = event.choices.find((choice) => choice.strategy === 'resource')!;
    const before = { ...state.inventory };
    const spent = spendChoiceCost(state, raw);
    state = spent.state;
    return {
      eventId: event.id,
      choiceId: raw.id,
      affordable: spent.affordable,
      cost: spent.cost,
      before,
      after: { ...state.inventory },
    };
  });
}

describe('DAY29 stress scenarios', () => {
  auditIt('writes battered-roster and sequential-stock evidence', () => {
    const scenarios = scenarioStates().map(({ id, state }) => ({
      id,
      stages: stageRows(state),
      resourcePath: sequentialResourcePath(state),
    }));

    const prepared = scenarios.find((scenario) => scenario.id === 'prepared')!;
    const lowStock = scenarios.find((scenario) => scenario.id === 'low-stock-no-legacy')!;
    expect(prepared.resourcePath.every((stage) => stage.affordable)).toBe(true);
    expect(lowStock.resourcePath.some((stage) => !stage.affordable)).toBe(true);

    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/day29-stress-scenarios.json', `${JSON.stringify({ scenarios }, null, 2)}\n`);
    const lines = ['# DAY29 stress scenarios', ''];
    for (const scenario of scenarios) {
      lines.push(`## ${scenario.id}`, '');
      for (const stage of scenario.stages) {
        lines.push(`- ${stage.eventId}: ${stage.choices.map((choice) => `${choice.choiceId}=${choice.expectedValue.toFixed(2)}${choice.affordable ? '' : ' [unaffordable]'}`).join(' · ')}`);
      }
      lines.push('', 'Sequential resource path:');
      for (const step of scenario.resourcePath) {
        lines.push(`- ${step.eventId}: ${step.choiceId} · ${step.affordable ? 'affordable' : 'UNAFFORDABLE'} · before M${step.before.materials}/P${step.before.parts}/Med${step.before.medicine}/R${step.before.ration}/E${step.before.power} → after M${step.after.materials}/P${step.after.parts}/Med${step.after.medicine}/R${step.after.ration}/E${step.after.power}`);
      }
      lines.push('');
    }
    writeFileSync('qa/playtest/out/day29-stress-scenarios.md', `${lines.join('\n')}\n`);
  }, 120_000);
});