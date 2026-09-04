import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createV060InitialState, advanceCampaignDay, finalizeDay } from '../src/game/v060/campaign';
import { beginDefenseNight, defenseCondition, defenseRiskNotes, guardCoverageLabel, normalizeDefenseNight } from '../src/game/v060/defenseFeedback';
import { previewNightPreparation } from '../src/game/v060/dayManagement';
import { appendDawnBrief, dawnBriefEntries } from '../src/game/v060/morningBrief';
import { emergencyRisk, scheduleNight } from '../src/game/v060/nightScheduler';
import { promoteV2ToV3 } from '../src/game/storage/migrations';
import DefensePanel from '../src/ui/v1/DefensePanel';
import HomeBaseView from '../src/ui/v1/HomeBaseView';
import { DuskV1 } from '../src/ui/v1/StoryPhasesV1';
import { createPreviewState } from '../src/ui/v1/DevScenePreview';
import { pendingCampaignEvent } from '../src/game/v060/campaignEvents';
import { pendingCommunityRequest } from '../src/game/v060/communityPromises';
import { pendingPrincipleDecision } from '../src/game/v060/principles';
import type { GameState } from '../src/game/types';

const base = () => ({ ...createV060InitialState(606060), day: 8 });
const renderPanel = (state: GameState, context: 'home' | 'dusk' | 'dawn' = 'home') => renderToStaticMarkup(createElement(DefensePanel, { state, context }));

describe('defense night records', () => {
  it('starts with the actual defense at nightfall and retains both damage and reinforcement', () => {
    const start = scheduleNight({ ...base(), defense: 36 });
    expect(start.defenseNight).toEqual({ day: 8, start: 36, end: 36, reinforced: 0, damaged: 0, complete: true });
    const damaged = appendDawnBrief(start, { ...start, defense: 26 }, '北门遭到撞击');
    const repaired = appendDawnBrief(damaged, { ...damaged, defense: 28 }, '补上支撑');
    expect(repaired.defenseNight).toEqual({ day: 8, start: 36, end: 28, reinforced: 2, damaged: 10, complete: true });
    expect(repaired.dawnBrief).toEqual(['北门遭到撞击。防线受损（−10），现为 26/100。', '补上支撑。防线增强（+2），现为 28/100。']);
    expect(advanceCampaignDay(repaired).defenseNight).toEqual(repaired.defenseNight);
  });

  it('records only the actual gain near the cap and retains fractional changes', () => {
    const start = beginDefenseNight({ ...base(), defense: 99.5 });
    const repaired = appendDawnBrief(start, { ...start, defense: 100 }, '加固');
    expect(repaired.defenseNight?.reinforced).toBe(0.5);
    expect(repaired.dawnBrief?.[0]).toContain('增强（+0.5）');
  });

  it('keeps full totals even after individual diary entries have been truncated', () => {
    let state = beginDefenseNight({ ...base(), defense: 60 });
    for (let i = 0; i < 12; i++) state = appendDawnBrief(state, { ...state, defense: state.defense - 1 }, `撞击${i}`);
    expect(state.dawnBrief).toHaveLength(8);
    expect(state.defenseNight?.damaged).toBe(12);
    expect(state.defenseNight?.end).toBe(48);
  });

  it('marks a mid-night old save as partial instead of claiming a complete night', () => {
    const old = { ...base(), defense: 30 };
    const next = appendDawnBrief(old, { ...old, defense: 28 }, '撞击');
    expect(next.defenseNight?.complete).toBe(false);
    expect(renderPanel(next, 'dawn')).toContain('以上不是整夜合计');
  });

  it('normalizes old wording at display time without inventing totals or mutating saves', () => {
    const old = { ...base(), dawnBrief: ['脚步声。门墙少了 2。', '门后支撑。门墙添了 3。'] };
    expect(dawnBriefEntries(old)).toEqual(['脚步声。防线受损（−2）。', '门后支撑。防线增强（+3）。']);
    expect(old.dawnBrief[0]).toContain('门墙少了');
    expect(renderPanel(old, 'dawn')).toContain('旧记录未保留完整');
  });

  it('preserves the ledger and diary through save loading and rejects inconsistent records', () => {
    const state = createPreviewState('defense-dawn');
    const loaded = promoteV2ToV3(JSON.parse(JSON.stringify(state)))!;
    expect(loaded.defenseNight).toEqual(state.defenseNight);
    expect(loaded.dawnBrief).toEqual(state.dawnBrief);
    expect(normalizeDefenseNight({ ...state.defenseNight, end: 99 }, 9)).toBeUndefined();
    expect(normalizeDefenseNight({ ...state.defenseNight, day: 10 }, 9)).toBeUndefined();
    expect(promoteV2ToV3(base())?.defenseNight).toBeUndefined();
  });

  it('starts a fresh complete record on the next night', () => {
    const previous = createPreviewState('defense-dawn');
    const next = scheduleNight({ ...previous, day: 10, defense: 40 });
    expect(next.defenseNight).toEqual({ day: 10, start: 40, end: 40, reinforced: 0, damaged: 0, complete: true });
  });
});

describe('defense feedback and unchanged rules', () => {
  it('separates a weak defense from sufficient guards, and strong defense from an empty post', () => {
    const low = createPreviewState('defense-dusk');
    expect(defenseCondition(low.defense)).toBe('防线薄弱');
    expect(guardCoverageLabel(previewNightPreparation(low))).toBe('守岗人手较充足');
    const markup = renderToStaticMarkup(createElement(DuskV1, { state: low, onCommit: () => {} }));
    expect(markup).toContain('防线薄弱');
    expect(markup).toContain('守岗人手较充足');
    expect(markup).not.toMatch(/街口已经补过|门墙太薄/);
    const strong = { ...low, defense: 80, dayAssignments: {} };
    expect(defenseCondition(strong.defense)).toBe('防线尚稳');
    expect(guardCoverageLabel(previewNightPreparation(strong))).toBe('未安排守岗');
  });

  it('shows defense separately from the five home resource slots and reports the previous night', () => {
    const state = createPreviewState('defense');
    expect(pendingCampaignEvent(state)).toBeNull();
    expect(pendingCommunityRequest(state)).toBeNull();
    expect(pendingPrincipleDecision(state)).toBeNull();
    const markup = renderToStaticMarkup(createElement(HomeBaseView, { state, onCommit: () => {}, onNavigate: () => {} }));
    const resources = markup.match(/<section[^>]*aria-label="核心资源"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(resources).not.toContain('防线');
    expect(markup).toContain('aria-label="街口防线"');
    expect(markup).toContain('上一夜：−8（36 → 28）');
    expect(markup).toContain('守岗人手较充足');
  });

  it('explains the existing risk thresholds, without treating fixed horde nights as avoidable', () => {
    const state = createPreviewState('defense');
    expect(defenseRiskNotes(state)).toHaveLength(4);
    expect(defenseRiskNotes({ ...state, defense: 35 }).join('')).not.toContain('增加居民压力');
    expect(defenseRiskNotes({ ...state, defense: 30 }).join('')).not.toContain('居民离开');
    const fixed = defenseRiskNotes({ ...state, day: 10 }).join('');
    expect(fixed).toContain('已有尸潮来袭');
    expect(fixed).not.toMatch(/来袭的风险增加|突发险情的风险增加/);
    expect(defenseRiskNotes({ ...state, day: 29 })[0]).toContain('守城结果');
  });

  it('does not claim repairs have settled before nightfall or change existing repair gains', () => {
    const state = { ...base(), defense: 40, dayAssignments: { zhou: 'watch' as const } };
    expect(renderPanel(state, 'dusk')).toContain('尚未计入今天未结算的增益');
    const prepared = finalizeDay(state);
    expect(prepared.defense).toBe(44);
    expect(scheduleNight(prepared).defenseNight?.start).toBe(44);
  });

  it('leaves the original risk probabilities and zero-defense behavior unchanged', () => {
    for (const [defense, risk] of [[60, 0.08], [30, 0.2], [0, 0.38]]) {
      const state = { ...base(), defense, hope: 60, survivors: base().survivors.map((s) => ({ ...s, condition: 'healthy' as const })) };
      expect(emergencyRisk(state)).toBeCloseTo(risk);
      expect(advanceCampaignDay({ ...state, phase: 'summary' }).phase).toBe('street');
    }
  });
});
