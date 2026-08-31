import { createPendingCheck } from './dice';
import type { BuildingId, CheckModifier, CheckOutcome, GameState, InjuryState, LogTone, Role, RollMode, StoryCategory, Survivor } from './types';

export interface StoryChoiceView {
  id: string;
  label: string;
  detail: string;
  risk?: string;
  checkLabel?: string;
}

export interface StoryEventView {
  id: string;
  category: StoryCategory;
  kicker: string;
  title: string;
  body: string;
  quote?: string;
  choices: StoryChoiceView[];
}

type ResourceKey = 'hope' | 'parts' | 'supplies' | 'medicine' | 'power' | 'defense';
type ResourceDelta = Partial<Record<ResourceKey, number>>;

interface SurvivorEffect {
  id: string;
  energy?: number;
  trust?: number;
  injury?: InjuryState;
}

interface StoryEffect {
  delta?: ResourceDelta;
  flags?: string[];
  removeFlags?: string[];
  survivor?: SurvivorEffect;
  log: { title: string; body: string; tone?: LogTone };
}

interface StoryCheckDefinition {
  label: string;
  actorId?: string;
  skill?: Role;
  mode?: RollMode;
  building?: BuildingId;
  trust?: boolean;
  bonuses?: Array<{ flag: string; label: string; value: number }>;
  penalties?: Array<{ flag: string; label: string; value: number }>;
  outcomes: Record<CheckOutcome, StoryEffect>;
}

interface StoryChoiceDefinition extends StoryChoiceView {
  cost?: ResourceDelta;
  effect?: StoryEffect;
  check?: StoryCheckDefinition;
}

interface StoryEventDefinition extends Omit<StoryEventView, 'choices'> {
  minDay: number;
  maxDay: number;
  requiresFlags?: string[];
  requiresAnyFlags?: string[];
  excludesFlags?: string[];
  requiresSurvivor?: string;
  requiresBuilding?: BuildingId;
  choices: StoryChoiceDefinition[];
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const hasFlag = (state: GameState, flag: string) => (state.storyFlags ?? []).includes(flag);
const hasAll = (state: GameState, flags: string[] = []) => flags.every((flag) => hasFlag(state, flag));
const hasAny = (state: GameState, flags: string[] = []) => flags.length === 0 || flags.some((flag) => hasFlag(state, flag));
const campaignCopy = (value: string) => value.replace(/DAY 7/g, 'DAY 30').replace(/第七天/g, '第三十天');

function addLog(state: GameState, title: string, body: string, tone: LogTone = 'neutral', time = '12:30'): GameState {
  const logs = state.logs ?? [];
  return {
    ...state,
    logs: [...logs.slice(-59), { id: `story-${state.day}-${logs.length}-${campaignCopy(title)}`, day: state.day, time, title: campaignCopy(title), body: campaignCopy(body), tone }],
  };
}

function updateSurvivor(state: GameState, effect?: SurvivorEffect): GameState {
  if (!effect) return state;
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      if (survivor.id !== effect.id) return survivor;
      const trust = effect.trust === undefined ? survivor.trust : clamp((survivor.trust ?? 0) + effect.trust, 0, 3) as 0 | 1 | 2 | 3;
      return {
        ...survivor,
        energy: effect.energy === undefined ? survivor.energy : clamp(survivor.energy + effect.energy, 0, 100),
        trust,
        injury: effect.injury ?? survivor.injury,
      };
    }),
  };
}

function applyEffect(state: GameState, effect: StoryEffect): GameState {
  const delta = effect.delta ?? {};
  let next: GameState = {
    ...state,
    hope: Math.max(0, state.hope + (delta.hope ?? 0)),
    parts: Math.max(0, state.parts + (delta.parts ?? 0)),
    supplies: Math.max(0, state.supplies + (delta.supplies ?? 0)),
    medicine: Math.max(0, state.medicine + (delta.medicine ?? 0)),
    power: clamp((state.power ?? 62) + (delta.power ?? 0)),
    defense: clamp((state.defense ?? 50) + (delta.defense ?? 0)),
  };
  next = updateSurvivor(next, effect.survivor);
  const flags = new Set(next.storyFlags ?? []);
  for (const flag of effect.flags ?? []) flags.add(flag);
  for (const flag of effect.removeFlags ?? []) flags.delete(flag);
  next = { ...next, storyFlags: [...flags] };
  return addLog(next, effect.log.title, effect.log.body, effect.log.tone ?? 'neutral');
}

function effect(title: string, body: string, delta: ResourceDelta = {}, flags: string[] = [], tone: LogTone = 'neutral', survivor?: SurvivorEffect): StoryEffect {
  return { delta, flags, survivor, log: { title, body, tone } };
}

const EVENTS: StoryEventDefinition[] = [
  {
    id: 'west-pharmacy-backdoor', category: 'location', minDay: 2, maxDay: 3, kicker: '西街 · 药店后巷', title: '后门没有锁死',
    body: '林夏在废弃药店后巷找到一扇变形的铁门。门缝里没有新鲜血迹，但地上有拖拽过箱子的痕迹。', quote: '林夏：“先把退路记住，再谈进去。”', requiresSurvivor: 'lin-xia',
    choices: [
      { id: 'scout', label: '先侦察路线', detail: '不拿物资，只把入口、撤退路线和声音来源记清。', risk: '低', effect: effect('药店后巷被画进地图', '林夏把三个能撤退的巷口都标了出来。以后再进药店会更稳。', {}, ['pharmacy_scouted'], 'neutral', { id: 'lin-xia', trust: 1 }) },
      { id: 'push', label: '现在就撬门进去', detail: '搜索一次药店后仓，结果交给骰子。', risk: '中', checkLabel: '搜索判定', check: { label: '搜索药店后仓', actorId: 'lin-xia', skill: 'search', bonuses: [{ flag: 'pharmacy_scouted', label: '已侦察路线', value: 1 }], outcomes: {
        failure: effect('药店后门惊动了尸影', '铁门发出刺耳摩擦声。林夏空手撤回，西街的动静更大了。', { defense: -3 }, ['west_street_alerted'], 'danger', { id: 'lin-xia', energy: -12 }),
        partial: effect('林夏带回一小袋药', '她拿到了药，但手背被碎玻璃划开。', { medicine: 2 }, ['pharmacy_entered'], 'resource', { id: 'lin-xia', energy: -12, injury: 'minor', trust: 1 }),
        success: effect('药店后仓还有存货', '林夏带回完整药盒，并确认地下还有一道门。', { medicine: 4 }, ['pharmacy_entered', 'pharmacy_basement_hint'], 'resource', { id: 'lin-xia', energy: -8, trust: 1 }),
        critical: effect('药店地下室的钥匙', '药品之外，她还找到一串贴着“B1”的钥匙。', { medicine: 5 }, ['pharmacy_entered', 'pharmacy_basement'], 'hope', { id: 'lin-xia', trust: 1 }),
      } } },
    ],
  },
  {
    id: 'pharmacy-basement', category: 'location', minDay: 3, maxDay: 6, kicker: '西街 · 药店 B1', title: '地下室传来三下敲击',
    body: '药店地下室的门后，隔一阵就会传来三下敲击。不是尸体撞门的节奏。', requiresAnyFlags: ['pharmacy_basement', 'pharmacy_basement_hint'],
    choices: [
      { id: 'open', label: '打开地下室', detail: '确认里面到底是什么。', risk: '高', checkLabel: '谨慎进入', check: { label: '进入药店地下室', actorId: 'lin-xia', skill: 'search', mode: 'advantage', outcomes: {
        failure: effect('地下室里只有倒塌货架', '声音来自摇晃的管道。林夏撤出来时扭伤了脚。', {}, ['pharmacy_basement_empty'], 'danger', { id: 'lin-xia', injury: 'minor', energy: -15 }),
        partial: effect('地下室有人活着', '一个脱水的药店员工还活着，但搬他回来消耗了大量口粮。', { supplies: -1, hope: 2, medicine: 1 }, ['pharmacy_survivor_saved'], 'hope'),
        success: effect('地下室是一间小仓库', '里面没有人，但保存着一箱未受潮的药品。', { medicine: 5 }, ['pharmacy_cache'], 'resource'),
        critical: effect('药店员工认得附近仓库', '救出的员工给出一张手绘地图，上面圈着“五金仓库”。', { medicine: 4, hope: 3 }, ['pharmacy_survivor_saved', 'hardware_warehouse_known'], 'hope'),
      } } },
      { id: 'seal', label: '先封住门', detail: '把未知留到以后，今天不冒险。', effect: effect('地下室门被重新顶住', '老周用柜子顶住了门。那三下敲击声到下午才停。', { defense: 2 }, ['pharmacy_basement_sealed']) },
    ],
  },
  {
    id: 'supermarket-coldroom', category: 'location', minDay: 2, maxDay: 5, kicker: '东口 · 小超市', title: '冷库里还有声音',
    body: '小超市货架早被搬空，只有后面的冷库门从里面顶着什么。门口散着几箱还没过期的罐头。',
    choices: [
      { id: 'food', label: '只搬门口罐头', detail: '稳定拿走能确认的食物，不碰冷库。', effect: effect('罐头搬回了配给站', '没有英雄故事，只有实实在在的两天饭。', { supplies: 3 }, ['supermarket_scouted'], 'resource') },
      { id: 'coldroom', label: '打开冷库', detail: '可能找到更多物资，也可能放出麻烦。', risk: '中', checkLabel: '开门判定', check: { label: '检查超市冷库', actorId: 'lin-xia', skill: 'search', bonuses: [{ flag: 'supermarket_scouted', label: '已搬空外围', value: 1 }], outcomes: {
        failure: effect('冷库门后扑出尸影', '大家及时退开，但散落的口粮没能带走。', { hope: -1 }, ['supermarket_lost'], 'danger'),
        partial: effect('冷库还能用', '找到一些保存完好的食物，但清理时消耗了体力。', { supplies: 4 }, ['supermarket_cleared'], 'resource', { id: 'lin-xia', energy: -10 }),
        success: effect('冷库保存着整箱食物', '足够让街区真正松一口气。', { supplies: 6, hope: 2 }, ['supermarket_cleared'], 'hope'),
        critical: effect('冷库后墙有维修通道', '除了食物，还发现一条能绕开主街的安全通道。', { supplies: 6, defense: 5 }, ['supermarket_cleared', 'east_service_route'], 'hope'),
      } } },
    ],
  },
  {
    id: 'apartment-402-key', category: 'location', minDay: 2, maxDay: 5, kicker: '居民楼 · 402', title: '一把写着 402 的钥匙',
    body: '搜索包里掉出一把旧钥匙。标签已经发黄，只能看清“4-02”。对面居民楼第四层还有一扇窗没碎。',
    choices: [
      { id: 'visit', label: '去 402 看看', detail: '楼道狭窄，适合谨慎行动。', risk: '中', checkLabel: '潜入判定', check: { label: '进入公寓 402', actorId: 'lin-xia', skill: 'search', outcomes: {
        failure: effect('楼梯间被堵住', '撤退时踩塌了半层木板，没有拿到东西。', {}, ['apartment_blocked'], 'danger', { id: 'lin-xia', energy: -12 }),
        partial: effect('402 还有一点生活痕迹', '找到两份口粮和一封没有寄出的信。', { supplies: 2, hope: 1 }, ['apartment_letter']),
        success: effect('402 的储物柜没被翻过', '里面有备用电池和工具。', { parts: 2, power: 7 }, ['apartment_searched'], 'resource'),
        critical: effect('屋主留下了屋顶路线', '墙上画着一条通往相邻楼栋的路线，能避开主街尸群。', { parts: 2, defense: 5 }, ['apartment_rooftop_route'], 'hope'),
      } } },
      { id: 'leave', label: '把钥匙挂回墙上', detail: '今天不值得为了未知冒险。', effect: effect('402 的钥匙被留下', '钥匙挂在搜索站的钉子上。也许以后会有人认得它。', {}, ['apartment_key_kept']) },
    ],
  },
  {
    id: 'garage-toolbox', category: 'location', minDay: 2, maxDay: 5, kicker: '修车铺', title: '卷帘门只开了一条缝',
    body: '老周说里面如果还有完整工具箱，能省掉很多临时修补。问题是门轴锈死了。', requiresSurvivor: 'zhou',
    choices: [
      { id: 'force', label: '让老周把门顶开', detail: '维修专长能派上用场。', risk: '中', checkLabel: '维修判定', check: { label: '打开修车铺', actorId: 'zhou', skill: 'repair', building: 'workshop', outcomes: {
        failure: effect('门轴彻底卡死', '老周骂了半天，手臂也被铁皮划伤。', {}, ['garage_jammed'], 'danger', { id: 'zhou', injury: 'minor', energy: -10 }),
        partial: effect('拿到了半箱工具', '扳手和钳子还能用，但大件设备搬不出来。', { parts: 3 }, ['garage_opened'], 'resource'),
        success: effect('工具箱完整', '老周第一次笑了一下：这下修东西不用再拿石头当锤子。', { parts: 5, defense: 4 }, ['garage_opened'], 'hope', { id: 'zhou', trust: 1 }),
        critical: effect('修车铺还有小型发电机', '一台旧发电机居然还能转。主灯的压力立刻小了一截。', { parts: 5, power: 15 }, ['garage_generator'], 'hope', { id: 'zhou', trust: 1 }),
      } } },
      { id: 'skip', label: '先不折腾', detail: '门还在，机会不会今天就消失。', effect: effect('修车铺被标记', '老周在地图上画了个扳手，提醒所有人别把这里忘了。', {}, ['garage_marked']) },
    ],
  },
  {
    id: 'school-gym', category: 'location', minDay: 3, maxDay: 6, kicker: '社区小学', title: '体育馆的门从里面锁着',
    body: '广播里有人提过学校曾经当过临时避难点。操场已经空了，体育馆的门却从里面锁死。',
    choices: [
      { id: 'call', label: '先隔门喊话', detail: '不急着破门，看看里面是否还有人。', effect: effect('体育馆里有人回应', '一个很轻的声音说：“我们只有两个。”', { hope: 1 }, ['school_people_alive'], 'hope') },
      { id: 'enter', label: '从器材室进去', detail: '路线窄，但可能直接进入体育馆。', risk: '高', checkLabel: '潜入判定', check: { label: '进入学校体育馆', actorId: 'aliang', skill: 'watch', bonuses: [{ flag: 'school_people_alive', label: '提前确认活人', value: 1 }], outcomes: {
        failure: effect('器材室里有尸群', '阿梁及时退出来，但学校路线暂时不能再走。', { defense: -2 }, ['school_route_lost'], 'danger'),
        partial: effect('救出了两个人', '两名幸存者被带回街区，但他们已经两天没吃东西。', { supplies: -2, hope: 3 }, ['school_people_saved'], 'hope'),
        success: effect('学校避难点还有物资', '除了两个人，还带回医疗包和几箱水。', { supplies: 2, medicine: 2, hope: 4 }, ['school_people_saved'], 'hope'),
        critical: effect('学校地下储藏室完好', '门后是一整排应急物资柜。', { supplies: 4, medicine: 3, parts: 2, hope: 4 }, ['school_people_saved', 'school_cache'], 'hope'),
      } } },
    ],
  },
  {
    id: 'subway-stairs', category: 'location', minDay: 3, maxDay: 6, kicker: '地铁入口', title: '地下有风吹出来',
    body: '封闭的地铁入口竟然有持续气流，说明某处出口还通着。黑暗里偶尔能听见金属碰撞。',
    choices: [
      { id: 'mark', label: '只做标记', detail: '把它当成未来撤退路线候选。', effect: effect('地铁入口被标成危险点', '没人下去。至少今晚不会有人因为好奇失踪。', { defense: 2 }, ['subway_marked']) },
      { id: 'descend', label: '下到站厅', detail: '高风险探索，但可能找到另一条街的出口。', risk: '高', checkLabel: '探索判定', check: { label: '探索地铁站厅', actorId: 'lin-xia', skill: 'search', mode: 'disadvantage', bonuses: [{ flag: 'east_service_route', label: '知道替代出口方向', value: 1 }], outcomes: {
        failure: effect('站厅里全是回声', '林夏听见太多脚步，只能沿原路退回。', {}, ['subway_too_dangerous'], 'danger', { id: 'lin-xia', energy: -15 }),
        partial: effect('站厅有一间工具房', '拿回零件，但更深处的闸机后仍旧看不清。', { parts: 3 }, ['subway_toolroom'], 'resource'),
        success: effect('地铁连着另一条街', '林夏确认西南出口还能走，这意味着余烬长街不是孤岛。', { hope: 4, defense: 4 }, ['subway_exit_known'], 'hope'),
        critical: effect('地铁里留下了避难标记', '墙上有近期画下的箭头：“灯亮的地方见。”', { hope: 6 }, ['subway_exit_known', 'other_survivors_nearby'], 'hope'),
      } } },
    ],
  },
  {
    id: 'hardware-warehouse', category: 'location', minDay: 4, maxDay: 6, kicker: '五金仓库', title: '卷帘门后是一整排货架',
    body: '地图上的五金仓库真的存在。门口没有明显尸迹，但里面太安静。', requiresFlags: ['hardware_warehouse_known'],
    choices: [
      { id: 'search', label: '进去搬零件', detail: '这可能直接改变 DAY 7 的防线。', risk: '中', checkLabel: '搜索判定', check: { label: '搜索五金仓库', actorId: 'zhou', skill: 'repair', outcomes: {
        failure: effect('仓库货架倒塌', '能拿的东西被压住，只抢出一点线缆。', { parts: 1 }, ['warehouse_damaged'], 'danger'),
        partial: effect('搬回两箱五金件', '够做一次像样的加固。', { parts: 5, defense: 5 }, ['warehouse_looted'], 'resource'),
        success: effect('防线材料齐了', '钢索、膨胀螺栓和焊条都找到了。', { parts: 8, defense: 8 }, ['warehouse_looted'], 'hope'),
        critical: effect('找到完整加固套件', '老周看了一眼就说：DAY 7 北口能扛。', { parts: 10, defense: 15 }, ['warehouse_looted', 'north_gate_reinforced'], 'hope'),
      } } },
      { id: 'seal', label: '先封门留作后备', detail: '不马上搬，避免今天把人拖垮。', effect: effect('五金仓库被当作后备点', '门上留下只有街坊看得懂的标记。', {}, ['warehouse_reserved']) },
    ],
  },
  {
    id: 'linxia-backpack', category: 'survivor', minDay: 2, maxDay: 4, kicker: '人物 · 林夏', title: '她睡觉也背着那个包',
    body: '有人注意到林夏即使睡在宿营屋，也从不把旧背包放到手够不到的地方。', requiresSurvivor: 'lin-xia', excludesFlags: ['linxia_backpack_asked', 'linxia_backpack_respected'],
    choices: [
      { id: 'respect', label: '不问', detail: '有些事等她自己愿意说。', effect: effect('没有人去动那个背包', '第二天林夏主动多接了一趟搜索。', { supplies: 1 }, ['linxia_backpack_respected'], 'hope', { id: 'lin-xia', trust: 1 }) },
      { id: 'ask', label: '问里面是什么', detail: '直接一点，也许能更快知道她在找什么。', effect: effect('林夏只说“私人物品”', '她把拉链又拉紧了一点。', {}, ['linxia_backpack_asked'], 'neutral', { id: 'lin-xia', trust: -1 }) },
    ],
  },
  {
    id: 'linxia-photo', category: 'survivor', minDay: 4, maxDay: 6, kicker: '人物 · 林夏', title: '一张折过很多次的照片',
    body: '林夏把一张照片压在地图边缘。照片里有两个人，背景像是大学门口。', requiresSurvivor: 'lin-xia', requiresAnyFlags: ['linxia_backpack_respected', 'linxia_backpack_asked'],
    choices: [
      { id: 'listen', label: '等她自己开口', detail: '如果之前尊重过她，这次谈话会更容易。', checkLabel: '信任判定', check: { label: '让林夏说出她在找谁', actorId: 'lin-xia', trust: true, bonuses: [{ flag: 'linxia_backpack_respected', label: '之前没有逼问', value: 1 }], penalties: [{ flag: 'linxia_backpack_asked', label: '之前逼问过', value: -1 }], outcomes: {
        failure: effect('林夏收起了照片', '“没什么。吃饭吧。”', {}, ['linxia_story_closed']),
        partial: effect('她说了一个名字', '她只说那个人可能在东环附近。', { hope: 1 }, ['linxia_person_named'], 'neutral', { id: 'lin-xia', trust: 1 }),
        success: effect('林夏讲了照片的来历', '她不是为了物资留在这里。她一直在找照片里的姐姐。', { hope: 2 }, ['linxia_person_named', 'linxia_search_goal'], 'hope', { id: 'lin-xia', trust: 1 }),
        critical: effect('林夏把照片交给你保管', '“如果我哪天回不来，至少有人知道我为什么出去。”', { hope: 3 }, ['linxia_search_goal', 'linxia_photo_trusted'], 'hope', { id: 'lin-xia', trust: 1 }),
      } } },
      { id: 'change', label: '换个话题', detail: '现在还不是时候。', effect: effect('照片被压回地图下面', '谈话停在这里，但没有因此变坏。', {}, ['linxia_photo_seen']) },
    ],
  },
  {
    id: 'zhou-no-sleep', category: 'survivor', minDay: 3, maxDay: 6, kicker: '人物 · 老周', title: '修不好不睡',
    body: '老周已经连续两个晚上检查围栏。程医生说他的手一直在抖。', requiresSurvivor: 'zhou',
    choices: [
      { id: 'rest', label: '让他今天休息', detail: '少一点维修产出，换人状态。', effect: effect('老周被赶去睡了一觉', '他嘴上一直抱怨，醒来以后手不抖了。', { defense: -1 }, ['zhou_forced_rest'], 'hope', { id: 'zhou', energy: 20, injury: 'healthy', trust: 1 }) },
      { id: 'work', label: '让他把这一段修完', detail: '赌他的经验还能撑住。', risk: '中', checkLabel: '维修判定', check: { label: '老周带疲劳加固围栏', actorId: 'zhou', skill: 'repair', building: 'workshop', outcomes: {
        failure: effect('焊点烧穿了', '老周不得不返工，体力也见底。', { parts: -1, defense: -2 }, ['zhou_exhausted'], 'danger', { id: 'zhou', energy: -20 }),
        partial: effect('围栏补好了', '能用，但老周今晚必须休息。', { defense: 8 }, ['zhou_exhausted'], 'neutral', { id: 'zhou', energy: -18 }),
        success: effect('老周把薄弱点全补了一遍', '北口重新有了让人放心的金属声。', { defense: 14 }, ['zhou_reinforced'], 'hope', { id: 'zhou', energy: -12, trust: 1 }),
        critical: effect('他顺手改了支撑结构', '这不是补丁，是一次真正的结构加固。', { defense: 20, parts: 1 }, ['zhou_reinforced', 'north_gate_reinforced'], 'hope', { id: 'zhou', trust: 1 }),
      } } },
    ],
  },
  {
    id: 'cheng-antibiotic', category: 'survivor', minDay: 4, maxDay: 6, kicker: '人物 · 程医生', title: '最后一支抗生素',
    body: '程医生把最后一支完整抗生素单独放进上锁的抽屉。她没有解释要留给谁。', requiresSurvivor: 'cheng',
    choices: [
      { id: 'reserve', label: '尊重她的判断', detail: '把药留给真正需要的时候。', effect: effect('那支药被留下了', '没人碰抽屉。夜里如果出现重伤员，至少还有一次机会。', { medicine: 1 }, ['last_antibiotic_reserved'], 'hope', { id: 'cheng', trust: 1 }) },
      { id: 'use', label: '现在就拆开用', detail: '缓解当前伤病，不留后手。', effect: effect('药被用在现有伤员身上', '今天的病床安静了，但抽屉也空了。', { hope: 2 }, ['last_antibiotic_used'], 'neutral') },
    ],
  },
  {
    id: 'aliang-route', category: 'survivor', minDay: 5, maxDay: 6, kicker: '人物 · 阿梁', title: '“今晚声音不对。”',
    body: '阿梁坚持说尸群不是从平常的北面靠近。地图上却没有证据支持他的判断。', requiresSurvivor: 'aliang',
    choices: [
      { id: 'trust', label: '相信他的耳朵', detail: '提前调整守夜方向。', checkLabel: '侦察判定', check: { label: '判断尸群来向', actorId: 'aliang', skill: 'watch', building: 'watchPost', outcomes: {
        failure: effect('方向判断错了', '一部分人被调离北口，围栏准备反而变薄。', { defense: -6 }, ['wrong_horde_direction'], 'danger'),
        partial: effect('他听对了一半', '尸群确实在偏移，提前调整让大家少挨一次冲击。', { defense: 6 }, ['horde_direction_partial']),
        success: effect('阿梁听出了真正的路线', '今晚尸群的主冲击方向被提前标记。', { defense: 12 }, ['horde_direction_known'], 'hope', { id: 'aliang', trust: 1 }),
        critical: effect('他甚至听出了第二股尸群', '守夜岗提前做了双层准备。', { defense: 16, power: 5 }, ['horde_direction_known', 'second_wave_known'], 'hope', { id: 'aliang', trust: 1 }),
      } } },
      { id: 'map', label: '继续按地图布防', detail: '不因为感觉改变整个街区安排。', effect: effect('今晚继续按旧方案守', '阿梁没有争辩，只把自己的岗哨向西挪了两步。', { defense: 2 }, ['kept_old_watch_plan']) },
    ],
  },
  {
    id: 'xiaoman-static', category: 'survivor', minDay: 5, maxDay: 6, kicker: '人物 · 小满', title: '静电里有人说了“余烬”',
    body: '小满在杂音里反复听到一个词：“余烬”。不像巧合，更像有人知道这条街。', requiresSurvivor: 'xiaoman',
    choices: [
      { id: 'answer', label: '回一段短讯', detail: '让外面的人知道这里还有人。', risk: '中', checkLabel: '广播判定', check: { label: '锁定陌生频率', actorId: 'xiaoman', skill: 'radio', building: 'radio', outcomes: {
        failure: effect('频率彻底丢了', '只剩一长串白噪声。', {}, ['radio_signal_lost'], 'danger'),
        partial: effect('对方听见了这里', '只收到一句回复：“灯别灭。”', { hope: 2 }, ['radio_contact']),
        success: effect('建立了短暂通联', '对方自称有三个人，正在东环以南移动。', { hope: 4 }, ['radio_contact', 'three_survivors_signal'], 'hope', { id: 'xiaoman', trust: 1 }),
        critical: effect('对方发来尸潮路线', '广播里传来完整坐标和高架尸群移动方向。', { hope: 4, defense: 10 }, ['radio_contact', 'three_survivors_signal', 'horde_route_broadcast'], 'hope', { id: 'xiaoman', trust: 1 }),
      } } },
      { id: 'listen', label: '只监听，不回应', detail: '不暴露街区位置。', effect: effect('广播保持静默监听', '小满把频率记了下来。那一晚没有回应。', {}, ['radio_listening']) },
    ],
  },
  {
    id: 'ahe-old-song', category: 'survivor', minDay: 3, maxDay: 6, kicker: '人物 · 阿禾', title: '广播里放了一小段旧歌',
    body: '小满调试广播时误放出一段旧歌。阿禾居然跟着唱了两句，整条街突然安静下来听。', requiresSurvivor: 'ahe',
    choices: [
      { id: 'play', label: '让歌继续播完', detail: '没有资源收益，只让大家听完。', effect: effect('一首歌播完了', '三分半钟里没有人谈尸潮、食物或围栏。', { hope: 3 }, ['old_song_played'], 'hope', { id: 'ahe', trust: 1 }) },
      { id: 'stop', label: '关掉，省电', detail: '现在每一点电都重要。', effect: effect('广播被关掉', '阿禾耸耸肩，继续切菜。', { power: 2 }, ['old_song_stopped'], 'resource') },
    ],
  },
  {
    id: 'ration-mold', category: 'street', minDay: 2, maxDay: 6, kicker: '配给站', title: '最底下两箱罐头受潮了',
    body: '标签已经泡烂。阿禾说里面不一定坏，但没人愿意拿居民的肚子试运气。',
    choices: [
      { id: 'discard', label: '全部丢掉', detail: '损失口粮，避免任何健康风险。', cost: { supplies: -1 }, effect: effect('受潮罐头被清走', '今天少了一顿饭，但没人因此进诊疗站。', { supplies: -1 }, ['mold_food_discarded']) },
      { id: 'inspect', label: '逐罐检查', detail: '花时间筛选还能吃的。', risk: '低', checkLabel: '检查判定', check: { label: '筛选受潮口粮', actorId: 'ahe', skill: 'cook', outcomes: {
        failure: effect('大部分都坏了', '最后只能留下很少一部分。', { supplies: -1 }, ['mold_food_checked']),
        partial: effect('留下了一半', '阿禾把有问题的全部单独做了记号。', {}, ['mold_food_checked']),
        success: effect('大部分还能吃', '损失比预想小得多。', { supplies: 1 }, ['mold_food_checked'], 'resource'),
        critical: effect('箱底还有真空包装', '最下面是一批保存完好的应急餐。', { supplies: 3 }, ['mold_food_checked'], 'hope'),
      } } },
    ],
  },
  {
    id: 'generator-spark', category: 'street', minDay: 3, maxDay: 6, kicker: '主灯线路', title: '发电机开始打火',
    body: '主灯每亮一阵，发电机就会从侧面冒出细小火花。老周说这不是“会不会坏”，而是“什么时候坏”。',
    choices: [
      { id: 'repair', label: '现在停机检修', detail: '消耗零件，换稳定电力。', cost: { parts: -2 }, checkLabel: '维修判定', check: { label: '检修主灯发电机', actorId: 'zhou', skill: 'repair', building: 'workshop', outcomes: {
        failure: effect('检修没找到真正故障', '零件换了，火花还在。', { parts: -2, power: -4 }, ['generator_unstable'], 'danger'),
        partial: effect('暂时压住了故障', '今晚应该不会突然熄灭。', { parts: -2, power: 6 }, ['generator_patched']),
        success: effect('线路重新稳定', '电压表终于不再跳。', { parts: -2, power: 14 }, ['generator_stable'], 'resource'),
        critical: effect('老周重新分了负载', '主灯、诊疗站和探照灯互相不再抢电。', { parts: -1, power: 18, defense: 4 }, ['generator_stable', 'power_bus_rewired'], 'hope'),
      } } },
      { id: 'delay', label: '今晚再说', detail: '保留零件，但低电力风险继续存在。', effect: effect('发电机继续带病工作', '每个人路过主灯都能听见不正常的咔嗒声。', { power: -4 }, ['generator_unstable'], 'danger') },
    ],
  },
  {
    id: 'water-barrel', category: 'street', minDay: 2, maxDay: 5, kicker: '后院', title: '雨水桶里漂着一层灰',
    body: '水很宝贵，但灰尘里可能混着屋顶残留物。程医生建议先别直接喝。',
    choices: [
      { id: 'boil', label: '全部烧开过滤', detail: '耗一点电，换一批可靠饮水。', effect: effect('雨水被过滤了', '一下午都能闻到烧水的味道。', { power: -3, supplies: 2 }, ['water_filtered'], 'resource') },
      { id: 'save', label: '留作清洗用水', detail: '不冒险饮用。', effect: effect('雨水被标成非饮用水', '至少诊疗站终于不用拿饮用水洗工具。', { medicine: 1 }, ['water_for_clinic'], 'resource') },
    ],
  },
  {
    id: 'fence-rattle', category: 'street', minDay: 3, maxDay: 6, kicker: '北侧围栏', title: '白天也有人撞了围栏',
    body: '只有一下，然后再没声音。阿梁说不像普通游荡者。',
    choices: [
      { id: 'inspect', label: '派人沿围栏检查', detail: '确认是不是新的尸群路线。', risk: '低', checkLabel: '守夜侦察', check: { label: '检查北侧围栏外侧', actorId: 'aliang', skill: 'watch', building: 'watchPost', outcomes: {
        failure: effect('没找到来源', '检查的人反而留下了更多脚印。', { defense: -2 }, ['fence_unknown_noise']),
        partial: effect('发现一处新撞痕', '至少知道今晚该盯哪里。', { defense: 4 }, ['fence_hit_spot']),
        success: effect('发现尸群正在试探围栏', '守夜岗提前调整了探照灯角度。', { defense: 8 }, ['fence_hit_spot', 'horde_probe_known'], 'hope'),
        critical: effect('找到了尸群被吸引的原因', '围栏外一辆卡死的警报车一直在间歇鸣响。断掉它以后，外围安静很多。', { defense: 10, hope: 2 }, ['horde_probe_known', 'alarm_car_disabled'], 'hope'),
      } } },
      { id: 'ignore', label: '不为一下撞击分散人手', detail: '继续当前工作。', effect: effect('那声撞击没有被追查', '直到黄昏都没再响。没人确定这是好事还是坏事。', {}, ['fence_noise_ignored']) },
    ],
  },
  {
    id: 'smoke-signal', category: 'world', minDay: 3, maxDay: 6, kicker: '远处天际线', title: '城南升起一股黑烟',
    body: '烟柱持续了二十分钟。不是普通火灾，更像有人故意把什么点燃。',
    choices: [
      { id: 'watch', label: '记录方向', detail: '不派人出去，只把方向交给搜索站。', effect: effect('黑烟方向被记下', '搜索地图上多了一个黑色三角。', { defense: 2 }, ['south_smoke_marked']) },
      { id: 'signal', label: '让主灯闪三次回应', detail: '告诉远处：这里有人。', risk: '中', effect: effect('主灯闪了三次', '一分钟后，远处烟柱也断了三次。不是巧合。', { hope: 4, power: -3 }, ['south_contact_possible'], 'hope') },
    ],
  },
  {
    id: 'abandoned-bus', category: 'location', minDay: 2, maxDay: 5, kicker: '公交总站', title: '最后一班公交停在站里',
    body: '车门开着，里面没有尸体。驾驶座旁挂着一串总站钥匙。',
    choices: [
      { id: 'search', label: '搜整辆车', detail: '车厢狭窄，结果交给骰子。', risk: '中', checkLabel: '搜索判定', check: { label: '搜索废弃公交', actorId: 'lin-xia', skill: 'search', outcomes: {
        failure: effect('车底传来动静', '搜索被迫提前结束，只带回几节旧电池。', { power: 3 }, ['bus_abandoned'], 'danger'),
        partial: effect('找到急救箱', '箱子不完整，但还有能用的东西。', { medicine: 2 }, ['bus_searched'], 'resource'),
        success: effect('总站钥匙真的能用', '仓库里有备用电池和维修工具。', { medicine: 1, power: 8, parts: 2 }, ['bus_searched', 'bus_depot_key'], 'resource'),
        critical: effect('公交电台还能接收', '它收到一个重复广播：“东环高架不要走。”', { power: 8, hope: 2 }, ['bus_depot_key', 'east_loop_warning'], 'hope'),
      } } },
      { id: 'keys', label: '只拿总站钥匙', detail: '不在车厢里耽误。', effect: effect('总站钥匙被带回', '钥匙牌上写着“维修库”。', {}, ['bus_depot_key']) },
    ],
  },
  {
    id: 'broken-vending', category: 'street', minDay: 1, maxDay: 4, kicker: '街口', title: '自动售货机还亮着一格灯',
    body: '售货机歪在路边，里面还有几瓶水。投币口早就没意义了。',
    choices: [
      { id: 'break', label: '砸开玻璃', detail: '很响，但能马上拿到里面的东西。', effect: effect('售货机玻璃碎了一地', '拿到几瓶水，也把半条街的回声都叫醒了。', { supplies: 2, defense: -2 }, ['vending_broken'], 'resource') },
      { id: 'open', label: '找后盖慢慢拆', detail: '需要一点耐心。', checkLabel: '维修判定', check: { label: '打开售货机后盖', actorId: 'zhou', skill: 'repair', outcomes: {
        failure: effect('后盖螺丝锈死', '最后什么都没拿到。', {}, ['vending_jammed']),
        partial: effect('撬出两瓶水', '动静不大，够今天用。', { supplies: 2 }, ['vending_opened'], 'resource'),
        success: effect('整排货槽都能打开', '水和零食被完整搬回。', { supplies: 4 }, ['vending_opened'], 'resource'),
        critical: effect('里面还有备用电池盒', '售货机维护仓里放着一组没拆封的电池。', { supplies: 4, power: 6 }, ['vending_opened'], 'hope'),
      } } },
    ],
  },
  {
    id: 'clinic-window', category: 'street', minDay: 4, maxDay: 6, kicker: '诊疗站', title: '窗外站着一个不敢敲门的人',
    body: '那个人只在远处看着诊疗站灯光。程医生说，如果是感染，他不会站得这么直。', requiresBuilding: 'clinic',
    choices: [
      { id: 'invite', label: '让他到围栏前说话', detail: '先隔着门检查。', checkLabel: '医疗判断', check: { label: '判断陌生人的伤情', actorId: 'cheng', skill: 'medical', building: 'clinic', outcomes: {
        failure: effect('判断不清，只能拒绝', '那个人最后自己离开了。', { hope: -1 }, ['clinic_stranger_left'], 'danger'),
        partial: effect('只是严重脱水', '给了一份水和基础处理，他没有进街区。', { supplies: -1, hope: 1 }, ['clinic_stranger_helped']),
        success: effect('没有感染迹象', '程医生处理了伤口，对方留下了附近一处物资点的位置。', { medicine: -1, hope: 2, parts: 2 }, ['clinic_stranger_helped', 'new_cache_tip'], 'hope'),
        critical: effect('他曾是急救员', '处理完伤口后，他留下来帮程医生整理了一下午器械。', { medicine: 2, hope: 3 }, ['clinic_stranger_helped', 'medic_volunteer'], 'hope'),
      } } },
      { id: 'ignore', label: '不开门', detail: '现在不能因为每个影子冒险。', effect: effect('窗外的人走了', '没有人追出去。', {}, ['clinic_stranger_ignored']) },
    ],
  },
  {
    id: 'radio-three', category: 'world', minDay: 5, maxDay: 6, kicker: '广播 · 19.4MHz', title: '“我们有三个人。”',
    body: '同一个频率又出现了。声音比上次更近：“如果灯还亮着，我们今晚会往西走。”', requiresAnyFlags: ['radio_contact', 'three_survivors_signal', 'radio_listening'],
    choices: [
      { id: 'guide', label: '给他们主灯方向', detail: '公开位置，但可能真的把人带回来。', effect: effect('广播发出三次短脉冲', '小满告诉他们：看到最高的那盏灯，就一直走。', { power: -2, hope: 3 }, ['three_survivors_guided'], 'hope') },
      { id: 'warn', label: '只警告尸潮路线', detail: '不暴露具体位置。', effect: effect('只发送了尸潮警告', '对方回了一句“收到”。之后频率沉默。', { hope: 1 }, ['three_survivors_warned']) },
    ],
  },
  {
    id: 'east-loop-warning', category: 'world', minDay: 4, maxDay: 6, kicker: '广播碎片', title: '“不要上东环高架。”',
    body: '这句话被重复了四遍。第五遍只剩电流声。',
    choices: [
      { id: 'believe', label: '把东环标成禁区', detail: '搜索路线绕开高架。', effect: effect('东环被画上红叉', '路线更远，但不会撞上广播里反复警告的东西。', { defense: 4 }, ['east_loop_avoided']) },
      { id: 'verify', label: '让阿梁确认声音方向', detail: '如果广播是真的，可能提前知道 DAY 7 的尸潮路线。', checkLabel: '侦察判定', check: { label: '确认东环尸群', actorId: 'aliang', skill: 'watch', outcomes: {
        failure: effect('什么都没听清', '城市回声太乱。', {}, ['east_loop_uncertain']),
        partial: effect('高架上确实有大群移动', '至少证明广播不是吓人。', { defense: 5 }, ['east_loop_horde']),
        success: effect('尸潮正沿高架向西', 'DAY 7 的路线第一次变得具体。', { defense: 10 }, ['east_loop_horde', 'horde_route_broadcast'], 'hope'),
        critical: effect('还听到了尸群前方的空档', '阿梁找到了最适合提前加固的时间窗口。', { defense: 14, power: 4 }, ['east_loop_horde', 'horde_route_broadcast', 'horde_timing_known'], 'hope'),
      } } },
    ],
  },
  {
    id: 'cat-clinic', category: 'cat', minDay: 3, maxDay: 6, kicker: '小灰', title: '它第三次跑进诊疗站',
    body: '程医生前两次都把它赶出去。第三次，小灰直接在最暖的灯下面趴了下来。',
    choices: [
      { id: 'stay', label: '让它待着', detail: '不产生战斗加成，只让这里像个有人生活的地方。', effect: effect('小灰占领了诊疗站角落', '程医生嘴上说“脏”，最后还是给它垫了一块布。', { hope: 2 }, ['cat_clinic_corner'], 'hope') },
      { id: 'out', label: '还是赶出去', detail: '诊疗站必须保持干净。', effect: effect('小灰被抱回门外', '它十分钟后又出现在窗台上。', {}, ['cat_clinic_window']) },
    ],
  },
  {
    id: 'cat-night-door', category: 'cat', minDay: 5, maxDay: 6, kicker: '小灰', title: '天黑前它一直守在门边',
    body: '小灰今天没有睡。每次远处有声音，它的耳朵都会先转过去。',
    choices: [
      { id: 'inside', label: '把它抱进主灯塔', detail: 'DAY 7 前，让它待在最安全的地方。', effect: effect('小灰被抱进了主灯塔', '它挣扎了两下，最后趴在电缆箱旁边。', { hope: 2 }, ['cat_safe_for_horde'], 'hope') },
      { id: 'free', label: '让它自己选', detail: '这条街也是它的地盘。', effect: effect('小灰继续巡街', '直到黄昏，它才自己钻回配给站下面。', { hope: 1 }, ['cat_patrols']) },
    ],
  },
  {
    id: 'quiet-afternoon', category: 'world', minDay: 2, maxDay: 6, kicker: '14:10', title: '一个什么都没发生的下午',
    body: '没有广播，没有撞击，没有人跑回来喊什么。风从断掉的招牌中间穿过去。',
    choices: [
      { id: 'rest', label: '就让大家安静一会儿', detail: '末日里，平静本身也是资源。', effect: effect('街上安静了一个小时', '有人睡觉，有人补衣服，有人只是坐着。', { hope: 2 }, ['quiet_hour'], 'hope') },
      { id: 'work', label: '趁安静多做点准备', detail: '把平静换成一点实际库存。', effect: effect('所有人多干了一小时', '没有事故，也没有故事。只有多出来的一点库存。', { parts: 1, supplies: 1 }, ['quiet_hour_worked'], 'resource') },
    ],
  },
  {
    id: 'rain-drain', category: 'world', minDay: 2, maxDay: 5, kicker: '暴雨后', title: '排水沟里卡着一个背包',
    body: '背包被铁丝挂住，旁边积水已经漫过脚踝。谁都不知道上游冲下来过什么。',
    choices: [
      { id: 'hook', label: '用长杆勾回来', detail: '不下水，慢一点。', checkLabel: '操作判定', check: { label: '捞回排水沟背包', actorId: 'zhou', skill: 'repair', outcomes: {
        failure: effect('背包被水冲走', '只剩一根断带挂在铁丝上。', {}, ['drain_bag_lost']),
        partial: effect('背包里有一点药', '大部分东西泡烂，只剩密封药盒。', { medicine: 1 }, ['drain_bag_found'], 'resource'),
        success: effect('背包里是完整应急包', '药、罐头和手电都还能用。', { medicine: 1, supplies: 2, power: 3 }, ['drain_bag_found'], 'resource'),
        critical: effect('背包夹层里有手绘地图', '地图标着两处还没被搜过的小仓库。', { supplies: 2, medicine: 1, parts: 1 }, ['drain_bag_found', 'two_cache_map'], 'hope'),
      } } },
      { id: 'leave', label: '不碰积水', detail: '一个背包不值得冒险。', effect: effect('背包被留在排水沟', '第二天再看时，它已经不见了。', {}, ['drain_bag_left']) },
    ],
  },
  {
    id: 'battery-cache', category: 'location', minDay: 4, maxDay: 6, kicker: '地下车库', title: '一辆维修车的后门没锁',
    body: '车里堆着交通维护用的电池组。问题是车库深处一直传来拖步声。',
    choices: [
      { id: 'carry', label: '一次搬完', detail: '能显著改善电力，但暴露时间更长。', risk: '高', checkLabel: '搬运判定', check: { label: '搬出维修电池组', actorId: 'aliang', skill: 'watch', outcomes: {
        failure: effect('尸影堵住了出口', '大家丢下电池撤回，只带走一小块。', { power: 3 }, ['garage_battery_lost'], 'danger'),
        partial: effect('搬回一组电池', '足够主灯多撑一阵。', { power: 10 }, ['garage_battery_taken'], 'resource'),
        success: effect('两组电池都搬回来了', '今晚电力不再是最紧张的那项。', { power: 18 }, ['garage_battery_taken'], 'hope'),
        critical: effect('维修车里还有稳压模块', '老周说这东西比电池本身更值钱。', { power: 20, parts: 2 }, ['garage_battery_taken', 'voltage_regulator'], 'hope'),
      } } },
      { id: 'one', label: '只搬最近的一组', detail: '稳妥，收益较小。', effect: effect('搬回一组维修电池', '没有人受伤，也没有惊动深处的东西。', { power: 8 }, ['garage_battery_taken'], 'resource') },
    ],
  },
  {
    id: 'rooftop-sheet', category: 'world', minDay: 4, maxDay: 6, kicker: '对面楼顶', title: '白床单上写着一个字：人',
    body: '风把床单吹得几乎看不清。对面楼顶没有人影，但字是新写的。',
    choices: [
      { id: 'reply', label: '挂一盏小灯回应', detail: '让对面知道这里看见了。', effect: effect('窗边多了一盏小灯', '半小时后，对面床单被收走了。', { hope: 3, power: -2 }, ['rooftop_contact'], 'hope') },
      { id: 'watch', label: '先观察', detail: '不暴露更多信息。', effect: effect('守夜岗盯住了对面楼', '黄昏前没有再出现人影。', { defense: 2 }, ['rooftop_watched']) },
    ],
  },
  {
    id: 'last-light-choice', category: 'world', minDay: 6, maxDay: 6, kicker: 'DAY 6 · 黄昏前', title: '要不要让主灯整夜保持全亮',
    body: '尸潮会被光吸引，但主灯也是远处幸存者唯一能看见的方向。关暗一点更安全；全亮，则意味着这里还在等人。',
    choices: [
      { id: 'bright', label: '保持全亮', detail: '更危险，但不让任何正在赶来的人失去方向。', effect: effect('主灯没有调暗', '所有人都知道今晚尸潮可能更重，但没有人提出第二次。', { hope: 5, power: -6, defense: -3 }, ['kept_main_light_on'], 'hope') },
      { id: 'dim', label: '降低亮度', detail: '减少暴露，把生存放在第一位。', effect: effect('主灯调到了最低可见亮度', '街口暗了下来，围栏外的尸影也更难看清。', { power: 6, defense: 5, hope: -1 }, ['dimmed_main_light'], 'neutral') },
    ],
  },
];

const AMBIENT = [
  ['06:42', '阿禾把昨晚剩下的汤重新烧开', '没人说味道好不好。热的就够了。', 'hope'],
  ['07:18', '林夏在地图上补了两条巷子', '她把能跑、不能跑、只有一个出口的地方分得很清楚。', 'neutral'],
  ['08:03', '小灰从配给站下面钻出来', '它盯着每个开罐头的人看。', 'hope'],
  ['08:47', '老周捡回一把弯掉的螺丝刀', '“磨一下还能用。”他说。', 'resource'],
  ['09:26', '诊疗站晒起了洗过的绷带', '风里第一次有了肥皂味。', 'hope'],
  ['10:11', '街口有人把碎玻璃扫到一边', '不是为了战斗，只是不想再有人扎脚。', 'neutral'],
  ['10:58', '广播里只有白噪声', '小满还是戴着耳机听了二十分钟。', 'neutral'],
  ['11:33', '围栏外滚过一个空塑料瓶', '阿梁一直看着它滚到看不见。', 'neutral'],
  ['12:06', '今天的饭分得刚刚好', '锅底没有剩，也没人少一份。', 'resource'],
  ['12:52', '有人在主灯塔下面钉了一块木板', '上面写着：回来的人先敲三下。', 'hope'],
  ['13:16', '林夏回来时鞋底都是灰', '她没有找到物资，但确认西街今天相对安静。', 'neutral'],
  ['13:54', '老周把一段旧电线盘得整整齐齐', '“乱放的东西，真用的时候最害人。”', 'resource'],
  ['14:29', '一只乌鸦落在围栏上', '所有人都抬头看了它一眼。', 'neutral'],
  ['15:04', '程医生把药品重新数了一遍', '数完以后，她又从头数了一遍。', 'neutral'],
  ['15:39', '配给站有人笑了一声', '没人记得是因为什么，但那声音让街上安静了一秒。', 'hope'],
  ['16:12', '风把远处的烧焦味吹过来', '城里还有地方在燃烧。', 'danger'],
  ['16:41', '小满收到半秒钟人声', '太短了，听不清任何字。', 'neutral'],
  ['17:05', '阿禾把今晚的锅洗干净了', '“万一明早还能用呢。”', 'hope'],
  ['17:28', '阿梁检查了三次门闩', '第三次和第一次没有任何区别。', 'neutral'],
  ['17:52', '街上的影子开始变长', '所有白天没做完的事，在这个时候都会显得更重要。', 'danger'],
  ['09:02', '有人给搜索站门口放了一双干袜子', '没有署名。林夏穿走了。', 'hope'],
  ['11:08', '小灰叼回来一截红绳', '它把红绳放在主灯下面，然后趴住不动。', 'hope'],
  ['12:24', '发电机今天没有咳嗽', '老周经过时还是拍了拍外壳。', 'resource'],
  ['14:02', '远处传来三声枪响', '很远。也没有第四声。', 'danger'],
  ['15:22', '有人问 DAY 7 以后怎么办', '没人回答，因为现在先得有 DAY 7 以后。', 'neutral'],
  ['16:28', '一张旧报纸从废墟里吹出来', '头版还是末日前一周的天气预报。', 'neutral'],
  ['17:14', '诊疗站窗台多了一杯热水', '程医生直到水凉了才发现。', 'hope'],
  ['18:03', '主灯第一次比夕阳更亮', '天快黑了。街上所有人都开始往自己的位置走。', 'hope'],
] as const;

function hash(input: string): number {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function eligible(state: GameState, event: StoryEventDefinition): boolean {
  const effectiveMaxDay = event.maxDay <= 6 ? 30 : event.maxDay;
  if (state.day < event.minDay || state.day > effectiveMaxDay) return false;
  if ((state.resolvedStoryEventIds ?? []).includes(event.id)) return false;
  if (!hasAll(state, event.requiresFlags)) return false;
  if (!hasAny(state, event.requiresAnyFlags)) return false;
  if ((event.excludesFlags ?? []).some((flag) => hasFlag(state, flag))) return false;
  if (event.requiresSurvivor && !state.survivors.some((item) => item.id === event.requiresSurvivor)) return false;
  if (event.requiresBuilding && !state.buildings[event.requiresBuilding]) return false;
  return true;
}

export function ensureStoryDay(state: GameState): GameState {
  if (state.phase !== 'street' || state.chapterComplete || state.storyPreparedDay === state.day) return state;
  const candidates = EVENTS.filter((event) => eligible(state, event))
    .sort((a, b) => hash(`${state.seed}:${state.day}:${a.id}`) - hash(`${state.seed}:${state.day}:${b.id}`));
  const count = 1;
  const storyDailyIds = candidates.slice(0, count).map((event) => event.id);
  const ambient = AMBIENT[hash(`${state.seed}:${state.day}:ambient`) % AMBIENT.length];
  let next: GameState = {
    ...state,
    storyPreparedDay: state.day,
    storyDailyIds,
    storyFlags: state.storyFlags ?? [],
    resolvedStoryEventIds: state.resolvedStoryEventIds ?? [],
    pendingCheck: null,
  };
  next = addLog(next, ambient[1], ambient[2], ambient[3] as LogTone, ambient[0]);
  return next;
}

export function storyEventsForState(state: GameState): StoryEventView[] {
  const ids = state.storyDailyIds ?? [];
  return ids
    .filter((id) => !(state.resolvedStoryEventIds ?? []).includes(id))
    .map((id) => EVENTS.find((event) => event.id === id))
    .filter((event): event is StoryEventDefinition => Boolean(event))
    .map(({ minDay: _min, maxDay: _max, requiresFlags: _rf, requiresAnyFlags: _raf, excludesFlags: _ef, requiresSurvivor: _rs, requiresBuilding: _rb, choices, ...view }) => ({
      ...view,
      kicker: campaignCopy(view.kicker).replace(/^DAY\s+\d+/, `DAY ${state.day}`),
      title: campaignCopy(view.title),
      body: campaignCopy(view.body),
      quote: view.quote ? campaignCopy(view.quote) : undefined,
      choices: choices.map(({ cost: _cost, effect: _effect, check: _check, ...choice }) => ({
        ...choice,
        label: campaignCopy(choice.label),
        detail: campaignCopy(choice.detail),
        checkLabel: choice.checkLabel ? campaignCopy(choice.checkLabel) : undefined,
      })),
    }));
}

function getDefinition(eventId: string): StoryEventDefinition | undefined {
  return EVENTS.find((event) => event.id === eventId);
}

function getChoice(eventId: string, choiceId: string): StoryChoiceDefinition | undefined {
  return getDefinition(eventId)?.choices.find((choice) => choice.id === choiceId);
}

export function storyChoiceAvailability(state: GameState, eventId: string, choiceId: string): { available: boolean; reason?: string } {
  const choice = getChoice(eventId, choiceId);
  if (!choice) return { available: false, reason: '事件已经变化' };
  const cost = choice.cost ?? {};
  const missing: string[] = [];
  if ((cost.parts ?? 0) < 0 && state.parts < -(cost.parts ?? 0)) missing.push('零件');
  if ((cost.supplies ?? 0) < 0 && state.supplies < -(cost.supplies ?? 0)) missing.push('口粮');
  if ((cost.medicine ?? 0) < 0 && state.medicine < -(cost.medicine ?? 0)) missing.push('药品');
  return missing.length ? { available: false, reason: `缺少${missing.join(' / ')}` } : { available: true };
}

function modifiersFor(state: GameState, check: StoryCheckDefinition): CheckModifier[] {
  const modifiers: CheckModifier[] = [];
  const actor = check.actorId ? state.survivors.find((item) => item.id === check.actorId) : undefined;
  if (actor && check.skill && actor.specialty === check.skill) modifiers.push({ label: `${actor.name} · 专长`, value: 1 });
  if (actor?.injury === 'minor') modifiers.push({ label: `${actor.name} · 轻伤`, value: -1 });
  if (actor?.injury === 'serious') modifiers.push({ label: `${actor.name} · 重伤`, value: -2 });
  if (actor && actor.energy < 40) modifiers.push({ label: `${actor.name} · 疲劳`, value: -1 });
  if (actor && check.trust && (actor.trust ?? 0) >= 2) modifiers.push({ label: `${actor.name} · 信任`, value: 1 });
  if (check.building && state.buildings[check.building]) modifiers.push({ label: '对应设施已修复', value: 1 });
  for (const bonus of check.bonuses ?? []) if (hasFlag(state, bonus.flag)) modifiers.push({ label: bonus.label, value: bonus.value });
  for (const penalty of check.penalties ?? []) if (hasFlag(state, penalty.flag)) modifiers.push({ label: penalty.label, value: penalty.value });
  return modifiers;
}

function markResolved(state: GameState, eventId: string): GameState {
  return {
    ...state,
    resolvedStoryEventIds: [...new Set([...(state.resolvedStoryEventIds ?? []), eventId])],
    lastMessage: '这件事已经写进余烬日志',
  };
}

export function beginStoryChoice(state: GameState, eventId: string, choiceId: string): GameState {
  if (state.phase !== 'street' || state.pendingCheck || !storyChoiceAvailability(state, eventId, choiceId).available) return state;
  const choice = getChoice(eventId, choiceId);
  if (!choice) return state;
  if (choice.check) {
    const next = createPendingCheck(state, {
      source: 'story', eventId, choiceId,
      label: choice.check.label,
      actorId: choice.check.actorId,
      mode: choice.check.mode ?? 'normal',
      modifiers: modifiersFor(state, choice.check),
    });
    return { ...next, lastMessage: `${choice.check.label} · 2D6 判定` };
  }
  if (!choice.effect) return state;
  return markResolved(applyEffect(state, choice.effect), eventId);
}

export function acceptStoryCheck(state: GameState): GameState {
  const pending = state.pendingCheck;
  if (!pending || pending.source !== 'story' || !pending.outcome) return state;
  const choice = getChoice(pending.eventId, pending.choiceId);
  const effectForOutcome = choice?.check?.outcomes[pending.outcome];
  if (!effectForOutcome) return { ...state, pendingCheck: null };
  let next = applyEffect(state, effectForOutcome);
  if (pending.twist === 'double-six') next = addLog(next, '双六 · 额外发现', '这次结果不只是“做成了”，还打开了新的可能。', 'hope', '12:31');
  if (pending.twist === 'double-one') next = addLog(next, '双一 · 坏事变得更坏', '没有永久死亡，但今天的代价会留下痕迹。', 'danger', '12:31');
  next = markResolved(next, pending.eventId);
  return { ...next, pendingCheck: null };
}

export function livingStreetContentCount(): number {
  return EVENTS.length + AMBIENT.length;
}
