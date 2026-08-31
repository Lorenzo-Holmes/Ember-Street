import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { nightCausalSignals, nightEventWeight } from '../src/game/v060/causalNight';
import { advanceUntreatedRisk, loseCommunityResidents, medicalCrisisFlag } from '../src/game/v060/mortality';
import { appendDawnBrief } from '../src/game/v060/morningBrief';
import { NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';
import { chooseNightOption } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

const event = (id: string) => NORMAL_NIGHT_EVENTS.find((item) => item.id === id)!;

function nightWithMedicalCrisis(condition: 'serious' | 'critical'): GameState {
  const base = createV060InitialState(707001);
  const state: GameState = {
    ...base,
    day: 12,
    phase: 'night',
    survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition, untreatedDays: condition === 'critical' ? 1 : 2 } : survivor),
    storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
    nightState: {
      ...base.nightState,
      scheduledEventIds: [],
      emergencyEventIds: ['mortality-medical:lin-xia'],
      currentEventId: 'mortality-medical:lin-xia',
      eventTotal: 0,
    },
  };
  return state;
}

function withCommunityRotation(mode: 'repair' | 'defense'): GameState {
  const base = createV060InitialState(707008);
  return {
    ...base,
    day: 8,
    civilianResidents: 6,
    storyFlags: [...base.storyFlags, 'community_rotation_unlocked'],
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: mode, lastSupportDay: 8 },
  };
}

describe('v0.6 causal density', () => {
  it('makes threat events more likely when nobody is assigned to watch', () => {
    const base = { ...createV060InitialState(707002), day: 8 };
    const unwatched = nightEventWeight(base, event('gate-knocking'));
    const watched = nightEventWeight({ ...base, dayAssignments: { 'lin-xia': 'watch' } }, event('gate-knocking'));
    expect(unwatched).toBeGreaterThan(watched);
    expect(nightCausalSignals(base).some((value) => value.includes('无人守备'))).toBe(true);
  });

  it('lets defense-focused residents partially cover an unstaffed watch shift', () => {
    const base = { ...createV060InitialState(707009), day: 8 };
    const unsupported = nightEventWeight(base, event('gate-knocking'));
    const community = withCommunityRotation('defense');
    const residentCovered = nightEventWeight(community, event('gate-knocking'));
    const coreWatch = nightEventWeight({ ...community, dayAssignments: { 'lin-xia': 'watch' } }, event('gate-knocking'));
    expect(unsupported).toBeGreaterThan(residentCovered);
    expect(residentCovered).toBeGreaterThan(coreWatch);
    const signals = nightCausalSignals(community);
    expect(signals.some((value) => value.includes('居民正在守备轮值'))).toBe(true);
    expect(signals.some((value) => value.includes('无人守备'))).toBe(false);
  });

  it('lets repair-focused residents partially cover infrastructure risk without replacing a specialist', () => {
    const base = { ...createV060InitialState(707010), day: 8 };
    const unsupported = nightEventWeight(base, event('generator-drop'));
    const community = withCommunityRotation('repair');
    const residentCovered = nightEventWeight(community, event('generator-drop'));
    const coreRepair = nightEventWeight({ ...community, dayAssignments: { zhou: 'repair' } }, event('generator-drop'));
    expect(unsupported).toBeGreaterThan(residentCovered);
    expect(residentCovered).toBeGreaterThan(coreRepair);
    const signals = nightCausalSignals(community);
    expect(signals.some((value) => value.includes('居民正在维修轮值'))).toBe(true);
    expect(signals.some((value) => value.includes('无人维修'))).toBe(false);
  });

  it('makes ration conflict more likely after poor meals', () => {
    const initial = createV060InitialState(707003);
    const base = { ...initial, day: 8, mealState: { ...initial.mealState, quality: 'hot' as const, consecutiveShortageDays: 0 } };
    const normal = nightEventWeight(base, event('argument-rations'));
    const hungry = nightEventWeight({ ...base, mealState: { ...base.mealState, quality: 'struggling', consecutiveShortageDays: 2 } }, event('argument-rations'));
    expect(hungry).toBeGreaterThan(normal);
  });

  it('shows dusk food causality from tonight preview instead of yesterday meal state', () => {
    const initial = createV060InitialState(707007);
    const yesterdayHungry: GameState = {
      ...initial,
      phase: 'dusk',
      inventory: { ...initial.inventory, ration: 12 },
      mealState: { ...initial.mealState, quality: 'struggling', consecutiveShortageDays: 2 },
      dayAssignments: { 'lin-xia': 'cook', zhou: 'cook', ahe: 'cook' },
    };
    expect(nightCausalSignals(yesterdayHungry).some((value) => value.includes('供餐不足'))).toBe(false);

    const tonightHungry: GameState = {
      ...initial,
      phase: 'dusk',
      mealState: { ...initial.mealState, quality: 'well-fed', consecutiveShortageDays: 0 },
      dayAssignments: { 'lin-xia': 'watch', zhou: 'repair', ahe: 'rest' },
    };
    expect(nightCausalSignals(tonightHungry).some((value) => value.includes('今晚供餐不足'))).toBe(true);
  });

  it('queues a medical crisis before untreated serious injuries can become fatal', () => {
    let state = createV060InitialState(707004);
    state = { ...state, day: 8, survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'serious' as const, untreatedDays: 1 } : survivor) };
    state = advanceUntreatedRisk(state);
    expect(state.storyFlags).toContain(medicalCrisisFlag('lin-xia'));
    expect(state.survivors.find((survivor) => survivor.id === 'lin-xia')?.condition).toBe('serious');
  });

  it('gives a serious survivor one escalation step before isolation can kill them', () => {
    const serious = chooseNightOption(nightWithMedicalCrisis('serious'), 'mortality-isolate');
    expect(serious.survivors.find((survivor) => survivor.id === 'lin-xia')?.condition).toBe('critical');
    expect(serious.campaignStats.deaths).toBe(0);

    const critical = chooseNightOption(nightWithMedicalCrisis('critical'), 'mortality-isolate');
    expect(critical.survivors.find((survivor) => survivor.id === 'lin-xia')?.condition).toBe('dead');
    expect(critical.storyFlags).toContain('turned:lin-xia');
  });

  it('reduces both resident population and community labor on a civilian-loss incident', () => {
    const base = createV060InitialState(707005);
    const state: GameState = {
      ...base,
      civilianResidents: 6,
      communityState: { pendingResidents: 1, activeResidents: 5, supportMode: 'defense', lastSupportDay: base.day },
    };
    const next = loseCommunityResidents(state, 2, '建筑坍塌');
    expect(next.civilianResidents).toBe(4);
    expect(next.communityState.pendingResidents + next.communityState.activeResidents).toBe(4);
    expect(next.lastMessage).toContain('倒下来的墙');
  });

  it('records only real night deltas in the dawn brief', () => {
    const before = createV060InitialState(707006);
    const after: GameState = {
      ...before,
      hope: before.hope - 2,
      defense: before.defense - 5,
      inventory: { ...before.inventory, power: before.inventory.power - 7 },
      survivors: before.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'minor' as const } : survivor),
    };
    const next = appendDawnBrief(before, after, '围栏外有人敲门');
    expect(next.dawnBrief).toHaveLength(1);
    expect(next.dawnBrief?.[0]).toContain('希望 -2');
    expect(next.dawnBrief?.[0]).toContain('防线 -5');
    expect(next.dawnBrief?.[0]).toContain('林夏：健康→轻伤');
    expect(appendDawnBrief(next, next, '没有变化').dawnBrief).toEqual(next.dawnBrief);
  });
});
