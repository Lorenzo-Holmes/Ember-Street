import { describe, expect, it } from 'vitest';
import { createV060InitialState, finalHordeResultFor } from '../src/game/v060/campaign';
import { ENDINGS, resolveEnding } from '../src/game/v060/endings';
import type { EndingId, GameState } from '../src/game/types';

function matureState(): GameState {
  const state = createV060InitialState(6060);
  return {
    ...state,
    day: 30,
    phase: 'ending',
    survivors: [
      { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 80, mood: 'bright', perk: '', trust: 3, condition: 'healthy' },
      { id: 'zhou', name: '老周', specialty: 'repair', energy: 80, mood: 'steady', perk: '', trust: 3, condition: 'healthy' },
      { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 80, mood: 'bright', perk: '', trust: 3, condition: 'healthy' },
      { id: 'cheng', name: '程医生', specialty: 'medical', energy: 80, mood: 'steady', perk: '', trust: 3, condition: 'healthy' },
      { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 80, mood: 'steady', perk: '', trust: 3, condition: 'healthy' },
      { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 80, mood: 'bright', perk: '', trust: 3, condition: 'healthy' },
    ],
    buildings: { searchStation: 3, workshop: 3, clinic: 3, watchPost: 3, shelter: 3, radio: 3 },
    hope: 80,
    defense: 85,
    inventory: { ...state.inventory, power: 80 },
    campaignStats: { ...state.campaignStats, rescued: 8 },
    storyFlags: ['v060_started', 'kept_main_light_on', 'external_contact', 'military_contact'],
    finalHordeResult: 'perfect',
  };
}

function endingState(id: EndingId): GameState {
  const base = matureState();
  if (id === 'E13') return base;
  if (id === 'E04') return { ...base, campaignStats: { ...base.campaignStats, rescued: 3 }, storyFlags: ['v060_started'], finalHordeResult: 'held', buildings: { ...base.buildings, radio: 1 } };
  if (id === 'E03') return { ...base, survivors: base.survivors.map((s, i) => ({ ...s, trust: i < 2 ? 2 : 1 })), campaignStats: { ...base.campaignStats, rescued: 6 }, hope: 48, storyFlags: ['v060_started', 'external_contact'], finalHordeResult: 'held' };
  if (id === 'E01') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 1 })), campaignStats: { ...base.campaignStats, rescued: 5 }, buildings: { ...base.buildings, radio: 2 }, hope: 45, storyFlags: ['v060_started', 'military_contact'], finalHordeResult: 'held' };
  if (id === 'E02') return { ...base, survivors: base.survivors.map((s) => ({ ...s, trust: 1 })), campaignStats: { ...base.campaignStats, rescued: 2 }, buildings: { ...base.buildings, radio: 1 }, storyFlags: ['v060_started'], finalHordeResult: 'held' };
  if (id === 'E12') return { ...base, survivors: base.survivors.map((s, i) => ({ ...s, condition: i < 2 ? 'healthy' as const : 'dead' as const, trust: 0 })), hope: 25, campaignStats: { ...base.campaignStats, rescued: 0 }, buildings: { searchStation: 1, workshop: 1, clinic: 0, watchPost: 1, shelter: 1, radio: 0 }, storyFlags: ['v060_started', 'kept_main_light_on'], finalHordeResult: 'damaged' };
  if (id === 'E11') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 25, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started'], finalHordeResult: 'breached' };
  if (id === 'E09') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 25, campaignStats: { ...base.campaignStats, rescued: 0 }, inventory: { ...base.inventory, power: 2 }, storyFlags: ['v060_started', 'main_light_went_dark'], finalHordeResult: 'damaged' };
  if (id === 'E10') return { ...base, survivors: base.survivors.map((s, i) => ({ ...s, condition: i === 0 ? 'healthy' as const : 'dead' as const, trust: 0 })), hope: 8, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started'], inventory: { ...base.inventory, power: 40 }, finalHordeResult: 'damaged' };
  if (id === 'E06') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 30, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started', 'evacuation_route_known'], buildings: { searchStation: 2, workshop: 1, clinic: 1, watchPost: 1, shelter: 2, radio: 1 }, finalHordeResult: 'damaged' };
  if (id === 'E07') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 30, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started'], buildings: { searchStation: 2, workshop: 1, clinic: 1, watchPost: 1, shelter: 2, radio: 3 }, finalHordeResult: 'damaged' };
  if (id === 'E08') return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 35, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started'], buildings: { searchStation: 2, workshop: 1, clinic: 1, watchPost: 1, shelter: 2, radio: 1 }, finalHordeResult: 'held' };
  return { ...base, survivors: base.survivors.slice(0, 4).map((s) => ({ ...s, trust: 0 })), hope: 24, campaignStats: { ...base.campaignStats, rescued: 0 }, storyFlags: ['v060_started'], buildings: { searchStation: 1, workshop: 1, clinic: 1, watchPost: 1, shelter: 1, radio: 1 }, finalHordeResult: 'held' };
}

describe('v0.6 endings', () => {
  it('defines exactly thirteen endings', () => expect(Object.keys(ENDINGS)).toHaveLength(13));
  for (const id of Object.keys(ENDINGS) as EndingId[]) {
    it(`makes ${id} reachable`, () => expect(resolveEnding(endingState(id)).id).toBe(id));
  }
});

describe('DAY 29 final horde grade', () => {
  it('can grade a strong street as perfect', () => expect(finalHordeResultFor(matureState())).toBe('perfect'));
  it('can grade a broken street as breached', () => {
    const state = matureState();
    expect(finalHordeResultFor({ ...state, defense: 5, hope: 5, survivors: state.survivors.map((s, i) => ({ ...s, condition: i ? 'dead' as const : 'healthy' as const })) })).toBe('breached');
  });
});
