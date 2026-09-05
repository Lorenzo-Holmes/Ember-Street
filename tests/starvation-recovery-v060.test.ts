import { describe, expect, it } from 'vitest';
import { applyOfflineProgress } from '../src/game/storage';
import { createV060InitialState, finalizeDay } from '../src/game/v060/campaign';
import { hungerAdjustedRestRecovery, previewMeal, resolveMeal } from '../src/game/v060/food';
import type { GameState } from '../src/game/types';

function energyState(energy = 60): GameState {
  const base = createV060InitialState(990501);
  return {
    ...base,
    inventory: { ...base.inventory, ration: 0 },
    survivors: base.survivors.map((survivor) => ({ ...survivor, energy, condition: 'healthy' as const })),
    dayAssignments: Object.fromEntries(base.survivors.map((survivor) => [survivor.id, 'rest' as const])),
  };
}

describe('v0.6 starvation recovery pressure', () => {
  it('grants no meal energy when ration coverage is zero', () => {
    const state = energyState(50);
    const preview = previewMeal(state);
    expect(preview.rationCoverage).toBe(0);
    expect(preview.energyRecovery).toBe(0);

    const resolved = resolveMeal(state);
    expect(resolved.survivors.every((survivor) => survivor.energy === 50)).toBe(true);
  });

  it('keeps the existing cold-food recovery when actual rations are available', () => {
    const state = {
      ...energyState(50),
      inventory: { ...energyState(50).inventory, ration: 12 },
      dayAssignments: {},
    };
    const preview = previewMeal(state);
    expect(preview.quality).toBe('cold');
    expect(preview.rationCoverage).toBe(1);
    expect(preview.energyRecovery).toBe(4);
  });

  it('sharply reduces rest after the first zero-ration night', () => {
    const state = {
      ...energyState(60),
      mealState: {
        ...energyState(60).mealState,
        quality: 'cold' as const,
        rationCoverage: 0,
        consecutiveShortageDays: 1,
      },
    };
    expect(hungerAdjustedRestRecovery(state, 24)).toBe(8);
    const resolved = finalizeDay(state);
    expect(resolved.survivors.every((survivor) => survivor.energy === 68)).toBe(true);
  });

  it('does not let prolonged zero-ration rest refill energy', () => {
    const state = {
      ...energyState(60),
      mealState: {
        ...energyState(60).mealState,
        quality: 'cold' as const,
        rationCoverage: 0,
        consecutiveShortageDays: 2,
      },
    };
    expect(hungerAdjustedRestRecovery(state, 24)).toBe(0);
    const resolved = finalizeDay(state);
    expect(resolved.survivors.every((survivor) => survivor.energy === 60)).toBe(true);
    expect(resolved.mealState.consecutiveShortageDays).toBe(3);
  });

  it('reduces partial-shortage recovery without deleting it', () => {
    const state = {
      ...energyState(60),
      mealState: {
        ...energyState(60).mealState,
        quality: 'struggling' as const,
        rationCoverage: 0.5,
        consecutiveShortageDays: 1,
      },
    };
    expect(hungerAdjustedRestRecovery(state, 24)).toBe(12);
  });

  it('does not let offline rest bypass prolonged hunger', () => {
    const state = {
      ...energyState(60),
      phase: 'street' as const,
      mealState: {
        ...energyState(60).mealState,
        quality: 'cold' as const,
        rationCoverage: 0,
        consecutiveShortageDays: 3,
      },
    };
    const resolved = applyOfflineProgress(state, 3 * 60 * 60 * 1000);
    expect(resolved.survivors.every((survivor) => survivor.energy === 60)).toBe(true);
  });
});
