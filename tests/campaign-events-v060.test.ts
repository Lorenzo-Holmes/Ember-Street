import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { upgradeBuilding } from '../src/game/v060/buildings';
import { CAMPAIGN_FIXED_EVENTS, isLocationUnlocked, locationUnlockFlag, pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { availableExpeditionLocations, canStartExpedition, startExpedition } from '../src/game/v060/expedition';
import { scheduleNight } from '../src/game/v060/nightScheduler';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import type { GameState } from '../src/game/types';

function stateForDay(day: number): GameState {
  const base = createV060InitialState(606600 + day);
  return { ...base, day, phase: 'street' };
}

describe('v0.6 gated campaign events', () => {
  it('fires the workshop fixed event once on Lv0 -> Lv1 and never again on Lv1 -> Lv2', () => {
    const base = createV060InitialState(606601);
    const buildable = { ...base, buildings: { ...base.buildings, workshop: 0 }, inventory: { ...base.inventory, materials: 40, parts: 40 } };
    const built = upgradeBuilding(buildable, 'workshop');
    expect(built.buildings.workshop).toBe(1);
    expect(built.storyFlags).toContain('building_event_pending:workshop');

    const event = pendingCampaignEvent(built);
    expect(event?.id).toBe('building-workshop');
    const resolved = resolveCampaignEvent(built, event!.id);
    expect(resolved.storyFlags).not.toContain('building_event_pending:workshop');
    expect(resolved.storyFlags).toContain('fixed_event_seen:building-workshop');
    expect(pendingCampaignEvent(resolved)?.id).not.toBe('building-workshop');

    const upgraded = upgradeBuilding(resolved, 'workshop');
    expect(upgraded.buildings.workshop).toBe(2);
    expect(upgraded.storyFlags).not.toContain('building_event_pending:workshop');
    expect(pendingCampaignEvent(upgraded)?.id).not.toBe('building-workshop');
  });

  it('blocks west-pharmacy in both location lists and startExpedition until its discovery event is resolved', () => {
    const state = {
      ...stateForDay(20),
      dayAssignments: { 'lin-xia': 'expedition' as const },
    };
    expect(isLocationUnlocked(state, 'west-pharmacy')).toBe(false);
    expect(availableExpeditionLocations(state).map((location) => location.id)).not.toContain('west-pharmacy');
    expect(canStartExpedition(state, ['lin-xia'], 'west-pharmacy').allowed).toBe(false);
    expect(startExpedition(state, ['lin-xia'], 'west-pharmacy').expeditionState.departed).toBe(false);

    const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.id === 'location-west-pharmacy')!;
    const resolved = resolveCampaignEvent(state, event.id);
    expect(isLocationUnlocked(resolved, 'west-pharmacy')).toBe(true);
    expect(resolved.storyFlags).toContain(locationUnlockFlag('west-pharmacy'));
    expect(availableExpeditionLocations(resolved).map((location) => location.id)).toContain('west-pharmacy');
    expect(canStartExpedition(resolved, ['lin-xia'], 'west-pharmacy').allowed).toBe(true);
    expect(startExpedition(resolved, ['lin-xia'], 'west-pharmacy').expeditionState.departed).toBe(true);
  });

  it('shows character events only after that character has been collected', () => {
    const withoutCheng = {
      ...stateForDay(6),
      storyFlags: [locationUnlockFlag('west-pharmacy'), locationUnlockFlag('apartment-402'), locationUnlockFlag('auto-repair')],
    };
    expect(pendingCampaignEvent(withoutCheng)?.id).not.toBe('character-cheng');
    const cheng = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'cheng')!;
    const withCheng = { ...withoutCheng, survivors: [...withoutCheng.survivors, { ...cheng }] };
    expect(pendingCampaignEvent(withCheng)?.id).toBe('character-cheng');
  });

  it('does not schedule named character night events before those characters are present', () => {
    const early = { ...stateForDay(5), phase: 'night' as const };
    for (let seed = 1; seed <= 40; seed += 1) {
      const scheduled = scheduleNight({ ...early, rngState: seed });
      expect(scheduled.nightState.scheduledEventIds).not.toContain('fever-resident');
    }

    const lateWithoutXiaoman = {
      ...stateForDay(18),
      phase: 'night' as const,
      buildings: { ...stateForDay(18).buildings, radio: 1 },
      survivors: stateForDay(18).survivors.filter((survivor) => survivor.id !== 'xiaoman'),
    };
    for (let seed = 41; seed <= 80; seed += 1) {
      const scheduled = scheduleNight({ ...lateWithoutXiaoman, rngState: seed });
      expect(scheduled.nightState.scheduledEventIds).not.toContain('military-burst');
    }
  });

  it('keeps every fixed event id unique', () => {
    const ids = CAMPAIGN_FIXED_EVENTS.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
