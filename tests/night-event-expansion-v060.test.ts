import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { ALL_V060_NIGHT_EVENTS, nightEventById } from '../src/game/v060/nightEvents';
import { EXPANDED_NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEventsExpansion';
import { scheduleNight } from '../src/game/v060/nightScheduler';

const EXPANDED_IDS = EXPANDED_NORMAL_NIGHT_EVENTS.map((event) => event.id);

describe('expanded ordinary night event pool', () => {
  it('registers twelve unique player-facing events with three choices each', () => {
    expect(EXPANDED_NORMAL_NIGHT_EVENTS).toHaveLength(12);
    expect(new Set(EXPANDED_IDS).size).toBe(EXPANDED_IDS.length);

    for (const event of EXPANDED_NORMAL_NIGHT_EVENTS) {
      expect(event.category === 'threat' || event.category === 'infrastructure' || event.category === 'survivor').toBe(true);
      expect(event.choices).toHaveLength(3);
      expect(nightEventById(event.id)?.id).toBe(event.id);
      expect(ALL_V060_NIGHT_EVENTS.some((candidate) => candidate.id === event.id)).toBe(true);
    }
  });

  it('actually lets the scheduler draw expanded events instead of leaving them as dead content', () => {
    const seen = new Set<string>();

    for (let seed = 120001; seed < 120161; seed += 1) {
      const initial = createV060InitialState(seed);
      const scheduled = scheduleNight({ ...initial, day: 8, phase: 'dusk' });
      for (const id of scheduled.nightState.scheduledEventIds) {
        if (EXPANDED_IDS.includes(id)) seen.add(id);
      }
    }

    expect(seen.size).toBeGreaterThanOrEqual(6);
  });
});
