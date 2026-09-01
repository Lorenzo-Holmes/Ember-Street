import { describe, expect, it } from 'vitest';
import { rollPendingCheck } from '../src/game/dice';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import { createV060InitialState } from '../src/game/v060/campaign';
import { FINAL_HORDE_EVENT_IDS } from '../src/game/v060/finalHorde';
import { ALL_V060_NIGHT_EVENTS, nightEventById } from '../src/game/v060/nightEvents';
import { acceptNightCheckResult, chooseNightOption, currentNightEvent, eligibleEvent, nextNightEventId, nightCheckContext, scheduleNight } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function stateFor(day: number, seed = 123456): GameState {
  const base = createV060InitialState(seed);
  return { ...base, day, phase: 'dusk', defense: 72, inventory: { ration: 20, medicine: 12, power: 90, materials: 20, parts: 20 }, buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 }, storyFlags: ['v060_started'], dayAssignments: {} };
}

describe('v0.6 night scheduler', () => {
  it('keeps every player-facing night event at exactly three choices', () => {
    expect(ALL_V060_NIGHT_EVENTS.length).toBeGreaterThan(20);
    for (const event of ALL_V060_NIGHT_EVENTS) expect(event.choices).toHaveLength(3);
  });

  it('is deterministic for the same state and seed', () => {
    const a = scheduleNight(stateFor(17, 99117)); const b = scheduleNight(stateFor(17, 99117));
    expect(a.nightState.scheduledEventIds).toEqual(b.nightState.scheduledEventIds); expect(a.nightState.emergencyEventIds).toEqual(b.nightState.emergencyEventIds); expect(a.nightState.hordeActive).toBe(b.nightState.hordeActive); expect(a.rngState).toBe(b.rngState);
  });

  it('keeps Cheng events ineligible on DAY 4 until Cheng is actually present', () => {
    const withoutCheng = stateFor(4, 4404);
    const fever = nightEventById('fever-resident')!;
    const chengEvents = ALL_V060_NIGHT_EVENTS.filter((event) => event.requiredSurvivorIds?.includes('cheng'));
    expect(chengEvents.map((event) => event.id)).toContain('fever-resident');
    for (const event of chengEvents) expect(eligibleEvent(withoutCheng, event)).toBe(false);

    const cheng = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'cheng')!;
    const withCheng = { ...withoutCheng, survivors: [...withoutCheng.survivors, { ...cheng }] };
    expect(eligibleEvent(withCheng, fever)).toBe(true);
    expect(eligibleEvent({ ...withCheng, survivors: withCheng.survivors.map((survivor) => survivor.id === 'cheng' ? { ...survivor, condition: 'missing' as const } : survivor) }, fever)).toBe(false);
  });

  it('keeps military-burst out until Xiaoman is present, while generic watch events do not name Aliang', () => {
    const military = nightEventById('military-burst')!;
    const withoutXiaoman = stateFor(18, 1818);
    expect(eligibleEvent(withoutXiaoman, military)).toBe(false);
    const xiaoman = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'xiaoman')!;
    expect(eligibleEvent({ ...withoutXiaoman, survivors: [...withoutXiaoman.survivors, { ...xiaoman }] }, military)).toBe(true);

    const eastFootsteps = nightEventById('east-footsteps')!;
    expect(JSON.stringify(eastFootsteps)).not.toContain('阿梁');
    expect(eastFootsteps.requiredSurvivorIds).toBeUndefined();
  });

  it('honors building requirements through the same eligibility function', () => {
    const radioVoice = nightEventById('radio-voice')!;
    const withoutRadio = { ...stateFor(12, 1212), buildings: { ...stateFor(12, 1212).buildings, radio: 0 } };
    expect(eligibleEvent(withoutRadio, radioVoice)).toBe(false);
    expect(eligibleEvent({ ...withoutRadio, buildings: { ...withoutRadio.buildings, radio: 1 } }, radioVoice)).toBe(true);
  });

  it('lets an active defense rotation replace the unmanned-watch disadvantage, but keeps it weaker than a core watch survivor', () => {
    const verify = nightEventById('gate-knocking')!.choices.find((choice) => choice.id === 'verify')!;
    const base = stateFor(12, 12120);
    const unmanned = nightCheckContext(base, verify);
    expect(unmanned.actor).toBeUndefined();
    expect(unmanned.mode).toBe('disadvantage');
    expect(unmanned.modifiers).toContainEqual({ label: '无人值守', value: -2 });

    const community: GameState = {
      ...base,
      civilianResidents: 6,
      communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'defense', lastSupportDay: base.day },
    };
    const residents = nightCheckContext(community, verify);
    expect(residents.actor).toBeUndefined();
    expect(residents.mode).toBe('normal');
    expect(residents.modifiers).toContainEqual({ label: '居民守备轮值', value: -1 });
    expect(residents.modifiers.some((modifier) => modifier.label === '无人值守')).toBe(false);

    const aliang = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'aliang')!;
    const staffed: GameState = { ...community, survivors: [...community.survivors, { ...aliang }], dayAssignments: { aliang: 'watch' } };
    const core = nightCheckContext(staffed, verify);
    expect(core.actor?.id).toBe('aliang');
    expect(core.mode).toBe('normal');
    expect(core.modifiers).toContainEqual({ label: '人物专长', value: 1 });
    expect(core.modifiers.some((modifier) => modifier.label === '居民守备轮值')).toBe(false);
  });

  it('lets an active repair rotation cover infrastructure checks when no core repair survivor is available', () => {
    const repair = nightEventById('generator-drop')!.choices.find((choice) => choice.id === 'repair')!;
    const base = stateFor(12, 12121);
    const withoutRepairer: GameState = { ...base, survivors: base.survivors.filter((survivor) => survivor.id !== 'zhou') };
    expect(nightCheckContext(withoutRepairer, repair).mode).toBe('disadvantage');

    const community: GameState = {
      ...withoutRepairer,
      civilianResidents: 6,
      communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'repair', lastSupportDay: base.day },
    };
    const residents = nightCheckContext(community, repair);
    expect(residents.actor).toBeUndefined();
    expect(residents.mode).toBe('normal');
    expect(residents.modifiers).toContainEqual({ label: '居民维修轮值', value: -1 });
  });

  it.each([10, 20])('forces a horde on DAY %i with the phased milestone scheduler', (day) => {
    const state = scheduleNight(stateFor(day, 7000 + day)); expect(state.nightState.hordeActive).toBe(true); expect(state.nightState.eventTotal).toBe(5);
    expect(state.nightState.scheduledEventIds.map((id) => nightEventById(id)).some((event) => event?.category === 'horde')).toBe(true);
  });

  it('runs DAY29 as the fixed six-stage final horde instead of a random horde mix', () => {
    const state = scheduleNight(stateFor(29, 7029));
    expect(state.nightState.hordeActive).toBe(true);
    expect(state.nightState.eventTotal).toBe(6);
    expect(state.nightState.scheduledEventIds).toEqual([...FINAL_HORDE_EVENT_IDS]);
    expect(state.nightState.emergencyEventIds).toEqual([]);
  });

  it('keeps milestone emergencies on DAY10/20 while DAY29 reserves six slots for the finale', () => {
    const day10 = scheduleNight(stateFor(10, 1010)); expect(day10.nightState.scheduledEventIds).toHaveLength(5); expect(day10.nightState.emergencyEventIds).toHaveLength(1);
    const day20 = scheduleNight(stateFor(20, 2020)); expect(day20.nightState.scheduledEventIds).toHaveLength(5); expect(day20.nightState.emergencyEventIds.length).toBeGreaterThanOrEqual(1); expect(day20.nightState.emergencyEventIds.length).toBeLessThanOrEqual(2);
    const day29 = scheduleNight(stateFor(29, 2929)); expect(day29.nightState.scheduledEventIds).toEqual([...FINAL_HORDE_EVENT_IDS]); expect(day29.nightState.emergencyEventIds).toEqual([]);
  });

  it('never creates a playable night on DAY 30', () => {
    const state = scheduleNight(stateFor(30, 3030)); expect(state.phase).toBe('ending'); expect(state.nightState.eventTotal).toBe(0); expect(state.nightState.scheduledEventIds).toEqual([]); expect(state.nightState.currentEventId).toBeNull();
  });

  it('inserts emergency events without consuming main slots', () => {
    let state = scheduleNight(stateFor(10, 5010)); expect(state.nightState.emergencyEventIds).toHaveLength(1);
    for (let i = 0; i < 2; i += 1) { const event = currentNightEvent(state)!; const safe = event.choices.find((choice) => choice.strategy === 'consequence')!; state = chooseNightOption(state, safe.id); }
    expect(nextNightEventId(state)).toBe(state.nightState.emergencyEventIds[0]); expect(currentNightEvent(state)?.category).toBe('emergency'); expect(state.nightState.eventIndex).toBe(2);
  });

  it('resolves a checked option through deterministic 2D6 and cannot reroll by refresh', () => {
    let state = scheduleNight(stateFor(12, 81212)); const event = currentNightEvent(state)!; const checked = event.choices.find((choice) => Boolean(choice.check))!;
    state = chooseNightOption(state, checked.id); expect(state.pendingCheck?.eventId).toBe(event.id); expect(state.pendingCheck?.dice).toBeUndefined();
    state = rollPendingCheck(state); const snapshot = JSON.parse(JSON.stringify(state)) as GameState; expect(snapshot.pendingCheck?.dice?.length).toBeGreaterThanOrEqual(2);
    expect(rollPendingCheck(snapshot).pendingCheck?.dice).toEqual(snapshot.pendingCheck?.dice);
    const rng = snapshot.rngState; state = acceptNightCheckResult(snapshot); expect(state.pendingCheck).toBeNull(); expect(state.nightState.resolutions).toContain(event.id); expect(state.rngState).toBe(rng);
  });
});
