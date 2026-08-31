import { startNextNight } from './engine';
import type { GameState } from './types';

export function continueChapter(state: GameState): GameState {
  if (state.phase !== 'street') return state;
  if (state.day === 7 && !state.chapterComplete) {
    return startNextNight({ ...state, day: 6, lastMessage: '重整防线 · 再守一次尸潮之夜' });
  }
  return startNextNight(state);
}
