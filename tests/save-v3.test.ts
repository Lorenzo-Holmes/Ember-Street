import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/engine';
import { promoteV2ToV3 } from '../src/game/storage/migrations';

describe('GameState v3 migration', () => {
  it('moves legacy resources into the v0.6 inventory without losing campaign state', () => {
    const fresh = createInitialState(6060);
    const legacy = {
      ...fresh,
      version: 2,
      day: 18,
      supplies: 11,
      medicine: 4,
      power: 47,
      parts: 9,
      hope: 26,
      storyFlags: ['pharmacy_basement'],
    } as Record<string, unknown>;

    delete legacy.inventory;
    delete legacy.storyItems;
    delete legacy.mainLightStage;
    delete legacy.dayAssignments;
    delete legacy.dayState;
    delete legacy.expeditionState;
    delete legacy.mealState;
    delete legacy.nightState;
    delete legacy.campaignStats;
    delete legacy.ending;

    const migrated = promoteV2ToV3(legacy);
    expect(migrated?.version).toBe(3);
    expect(migrated?.day).toBe(18);
    expect(migrated?.hope).toBe(26);
    expect(migrated?.storyFlags).toContain('pharmacy_basement');
    expect(migrated?.inventory).toEqual({ ration: 11, medicine: 4, power: 47, materials: 0, parts: 9 });
    expect(migrated?.nightState.eventTotal).toBe(5);
  });

  it('maps legacy roles and injuries into the new assignment and condition foundations', () => {
    const fresh = createInitialState(7070);
    const legacy = {
      ...fresh,
      version: 2,
      survivors: [{ id: 'legacy-scout', name: '旧搜索员', specialty: 'search', energy: 30, mood: 'steady', perk: '旧档', injury: 'minor' }],
      assignments: { 'legacy-scout': 'search' },
    } as Record<string, unknown>;

    delete legacy.inventory;
    delete legacy.storyItems;
    delete legacy.mainLightStage;
    delete legacy.dayAssignments;
    delete legacy.dayState;
    delete legacy.expeditionState;
    delete legacy.mealState;
    delete legacy.nightState;
    delete legacy.campaignStats;
    delete legacy.ending;

    const migrated = promoteV2ToV3(legacy);
    expect(migrated?.dayAssignments['legacy-scout']).toBe('expedition');
    expect(migrated?.survivors[0]?.condition).toBe('minor');
    expect(migrated?.survivors[0]?.trust).toBe(0);
  });
});
