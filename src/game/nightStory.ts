import { CHAPTER_FINAL_DAY, nightDurationFor } from './config';
import { createPendingCheck } from './dice';
import type { CheckModifier, CheckOutcome, GameState, InjuryState, LogTone, Role, RollMode } from './types';

export interface NightIncidentChoiceView { id: string; label: string; detail: string; risk?: string; checkLabel?: string; }
export interface NightIncidentView { id: string; kicker: string; title: string; body: string; quote?: string; choices: NightIncidentChoiceView[]; }

interface NightEffect {
  hope?: number; power?: number; defense?: number; pressure?: number; supplies?: number; medicine?: number; parts?: number; flag?: string;
  actor?: { id: string; energy?: number; injury?: InjuryState };
  feed: { title: string; body: string; tone?: LogTone };
}
interface NightCheck {
  label: string; actorId?: string; skill?: Role; mode?: RollMode;
  building?: 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';
  bonusFlags?: Array<{ flag: string; label: string; value: number }>;
  outcomes: Record<CheckOutcome, NightEffect>;
}
interface NightIncidentChoice extends NightIncidentChoiceView { direct?: NightEffect; check?: NightCheck; }
interface NightIncidentDefinition extends Omit<NightIncidentView, 'choices'> { day: number; ratio: number; choices: NightIncidentChoice[]; }

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const hasFlag = (state: GameState, flag: string) => (state.storyFlags ?? []).includes(flag);
const effect = (title: string, body: string, values: Omit<NightEffect, 'feed'> = {}): NightEffect => ({ ...values, feed: { title, body, tone: values.pressure && values.pressure > 0 ? 'danger' : values.hope && values.hope > 0 ? 'hope' : 'neutral' } });

const EARLY_FEED = [
  '远处传来一阵拖步声，很快又被风压了下去。',
  '守夜岗转动探照灯，废墟边缘有几道影子停了一瞬。',
  '围栏外滚过一个空罐头盒。所有人都听见了。',
  '广播里只有白噪声，偶尔夹着听不清的人声。',
  '小灰从配给站下面钻出来，又很快消失在灯影里。',
  '街西传来玻璃碎裂声。没有人离开自己的岗位。',
  '发电机咳嗽了一声，主灯没有灭。',
  '阿梁抬手示意所有人安静，听了十几秒才放下。',
  '诊疗站的门开了一次，又关上。',
  '风把远处烧焦的味道吹进街里。',
];
const LATE_FEED = [
  '撞击之间的间隔正在变长。没人敢提前说安全。',
  '配给站还有灯，围栏也还站着。今晚还没结束。',
  '有人在黑暗里问还有多久天亮，没有人回答。',
  '老周沿着围栏走了一遍，手一直没有离开扳手。',
  '阿禾把最后一锅热水留在门边，谁需要谁自己拿。',
  '探照灯扫过空地时，尸影已经比半小时前稀了一点。',
  '广播里短暂出现一段旧音乐，随后又只剩静电。',
  '主灯的光落在湿地面上，像一条很窄的回家路。',
  '远处有一声很长的低吼，但没有更近。',
  '有人说东方的天色似乎变浅了，也可能只是错觉。',
];

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) { value ^= input.charCodeAt(i); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

const INCIDENTS: NightIncidentDefinition[] = [
  {
    id: 'night-5-fence', day: 5, ratio: .48, kicker: '阶段突发 · 北侧围栏', title: '一根支撑杆突然脱焊',
    body: '围栏向街内歪了半尺。继续放着不管，下一次撞击会压在同一个位置。',
    choices: [
      { id: 'zhou', label: '让老周出去抢修', detail: '暂停倒计时，做一次维修判定。', risk: '中', checkLabel: '维修判定', check: { label: '夜间抢修围栏', actorId: 'zhou', skill: 'repair', building: 'workshop', outcomes: {
        failure: effect('围栏没焊住', '老周被迫退回，缺口继续受压。', { pressure: 10, actor: { id: 'zhou', energy: -12 } }),
        partial: effect('支撑杆勉强固定', '能撑今晚，但老周被铁皮划伤。', { defense: 5, actor: { id: 'zhou', energy: -10, injury: 'minor' } }),
        success: effect('围栏重新站稳', '焊点吃住了下一次撞击。', { defense: 10, pressure: -8, flag: 'night_fence_saved' }),
        critical: effect('老周加了第二道支撑', '下一波撞击反而把结构越压越紧。', { defense: 15, pressure: -12, hope: 2, flag: 'night_fence_saved' }),
      } } },
      { id: 'brace', label: '用零件箱从里面顶住', detail: '消耗 2 个零件，不投骰。', direct: effect('零件箱顶住了缺口', '粗暴，但至少今晚它不会继续往里倒。', { parts: -2, defense: 6, pressure: -4, flag: 'night_fence_braced' }) },
    ],
  },
  {
    id: 'night-10-spotlight', day: 10, ratio: .52, kicker: 'DAY 10 · 第一轮尸潮', title: '北侧探照灯熄灭',
    body: '第一轮真正的尸潮压上来时，围栏外突然只剩一片移动的黑。',
    choices: [
      { id: 'aliang', label: '摸黑恢复线路', detail: '守夜判定；如果阿梁还没加入，则没有专长加成。', risk: '高', checkLabel: '守夜判定', check: { label: '恢复探照灯', actorId: 'aliang', skill: 'watch', building: 'watchPost', outcomes: {
        failure: effect('探照灯没有恢复', '尸群趁黑靠近了一整段。', { pressure: 14, power: -3 }),
        partial: effect('探照灯断续亮起', '视野回来一点，但线路仍然在跳。', { pressure: -4, power: -4 }),
        success: effect('探照灯重新扫过围栏', '第一轮尸潮最密的一段被提前看见。', { pressure: -12, defense: 6, flag: 'spotlight_restored' }),
        critical: effect('探照灯锁定尸群缺口', '守夜组抓到了最薄的一段冲击。', { pressure: -18, defense: 10, hope: 3, flag: 'spotlight_restored' }),
      } } },
      { id: 'battery', label: '直接接应急电池', detail: '消耗电力，跳过风险。', direct: effect('应急电池接入探照灯', '不用赌，但今晚主灯会更吃紧。', { power: -12, pressure: -9, flag: 'spotlight_restored' }) },
    ],
  },
  {
    id: 'night-15-wounded', day: 15, ratio: .45, kicker: 'DAY 15 · 半月', title: '一名伤员突然失去意识',
    body: '程医生说还有机会，但她需要几分钟不被打断。',
    choices: [
      { id: 'cheng', label: '让程医生处理', detail: '医疗判定；诊疗站和此前保留的药都会影响结果。', risk: '中', checkLabel: '医疗判定', check: { label: '稳定伤员', actorId: 'cheng', skill: 'medical', building: 'clinic', bonusFlags: [{ flag: 'last_antibiotic_reserved', label: '保留的抗生素', value: 1 }], outcomes: {
        failure: effect('伤员没能稳定下来', '诊疗站一下安静了。', { hope: -2, medicine: -1 }),
        partial: effect('伤员暂时稳定', '最危险的几分钟过去了。', { medicine: -1, hope: 1 }),
        success: effect('伤员醒了', '程医生把灯调暗，示意大家继续守夜。', { medicine: -1, hope: 3, flag: 'night_patient_saved' }),
        critical: effect('伤员很快恢复意识', '他醒来第一句是：“我还能帮忙。”', { hope: 5, medicine: 1, flag: 'night_patient_saved' }),
      } } },
      { id: 'medicine', label: '直接用备用药品', detail: '消耗 2 份药品，跳过风险。', direct: effect('备用药顶上了', '伤员情况稳定下来。', { medicine: -2, hope: 2, flag: 'night_patient_saved' }) },
    ],
  },
  {
    id: 'night-20-radio', day: 20, ratio: .58, kicker: 'DAY 20 · 第二轮尸潮', title: '陌生频率突然清晰',
    body: '“余烬街，如果听得到——你们前面还有第二波。”只有几秒能把信息听完整。',
    choices: [
      { id: 'xiaoman', label: '让小满锁住频率', detail: '广播判定，过去的通联会转化成修正。', checkLabel: '广播判定', check: { label: '锁定尸潮广播', actorId: 'xiaoman', skill: 'radio', building: 'radio', bonusFlags: [{ flag: 'radio_contact', label: '之前建立过通联', value: 1 }], outcomes: {
        failure: effect('频率再次丢失', '只记住“第二波”三个字。', { hope: -1, flag: 'second_wave_rumor' }),
        partial: effect('听清了第二波方向', '至少知道北口不是唯一压力点。', { defense: 7, flag: 'second_wave_known' }),
        success: effect('完整收到尸潮路线', '路线直接被写到守夜地图上。', { defense: 13, hope: 2, flag: 'horde_route_broadcast' }),
        critical: effect('连时间差也听清了', '两波尸潮之间有一个短空档。', { defense: 16, pressure: -10, hope: 4, flag: 'horde_timing_known' }),
      } } },
      { id: 'ignore', label: '不分心，继续守夜', detail: '保持当前节奏。', direct: effect('广播被压回静音', '所有人继续盯着眼前的围栏。', {}) },
    ],
  },
  {
    id: 'night-25-generator', day: 25, ratio: .43, kicker: 'DAY 25 · 围城前兆', title: '发电机连续跳了三次',
    body: '离最终尸潮只剩五天，主灯线路却开始出现最危险的症状。',
    choices: [
      { id: 'zhou', label: '让老周带电检修', detail: '维修判定，过去找到的稳压模块会产生加成。', risk: '高', checkLabel: '维修判定', check: { label: '稳定主灯线路', actorId: 'zhou', skill: 'repair', building: 'workshop', bonusFlags: [{ flag: 'voltage_regulator', label: '稳压模块', value: 1 }, { flag: 'generator_stable', label: '此前检修经验', value: 1 }], outcomes: {
        failure: effect('线路依旧不稳', '今晚还能亮，但 DAY 30 会留下隐患。', { power: -10, flag: 'late_generator_unstable' }),
        partial: effect('临时压住跳闸', '至少未来几夜不会突然全黑。', { power: 5, flag: 'late_generator_patched' }),
        success: effect('主线路恢复稳定', '配电箱的指针终于不再跳。', { power: 14, flag: 'final_power_ready' }),
        critical: effect('主灯拥有独立备用回路', '老周把最后一段旧线也重新接了。', { power: 18, defense: 5, hope: 3, flag: 'final_power_ready' }),
      } } },
      { id: 'dim', label: '从今晚开始降低亮度', detail: '省电，把风险往后推。', direct: effect('街区进入节电模式', '主灯暗了一档，但电池库存终于不再往下掉。', { power: 10, hope: -1, flag: 'late_power_saving' }) },
    ],
  },
  {
    id: 'night-30-main-light', day: CHAPTER_FINAL_DAY, ratio: .56, kicker: 'DAY 30 · 最终尸潮', title: '主灯突然跳闸',
    body: '整条街黑了一瞬。三十天的准备，现在全部落在这个配电箱上。', quote: '老周：“给我半分钟。”',
    choices: [
      { id: 'repair', label: '让老周抢修主灯', detail: '线路准备、稳压模块与信任都会进入这次判定。', risk: '高', checkLabel: '关键维修判定', check: { label: '让主灯重新亮起', actorId: 'zhou', skill: 'repair', building: 'workshop', bonusFlags: [
        { flag: 'generator_stable', label: '提前稳定过发电机', value: 1 }, { flag: 'power_bus_rewired', label: '重新分配过负载', value: 1 }, { flag: 'voltage_regulator', label: '稳压模块', value: 1 }, { flag: 'final_power_ready', label: '最后五天完成检修', value: 1 },
      ], outcomes: {
        failure: effect('主灯没有亮', '配给站改用手电。尸潮在黑暗里继续撞击。', { power: -15, pressure: 16, hope: -2, flag: 'main_light_failed' }),
        partial: effect('主灯重新亮了，但不稳定', '至少所有人还能看见彼此。', { power: -8, pressure: -3, actor: { id: 'zhou', energy: -15 }, flag: 'main_light_flicker' }),
        success: effect('主灯重新亮起', '老周拍了一下配电箱：“三十天了，它还亮。”', { power: 4, pressure: -14, hope: 5, flag: 'main_light_restored' }),
        critical: effect('整条线路一起恢复', '主灯、诊疗站、探照灯同时亮起。街上有人喊了一声。', { power: 12, pressure: -20, defense: 8, hope: 8, flag: 'main_light_restored' }),
      } } },
      { id: 'dark', label: '保持黑暗，降低暴露', detail: '不抢修，用黑暗换尸潮缓解。', direct: effect('主灯保持熄灭', '尸群少了目标，但远处的人也看不见这里。', { power: 8, pressure: -11, hope: -4, flag: 'main_light_kept_dark' }) },
    ],
  },
  {
    id: 'night-30-north-gate', day: CHAPTER_FINAL_DAY, ratio: .22, kicker: 'DAY 30 · 北侧围栏', title: '最后一波把整片围栏向里压弯',
    body: '不是一根杆，也不是一个焊点。三十天里所有加固、路线情报和守夜经验都在这一刻兑现。',
    choices: [
      { id: 'hold', label: '让守夜组一起顶住', detail: '北门加固、尸潮方向、广播路线都会进入判定。', risk: '高', checkLabel: '最终守夜判定', check: { label: '守住最后一波', actorId: 'aliang', skill: 'watch', building: 'watchPost', bonusFlags: [
        { flag: 'north_gate_reinforced', label: '北门提前加固', value: 1 }, { flag: 'horde_direction_known', label: '提前知道方向', value: 1 }, { flag: 'horde_route_broadcast', label: '收到完整路线', value: 1 }, { flag: 'horde_timing_known', label: '知道两波时间差', value: 1 },
      ], outcomes: {
        failure: effect('北门被压开一道口子', '大家退到第二道障碍。最后一段时间会非常难。', { defense: -18, pressure: 20, hope: -2, flag: 'north_gate_breached' }),
        partial: effect('北门弯了，但没开', '阿梁肩膀撞伤，所有人继续顶着。', { defense: -8, pressure: 3, actor: { id: 'aliang', injury: 'minor', energy: -15 }, flag: 'north_gate_holding' }),
        success: effect('最后一波被挡在北门外', '支撑结构吱呀作响，但没有再往里一步。', { pressure: -18, defense: 8, hope: 5, flag: 'north_gate_held' }),
        critical: effect('尸潮冲击被导向废墟侧面', '阿梁喊对了方向。三十天积累的经验终于有了答案。', { pressure: -28, defense: 15, hope: 8, flag: 'north_gate_held' }),
      } } },
      { id: 'parts', label: '把所有备用钢件压上去', detail: '消耗 4 个零件，直接换结构强度。', direct: effect('备用钢件全部压到北门', '这是最笨也最可靠的办法。', { parts: -4, defense: 13, pressure: -12, flag: 'north_gate_held' }) },
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

export function advanceNightNarrative(_previous: GameState, input: GameState): GameState {
  if (input.forecast.title.startsWith('今夜挑战') || input.phase !== 'night') return input;
  let state = initNight(input);
  const flags = new Set(state.nightNarrativeFlags ?? []);
  const duration = nightDurationFor(state.day);
  const ratio = duration > 0 ? state.nightRemainingMs / duration : 0;
  if (ratio <= .68 && !flags.has('feed:early')) {
    state = addFeed(state, '夜间记录', EARLY_FEED[hash(`${state.seed}:${state.day}:early`) % EARLY_FEED.length], state.day >= 24 ? 'danger' : 'neutral');
    flags.add('feed:early');
  }
  if (ratio <= .32 && !flags.has('feed:late')) {
    state = addFeed(state, '后半夜', LATE_FEED[hash(`${state.seed}:${state.day}:late`) % LATE_FEED.length], state.day >= 20 ? 'danger' : 'neutral');
    flags.add('feed:late');
  }
  if (state.day === CHAPTER_FINAL_DAY) {
    const finalBeats = [
      { key: 'final:82', ratio: .82, body: '小满：“高架那边……全是。”' },
      { key: 'final:70', ratio: .70, body: '第一波尸群撞上围栏，整条街像被推了一下。' },
      { key: 'final:38', ratio: .38, body: '阿禾：“配给站还有人吗？” 林夏：“有。”' },
      { key: 'final:10', ratio: .10, body: '撞击声第一次开始变稀。没有人敢提前说天亮。' },
      { key: 'final:04', ratio: .04, body: '远处有人喊了一句：“天亮了。”' },
    ];
    for (const beat of finalBeats) if (ratio <= beat.ratio && !flags.has(beat.key)) { state = addFeed(state, 'DAY 30', beat.body, beat.ratio <= .10 ? 'hope' : 'danger'); flags.add(beat.key); }
  }
  if (!state.nightIncidentId && !state.pendingCheck) {
    const incident = INCIDENTS.find((item) => item.day === state.day && ratio <= item.ratio && !flags.has(`incident:${item.id}`));
    if (incident) state = { ...state, nightIncidentId: incident.id };
  }
  return { ...state, nightNarrativeFlags: [...flags] };
}

export function nightIncidentForState(state: GameState): NightIncidentView | null {
  const incident = INCIDENTS.find((item) => item.id === state.nightIncidentId);
  if (!incident) return null;
  const { day: _day, ratio: _ratio, choices, ...view } = incident;
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
  return modifiers;
}
function applyNightEffect(state: GameState, item: NightEffect): GameState {
  let survivors = state.survivors;
  if (item.actor) survivors = survivors.map((actor) => actor.id === item.actor!.id ? { ...actor, energy: item.actor!.energy === undefined ? actor.energy : clamp(actor.energy + item.actor!.energy, 0, 100), injury: item.actor!.injury ?? actor.injury } : actor);
  const storyFlags = new Set(state.storyFlags ?? []); if (item.flag) storyFlags.add(item.flag);
  let next: GameState = { ...state, hope: Math.max(0, state.hope + (item.hope ?? 0)), power: clamp((state.power ?? 62) + (item.power ?? 0)), defense: clamp((state.defense ?? 50) + (item.defense ?? 0)), hordePressure: clamp(state.hordePressure + (item.pressure ?? 0)), supplies: Math.max(0, state.supplies + (item.supplies ?? 0)), medicine: Math.max(0, state.medicine + (item.medicine ?? 0)), parts: Math.max(0, state.parts + (item.parts ?? 0)), survivors, storyFlags: [...storyFlags] };
  next = addFeed(next, item.feed.title, item.feed.body, item.feed.tone ?? 'neutral');
  return next;
}
function getIncident(id: string): NightIncidentDefinition | undefined { return INCIDENTS.find((item) => item.id === id); }

export function beginNightIncidentChoice(state: GameState, choiceId: string): GameState {
  const incident = state.nightIncidentId ? getIncident(state.nightIncidentId) : undefined;
  const choice = incident?.choices.find((item) => item.id === choiceId);
  if (!incident || !choice || state.pendingCheck) return state;
  if (choice.check) return createPendingCheck(state, { source: 'night', eventId: incident.id, choiceId, label: choice.check.label, actorId: choice.check.actorId, mode: choice.check.mode ?? 'normal', modifiers: modifiersFor(state, choice.check) });
  if (!choice.direct) return state;
  const flags = new Set(state.nightNarrativeFlags ?? []); flags.add(`incident:${incident.id}`);
  return { ...applyNightEffect(state, choice.direct), nightIncidentId: null, nightNarrativeFlags: [...flags] };
}
export function acceptNightCheck(state: GameState): GameState {
  const pending = state.pendingCheck;
  if (!pending || pending.source !== 'night' || !pending.outcome) return state;
  const incident = getIncident(pending.eventId); const choice = incident?.choices.find((item) => item.id === pending.choiceId); const result = choice?.check?.outcomes[pending.outcome];
  if (!incident || !result) return { ...state, pendingCheck: null };
  const flags = new Set(state.nightNarrativeFlags ?? []); flags.add(`incident:${incident.id}`);
  let next = applyNightEffect(state, result);
  if (pending.twist === 'double-six') next = addFeed(next, '双六', '这一下不只是撑住了，还让局势朝更好的方向偏了一点。', 'hope');
  if (pending.twist === 'double-one') next = addFeed(next, '双一', '没有永久死亡，但代价立刻留在了街上。', 'danger');
  return { ...next, pendingCheck: null, nightIncidentId: null, nightNarrativeFlags: [...flags] };
}
export function nightStoryContentCount(): number { return EARLY_FEED.length + LATE_FEED.length + INCIDENTS.length + 5; }
