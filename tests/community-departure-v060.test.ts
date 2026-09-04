import { describe, expect, it } from 'vitest';
import { advanceCampaignDay, createV060InitialState } from '../src/game/v060/campaign';
import {
  communityDepartureRisk,
  pendingCommunityDeparture,
  queueCommunityDeparture,
  resolveCommunityDeparture,
} from '../src/game/v060/communityDeparture';
import { pendingLowHopeDepartureId } from '../src/game/v060/mortality';
import type { GameState } from '../src/game/types';

function stressedCommunity(seed = 7): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 9,
    phase: 'street',
    rngState: seed,
    hope: 8,
    defense: 24,
    civilianResidents: 6,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'defense', lastSupportDay: 9 },
    mealState: { ...base.mealState, quality: 'struggling', consecutiveShortageDays: 3 },
    socialState: { ...base.socialState!, pressure: 6 },
    inventory: { ...base.inventory, ration: 12 },
  };
}

describe('v0.6 community departure', () => {
  it('combines existing hope, food, pressure and defense signals into departure risk', () => {
    const state = stressedCommunity();
    expect(communityDepartureRisk(state)).toBe(7);
    expect(communityDepartureRisk({ ...state, hope: 80, defense: 80, mealState: { ...state.mealState, consecutiveShortageDays: 0 }, socialState: { ...state.socialState!, pressure: 0 } })).toBe(0);
  });

  it('queues at most one civilian departure crisis and does not stack a core-survivor departure on the same dawn', () => {
    const base = { ...stressedCommunity(7), day: 8, phase: 'summary' as const };
    const next = advanceCampaignDay(base);
    const pending = pendingCommunityDeparture(next);
    expect(pending).not.toBeNull();
    expect(pending?.count).toBe(2);
    expect(pending?.reason).toBe('food');
    expect(next.storyFlags.filter((flag) => flag === 'community_departure_checked:9')).toHaveLength(1);
    expect(pendingLowHopeDepartureId(next)).toBeNull();

    const duplicate = queueCommunityDeparture(next);
    expect(duplicate.rngState).toBe(next.rngState);
    expect(duplicate.storyFlags.filter((flag) => flag.startsWith('community_departure_pending:'))).toHaveLength(1);
  });

  it('letting residents leave reduces community labor but not campaign deaths', () => {
    const queued = queueCommunityDeparture(stressedCommunity(7));
    const beforeDeaths = queued.campaignStats.deaths;
    const resolved = resolveCommunityDeparture(queued, 'leave');

    expect(resolved.civilianResidents).toBe(4);
    expect(resolved.communityState.activeResidents).toBe(4);
    expect(resolved.communityState.supportMode).toBeNull();
    expect(resolved.campaignStats.deaths).toBe(beforeDeaths);
    expect(resolved.campaignStats.civilianDepartures).toBe(2);
    expect(resolved.storyFlags.some((flag) => flag.startsWith('civilian_departure:9:food:2'))).toBe(true);
    expect(pendingCommunityDeparture(resolved)).toBeNull();
    expect(resolved.dawnBrief?.at(-1)).toContain('2 名街区居民离开');
  });

  it('spending rations can keep the residents without changing population', () => {
    const queued = queueCommunityDeparture(stressedCommunity(7));
    const pending = pendingCommunityDeparture(queued)!;
    const beforePressure = queued.socialState!.pressure;
    const resolved = resolveCommunityDeparture(queued, 'ration');

    expect(resolved.civilianResidents).toBe(6);
    expect(resolved.inventory.ration).toBe(12 - pending.rationCost);
    expect(resolved.campaignStats.civilianDepartures).toBe(0);
    expect(resolved.socialState!.pressure).toBeLessThan(beforePressure);
    expect(pendingCommunityDeparture(resolved)).toBeNull();
    expect(resolved.dawnBrief?.at(-1)).toContain('暂时留下');
  });

  it('does not clear a pending departure when the street cannot afford the ration response', () => {
    const queued = queueCommunityDeparture({ ...stressedCommunity(7), inventory: { ...stressedCommunity(7).inventory, ration: 1 } });
    const resolved = resolveCommunityDeparture(queued, 'ration');
    expect(pendingCommunityDeparture(resolved)).not.toBeNull();
    expect(resolved.civilianResidents).toBe(6);
    expect(resolved.inventory.ration).toBe(1);
  });
});
