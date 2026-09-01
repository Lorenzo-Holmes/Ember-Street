import { describe, expect, it } from 'vitest';
import { createPendingCheck } from '../src/game/dice';
import { createV060InitialState, finalizeDay } from '../src/game/v060/campaign';
import { applyDailyAgencyEvent } from '../src/game/v060/agencyEvents';
import { recordDeath } from '../src/game/v060/memorial';
import { advancePsychologyDay, psychologyCheckModifier, psychologyWorkEnergyDelta } from '../src/game/v060/psychology';
import type { GameState } from '../src/game/types';

function stateWithDay(day = 8): GameState {
  const base = createV060InitialState(88001);
  return { ...base, day, hope: 55, socialState: { pressure: 2, activePromise: null, fulfilledPromises: 0, brokenPromises: 0 } };
}

describe('v0.6 survivor psychology', () => {
  it('turns a core death into one grieving survivor and shaken witnesses', () => {
    const dead = recordDeath(stateWithDay(), 'ahe', '测试事故');
    const living = dead.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing');
    expect(living.some((s) => s.psychology?.state === 'grieving')).toBe(true);
    expect(living.some((s) => s.psychology?.state === 'shaken')).toBe(true);
    expect(dead.socialState?.pressure).toBe(4);
  });

  it('applies -1 for shaken and +1 for determined checks', () => {
    const base = stateWithDay();
    const shaken = { ...base.survivors[0], psychology: { state: 'shaken' as const, untilDay: 10, cause: '测试' } };
    const determined = { ...base.survivors[0], psychology: { state: 'determined' as const, untilDay: 10, cause: '测试' } };
    expect(psychologyCheckModifier(shaken)?.value).toBe(-1);
    expect(psychologyCheckModifier(determined)?.value).toBe(1);
  });

  it('injects psychology into pending night checks', () => {
    const base = stateWithDay();
    const state = { ...base, survivors: base.survivors.map((s, i) => i === 0 ? { ...s, psychology: { state: 'shaken' as const, untilDay: 10, cause: '测试' } } : s) };
    const actorId = state.survivors[0].id;
    const checked = createPendingCheck(state, { source: 'night', eventId: 'test', choiceId: 'test-choice', label: '测试', actorId, mode: 'normal', modifiers: [] });
    expect(checked.pendingCheck?.modifiers).toContainEqual({ label: '心理·动摇', value: -1 });
  });

  it('makes grief cost extra energy while work and recover extra while resting', () => {
    const survivor = { ...stateWithDay().survivors[0], psychology: { state: 'grieving' as const, untilDay: 12, cause: '测试' } };
    expect(psychologyWorkEnergyDelta(survivor, false)).toBe(2);
    expect(psychologyWorkEnergyDelta(survivor, true)).toBe(-6);
  });

  it('can turn recovered grief into determination when hope remains high', () => {
    const base = stateWithDay(12);
    const state = { ...base, survivors: base.survivors.map((s, i) => i === 0 ? { ...s, psychology: { state: 'grieving' as const, untilDay: 11, cause: '测试' } } : s) };
    expect(advancePsychologyDay(state).survivors[0].psychology?.state).toBe('determined');
  });
});

describe('v0.6 survivor agency', () => {
  it('lets Ahe voluntarily reduce pressure after cooking under stable conditions', () => {
    const base = stateWithDay();
    const state = { ...base, dayAssignments: { ahe: 'cook' as const } };
    const next = applyDailyAgencyEvent(state);
    expect(next.hope).toBe(56);
    expect(next.socialState?.pressure).toBe(1);
    expect(next.storyFlags).toContain(`agency_event_day:${state.day}`);
  });

  it('keeps global agency events on a three-day cooldown', () => {
    const base = stateWithDay(10);
    const state = { ...base, dayAssignments: { ahe: 'cook' as const }, storyFlags: [...base.storyFlags, 'agency_event_day:8'] };
    expect(applyDailyAgencyEvent(state)).toEqual(state);
  });

  it('lets Zhou trade rest energy for defense when the workshop is mature', () => {
    const base = stateWithDay();
    const state = { ...base, buildings: { ...base.buildings, workshop: 2 }, dayAssignments: { zhou: 'rest' as const } };
    const before = state.survivors.find((s) => s.id === 'zhou')!.energy;
    const next = applyDailyAgencyEvent(state);
    expect(next.defense).toBe(state.defense + 2);
    expect(next.survivors.find((s) => s.id === 'zhou')!.energy).toBe(before - 4);
  });

  it('runs agency after normal day work without breaking the night transition', () => {
    const base = stateWithDay();
    const state = { ...base, dayAssignments: { ahe: 'cook' as const }, dayState: { ...base.dayState, assignmentsLocked: true } };
    const next = finalizeDay(state);
    expect(next.phase).toBe('night');
    expect(next.storyFlags).toContain(`agency_event_day:${state.day}`);
  });
});
