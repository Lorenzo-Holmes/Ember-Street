import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { assignDayJob } from '../src/game/v060/dayManagement';
import { previewMeal, resolveMeal } from '../src/game/v060/food';

describe('v0.6 food sustainability pass', () => {
  it('lets a staffed kitchen stretch one ration across the three-person opening group', () => {
    const base = createV060InitialState(860901);
    const withoutCook = { ...base, inventory: { ...base.inventory, ration: 2 } };
    const coldPreview = previewMeal(withoutCook);
    expect(coldPreview.residentCount).toBe(3);
    expect(coldPreview.rationStretch).toBe(0);
    expect(coldPreview.rationNeeded).toBe(3);
    expect(coldPreview.rationCoverage).toBeCloseTo(2 / 3);

    const withCook = assignDayJob(withoutCook, 'ahe', 'cook');
    const cookedPreview = previewMeal(withCook);
    expect(cookedPreview.rationStretch).toBe(1);
    expect(cookedPreview.rationNeeded).toBe(2);
    expect(cookedPreview.rationConsumed).toBe(2);
    expect(cookedPreview.rationCoverage).toBe(1);
  });

  it('never creates food from an empty pantry', () => {
    const base = createV060InitialState(860902);
    const withCook = assignDayJob({ ...base, inventory: { ...base.inventory, ration: 0 } }, 'ahe', 'cook');
    const preview = previewMeal(withCook);
    expect(preview.rationStretch).toBe(0);
    expect(preview.rationCoverage).toBe(0);
    expect(preview.rationConsumed).toBe(0);
  });

  it('caps mature-community savings at two portions and consumes the reduced ration need', () => {
    const base = createV060InitialState(860903);
    const crowded = {
      ...base,
      civilianResidents: 7,
      buildings: { ...base.buildings, shelter: 3 },
      inventory: { ...base.inventory, ration: 20 },
    };
    const withCook = assignDayJob(crowded, 'ahe', 'cook');
    const preview = previewMeal(withCook);
    expect(preview.residentCount).toBe(10);
    expect(preview.rationStretch).toBe(2);
    expect(preview.rationNeeded).toBe(8);

    const resolved = resolveMeal(withCook);
    expect(resolved.inventory.ration).toBe(12);
  });
});
