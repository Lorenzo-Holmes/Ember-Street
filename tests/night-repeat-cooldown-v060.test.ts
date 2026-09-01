import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { nightEventRepeatPenalty, nightEventWeight } from '../src/game/v060/causalNight';
import { chooseNightOption } from '../src/game/v060/nightScheduler';
import { nightEventById } from '../src/game/v060/nightEvents';
import type { GameState } from '../src/game/types';

const generator = nightEventById('generator-drop')!;

describe('v0.6 cross-night event cooldown', () => {
  it('strongly downweights a normal event for four nights after it appears', () => {
    const base = { ...createV060InitialState(95101), day: 10 };
    const fresh = nightEventWeight(base, generator);
    const yesterday: GameState = { ...base, storyFlags: [...base.storyFlags, 'night_seen:generator-drop:9'] };
    const threeDaysAgo: GameState = { ...base, storyFlags: [...base.storyFlags, 'night_seen:generator-drop:7'] };
    const old: GameState = { ...base, storyFlags: [...base.storyFlags, 'night_seen:generator-drop:5'] };

    expect(nightEventRepeatPenalty(yesterday, generator)).toBe(-7);
    expect(nightEventRepeatPenalty(threeDaysAgo, generator)).toBe(-3);
    expect(nightEventRepeatPenalty(old, generator)).toBe(0);
    expect(nightEventWeight(yesterday, generator)).toBeLessThan(fresh);
  });

  it('records the resolved event day in persistent story flags', () => {
    const seed = createV060InitialState(95102);
    const state: GameState = {
      ...seed,
      day: 5,
      phase: 'night',
      nightState: {
        eventIndex: 0,
        eventTotal: 1,
        scheduledEventIds: ['generator-drop'],
        emergencyEventIds: [],
        currentEventId: 'generator-drop',
        hordeActive: false,
        hordeStage: null,
        resolutions: [],
      },
    };
    const resolved = chooseNightOption(state, 'cut');
    expect(resolved.phase).toBe('night-summary');
    expect(resolved.storyFlags).toContain('night_seen:generator-drop:5');
  });
});
