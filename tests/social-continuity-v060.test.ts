import { describe, expect, it } from 'vitest';
import { upgradeBuilding } from '../src/game/v060/buildings';
import {
  advanceCampaignDay,
  createV060InitialState,
  finalizeDay,
  searchForMissing,
  upgradeSaveToV060,
} from '../src/game/v060/campaign';
import {
  acceptCommunityRequest,
  declineCommunityRequest,
  evaluatePromiseProgress,
  pendingCommunityRequest,
  settlePromiseDeadline,
} from '../src/game/v060/communityPromises';
import { assignDayJob } from '../src/game/v060/dayManagement';
import { recordDeath } from '../src/game/v060/memorial';
import { loseCommunityResidents } from '../src/game/v060/mortality';
import type { GameState } from '../src/game/types';
import { nightEventWeight } from '../src/game/v060/causalNight';
import { adjustPressure, applyMealPressure, pressureBand, socialStateOf } from '../src/game/v060/socialPressure';
import type { V060NightEvent as NightEvent } from '../src/game/v060/nightEvents';

function withDay(state: GameState, day: number): GameState {
  return { ...state, day, phase: 'street' };
}

describe('v0.6 social pressure', () => {
  it('normalizes old saves without a social state', () => {
    const old = createV060InitialState(701001);
    delete old.socialState;
    const upgraded = upgradeSaveToV060(old);
    expect(socialStateOf(upgraded)).toMatchObject({ pressure: 0, fulfilledPromises: 0, brokenPromises: 0, activePromise: null });
  });

  it('keeps pressure separate from hope and exposes four bands', () => {
    const base = createV060InitialState(701002);
    const stressed = adjustPressure({ ...base, hope: 72 }, 5, 'test');
    expect(stressed.hope).toBe(72);
    expect(socialStateOf(stressed).pressure).toBe(5);
    expect(pressureBand(stressed)).toBe('near-breaking');
    expect(pressureBand(adjustPressure(stressed, 1, 'test'))).toBe('breaking');
  });

  it('raises pressure for poor meals and lowers it for full meals', () => {
    const base = createV060InitialState(701003);
    const poor = applyMealPressure({ ...base, mealState: { ...base.mealState, quality: 'cold' } });
    expect(socialStateOf(poor).pressure).toBe(1);
    const recovered = applyMealPressure({ ...poor, mealState: { ...poor.mealState, quality: 'full' } });
    expect(socialStateOf(recovered).pressure).toBe(0);
  });

  it('raises pressure after a core death and resident casualties', () => {
    const base = { ...createV060InitialState(701004), civilianResidents: 3, communityState: { pendingResidents: 0, activeResidents: 3, supportMode: null } };
    const dead = recordDeath(base, 'lin-xia', '测试');
    expect(socialStateOf(dead).pressure).toBe(2);
    const residents = loseCommunityResidents(dead, 1, '坍塌');
    expect(socialStateOf(residents).pressure).toBe(3);
  });

  it('makes social crisis events more likely at breaking pressure', () => {
    const base = withDay(createV060InitialState(701005), 12);
    const event: NightEvent = {
      id: 'argument-rations', category: 'survivor', minDay: 1, maxDay: 29,
      title: '争执', body: 'test', choices: [],
    };
    const calm = nightEventWeight(base, event);
    const breaking = nightEventWeight(adjustPressure(base, 6, 'test'), event);
    expect(breaking).toBeGreaterThan(calm);
  });
});

describe('v0.6 community promises', () => {
  it('offers a hot-meal request after repeated shortages and lets the player refuse it', () => {
    const base = withDay(createV060InitialState(702001), 5);
    const state = { ...base, mealState: { ...base.mealState, quality: 'cold' as const, consecutiveShortageDays: 2 } };
    const request = pendingCommunityRequest(state);
    expect(request?.kind).toBe('hot-meal');
    const refused = declineCommunityRequest(state, request!.id);
    expect(refused.hope).toBe(state.hope - 1);
    expect(socialStateOf(refused).pressure).toBe(1);
    expect(socialStateOf(refused).activePromise).toBeNull();
  });

  it('fulfills a hot-meal promise only after actual meal resolution', () => {
    let state = withDay(createV060InitialState(702002), 5);
    state = { ...state, mealState: { ...state.mealState, quality: 'cold', consecutiveShortageDays: 2 } };
    const request = pendingCommunityRequest(state)!;
    state = acceptCommunityRequest(state, request.id);
    state = assignDayJob(state, 'ahe', 'cook');
    const hopeBefore = state.hope;
    const resolved = finalizeDay(state);
    expect(socialStateOf(resolved).activePromise).toBeNull();
    expect(socialStateOf(resolved).fulfilledPromises).toBe(1);
    expect(resolved.hope).toBeGreaterThanOrEqual(hopeBefore + 2);
    expect(resolved.dawnBrief?.some((entry) => entry.includes('承诺') && entry.includes('已兑现'))).toBe(true);
  });

  it('counts a missing-person promise as fulfilled when a search is attempted, regardless of the roll', () => {
    let state = withDay(createV060InitialState(702003), 8);
    state = {
      ...state,
      survivors: state.survivors.map((survivor) => survivor.id === 'ahe' ? { ...survivor, condition: 'missing' as const } : survivor),
      campaignStats: { ...state.campaignStats, missing: 1 },
    };
    const request = pendingCommunityRequest(state)!;
    expect(request.kind).toBe('search-missing');
    state = acceptCommunityRequest(state, request.id);
    const searched = searchForMissing(state, 'ahe', 'team');
    expect(socialStateOf(searched).activePromise).toBeNull();
    expect(socialStateOf(searched).fulfilledPromises).toBe(1);
  });

  it('fulfills a medical promise by assigning medical work, not by guaranteeing a cure', () => {
    let state = withDay(createV060InitialState(702004), 8);
    state = {
      ...state,
      survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'serious' as const } : survivor),
    };
    const request = pendingCommunityRequest(state)!;
    expect(request.kind).toBe('medical-care');
    state = acceptCommunityRequest(state, request.id);
    state = assignDayJob(state, 'zhou', 'medical');
    const resolved = finalizeDay(state);
    expect(socialStateOf(resolved).activePromise).toBeNull();
    expect(socialStateOf(resolved).fulfilledPromises).toBe(1);
  });

  it('fulfills defense and shelter promises when the target state is reached', () => {
    let defenseState = withDay(createV060InitialState(702005), 9);
    defenseState = { ...defenseState, defense: 40 };
    const defenseRequest = pendingCommunityRequest(defenseState)!;
    expect(defenseRequest.kind).toBe('restore-defense');
    defenseState = acceptCommunityRequest(defenseState, defenseRequest.id);
    defenseState = evaluatePromiseProgress({ ...defenseState, defense: 60 });
    expect(socialStateOf(defenseState).fulfilledPromises).toBe(1);

    let shelterState = withDay(createV060InitialState(702006), 9);
    shelterState = {
      ...shelterState,
      civilianResidents: 4,
      communityState: { pendingResidents: 0, activeResidents: 4, supportMode: null },
      inventory: { ...shelterState.inventory, materials: 30, parts: 30 },
    };
    const shelterRequest = pendingCommunityRequest(shelterState)!;
    expect(shelterRequest.kind).toBe('shelter');
    shelterState = acceptCommunityRequest(shelterState, shelterRequest.id);
    shelterState = upgradeBuilding(shelterState, 'shelter');
    expect(shelterState.buildings.shelter).toBe(2);
    expect(socialStateOf(shelterState).fulfilledPromises).toBe(1);
  });

  it('breaks an unfulfilled promise only when its deadline day has ended', () => {
    let state = withDay(createV060InitialState(702007), 5);
    state = { ...state, mealState: { ...state.mealState, quality: 'cold', consecutiveShortageDays: 2 } };
    const request = pendingCommunityRequest(state)!;
    state = acceptCommunityRequest(state, request.id);
    const promise = socialStateOf(state).activePromise!;
    const beforeDeadline = settlePromiseDeadline({ ...state, day: promise.deadlineDay - 1 });
    expect(socialStateOf(beforeDeadline).activePromise).not.toBeNull();
    const hopeBefore = state.hope;
    const broken = settlePromiseDeadline({ ...state, day: promise.deadlineDay });
    expect(socialStateOf(broken).activePromise).toBeNull();
    expect(socialStateOf(broken).brokenPromises).toBe(1);
    expect(broken.hope).toBe(hopeBefore - 3);
    expect(socialStateOf(broken).pressure).toBe(2);
  });

  it('settles an expired promise before starting the next campaign day', () => {
    let state = withDay(createV060InitialState(702008), 5);
    state = { ...state, mealState: { ...state.mealState, quality: 'cold', consecutiveShortageDays: 2 } };
    state = acceptCommunityRequest(state, pendingCommunityRequest(state)!.id);
    const deadline = socialStateOf(state).activePromise!.deadlineDay;
    const advanced = advanceCampaignDay({ ...state, day: deadline });
    expect(advanced.day).toBe(deadline + 1);
    expect(socialStateOf(advanced).brokenPromises).toBe(1);
  });
});
