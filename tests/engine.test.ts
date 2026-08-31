import { describe, expect, it } from 'vitest';
import { assignSurvivor, createInitialState, repairBuilding, revealStreet, startNextNight, takeRack, tick } from '../src/game/engine';
import { forecastFor } from '../src/game/progression';

function firstDawn() {
  let state = createInitialState(12345);
  state = takeRack(state, 0);
  state = takeRack(state, 1);
  state = takeRack(state, 2);
  expect(state.stats.served).toBe(1);
  return tick(state, 80_000);
}

describe('Ember Street first chapter', () => {
  it('keeps the core board at exactly seven slots', () => {
    expect(createInitialState(1).slots).toHaveLength(7);
  });

  it('starts with a friendly deterministic ration merge', () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    expect(a.racks).toEqual(b.racks);
    let state = takeRack(a, 0);
    state = takeRack(state, 1);
    state = takeRack(state, 2);
    expect(state.stats.merges).toBe(1);
    expect(state.stats.served).toBe(1);
    expect(state.hope).toBeGreaterThan(8);
  });

  it('keeps each rack stable for a three-item batch', () => {
    let state = createInitialState(99);
    const original = state.racks[0];
    expect(state.rackStock?.[0]).toBe(3);
    state = takeRack(state, 0);
    expect(state.racks[0]).toBe(original);
    expect(state.rackStock?.[0]).toBe(2);
    state = takeRack(state, 0);
    expect(state.racks[0]).toBe(original);
    expect(state.rackStock?.[0]).toBe(1);
    state = takeRack(state, 0);
    expect(state.rackStock?.[0]).toBe(3);
  });

  it('gives the first request enough time to read and react', () => {
    const state = createInitialState(7);
    expect(state.currentOrder.maxPatienceMs).toBeGreaterThanOrEqual(30_000);
  });

  it('repairs the search station and recruits Lin Xia', () => {
    let state = revealStreet(firstDawn());
    state = { ...state, parts: 10 };
    state = repairBuilding(state, 'searchStation');
    expect(state.searchStationRepaired).toBe(true);
    expect(state.buildings.searchStation).toBe(1);
    expect(state.survivors.some((item) => item.id === 'lin-xia')).toBe(true);
  });

  it('turns a search assignment into immediate next-night supplies', () => {
    let state = revealStreet(firstDawn());
    state = repairBuilding({ ...state, parts: 10 }, 'searchStation');
    state = assignSurvivor(state, 'lin-xia', 'search');
    const before = state.supplies;
    const night2 = startNextNight(state);
    expect(night2.day).toBe(2);
    expect(night2.supplies).toBeGreaterThan(before);
  });

  it('does not allow buildings before their unlock day', () => {
    let state = revealStreet(firstDawn());
    state = { ...state, parts: 99 };
    const blocked = repairBuilding(state, 'clinic');
    expect(blocked.buildings.clinic).toBe(0);
  });

  it('ramps forecasts into a day-seven horde climax', () => {
    expect(forecastFor(2).intensity).toBeLessThan(forecastFor(7).intensity);
    expect(forecastFor(7).title).toBe('尸潮之夜');
  });
});
