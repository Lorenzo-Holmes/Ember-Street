import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { createDefaultNightState } from '../src/game/foundation';
import { advanceUntreatedRisk, medicalCrisisFlag, pendingLowHopeDepartureId, queueLowHopeDeparture } from '../src/game/v060/mortality';
import { chooseNightOption, currentNightEvent, scheduleNight } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function withCondition(state: GameState, survivorId: string, condition: 'serious' | 'critical', untreatedDays = 0): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, condition, untreatedDays } : survivor),
  };
}

describe('v0.6 mortality and population pressure', () => {
  it('queues a medical crisis after serious injuries remain untreated for two days', () => {
    let state = { ...createV060InitialState(6001), day: 8 };
    state = withCondition(state, 'lin-xia', 'serious');
    state = advanceUntreatedRisk(state);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(1);
    expect(state.storyFlags).not.toContain(medicalCrisisFlag('lin-xia'));
    state = advanceUntreatedRisk(state);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(2);
    expect(state.storyFlags).toContain(medicalCrisisFlag('lin-xia'));
  });

  it('puts a critical untreated survivor into an urgent night event', () => {
    let state = { ...createV060InitialState(6002), day: 8, phase: 'night' as const };
    state = withCondition(state, 'lin-xia', 'critical');
    state = advanceUntreatedRisk(state);
    state = scheduleNight(state);
    expect(state.nightState.currentEventId).toBe('mortality-medical:lin-xia');
    expect(currentNightEvent(state)?.title).toContain('林夏');
  });

  it('allows an untreated critical survivor to turn and die if the player keeps waiting', () => {
    let state = { ...createV060InitialState(6003), day: 8, phase: 'night' as const };
    state = withCondition(state, 'lin-xia', 'critical', 1);
    state = { ...state, storyFlags: [...state.storyFlags, medicalCrisisFlag('lin-xia')] };
    state = scheduleNight(state);
    state = chooseNightOption(state, 'mortality-isolate');
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('dead');
    expect(state.storyFlags).toContain('turned:lin-xia');
    expect(state.memorials.some((entry) => entry.survivorId === 'lin-xia')).toBe(true);
  });

  it('lets emergency medicine stabilize a critical survivor instead of killing them', () => {
    let state = { ...createV060InitialState(6004), day: 8, phase: 'night' as const, inventory: { ...createV060InitialState(6004).inventory, medicine: 5 } };
    state = withCondition(state, 'lin-xia', 'critical', 1);
    state = { ...state, storyFlags: [...state.storyFlags, medicalCrisisFlag('lin-xia')] };
    state = scheduleNight(state);
    state = chooseNightOption(state, 'mortality-medicine');
    expect(state.inventory.medicine).toBe(3);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('serious');
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(0);
    expect(state.storyFlags).not.toContain(medicalCrisisFlag('lin-xia'));
  });

  it('turns low hope into a seeded departure event rather than silently removing a survivor', () => {
    let queued: GameState | null = null;
    for (let seed = 1; seed <= 2000 && !queued; seed += 1) {
      const candidate = queueLowHopeDeparture({ ...createV060InitialState(seed), day: 10, hope: 0 });
      if (pendingLowHopeDepartureId(candidate)) queued = candidate;
    }
    expect(queued).not.toBeNull();
    const targetId = pendingLowHopeDepartureId(queued!);
    let state = scheduleNight({ ...queued!, phase: 'night' });
    expect(state.nightState.emergencyEventIds).toContain(`mortality-hope:${targetId}`);
    state = {
      ...state,
      nightState: { ...state.nightState, currentEventId: `mortality-hope:${targetId}` },
    };
    expect(currentNightEvent(state)?.title).toContain(state.survivors.find((s) => s.id === targetId)?.name ?? '');
    state = chooseNightOption(state, 'mortality-leave');
    expect(state.survivors.find((s) => s.id === targetId)?.condition).toBe('missing');
    expect(pendingLowHopeDepartureId(state)).toBeNull();
  });

  it('special resident incidents reduce both population and active community labor', () => {
    const base = createV060InitialState(6006);
    let state: GameState = {
      ...base,
      day: 10,
      phase: 'night',
      civilianResidents: 5,
      communityState: { pendingResidents: 0, activeResidents: 5, supportMode: 'defense', lastSupportDay: 10 },
      nightState: {
        ...createDefaultNightState(5),
        eventTotal: 5,
        scheduledEventIds: ['gate-knocking'],
        emergencyEventIds: ['emergency-shelter-stampede'],
        currentEventId: 'emergency-shelter-stampede',
      },
    };
    state = chooseNightOption(state, 'open-yard');
    expect(state.civilianResidents).toBe(4);
    expect(state.communityState.activeResidents).toBe(4);
    expect(state.communityState.supportMode).toBeNull();
    expect(state.storyFlags.some((flag) => flag.includes('混乱撤离'))).toBe(true);
  });
});
