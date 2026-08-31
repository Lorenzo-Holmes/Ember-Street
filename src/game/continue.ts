import { startNextNight } from './engine';
import type { GameState } from './types';

function carryStreetContinuity(previous: GameState, next: GameState): GameState {
  return {
    ...next,
    catStage: previous.catStage ?? 0,
    catFedToday: false,
  };
}

export function continueChapter(state: GameState): GameState {
  if (state.phase !== 'street') return state;
  if (state.day === 7 && !state.chapterComplete) {
    return carryStreetContinuity(state, startNextNight({ ...state, day: 6, catFedToday: false, lastMessage: '重整防线 · 再守一次尸潮之夜' }));
  }
  return carryStreetContinuity(state, startNextNight({ ...state, catFedToday: false }));
}
