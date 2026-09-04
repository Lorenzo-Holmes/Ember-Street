import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState, searchForMissing } from '../src/game/v060/campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { assignDayJob, assignExpeditionRoute, canTakeDayAssignment, lockDayAssignments, lockDayAssignmentsAndRoute, openExpeditionEvent, reopenDayAssignments } from '../src/game/v060/dayManagement';
import { canStartExpedition, currentExpeditionEvent, drawExpeditionEvent, isLocationUnlocked, retreatExpedition, startExpedition } from '../src/game/v060/expedition';

function expeditionReady() {
  let state = createV060InitialState(606060);
  state = assignExpeditionRoute(state, 'lin-xia', 'convenience-store');
  return lockDayAssignmentsAndRoute(state);
}

describe('v0.6 UI flow hotfix logic', () => {
  it('reopens dusk only before anybody has actually executed an action', () => {
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
  });

  it('does not reopen dispatch after an expedition or rescue has committed people', () => {
    let state = expeditionReady();
    state = drawExpeditionEvent(startExpedition(state, ['lin-xia'], 'convenience-store'));
    state = retreatExpedition(state);
    expect(state.phase).toBe('dusk');
    expect(state.dayState.assignmentsLocked).toBe(true);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');

    const attemptedReopen = reopenDayAssignments(state);
    expect(attemptedReopen.phase).toBe('dusk');
    expect(attemptedReopen.dayState.assignmentsLocked).toBe(true);
    expect(canTakeDayAssignment(attemptedReopen, 'zhou', 'rest').allowed).toBe(false);
  });

  it('returns to street immediately after starting an expedition while keeping all dispatch locked', () => {
    const state = startExpedition(expeditionReady(), ['lin-xia'], 'convenience-store');
    expect(state.phase).toBe('street');
    expect(state.expeditionState.departed).toBe(true);
    expect(state.expeditionState.activePartyIds).toEqual(['lin-xia']);
    expect(state.dayState.assignmentsLocked).toBe(true);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
    expect(canTakeDayAssignment(state, 'zhou', 'rest').allowed).toBe(false);
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

  it('routes a completed or retreated expedition directly to dusk', () => {
    let state = startExpedition(expeditionReady(), ['lin-xia'], 'convenience-store');
    state = retreatExpedition(state);
    expect(state.phase).toBe('dusk');
    expect(state.dayState.assignmentsLocked).toBe(true);
    expect(state.dayState.returnedExpeditions).toBe(1);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
    expect(canStartExpedition(state, ['lin-xia'], 'convenience-store').allowed).toBe(false);
  });

  it('clears yesterday committed people when a new morning starts', () => {
    const base = createV060InitialState(606064);
    const yesterday = {
      ...base,
      day: 5,
      phase: 'dawn' as const,
      dayAssignments: { 'lin-xia': 'expedition' as const, zhou: 'medical' as const },
      dayState: {
        ...base.dayState,
        assignmentsLocked: true,
        returnedExpeditions: 1,
        committedSurvivorIds: ['lin-xia', 'zhou'],
      },
    };

    const morning = advanceCampaignDay(yesterday);
    expect(morning.day).toBe(6);
    expect(morning.phase).toBe('street');
    expect(morning.dayAssignments).toEqual({});
    expect(morning.dayState.assignmentsLocked).toBe(false);
    expect(morning.dayState.returnedExpeditions).toBe(0);
    expect(morning.dayState.committedSurvivorIds).toEqual([]);
    expect(canTakeDayAssignment(morning, 'lin-xia', 'rest').allowed).toBe(true);
    expect(canTakeDayAssignment(morning, 'zhou', 'rest').allowed).toBe(true);
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

  it('unlocks map locations only after their fixed discovery event is resolved', () => {
    let state = createV060InitialState(606063);
    expect(isLocationUnlocked(state, 'convenience-store')).toBe(true);
    expect(isLocationUnlocked(state, 'west-pharmacy')).toBe(false);

    state = { ...state, day: 2 };
    expect(isLocationUnlocked(state, 'west-pharmacy')).toBe(false);
    const event = pendingCampaignEvent(state);
    expect(event?.id).toBe('location-west-pharmacy');
    state = resolveCampaignEvent(state, event!.id);
    expect(isLocationUnlocked(state, 'west-pharmacy')).toBe(true);
  });
});
