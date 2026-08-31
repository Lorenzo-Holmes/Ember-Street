import { describe, expect, it } from 'vitest';
import { rollPendingCheck } from '../src/game/dice';
import { createV060InitialState } from '../src/game/v060/campaign';
import { ALL_V060_NIGHT_EVENTS, nightEventById } from '../src/game/v060/nightEvents';
import { acceptNightCheckResult, chooseNightOption, currentNightEvent, nextNightEventId, scheduleNight } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function stateFor(day: number, seed = 123456): GameState {
  const base = createV060InitialState(seed);
  return { ...base, day, phase: 'dusk', defense: 72, inventory: { ration: 20, medicine: 12, power: 90, materials: 20, parts: 20 }, buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 }, storyFlags: ['v060_started'], dayAssignments: {} };
}

describe('v0.6 night scheduler', () => {
  it('keeps every player-facing night event at exactly three choices', () => {
    expect(ALL_V060_NIGHT_EVENTS.length).toBeGreaterThan(20);
    for (const event of ALL_V060_NIGHT_EVENTS) expect(event.choices).toHaveLength(3);
  });
  it('is deterministic for the same state and seed', () => {
    const a = scheduleNight(stateFor(17, 99117)); const b = scheduleNight(stateFor(17, 99117));
    expect(a.nightState.scheduledEventIds).toEqual(b.nightState.scheduledEventIds); expect(a.nightState.emergencyEventIds).toEqual(b.nightState.emergencyEventIds); expect(a.nightState.hordeActive).toBe(b.nightState.hordeActive); expect(a.rngState).toBe(b.rngState);
  });
  it.each([10, 20, 29])('forces a horde on DAY %i', (day) => {
    const state = scheduleNight(stateFor(day, 7000 + day)); expect(state.nightState.hordeActive).toBe(true); expect(state.nightState.eventTotal).toBe(6);
    expect(state.nightState.scheduledEventIds.map((id) => nightEventById(id)).some((event) => event?.category === 'horde')).toBe(true);
  });
  it('gives milestone nights extra emergencies without consuming six main slots', () => {
    const day10 = scheduleNight(stateFor(10, 1010)); expect(day10.nightState.scheduledEventIds).toHaveLength(6); expect(day10.nightState.emergencyEventIds).toHaveLength(1);
    const day29 = scheduleNight(stateFor(29, 2929)); expect(day29.nightState.scheduledEventIds).toHaveLength(6); expect(day29.nightState.emergencyEventIds.length).toBeGreaterThanOrEqual(2); expect(day29.nightState.emergencyEventIds.length).toBeLessThanOrEqual(3);
  });
  it('never creates a playable night on DAY 30', () => {
    const state = scheduleNight(stateFor(30, 3030)); expect(state.phase).toBe('ending'); expect(state.nightState.eventTotal).toBe(0); expect(state.nightState.scheduledEventIds).toEqual([]); expect(state.nightState.currentEventId).toBeNull();
  });
  it('inserts emergency events without consuming main slots', () => {
    let state = scheduleNight(stateFor(10, 5010)); expect(state.nightState.emergencyEventIds).toHaveLength(1);
    for (let i = 0; i < 2; i += 1) { const event = currentNightEvent(state)!; const safe = event.choices.find((choice) => choice.strategy === 'consequence')!; state = chooseNightOption(state, safe.id); }
    expect(nextNightEventId(state)).toBe(state.nightState.emergencyEventIds[0]); expect(currentNightEvent(state)?.category).toBe('emergency'); expect(state.nightState.eventIndex).toBe(2);
  });
  it('resolves a checked option through deterministic 2D6 and cannot reroll by refresh', () => {
    let state = scheduleNight(stateFor(12, 81212)); const event = currentNightEvent(state)!; const checked = event.choices.find((choice) => Boolean(choice.check))!;
    state = chooseNightOption(state, checked.id); expect(state.pendingCheck?.eventId).toBe(event.id); expect(state.pendingCheck?.dice).toBeUndefined();
    state = rollPendingCheck(state); const snapshot = JSON.parse(JSON.stringify(state)) as GameState; expect(snapshot.pendingCheck?.dice?.length).toBeGreaterThanOrEqual(2);
    expect(rollPendingCheck(snapshot).pendingCheck?.dice).toEqual(snapshot.pendingCheck?.dice);
    const rng = snapshot.rngState; state = acceptNightCheckResult(snapshot); expect(state.pendingCheck).toBeNull(); expect(state.nightState.resolutions).toContain(event.id); expect(state.rngState).toBe(rng);
  });
});
