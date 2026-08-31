import type { GameState, LogTone, StreetLogEntry, Survivor } from './types';

export interface EventChoiceView {
  id: string;
  label: string;
  detail: string;
  cost?: string;
  risk?: string;
}

export interface NarrativeEventView {
  id: string;
  day: number;
  kicker: string;
  title: string;
  body: string;
  quote?: string;
  choices: EventChoiceView[];
}

type ChoiceEffect = (state: GameState) => GameState;

interface NarrativeEventDefinition extends NarrativeEventView {
  effects: Record<string, ChoiceEffect>;
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function updateSurvivor(state: GameState, id: string, updater: (survivor: Survivor) => Survivor): GameState {
  return { ...state, survivors: state.survivors.map((survivor) => survivor.id === id ? updater(survivor) : survivor) };
}

function trustUp(state: GameState, id: string): GameState {
  return updateSurvivor(state, id, (survivor) => ({ ...survivor, trust: Math.min(3, (survivor.trust ?? 0) + 1) as 0 | 1 | 2 | 3 }));
}

export function appendLog(state: GameState, title: string, body: string, tone: LogTone = 'neutral', time = '12:00'): GameState {
  const logs = state.logs ?? [];
  const entry: StreetLogEntry = {
    id: `${state.day}-${time}-${logs.length}-${title}`,
    day: state.day,
    time,
    title,
    body,
    tone,
  };
  return { ...state, logs: [...logs.slice(-39), entry] };
}

const EVENTS: NarrativeEventDefinition[] = [
  {
    id: 'day-1-broken-lamp',
    day: 1,
    kicker: 'DAY 1 · 10:20 · 街口',
    title: '坏掉的路灯',
    body: '天亮以后，你才看清街口还有一盏旧路灯。线路已经烧黑，但灯罩完整。修它不一定实用，却会让远处的人知道这里还有人。',
    quote: '“有灯，就有人会往这里走。”',
    choices: [
      { id: 'repair', label: '先把它修亮', detail: '用一点刚攒下的零件换来更稳定的希望。', cost: '零件 -1', risk: '低' },
      { id: 'salvage', label: '拆下还能用的部件', detail: '不浪费资源，先把活下去放在第一位。', cost: '获得零件 +2', risk: '无' },
    ],
    effects: {
      repair: (state) => appendLog({ ...state, parts: Math.max(0, state.parts - 1), hope: state.hope + 3, power: clamp((state.power ?? 62) + 4) }, '街口亮了一盏灯', '旧路灯重新亮起，光很弱，但整条街第一次有了“入口”。', 'hope', '10:35'),
      salvage: (state) => appendLog({ ...state, parts: state.parts + 2 }, '拆下旧路灯', '老旧线路被拆成了还能用的接头和保险丝。街口仍然很黑。', 'resource', '10:35'),
    },
  },
  {
    id: 'day-2-pharmacy',
    day: 2,
    kicker: 'DAY 2 · 14:37 · 西街',
    title: '废弃药店',
    body: '林夏在西街发现一间半塌的药店。卷帘门后有翻倒的药柜，门口有感染者留下的新鲜痕迹。',
    quote: '林夏：“后门还能进。我先看过退路了。”',
    choices: [
      { id: 'enter', label: '让林夏进去搜索', detail: '带回药品，但会消耗她的精力。', cost: '林夏精力 -18', risk: '中' },
      { id: 'observe', label: '只记录安全路线', detail: '今天不冒险，换来更稳的防线与情报。', cost: '无资源消耗', risk: '低' },
      { id: 'leave', label: '立刻离开', detail: '保存状态，不让一个机会拖垮整条街。', risk: '无' },
    ],
    effects: {
      enter: (state) => appendLog(trustUp(updateSurvivor({ ...state, medicine: state.medicine + 3 }, 'lin-xia', (survivor) => ({ ...survivor, energy: Math.max(25, survivor.energy - 18) })), 'lin-xia'), '林夏从药店回来', '药品 +3。她衣袖上都是灰，但确认西街还有可搜索区域。', 'resource', '15:18'),
      observe: (state) => appendLog(trustUp({ ...state, defense: clamp((state.defense ?? 50) + 6) }, 'lin-xia'), '西街路线被记下', '林夏没有进门，而是把附近巷口、尸群方向和撤退路线画进地图。', 'neutral', '15:06'),
      leave: (state) => appendLog(state, '今天不冒险', '药店被标记在地图上。没有收获，也没有人受伤。', 'neutral', '14:51'),
    },
  },
  {
    id: 'day-3-fence',
    day: 3,
    kicker: 'DAY 3 · 11:46 · 北侧围栏',
    title: '第一声撞击之后',
    body: '昨夜的撞击把北侧围栏顶出了一道弧。老周蹲在焊点旁，说现在修还来得及。',
    quote: '老周：“再挨一晚，它可就不是弯这么简单了。”',
    choices: [
      { id: 'reinforce', label: '优先加固围栏', detail: '今晚更稳，但会消耗零件。', cost: '零件 -3', risk: '低' },
      { id: 'patch', label: '只做应急补丁', detail: '省下零件，防线只得到小幅恢复。', cost: '零件 -1', risk: '中' },
      { id: 'brace', label: '先用木板顶住', detail: '不花零件，但所有人都知道只是拖时间。', cost: '希望 -1', risk: '高' },
    ],
    effects: {
      reinforce: (state) => appendLog(trustUp({ ...state, parts: Math.max(0, state.parts - 3), defense: clamp((state.defense ?? 48) + 20) }, 'zhou'), '北侧围栏重新站直', '老周把最薄的三处焊点全部补了一遍。今晚开场压力会更低。', 'hope', '13:05'),
      patch: (state) => appendLog({ ...state, parts: Math.max(0, state.parts - 1), defense: clamp((state.defense ?? 48) + 8) }, '围栏做了应急补丁', '能撑，但所有人都知道这不是长久办法。', 'neutral', '12:32'),
      brace: (state) => appendLog({ ...state, hope: Math.max(0, state.hope - 1), defense: clamp((state.defense ?? 48) + 3) }, '木板顶住了缺口', '这是临时办法。每个人路过北口时都会多看一眼。', 'danger', '12:18'),
    },
  },
  {
    id: 'day-4-stranger',
    day: 4,
    kicker: 'DAY 4 · 16:10 · 南口',
    title: '一个发烧的陌生人',
    body: '两名陌生人扶着一个高烧的人停在围栏外。他们说不是感染，只是伤口发炎。药品已经不多了。',
    quote: '“求你们了，天黑前给他一针退烧的也行。”',
    choices: [
      { id: 'treat', label: '让程医生接手', detail: '消耗药品，换来希望与信任。', cost: '药品 -2', risk: '低' },
      { id: 'ration', label: '只给基础处理', detail: '保留核心药品，但效果有限。', cost: '药品 -1', risk: '中' },
      { id: 'refuse', label: '不开门', detail: '资源不动，街上的气氛会变冷。', cost: '希望 -2', risk: '无' },
    ],
    effects: {
      treat: (state) => appendLog(trustUp({ ...state, medicine: Math.max(0, state.medicine - 2), hope: state.hope + 4 }, 'cheng'), '陌生人留到了黄昏', '程医生确认不是感染。两名同伴答应明天带来他们知道的仓库位置。', 'hope', '17:02'),
      ration: (state) => appendLog({ ...state, medicine: Math.max(0, state.medicine - 1), hope: state.hope + 1 }, '做了最低限度处理', '人被送回围栏外的临时帐篷。没人知道他能不能熬过今晚。', 'neutral', '16:44'),
      refuse: (state) => appendLog({ ...state, hope: Math.max(0, state.hope - 2) }, '南口没有开门', '脚步声在天黑前离开。街里很安静，没有人讨论这件事。', 'danger', '16:21'),
    },
  },
  {
    id: 'day-5-blackout',
    day: 5,
    kicker: 'DAY 5 · 15:30 · 主灯线路',
    title: '停电预警',
    body: '主灯线路开始不规律跳闸。修理工坊认为是负载过高，诊疗站则坚持今晚不能断电。',
    quote: '广播里只剩下断续的电流声。',
    choices: [
      { id: 'medical', label: '优先保证诊疗站', detail: '夜间医疗更稳，但街区照明会变暗。', cost: '电力下降', risk: '中' },
      { id: 'fence', label: '优先保证探照灯', detail: '尸潮更容易被提前发现。', cost: '零件 -2', risk: '低' },
      { id: 'balanced', label: '轮流供电', detail: '没有一处满功率，但不会完全熄灭。', risk: '中' },
    ],
    effects: {
      medical: (state) => appendLog({ ...state, power: clamp((state.power ?? 62) - 12), medicine: state.medicine + 1, hope: state.hope + 1 }, '诊疗站今晚不断电', '其他路灯被主动熄灭，只留下诊疗站和主灯的两圈光。', 'neutral', '17:16'),
      fence: (state) => appendLog({ ...state, parts: Math.max(0, state.parts - 2), power: clamp((state.power ?? 62) + 8), defense: clamp((state.defense ?? 50) + 8) }, '探照灯线路被单独加固', '北侧照明恢复稳定，老周说今晚至少能更早看到尸群。', 'resource', '17:04'),
      balanced: (state) => appendLog({ ...state, power: clamp((state.power ?? 62) - 4), defense: clamp((state.defense ?? 50) + 3) }, '开始轮流供电', '广播、诊疗站和探照灯按时段切换，没有一个地方真正安心。', 'neutral', '17:22'),
    },
  },
  {
    id: 'day-6-radio',
    day: 6,
    kicker: 'DAY 6 · 18:05 · 广播亭',
    title: '尸潮正在靠近',
    body: '小满终于把断续的广播拼成一句完整警告：大规模尸群正沿高架向这里移动。今晚会是第一街段真正的考验。',
    quote: '小满：“不是零星游荡者。是一整片。”',
    choices: [
      { id: 'hold', label: '全街进入守夜状态', detail: '牺牲一部分白天产出，换取最高防线准备。', cost: '口粮 -2 · 零件 -2', risk: '低' },
      { id: 'supply', label: '优先囤配给物资', detail: '七格夜更宽裕，但防线提升有限。', cost: '零件 -1', risk: '中' },
      { id: 'calm', label: '不制造恐慌', detail: '维持希望，但不额外加固。', risk: '高' },
    ],
    effects: {
      hold: (state) => appendLog({ ...state, supplies: Math.max(0, state.supplies - 2), parts: Math.max(0, state.parts - 2), defense: clamp((state.defense ?? 50) + 24), power: clamp((state.power ?? 62) + 10), hope: state.hope + 2 }, '全街开始封门', '能搬的东西都压到了围栏后。今天没人抱怨少吃一顿。', 'hope', '19:10'),
      supply: (state) => appendLog({ ...state, parts: Math.max(0, state.parts - 1), supplies: state.supplies + 3, defense: clamp((state.defense ?? 50) + 8) }, '配给站堆满了箱子', '今晚货架会更从容，但北侧围栏还是那道旧围栏。', 'resource', '19:02'),
      calm: (state) => appendLog({ ...state, hope: state.hope + 3 }, '广播没有公布完整警报', '街上仍旧按平常节奏准备晚饭。只有值守的人知道远处正在发生什么。', 'danger', '18:42'),
    },
  },
];

export function eventForDay(day: number): NarrativeEventView | null {
  const event = EVENTS.find((item) => item.day === day);
  if (!event) return null;
  const { effects: _effects, ...view } = event;
  return view;
}

export function survivalSnapshot(state: GameState) {
  const residents = Math.max(1, state.survivors.length + 1);
  const rationDays = Math.max(0, state.supplies / Math.max(1, Math.ceil(residents / 2)));
  const ration = rationDays >= 3 ? '充足' : rationDays >= 1.5 ? `约 ${Math.ceil(rationDays)} 天` : rationDays >= 0.5 ? '偏紧' : '短缺';
  const medicine = state.medicine >= 5 ? '充足' : state.medicine >= 2 ? '可用' : state.medicine >= 1 ? '偏紧' : '短缺';
  const defenseValue = clamp(state.defense ?? 50);
  const defense = defenseValue >= 75 ? '稳固' : defenseValue >= 50 ? '可守' : defenseValue >= 30 ? '受损' : '危险';
  const powerValue = clamp(state.power ?? 62);
  const power = powerValue >= 75 ? '稳定' : powerValue >= 45 ? '今晚够用' : powerValue >= 25 ? '吃紧' : '濒临断电';
  return { ration, medicine, defense, defenseValue, power, powerValue, rationDays };
}

export function beginStreetDay(input: GameState): GameState {
  const tutorialParts = input.day === 1 ? Math.max(input.parts, 7) : input.parts;
  let state: GameState = {
    ...input,
    parts: tutorialParts,
    dayStep: 'morning',
    activeEventId: null,
    resolvedEventIds: input.resolvedEventIds ?? [],
    logs: input.logs ?? [],
    defense: clamp((input.defense ?? 50) - Math.round(input.stats.peakPressure * 0.08) - input.stats.missed * 2),
    power: clamp((input.power ?? 62) - 4 - (input.forecast.intensity >= 3 ? 3 : 0)),
  };
  if (input.day === 1 && input.parts < tutorialParts) {
    state = appendLog(state, '清晨拆出了备用零件', `从临时摊棚和断掉的招牌里整理出 ${tutorialParts - input.parts} 个还能用的零件。`, 'resource', '06:20');
  }
  state = appendLog(
    state,
    input.hordePressure >= 100 ? '昨夜差一点失守' : `NIGHT ${input.day} 熬过去了`,
    `成功交付 ${input.stats.served} 次，漏掉 ${input.stats.missed} 次请求。最高尸潮压力 ${Math.round(input.stats.peakPressure)}%。`,
    input.hordePressure >= 100 ? 'danger' : 'neutral',
    '05:46',
  );
  const event = EVENTS.find((item) => item.day === state.day && !(state.resolvedEventIds ?? []).includes(item.id));
  if (event && !state.chapterComplete) state = { ...state, dayStep: 'event', activeEventId: event.id };
  return state;
}

export function choiceAvailability(state: GameState, eventId: string, choiceId: string): { available: boolean; reason?: string } {
  const key = `${eventId}:${choiceId}`;
  const requirements: Record<string, { ok: boolean; reason: string }> = {
    'day-1-broken-lamp:repair': { ok: state.parts >= 1, reason: '至少需要 1 个零件' },
    'day-3-fence:reinforce': { ok: state.parts >= 3, reason: '至少需要 3 个零件' },
    'day-3-fence:patch': { ok: state.parts >= 1, reason: '至少需要 1 个零件' },
    'day-4-stranger:treat': { ok: state.medicine >= 2, reason: '至少需要 2 份药品' },
    'day-4-stranger:ration': { ok: state.medicine >= 1, reason: '至少需要 1 份药品' },
    'day-5-blackout:fence': { ok: state.parts >= 2, reason: '至少需要 2 个零件' },
    'day-6-radio:hold': { ok: state.parts >= 2 && state.supplies >= 2, reason: '需要 2 个零件和 2 份口粮' },
    'day-6-radio:supply': { ok: state.parts >= 1, reason: '至少需要 1 个零件' },
  };
  const requirement = requirements[key];
  return requirement ? { available: requirement.ok, reason: requirement.ok ? undefined : requirement.reason } : { available: true };
}

export function resolveNarrativeChoice(state: GameState, choiceId: string): GameState {
  if (state.phase !== 'street' || !state.activeEventId) return state;
  const event = EVENTS.find((item) => item.id === state.activeEventId);
  if (!event) return { ...state, activeEventId: null, dayStep: 'morning' };
  const effect = event.effects[choiceId];
  if (!effect || !choiceAvailability(state, event.id, choiceId).available) return state;
  const next = effect(state);
  return {
    ...next,
    activeEventId: null,
    dayStep: 'morning',
    resolvedEventIds: [...new Set([...(state.resolvedEventIds ?? []), event.id])],
    lastMessage: `${event.title} · 选择已经记进今天的日志`,
  };
}

export function enterDusk(state: GameState): GameState {
  if (state.phase !== 'street' || state.activeEventId || state.chapterComplete) return state;
  if (state.dayStep === 'dusk') return state;
  return appendLog({ ...state, dayStep: 'dusk' }, '黄昏到了', '岗位已经排好。现在所有白天决定都要在夜里兑现。', 'neutral', '18:40');
}

export function leaveDusk(state: GameState): GameState {
  if (state.phase !== 'street' || state.dayStep !== 'dusk') return state;
  return { ...state, dayStep: 'morning' };
}
