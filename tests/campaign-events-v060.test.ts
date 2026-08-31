import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { upgradeBuilding } from '../src/game/v060/buildings';
import { CAMPAIGN_FIXED_EVENTS, isLocationUnlocked, locationUnlockFlag, pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { scheduleNight } from '../src/game/v060/nightScheduler';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import type { GameState } from '../src/game/types';

function stateForDay(day: number): GameState {
  const base = createV060InitialState(606600 + day);
  return { ...base, day, phase: 'street' };
}

describe('v0.6 gated campaign events', () => {
  it('fires a fixed event when a building is constructed for the first time', () => {
    const base = createV060InitialState(606601);
    const built = upgradeBuilding({ ...base, buildings: { ...base.buildings, workshop: 0 }, inventory: { ...base.inventory, materials: 20, parts: 20 } }, 'workshop');
    expect(built.buildings.workshop).toBe(1);
    expect(built.storyFlags).toContain('building_event_pending:workshop');
    const event = pendingCampaignEvent(built);
    expect(event?.id).toBe('building-workshop');
    const resolved = resolveCampaignEvent(built, event!.id);
    expect(resolved.storyFlags).not.toContain('building_event_pending:workshop');
    expect(resolved.storyFlags).toContain('fixed_event_seen:building-workshop');
  });

  it('unlocks exploration locations only after their discovery event is resolved', () => {
    const state = stateForDay(2);
    expect(isLocationUnlocked(state, 'west-pharmacy')).toBe(false);
    const event = pendingCampaignEvent(state);
    expect(event?.id).toBe('location-west-pharmacy');
    const resolved = resolveCampaignEvent(state, event!.id);
    expect(isLocationUnlocked(resolved, 'west-pharmacy')).toBe(true);
    expect(resolved.storyFlags).toContain(locationUnlockFlag('west-pharmacy'));
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
      expect(scheduled.nightState.scheduledEventIds).not.toContain('east-footsteps');
      expect(scheduled.nightState.scheduledEventIds).not.toContain('fever-resident');
    }

    const lateWithoutXiaoman = { ...stateForDay(18), phase: 'night' as const, survivors: stateForDay(18).survivors.filter((survivor) => survivor.id !== 'xiaoman') };
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
