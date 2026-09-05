import { describe, expect, it } from 'vitest';
import { buildingVisual } from '../src/ui/visualAssets';

describe('level-specific building visuals', () => {
  it('uses the locked shelter Lv1 master for Lv0 and Lv1', () => {
    expect(buildingVisual('shelter', 0)?.canonicalId).toBe('A06');
    expect(buildingVisual('shelter', 1)?.canonicalId).toBe('A06');
  });

  it('falls back safely while higher-level shelter art is not imported yet', () => {
    expect(buildingVisual('shelter', 2)?.canonicalId).toBe('A06');
    expect(buildingVisual('shelter', 3)?.canonicalId).toBe('A06');
  });

  it('does not invent a visual for buildings that have no locked canonical asset yet', () => {
    expect(buildingVisual('searchStation', 1)).toBeUndefined();
    expect(buildingVisual('workshop', 2)).toBeUndefined();
    expect(buildingVisual('clinic', 3)).toBeUndefined();
    expect(buildingVisual('watchPost', 1)).toBeUndefined();
    expect(buildingVisual('radio', 2)).toBeUndefined();
  });
});
