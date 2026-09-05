import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';
import { eligibleEvent, nightAnchorCategories, normalNightEventBudget, scheduleNight } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function normalIds(state: GameState): Set<string> {
  return new Set(NORMAL_NIGHT_EVENTS.filter((event) => eligibleEvent(state, event)).map((event) => event.id));
}

function scheduledNormalIds(state: GameState): string[] {
  const ids = normalIds(state);
  return scheduleNight(state).nightState.scheduledEventIds.filter((id) => ids.has(id));
}

describe('v0.6 normal-night recent selection cooldown', () => {
  it('prefers events not seen in the previous two nights when enough alternatives exist', () => {
    const base: GameState = { ...createV060InitialState(95201), day: 10, phase: 'night' };
    const eligible = NORMAL_NIGHT_EVENTS.filter((event) => eligibleEvent(base, event));
    const budget = normalNightEventBudget(base.day);
    const fresh = new Set<string>();
    for (const category of nightAnchorCategories(base.day)) {
      const candidate = eligible.find((event) => event.category === category && !fresh.has(event.id));
      if (candidate) fresh.add(candidate.id);
    }
    for (const event of eligible) {
      if (fresh.size >= budget) break;
      fresh.add(event.id);
    }
    expect(fresh.size).toBeGreaterThanOrEqual(budget);
    const recentFlags = eligible.filter((event) => !fresh.has(event.id)).map((event) => `night_seen:${event.id}:9`);
    const state = { ...base, storyFlags: [...base.storyFlags, ...recentFlags] };
    const scheduled = scheduledNormalIds(state);
    expect(scheduled).toHaveLength(budget);
    expect(scheduled.every((id) => fresh.has(id))).toBe(true);
  });

  it('falls back to recent events instead of shrinking the nightly event budget', () => {
    const base: GameState = { ...createV060InitialState(95202), day: 10, phase: 'night' };
    const eligible = NORMAL_NIGHT_EVENTS.filter((event) => eligibleEvent(base, event));
    const keepFresh = eligible[0]?.id;
    expect(keepFresh).toBeTruthy();
    const recentFlags = eligible.filter((event) => event.id !== keepFresh).map((event) => `night_seen:${event.id}:9`);
    const state = { ...base, storyFlags: [...base.storyFlags, ...recentFlags] };
    const scheduled = scheduledNormalIds(state);
    expect(scheduled).toHaveLength(normalNightEventBudget(base.day));
    expect(new Set(scheduled).size).toBe(scheduled.length);
  });
});
