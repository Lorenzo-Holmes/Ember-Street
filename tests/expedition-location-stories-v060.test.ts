import { describe, expect, it } from 'vitest';
import { createV060InitialState, finalHordeResultFor } from '../src/game/v060/campaign';
import { locationUnlockFlag } from '../src/game/v060/campaignEvents';
import { nightEventWeight } from '../src/game/v060/causalNight';
import {
  currentExpeditionEvent,
  drawExpeditionEvent,
  expeditionRiskScore,
  startExpedition,
} from '../src/game/v060/expedition';
import {
  ALL_EXPEDITION_EVENTS,
  EXPEDITION_LOCATIONS,
  LOCATION_EXPEDITION_EVENTS,
  applyExpeditionStoryOutcome,
  expeditionEventById,
  expeditionSpecialtyBonus,
} from '../src/game/v060/expeditionStories';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import { NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';
import { medicalCrisisFlag } from '../src/game/v060/mortality';
import type { GameState } from '../src/game/types';

function ready(locationId: string, seed = 76001, day = 12): GameState {
  const base = createV060InitialState(seed);
  const state: GameState = {
    ...base,
    day,
    storyFlags: [...base.storyFlags, locationUnlockFlag(locationId)],
    dayAssignments: { 'lin-xia': 'expedition' },
    dayState: { ...base.dayState, assignmentsLocked: true },
  };
  return startExpedition(state, ['lin-xia'], locationId);
}

describe('v0.6 location-specific expedition architecture', () => {
  it('defines ten strategic locations with one signature and two local events each', () => {
    expect(EXPEDITION_LOCATIONS).toHaveLength(10);
    expect(LOCATION_EXPEDITION_EVENTS).toHaveLength(30);
    expect(new Set(ALL_EXPEDITION_EVENTS.map((event) => event.id)).size).toBe(ALL_EXPEDITION_EVENTS.length);
    for (const location of EXPEDITION_LOCATIONS) {
      expect(location.features.length).toBeGreaterThanOrEqual(3);
      expect(expeditionEventById(location.signatureEventId)?.firstVisitOnly).toBe(true);
      expect(location.localEventIds).toHaveLength(2);
      for (const id of location.localEventIds) expect(expeditionEventById(id)?.locationIds).toContain(location.id);
    }
  });

  it('forces the signature event on the first visit without consuming RNG', () => {
    const started = ready('hospital', 76002, 17);
    const beforeRng = started.rngState;
    const drawn = drawExpeditionEvent(started);
    expect(drawn.expeditionState.eventId).toBe('hospital-er-light');
    expect(drawn.rngState).toBe(beforeRng);
    expect(currentExpeditionEvent(drawn)?.firstVisitOnly).toBe(true);
  });

  it('does not force the signature event after it has been resolved', () => {
    const started = ready('west-pharmacy', 76003, 8);
    const repeat = { ...started, storyFlags: [...started.storyFlags, 'signature_seen:west-pharmacy'] };
    const drawn = drawExpeditionEvent(repeat);
    expect(drawn.expeditionState.eventId).not.toBe('pharmacy-cold-storage');
  });

  it('never draws another location local event into the current location pool', () => {
    for (let seed = 76010; seed < 76030; seed += 1) {
      const started = ready('west-pharmacy', seed, 12);
      const repeat = { ...started, storyFlags: [...started.storyFlags, 'signature_seen:west-pharmacy'] };
      const event = currentExpeditionEvent(drawExpeditionEvent(repeat));
      expect(event).toBeTruthy();
      if (event?.locationIds) expect(event.locationIds).toContain('west-pharmacy');
    }
  });

  it('keeps event selection deterministic for identical seed and state', () => {
    const a0 = ready('auto-repair', 76100, 12);
    const b0 = ready('auto-repair', 76100, 12);
    const a = drawExpeditionEvent({ ...a0, storyFlags: [...a0.storyFlags, 'signature_seen:auto-repair'] });
    const b = drawExpeditionEvent({ ...b0, storyFlags: [...b0.storyFlags, 'signature_seen:auto-repair'] });
    expect(a.expeditionState.eventId).toBe(b.expeditionState.eventId);
    expect(a.rngState).toBe(b.rngState);
  });

  it('uses scouting and local route knowledge to reduce repeated-location risk', () => {
    const base = ready('subway', 76101, 14);
    const raw = expeditionRiskScore(base, ['lin-xia'], 'subway');
    const scouted = expeditionRiskScore({ ...base, storyFlags: [...base.storyFlags, 'scouted:subway', 'subway_maintenance_map'] }, ['lin-xia'], 'subway');
    expect(scouted).toBeLessThan(raw);
  });

  it('gives a +1 expedition modifier when the party contains the event specialty', () => {
    const state = ready('convenience-store', 76102, 3);
    const searchEvent = expeditionEventById('convenience-half-shutter')!;
    const medicalEvent = expeditionEventById('pharmacy-cold-storage')!;
    expect(expeditionSpecialtyBonus(state, searchEvent)).toBe(1);
    expect(expeditionSpecialtyBonus(state, medicalEvent)).toBe(0);
  });
});

describe('v0.6 location story consequences', () => {
  it('marks a resolved signature and rescues multiple residents from a local rescue event', () => {
    const base = ready('apartment-402', 76200, 9);
    const state: GameState = {
      ...base,
      storyFlags: [...base.storyFlags, 'apartment_rooftop_hint'],
      expeditionState: { ...base.expeditionState, eventId: 'apartment-rooftop-light' },
    };
    const event = expeditionEventById('apartment-rooftop-light')!;
    const next = applyExpeditionStoryOutcome(state, event, 'success');
    expect(next.civilianResidents).toBe(state.civilianResidents + 2);
    expect(next.campaignStats.rescued).toBe(state.campaignStats.rescued + 2);
    expect(next.storyFlags).toContain('apartment_rooftop_rescued');
  });

  it('turns a failed noisy repair-shop event into persistent local danger', () => {
    const state = ready('auto-repair', 76201, 10);
    const event = expeditionEventById('repair-car-alarm')!;
    const next = applyExpeditionStoryOutcome(state, event, 'failure');
    expect(next.storyFlags).toContain('danger:auto-repair');
    expect(expeditionRiskScore(next, ['lin-xia'], 'auto-repair')).toBeGreaterThan(expeditionRiskScore(state, ['lin-xia'], 'auto-repair'));
  });

  it('lets hospital/pharmacy caches reduce critical emergency medicine cost', () => {
    const base = createV060InitialState(76202);
    const critical: GameState = {
      ...base,
      day: 12,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'critical' as const, untreatedDays: 1 } : survivor),
      storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
    };
    const normal = mortalityEventById(critical, 'mortality-medical:lin-xia')!;
    const cached = mortalityEventById({ ...critical, storyFlags: [...critical.storyFlags, 'medical_cache'] }, 'mortality-medical:lin-xia')!;
    expect(normal.choices[1].cost?.medicine).toBe(2);
    expect(cached.choices[1].cost?.medicine).toBe(1);
  });

  it('lets generator and vehicle discoveries reduce infrastructure event weight', () => {
    const generator = NORMAL_NIGHT_EVENTS.find((event) => event.id === 'generator-drop')!;
    const base = createV060InitialState(76203);
    const risky: GameState = { ...base, day: 15, inventory: { ...base.inventory, power: 20 } };
    const protectedState = { ...risky, storyFlags: [...risky.storyFlags, 'generator_backup', 'working_vehicle_parts'] };
    expect(nightEventWeight(protectedState, generator)).toBeLessThan(nightEventWeight(risky, generator));
  });

  it('lets north-warehouse final supplies change the DAY29 defense result', () => {
    const base = createV060InitialState(76204);
    const state: GameState = { ...base, day: 29, defense: 45, hope: 35 };
    expect(finalHordeResultFor(state)).toBe('damaged');
    expect(finalHordeResultFor({ ...state, storyFlags: [...state.storyFlags, 'final_horde_supplies'] })).toBe('held');
  });
});
