import { createPendingCheck } from './dice';
import type { CheckModifier, CheckOutcome, GameState, InjuryState, LogTone, Role, RollMode } from './types';

export interface NightIncidentChoiceView {
  id: string;
  label: string;
  detail: string;
  risk?: string;
  checkLabel?: string;
}

export interface NightIncidentView {
  id: string;
  kicker: string;
  title: string;
  body: string;
  quote?: string;
  choices: NightIncidentChoiceView[];
}

interface NightEffect {
  hope?: number;
  power?: number;
  defense?: number;
  pressure?: number;
  supplies?: number;
  medicine?: number;
  parts?: number;
  flag?: string;
  actor?: { id: string; energy?: number; injury?: InjuryState };
  feed: { title: string; body: string; tone?: LogTone };
}

interface NightCheck {
  label: string;
  actorId?: string;
  skill?: Role;
  mode?: RollMode;
  building?: 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';
  bonusFlags?: Array<{ flag: string; label: string; value: number }>;
  outcomes: Record<CheckOutcome, NightEffect>;
}

interface NightIncidentChoice extends NightIncidentChoiceView {
  direct?: NightEffect;
  check?: NightCheck;
}

interface NightIncidentDefinition extends Omit<NightIncidentView, 'choices'> {
  day: number;
  threshold: number;
  choices: NightIncidentChoice[];
}

interface ScriptBeat {
  id: string;
  day: number;
  threshold: number;
  title: string;
  body: string;
  tone?: LogTone;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const hasFlag = (state: GameState, flag: string) => (state.storyFlags ?? []).includes(flag);

const BEATS: ScriptBeat[] = [
  { id: 'n1-50', day: 1, threshold: 50, title: '23:10', body: '远处只有零散拖步声。围栏还没有真正承受冲击。' },
  { id: 'n1-24', day: 1, threshold: 24, title: '23:36', body: '阿禾把最后一锅热食挪到配给站门口。', tone: 'hope' },
  { id: 'n2-48', day: 2, threshold: 48, title: '23:12', body: '西街传来玻璃碎裂声。林夏抬头听了一会儿，没有出去。' },
  { id: 'n2-22', day: 2, threshold: 22, title: '23:38', body: '小灰第一次在夜里钻进主灯下面。', tone: 'hope' },
  { id: 'n3-55', day: 3, threshold: 55, title: '23:05', body: '北侧围栏响了第一下。不是风。', tone: 'danger' },
  { id: 'n3-18', day: 3, threshold: 18, title: '23:42', body: '老周：“别看那边，先把手里的配给做完。”', tone: 'danger' },
  { id: 'n4-54', day: 4, threshold: 54, title: '23:06', body: '诊疗站的门连续开了三次。今晚来的伤员比平时多。', tone: 'danger' },
  { id: 'n4-16', day: 4, threshold: 16, title: '23:44', body: '程医生：“灯别关。我还看得见。”', tone: 'hope' },
  { id: 'n5-58', day: 5, threshold: 58, title: '23:02', body: '主灯闪了一次。所有人都抬头看。', tone: 'danger' },
  { id: 'n5-20', day: 5, threshold: 20, title: '23:40', body: '远处有一整片影子因为探照灯转向而停顿。' },
  { id: 'n6-62', day: 6, threshold: 62, title: '22:58', body: '广播里不断有人重复：“高架，全是。”', tone: 'danger' },
  { id: 'n6-24', day: 6, threshold: 24, title: '23:36', body: '阿梁说撞击声已经不是一层，是两层。', tone: 'danger' },
  { id: 'n7-82', day: 7, threshold: 82, title: '22:38', body: '小满：“高架那边……全是。”', tone: 'danger' },
  { id: 'n7-68', day: 7, threshold: 68, title: '22:52', body: '第一波尸群撞上北侧围栏。整条街像被人推了一下。', tone: 'danger' },
  { id: 'n7-55', day: 7, threshold: 55, title: '23:05', body: '老周：“北侧顶住了！”', tone: 'hope' },
  { id: 'n7-34', day: 7, threshold: 34, title: '23:26', body: '阿禾：“配给站还有人吗？” 林夏：“有。”', tone: 'hope' },
  { id: 'n7-14', day: 7, threshold: 14, title: '23:46', body: '撞击声第一次开始变稀。没有人敢说天快亮了。', tone: 'hope' },
  { id: 'n7-6', day: 7, threshold: 6, title: '23:54', body: '远处有人喊了一句：“天亮了。”', tone: 'hope' },
];

function effect(feedTitle: string, body: string, values: Omit<NightEffect, 'feed'> = {}): NightEffect {
  return { ...values, feed: { title: feedTitle, body, tone: values.pressure && values.pressure > 0 ? 'danger' : values.hope && values.hope > 0 ? 'hope' : 'neutral' } };
}

const INCIDENTS: NightIncidentDefinition[] = [
  {
    id: 'night-3-fence', day: 3, threshold: 42, kicker: '夜间突发 · 北侧围栏', title: '一根支撑杆突然脱焊',
    body: '围栏向街内歪了半尺。继续放着不管，下一次撞击会直接压在同一个位置。',
    choices: [
      { id: 'zhou', label: '让老周出去抢修', detail: '暂停配给片刻，做一次维修判定。', risk: '中', checkLabel: '维修判定', check: { label: '夜间抢修围栏', actorId: 'zhou', skill: 'repair', building: 'workshop', outcomes: {
        failure: effect('围栏没焊住', '老周被迫退回，缺口继续受压。', { pressure: 10, actor: { id: 'zhou', energy: -12 } }),
        partial: effect('支撑杆勉强固定', '能撑今晚，但老周手臂被铁皮划伤。', { defense: 5, actor: { id: 'zhou', energy: -10, injury: 'minor' } }),
        success: effect('围栏重新站稳', '焊点吃住了下一次撞击。', { defense: 10, pressure: -8, flag: 'night_fence_saved' }),
        critical: effect('老周顺手加了第二道支撑', '下一波撞击反而把结构越压越紧。', { defense: 15, pressure: -12, hope: 2, flag: 'night_fence_saved' }),
      } } },
      { id: 'brace', label: '用零件箱从里面顶住', detail: '消耗 2 个零件，不投骰。', direct: effect('零件箱顶住了缺口', '粗暴，但至少今晚它不会继续往里倒。', { parts: -2, defense: 6, pressure: -4, flag: 'night_fence_braced' }) },
    ],
  },
  {
    id: 'night-4-wounded', day: 4, threshold: 38, kicker: '夜间突发 · 诊疗站', title: '一名伤员突然失去意识',
    body: '程医生说还有机会，但她需要几分钟不被打断。',
    choices: [
      { id: 'cheng', label: '让程医生处理', detail: '医疗判定。诊疗站和备用药都会影响结果。', risk: '中', checkLabel: '医疗判定', check: { label: '稳定伤员', actorId: 'cheng', skill: 'medical', building: 'clinic', bonusFlags: [{ flag: 'last_antibiotic_reserved', label: '保留的抗生素', value: 1 }], outcomes: {
        failure: effect('伤员没能稳定下来', '今晚诊疗站的气氛一下沉了下去。', { hope: -2, medicine: -1 }),
        partial: effect('伤员暂时稳定', '需要继续观察，但最危险的几分钟过去了。', { medicine: -1, hope: 1 }),
        success: effect('伤员醒了', '程医生把灯调暗，示意大家继续干自己的事。', { medicine: -1, hope: 3, flag: 'night_patient_saved' }),
        critical: effect('程医生处理得干净利落', '伤员醒来后第一句话是：“我还能帮忙。”', { hope: 4, medicine: 1, flag: 'night_patient_saved' }),
      } } },
      { id: 'medicine', label: '直接用备用药品', detail: '消耗 2 份药品，跳过风险。', direct: effect('备用药顶上了', '程医生得到了一点时间，伤员情况稳定。', { medicine: -2, hope: 2, flag: 'night_patient_saved' }) },
    ],
  },
  {
    id: 'night-5-spotlight', day: 5, threshold: 45, kicker: '夜间突发 · 探照灯', title: '北侧探照灯熄灭',
    body: '围栏外立刻只剩下一片移动的黑。阿梁说必须在下一次撞击前恢复视野。',
    choices: [
      { id: 'aliang', label: '让阿梁摸黑检查线路', detail: '守夜判定。', risk: '高', checkLabel: '守夜判定', check: { label: '摸黑恢复探照灯', actorId: 'aliang', skill: 'watch', building: 'watchPost', outcomes: {
        failure: effect('探照灯没有恢复', '阿梁只能退回来，尸潮趁黑靠近。', { pressure: 12, power: -3 }),
        partial: effect('探照灯断断续续亮起', '视野回来了，但线路还在跳。', { pressure: -4, power: -4, actor: { id: 'aliang', energy: -10 } }),
        success: effect('探照灯重新扫过围栏', '黑暗里的一整片尸影被提前看见。', { pressure: -10, defense: 5, flag: 'spotlight_restored' }),
        critical: effect('探照灯恢复并锁定尸群缺口', '阿梁喊出了最薄的一段，所有人都知道该守哪里。', { pressure: -14, defense: 10, hope: 2, flag: 'spotlight_restored' }),
      } } },
      { id: 'battery', label: '直接接应急电池', detail: '消耗街区电力换稳定照明。', direct: effect('应急电池接入探照灯', '不用赌，但今晚主灯会更吃紧。', { power: -12, pressure: -8, flag: 'spotlight_restored' }) },
    ],
  },
  {
    id: 'night-6-radio', day: 6, threshold: 40, kicker: '夜间突发 · 广播亭', title: '陌生频率突然清晰',
    body: '“余烬街，如果你们听得到——尸群前面还有第二波。”只有几秒能把信息听完整。',
    choices: [
      { id: 'xiaoman', label: '让小满锁住频率', detail: '广播判定，成功会直接改善今晚与 DAY 7 的准备。', checkLabel: '广播判定', check: { label: '锁定尸潮广播', actorId: 'xiaoman', skill: 'radio', building: 'radio', bonusFlags: [{ flag: 'radio_contact', label: '之前建立过通联', value: 1 }], outcomes: {
        failure: effect('频率再次丢失', '只记住“第二波”三个字。', { hope: -1, flag: 'second_wave_rumor' }),
        partial: effect('听清了第二波方向', '至少知道北口不是唯一压力点。', { defense: 6, flag: 'second_wave_known' }),
        success: effect('完整收到尸潮路线', '小满把路线直接写到守夜地图上。', { defense: 12, hope: 2, flag: 'horde_route_broadcast' }),
        critical: effect('对方还报出了时间差', '两波尸潮之间有一个短空档。', { defense: 15, pressure: -8, hope: 3, flag: 'horde_timing_known' }),
      } } },
      { id: 'ignore', label: '不分心，继续守夜', detail: '保持当前节奏，不冒额外风险。', direct: effect('广播被压回静音', '所有人继续盯着眼前的围栏。', {}) },
    ],
  },
  {
    id: 'night-7-main-light', day: 7, threshold: 48, kicker: 'DAY 7 · 主灯塔', title: '主灯突然跳闸',
    body: '整条街黑了一瞬。尸潮的撞击声反而更清楚。老周已经冲到配电箱前。', quote: '老周：“给我半分钟。”',
    choices: [
      { id: 'repair', label: '让老周抢修主灯', detail: '过去几天对线路的准备会全部进入这次判定。', risk: '高', checkLabel: '关键维修判定', check: { label: '让主灯重新亮起', actorId: 'zhou', skill: 'repair', building: 'workshop', bonusFlags: [
        { flag: 'generator_stable', label: '提前稳定发电机', value: 1 }, { flag: 'power_bus_rewired', label: '重新分配过负载', value: 1 }, { flag: 'voltage_regulator', label: '稳压模块', value: 1 },
      ], outcomes: {
        failure: effect('主灯没有亮', '配给站改用手电。尸潮在黑暗里继续撞击。', { power: -15, pressure: 15, hope: -2, flag: 'main_light_failed' }),
        partial: effect('主灯重新亮了，但不稳定', '灯每隔几秒闪一下。至少所有人还能看见彼此。', { power: -8, pressure: -3, actor: { id: 'zhou', energy: -15 }, flag: 'main_light_flicker' }),
        success: effect('主灯重新亮起', '尸影重新出现在围栏外。老周拍了一下配电箱：“我说过，它还能亮。”', { power: 4, pressure: -12, hope: 4, flag: 'main_light_restored' }),
        critical: effect('整条线路一起恢复', '主灯、诊疗站、探照灯同时亮起。街上有人忍不住喊了一声。', { power: 10, pressure: -18, defense: 8, hope: 6, flag: 'main_light_restored' }),
      } } },
      { id: 'dark', label: '保持黑暗，降低暴露', detail: '不抢修，用黑暗换一点尸潮缓解。', direct: effect('主灯保持熄灭', '街区进入手电模式。尸群少了一点目标，但远处的人也看不见这里。', { power: 8, pressure: -10, hope: -3, flag: 'main_light_kept_dark' }) },
    ],
  },
  {
    id: 'night-7-north-gate', day: 7, threshold: 22, kicker: 'DAY 7 · 北侧围栏', title: '北门支撑结构开始弯曲',
    body: '第二波尸潮压上来了。围栏不是断，而是整片往里弯。这个时候只能决定谁去顶住它。',
    choices: [
      { id: 'hold', label: '让守夜组一起顶住', detail: '阿梁的判断、围栏准备和此前路线情报都会影响这一次。', risk: '高', checkLabel: '最终守夜判定', check: { label: '守住北门第二波', actorId: 'aliang', skill: 'watch', building: 'watchPost', bonusFlags: [
        { flag: 'north_gate_reinforced', label: '北门提前加固', value: 1 }, { flag: 'horde_direction_known', label: '提前知道尸潮方向', value: 1 }, { flag: 'horde_route_broadcast', label: '收到完整路线', value: 1 },
      ], outcomes: {
        failure: effect('北门被压开一道口子', '大家退到第二道障碍后。街还没失守，但最后二十秒会非常难。', { defense: -18, pressure: 18, hope: -2, flag: 'north_gate_breached' }),
        partial: effect('北门弯了，但没开', '阿梁肩膀撞伤，所有人继续顶着。', { defense: -8, pressure: 2, actor: { id: 'aliang', injury: 'minor', energy: -15 }, flag: 'north_gate_holding' }),
        success: effect('第二波被挡在北门外', '支撑结构吱呀作响，但没有再往里一步。', { pressure: -16, defense: 8, hope: 4, flag: 'north_gate_held' }),
        critical: effect('尸潮冲击被导向废墟侧面', '阿梁喊对了方向，第二波撞在最厚的一段结构上。', { pressure: -24, defense: 14, hope: 6, flag: 'north_gate_held' }),
      } } },
      { id: 'parts', label: '把所有备用零件压上去', detail: '消耗 4 个零件，直接换结构强度。', direct: effect('备用钢件全部压到北门', '这是最笨也最可靠的办法。', { parts: -4, defense: 12, pressure: -10, flag: 'north_gate_held' }) },
    ],
  },
];

function addFeed(state: GameState, title: string, body: string, tone: LogTone = 'neutral'): GameState {
  const feed = state.nightFeed ?? [];
  return { ...state, nightFeed: [...feed.slice(-7), { id: `${state.day}-${title}-${feed.length}`, time: title, title, body, tone }] };
}

function initNight(state: GameState): GameState {
  if (state.nightStoryDay === state.day) return state;
  return { ...state, nightStoryDay: state.day, nightFeed: [], nightNarrativeFlags: [], nightIncidentId: null, pendingCheck: null };
}

export function advanceNightNarrative(previous: GameState, input: GameState): GameState {
  if (input.forecast.title.startsWith('今夜挑战')) return input;
  let state = initNight(input);
  const flags = new Set(state.nightNarrativeFlags ?? []);
  for (const beat of BEATS) {
    const marker = `beat:${beat.id}`;
    if (beat.day === state.day && state.nightRemainingMs <= beat.threshold * 1000 && !flags.has(marker)) {
      state = addFeed(state, beat.title, beat.body, beat.tone ?? 'neutral');
      flags.add(marker);
    }
  }
  if (!state.nightIncidentId && !state.pendingCheck) {
    const incident = INCIDENTS.find((item) => item.day === state.day && state.nightRemainingMs <= item.threshold * 1000 && !flags.has(`incident:${item.id}`));
    if (incident) state = { ...state, nightIncidentId: incident.id };
  }
  return { ...state, nightNarrativeFlags: [...flags] };
}

export function nightIncidentForState(state: GameState): NightIncidentView | null {
  const incident = INCIDENTS.find((item) => item.id === state.nightIncidentId);
  if (!incident) return null;
  const { day: _day, threshold: _threshold, choices, ...view } = incident;
  return { ...view, choices: choices.map(({ direct: _direct, check: _check, ...choice }) => choice) };
}

function modifiersFor(state: GameState, check: NightCheck): CheckModifier[] {
  const modifiers: CheckModifier[] = [];
  const actor = check.actorId ? state.survivors.find((item) => item.id === check.actorId) : undefined;
  if (actor && check.skill && actor.specialty === check.skill) modifiers.push({ label: `${actor.name} · 专长`, value: 1 });
  if (actor?.injury === 'minor') modifiers.push({ label: `${actor.name} · 轻伤`, value: -1 });
  if (actor?.injury === 'serious') modifiers.push({ label: `${actor.name} · 重伤`, value: -2 });
  if (actor && actor.energy < 40) modifiers.push({ label: `${actor.name} · 疲劳`, value: -1 });
  if (check.building && state.buildings[check.building]) modifiers.push({ label: '对应设施在线', value: 1 });
  for (const bonus of check.bonusFlags ?? []) if (hasFlag(state, bonus.flag)) modifiers.push({ label: bonus.label, value: bonus.value });
  if ((state.power ?? 62) < 25 && check.label.includes('灯')) modifiers.push({ label: '电力濒危', value: -1 });
  return modifiers;
}

function applyNightEffect(state: GameState, item: NightEffect): GameState {
  let survivors = state.survivors;
  if (item.actor) {
    survivors = survivors.map((actor) => actor.id === item.actor!.id ? {
      ...actor,
      energy: item.actor!.energy === undefined ? actor.energy : clamp(actor.energy + item.actor!.energy, 0, 100),
      injury: item.actor!.injury ?? actor.injury,
    } : actor);
  }
  const storyFlags = new Set(state.storyFlags ?? []);
  if (item.flag) storyFlags.add(item.flag);
  let next: GameState = {
    ...state,
    hope: Math.max(0, state.hope + (item.hope ?? 0)),
    power: clamp((state.power ?? 62) + (item.power ?? 0)),
    defense: clamp((state.defense ?? 50) + (item.defense ?? 0)),
    hordePressure: clamp(state.hordePressure + (item.pressure ?? 0)),
    supplies: Math.max(0, state.supplies + (item.supplies ?? 0)),
    medicine: Math.max(0, state.medicine + (item.medicine ?? 0)),
    parts: Math.max(0, state.parts + (item.parts ?? 0)),
    survivors,
    storyFlags: [...storyFlags],
  };
  next = addFeed(next, item.feed.title, item.feed.body, item.feed.tone ?? 'neutral');
  return next;
}

function getIncident(id: string): NightIncidentDefinition | undefined {
  return INCIDENTS.find((item) => item.id === id);
}

export function beginNightIncidentChoice(state: GameState, choiceId: string): GameState {
  const incident = state.nightIncidentId ? getIncident(state.nightIncidentId) : undefined;
  const choice = incident?.choices.find((item) => item.id === choiceId);
  if (!incident || !choice || state.pendingCheck) return state;
  if (choice.check) {
    return createPendingCheck(state, {
      source: 'night', eventId: incident.id, choiceId,
      label: choice.check.label,
      actorId: choice.check.actorId,
      mode: choice.check.mode ?? 'normal',
      modifiers: modifiersFor(state, choice.check),
    });
  }
  if (!choice.direct) return state;
  const flags = new Set(state.nightNarrativeFlags ?? []);
  flags.add(`incident:${incident.id}`);
  return { ...applyNightEffect(state, choice.direct), nightIncidentId: null, nightNarrativeFlags: [...flags] };
}

export function acceptNightCheck(state: GameState): GameState {
  const pending = state.pendingCheck;
  if (!pending || pending.source !== 'night' || !pending.outcome) return state;
  const incident = getIncident(pending.eventId);
  const choice = incident?.choices.find((item) => item.id === pending.choiceId);
  const result = choice?.check?.outcomes[pending.outcome];
  if (!incident || !result) return { ...state, pendingCheck: null };
  const flags = new Set(state.nightNarrativeFlags ?? []);
  flags.add(`incident:${incident.id}`);
  let next = applyNightEffect(state, result);
  if (pending.twist === 'double-six') next = addFeed(next, '双六', '这一下不只是撑住了，还让局势朝更好的方向偏了一点。', 'hope');
  if (pending.twist === 'double-one') next = addFeed(next, '双一', '没有人死，但代价立刻留在了街上。', 'danger');
  return { ...next, pendingCheck: null, nightIncidentId: null, nightNarrativeFlags: [...flags] };
}

export function nightStoryContentCount(): number {
  return BEATS.length + INCIDENTS.length;
}
