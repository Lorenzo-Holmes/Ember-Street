import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { assignDayJob, canTakeDayAssignment, lockDayAssignments, previewDispatchConfirmation, previewNightPreparation, reopenDayAssignments } from '../src/game/v060/dayManagement';
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
  const state = createV060InitialState(606001);
  return { ...state, phase: 'street', survivors: FIVE, civilianResidents: 0, buildings: { searchStation: 1, workshop: 1, clinic: 1, watchPost: 1, shelter: 1, radio: 1 }, inventory: { ration: 20, medicine: 3, power: 60, materials: 4, parts: 3 }, dayAssignments: {}, dayState: { assignmentsLocked: false, returnedExpeditions: 0, unresolvedExpeditions: [], committedSurvivorIds: [] } };
}

describe('v0.6 daytime management', () => {
  it('gives one ordinary cook insufficient coverage for five residents', () => {
    const meal = previewMeal({ ...fivePersonState(), dayAssignments: { 'lin-xia': 'cook' } });
    expect(meal.cookingCapacity).toBeCloseTo(2.5); expect(meal.coverage).toBeCloseTo(0.5); expect(meal.quality).toBe('struggling'); expect(meal.energyRecovery).toBe(8); expect(meal.hopeDelta).toBe(-1);
  });
  it('lets two ordinary cooks feed five residents to full coverage', () => {
    const meal = previewMeal({ ...fivePersonState(), dayAssignments: { 'lin-xia': 'cook', zhou: 'cook' } });
    expect(meal.cookingCapacity).toBeCloseTo(5); expect(meal.coverage).toBeCloseTo(1); expect(meal.quality).toBe('full'); expect(meal.energyRecovery).toBe(15); expect(meal.hopeDelta).toBe(1);
  });
  it('makes Ahe alone clearly better than an ordinary cook for five residents', () => {
    const meal = previewMeal({ ...fivePersonState(), dayAssignments: { ahe: 'cook' } });
    expect(meal.cookingCapacity).toBeCloseTo(3.5); expect(meal.coverage).toBeCloseTo(0.7); expect(meal.quality).toBe('hot');
  });
  it('uses the shelter kitchen level to release labor later in the campaign', () => {
    const base = fivePersonState(); const meal = previewMeal({ ...base, buildings: { ...base.buildings, shelter: 3 }, dayAssignments: { ahe: 'cook' } });
    expect(meal.cookingCapacity).toBeCloseTo(5.25); expect(meal.quality).toBe('full');
  });
  it('makes rescued civilians increase cooking pressure', () => {
    const base = fivePersonState(); const meal = previewMeal({ ...base, civilianResidents: 3, dayAssignments: { ahe: 'cook' } });
    expect(meal.residentCount).toBe(8); expect(meal.coverage).toBeCloseTo(3.5 / 8); expect(meal.quality).toBe('struggling');
  });
  it('previews community defense and medical support instead of falsely reporting nobody is helping', () => {
    const base = fivePersonState();
    const state: GameState = {
      ...base,
      civilianResidents: 6,
      buildings: { ...base.buildings, clinic: 2, watchPost: 1 },
      storyFlags: [...base.storyFlags, 'community_rotation_unlocked'],
      communityState: { activeResidents: 6, pendingResidents: 0, supportMode: 'defense', lastSupportDay: base.day },
    };
    const prep = previewNightPreparation(state);
    expect(prep.defense).toBe('一般');
    expect(prep.defenseSource).toBe('居民轮值');
    expect(prep.medical).toBe('居民协助');
    expect(prep.repair).toBe('无人');
  });
  it('previews focused community repair, while core staff still take precedence', () => {
    const base = fivePersonState();
    const residents: GameState = {
      ...base,
      civilianResidents: 6,
      communityState: { activeResidents: 6, pendingResidents: 0, supportMode: 'repair', lastSupportDay: base.day },
    };
    expect(previewNightPreparation(residents).repair).toBe('居民协助');
    const staffed = { ...residents, dayAssignments: { zhou: 'repair' as const, aliang: 'watch' as const } };
    const prep = previewNightPreparation(staffed);
    expect(prep.repair).toBe('有人值守');
    expect(prep.defenseSource).toBe('核心值守');
  });
  it('previews every final dispatch and marks unassigned survivors as automatic rest before locking', () => {
    const state = { ...fivePersonState(), dayAssignments: { 'lin-xia': 'expedition' as const, ahe: 'cook' as const } };
    const preview = previewDispatchConfirmation(state);
    expect(preview.manuallyAssigned).toBe(2);
    expect(preview.autoResting).toBe(3);
    expect(preview.expeditionCount).toBe(1);
    expect(preview.entries.find((entry) => entry.survivorId === 'lin-xia')?.label).toBe('探索');
    expect(preview.entries.find((entry) => entry.survivorId === 'zhou')?.label).toBe('休息 · 自动安排');
    expect(state.dayState.assignmentsLocked).toBe(false);
  });
  it('keeps critical and already committed survivors out of automatic rest in the confirmation preview', () => {
    const base = fivePersonState();
    const state: GameState = {
      ...base,
      survivors: FIVE.map((survivor) => survivor.id === 'cheng' ? { ...survivor, condition: 'critical' as const } : survivor),
      dayState: { ...base.dayState, committedSurvivorIds: ['lin-xia'] },
      dayAssignments: { 'lin-xia': 'expedition' },
    };
    const preview = previewDispatchConfirmation(state);
    expect(preview.committed).toBe(1);
    expect(preview.autoResting).toBe(3);
    expect(preview.entries.find((entry) => entry.survivorId === 'lin-xia')?.label).toBe('探索 · 已执行');
    expect(preview.entries.find((entry) => entry.survivorId === 'cheng')?.label).toBe('危重 · 不可派遣');
  });
  it('locks daytime jobs and refuses dead, serious, or committed survivors', () => {
    let state = assignDayJob(fivePersonState(), 'lin-xia', 'expedition'); state = lockDayAssignments(state);
    expect(assignDayJob(state, 'lin-xia', 'rest').dayAssignments['lin-xia']).toBe('expedition');
    const dead = { ...fivePersonState(), survivors: FIVE.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'dead' as const } : s) };
    expect(canTakeDayAssignment(dead, 'lin-xia', 'expedition').allowed).toBe(false);
    const serious = { ...fivePersonState(), survivors: FIVE.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'serious' as const } : s) };
    expect(canTakeDayAssignment(serious, 'lin-xia', 'expedition').allowed).toBe(false);
    const committed = { ...fivePersonState(), dayState: { ...fivePersonState().dayState, committedSurvivorIds: ['lin-xia'] } };
    expect(canTakeDayAssignment(committed, 'lin-xia', 'rest').allowed).toBe(false);
  });
  it('allows returning from dusk to adjust jobs before anybody executes an action', () => {
    let state = assignDayJob(fivePersonState(), 'zhou', 'watch');
    state = { ...lockDayAssignments(state), phase: 'dusk' };
    const reopened = reopenDayAssignments(state);
    expect(reopened.phase).toBe('street');
    expect(reopened.dayState.assignmentsLocked).toBe(false);
    expect(canTakeDayAssignment(reopened, 'zhou', 'repair').allowed).toBe(true);
  });
  it('refuses to reopen dispatch after an expedition has completed', () => {
    const base = fivePersonState();
    const state: GameState = {
      ...base,
      phase: 'dusk',
      dayAssignments: { 'lin-xia': 'expedition', zhou: 'watch', ahe: 'cook', cheng: 'rest', aliang: 'rest' },
      dayState: { ...base.dayState, assignmentsLocked: true, returnedExpeditions: 1, committedSurvivorIds: ['lin-xia'] },
    };
    const attemptedReopen = reopenDayAssignments(state);
    expect(attemptedReopen.phase).toBe('dusk');
    expect(attemptedReopen.dayState.assignmentsLocked).toBe(true);
    expect(canTakeDayAssignment(attemptedReopen, 'lin-xia', 'rest').allowed).toBe(false);
    expect(canTakeDayAssignment(attemptedReopen, 'zhou', 'repair').allowed).toBe(false);
  });
});
