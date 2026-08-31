import type { BuildingId, CheckOutcome, Inventory, Role, RollMode, SurvivorCondition } from '../types';

export type NightEventCategory = 'threat' | 'infrastructure' | 'survivor' | 'resource' | 'world' | 'quiet' | 'horde' | 'emergency';
export type NightChoiceStrategy = 'person' | 'resource' | 'consequence';

export interface NightEffect {
  hope?: number;
  defense?: number;
  power?: number;
  inventory?: Partial<Pick<Inventory, 'ration' | 'medicine' | 'materials' | 'parts'>>;
  addFlags?: string[];
  actorCondition?: SurvivorCondition;
}

export interface NightChoice {
  id: string;
  label: string;
  detail: string;
  strategy: NightChoiceStrategy;
  cost?: Partial<Pick<Inventory, 'ration' | 'medicine' | 'materials' | 'parts'>> & { power?: number };
  check?: { label: string; role?: Role; mode?: RollMode };
  direct?: NightEffect;
  outcomes?: Partial<Record<CheckOutcome, NightEffect>>;
}

export interface V060NightEvent {
  id: string;
  category: NightEventCategory;
  minDay: number;
  maxDay: number;
  title: string;
  body: string;
  quote?: string;
  requiredSurvivorIds?: string[];
  requiredBuildings?: Partial<Record<BuildingId, number>>;
  requiredFlags?: string[];
  excludedFlags?: string[];
  choices: [NightChoice, NightChoice, NightChoice];
}

const checked = (
  id: string,
  label: string,
  detail: string,
  role: Role,
  success: NightEffect,
  failure: NightEffect,
  partial: NightEffect = failure,
): NightChoice => ({
  id, label, detail, strategy: 'person', check: { label, role },
  outcomes: { failure, partial, success, critical: { ...success, hope: (success.hope ?? 0) + 1 } },
});

const resource = (id: string, label: string, detail: string, cost: NightChoice['cost'], effect: NightEffect): NightChoice => ({ id, label, detail, strategy: 'resource', cost, direct: effect });
const consequence = (id: string, label: string, detail: string, effect: NightEffect): NightChoice => ({ id, label, detail, strategy: 'consequence', direct: effect });

export const NORMAL_NIGHT_EVENTS: V060NightEvent[] = [
  {
    id: 'gate-knocking', category: 'threat', minDay: 1, maxDay: 28, title: '围栏外有人敲门',
    body: '声音很轻，三下之后停住了。黑暗里有人压着嗓子说自己没有被咬。',
    choices: [
      checked('verify', '让守夜的人确认', '靠近围栏辨认对方状态，有被骗或被扑咬的风险。', 'watch', { hope: 1, addFlags: ['night_stranger_checked'] }, { defense: -3, actorCondition: 'minor' }),
      resource('light', '打开外围探照灯', '用电力换一次稳定确认。', { power: 8 }, { addFlags: ['night_stranger_seen'] }),
      consequence('ignore', '保持安静', '不打开门，也不回应。今晚最安全，但这件事可能留下后果。', { hope: -1, addFlags: ['ignored_night_knock'] }),
    ],
  },
  {
    id: 'east-footsteps', category: 'threat', minDay: 2, maxDay: 28, title: '东街传来连续脚步声',
    body: '不像一两个游荡者。声音移动得很慢，却一直没有散开。',
    choices: [
      checked('scout', '让守夜的人去看', '确认尸影移动方向，为后续事件争取情报。', 'watch', { defense: 3, addFlags: ['east_route_known'] }, { actorCondition: 'minor', defense: -2 }),
      resource('flares', '点亮街口照明', '消耗电力把暗处照亮。', { power: 7 }, { defense: 2 }),
      consequence('dark', '关闭外围灯光', '降低暴露，但街上的人会更紧张。', { hope: -1, addFlags: ['kept_street_dark'] }),
    ],
  },
  {
    id: 'stray-dogs', category: 'threat', minDay: 3, maxDay: 24, title: '野狗在垃圾堆附近打转',
    body: '它们饿得厉害。叫声正在把更远的东西引过来。',
    choices: [
      checked('drive', '派人赶走它们', '不浪费口粮，但要走出安全区。', 'watch', { defense: 2 }, { actorCondition: 'minor', defense: -2 }),
      resource('feed', '扔一份口粮到远处', '用食物把它们引离主街。', { ration: 1 }, { defense: 1 }),
      consequence('wait', '等它们自己离开', '不付出资源，接受噪音带来的风险。', { defense: -1, addFlags: ['night_noise_unchecked'] }),
    ],
  },
  {
    id: 'generator-drop', category: 'infrastructure', minDay: 1, maxDay: 28, title: '发电机频率突然掉了',
    body: '灯光连续闪了三次。老线路发出一股很淡的焦味。',
    choices: [
      checked('repair', '让维修岗位抢修', '保住电力，但维修者要在黑暗里排查线路。', 'repair', { power: 6 }, { power: -8, actorCondition: 'minor' }, { power: -2 }),
      resource('parts', '换掉整组旧零件', '稳定，但成本不低。', { parts: 2 }, { power: 8 }),
      consequence('cut', '切掉非必要区域', '保住核心线路，街区会暗下来。', { power: 2, hope: -1, addFlags: ['night_power_rationed'] }),
    ],
  },
  {
    id: 'clinic-blackout', category: 'infrastructure', minDay: 5, maxDay: 28, title: '诊疗站突然断电',
    body: '里面还有伤员。备用灯只够照亮一张床。',
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('rewire', '现场接回线路', '需要维修人员和稳定的手。', 'repair', { power: 2, hope: 1 }, { actorCondition: 'minor', hope: -1 }),
      resource('battery', '启用备用电源', '直接从街区电力储备切出一部分。', { power: 10 }, { hope: 1 }),
      consequence('triage', '只保最重要的设备', '暂时撑过去，但医疗能力会受影响。', { hope: -1, addFlags: ['clinic_night_compromise'] }),
    ],
  },
  {
    id: 'fence-rattle', category: 'infrastructure', minDay: 3, maxDay: 28, title: '北侧围栏固定件松了',
    body: '每一次撞击都会让缝隙大一点。现在修，比尸群来了以后修轻松得多。',
    choices: [
      checked('brace', '让维修岗位去加固', '省材料，但要冒一次夜间施工风险。', 'repair', { defense: 6 }, { defense: -5, actorCondition: 'minor' }),
      resource('steel', '直接加两层材料', '稳妥地把问题压下去。', { materials: 2 }, { defense: 8 }),
      consequence('mark', '先做标记，天亮再修', '保留资源，但今晚这段围栏更脆弱。', { defense: -4, addFlags: ['north_fence_deferred'] }),
    ],
  },
  {
    id: 'water-on-radio', category: 'infrastructure', minDay: 12, maxDay: 28, title: '广播亭开始漏水',
    body: '雨沿着电缆滴进桌面。信号还在，但继续工作有短路风险。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('protect', '让广播值守者抢救设备', '保留今晚的外界联系。', 'radio', { hope: 1, addFlags: ['radio_saved_in_rain'] }, { power: -5, actorCondition: 'minor' }),
      resource('cover', '用材料封住漏点', '花材料换稳定。', { materials: 2 }, { hope: 1 }),
      consequence('off', '今晚关闭广播亭', '没有损失，但错过可能出现的信号。', { addFlags: ['radio_silent_night'] }),
    ],
  },
  {
    id: 'fever-resident', category: 'survivor', minDay: 4, maxDay: 28, title: '一个居民开始高烧',
    body: '程医生说不一定是感染，但拖到早上可能会更麻烦。',
    requiredSurvivorIds: ['cheng'],
    choices: [
      checked('diagnose', '让医疗岗位立即处理', '判断病因并稳定状态。', 'medical', { hope: 1 }, { hope: -1 }),
      resource('medicine', '直接使用药品', '不赌诊断，先把人稳住。', { medicine: 1 }, { hope: 1 }),
      consequence('isolate', '先隔离到天亮', '不消耗药，但居民会感到不安。', { hope: -1, addFlags: ['resident_isolated'] }),
    ],
  },
  {
    id: 'argument-rations', category: 'survivor', minDay: 6, maxDay: 28, title: '有人因为配给争吵',
    body: '声音越来越大。真正的问题不是一顿饭，而是大家都觉得别人分得更多。',
    choices: [
      checked('mediate', '让熟悉大家的人调停', '靠信任解决，而不是靠更多食物。', 'cook', { hope: 2 }, { hope: -2 }),
      resource('share', '加一份夜宵', '用口粮把火气先压下来。', { ration: 2 }, { hope: 1 }),
      consequence('rules', '宣布严格配给规则', '秩序恢复，但气氛会变冷。', { hope: -1, addFlags: ['strict_ration_rules'] }),
    ],
  },
  {
    id: 'nightmare-child', category: 'survivor', minDay: 7, maxDay: 28, title: '孩子被噩梦惊醒',
    body: '哭声很快被捂住了，但屋里所有人都醒了。',
    choices: [
      checked('comfort', '让人留下陪一会儿', '没有物资收益，只是让一个晚上没那么难熬。', 'cook', { hope: 2 }, { hope: 0 }),
      resource('warm', '给一份热食和毯子', '用少量口粮换安定。', { ration: 1 }, { hope: 2 }),
      consequence('quiet', '要求马上安静', '降低噪音，但会留下距离感。', { hope: -1, addFlags: ['silenced_child'] }),
    ],
  },
  {
    id: 'missing-name', category: 'survivor', minDay: 10, maxDay: 28, title: '有人问起失踪者的名字',
    body: '没有人知道应该回答“还没回来”，还是“已经回不来了”。',
    choices: [
      checked('talk', '把事情说清楚', '需要有人承担这段谈话。', 'radio', { hope: 1 }, { hope: -1 }),
      resource('memorial', '在主灯旁留一个位置', '消耗少量材料做一块简单标记。', { materials: 1 }, { hope: 2, addFlags: ['memorial_started'] }),
      consequence('avoid', '今晚不谈', '没有立即代价，但问题没有消失。', { addFlags: ['grief_deferred'] }),
    ],
  },
  {
    id: 'medicine-count', category: 'resource', minDay: 5, maxDay: 28, title: '药品数量对不上',
    body: '少了一份。可能只是记录错了，也可能有人私自拿走。',
    choices: [
      checked('audit', '让医疗岗位重新清点', '查清楚原因，避免互相猜疑。', 'medical', { hope: 1 }, { hope: -1 }),
      resource('writeoff', '按损耗处理', '接受损失，不继续追究。', { medicine: 1 }, { hope: 0 }),
      consequence('search', '检查所有人的物品', '可能找得到，也会伤害信任。', { hope: -2, addFlags: ['searched_residents'] }),
    ],
  },
  {
    id: 'ration-mice', category: 'resource', minDay: 2, maxDay: 18, title: '储物箱里发现了老鼠',
    body: '有几包食物已经被咬开。问题不大，但如果不处理会越来越糟。',
    choices: [
      checked('trap', '今晚做简易陷阱', '省口粮，靠动手能力解决。', 'repair', { hope: 1 }, { inventory: { ration: -1 } }),
      resource('discard', '丢掉受污染的部分', '直接止损。', { ration: 2 }, { hope: 0 }),
      consequence('seal', '把剩余食物搬进住处', '暂时安全，但居住空间更拥挤。', { hope: -1, addFlags: ['food_moved_inside'] }),
    ],
  },
  {
    id: 'battery-shortage', category: 'resource', minDay: 8, maxDay: 28, title: '今晚的电力比预计少',
    body: '广播、诊疗、外围照明不可能全部保持满功率。',
    choices: [
      checked('balance', '让维修岗位重新分配负载', '做得好可以少牺牲一部分系统。', 'repair', { power: 3 }, { power: -5 }),
      resource('parts', '换上备用稳压组件', '消耗零件稳定电网。', { parts: 1 }, { power: 6 }),
      consequence('lights-off', '优先保医疗，关闭外围灯', '更安全地保住人，但守备更难。', { defense: -3, addFlags: ['medical_power_priority'] }),
    ],
  },
  {
    id: 'radio-voice', category: 'world', minDay: 9, maxDay: 28, title: '广播里出现清晰人声',
    body: '对方只重复一串坐标和一句“仍有人活着”。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('answer', '让广播岗位回应', '可能建立长期联系，也可能暴露位置。', 'radio', { hope: 2, addFlags: ['external_contact'] }, { hope: -1, addFlags: ['radio_position_exposed'] }),
      resource('record', '只录下频率和坐标', '消耗一点电力保持监听。', { power: 4 }, { addFlags: ['recorded_external_signal'] }),
      consequence('silent', '保持无线电静默', '最安全，但可能错过一次机会。', { addFlags: ['ignored_external_signal'] }),
    ],
  },
  {
    id: 'distant-lights', category: 'world', minDay: 12, maxDay: 28, title: '城市另一边亮起三盏灯',
    body: '它们按固定间隔闪烁，不像火灾。',
    choices: [
      checked('decode', '让广播岗位判断信号', '如果是人为编码，也许能读出意思。', 'radio', { hope: 2, addFlags: ['decoded_distant_lights'] }, { hope: 0 }),
      resource('reply-light', '用主灯回应', '消耗电力，也让更多东西看见这里。', { power: 6 }, { hope: 2, addFlags: ['answered_with_light'] }),
      consequence('watch', '只观察，不回应', '保守地记录规律。', { addFlags: ['watched_distant_lights'] }),
    ],
  },
  {
    id: 'military-burst', category: 'world', minDay: 18, maxDay: 28, title: '频段里闪过军用呼号',
    body: '只有几秒，夹着严重杂音。小满说这不是普通民用设备。',
    requiredSurvivorIds: ['xiaoman'],
    requiredBuildings: { radio: 1 },
    choices: [
      checked('trace', '追踪并尝试回应', '需要广播岗位和稳定电力。', 'radio', { hope: 2, addFlags: ['military_contact'] }, { power: -4 }),
      resource('boost', '提高发射功率', '用大量电力换一次清晰回应。', { power: 12 }, { addFlags: ['military_contact'], hope: 1 }),
      consequence('record-only', '只记录呼号', '保留未来机会，但今晚不冒险。', { addFlags: ['military_frequency'] }),
    ],
  },
  {
    id: 'quiet-tea', category: 'quiet', minDay: 4, maxDay: 28, title: '难得没人敲门',
    body: '阿禾把剩下的热水倒进几只不一样的杯子里。外面仍然很黑。',
    requiredSurvivorIds: ['ahe'],
    choices: [
      checked('talk', '坐下来聊一会儿', '放弃一点警惕，换一段真正的休息。', 'cook', { hope: 2 }, { hope: 1 }),
      resource('snack', '开一份罐头当夜宵', '这是浪费，也是生活。', { ration: 1 }, { hope: 2 }),
      consequence('keep-watch', '继续保持岗位', '没有奖励，也没有额外风险。', { hope: 0 }),
    ],
  },
  {
    id: 'cat-window', category: 'quiet', minDay: 6, maxDay: 28, title: '小灰一直盯着窗外',
    body: '它没有叫，只是耳朵一直朝着西边。',
    choices: [
      checked('trust-cat', '跟着它看一眼', '也许什么都没有，也许动物比人先听到了。', 'watch', { defense: 2, addFlags: ['trusted_cat_warning'] }, { hope: 0 }),
      resource('feed-cat', '给它留一点吃的', '资源很紧，但有人还是笑了。', { ration: 1 }, { hope: 2, addFlags: ['cat_named'] }),
      consequence('ignore-cat', '把窗帘拉上', '今晚已经有太多事情需要担心。', { hope: 0 }),
    ],
  },
];

export const HORDE_EVENTS: V060NightEvent[] = [
  {
    id: 'horde-approach', category: 'horde', minDay: 1, maxDay: 29, title: '尸潮正在接近',
    body: '远处的黑影已经连成一片。声音还没到，地面先开始轻微震动。',
    choices: [
      checked('read-route', '让守夜岗判断主攻方向', '提前知道它们会撞向哪里。', 'watch', { defense: 7, addFlags: ['horde_route_read'] }, { defense: -4 }),
      resource('all-lights', '打开所有探照灯', '用大量电力换视野和准备时间。', { power: 12 }, { defense: 6 }),
      consequence('blackout', '关闭外围灯火', '降低暴露，居民的恐惧会上升。', { hope: -2, defense: 2, addFlags: ['horde_blackout'] }),
    ],
  },
  {
    id: 'horde-north-gate', category: 'horde', minDay: 8, maxDay: 29, title: '北门开始整体变形',
    body: '不是某一块木板，是整段结构都在向内弯。',
    choices: [
      checked('hold-gate', '让维修和守备顶上去', '成功能保住门，失败的人会离尸群很近。', 'repair', { defense: 10 }, { defense: -12, actorCondition: 'serious' }, { defense: 2, actorCondition: 'minor' }),
      resource('barricade', '消耗大量材料加第二道障碍', '稳定，但会吃掉之后几天的建设储备。', { materials: 4, parts: 1 }, { defense: 12 }),
      consequence('fall-back', '放弃北段，退到内街', '优先保人，永久失去一段外围防线。', { defense: -8, hope: -1, addFlags: ['north_block_abandoned'] }),
    ],
  },
  {
    id: 'horde-clinic', category: 'horde', minDay: 10, maxDay: 29, title: '伤员一下子多了起来',
    body: '诊疗站门口排起了人。程医生只能先处理最危险的几个。',
    requiredSurvivorIds: ['cheng'],
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('triage', '让医疗岗位现场分诊', '用专业判断把药留给最需要的人。', 'medical', { hope: 2 }, { hope: -2, actorCondition: 'fatigued' }),
      resource('meds', '开放应急药品储备', '用药换稳定。', { medicine: 2 }, { hope: 2 }),
      consequence('combat-first', '先保防线，轻伤全部等到天亮', '防线压力下降，但居民会记住这次选择。', { defense: 4, hope: -2, addFlags: ['horde_medical_deferred'] }),
    ],
  },
  {
    id: 'horde-main-light', category: 'horde', minDay: 15, maxDay: 29, title: '主灯熄灭了一秒',
    body: '只有一秒。整条街却像同时停止呼吸。',
    choices: [
      checked('restore', '让维修岗位恢复主灯', '如果抢修成功，所有人都会看见它重新亮起来。', 'repair', { hope: 4, power: 4, addFlags: ['kept_main_light_on'] }, { hope: -3, power: -6 }),
      resource('backup', '切入备用线路', '花零件和电力直接拉回主灯。', { parts: 2, power: 8 }, { hope: 3, addFlags: ['kept_main_light_on'] }),
      consequence('leave-dark', '让主灯保持熄灭', '降低尸群注意，但街区的象征也消失了。', { defense: 3, hope: -4, addFlags: ['main_light_went_dark'] }),
    ],
  },
  {
    id: 'horde-breakthrough', category: 'horde', minDay: 20, maxDay: 29, title: '尸群冲进外围街段',
    body: '第一道围栏已经没有意义。现在决定的是堵住缺口，还是把人撤回去。',
    choices: [
      checked('counter', '让守备人员夺回缺口', '非常危险，但成功能避免街区继续后退。', 'watch', { defense: 12, hope: 2 }, { defense: -15, actorCondition: 'critical' }, { defense: 2, actorCondition: 'serious' }),
      resource('seal', '用最后的建材封街', '把一整段路变成死路。', { materials: 5, parts: 2 }, { defense: 15 }),
      consequence('evacuate-block', '撤出外围居民', '减少人员风险，街区完整度会下降。', { defense: -8, hope: -1, addFlags: ['outer_block_evacuated'] }),
    ],
  },
  {
    id: 'horde-last-minutes', category: 'horde', minDay: 10, maxDay: 29, title: '天边开始发白',
    body: '尸潮还没有退。所有人都知道，只要再撑一会儿。',
    choices: [
      checked('hold', '让所有值守人员坚持最后一轮', '最后一次用人去顶风险。', 'watch', { defense: 8, hope: 3 }, { defense: -8, actorCondition: 'serious' }),
      resource('everything', '把剩余应急物资全部压上', '不省了。先活到太阳出来。', { materials: 2, parts: 1, power: 6 }, { defense: 10, hope: 2 }),
      consequence('retreat-inner', '退守主灯周围', '保全人，接受外围设施受损。', { defense: -5, hope: 1, addFlags: ['last_light_retreat'] }),
    ],
  },
];

export const EMERGENCY_EVENTS: V060NightEvent[] = [
  {
    id: 'emergency-north-breach', category: 'emergency', minDay: 5, maxDay: 29, title: '⚠ 北门出现两米缺口',
    body: '一辆废车被推开，围栏后面已经能看到伸进来的手。必须现在处理。',
    choices: [
      checked('rush-repair', '让维修人员冲过去补', '快，但非常靠近缺口。', 'repair', { defense: 10 }, { defense: -12, actorCondition: 'serious' }),
      resource('steel', '使用储备材料直接封口', '稳定且昂贵。', { materials: 4 }, { defense: 12 }),
      consequence('abandon', '放弃北侧街段', '保住人员，长期失去外围区域。', { defense: -8, addFlags: ['north_block_abandoned'] }),
    ],
  },
  {
    id: 'emergency-clinic-fire', category: 'emergency', minDay: 7, maxDay: 29, title: '⚠ 诊疗站起火',
    body: '旧线路短路，墙后已经有明火。伤员还在里面。',
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('cut-power', '让维修人员进去断电', '抢在火势扩大前切掉故障线路。', 'repair', { hope: 2 }, { actorCondition: 'serious', hope: -2 }),
      resource('extinguish', '消耗材料和水直接灭火', '稳定处理，不赌人。', { materials: 2 }, { hope: 1 }),
      consequence('evacuate', '放弃设备，先撤人', '人员安全，诊疗能力会受影响。', { hope: -1, addFlags: ['clinic_fire_damage'] }),
    ],
  },
  {
    id: 'emergency-generator-fire', category: 'emergency', minDay: 6, maxDay: 29, title: '⚠ 发电机冒出明火',
    body: '火焰已经碰到旁边堆放的杂物。再迟一点，整条街都会断电。',
    choices: [
      checked('repair-fire', '维修岗位冒险处理', '保设备，也可能伤人。', 'repair', { power: 8 }, { power: -15, actorCondition: 'serious' }),
      resource('replace', '牺牲零件更换核心组件', '快速稳定设备。', { parts: 3 }, { power: 10 }),
      consequence('shutdown', '彻底停机到天亮', '避免爆炸，今晚进入低电状态。', { power: -15, hope: -1, addFlags: ['generator_shutdown'] }),
    ],
  },
  {
    id: 'emergency-panic', category: 'emergency', minDay: 8, maxDay: 29, title: '⚠ 居民开始向内街拥挤',
    body: '有人喊围栏要塌了。恐慌比尸群更快地穿过人群。',
    choices: [
      checked('calm', '让可信的人稳住大家', '如果说服失败，混乱会更严重。', 'radio', { hope: 4 }, { hope: -4 }),
      resource('food', '开放一批口粮和热水', '用眼前的确定感压住恐慌。', { ration: 3 }, { hope: 3 }),
      consequence('lockdown', '封闭居民区入口', '秩序恢复，但有人会觉得自己被困住。', { hope: -2, defense: 2, addFlags: ['night_lockdown'] }),
    ],
  },
  {
    id: 'emergency-missing-child', category: 'emergency', minDay: 9, maxDay: 29, title: '⚠ 有个孩子不见了',
    body: '最后有人看见他在主灯附近。现在外面正是最危险的时候。',
    choices: [
      checked('search-child', '派守夜者立即寻找', '人可能找到，也可能把自己搭进去。', 'watch', { hope: 4, addFlags: ['child_found_night'] }, { actorCondition: 'serious', hope: -3 }),
      resource('lights', '开全部照明广播寻找', '消耗大量电力，减少搜索盲区。', { power: 10 }, { hope: 3, addFlags: ['child_found_night'] }),
      consequence('wait-child', '封锁街区，等到天亮', '不额外冒险，但这一夜不会有人安心。', { hope: -3, addFlags: ['child_missing_until_dawn'] }),
    ],
  },
  {
    id: 'emergency-radio-distress', category: 'emergency', minDay: 15, maxDay: 29, title: '⚠ 广播收到近距离求救',
    body: '对方就在两条街之外，说他们被困在屋顶。尸潮正在靠近。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('guide', '用广播指导他们撤离', '不派人出去，但需要稳定判断路线。', 'radio', { hope: 3, addFlags: ['rescued_by_radio'] }, { hope: -1 }),
      resource('signal', '开主灯和高功率信标', '让他们直接朝余烬长街移动。', { power: 12 }, { hope: 2, addFlags: ['rescued_by_radio'] }),
      consequence('cannot-help', '告诉他们这里也守不住', '不承担额外风险。这个声音会留在所有人记忆里。', { hope: -2, addFlags: ['refused_rooftop_rescue'] }),
    ],
  },
  {
    id: 'emergency-building-collapse', category: 'emergency', minDay: 18, maxDay: 29, title: '⚠ 一面旧墙开始倒塌',
    body: '墙后就是居民休息区。现在加固还是撤人，只有几分钟。',
    requiredBuildings: { shelter: 1 },
    choices: [
      checked('shore', '让维修人员支撑结构', '成功能保住房间，失败会受重伤。', 'repair', { hope: 2 }, { actorCondition: 'critical', hope: -2 }),
      resource('brace-material', '用建材搭临时支撑', '直接稳定到天亮。', { materials: 3 }, { hope: 1 }),
      consequence('move', '全员转移到街边', '安全，但休息条件变差。', { hope: -1, addFlags: ['shelter_partially_closed'] }),
    ],
  },
  {
    id: 'emergency-main-light', category: 'emergency', minDay: 20, maxDay: 29, title: '⚠ 主灯彻底熄灭',
    body: '这次没有立刻重新亮起。黑暗里有人开始喊老周的名字。',
    requiredSurvivorIds: ['zhou'],
    choices: [
      checked('restore-main', '现场抢修主灯', '成功会成为所有人记得的一刻。', 'repair', { hope: 5, addFlags: ['kept_main_light_on'] }, { hope: -4, actorCondition: 'serious' }),
      resource('backup-main', '牺牲备用零件和电力', '让灯立刻回来。', { parts: 3, power: 12 }, { hope: 4, addFlags: ['kept_main_light_on'] }),
      consequence('dark-main', '接受黑暗，保全其他系统', '街仍然活着，但象征熄灭了。', { defense: 2, hope: -4, addFlags: ['main_light_went_dark'] }),
    ],
  },
];

export const ALL_V060_NIGHT_EVENTS = [...NORMAL_NIGHT_EVENTS, ...HORDE_EVENTS, ...EMERGENCY_EVENTS];

export function nightEventById(id: string): V060NightEvent | undefined {
  return ALL_V060_NIGHT_EVENTS.find((event) => event.id === id);
}
