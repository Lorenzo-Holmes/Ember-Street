import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/types';
import { createV060InitialState } from '../src/game/v060/campaign';
import {
  canStartExpedition,
  currentExpeditionEvent,
  drawExpeditionEvent,
  expeditionRiskScore,
  resolveExpeditionOutcome,
  retreatExpedition,
} from '../src/game/v060/expedition';
import {
  applyExpeditionStoryOutcome,
  eligibleExpeditionStories,
  expeditionStoryEventById,
  locationStoryProfile,
  signatureSeenFlag,
} from '../src/game/v060/expeditionStories';

function activeExpedition(locationId: string, seed = 910001, day = 18): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day,
    storyFlags: [...base.storyFlags, `location_unlocked:${locationId}`],
    dayAssignments: { 'lin-xia': 'expedition' },
    dayState: { ...base.dayState, assignmentsLocked: true },
    expeditionState: { activePartyIds: ['lin-xia'], locationId, eventId: null, departed: true },
  };
}

describe('v0.6 location-specific expedition stories', () => {
  it('gives every expedition location a distinct signature event and profile', () => {
    const ids = ['convenience-store', 'west-pharmacy', 'apartment-402', 'auto-repair', 'school', 'subway', 'gas-station', 'hospital', 'bus-station', 'warehouse'];
    for (const id of ids) {
      const profile = locationStoryProfile(id);
      expect(profile).toBeTruthy();
      expect(profile!.features.length).toBeGreaterThanOrEqual(3);
      expect(expeditionStoryEventById(profile!.signatureEventId)?.kind).toBe('signature');
    }
  });

  it('forces the signature story on first entry without consuming RNG', () => {
    const state = activeExpedition('hospital', 910002, 17);
    const drawn = drawExpeditionEvent(state);
    expect(currentExpeditionEvent(drawn)?.id).toBe('sig-hospital-er-light');
    expect(drawn.rngState).toBe(state.rngState);
  });

  it('stops forcing the signature after it has actually been resolved', () => {
    const state = activeExpedition('hospital', 910003, 17);
    const signature = expeditionStoryEventById('sig-hospital-er-light')!;
    const resolved = applyExpeditionStoryOutcome(state, signature, 'success', 'hospital');
    expect(resolved.storyFlags).toContain(signatureSeenFlag('hospital'));
    const nextVisit = drawExpeditionEvent({ ...resolved, expeditionState: { ...resolved.expeditionState, eventId: null } });
    expect(currentExpeditionEvent(nextVisit)?.id).not.toBe('sig-hospital-er-light');
    expect(nextVisit.rngState).not.toBe(resolved.rngState);
  });

  it('retreating after seeing a signature does not mark that story completed', () => {
    const drawn = drawExpeditionEvent(activeExpedition('subway', 910004, 12));
    expect(currentExpeditionEvent(drawn)?.id).toBe('sig-subway-wind');
    const retreated = retreatExpedition(drawn);
    expect(retreated.storyFlags).not.toContain(signatureSeenFlag('subway'));
  });

  it('never mixes another location local story into the pharmacy pool', () => {
    const base = activeExpedition('west-pharmacy', 910005, 12);
    const state = { ...base, storyFlags: [...base.storyFlags, signatureSeenFlag('west-pharmacy')] };
    const pool = eligibleExpeditionStories(state, 'west-pharmacy');
    expect(pool.some((event) => event.id.startsWith('subway-') || event.id.startsWith('hospital-'))).toBe(false);
    expect(pool.some((event) => event.id.startsWith('pharmacy-'))).toBe(true);
    expect(pool.some((event) => event.kind === 'generic')).toBe(true);
  });

  it('keeps event drawing deterministic for the same seed and world state', () => {
    const a0 = activeExpedition('auto-repair', 910006, 10);
    const b0 = activeExpedition('auto-repair', 910006, 10);
    const flags = [...a0.storyFlags, signatureSeenFlag('auto-repair')];
    const a = drawExpeditionEvent({ ...a0, storyFlags: flags });
    const b = drawExpeditionEvent({ ...b0, storyFlags: flags });
    expect(currentExpeditionEvent(a)?.id).toBe(currentExpeditionEvent(b)?.id);
    expect(a.rngState).toBe(b.rngState);
  });

  it('still blocks locked locations at the logic layer', () => {
    const base = createV060InitialState(910007);
    const state: GameState = {
      ...base,
      day: 18,
      dayAssignments: { 'lin-xia': 'expedition' },
      dayState: { ...base.dayState, assignmentsLocked: true },
    };
    const result = canStartExpedition(state, ['lin-xia'], 'hospital');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('情报解锁');
  });

  it('writes evacuation-route knowledge through the subway story itself', () => {
    const state = activeExpedition('subway', 910008, 12);
    const event = expeditionStoryEventById('sig-subway-wind')!;
    const partial = applyExpeditionStoryOutcome(state, event, 'partial', 'subway');
    const success = applyExpeditionStoryOutcome(state, event, 'success', 'subway');
    expect(partial.storyFlags).toContain('subway_exit_known');
    expect(partial.storyFlags).not.toContain('evacuation_route_known');
    expect(success.storyFlags).toContain('evacuation_route_known');
  });

  it('lets location-relevant specialties reduce risk', () => {
    const base = activeExpedition('hospital', 910009, 17);
    const withoutMedical = expeditionRiskScore(base, ['lin-xia'], 'hospital');
    const withMedical: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, specialty: 'medical' as const } : survivor),
    };
    expect(expeditionRiskScore(withMedical, ['lin-xia'], 'hospital')).toBeLessThan(withoutMedical);
  });

  it('keeps permanent expedition death blocked before DAY 11 even at extreme risk', () => {
    const base = activeExpedition('hospital', 910010, 5);
    const state: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, energy: 20, condition: 'minor' as const } : survivor),
      expeditionState: { ...base.expeditionState, eventId: 'sig-hospital-er-light' },
    };
    const next = resolveExpeditionOutcome(state, 'failure', 'double-one');
    expect(next.survivors.find((survivor) => survivor.id === 'lin-xia')?.condition).not.toBe('dead');
  });

  it('still permits DAY 11+ extreme double-one expedition death', () => {
    const base = activeExpedition('hospital', 910011, 17);
    const state: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, energy: 20, condition: 'minor' as const } : survivor),
      expeditionState: { ...base.expeditionState, eventId: 'sig-hospital-er-light' },
    };
    const next = resolveExpeditionOutcome(state, 'failure', 'double-one');
    expect(next.survivors.find((survivor) => survivor.id === 'lin-xia')?.condition).toBe('dead');
    expect(next.memorials.some((entry) => entry.survivorId === 'lin-xia')).toBe(true);
  });

  it('turns apartment rescue stories into real community population', () => {
    const state = activeExpedition('apartment-402', 910012, 8);
    const event = expeditionStoryEventById('apartment-rooftop-light')!;
    const next = applyExpeditionStoryOutcome(state, event, 'success', 'apartment-402');
    expect(next.civilianResidents).toBe(2);
    expect(next.communityState.pendingResidents).toBe(2);
    expect(next.campaignStats.rescued).toBe(2);
  });

  it('makes the warehouse rare story a real final-defense preparation payoff', () => {
    const state = activeExpedition('warehouse', 910013, 25);
    const event = expeditionStoryEventById('warehouse-protection-crate')!;
    const next = applyExpeditionStoryOutcome(state, event, 'success', 'warehouse');
    expect(next.storyFlags).toContain('final_horde_supplies');
    expect(next.defense).toBeGreaterThan(state.defense);
    expect(next.inventory.materials).toBeGreaterThan(state.inventory.materials);
  });

  it('can unlock a later location from a story rather than from day number alone', () => {
    const state = activeExpedition('school', 910014, 8);
    const event = expeditionStoryEventById('school-radio-tape')!;
    const next = applyExpeditionStoryOutcome(state, event, 'success', 'school');
    expect(next.storyFlags).toContain('location_unlocked:subway');
  });
});
