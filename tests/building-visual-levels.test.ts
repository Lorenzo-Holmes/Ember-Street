import { describe, expect, it } from 'vitest';
import { buildingVisual, visualAssetStyle, type VisualAsset } from '../src/ui/visualAssets';

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

  it('has sprite coordinates ready for the reserved A30-A46 building sheets', () => {
    const routeLv1: VisualAsset = { canonicalId: 'A30', kind: 'building', title: '路线屋 · Lv1', gameplayId: 'searchStation', level: 1, status: 'locked' };
    const shelterLv3: VisualAsset = { canonicalId: 'A46', kind: 'building', title: '宿营屋 · Lv3', gameplayId: 'shelter', level: 3, status: 'locked' };

    expect(visualAssetStyle(routeLv1)).toMatchObject({
      backgroundImage: 'url(/assets/canonical/buildings-a.webp)',
      backgroundSize: '300% 300%',
      backgroundPosition: '0% 0%',
    });
    expect(visualAssetStyle(shelterLv3)).toMatchObject({
      backgroundImage: 'url(/assets/canonical/buildings-b.webp)',
      backgroundSize: '300% 300%',
      backgroundPosition: '50% 100%',
    });
  });
});
