import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { expeditionDecisionPreview, missingSearchPreview, nightChoicePreview } from '../src/game/v060/decisionReadability';
import { medicalCrisisFlag } from '../src/game/v060/mortality';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import type { GameState } from '../src/game/types';
import type { NightChoice, V060NightEvent } from '../src/game/v060/nightEvents';

function eventWith(id: string, choice: NightChoice): V060NightEvent {
  const noop: NightChoice = { id: 'noop', label: '等待', detail: '等待。', strategy: 'consequence', direct: {} };
  return { id, category: 'emergency', minDay: 1, maxDay: 29, title: '测试事件', body: '测试。', choices: [choice, noop, { ...noop, id: 'noop-2' }] };
}

describe('v0.6 decision readability', () => {
  it('shows resource costs and stable resolution for non-check choices', () => {
    const state = createV060InitialState(880001);
    const choice: NightChoice = { id: 'battery', label: '启用备用电源', detail: '直接供电。', strategy: 'resource', cost: { power: 10 }, direct: { hope: 1 } };
    const preview = nightChoicePreview(state, eventWith('clinic-blackout', choice), choice);
    expect(preview.tags).toContain('稳定');
    expect(preview.tags).toContain('电力 -10');
    expect(preview.summary).toContain('不需要投骰');
  });

  it('warns that a critical untreated survivor can die in the medical crisis', () => {
    const base = createV060InitialState(880002);
    const state: GameState = {
      ...base,
      day: 12,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'critical' as const, untreatedDays: 1 } : survivor),
      storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia')],
    };
    const event = mortalityEventById(state, 'mortality-medical:lin-xia');
    expect(event).toBeTruthy();
    const treat = event!.choices.find((choice) => choice.id === 'mortality-treat')!;
    const isolate = event!.choices.find((choice) => choice.id === 'mortality-isolate')!;
    expect(nightChoicePreview(state, event!, treat).tags).toContain('失败可致死');
    expect(nightChoicePreview(state, event!, isolate).tags).toContain('可能尸变/死亡');
    expect(nightChoicePreview(state, event!, isolate).summary).toContain('尸变死亡');
  });

  it('makes low-hope departure consequences explicit', () => {
    const state = createV060InitialState(880003);
    const leave: NightChoice = { id: 'mortality-leave', label: '不阻拦', detail: '让对方离开。', strategy: 'consequence', direct: { hope: -1 } };
    const event = eventWith('mortality-hope:lin-xia', leave);
    const preview = nightChoicePreview(state, event, leave);
    expect(preview.tags).toContain('必定失踪');
    expect(preview.summary).toContain('进入可搜救的失踪状态');
  });

  it('warns about resident losses on civilian incident choices', () => {
    const state = { ...createV060InitialState(880004), civilianResidents: 5 };
    const choice: NightChoice = { id: 'combat-first', label: '先挡尸群', detail: '医疗稍后。', strategy: 'consequence', direct: {} };
    const preview = nightChoicePreview(state, eventWith('horde-clinic', choice), choice);
    expect(preview.tags).toContain('居民必减员');
    expect(preview.tone).toBe('severe');
  });

  it('shows the DAY 11+ death boundary for extreme expeditions and safe retreat', () => {
    const state = { ...createV060InitialState(880005), day: 12 };
    const push = expeditionDecisionPreview(state, 'push', 'extreme');
    const retreat = expeditionDecisionPreview(state, 'retreat', 'extreme');
    expect(push.tags).toContain('严重失败可能失踪/死亡');
    expect(push.summary).toContain('双一');
    expect(retreat.tags).toContain('安全撤回');
    expect(retreat.tags).toContain('无物资收益');
    expect(retreat.summary).toContain('不会因这次探索事件受伤、失踪或死亡');
  });

  it('marks a second failed missing-person search as fatal before the player commits', () => {
    const base = createV060InitialState(880006);
    const state: GameState = {
      ...base,
      buildings: { ...base.buildings, radio: 2, searchStation: 1 },
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'missing' as const } : survivor),
      storyFlags: [...base.storyFlags, 'missing_search_failed:lin-xia:7'],
    };
    const radio = missingSearchPreview(state, 'lin-xia', 'radio');
    expect(radio.tags).toContain('电力 -5');
    expect(radio.tags).toContain('失败将确认死亡');
    expect(radio.summary).toContain('第二次搜救');
  });
});
