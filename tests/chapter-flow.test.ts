import { describe, expect, it } from 'vitest';
import { createInitialState, repairBuilding, revealStreet, startNextNight, tick } from '../src/game/engine';
import { choiceAvailability, enterDusk, eventForDay, resolveNarrativeChoice } from '../src/game/narrative';
import type { GameState } from '../src/game/types';

function finishNight(state: GameState): GameState {
  const safe = {
    ...state,
    hordePressure: 0,
    defense: 100,
    power: 100,
    orderIndex: state.nightOrderLimit ?? 5,
    orderActive: false,
  };
  return tick(safe, state.nightRemainingMs + 1);
}

function resolveDayEvent(state: GameState): GameState {
  const event = eventForDay(state.day);
  if (!event || event.id !== state.activeEventId) return state;
  const choice = event.choices.find((candidate) => choiceAvailability(state, event.id, candidate.id).available);
  expect(choice, `DAY ${state.day} should always have at least one affordable narrative choice`).toBeTruthy();
  return resolveNarrativeChoice(state, choice!.id);
}

describe('first chapter end-to-end state flow', () => {
  it('can progress from NIGHT 1 through the DAY 7 chapter ending without a state dead-end', () => {
    let state = createInitialState(20260831);

    // NIGHT 1 -> DAY 1
    state = finishNight(state);
    expect(state.phase).toBe('summary');
    state = revealStreet(state);
    expect(state.day).toBe(1);
    expect(state.phase).toBe('street');

    // Give the flow test enough resources to test state transitions rather than balance.
    state = { ...state, parts: 99, supplies: 99, medicine: 99, defense: 100, power: 100 };
    state = repairBuilding(state, 'searchStation');
    expect(state.searchStationRepaired).toBe(true);

    for (let day = 1; day <= 6; day += 1) {
      expect(state.day).toBe(day);
      expect(state.phase).toBe('street');
      expect(state.dayStep).toBe('event');
      expect(state.activeEventId).toBeTruthy();

      state = { ...state, parts: 99, supplies: 99, medicine: 99, defense: 100, power: 100 };
      state = resolveDayEvent(state);
      expect(state.activeEventId).toBeNull();

      state = enterDusk(state);
      expect(state.dayStep).toBe('dusk');

      state = startNextNight(state);
      expect(state.phase).toBe('night');
      expect(state.day).toBe(day + 1);

      if (day < 6) {
        state = finishNight(state);
        expect(state.phase).toBe('summary');
        state = revealStreet(state);
      }
    }

    // DAY 7 is the chapter climax: survive the night and return to the lit street.
    expect(state.day).toBe(7);
    expect(state.phase).toBe('night');
    state = finishNight(state);
    expect(state.phase).toBe('summary');
    expect(state.chapterComplete).toBe(true);

    state = revealStreet(state);
    expect(state.phase).toBe('street');
    expect(state.day).toBe(7);
    expect(state.chapterComplete).toBe(true);
    expect(state.firstLightLevel).toBe(7);
    expect(state.logs?.some((entry) => entry.day === 7)).toBe(true);
  });
});
