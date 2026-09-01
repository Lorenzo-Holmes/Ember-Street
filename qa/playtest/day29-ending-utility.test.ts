import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURVIVOR_ROSTER } from '../../src/game/progression';
import { createV060InitialState, finalHordeResultFor } from '../../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS, effectiveFinalHordeChoice } from '../../src/game/v060/finalHorde';
import { canAffordNightChoice, nightCheckContext } from '../../src/game/v060/nightScheduler';
import type { NightChoice, NightEffect } from '../../src/game/v060/nightEvents';
import type { CheckOutcome, FinalHordeResult, GameState, SurvivorCondition } from '../../src/game/types';

const enabled = process.env.WRITE_PLAYTEST_AUDIT === '1';
const auditIt = enabled ? it : it.skip;
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const GRADE_UTILITY: Record<FinalHordeResult, number> = { breached: 0, damaged: 1, held: 2, perfect: 3 };

function outcomeFor(total: number, a: number, b: number): CheckOutcome {
  if (a === 1 && b === 1) return 'failure';
  if (a === 6 && b === 6) return 'critical';
  if (total <= 6) return 'failure';
  if (total <= 9) return 'partial';
  if (total <= 11) return 'success';
  return 'critical';
}

function applyEffect(state: GameState, effect: NightEffect | undefined, actorId?: string): GameState {
  if (!effect) return state;
  const survivors = actorId && effect.actorCondition
    ? state.survivors.map((survivor) => survivor.id === actorId ? { ...survivor, condition: effect.actorCondition as SurvivorCondition } : survivor)
    : state.survivors;
  return {
    ...state,
    survivors,
    hope: clamp(state.hope + (effect.hope ?? 0)),
    defense: clamp(state.defense + (effect.defense ?? 0)),
    inventory: {
      ...state.inventory,
      power: clamp(state.inventory.power + (effect.power ?? 0)),
      ration: Math.max(0, state.inventory.ration + (effect.inventory?.ration ?? 0)),
      medicine: Math.max(0, state.inventory.medicine + (effect.inventory?.medicine ?? 0)),
      materials: Math.max(0, state.inventory.materials + (effect.inventory?.materials ?? 0)),
      parts: Math.max(0, state.inventory.parts + (effect.inventory?.parts ?? 0)),
    },
    storyFlags: [...new Set([...state.storyFlags, ...(effect.addFlags ?? [])])],
  };
}

function preparedState(seed = 995001): GameState {
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

function scenarios(): Array<{ id: string; state: GameState }> {
  const prepared = preparedState();
  const battered = {
    ...withoutLegacy(prepared),
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
    { id: 'battered-no-legacy', state: battered },
    { id: 'low-stock-no-legacy', state: { ...withoutLegacy(prepared), inventory: { ration: 4, medicine: 1, power: 18, materials: 3, parts: 1 } } },
    { id: 'edge-held-threshold', state: { ...withoutLegacy(prepared), defense: 50, hope: 32, inventory: { ration: 8, medicine: 2, power: 28, materials: 8, parts: 4 } } },
  ];
}

function gradeDistribution(state: GameState, raw: NightChoice) {
  const choice = effectiveFinalHordeChoice(state, raw);
  if (!canAffordNightChoice(state, raw)) return { affordable: false, utility: null, grades: null };

  const counts: Record<FinalHordeResult, number> = { perfect: 0, held: 0, damaged: 0, breached: 0 };
  if (!choice.check) {
    const grade = finalHordeResultFor(applyEffect(state, choice.direct));
    counts[grade] = 1;
    return { affordable: true, utility: GRADE_UTILITY[grade], grades: counts };
  }

  const context = nightCheckContext(state, choice);
  const modifier = context.modifiers.reduce((sum, item) => sum + item.value, 0);
  const diceCount = context.mode === 'normal' ? 2 : 3;
  let cases = 0;
  let utility = 0;
  for (let a = 1; a <= 6; a += 1) for (let b = 1; b <= 6; b += 1) for (let c = 1; c <= (diceCount === 3 ? 6 : 1); c += 1) {
    const dice = diceCount === 3 ? [a, b, c] : [a, b];
    const ordered = [...dice].sort((x, y) => x - y);
    const kept = context.mode === 'advantage' ? ordered.slice(-2) : context.mode === 'disadvantage' ? ordered.slice(0, 2) : ordered;
    const outcome = outcomeFor(kept[0] + kept[1] + modifier, kept[0], kept[1]);
    const grade = finalHordeResultFor(applyEffect(state, choice.outcomes?.[outcome], context.actor?.id));
    counts[grade] += 1;
    utility += GRADE_UTILITY[grade];
    cases += 1;
  }
  return {
    affordable: true,
    utility: utility / Math.max(1, cases),
    grades: Object.fromEntries(Object.entries(counts).map(([grade, count]) => [grade, count / Math.max(1, cases)])) as Record<FinalHordeResult, number>,
  };
}

describe('DAY29 last-line ending utility', () => {
  auditIt('measures grade probabilities instead of only linear stat EV', () => {
    const event = FINAL_HORDE_EVENTS.find((candidate) => candidate.id === 'final-horde-last-line');
    expect(event).toBeDefined();

    const rows = scenarios().map(({ id, state }) => ({
      id,
      before: { defense: state.defense, hope: state.hope, grade: finalHordeResultFor(state) },
      choices: event!.choices.map((choice) => ({ choiceId: choice.id, strategy: choice.strategy, ...gradeDistribution(state, choice) })),
    }));

    const lowStock = rows.find((row) => row.id === 'low-stock-no-legacy')!;
    expect(lowStock.choices.find((choice) => choice.strategy === 'resource')?.affordable).toBe(false);
    expect(rows.every((row) => row.choices.some((choice) => choice.affordable))).toBe(true);

    mkdirSync('qa/playtest/out', { recursive: true });
    writeFileSync('qa/playtest/out/day29-ending-utility.json', `${JSON.stringify({ rows }, null, 2)}\n`);
    const lines = ['# DAY29 last-line ending utility', '', 'Utility: breached=0 · damaged=1 · held=2 · perfect=3', ''];
    for (const row of rows) {
      lines.push(`## ${row.id}`, '', `Before: defense ${row.before.defense} · hope ${row.before.hope} · grade ${row.before.grade}`, '');
      for (const choice of row.choices) {
        if (!choice.affordable || !choice.grades) {
          lines.push(`- ${choice.choiceId}: unavailable`);
          continue;
        }
        lines.push(`- ${choice.choiceId}: utility ${choice.utility!.toFixed(3)} · perfect ${(choice.grades.perfect * 100).toFixed(1)}% · held ${(choice.grades.held * 100).toFixed(1)}% · damaged ${(choice.grades.damaged * 100).toFixed(1)}% · breached ${(choice.grades.breached * 100).toFixed(1)}%`);
      }
      lines.push('');
    }
    writeFileSync('qa/playtest/out/day29-ending-utility.md', `${lines.join('\n')}\n`);
  }, 120_000);
});