import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState } from '../src/game/v060/campaign';
import { scheduleNight } from '../src/game/v060/nightScheduler';

describe('v0.6 campaign timeline', () => {
  it('keeps DAY 29 as the last playable night and DAY 30 as ending only', () => {
    let state = createV060InitialState(290030);
    for (let day = 1; day < 29; day += 1) {
      state = { ...state, day, phase: 'summary' };
      state = advanceCampaignDay(state);
      expect(state.day).toBe(day + 1);
      expect(state.phase).toBe('street');
    }
    expect(state.day).toBe(29);
    const night = scheduleNight({ ...state, phase: 'night' });
    expect(night.nightState.hordeActive).toBe(true);
    expect(night.nightState.scheduledEventIds).toHaveLength(6);
    const dawn = { ...night, phase: 'summary' as const, defense: 60, hope: 45 };
    const ending = advanceCampaignDay(dawn);
    expect(ending.day).toBe(30);
    expect(ending.phase).toBe('ending');
    expect(ending.ending).not.toBeNull();
    expect(ending.finalHordeResult).toBeDefined();
  });

  it('never schedules a playable DAY 30 night', () => {
    const state = { ...createV060InitialState(30), day: 30, phase: 'night' as const };
    const next = scheduleNight(state);
    expect(next.phase).toBe('ending');
    expect(next.nightState.scheduledEventIds).toEqual([]);
  });
});
