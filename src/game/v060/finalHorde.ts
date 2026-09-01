import type { CheckModifier, CheckOutcome, GameState, SurvivorCondition } from '../types';
import { communitySupportSummary } from './community';
import { clearUntreatedRisk } from './mortality';
import type { NightChoice, NightEffect, V060NightEvent } from './nightEvents';
import { hasPrinciple } from './principles';
import { socialStateOf } from './socialPressure';

export const FINAL_HORDE_EVENT_IDS = [
  'final-horde-north-gate',
  'final-horde-power-grid',
  'final-horde-clinic',
  'final-horde-community',
  'final-horde-reroute',
  'final-horde-last-line',
] as const;

export type FinalHordeEventId = (typeof FINAL_HORDE_EVENT_IDS)[number];

const checked = (
  id: string,
  label: string,
  detail: string,
  role: NonNullable<NightChoice['check']>['role'],
  success: NightEffect,
  partial: NightEffect,
  failure: NightEffect,
): NightChoice => ({
  id,
  label,
  detail,
  strategy: 'person',
  check: { label, role },
  outcomes: {
    failure,
    partial,
    success,
    critical: { ...success, hope: (success.hope ?? 0) + 1, defense: (success.defense ?? 0) + 2 },
  },
});

const resource = (id: string, label: string, detail: string, cost: NightChoice['cost'], effect: NightEffect): NightChoice => ({
  id, label, detail, strategy: 'resource', cost, direct: effect,
});

const consequence = (id: string, label: string, detail: string, effect: NightEffect): NightChoice => ({
  id, label, detail, strategy: 'consequence', direct: effect,
});

export const FINAL_HORDE_EVENTS: V060NightEvent[] = [
  {
    id: 'final-horde-north-gate', category: 'horde', minDay: 29, maxDay: 29,
    title: '第一阶段 · 北门',
    body: '第一波尸群没有试探。它们直接撞向北门。守夜岗、围栏和居民轮值现在一起接受过去二十八天的第一次检验。',
    choices: [
      checked('final-gate-hold', '带人顶住北门', '让守备人物站到最前面。守夜岗、居民守备与人物状态都会进入判定。', 'watch',
        { defense: 8, hope: 2, addFlags: ['final_gate_held'] },
        { defense: 2, addFlags: ['final_gate_strained'] },
        { defense: -12, hope: -2, actorCondition: 'minor', addFlags: ['final_gate_buckled'] }),
      resource('final-gate-reinforce', '把最后的材料压上去', '不赌人物状态，直接消耗材料和零件把门撑住。', { materials: 5, parts: 2 }, { defense: 6, addFlags: ['final_gate_reinforced'] }),
      consequence('final-gate-fallback', '放掉北门外沿', '保存人手，但把第一道防线交出去。', { defense: -10, hope: -2, addFlags: ['final_gate_abandoned'] }),
    ],
  },
  {
    id: 'final-horde-power-grid', category: 'horde', minDay: 29, maxDay: 29,
    title: '第二阶段 · 主灯熄灭',
    body: '撞击让主灯线路跳闸。黑暗正在沿街区扩散；工坊、备用零件和你曾经带回来的设备现在比任何口号都重要。',
    choices: [
      checked('final-grid-repair', '在黑暗里抢修', '让维修人物处理主线路。工坊等级与过去找到的设备零件会改变判定。', 'repair',
        { power: 12, defense: 4, addFlags: ['final_grid_restored'] },
        { power: 5, addFlags: ['final_grid_unstable'] },
        { power: -12, defense: -6, actorCondition: 'minor', addFlags: ['final_grid_failed'] }),
      resource('final-grid-parts', '直接换掉烧毁的组件', '支付零件换取稳定恢复，不进行判定。', { parts: 4 }, { power: 12, defense: 2, addFlags: ['final_grid_replaced'] }),
      consequence('final-grid-dark', '关掉半条街的灯', '不继续抢修，把有限电力留给诊疗和最后防线。', { power: -8, defense: -5, addFlags: ['final_grid_darkened'] }),
    ],
  },
  {
    id: 'final-horde-clinic', category: 'horde', minDay: 29, maxDay: 29,
    title: '第三阶段 · 伤员涌进诊疗站',
    body: '围栏后的伤员开始挤满诊疗角。医院和药店里带回来的东西、诊疗站等级以及过去选择的医疗原则，现在都会直接决定谁还能站起来。',
    choices: [
      checked('final-clinic-triage', '让医疗人员连续分诊', '进行医疗判定。医疗缓存会给判定提供额外优势，成功后会真实改善一名最重伤员。', 'medical',
        { hope: 4, addFlags: ['final_clinic_triaged'] },
        { hope: 1, addFlags: ['final_clinic_stretched'] },
        { hope: -4, addFlags: ['final_clinic_overwhelmed'] }),
      resource('final-clinic-supplies', '打开应急药品储备', '稳定处理一批伤员。医疗原则与探索得到的医疗缓存会降低实际药品消耗。', { medicine: 3 }, { hope: 3, addFlags: ['final_clinic_supplied'] }),
      consequence('final-clinic-delay', '只处理能马上回到防线的人', '不额外消耗药品，但伤员和居民会记住这个决定。', { hope: -5, defense: 2, addFlags: ['final_clinic_delayed'] }),
    ],
  },
  {
    id: 'final-horde-community', category: 'horde', minDay: 29, maxDay: 29,
    title: '第四阶段 · 街区开始慌乱',
    body: '真正让队伍变乱的不是尸群，而是哭声和“门是不是要破了”的传言。你救回来的居民此刻既可能成为负担，也可能成为维持秩序的人。',
    choices: [
      checked('final-community-calm', '把所有人重新组织起来', '由炊事岗位稳住人群。居民规模、街区压力和过去兑现过的承诺都会影响判定。', 'cook',
        { hope: 6, defense: 2, addFlags: ['final_community_rallied'] },
        { hope: 2, addFlags: ['final_community_held'] },
        { hope: -6, defense: -3, addFlags: ['final_community_panicked'] }),
      resource('final-community-rations', '把储备口粮分下去', '用口粮换取一个无需投骰的稳定窗口。', { ration: 5 }, { hope: 5, addFlags: ['final_community_fed'] }),
      consequence('final-community-ignore', '让能行动的人全部去守线', '不消耗口粮，但社区秩序会明显恶化。', { hope: -7, defense: 3, addFlags: ['final_community_ignored'] }),
    ],
  },
  {
    id: 'final-horde-reroute', category: 'horde', minDay: 29, maxDay: 29,
    title: '第五阶段 · 尸群从侧街绕后',
    body: '正面压力稍退，侧街却传来新的撞击声。地铁维修图、公交路线、医院观察路线和搜索站里积累的情报，现在终于变成一条具体的退路。',
    choices: [
      checked('final-route-scout', '按旧情报带人改线', '由探索人物判断尸群路线。已知撤离路线和“准备撤离”原则会提供明显加成。', 'search',
        { defense: 9, hope: 2, addFlags: ['final_route_outmaneuvered'] },
        { defense: 3, addFlags: ['final_route_delayed'] },
        { defense: -10, actorCondition: 'minor', addFlags: ['final_route_missed'] }),
      resource('final-route-barricade', '封死两条侧巷', '支付材料与零件，把路线问题直接变成一道墙。', { materials: 4, parts: 2 }, { defense: 6, addFlags: ['final_route_barricaded'] }),
      consequence('final-route-stand', '不再移动阵地', '保存物资，但侧翼必须硬吃尸群压力。', { defense: -11, hope: -2, addFlags: ['final_route_stood_ground'] }),
    ],
  },
  {
    id: 'final-horde-last-line', category: 'horde', minDay: 29, maxDay: 29,
    title: '第六阶段 · 最后一条线',
    body: '天边已经有一点发白。所有还能站着的人都知道这是最后一轮：建筑、居民、原则、承诺、探索情报和北仓库带回的东西，会一起决定这条街有没有明天。',
    choices: [
      checked('final-last-hold', '所有还能站的人一起守住', '最终守线判定会读取北仓库物资、守街原则、社区规模与此前承诺记录。', 'watch',
        { defense: 12, hope: 4, addFlags: ['final_last_line_held'] },
        { defense: 4, hope: 1, addFlags: ['final_last_line_barely'] },
        { defense: -16, hope: -5, actorCondition: 'serious', addFlags: ['final_last_line_broken'] }),
      resource('final-last-stockpile', '把最后的建材和零件全部用掉', '用库存换一个稳定结果；北仓库的最终防护物资会显著降低实际消耗。', { materials: 8, parts: 4 }, { defense: 11, hope: 2, addFlags: ['final_last_line_fortified'] }),
      consequence('final-last-retreat', '退到街区最里面', '保住一部分人，但主动放弃已经经营了二十九天的外层街区。', { defense: -18, hope: -7, addFlags: ['final_last_line_retreated'] }),
    ],
  },
];

export function finalHordeEventById(id: string): V060NightEvent | undefined {
  return FINAL_HORDE_EVENTS.find((event) => event.id === id);
}

export function isFinalHordeEventId(id: string): id is FinalHordeEventId {
  return (FINAL_HORDE_EVENT_IDS as readonly string[]).includes(id);
}

export function finalHordeStageNumber(eventId: string | null | undefined): number | null {
  if (!eventId) return null;
  const index = FINAL_HORDE_EVENT_IDS.indexOf(eventId as FinalHordeEventId);
  return index >= 0 ? index + 1 : null;
}

export function effectiveFinalHordeChoice(state: GameState, choice: NightChoice): NightChoice {
  if (!choice.cost) return choice;
  const cost = { ...choice.cost };
  if (choice.id === 'final-clinic-supplies') {
    const discount = (hasPrinciple(state, 'triage-first') ? 1 : 0)
      + (state.storyFlags.includes('medical_cache') || state.storyFlags.includes('antibiotic_stock') ? 1 : 0);
    cost.medicine = Math.max(1, (cost.medicine ?? 0) - discount);
  }
  if (choice.id === 'final-last-stockpile' && state.storyFlags.includes('final_horde_supplies')) {
    cost.materials = Math.max(0, (cost.materials ?? 0) - 3);
    cost.parts = Math.max(0, (cost.parts ?? 0) - 2);
  }
  return { ...choice, cost };
}

export function finalHordeCheckModifiers(state: GameState, choiceId: string): CheckModifier[] {
  const modifiers: CheckModifier[] = [];
  const community = communitySupportSummary(state);
  const social = socialStateOf(state);
  if (choiceId === 'final-gate-hold' && community.activeResidents >= 5 && (community.supportMode === 'defense' || hasPrinciple(state, 'community-shares-risk'))) {
    modifiers.push({ label: '居民守线', value: 1 });
  }
  if (choiceId === 'final-grid-repair' && (state.storyFlags.includes('working_vehicle_parts') || state.storyFlags.includes('generator_backup'))) {
    modifiers.push({ label: '探索得到的设备零件', value: 1 });
  }
  if (choiceId === 'final-clinic-triage' && (state.storyFlags.includes('medical_cache') || state.storyFlags.includes('antibiotic_stock'))) {
    modifiers.push({ label: '医疗储备', value: 1 });
  }
  if (choiceId === 'final-community-calm') {
    if (community.activeResidents >= 8) modifiers.push({ label: '社区已经成形', value: 1 });
    if (social.pressure <= 1) modifiers.push({ label: '街区仍然平静', value: 1 });
    if (social.pressure >= 5) modifiers.push({ label: '街区濒临失控', value: -1 });
    if (social.fulfilledPromises > social.brokenPromises) modifiers.push({ label: '兑现过的承诺', value: 1 });
  }
  if (choiceId === 'final-route-scout') {
    const knowsRoute = ['evacuation_route_known', 'subway_exit_known', 'southern_route_known', 'subway_maintenance_map', 'hospital_route_observed']
      .some((flag) => state.storyFlags.includes(flag));
    if (knowsRoute) modifiers.push({ label: '过去的路线情报', value: 2 });
    if (hasPrinciple(state, 'prepare-evacuation')) modifiers.push({ label: '原则·准备撤离', value: 1 });
  }
  if (choiceId === 'final-last-hold') {
    if (state.storyFlags.includes('final_horde_supplies')) modifiers.push({ label: '北仓库防护物资', value: 2 });
    if (hasPrinciple(state, 'hold-the-street')) modifiers.push({ label: '原则·守住这条街', value: 2 });
    if (community.activeResidents >= 8) modifiers.push({ label: '社区劳动力', value: 1 });
    if (social.fulfilledPromises > social.brokenPromises) modifiers.push({ label: '街区仍然相信承诺', value: 1 });
  }
  return modifiers;
}

function severity(condition: SurvivorCondition | undefined): number {
  return condition === 'critical' ? 4 : condition === 'serious' ? 3 : condition === 'minor' ? 2 : condition === 'fatigued' ? 1 : 0;
}

function improveCondition(condition: SurvivorCondition | undefined): SurvivorCondition {
  if (condition === 'critical') return 'serious';
  if (condition === 'serious') return 'minor';
  if (condition === 'minor' || condition === 'fatigued') return 'healthy';
  return condition ?? 'healthy';
}

function treatWorst(state: GameState, count: number): GameState {
  const targets = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing' && severity(survivor.condition) > 0)
    .sort((a, b) => severity(b.condition) - severity(a.condition))
    .slice(0, count);
  if (!targets.length) return state;
  const targetIds = new Set(targets.map((target) => target.id));
  const treated: GameState = {
    ...state,
    survivors: state.survivors.map((survivor) => targetIds.has(survivor.id)
      ? { ...survivor, condition: improveCondition(survivor.condition), untreatedDays: 0 }
      : survivor),
  };
  return clearUntreatedRisk(treated, targetIds);
}

export function applyFinalHordeResolution(
  state: GameState,
  eventId: string,
  choiceId: string,
  outcome?: CheckOutcome,
): GameState {
  if (!isFinalHordeEventId(eventId)) return state;
  let next = state;
  if (eventId === 'final-horde-clinic') {
    if (choiceId === 'final-clinic-supplies') next = treatWorst(next, 2);
    if (choiceId === 'final-clinic-triage' && (outcome === 'success' || outcome === 'critical')) next = treatWorst(next, 1);
  }
  const result = outcome ?? 'direct';
  return {
    ...next,
    storyFlags: [...new Set([...next.storyFlags, `final_stage:${eventId}:${choiceId}:${result}`])],
  };
}

export function finalHordeLegacyNotes(state: GameState): string[] {
  const notes: string[] = [];
  const community = communitySupportSummary(state);
  const social = socialStateOf(state);
  if (state.storyFlags.includes('final_horde_supplies')) notes.push('北仓库防护物资已经就位');
  if (state.storyFlags.includes('medical_cache') || state.storyFlags.includes('antibiotic_stock')) notes.push('医院/药店医疗储备仍可使用');
  if (['evacuation_route_known', 'subway_exit_known', 'southern_route_known', 'subway_maintenance_map'].some((flag) => state.storyFlags.includes(flag))) notes.push('探索留下了可用的路线情报');
  if (community.activeResidents >= 5) notes.push(`${community.activeResidents} 名居民已经形成社区劳动力`);
  if (social.fulfilledPromises > 0) notes.push(`过去兑现过 ${social.fulfilledPromises} 次承诺`);
  if (social.brokenPromises > 0) notes.push(`过去有 ${social.brokenPromises} 次承诺没有兑现`);
  if (social.principles.length) notes.push(`三周形成的街区原则正在影响今晚`);
  return notes;
}
