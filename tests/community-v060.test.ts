import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState, finalizeDay } from '../src/game/v060/campaign';
import {
  communityCookingSupport,
  communityDefenseSupport,
  communityRepairSupport,
  rescueCommunityResidents,
  selectCommunitySupportMode,
} from '../src/game/v060/community';
import { canTakeDayAssignment } from '../src/game/v060/dayManagement';
import { previewMeal } from '../src/game/v060/food';
import { emergencyRisk } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function withCommunity(activeResidents: number, pendingResidents = 0): GameState {
  const state = createV060InitialState(606060);
  return {
    ...state,
    civilianResidents: activeResidents + pendingResidents,
    communityState: { pendingResidents, activeResidents, supportMode: null },
    inventory: { ...state.inventory, ration: 50, power: 60 },
  };
}

describe('v0.6 community support', () => {
  it('rescued residents count immediately but remain pending on rescue day', () => {
    const state = rescueCommunityResidents(createV060InitialState(1));
    expect(state.civilianResidents).toBe(1);
    expect(state.communityState.pendingResidents).toBe(1);
    expect(state.communityState.activeResidents).toBe(0);
    expect(state.hope).toBe(21);
  });

  it('moves pending residents into active community labor on the next day', () => {
    const rescued = rescueCommunityResidents(createV060InitialState(2));
    const next = advanceCampaignDay(rescued);
    expect(next.day).toBe(2);
    expect(next.communityState.pendingResidents).toBe(0);
    expect(next.communityState.activeResidents).toBe(1);
  });

  it('does not allow a rotation mode below five active residents', () => {
    const state = selectCommunitySupportMode(withCommunity(4), 'logistics');
    expect(state.communityState.supportMode).toBeNull();
  });

  it('unlocks the duty roster at five active residents', () => {
    const start = { ...withCommunity(0, 5), day: 1 };
    const next = advanceCampaignDay(start);
    expect(next.communityState.activeResidents).toBe(5);
    expect(next.storyFlags).toContain('community_rotation_unlocked');
    expect(next.storyFlags).toContain('community_event_duty_roster');
    const selected = selectCommunitySupportMode(next, 'repair');
    expect(selected.communityState.supportMode).toBe('repair');
    expect(selected.communityState.lastSupportDay).toBe(next.day);
  });

  it('logistics rotation clearly raises meal cooking capacity', () => {
    const base = withCommunity(6);
    const normalMeal = previewMeal(base);
    const logisticsMeal = previewMeal(selectCommunitySupportMode(base, 'logistics'));
    expect(logisticsMeal.cookingCapacity).toBeGreaterThan(normalMeal.cookingCapacity);
    expect(logisticsMeal.cookingCapacity).toBeGreaterThan(0);
  });

  it('shelter Lv3 makes community logistics stronger than Lv1', () => {
    const base = selectCommunitySupportMode(withCommunity(6), 'logistics');
    const lv1 = communityCookingSupport({ ...base, buildings: { ...base.buildings, shelter: 1 } });
    const lv3 = communityCookingSupport({ ...base, buildings: { ...base.buildings, shelter: 3 } });
    expect(lv3).toBeGreaterThan(lv1);
  });

  it('repair rotation adds bounded defense during finalizeDay', () => {
    const base = withCommunity(8);
    const normal = finalizeDay({ ...base, defense: 50 });
    const repair = finalizeDay({ ...selectCommunitySupportMode(base, 'repair'), defense: 50 });
    expect(repair.defense).toBeGreaterThan(normal.defense);
    expect(repair.defense).toBeLessThanOrEqual(100);
  });

  it('defense rotation lowers emergency risk', () => {
    const base = { ...withCommunity(9), day: 18, defense: 35, inventory: { ...withCommunity(9).inventory, power: 25 } };
    const focused = selectCommunitySupportMode(base, 'defense');
    expect(emergencyRisk(focused)).toBeLessThan(emergencyRisk(base));
  });

  it('ordinary residents are not Survivor entities and cannot be assigned to expeditions', () => {
    const state = withCommunity(10);
    expect(state.survivors.some((s) => s.id === 'community-resident-1')).toBe(false);
    expect(canTakeDayAssignment(state, 'community-resident-1', 'expedition').allowed).toBe(false);
  });

  it('community support functions and final defense stay clamped', () => {
    const huge = selectCommunitySupportMode(withCommunity(999), 'repair');
    expect(communityCookingSupport({ ...huge, communityState: { ...huge.communityState, supportMode: 'logistics', lastSupportDay: huge.day } })).toBeLessThanOrEqual(8);
    expect(communityRepairSupport(huge)).toBeLessThanOrEqual(6);
    expect(communityDefenseSupport({ ...huge, communityState: { ...huge.communityState, supportMode: 'defense', lastSupportDay: huge.day } })).toBeLessThanOrEqual(0.12);
    expect(finalizeDay({ ...huge, defense: 99 }).defense).toBe(100);
  });
});
