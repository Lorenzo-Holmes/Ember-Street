import {
  acceptStoryCheck as acceptLegacyStoryCheck,
  beginStoryChoice as beginLegacyStoryChoice,
  ensureStoryDay as ensureLegacyStoryDay,
  livingStreetContentCount as legacyContentCount,
  storyChoiceAvailability as legacyChoiceAvailability,
  storyEventsForState as legacyStoryEventsForState,
} from './story';
import type { GameState, StreetLogEntry } from './types';
import type { StoryEventView } from './story';

/**
 * v0.4 authored its first Story Pool around a seven-day prototype.
 * Living Street keeps that authored material, but schedules unresolved stories
 * across the thirty-day campaign instead of exhausting the whole pool in week one.
 */
function campaignCopy(value: string): string {
  return value
    .replace(/DAY 7/g, 'DAY 30')
    .replace(/第七天/g, '第三十天');
}

function modernizeLog(entry: StreetLogEntry): StreetLogEntry {
  return {
    ...entry,
    title: campaignCopy(entry.title),
    body: campaignCopy(entry.body),
  };
}

function modernizeState(state: GameState): GameState {
  return {
    ...state,
    lastMessage: campaignCopy(state.lastMessage),
    logs: (state.logs ?? []).map(modernizeLog),
  };
}

function modernizeEvent(event: StoryEventView, actualDay: number): StoryEventView {
  return {
    ...event,
    kicker: campaignCopy(event.kicker).replace(/^DAY\s+\d+/, `DAY ${actualDay}`),
    title: campaignCopy(event.title),
    body: campaignCopy(event.body),
    quote: event.quote ? campaignCopy(event.quote) : undefined,
    choices: event.choices.map((choice) => ({
      ...choice,
      label: campaignCopy(choice.label),
      detail: campaignCopy(choice.detail),
      checkLabel: choice.checkLabel ? campaignCopy(choice.checkLabel) : undefined,
    })),
  };
}

function virtualStoryDay(actualDay: number): number {
  if (actualDay <= 6) return actualDay;
  // Cycle the original authored windows (DAY 2–6) while resolved ids prevent repeats.
  // Later survivors/buildings make previously unavailable character stories eligible.
  return 2 + ((actualDay - 7) % 5);
}

export function ensureStoryDay(state: GameState): GameState {
  if (state.phase !== 'street' || state.chapterComplete || state.storyPreparedDay === state.day) return modernizeState(state);

  const actualDay = state.day;
  const beforeLogCount = state.logs?.length ?? 0;
  const virtualDay = virtualStoryDay(actualDay);
  const prepared = ensureLegacyStoryDay({
    ...state,
    day: virtualDay,
    // The legacy scheduler compares this field with its virtual day.
    storyPreparedDay: 0,
  });

  const logs = (prepared.logs ?? []).map((entry, index) => {
    if (index < beforeLogCount) return modernizeLog(entry);
    return modernizeLog({ ...entry, day: actualDay });
  });

  return modernizeState({
    ...prepared,
    day: actualDay,
    storyPreparedDay: actualDay,
    // One focused Story Pool card per day; daily situations and ambient logs
    // already provide the other beats.
    storyDailyIds: (prepared.storyDailyIds ?? []).slice(0, 1),
    logs,
  });
}

export function storyEventsForState(state: GameState): StoryEventView[] {
  return legacyStoryEventsForState(state).map((event) => modernizeEvent(event, state.day));
}

export function storyChoiceAvailability(state: GameState, eventId: string, choiceId: string): { available: boolean; reason?: string } {
  return legacyChoiceAvailability(state, eventId, choiceId);
}

export function beginStoryChoice(state: GameState, eventId: string, choiceId: string): GameState {
  return modernizeState(beginLegacyStoryChoice(state, eventId, choiceId));
}

export function acceptStoryCheck(state: GameState): GameState {
  return modernizeState(acceptLegacyStoryCheck(state));
}

export function livingStreetContentCount(): number {
  return legacyContentCount();
}
