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
    body: '第一波尸群没有试探。它们直接撞向北门。现在要决定的是谁去顶、要不要把库存压上去，还是主动把防线收短。',
    choices: [
      checked('final-gate-hold', '带人顶住北门', '把人放在最前面。守夜岗、居民轮值和人物状态都会进入判定，守住了最省库存，失手也最伤人。', 'watch',
        { defense: 7, hope: 1, addFlags: ['final_gate_held'] },
        { defense: 2, addFlags: ['final_gate_strained'] },
        { defense: -9, hope: -2, actorCondition: 'minor', addFlags: ['final_gate_buckled'] }),
      resource('final-gate-reinforce', '把材料压到门上', '用木料、铁件和备件换一个不靠投骰的硬支撑。准备过北仓库物资时，实际消耗会更低。', { materials: 4, parts: 1 }, { defense: 9, addFlags: ['final_gate_reinforced'] }),
      consequence('final-gate-fallback', '把防线收进第二道障碍', '主动放掉最外面的几米，把人撤进更窄的街口。少守一段墙，也少让一个人暴露在门外。', { defense: -2, hope: 2, addFlags: ['final_gate_abandoned'] }),
    ],
  },
  {
    id: 'final-horde-power-grid', category: 'horde', minDay: 29, maxDay: 29,
    title: '第二阶段 · 主灯熄灭',
    body: '撞击让主灯线路跳闸。工坊里还有备件，老线路也还能抢修；另一种办法，是干脆熄掉外围，把电留给最不能黑的地方。',
    choices: [
      checked('final-grid-repair', '在黑暗里抢修', '让维修的人摸着发热的线路把主灯重新接回来。成功省零件，失败会把人和线路一起拖进更糟的状态。', 'repair',
        { power: 10, defense: 3, addFlags: ['final_grid_restored'] },
        { power: 4, addFlags: ['final_grid_unstable'] },
        { power: -8, defense: -4, actorCondition: 'minor', addFlags: ['final_grid_failed'] }),
      resource('final-grid-parts', '整组换掉烧毁组件', '直接拿备件换掉最危险的一段。过去带回发电机或车辆部件时，这一步会少吃一点库存。', { parts: 3 }, { power: 18, defense: 4, addFlags: ['final_grid_replaced'] }),
      consequence('final-grid-dark', '熄掉外围，只保主灯和诊疗', '不追求把整条街重新点亮。黑处更难守，但省下来的电能继续撑住诊疗和最后一线。', { power: 8, defense: -2, addFlags: ['final_grid_darkened'] }),
    ],
  },
  {
    id: 'final-horde-clinic', category: 'horde', minDay: 29, maxDay: 29,
    title: '第三阶段 · 伤员涌进诊疗站',
    body: '围栏后的伤员开始挤满诊疗角。今晚没有“都照顾好”这种选项：要靠程医生分诊，要打开药箱，或者先让还能走的人回到防线上。',
    choices: [
      checked('final-clinic-triage', '让医疗人员连续分诊', '把最危险的人先挑出来。成功会真实改善一名重伤员，失败则会把最宝贵的时间耗在拥挤里。', 'medical',
        { hope: 4, addFlags: ['final_clinic_triaged'] },
        { hope: 1, addFlags: ['final_clinic_stretched'] },
        { hope: -3, addFlags: ['final_clinic_overwhelmed'] }),
      resource('final-clinic-supplies', '打开应急药箱', '不赌时间窗口，直接用药品压住最危险的两个人。过去找到的医疗储备和分诊原则会降低实际消耗。', { medicine: 2 }, { hope: 4, addFlags: ['final_clinic_supplied'] }),
      consequence('final-clinic-delay', '先处理能立刻回防线的人', '把还能站起来的人先包扎好送回去。防线会多几双手，但躺着的人会听见这个决定。', { hope: -3, defense: 5, addFlags: ['final_clinic_delayed'] }),
    ],
  },
  {
    id: 'final-horde-community', category: 'horde', minDay: 29, maxDay: 29,
    title: '第四阶段 · 街区开始慌乱',
    body: '真正让队伍散掉的不是尸群，而是哭声和“门是不是要破了”的传言。这里可以靠人心、靠储备，也可以把能动的人全部赶去守线。',
    choices: [
      checked('final-community-calm', '把所有人重新组织起来', '由熟悉大家的人重新排位置、找孩子、点人数。过去兑现的承诺越多，这句话越有人听。', 'cook',
        { hope: 5, defense: 1, addFlags: ['final_community_rallied'] },
        { hope: 2, addFlags: ['final_community_held'] },
        { hope: -4, defense: -2, addFlags: ['final_community_panicked'] }),
      resource('final-community-rations', '把储备口粮分下去', '让所有人先拿到一点热的和能带在身上的东西。昂贵，但不需要谁在最乱的时候说服所有人。', { ration: 4 }, { hope: 6, addFlags: ['final_community_fed'] }),
      consequence('final-community-ignore', '让能行动的人全部去守线', '把秩序换成战力。前线立刻多出人手，但有人会在混乱里掉队，街里也会记住这一夜。', { hope: -3, defense: 8, addFlags: ['final_community_ignored'] }),
    ],
  },
  {
    id: 'final-horde-reroute', category: 'horde', minDay: 29, maxDay: 29,
    title: '第五阶段 · 尸群从侧街绕后',
    body: '正面压力稍退，侧街却传来新的撞击声。过去画下的路线可以拿来赌一次判断，也可以把巷口封死，或者主动开一条口子把人和尸群分开。',
    choices: [
      checked('final-route-scout', '按旧情报带人改线', '让熟悉路线的人判断尸群真正会从哪里进来。情报准备得越完整，这个选择越强。', 'search',
        { defense: 8, hope: 1, addFlags: ['final_route_outmaneuvered'] },
        { defense: 3, addFlags: ['final_route_delayed'] },
        { defense: -8, actorCondition: 'minor', addFlags: ['final_route_missed'] }),
      resource('final-route-barricade', '封死两条侧巷', '把材料和零件变成两道一次性的墙。没有漂亮的判断，但能买到一段确定的时间。', { materials: 3, parts: 1 }, { defense: 8, addFlags: ['final_route_barricaded'] }),
      consequence('final-route-stand', '打开东侧通道，把人撤到内街', '不跟尸群争每一米，把居民往内街送，留下一个口子让压力泄出去。外层会丢，但人群不至于全挤在一处。', { defense: -3, hope: 3, addFlags: ['final_route_stood_ground'] }),
    ],
  },
  {
    id: 'final-horde-last-line', category: 'horde', minDay: 29, maxDay: 29,
    title: '第六阶段 · 最后一条线',
    body: '天边已经有一点发白。现在的选择不再只是“赢得更多”：要么拿所有还能站的人去赌这条街，要么烧掉最后库存，要么承认外层守不住，先把人带进去。',
    choices: [
      checked('final-last-hold', '所有还能站的人一起守住', '这是最强、也最危险的人力方案。过去二十八天积累的人、原则、承诺和北仓库准备都会压到这一次判定上。', 'watch',
        { defense: 10, hope: 3, addFlags: ['final_last_line_held'] },
        { defense: 3, hope: 1, addFlags: ['final_last_line_barely'] },
        { defense: -12, hope: -3, actorCondition: 'serious', addFlags: ['final_last_line_broken'] }),
      resource('final-last-stockpile', '把最后的建材和零件全部用掉', '不用任何人去赌最后一次失手，把仓房能钉、能焊、能顶住门的东西全部搬出来。', { materials: 6, parts: 3 }, { defense: 13, hope: 2, addFlags: ['final_last_line_fortified'] }),
      consequence('final-last-retreat', '退进内街，先把人保住', '主动承认外层守不住。少守一段街，也少让一个人去赌最后一次失手。', { defense: -5, hope: 1, addFlags: ['final_last_line_retreated'] }),
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
  if (choice.id === 'final-gate-reinforce' && state.storyFlags.includes('final_horde_supplies')) {
    cost.materials = Math.max(1, (cost.materials ?? 0) - 1);
    cost.parts = Math.max(0, (cost.parts ?? 0) - 1);
  }
  if (choice.id === 'final-grid-parts' && (state.storyFlags.includes('generator_backup') || state.storyFlags.includes('working_vehicle_parts'))) {
    cost.parts = Math.max(1, (cost.parts ?? 0) - 1);
  }
  if (choice.id === 'final-clinic-supplies') {
    const discount = (hasPrinciple(state, 'triage-first') ? 1 : 0)
      + (state.storyFlags.includes('medical_cache') || state.storyFlags.includes('antibiotic_stock') ? 1 : 0);
    cost.medicine = Math.max(1, (cost.medicine ?? 0) - discount);
  }
  if (choice.id === 'final-route-barricade' && state.storyFlags.includes('subway_maintenance_map')) {
    cost.materials = Math.max(1, (cost.materials ?? 0) - 1);
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
