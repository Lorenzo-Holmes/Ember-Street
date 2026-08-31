import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState, finalizeDay } from '../src/game/v060/campaign';
import { chooseNightOption } from '../src/game/v060/nightScheduler';
import {
  advanceUntreatedRisk,
  loseCommunityResidents,
  medicalCrisisFlag,
  pendingLowHopeDepartureId,
  queueLowHopeDeparture,
} from '../src/game/v060/mortality';
import type { GameState } from '../src/game/types';

function withStreetState(seed = 606900): GameState {
  const state = createV060InitialState(seed);
  return {
    ...state,
    day: 6,
    phase: 'street',
    buildings: { ...state.buildings, clinic: 1 },
    inventory: { ...state.inventory, medicine: 5, ration: 20 },
  };
}

describe('v0.6 mortality incidents', () => {
  it('counts untreated injury only once per day and queues a serious injury crisis after two days', () => {
    let state = withStreetState();
    state = {
      ...state,
      survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'serious' as const, untreatedDays: 0 } : survivor),
    };
    const first = advanceUntreatedRisk(state);
    const duplicate = advanceUntreatedRisk(first);
    expect(first.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(1);
    expect(duplicate.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(1);
    expect(first.storyFlags).not.toContain(medicalCrisisFlag('lin-xia'));

    const second = advanceUntreatedRisk({ ...duplicate, day: 7 });
    expect(second.survivors.find((s) => s.id === 'lin-xia')?.untreatedDays).toBe(2);
    expect(second.storyFlags).toContain(medicalCrisisFlag('lin-xia'));
  });

  it('successful daytime treatment clears untreated risk before the night crisis can fire', () => {
    let state = withStreetState();
    state = {
      ...state,
      day: 8,
      survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'serious' as const, untreatedDays: 1 } : survivor),
      dayAssignments: { 'lin-xia': 'medical' },
      storyFlags: [...state.storyFlags, medicalCrisisFlag('lin-xia')],
    };
    const resolved = finalizeDay(state);
    const linxia = resolved.survivors.find((s) => s.id === 'lin-xia');
    expect(linxia?.condition).toBe('minor');
    expect(linxia?.untreatedDays).toBe(0);
    expect(resolved.storyFlags).not.toContain(medicalCrisisFlag('lin-xia'));
  });

  it('critical untreated survivor can turn and die through the mortality night event', () => {
    let state = withStreetState();
    state = {
      ...state,
      day: 12,
      phase: 'night',
      survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'critical' as const, untreatedDays: 2 } : survivor),
      storyFlags: [...state.storyFlags, medicalCrisisFlag('lin-xia')],
      nightState: {
        eventIndex: 0,
        eventTotal: 0,
        scheduledEventIds: [],
        emergencyEventIds: ['mortality-medical:lin-xia'],
        currentEventId: 'mortality-medical:lin-xia',
        hordeActive: false,
        hordeStage: null,
        resolutions: [],
      },
    };
    const resolved = chooseNightOption(state, 'mortality-isolate');
    expect(resolved.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('dead');
    expect(resolved.memorials.some((entry) => entry.survivorId === 'lin-xia')).toBe(true);
    expect(resolved.storyFlags).toContain('turned:lin-xia');
  });

  it('low hope queues a deterministic departure risk and the leave choice creates a missing survivor', () => {
    let seeded: GameState | null = null;
    for (let seed = 1; seed <= 5000; seed += 1) {
      const candidate = queueLowHopeDeparture({ ...withStreetState(seed), day: 9, hope: 0 });
      if (pendingLowHopeDepartureId(candidate)) { seeded = candidate; break; }
    }
    expect(seeded).not.toBeNull();
    const targetId = pendingLowHopeDepartureId(seeded!);
    expect(targetId).toBeTruthy();
    const night: GameState = {
      ...seeded!,
      phase: 'night',
      nightState: {
        eventIndex: 0,
        eventTotal: 0,
        scheduledEventIds: [],
        emergencyEventIds: [`mortality-hope:${targetId}`],
        currentEventId: `mortality-hope:${targetId}`,
        hordeActive: false,
        hordeStage: null,
        resolutions: [],
      },
    };
    const resolved = chooseNightOption(night, 'mortality-leave');
    expect(resolved.survivors.find((s) => s.id === targetId)?.condition).toBe('missing');
    expect(resolved.campaignStats.missing).toBeGreaterThan(0);
  });

  it('resident casualties reduce both population and active community labor', () => {
    const base = withStreetState();
    const state: GameState = {
      ...base,
      civilianResidents: 7,
      communityState: { pendingResidents: 1, activeResidents: 6, supportMode: 'defense', lastSupportDay: base.day },
      hope: 40,
    };
    const resolved = loseCommunityResidents(state, 3, '尸群突破');
    expect(resolved.civilianResidents).toBe(4);
    expect(resolved.communityState.pendingResidents + resolved.communityState.activeResidents).toBe(4);
    expect(resolved.communityState.supportMode).toBeNull();
    expect(resolved.hope).toBeLessThan(40);
  });

  it('day advancement evaluates low hope only once per day and remains deterministic for a fixed seed', () => {
    const base = { ...withStreetState(12345), day: 8, phase: 'summary' as const, hope: 0 };
    const a = advanceCampaignDay(base);
    const b = advanceCampaignDay(base);
    expect(a.rngState).toBe(b.rngState);
    expect(pendingLowHopeDepartureId(a)).toBe(pendingLowHopeDepartureId(b));
    expect(a.storyFlags.filter((flag) => flag === 'low_hope_departure_checked:9')).toHaveLength(1);
  });
});
