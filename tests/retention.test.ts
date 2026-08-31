import { describe, expect, it } from 'vitest';
import { careForCat } from '../src/game/emotion';
import { createInitialState } from '../src/game/engine';
import { autoAssignBySpecialty } from '../src/game/management';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import { applyOfflineProgress } from '../src/game/storage';

describe('retention systems', () => {
  it('caps offline production and only produces from staffed buildings', () => {
    const base = createInitialState(99);
    const state = {
      ...base,
      phase: 'street' as const,
      day: 4,
      buildings: { ...base.buildings, searchStation: 1, workshop: 1, clinic: 1 },
      survivors: SURVIVOR_ROSTER.slice(0, 3),
      assignments: { 'lin-xia': 'search' as const, zhou: 'repair' as const, ahe: 'cook' as const },
    };
    const sixHours = applyOfflineProgress(state, 6 * 60 * 60 * 1000);
    const twelveHours = applyOfflineProgress(state, 12 * 60 * 60 * 1000);
    expect(sixHours.supplies).toBeGreaterThan(state.supplies);
    expect(sixHours.parts).toBeGreaterThan(state.parts);
    expect(twelveHours.supplies).toBe(sixHours.supplies);
    expect(twelveHours.parts).toBe(sixHours.parts);
  });

  it('does not advance offline resources while a night is active', () => {
    const state = createInitialState(11);
    expect(applyOfflineProgress(state, 6 * 60 * 60 * 1000)).toEqual(state);
  });

  it('lets the street cat progress only once per day', () => {
    const state = { ...createInitialState(12), phase: 'street' as const, day: 3, supplies: 2, catStage: 0 as const, catFedToday: false };
    const once = careForCat(state);
    const twice = careForCat(once);
    expect(once.catStage).toBe(1);
    expect(once.supplies).toBe(1);
    expect(twice.catStage).toBe(1);
    expect(twice.supplies).toBe(1);
  });

  it('can assign a grown roster by specialties with one tap', () => {
    const base = createInitialState(13);
    const state = {
      ...base,
      phase: 'street' as const,
      day: 6,
      buildings: { searchStation: 1, workshop: 1, clinic: 1, watchPost: 1, shelter: 1, radio: 1 },
      survivors: SURVIVOR_ROSTER,
      assignments: {},
    };
    const assigned = autoAssignBySpecialty(state);
    expect(assigned.assignments['lin-xia']).toBe('search');
    expect(assigned.assignments.zhou).toBe('repair');
    expect(assigned.assignments.cheng).toBe('medical');
    expect(assigned.assignments.aliang).toBe('watch');
    expect(assigned.assignments.xiaoman).toBe('radio');
  });
});
