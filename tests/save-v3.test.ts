import { describe, expect, it } from 'vitest';
import { rollPendingCheck } from '../src/game/dice';
import { promoteV2ToV3 } from '../src/game/storage/migrations';
import { createV060InitialState } from '../src/game/v060/campaign';
import { chooseNightOption, currentNightEvent, scheduleNight } from '../src/game/v060/nightScheduler';

describe('v0.5 -> v0.6 save migration', () => {
  it('salvages seven-slot and rack resources into the v0.6 inventory', () => {
    const legacy = {
      version: 2, seed: 6060, rngState: 7070, day: 18, phase: 'street',
      supplies: 11, medicine: 4, power: 47, parts: 9, hope: 26, defense: 53,
      slots: [{ id: 'r2', kind: 'ration', tier: 2 }, { id: 'm1', kind: 'medical', tier: 1 }, { id: 'b3', kind: 'battery', tier: 3 }, null],
      racks: ['ration', 'medical', 'battery', 'ration'], rackStock: [2, 1, 1, 0],
      survivors: [], assignments: {}, buildings: { searchStation: 1, workshop: 0, clinic: 0, watchPost: 0, shelter: 1, radio: 0 },
      storyFlags: ['pharmacy_basement'],
    };
    const migrated = promoteV2ToV3(legacy)!;
    expect(migrated.version).toBe(3); expect(migrated.day).toBe(18); expect(migrated.hope).toBe(26); expect(migrated.storyFlags).toContain('pharmacy_basement');
    expect(migrated.inventory).toEqual({ ration: 16, medicine: 6, power: 82, materials: 0, parts: 9 });
    expect('slots' in migrated).toBe(false); expect('racks' in migrated).toBe(false); expect('currentOrder' in migrated).toBe(false);
  });

  it('maps legacy search role and injury into v0.6 assignment and condition', () => {
    const migrated = promoteV2ToV3({
      version: 2, seed: 1, rngState: 2, day: 8, supplies: 2, medicine: 1, power: 62, parts: 0, hope: 20,
      survivors: [{ id: 'legacy-scout', name: '旧搜索员', specialty: 'search', energy: 30, mood: 'steady', perk: '旧档', injury: 'minor' }],
      assignments: { 'legacy-scout': 'search' }, buildings: { searchStation: 1, workshop: 0, clinic: 0, watchPost: 0, shelter: 1, radio: 0 },
    })!;
    expect(migrated.dayAssignments['legacy-scout']).toBe('expedition'); expect(migrated.survivors[0]?.condition).toBe('minor'); expect(migrated.survivors[0]?.trust).toBe(0); expect(migrated.memorials).toEqual([]);
  });
});

describe('v0.6 save resume', () => {
  it('preserves night phase, event schedule, committed dice, and rng state across JSON reload', () => {
    let state = createV060InitialState(991122);
    state = scheduleNight({ ...state, day: 12, phase: 'night', buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 } });
    const event = currentNightEvent(state)!;
    const checked = event.choices.find((choice) => Boolean(choice.check))!;
    state = chooseNightOption(state, checked.id);
    state = rollPendingCheck(state);
    const dice = state.pendingCheck?.dice;
    const rng = state.rngState;
    const schedule = [...state.nightState.scheduledEventIds];

    const restored = promoteV2ToV3(JSON.parse(JSON.stringify(state)))!;
    expect(restored.phase).toBe('night');
    expect(restored.pendingCheck?.dice).toEqual(dice);
    expect(restored.rngState).toBe(rng);
    expect(restored.nightState.scheduledEventIds).toEqual(schedule);
    expect(rollPendingCheck(restored).pendingCheck?.dice).toEqual(dice);
  });

  it('preserves social continuity instead of reopening earlier principle decisions after reload', () => {
    const base = createV060InitialState(991123);
    const state = {
      ...base,
      day: 21,
      socialState: {
        pressure: 3,
        activePromise: {
          id: 'promise-hot-meal-18',
          kind: 'hot-meal' as const,
          title: '至少让孩子吃顿热的',
          createdDay: 18,
          deadlineDay: 21,
          status: 'active' as const,
          targetValue: 1,
        },
        fulfilledPromises: 4,
        brokenPromises: 1,
        principles: ['everyone-shares', 'community-shares-risk'] as const,
        lastRequestDay: 18,
        lastOutcome: '这件事还记着。',
      },
    };

    const restored = promoteV2ToV3(JSON.parse(JSON.stringify(state)))!;
    expect(restored.socialState.pressure).toBe(3);
    expect(restored.socialState.principles).toEqual(['everyone-shares', 'community-shares-risk']);
    expect(restored.socialState.activePromise).toEqual(state.socialState.activePromise);
    expect(restored.socialState.fulfilledPromises).toBe(4);
    expect(restored.socialState.brokenPromises).toBe(1);
    expect(restored.socialState.lastRequestDay).toBe(18);
    expect(restored.socialState.lastOutcome).toBe('这件事还记着。');
  });
});
