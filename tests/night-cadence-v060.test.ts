import { describe, expect, it } from 'vitest';
import { nightAnchorCategories, normalNightEventBudget } from '../src/game/v060/nightScheduler';

describe('v0.6 night cadence', () => {
  it('starts quieter and ramps toward the final week', () => {
    expect(normalNightEventBudget(1)).toBe(2);
    expect(normalNightEventBudget(5)).toBe(2);
    expect(normalNightEventBudget(6)).toBe(3);
    expect(normalNightEventBudget(23)).toBe(3);
    expect(normalNightEventBudget(24)).toBe(4);
    expect(normalNightEventBudget(28)).toBe(4);
  });

  it('rotates forced category anchors instead of requiring all three every night', () => {
    expect(nightAnchorCategories(1)).toEqual(['threat', 'survivor']);
    expect(nightAnchorCategories(2)).toEqual(['infrastructure', 'threat']);
    expect(nightAnchorCategories(3)).toEqual(['survivor', 'infrastructure']);
    expect(nightAnchorCategories(4)).toEqual(['threat', 'survivor']);
  });
});
