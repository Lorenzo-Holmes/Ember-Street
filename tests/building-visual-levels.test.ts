import { describe, expect, it } from 'vitest';
import { buildingVisual, visualAssetStyle } from '../src/ui/visualAssets';

describe('level-specific building visuals', () => {
  it('keeps Lv0 on the Lv1 visual and selects all three shelter levels', () => {
    expect(buildingVisual('shelter', 0)?.canonicalId).toBe('A06');
    expect(buildingVisual('shelter', 1)?.canonicalId).toBe('A06');
    expect(buildingVisual('shelter', 2)?.canonicalId).toBe('A45');
    expect(buildingVisual('shelter', 3)?.canonicalId).toBe('A46');
  });

  it('selects exact level visuals for every other facility', () => {
    expect([1, 2, 3].map((level) => buildingVisual('searchStation', level)?.canonicalId)).toEqual(['A30', 'A31', 'A32']);
    expect([1, 2, 3].map((level) => buildingVisual('workshop', level)?.canonicalId)).toEqual(['A33', 'A34', 'A35']);
    expect([1, 2, 3].map((level) => buildingVisual('clinic', level)?.canonicalId)).toEqual(['A36', 'A37', 'A38']);
    expect([1, 2, 3].map((level) => buildingVisual('watchPost', level)?.canonicalId)).toEqual(['A39', 'A40', 'A41']);
    expect([1, 2, 3].map((level) => buildingVisual('radio', level)?.canonicalId)).toEqual(['A42', 'A43', 'A44']);
  });

  it('maps the first and last new assets onto the two building sprite sheets', () => {
    expect(visualAssetStyle(buildingVisual('searchStation', 1))).toMatchObject({
      backgroundImage: 'url(/assets/canonical/buildings-a.webp)',
      backgroundSize: '300% 300%',
      backgroundPosition: '0% 0%',
    });
    expect(visualAssetStyle(buildingVisual('shelter', 3))).toMatchObject({
      backgroundImage: 'url(/assets/canonical/buildings-b.webp)',
      backgroundSize: '300% 300%',
      backgroundPosition: '50% 100%',
    });
  });
});
