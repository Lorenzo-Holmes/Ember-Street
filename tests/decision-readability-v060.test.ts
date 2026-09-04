import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import { effectiveNightChoiceCostLabel, enhanceFinalHordePreview } from '../src/game/v060/day29Comprehension';
import { expeditionDecisionPreview, missingSearchPreview, nightChoicePreview } from '../src/game/v060/decisionReadability';
import { finalHordeEventById } from '../src/game/v060/finalHorde';
import { medicalCrisisFlag } from '../src/game/v060/mortality';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import type { GameState } from '../src/game/types';
import type { NightChoice, V060NightEvent } from '../src/game/v060/nightEvents';

function eventWith(id: string, choice: NightChoice): V060NightEvent {
  const noop: NightChoice = { id: 'noop', label: '等待', detail: '等待。', strategy: 'consequence', direct: {} };
  return { id, category: 'emergency', minDay: 1, maxDay: 29, title: '测试事件', body: '测试。', choices: [choice, noop, { ...noop, id: 'noop-2' }] };
}

describe('v0.6 decision readability', () => {
  it('shows resource costs and a clearly safer path for non-check choices', () => {
    const state = createV060InitialState(880001);
    const choice: NightChoice = { id: 'battery', label: '启用备用电源', detail: '直接供电。', strategy: 'resource', cost: { power: 10 }, direct: { hope: 1 } };
    const preview = nightChoicePreview(state, eventWith('clinic-blackout', choice), choice);
    expect(preview.tags).toContain('拿东西换稳妥');
    expect(preview.tags).toContain('要用电力 10');
    expect(preview.summary).toContain('不用再让人冒险');
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
    expect(nightChoicePreview(state, event!, isolate).summary).toContain('等不到天亮');
  });

  it('makes low-hope departure consequences explicit without system-state language', () => {
    const state = createV060InitialState(880003);
    const leave: NightChoice = { id: 'mortality-leave', label: '不阻拦', detail: '让对方离开。', strategy: 'consequence', direct: { hope: -1 } };
    const event = eventWith('mortality-hope:lin-xia', leave);
    const preview = nightChoicePreview(state, event, leave);
    expect(preview.tags).toContain('这个人一定会走');
    expect(preview.summary).toContain('只能再想办法去找');
  });

  it('warns about resident losses on civilian incident choices', () => {
    const state = { ...createV060InitialState(880004), civilianResidents: 5 };
    const choice: NightChoice = { id: 'combat-first', label: '先挡尸群', detail: '医疗稍后。', strategy: 'consequence', direct: {} };
    const preview = nightChoicePreview(state, eventWith('horde-clinic', choice), choice);
    expect(preview.tags).toContain('一定会有人死');
    expect(preview.tone).toBe('severe');
  });

  it('shows the DAY 11+ death boundary for extreme expeditions and safe retreat', () => {
    const state = { ...createV060InitialState(880005), day: 12 };
    const push = expeditionDecisionPreview(state, 'push', 'extreme');
    const retreat = expeditionDecisionPreview(state, 'retreat', 'extreme');
    expect(push.tags).toContain('严重失败可能失踪/死亡');
    expect(push.summary).toContain('甚至可能回不来');
    expect(retreat.tags).toContain('现在回头');
    expect(retreat.tags).toContain('今天空手');
    expect(retreat.summary).toContain('人能直接回来');
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
    expect(radio.tags).toContain('要用 5 份电');
    expect(radio.tags).toContain('再找不到，就只能记下名字');
    expect(radio.summary).toContain('第二次找');
  });

  it('exposes search availability independently of the displayed wording', () => {
    const base = createV060InitialState(880009);
    const state: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'missing' as const } : survivor),
    };
    expect(missingSearchPreview(state, 'lin-xia', 'team').available).toBe(true);
    const shortHanded = { ...state, dayState: { ...state.dayState, committedSurvivorIds: ['zhou'] } };
    expect(missingSearchPreview(shortHanded, 'lin-xia', 'team').available).toBe(false);
    expect(missingSearchPreview(shortHanded, 'lin-xia', 'team').tags).toContain('人手不够');
    expect(missingSearchPreview(state, 'lin-xia', 'radio').available).toBe(false);
    const radioReady = { ...state, buildings: { ...state.buildings, radio: 1 }, inventory: { ...state.inventory, power: 5 } };
    expect(missingSearchPreview(radioReady, 'lin-xia', 'radio').available).toBe(true);
    expect(missingSearchPreview({ ...radioReady, inventory: { ...radioReady.inventory, power: 4 } }, 'lin-xia', 'radio').available).toBe(false);
    const attempted = { ...radioReady, storyFlags: [...radioReady.storyFlags, `missing_search:lin-xia:${state.day}`] };
    expect(missingSearchPreview(attempted, 'lin-xia', 'team').available).toBe(false);
    expect(missingSearchPreview(attempted, 'lin-xia', 'radio').available).toBe(false);
  });

  it('makes the three last-line promises readable before the player commits', () => {
    const base = createV060InitialState(880007);
    const state: GameState = {
      ...base,
      day: 29,
      inventory: { ...base.inventory, materials: 12, parts: 6 },
      storyFlags: [...base.storyFlags, 'final_horde_supplies'],
    };
    const event = finalHordeEventById('final-horde-last-line')!;
    const person = event.choices.find((choice) => choice.id === 'final-last-hold')!;
    const resource = event.choices.find((choice) => choice.id === 'final-last-stockpile')!;
    const retreat = event.choices.find((choice) => choice.id === 'final-last-retreat')!;

    const personPreview = enhanceFinalHordePreview(state, event, person, nightChoicePreview(state, event, person));
    const resourcePreview = enhanceFinalHordePreview(state, event, resource, nightChoicePreview(state, event, resource));
    const retreatPreview = enhanceFinalHordePreview(state, event, retreat, nightChoicePreview(state, event, retreat));

    expect(personPreview.tags).toContain('不用再拿东西');
    expect(personPreview.tags).toContain('得让人顶上');
    expect(personPreview.summary).toContain('代价会直接落在人身上');

    expect(resourcePreview.tags).toContain('不用冒险');
    expect(resourcePreview.tags).toContain('直接拿东西顶住');
    expect(resourcePreview.tags).toContain('以前的准备省下一些');
    expect(resourcePreview.summary).toContain('还要从仓房拿走的量');

    expect(retreatPreview.tags).toContain('先保住人');
    expect(retreatPreview.tags).toContain('主动放弃外层');
    expect(retreatPreview.summary).toContain('不用再拿东西');
    expect(retreatPreview.tone).toBe('stable');
  });

  it('uses the discounted DAY29 cost as the one visible to the player', () => {
    const base = createV060InitialState(880008);
    const state: GameState = {
      ...base,
      day: 29,
      storyFlags: [...base.storyFlags, 'final_horde_supplies'],
    };
    const event = finalHordeEventById('final-horde-last-line')!;
    const stockpile = event.choices.find((choice) => choice.id === 'final-last-stockpile')!;
    const preview = nightChoicePreview(state, event, stockpile);

    expect(effectiveNightChoiceCostLabel(state, stockpile)).toBe('要用材料 3 · 要用零件 1');
    expect(preview.tags).toContain('要用材料 3');
    expect(preview.tags).toContain('要用零件 1');
    expect(preview.tags).not.toContain('要用材料 6');
    expect(preview.tags).not.toContain('要用零件 3');
  });
});
