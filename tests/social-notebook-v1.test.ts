import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SocialStatusPanel from '../src/components/v060/SocialStatusPanel';
import { createPreviewState } from '../src/ui/v1/DevScenePreview';
import { pendingCampaignEvent } from '../src/game/v060/campaignEvents';
import { pendingCommunityDeparture } from '../src/game/v060/communityDeparture';
import { acceptCommunityRequest, declineCommunityRequest, pendingCommunityRequest } from '../src/game/v060/communityPromises';
import { choosePrinciple, pendingPrincipleDecision } from '../src/game/v060/principles';

const render = (state: ReturnType<typeof createPreviewState>, compact = false) =>
  renderToStaticMarkup(createElement(SocialStatusPanel, { state, compact, onCommit: vi.fn() }));

describe('social notebook entries', () => {
  it('reproduces the day 14 decision without an earlier event intercepting it', () => {
    const state = createPreviewState('social');
    expect(pendingCampaignEvent(state)).toBeNull();
    expect(pendingCommunityDeparture(state)).toBeNull();
    expect(pendingPrincipleDecision(state)?.day).toBe(14);
    const html = render(state);
    expect(html).toContain('接近崩溃');
    expect(html).toContain('已经失控');
    expect(html).toContain('先救伤得最重的');
    expect(html).toContain('<h3>下一次出事，谁站前面？</h3>');
    expect(html).not.toContain('v6-survivor__trait');
    expect(html).not.toContain('v6-survivor__avatar-tag');
    expect(html.match(/class="v6-principle-choice"/g)).toHaveLength(3);
  });

  it('records each available principle while preserving the original state', () => {
    const state = createPreviewState('social');
    const before = JSON.stringify(state);
    for (const choice of pendingPrincipleDecision(state)!.choices) {
      const next = choosePrinciple(state, choice.id);
      expect(next.socialState?.principles).toContain(choice.id);
      expect(next.socialState?.principles).toContain('triage-first');
      expect(pendingPrincipleDecision(next)).toBeNull();
      const html = render(next);
      expect(html).toContain(choice.title);
      expect(html).not.toContain('class="v6-principle-choice"');
    }
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains the request, deadline and accept / decline paths', () => {
    const state = createPreviewState('request');
    expect(pendingCampaignEvent(state)).toBeNull();
    expect(pendingPrincipleDecision(state)).toBeNull();
    const request = pendingCommunityRequest(state)!;
    expect(request.id).toBe('request-restore-defense');
    expect(render(state)).toContain('答应下来');
    expect(render(state)).toContain('不答应');

    const accepted = acceptCommunityRequest(state, request.id);
    expect(accepted.socialState?.activePromise?.deadlineDay).toBe(state.day + 2);
    expect(render(accepted)).toContain('还剩 2 天');
    expect(render(accepted)).toContain('记在本上的承诺');
    expect(render(accepted)).not.toContain('v6-btn-pledge');

    const declined = declineCommunityRequest(state, request.id);
    expect(pendingCommunityRequest(declined)).toBeNull();
    expect(declined.socialState?.activePromise).toBeNull();
    expect(render(declined)).toContain('没有答应');
  });

  it('keeps compact records read-only while showing already agreed principles', () => {
    const html = render(createPreviewState('social'), true);
    expect(html).toContain('先救伤得最重的');
    expect(html).not.toContain('<button');
  });
});
