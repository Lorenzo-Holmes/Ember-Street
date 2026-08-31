import { describe, expect, it } from 'vitest';
import { createV060InitialState, searchForMissing } from '../src/game/v060/campaign';
import { assignDayJob, canTakeDayAssignment, lockDayAssignments, lockDayAssignmentsAndRoute, openExpeditionEvent, reopenDayAssignments } from '../src/game/v060/dayManagement';
import { canStartExpedition, currentExpeditionEvent, drawExpeditionEvent, isLocationUnlocked, retreatExpedition, startExpedition } from '../src/game/v060/expedition';

function expeditionReady() {
  let state = createV060InitialState(606060);
  state = assignDayJob(state, 'lin-xia', 'expedition');
  return lockDayAssignmentsAndRoute(state);
}

describe('v0.6 UI flow hotfix logic', () => {
  it('reopens dusk to street and lets only uncommitted survivors change jobs', () => {
    const base = createV060InitialState(606061);
    const dusk = {
      ...base,
      phase: 'dusk' as const,
      dayAssignments: { zhou: 'rest' as const },
      dayState: { ...base.dayState, assignmentsLocked: true },
    };

    const reopened = reopenDayAssignments(dusk);
    expect(reopened.phase).toBe('street');
    expect(reopened.dayState.assignmentsLocked).toBe(false);
    expect(canTakeDayAssignment(reopened, 'zhou', 'rest').allowed).toBe(true);
    expect(assignDayJob(reopened, 'zhou', 'rest').dayAssignments.zhou).toBe('rest');
  });

  it('keeps completed expedition participants committed after dusk is reopened', () => {
    let state = expeditionReady();
    state = drawExpeditionEvent(startExpedition(state, ['lin-xia'], 'convenience-store'));
    state = retreatExpedition(state);
    state = lockDayAssignmentsAndRoute(state);
    expect(state.phase).toBe('dusk');

    state = reopenDayAssignments(state);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
    expect(state.dayAssignments['lin-xia']).toBeUndefined();
    expect(canTakeDayAssignment(state, 'lin-xia', 'rest').allowed).toBe(false);
  });

  it('returns to street immediately after starting an expedition while keeping it departed', () => {
    const state = startExpedition(expeditionReady(), ['lin-xia'], 'convenience-store');
    expect(state.phase).toBe('street');
    expect(state.expeditionState.departed).toBe(true);
    expect(state.expeditionState.activePartyIds).toEqual(['lin-xia']);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
  });

  it('can re-enter a departed expedition event from street without losing the event', () => {
    let state = startExpedition(expeditionReady(), ['lin-xia'], 'convenience-store');
    state = drawExpeditionEvent(state);
    const eventId = currentExpeditionEvent(state)?.id;
    expect(state.phase).toBe('street');
    expect(eventId).toBeTruthy();

    state = openExpeditionEvent(state);
    expect(state.phase).toBe('expedition');
    expect(currentExpeditionEvent(state)?.id).toBe(eventId);
  });

  it('increments returned expeditions and prevents the same survivor from exploring twice that day', () => {
    let state = startExpedition(expeditionReady(), ['lin-xia'], 'convenience-store');
    state = retreatExpedition(state);
    expect(state.phase).toBe('street');
    expect(state.dayState.returnedExpeditions).toBe(1);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
    expect(canStartExpedition(state, ['lin-xia'], 'convenience-store').allowed).toBe(false);
  });

  it('scrubs old jobs for missing-person search helpers before the day is finalized', () => {
    const base = createV060InitialState(606062);
    const state = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'ahe' ? { ...survivor, condition: 'missing' as const } : survivor),
      dayAssignments: { 'lin-xia': 'cook' as const, zhou: 'watch' as const },
    };
    const searched = searchForMissing(state, 'ahe', 'team');
    expect(searched.dayState.committedSurvivorIds).toEqual(expect.arrayContaining(['lin-xia', 'zhou']));

    const locked = lockDayAssignments(searched);
    expect(locked.dayAssignments['lin-xia']).toBeUndefined();
    expect(locked.dayAssignments.zhou).toBeUndefined();
  });

  it('exposes location unlock state through the expedition logic API', () => {
    const dayOne = createV060InitialState(606063);
    expect(isLocationUnlocked(dayOne, 'convenience-store')).toBe(true);
    expect(isLocationUnlocked(dayOne, 'west-pharmacy')).toBe(false);
    expect(isLocationUnlocked({ ...dayOne, day: 2 }, 'west-pharmacy')).toBe(true);
  });
});
