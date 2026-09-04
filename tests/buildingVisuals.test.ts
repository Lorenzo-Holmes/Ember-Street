import { describe, expect, it } from 'vitest';
import { V060_BUILDINGS } from '../src/game/v060/buildings';
import {
  BUILDING_VISUALS,
  PENDING_BUILDING_VISUAL_IDS,
  buildingSceneStatus,
  buildingSceneStyle,
} from '../src/ui/buildingVisuals';

describe('building visual registry', () => {
  it('covers every gameplay facility exactly once', () => {
    expect(Object.keys(BUILDING_VISUALS).sort()).toEqual(Object.keys(V060_BUILDINGS).sort());
  });

  it('keeps the approved shelter art live without borrowing exploration-location art', () => {
    expect(buildingSceneStatus('shelter')).toBe('ready');
    expect(buildingSceneStyle('shelter')).toBeDefined();
    expect(PENDING_BUILDING_VISUAL_IDS).not.toContain('shelter');
  });

  it('does not render an asset path until that facility art has actually been approved', () => {
    for (const id of PENDING_BUILDING_VISUAL_IDS) {
      expect(BUILDING_VISUALS[id].path).toMatch(/^\/assets\/buildings\/.+\.webp$/);
      expect(buildingSceneStyle(id)).toBeUndefined();
    }
  });
});
