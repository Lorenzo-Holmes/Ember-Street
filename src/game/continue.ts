import { startNextNight } from './engine';
import { enterDusk } from './narrative';
import type { GameState } from './types';

function carryStreetContinuity(previous: GameState, next: GameState): GameState {
  return {
    ...next,
    catStage: previous.catStage ?? 0,
    catFedToday: false,
    logs: previous.logs ?? next.logs,
    resolvedEventIds: previous.resolvedEventIds ?? next.resolvedEventIds,
  };
}

export function continueChapter(state: GameState): GameState {
  if (state.phase !== 'street') return state;
  if (state.day === 7 && !state.chapterComplete) {
    const retryBase = enterDusk({ ...state, day: 6, activeEventId: null, dayStep: 'morning', catFedToday: false, lastMessage: '重整防线 · 再守一次尸潮之夜' });
    return carryStreetContinuity(state, startNextNight(retryBase));
  }
  const dusk = state.dayStep === 'dusk' ? state : enterDusk(state);
  return carryStreetContinuity(state, startNextNight({ ...dusk, catFedToday: false }));
}
