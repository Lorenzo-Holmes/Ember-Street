import { describe, expect, it } from 'vitest';
import { createInitialState, revealStreet, takeRack, tick } from '../src/game/engine';
import { choiceAvailability, enterDusk, resolveNarrativeChoice, survivalSnapshot } from '../src/game/narrative';

function dayOneStreet() {
  let state = createInitialState(404);
  state = takeRack(state, 0);
  state = takeRack(state, 1);
  state = takeRack(state, 2);
  return revealStreet(tick(state, 80_000));
}

describe('survival narrative loop', () => {
  it('opens the day with a log and one meaningful event', () => {
    const state = dayOneStreet();
    expect(state.phase).toBe('street');
    expect(state.dayStep).toBe('event');
    expect(state.activeEventId).toBe('day-1-broken-lamp');
    expect(state.logs?.length).toBeGreaterThanOrEqual(2);
    expect(state.parts).toBeGreaterThanOrEqual(7);
  });

  it('cannot enter dusk until the active event is resolved', () => {
    const state = dayOneStreet();
    expect(enterDusk(state).dayStep).toBe('event');
    const resolved = resolveNarrativeChoice(state, 'repair');
    expect(resolved.activeEventId).toBeNull();
    expect(enterDusk(resolved).dayStep).toBe('dusk');
  });

  it('records event consequences in the street log', () => {
    const state = dayOneStreet();
    const resolved = resolveNarrativeChoice(state, 'salvage');
    expect(resolved.resolvedEventIds).toContain('day-1-broken-lamp');
    expect(resolved.logs?.some((entry) => entry.title.includes('旧路灯'))).toBe(true);
  });

  it('prevents choices the street cannot afford', () => {
    const state = { ...dayOneStreet(), parts: 0 };
    const availability = choiceAvailability(state, 'day-1-broken-lamp', 'repair');
    expect(availability.available).toBe(false);
    expect(resolveNarrativeChoice(state, 'repair')).toEqual(state);
  });

  it('turns raw resources into readable survival conditions', () => {
    const state = { ...dayOneStreet(), supplies: 0, medicine: 0, defense: 82, power: 28 };
    const snapshot = survivalSnapshot(state);
    expect(snapshot.ration).toBe('短缺');
    expect(snapshot.medicine).toBe('短缺');
    expect(snapshot.defense).toBe('稳固');
    expect(snapshot.power).toBe('吃紧');
  });
});
