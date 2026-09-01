import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState } from '../src/game/v060/campaign';
import { nightChoicePreview } from '../src/game/v060/decisionReadability';
import {
  FINAL_HORDE_EVENT_IDS,
  applyFinalHordeResolution,
  effectiveFinalHordeChoice,
  finalHordeCheckModifiers,
  finalHordeEventById,
} from '../src/game/v060/finalHorde';
import { currentNightEvent, scheduleNight, chooseNightOption } from '../src/game/v060/nightScheduler';
import { normalizeSocialState } from '../src/game/v060/socialPressure';
import type { GameState } from '../src/game/types';

function finalReady(seed = 88001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 29,
    phase: 'night',
    hope: 60,
    defense: 70,
    inventory: { ration: 100, medicine: 20, power: 90, materials: 100, parts: 100 },
    buildings: { searchStation: 3, workshop: 3, clinic: 3, watchPost: 3, shelter: 3, radio: 3 },
    civilianResidents: 9,
    communityState: { pendingResidents: 0, activeResidents: 9, supportMode: 'defense', lastSupportDay: 29 },
    socialState: {
      ...normalizeSocialState(base.socialState),
      pressure: 1,
      fulfilledPromises: 3,
      brokenPromises: 1,
      principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'],
    },
    storyFlags: [
      ...base.storyFlags,
      'community_rotation_unlocked',
      'final_horde_supplies',
      'medical_cache',
      'subway_maintenance_map',
      'evacuation_route_known',
      'working_vehicle_parts',
      'principle:hold-the-street',
    ],
  };
}

describe('DAY29 six-stage final horde', () => {
  it('schedules exactly six fixed stages and no random emergencies', () => {
    const night = scheduleNight(finalReady());
    expect(night.nightState.hordeActive).toBe(true);
    expect(night.nightState.eventTotal).toBe(6);
    expect(night.nightState.scheduledEventIds).toEqual([...FINAL_HORDE_EVENT_IDS]);
    expect(night.nightState.emergencyEventIds).toEqual([]);
    expect(night.nightState.currentEventId).toBe(FINAL_HORDE_EVENT_IDS[0]);
  });

  it('does not consume RNG merely to decide the fixed DAY29 stage order', () => {
    const state = finalReady(88002);
    const a = scheduleNight(state);
    const b = scheduleNight(state);
    expect(a.rngState).toBe(state.rngState);
    expect(b.rngState).toBe(state.rngState);
    expect(a.nightState.scheduledEventIds).toEqual(b.nightState.scheduledEventIds);
  });

  it('keeps DAY28 on the normal scheduler instead of leaking final stages early', () => {
    const state = { ...finalReady(88003), day: 28 };
    const night = scheduleNight(state);
    expect(night.nightState.scheduledEventIds.some((id) => id.startsWith('final-horde-'))).toBe(false);
  });

  it('turns route knowledge and the evacuation principle into visible stage-five modifiers', () => {
    const state = {
      ...finalReady(88004),
      socialState: { ...normalizeSocialState(finalReady(88004).socialState), principles: ['everyone-shares', 'community-shares-risk', 'prepare-evacuation'] as const },
    } as GameState;
    const modifiers = finalHordeCheckModifiers(state, 'final-route-scout');
    expect(modifiers).toContainEqual({ label: '过去的路线情报', value: 2 });
    expect(modifiers).toContainEqual({ label: '原则·准备撤离', value: 1 });
  });

  it('lets medical doctrine and caches lower the real stage-three medicine cost', () => {
    const state: GameState = {
      ...finalReady(88005),
      socialState: { ...normalizeSocialState(finalReady(88005).socialState), principles: ['triage-first'] },
    };
    const event = finalHordeEventById('final-horde-clinic')!;
    const choice = event.choices.find((item) => item.id === 'final-clinic-supplies')!;
    expect(choice.cost?.medicine).toBe(3);
    expect(effectiveFinalHordeChoice(state, choice).cost?.medicine).toBe(1);
  });

  it('uses the emergency medical stockpile to improve actual survivor conditions', () => {
    const base = finalReady(88006);
    const injured: GameState = {
      ...base,
      survivors: base.survivors.map((survivor, index) => index === 0
        ? { ...survivor, condition: 'critical' as const, untreatedDays: 2 }
        : index === 1
          ? { ...survivor, condition: 'serious' as const, untreatedDays: 2 }
          : survivor),
    };
    const resolved = applyFinalHordeResolution(injured, 'final-horde-clinic', 'final-clinic-supplies');
    expect(resolved.survivors[0].condition).toBe('serious');
    expect(resolved.survivors[1].condition).toBe('minor');
    expect(resolved.survivors[0].untreatedDays).toBe(0);
  });

  it('makes the last-line check read supplies, principles, community and promise history', () => {
    const modifiers = finalHordeCheckModifiers(finalReady(88007), 'final-last-hold');
    expect(modifiers).toEqual(expect.arrayContaining([
      { label: '北仓库防护物资', value: 2 },
      { label: '原则·守住这条街', value: 2 },
      { label: '社区劳动力', value: 1 },
      { label: '街区仍然相信承诺', value: 1 },
    ]));
  });

  it('shows which old preparations are still helping on the final night', () => {
    const state = finalReady(88008);
    const event = finalHordeEventById('final-horde-last-line')!;
    const choice = event.choices.find((item) => item.id === 'final-last-hold')!;
    const preview = nightChoicePreview(state, event, choice);
    expect(preview.tags).toContain('最后一夜 6/6');
    expect(preview.tags).toContain('北仓库防护物资 +2');
    expect(preview.summary).toContain('过去留下的东西正在派上用场');
  });

  it('advances through all six stages before entering night summary', () => {
    let state = scheduleNight(finalReady(88009));
    const stableChoices = [
      'final-gate-reinforce',
      'final-grid-parts',
      'final-clinic-supplies',
      'final-community-rations',
      'final-route-barricade',
      'final-last-stockpile',
    ];
    stableChoices.forEach((choiceId, index) => {
      expect(currentNightEvent(state)?.id).toBe(FINAL_HORDE_EVENT_IDS[index]);
      state = chooseNightOption(state, choiceId);
      if (index < 5) expect(state.phase).toBe('night');
    });
    expect(state.phase).toBe('night-summary');
    expect(state.nightState.resolutions).toEqual([...FINAL_HORDE_EVENT_IDS]);
  });

  it('DAY30 remains settlement-only after the six-stage night', () => {
    let state = scheduleNight(finalReady(88010));
    for (const choiceId of ['final-gate-reinforce', 'final-grid-parts', 'final-clinic-supplies', 'final-community-rations', 'final-route-barricade', 'final-last-stockpile']) {
      state = chooseNightOption(state, choiceId);
    }
    const ending = advanceCampaignDay(state);
    expect(ending.day).toBe(30);
    expect(ending.phase).toBe('ending');
    expect(ending.finalHordeResult).toBeDefined();
    expect(ending.ending).not.toBeNull();
  });
});