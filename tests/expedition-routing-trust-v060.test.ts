import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { assignExpeditionRoute, buildExpeditionQueue, incompleteExpeditionSurvivorIds, lockDayAssignmentsAndRoute } from '../src/game/v060/dayManagement';
import { EXPEDITION_LOCATIONS, expeditionPartyLootMultiplier, expeditionRiskScore, resolveExpeditionOutcome, startExpedition } from '../src/game/v060/expedition';
import { effectiveCookingCapacity } from '../src/game/v060/food';
import { energyLabel, trustLabel } from '../src/game/v060/trust';

describe('per-survivor expedition routes', () => {
  it('lists multiple believable resources for every route', () => {
    expect(EXPEDITION_LOCATIONS.every((location) => location.primary !== location.secondary)).toBe(true);
    expect(EXPEDITION_LOCATIONS.find((location) => location.id === 'convenience-store')).toMatchObject({ primary: 'ration', secondary: 'materials' });
    expect(EXPEDITION_LOCATIONS.find((location) => location.id === 'auto-repair')).toMatchObject({ primary: 'parts', secondary: 'materials' });
    expect(EXPEDITION_LOCATIONS.find((location) => location.id === 'school')).toMatchObject({ primary: 'materials', secondary: 'ration' });
    expect(EXPEDITION_LOCATIONS.find((location) => location.id === 'apartment-402')).toMatchObject({ primary: 'ration', secondary: 'materials', tertiary: 'parts' });
  });

  it('actually returns every listed apartment resource after a successful search', () => {
    let state = createV060InitialState(7000);
    state = { ...state, day: 4, storyFlags: [...state.storyFlags, 'location_unlocked:apartment-402'] };
    state = assignExpeditionRoute(state, 'lin-xia', 'apartment-402');
    state = lockDayAssignmentsAndRoute(state);
    const before = { ...state.inventory };
    state = startExpedition(state, ['lin-xia'], 'apartment-402');
    const resolved = resolveExpeditionOutcome(state, 'success');
    expect(resolved.inventory.ration).toBeGreaterThan(before.ration);
    expect(resolved.inventory.materials).toBeGreaterThan(before.materials);
    expect(resolved.inventory.parts).toBeGreaterThan(before.parts);
  });

  it('groups any number of survivors who choose the same location', () => {
    let state = createV060InitialState(7001);
    state = assignExpeditionRoute(state, 'lin-xia', 'convenience-store');
    state = assignExpeditionRoute(state, 'zhou', 'convenience-store');
    state = assignExpeditionRoute(state, 'ahe', 'convenience-store');
    const queue = buildExpeditionQueue(state);
    expect(queue).toHaveLength(1);
    expect(queue[0].partyIds).toEqual(['lin-xia', 'zhou', 'ahe']);
    expect(expeditionPartyLootMultiplier(3)).toBe(1.7);
    expect(expeditionRiskScore(state, queue[0].partyIds, queue[0].locationId)).toBeLessThan(expeditionRiskScore(state, ['lin-xia'], queue[0].locationId));
  });

  it('limits distinct routes by search-station level, not explorer count', () => {
    let state = createV060InitialState(7002);
    state = { ...state, storyFlags: [...state.storyFlags, 'location_unlocked:west-pharmacy', 'location_unlocked:apartment-402'] };
    state = assignExpeditionRoute(state, 'lin-xia', 'convenience-store');
    state = assignExpeditionRoute(state, 'zhou', 'west-pharmacy');
    const rejected = assignExpeditionRoute(state, 'ahe', 'apartment-402');
    expect(rejected.dayAssignments.ahe).toBeUndefined();
    expect(rejected.lastMessage).toContain('最多记清 2 条路');
  });

  it('does not lock the day while an explorer has no route', () => {
    const base = createV060InitialState(7003);
    const state = { ...base, dayAssignments: { 'lin-xia': 'expedition' as const } };
    expect(incompleteExpeditionSurvivorIds(state)).toEqual(['lin-xia']);
    expect(lockDayAssignmentsAndRoute(state).dayState.assignmentsLocked).toBe(false);
  });
});

describe('immersive trust and energy states', () => {
  it('uses qualitative labels across the full negative trust range', () => {
    expect(trustLabel(3)).toBe('肯跟你担最难的事');
    expect(trustLabel(-3)).toBe('几乎不再配合你');
    expect(energyLabel(18)).toBe('快撑不住了');
  });

  it('reduces work output at deep distrust', () => {
    const state = createV060InitialState(7004);
    const cook = state.survivors.find((survivor) => survivor.id === 'ahe')!;
    const distrusting = { ...cook, trust: -3 as const };
    expect(effectiveCookingCapacity(state, distrusting)).toBeCloseTo(effectiveCookingCapacity(state, cook) * 0.5);
  });

  it('drops trust when a player-led expedition directly worsens an injury', () => {
    let state = createV060InitialState(7005);
    state = assignExpeditionRoute(state, 'lin-xia', 'convenience-store');
    state = lockDayAssignmentsAndRoute(state);
    state = startExpedition(state, ['lin-xia'], 'convenience-store');
    const resolved = resolveExpeditionOutcome(state, 'partial');
    expect(resolved.survivors.find((survivor) => survivor.id === 'lin-xia')?.trust).toBe(0);
  });
});
