import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { dayAttentionSummary } from '../src/game/v060/dayAttention';
import type { GameState } from '../src/game/types';

function withStagePrinciples(base: GameState, day: number): GameState {
  const principles = day >= 21
    ? ['everyone-shares', 'community-shares-risk', 'hold-the-street'] as const
    : day >= 14
      ? ['everyone-shares', 'community-shares-risk'] as const
      : day >= 7
        ? ['everyone-shares'] as const
        : [] as const;
  return {
    ...base,
    day,
    socialState: {
      pressure: 1,
      activePromise: null,
      fulfilledPromises: 2,
      brokenPromises: 0,
      principles: [...principles],
      lastRequestDay: day,
    },
    storyFlags: [
      ...base.storyFlags,
      ...principles.map((principle) => `principle:${principle}`),
    ],
  };
}

describe('v0.6 returning-player attention', () => {
  it('keeps an ordinary DAY27 social panel routine after all stage decisions are settled', () => {
    const state = withStagePrinciples(createV060InitialState(970027), 27);
    expect(dayAttentionSummary(state).socialNeedsAttention).toBe(false);
  });

  it('promotes an active promise before routine day management', () => {
    const base = withStagePrinciples(createV060InitialState(970020), 20);
    const state: GameState = {
      ...base,
      socialState: {
        ...base.socialState!,
        activePromise: {
          id: 'promise:hot-meal:street:19',
          kind: 'hot-meal',
          title: '至少让孩子吃顿热的',
          createdDay: 19,
          deadlineDay: 21,
          status: 'active',
        },
      },
    };
    expect(dayAttentionSummary(state).socialNeedsAttention).toBe(true);
  });

  it('promotes a pending stage principle', () => {
    const base = createV060InitialState(970014);
    const state: GameState = {
      ...base,
      day: 14,
      socialState: {
        pressure: 0,
        activePromise: null,
        fulfilledPromises: 0,
        brokenPromises: 0,
        principles: ['everyone-shares'],
        lastRequestDay: 14,
      },
    };
    expect(dayAttentionSummary(state).socialNeedsAttention).toBe(true);
  });

  it('promotes an unselected resident rotation but quiets it after the mode is chosen', () => {
    const base = withStagePrinciples(createV060InitialState(970018), 18);
    const common: GameState = {
      ...base,
      civilianResidents: 6,
      storyFlags: [...base.storyFlags, 'community_rotation_unlocked'],
      communityState: { pendingResidents: 0, activeResidents: 6, supportMode: null },
    };
    expect(dayAttentionSummary(common).communityNeedsChoice).toBe(true);
    expect(dayAttentionSummary({
      ...common,
      communityState: { ...common.communityState!, supportMode: 'logistics', lastSupportDay: 18 },
    }).communityNeedsChoice).toBe(false);
  });

  it('counts missing and critical people explicitly and keeps build opportunities visible', () => {
    const base = withStagePrinciples(createV060InitialState(970019), 19);
    const state: GameState = {
      ...base,
      inventory: { ...base.inventory, materials: 30, parts: 20 },
      survivors: base.survivors.map((survivor, index) => index === 0
        ? { ...survivor, condition: 'missing' as const }
        : index === 1
          ? { ...survivor, condition: 'critical' as const }
          : survivor),
    };
    const attention = dayAttentionSummary(state);
    expect(attention.missingCount).toBe(1);
    expect(attention.criticalCount).toBe(1);
    expect(attention.buildableCount).toBeGreaterThan(0);
  });
});
