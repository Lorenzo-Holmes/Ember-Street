import { describe, expect, it } from 'vitest';
import type { CheckOutcome, GameState } from '../src/game/types';
import { createV060InitialState } from '../src/game/v060/campaign';
import { resolveExpeditionOutcome, retreatExpedition, startExpedition } from '../src/game/v060/expedition';
import { locationLootVisitCount, locationMemory } from '../src/game/v060/locationMemory';

function prepareTrip(state: GameState, day: number): GameState {
  return {
    ...state,
    day,
    phase: 'street',
    dayAssignments: { 'lin-xia': 'expedition' },
    dayState: {
      ...state.dayState,
      assignmentsLocked: true,
      returnedExpeditions: 0,
      unresolvedExpeditions: [],
      committedSurvivorIds: [],
      expeditionRoutes: { 'lin-xia': 'convenience-store' },
      expeditionQueue: [],
    },
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
  };
}

function resolveTrip(state: GameState, day: number, outcome: CheckOutcome): { state: GameState; rationGain: number } {
  const prepared = prepareTrip(state, day);
  const beforeRation = prepared.inventory.ration;
  const started = startExpedition(prepared, ['lin-xia'], 'convenience-store');
  const resolved = resolveExpeditionOutcome(started, outcome);
  return { state: resolved, rationGain: resolved.inventory.ration - beforeRation };
}

describe('v0.6 location soft depletion', () => {
  it('marks a location depleted after three loot-bearing returns', () => {
    let state = createV060InitialState(990601);
    state = resolveTrip(state, 1, 'success').state;
    expect(locationLootVisitCount(state, 'convenience-store')).toBe(1);
    expect(locationMemory(state, 'convenience-store').depleted).toBe(false);

    state = resolveTrip(state, 2, 'partial').state;
    expect(locationLootVisitCount(state, 'convenience-store')).toBe(2);
    expect(locationMemory(state, 'convenience-store').depleted).toBe(false);

    state = resolveTrip(state, 3, 'critical').state;
    expect(locationLootVisitCount(state, 'convenience-store')).toBe(3);
    expect(locationMemory(state, 'convenience-store').depleted).toBe(true);
    expect(state.storyFlags).toContain('depleted:convenience-store');
  });

  it('keeps the first three successful scavenges at the original yield, then reduces later base loot', () => {
    let state = createV060InitialState(990602);
    const first = resolveTrip(state, 1, 'success');
    state = first.state;
    const second = resolveTrip(state, 2, 'success');
    state = second.state;
    const third = resolveTrip(state, 3, 'success');
    state = third.state;
    const fourth = resolveTrip(state, 4, 'success');

    expect(first.rationGain).toBe(second.rationGain);
    expect(second.rationGain).toBe(third.rationGain);
    expect(fourth.rationGain).toBeGreaterThan(0);
    expect(fourth.rationGain).toBeLessThan(first.rationGain);
  });

  it('does not consume location stock on failed expeditions', () => {
    const state = createV060InitialState(990603);
    const failed = resolveTrip(state, 1, 'failure').state;
    expect(locationLootVisitCount(failed, 'convenience-store')).toBe(0);
    expect(locationMemory(failed, 'convenience-store').depleted).toBe(false);
  });

  it('does not consume location stock when the party retreats empty-handed', () => {
    const prepared = prepareTrip(createV060InitialState(990604), 1);
    const started = startExpedition(prepared, ['lin-xia'], 'convenience-store');
    const retreated = retreatExpedition(started);
    expect(locationLootVisitCount(retreated, 'convenience-store')).toBe(0);
  });

  it('does not reinterpret legacy visited flags as previous loot depletion', () => {
    const base = createV060InitialState(990605);
    const state = { ...base, storyFlags: [...base.storyFlags, 'visited:convenience-store'] };
    expect(locationLootVisitCount(state, 'convenience-store')).toBe(0);
    expect(locationMemory(state, 'convenience-store').depleted).toBe(false);
  });
});
