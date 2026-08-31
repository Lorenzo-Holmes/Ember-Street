import { describe, expect, it } from 'vitest';
import { createInitialState, repairSearchStation, revealStreet, takeRack, tick } from '../src/game/engine';

describe('First Light game core', () => {
  it('is deterministic for the same seed', () => {
    const a = createInitialState(42);
    const b = createInitialState(42);
    expect(a.racks).toEqual(b.racks);
    expect(a.queue).toEqual(b.queue);
    expect(a.rngState).toBe(b.rngState);
  });

  it('merges three starting rations and serves the first order', () => {
    let state = createInitialState(42);
    state = takeRack(state, 0);
    state = takeRack(state, 1);
    state = takeRack(state, 2);
    expect(state.stats.merges).toBe(1);
    expect(state.stats.served).toBe(1);
    expect(state.hope).toBeGreaterThan(8);
  });

  it('ends the night when time runs out', () => {
    expect(tick(createInitialState(42), 80_000).phase).toBe('summary');
  });

  it('reveals street and repairs search station when enough parts exist', () => {
    const summary = { ...createInitialState(42), phase: 'summary' as const, parts: 7 };
    const repaired = repairSearchStation(revealStreet(summary));
    expect(repaired.searchStationRepaired).toBe(true);
    expect(repaired.survivorJoined).toBe(true);
    expect(repaired.firstLightLevel).toBe(2);
    expect(repaired.parts).toBe(1);
  });
});
