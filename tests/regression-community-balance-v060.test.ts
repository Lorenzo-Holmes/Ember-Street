import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { rescueCommunityResidents, selectCommunitySupportMode } from '../src/game/v060/community';
import { previewMeal } from '../src/game/v060/food';

describe('v0.6 community burden regression', () => {
  it('keeps rescued residents as an immediate food burden and does not let logistics fully erase that population cost', () => {
    let state = createV060InitialState(606901);
    state = { ...state, inventory: { ...state.inventory, ration: 50 } };

    for (let index = 0; index < 6; index += 1) state = rescueCommunityResidents(state);
    const pendingMeal = previewMeal(state);
    expect(pendingMeal.residentCount).toBe(9);
    expect(pendingMeal.rationNeeded).toBe(9);
    expect(pendingMeal.cookingCapacity).toBe(0);

    state = {
      ...state,
      storyFlags: [...state.storyFlags, 'community_rotation_unlocked'],
      communityState: { pendingResidents: 0, activeResidents: 6, supportMode: null },
    };
    const logistics = selectCommunitySupportMode(state, 'logistics');
    const supportedMeal = previewMeal(logistics);
    expect(supportedMeal.cookingCapacity).toBeGreaterThan(0);
    expect(supportedMeal.cookingCapacity).toBeLessThan(supportedMeal.residentCount);
    expect(supportedMeal.rationNeeded).toBe(9);
    expect(supportedMeal.quality).not.toBe('well-fed');
  });
});
