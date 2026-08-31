import { describe, expect, it } from 'vitest';
import { CHAPTER_FINAL_DAY } from '../src/game/config';
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
    pendingCheck: null,
    activeNightIncidentId: null,
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

describe('thirty-day chapter end-to-end state flow', () => {
  it('can progress from NIGHT 1 through the DAY 30 ending without a state dead-end', () => {
    let state = createInitialState(20260831);

    state = finishNight(state);
    expect(state.phase).toBe('summary');
    state = revealStreet(state);
    expect(state.day).toBe(1);
    expect(state.phase).toBe('street');

    state = { ...state, parts: 999, supplies: 999, medicine: 999, defense: 100, power: 100 };
    state = repairBuilding(state, 'searchStation');
    expect(state.searchStationRepaired).toBe(true);

    for (let day = 1; day < CHAPTER_FINAL_DAY; day += 1) {
      expect(state.day).toBe(day);
      expect(state.phase).toBe('street');

      state = { ...state, parts: 999, supplies: 999, medicine: 999, defense: 100, power: 100, pendingCheck: null };
      state = resolveDayEvent(state);
      expect(state.activeEventId).toBeNull();

      state = enterDusk(state);
      expect(state.dayStep).toBe('dusk');

      state = startNextNight(state);
      expect(state.phase).toBe('night');
      expect(state.day).toBe(day + 1);
      expect(state.chapterComplete).toBe(false);

      if (day + 1 < CHAPTER_FINAL_DAY) {
        state = finishNight(state);
        expect(state.phase).toBe('summary');
        expect(state.chapterComplete).toBe(false);
        state = revealStreet(state);
        expect(state.phase).toBe('street');
      }
    }

    expect(state.day).toBe(CHAPTER_FINAL_DAY);
    expect(state.phase).toBe('night');
    state = finishNight(state);
    expect(state.phase).toBe('summary');
    expect(state.chapterComplete).toBe(true);

    state = revealStreet(state);
    expect(state.phase).toBe('street');
    expect(state.day).toBe(CHAPTER_FINAL_DAY);
    expect(state.chapterComplete).toBe(true);
    expect(state.firstLightLevel).toBe(7);
    expect(state.logs?.some((entry) => entry.day === CHAPTER_FINAL_DAY)).toBe(true);
  });
});
