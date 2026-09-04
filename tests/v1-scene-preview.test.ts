import { describe, expect, it } from 'vitest';
import { pendingCampaignEvent } from '../src/game/v060/campaignEvents';
import { createPreviewState, type PreviewScene } from '../src/ui/v1/DevScenePreview';

describe('v1 development scene previews', () => {
  it('builds every preview without using the current save', () => {
    const expected: Record<PreviewScene, string> = {
      home: 'street',
      defense: 'street',
      'defense-dusk': 'dusk',
      'defense-dawn': 'summary',
      event: 'street',
      social: 'street',
      request: 'street',
      missing: 'assignment',
      dusk: 'dusk',
      night: 'night',
      dice: 'night',
      horde: 'night',
      'night-summary': 'night-summary',
      dawn: 'summary',
      ending: 'ending',
    };
    for (const [scene, phase] of Object.entries(expected) as Array<[PreviewScene, string]>) {
      expect(createPreviewState(scene).phase).toBe(phase);
    }
  });

  it('provides the special states needed for copy and layout checks', () => {
    expect(pendingCampaignEvent(createPreviewState('event'))).toBeTruthy();
    expect(createPreviewState('missing').survivors.some((survivor) => survivor.condition === 'missing')).toBe(true);
    expect(createPreviewState('dice').pendingCheck).toBeTruthy();
    expect(createPreviewState('horde').nightState.hordeActive).toBe(true);
    expect(createPreviewState('ending').ending?.id).toBe('E02');
  });
});
