import { describe, expect, it } from 'vitest';
import { createDefaultNightState } from '../src/game/foundation';
import '../src/game/v060/nightEventsExpansion';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import { promoteV2ToV3 } from '../src/game/storage/migrations';
import type { GameState } from '../src/game/types';
import { createV060InitialState } from '../src/game/v060/campaign';
import { FINAL_HORDE_EVENTS } from '../src/game/v060/finalHorde';
import { lowHopeDepartureFlag, medicalCrisisFlag } from '../src/game/v060/mortality';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import { ALL_V060_NIGHT_EVENTS, NORMAL_NIGHT_EVENTS, type NightVisualKey } from '../src/game/v060/nightEvents';
import { chooseNightOption, eligibleEvent, nightVisualSeenRecently, scheduleNight } from '../src/game/v060/nightScheduler';
import { NIGHT_VISUAL_DEFINITIONS, nightVisual } from '../src/ui/visualAssets';

const STATIC_EVENTS = [...ALL_V060_NIGHT_EVENTS, ...FINAL_HORDE_EVENTS];
const STATIC_EVENT_BY_ID = new Map(STATIC_EVENTS.map((event) => [event.id, event]));
const P0_KEYS: NightVisualKey[] = [
  'night_door_visitor',
  'night_medical',
  'night_return_injured',
  'night_conflict',
  'night_external_threat',
];

function fullState(seed: number, day = 9): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day,
    phase: 'dusk',
    survivors: SURVIVOR_ROSTER.map((survivor) => ({ ...survivor })),
    buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 },
    inventory: { ration: 20, medicine: 10, power: 90, materials: 20, parts: 10 },
    defense: 75,
  };
}

describe('Night Event Visual Upgrade v1', () => {
  it('audits all 51 static night definitions and gives each one a registered visual key', () => {
    expect(ALL_V060_NIGHT_EVENTS).toHaveLength(45);
    expect(FINAL_HORDE_EVENTS).toHaveLength(6);
    expect(STATIC_EVENTS).toHaveLength(51);
    expect(new Set(STATIC_EVENTS.map((event) => event.id)).size).toBe(51);

    for (const event of STATIC_EVENTS) {
      expect(NIGHT_VISUAL_DEFINITIONS[event.visualKey]).toBeDefined();
      expect(nightVisual(event.visualKey)?.status).toBe('locked');
    }
  });

  it('covers all five P0 visual categories with approved canonical art', () => {
    const expected = new Map<NightVisualKey, string>([
      ['night_door_visitor', 'A20'],
      ['night_medical', 'A28'],
      ['night_return_injured', 'A25'],
      ['night_conflict', 'A22'],
      ['night_external_threat', 'A23'],
    ]);
    for (const key of P0_KEYS) expect(nightVisual(key)?.canonicalId).toBe(expected.get(key));
  });

  it('keeps every semantic visual category on a stable approved asset', () => {
    const expected = new Map<NightVisualKey, string>([
      ['night_door_visitor', 'A20'],
      ['night_medical', 'A28'],
      ['night_return_injured', 'A25'],
      ['night_conflict', 'A22'],
      ['night_external_threat', 'A23'],
      ['night_empty_bed', 'A06'],
      ['night_theft', 'A27'],
      ['night_quiet', 'A45'],
      ['night_package', 'A29'],
      ['night_departure', 'A05'],
      ['night_power_failure', 'A21'],
      ['night_radio_signal', 'A42'],
      ['night_shelter_damage', 'A47'],
      ['night_fire_hazard', 'A24'],
    ]);

    expect(Object.keys(NIGHT_VISUAL_DEFINITIONS)).toHaveLength(expected.size);
    for (const [key, canonicalId] of expected) expect(nightVisual(key)?.canonicalId).toBe(canonicalId);
  });

  it('assigns the dynamic medical and departure crises without adding per-person UI branches', () => {
    const base = fullState(78001, 12);
    const medical: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia'
        ? { ...survivor, condition: 'critical', untreatedDays: 2 }
        : survivor),
      storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
    };
    expect(mortalityEventById(medical, 'mortality-medical:lin-xia')?.visualKey).toBe('night_medical');

    const departure: GameState = { ...base, storyFlags: [...base.storyFlags, lowHopeDepartureFlag('zhou')] };
    expect(mortalityEventById(departure, 'mortality-hope:zhou')?.visualKey).toBe('night_departure');
  });

  it('remembers a dynamic crisis visual even when resolving it clears the event trigger', () => {
    const base = fullState(78003, 12);
    const eventId = 'mortality-medical:lin-xia';
    const staged: GameState = {
      ...base,
      phase: 'night',
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia'
        ? { ...survivor, condition: 'critical', untreatedDays: 2 }
        : survivor),
      storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
      nightState: {
        ...base.nightState,
        eventIndex: 0,
        eventTotal: 0,
        scheduledEventIds: [],
        emergencyEventIds: [eventId],
        currentEventId: eventId,
      },
    };

    const resolved = chooseNightOption(staged, 'mortality-medicine');
    expect(resolved.storyFlags).toContain('night_visual_seen:night_medical:12');
  });

  it('records visual history when an event resolves and recognizes only the previous two nights', () => {
    const base = fullState(78002, 6);
    const staged: GameState = {
      ...base,
      phase: 'night',
      nightState: {
        ...base.nightState,
        eventIndex: 0,
        eventTotal: 1,
        scheduledEventIds: ['gate-knocking'],
        currentEventId: 'gate-knocking',
      },
    };
    const resolved = chooseNightOption(staged, 'ignore');
    expect(resolved.storyFlags).toContain('night_visual_seen:night_door_visitor:6');

    expect(nightVisualSeenRecently({ ...resolved, day: 7 }, 'night_door_visitor')).toBe(true);
    expect(nightVisualSeenRecently({ ...resolved, day: 8 }, 'night_door_visitor')).toBe(true);
    expect(nightVisualSeenRecently({ ...resolved, day: 9 }, 'night_door_visitor')).toBe(false);
  });

  it('avoids a recently used generic visual when eligible alternatives exist, without shrinking the budget', () => {
    for (let seed = 78100; seed < 78130; seed += 1) {
      const base = fullState(seed);
      const state = { ...base, storyFlags: [...base.storyFlags, 'night_visual_seen:night_quiet:8'] };
      const scheduled = scheduleNight(state);
      const eligibleNormalIds = new Set(NORMAL_NIGHT_EVENTS.filter((event) => eligibleEvent(state, event)).map((event) => event.id));
      const normal = scheduled.nightState.scheduledEventIds
        .filter((id) => eligibleNormalIds.has(id))
        .map((id) => NORMAL_NIGHT_EVENTS.find((event) => event.id === id)!);
      expect(normal.length).toBeGreaterThan(0);
      expect(normal.every((event) => event.visualKey !== 'night_quiet')).toBe(true);
      expect(new Set(normal.map((event) => event.visualKey)).size).toBe(normal.length);
    }
  });

  it('keeps forced horde and generic emergency slots visually distinct when legal alternatives exist', () => {
    for (const day of [10, 20]) {
      for (let seed = 78300; seed < 78320; seed += 1) {
        const scheduled = scheduleNight(fullState(seed + day, day));
        expect(scheduled.nightState.hordeActive).toBe(true);
        const eventIds = [...scheduled.nightState.scheduledEventIds, ...scheduled.nightState.emergencyEventIds];
        const events = eventIds.map((id) => STATIC_EVENTS.find((event) => event.id === id));
        expect(events.every(Boolean)).toBe(true);
        expect(new Set(events.map((event) => event!.visualKey)).size).toBe(events.length);
      }
    }
  });

  it('keeps a deterministic week of consecutive nights visibly different', () => {
    let state = fullState(78131, 6);
    const nights: NightVisualKey[][] = [];
    for (let day = 6; day <= 14; day += 1) {
      state = { ...state, day, phase: 'dusk', nightState: createDefaultNightState() };
      const scheduled = scheduleNight(state);
      const ids = [...scheduled.nightState.scheduledEventIds, ...scheduled.nightState.emergencyEventIds];
      const keys = ids.map((id) => STATIC_EVENT_BY_ID.get(id)?.visualKey).filter((key): key is NightVisualKey => Boolean(key));
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBeGreaterThanOrEqual(Math.min(2, keys.length));
      nights.push(keys);
      const visualFlags = [...new Set(keys)].map((key) => `night_visual_seen:${key}:${day}`);
      state = {
        ...scheduled,
        phase: 'street',
        storyFlags: [...new Set([...scheduled.storyFlags, ...visualFlags])],
        nightState: createDefaultNightState(),
      };
    }

    expect(new Set(nights.flat()).size).toBeGreaterThanOrEqual(8);
    for (let index = 1; index < nights.length; index += 1) {
      expect(nights[index].join('|')).not.toBe(nights[index - 1].join('|'));
    }
    for (let index = 2; index < nights.length; index += 1) {
      const threeNightRepeat = new Set(nights[index].filter((key) => nights[index - 1].includes(key) && nights[index - 2].includes(key)));
      expect([...threeNightRepeat]).toEqual([]);
    }
  });

  it('keeps the current visual stable across a legacy-shaped JSON reload', () => {
    const scheduled = scheduleNight(fullState(78200, 12));
    const beforeId = scheduled.nightState.currentEventId;
    const beforeEvent = STATIC_EVENTS.find((event) => event.id === beforeId);
    const restored = promoteV2ToV3(JSON.parse(JSON.stringify(scheduled)))!;
    const afterEvent = STATIC_EVENTS.find((event) => event.id === restored.nightState.currentEventId);
    expect(restored.nightState.currentEventId).toBe(beforeId);
    expect(afterEvent?.visualKey).toBe(beforeEvent?.visualKey);
    expect(nightVisual(afterEvent!.visualKey)?.canonicalId).toBe(nightVisual(beforeEvent!.visualKey)?.canonicalId);
  });

});
