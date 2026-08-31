import { CHAPTER_FINAL_DAY } from './config';
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
    storyFlags: previous.storyFlags ?? next.storyFlags,
    resolvedStoryEventIds: previous.resolvedStoryEventIds ?? next.resolvedStoryEventIds,
  };
}

export function continueChapter(state: GameState): GameState {
  if (state.phase !== 'street') return state;
  if (state.day === CHAPTER_FINAL_DAY && !state.chapterComplete) {
    const retryBase = enterDusk({ ...state, day: CHAPTER_FINAL_DAY - 1, activeEventId: null, dayStep: 'morning', storyDailyIds: [], storyPreparedDay: 0, pendingCheck: null, nightIncidentId: null, catFedToday: false, lastMessage: '重整防线 · 再守一次最终尸潮' });
    return carryStreetContinuity(state, startNextNight(retryBase));
  }
  const dusk = state.dayStep === 'dusk' ? state : enterDusk(state);
  return carryStreetContinuity(state, startNextNight({ ...dusk, catFedToday: false }));
}
