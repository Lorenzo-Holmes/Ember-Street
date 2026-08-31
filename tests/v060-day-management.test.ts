import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/engine';
import { assignDayJob, canTakeDayAssignment, lockDayAssignments } from '../src/game/v060/dayManagement';
import { previewMeal } from '../src/game/v060/food';
import type { GameState, Survivor } from '../src/game/types';

const FIVE: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 70, mood: 'steady', perk: '搜索', condition: 'healthy' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 70, mood: 'steady', perk: '维修', condition: 'healthy' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 70, mood: 'steady', perk: '炊事', condition: 'healthy' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 70, mood: 'steady', perk: '医疗', condition: 'healthy' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 70, mood: 'steady', perk: '守备', condition: 'healthy' },
];

function fivePersonState(): GameState {
  const state = createInitialState(606001);
  return {
    ...state,
    phase: 'street',
    survivors: FIVE,
    buildings: { searchStation: 1, workshop: 1, clinic: 1, watchPost: 1, shelter: 1, radio: 1 },
    inventory: { ration: 20, medicine: 3, power: 60, materials: 4, parts: 3 },
    supplies: 20,
    dayAssignments: {},
    assignments: {},
    dayState: { assignmentsLocked: false, returnedExpeditions: 0, unresolvedExpeditions: [] },
  };
}

describe('v0.6 daytime management', () => {
  it('gives one ordinary cook insufficient coverage for five residents', () => {
    const state = { ...fivePersonState(), dayAssignments: { 'lin-xia': 'cook' as const } };
    const meal = previewMeal(state);
    expect(meal.cookingCapacity).toBeCloseTo(2.5);
    expect(meal.coverage).toBeCloseTo(0.5);
    expect(meal.quality).toBe('struggling');
    expect(meal.energyRecovery).toBe(8);
    expect(meal.hopeDelta).toBe(-1);
  });

  it('lets two ordinary cooks feed five residents to full coverage', () => {
    const state = { ...fivePersonState(), dayAssignments: { 'lin-xia': 'cook' as const, zhou: 'cook' as const } };
    const meal = previewMeal(state);
    expect(meal.cookingCapacity).toBeCloseTo(5);
    expect(meal.coverage).toBeCloseTo(1);
    expect(meal.quality).toBe('full');
    expect(meal.energyRecovery).toBe(15);
    expect(meal.hopeDelta).toBe(1);
  });

  it('makes Ahe alone clearly better than an ordinary cook for five residents', () => {
    const state = { ...fivePersonState(), dayAssignments: { ahe: 'cook' as const } };
    const meal = previewMeal(state);
    expect(meal.cookingCapacity).toBeCloseTo(3.5);
    expect(meal.coverage).toBeCloseTo(0.7);
    expect(meal.quality).toBe('hot');
    expect(meal.energyRecovery).toBe(11);
    expect(meal.hopeDelta).toBe(0);
  });

  it('uses the shelter kitchen level to release labor later in the campaign', () => {
    const base = fivePersonState();
    const levelThree = {
      ...base,
      buildings: { ...base.buildings, shelter: 3 },
      dayAssignments: { ahe: 'cook' as const },
    };
    const meal = previewMeal(levelThree);
    expect(meal.cookingCapacity).toBeCloseTo(5.25);
    expect(meal.quality).toBe('full');
  });

  it('locks daytime jobs and refuses to dispatch dead or seriously injured survivors', () => {
    let state = fivePersonState();
    state = assignDayJob(state, 'lin-xia', 'expedition');
    expect(state.dayAssignments['lin-xia']).toBe('expedition');
    state = lockDayAssignments(state);
    const afterLock = assignDayJob(state, 'lin-xia', 'rest');
    expect(afterLock.dayAssignments['lin-xia']).toBe('expedition');

    const deadState = {
      ...fivePersonState(),
      survivors: FIVE.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'dead' as const } : survivor),
    };
    expect(canTakeDayAssignment(deadState, 'lin-xia', 'expedition').allowed).toBe(false);

    const seriousState = {
      ...fivePersonState(),
      survivors: FIVE.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'serious' as const } : survivor),
    };
    expect(canTakeDayAssignment(seriousState, 'lin-xia', 'expedition').allowed).toBe(false);
  });
});
