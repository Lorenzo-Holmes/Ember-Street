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
      checked('verify', '让守夜的人确认', '靠近围栏辨认对方状态，门外的人和黑暗都离得很近。', 'watch', { hope: 1, addFlags: ['night_stranger_checked'] }, { defense: -3, actorCondition: 'minor' }),
      resource('light', '打开外围探照灯', '把外围探照灯全打亮，让门外的人站到光里。', { power: 8 }, { addFlags: ['night_stranger_seen'] }),
      consequence('ignore', '保持安静', '门不开，也不回话。敲门声停下以后，屋里会有人一直记着。', { hope: -1, addFlags: ['ignored_night_knock'] }),
    ],
  },
  {
    id: 'east-footsteps', category: 'threat', minDay: 2, maxDay: 28, title: '东街传来连续脚步声',
    body: '不像一两个游荡者。声音移动得很慢，却一直没有散开。',
    choices: [
      checked('scout', '让守夜的人去看', '摸到东街拐角，看清那些影子正往哪一边挪。', 'watch', { defense: 3, addFlags: ['east_route_known'] }, { actorCondition: 'minor', defense: -2 }),
      resource('flares', '点亮街口照明', '把街口的灯打亮，让暗处的轮廓先露出来。', { power: 7 }, { defense: 2 }),
      consequence('dark', '关闭外围灯光', '把街口压进黑暗里，尸影更难看见这里，屋里的人也更难安心。', { hope: -1, addFlags: ['kept_street_dark'] }),
    ],
  },
  {
    id: 'stray-dogs', category: 'threat', minDay: 3, maxDay: 24, title: '野狗在垃圾堆附近打转',
    body: '它们饿得厉害。叫声正在把更远的东西引过来。',
    choices: [
      checked('drive', '派人赶走它们', '不动口粮，但得有人走出围栏，把狗从街口赶开。', 'watch', { defense: 2 }, { actorCondition: 'minor', defense: -2 }),
      resource('feed', '扔一份口粮到远处', '把食物扔到另一条街，让狗群跟着味道离开。', { ration: 1 }, { defense: 1 }),
      consequence('wait', '等它们自己离开', '今晚不出去赶。狗叫会继续沿着街往远处传。', { defense: -1, addFlags: ['night_noise_unchecked'] }),
    ],
  },
  {
    id: 'generator-drop', category: 'infrastructure', minDay: 1, maxDay: 28, title: '发电机频率突然掉了',
    body: '灯光连续闪了三次。老线路发出一股很淡的焦味。',
    choices: [
      checked('repair', '让维修岗位抢修', '有人得摸黑沿着焦味查线，手会一直贴着发热的金属。', 'repair', { power: 6 }, { power: -8, actorCondition: 'minor' }, { power: -2 }),
      resource('parts', '换掉整组旧零件', '把最烫的那组旧件直接拆下来，换上仓房里的备件。', { parts: 2 }, { power: 8 }),
      consequence('cut', '切掉非必要区域', '先保主灯和诊疗，其他房间今晚会一块块暗下去。', { power: 2, hope: -1, addFlags: ['night_power_rationed'] }),
    ],
  },
  {
    id: 'clinic-blackout', category: 'infrastructure', minDay: 5, maxDay: 28, title: '诊疗室突然断电',
    body: '里面还有伤员。备用灯只够照亮一张床。',
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('rewire', '现场接回线路', '让维修的人沿墙找到断点，在手电光下把线重新接上。', 'repair', { power: 2, hope: 1 }, { actorCondition: 'minor', hope: -1 }),
      resource('battery', '接上备用电源', '从街区电力里切出一条单独线路，把诊疗室先点亮。', { power: 10 }, { hope: 1 }),
      consequence('triage', '只保最重要的设备', '只给最危险的床位供电，其余治疗今晚只能靠手电和备用灯。', { hope: -1, addFlags: ['clinic_night_compromise'] }),
    ],
  },
  {
    id: 'fence-rattle', category: 'infrastructure', minDay: 3, maxDay: 28, title: '北侧围栏固定件松了',
    body: '每一次撞击都会让缝隙大一点。现在修，比尸群来了以后修轻松得多。',
    choices: [
      checked('brace', '让维修岗位去加固', '摸黑把松动的固定件重新压紧，施工声会离围栏很近。', 'repair', { defense: 6 }, { defense: -5, actorCondition: 'minor' }),
      resource('steel', '直接加两层材料', '把两层材料直接钉上去，今晚先不让这条缝继续张开。', { materials: 2 }, { defense: 8 }),
      consequence('mark', '先做标记，天亮再修', '用粉笔把位置圈出来。今晚这段围栏只能继续带着松动撑过去。', { defense: -4, addFlags: ['north_fence_deferred'] }),
    ],
  },
  {
    id: 'water-on-radio', category: 'infrastructure', minDay: 12, maxDay: 28, title: '广播间开始漏水',
    body: '雨沿着电缆滴进桌面。信号还在，但继续工作有短路风险。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('protect', '让广播值守者抢救设备', '把还在工作的设备一件件挪开，先护住天线和主机。', 'radio', { hope: 1, addFlags: ['radio_saved_in_rain'] }, { power: -5, actorCondition: 'minor' }),
      resource('cover', '用材料封住漏点', '拿板材和防水布把漏点封住，让桌面和线缆先保持干燥。', { materials: 2 }, { hope: 1 }),
      consequence('off', '今晚关掉广播间', '关机、拔线，把桌面擦干。今晚之后的频道只能等天亮再听。', { addFlags: ['radio_silent_night'] }),
    ],
  },
  {
    id: 'fever-resident', category: 'survivor', minDay: 4, maxDay: 28, title: '一个居民开始高烧',
    body: '程医生说不一定是感染，但拖到早上可能会更麻烦。',
    requiredSurvivorIds: ['cheng'],
    choices: [
      checked('diagnose', '让医疗岗位立即处理', '趁人还清醒，把体温、伤口和呼吸一项项重新查一遍。', 'medical', { hope: 1 }, { hope: -1 }),
      resource('medicine', '直接使用药品', '先给药退烧，不等今晚把病因完全弄清。', { medicine: 1 }, { hope: 1 }),
      consequence('isolate', '先隔离到天亮', '把人单独安置到一张床上。药先不动，门外会一直有人小声议论。', { hope: -1, addFlags: ['resident_isolated'] }),
    ],
  },
  {
    id: 'argument-rations', category: 'survivor', minDay: 6, maxDay: 28, title: '有人因为配给争吵',
    body: '声音越来越大。真正的问题不是一顿饭，而是大家都觉得别人分得更多。',
    choices: [
      checked('mediate', '让熟悉大家的人调停', '把争吵的人分开，让熟悉他们的人把配给账一项项说清。', 'cook', { hope: 2 }, { hope: -2 }),
      resource('share', '加一份夜宵', '把锅重新架起来，多分一轮热的东西。', { ration: 2 }, { hope: 1 }),
      consequence('rules', '宣布严格配给规则', '从今晚开始按一张更死的表发食物，谁都不能临时多拿。', { hope: -1, addFlags: ['strict_ration_rules'] }),
    ],
  },
  {
    id: 'nightmare-child', category: 'survivor', minDay: 7, maxDay: 28, title: '孩子被噩梦惊醒',
    body: '哭声很快被捂住了，但屋里所有人都醒了。',
    choices: [
      checked('comfort', '让人留下陪一会儿', '有人坐到床边，等呼吸慢下来再回自己的岗位。', 'cook', { hope: 2 }, { hope: 0 }),
      resource('warm', '给一份热食和毯子', '把一份热食和还能用的毯子送过去。', { ration: 1 }, { hope: 2 }),
      consequence('quiet', '要求马上安静', '让屋里马上安静下来，哭声会停，人也会记住是谁让它停的。', { hope: -1, addFlags: ['silenced_child'] }),
    ],
  },
  {
    id: 'missing-name', category: 'survivor', minDay: 10, maxDay: 28, title: '有人问起失踪者的名字',
    body: '没有人知道应该回答“还没回来”，还是“已经回不来了”。',
    choices: [
      checked('talk', '把事情说清楚', '找个愿意坐下来的人，把最后一次见到他时发生的事慢慢说完。', 'radio', { hope: 1 }, { hope: -1 }),
      resource('memorial', '在主灯旁留一个位置', '用一小块材料在主灯旁留个位置，把名字写上去。', { materials: 1 }, { hope: 2, addFlags: ['memorial_started'] }),
      consequence('avoid', '今晚不谈', '今晚先不谈。那个空位还会继续摆在那里。', { addFlags: ['grief_deferred'] }),
    ],
  },
  {
    id: 'medicine-count', category: 'resource', minDay: 5, maxDay: 28, title: '药品数量对不上',
    body: '少了一份。可能只是记录错了，也可能有人私自拿走。',
    choices: [
      checked('audit', '让医疗岗位重新清点', '把药盒、记录和用过的空瓶重新对一遍，先弄清楚少在哪。', 'medical', { hope: 1 }, { hope: -1 }),
      resource('writeoff', '按损耗处理', '把少掉的那一份记进损耗，不再翻每个人的包。', { medicine: 1 }, { hope: 0 }),
      consequence('search', '检查所有人的物品', '把所有人的随身东西都摊开检查，药也许能找到，猜疑也会留下。', { hope: -2, addFlags: ['searched_residents'] }),
    ],
  },
  {
    id: 'ration-mice', category: 'resource', minDay: 2, maxDay: 18, title: '储物箱里发现了老鼠',
    body: '有几包食物已经被咬开。问题不大，但如果不处理会越来越糟。',
    choices: [
      checked('trap', '今晚做简易陷阱', '用铁丝、木片和一点耐心在储物箱边做陷阱。', 'repair', { hope: 1 }, { inventory: { ration: -1 } }),
      resource('discard', '丢掉受污染的部分', '把被咬开的几包全丢出去，不再冒险留着。', { ration: 2 }, { hope: 0 }),
      consequence('seal', '把剩余食物搬进住处', '把剩下的食物搬进有人睡觉的屋里，今晚先和人挤在一起。', { hope: -1, addFlags: ['food_moved_inside'] }),
    ],
  },
  {
    id: 'battery-shortage', category: 'resource', minDay: 8, maxDay: 28, title: '今晚的电力比预计少',
    body: '广播、诊疗、外围照明不可能全部保持满功率。',
    choices: [
      checked('balance', '让维修岗位重新分配负载', '把广播、诊疗和外围灯一条线一条线降功率，尽量不让任何一处彻底断掉。', 'repair', { power: 3 }, { power: -5 }),
      resource('parts', '换上备用稳压组件', '拆下发热的稳压件，换上仓房里的备用组件。', { parts: 1 }, { power: 6 }),
      consequence('lights-off', '先保住伤员，关掉外围灯', '把外围灯全关掉，把剩下的电优先留给诊疗室。', { defense: -3, addFlags: ['medical_power_priority'] }),
    ],
  },
  {
    id: 'radio-voice', category: 'world', minDay: 9, maxDay: 28, title: '广播里出现清晰人声',
    body: '对方只重复一串坐标和一句“仍有人活着”。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('answer', '让广播岗位回应', '回一句最短的应答，试着确认坐标那头是不是一直有人听着。', 'radio', { hope: 2, addFlags: ['external_contact'] }, { hope: -1, addFlags: ['radio_position_exposed'] }),
      resource('record', '只录下频率和坐标', '不回话，只把频率和坐标抄下来，继续听几分钟。', { power: 4 }, { addFlags: ['recorded_external_signal'] }),
      consequence('silent', '保持无线电静默', '旋钮停在那个频段，但今晚不发出任何回应。', { addFlags: ['ignored_external_signal'] }),
    ],
  },
  {
    id: 'distant-lights', category: 'world', minDay: 12, maxDay: 28, title: '城市另一边亮起三盏灯',
    body: '它们按固定间隔闪烁，不像火灾。',
    choices: [
      checked('decode', '让广播岗位判断信号', '按闪烁间隔记下来，看看是不是某种人能读懂的节奏。', 'radio', { hope: 2, addFlags: ['decoded_distant_lights'] }, { hope: 0 }),
      resource('reply-light', '用主灯回应', '让主灯按同样的节奏闪几次，城市另一头和尸影都会看见。', { power: 6 }, { hope: 2, addFlags: ['answered_with_light'] }),
      consequence('watch', '只观察，不回应', '只在纸上记下间隔，不让这条街回一盏灯。', { addFlags: ['watched_distant_lights'] }),
    ],
  },
  {
    id: 'military-burst', category: 'world', minDay: 18, maxDay: 28, title: '频段里闪过军用呼号',
    body: '只有几秒，夹着严重杂音。小满说这不是普通民用设备。',
    requiredSurvivorIds: ['xiaoman'],
    requiredBuildings: { radio: 1 },
    choices: [
      checked('trace', '追踪并尝试回应', '追着呼号回拨，试着在杂音断掉前把位置和身份说清。', 'radio', { hope: 2, addFlags: ['military_contact'] }, { power: -4 }),
      resource('boost', '提高发射功率', '把发射功率推上去，让这一句话尽可能穿过整片城区。', { power: 12 }, { addFlags: ['military_contact'], hope: 1 }),
      consequence('record-only', '只记录呼号', '把呼号和频段抄下来，今晚不追着那几秒杂音发信号。', { addFlags: ['military_frequency'] }),
    ],
  },
  {
    id: 'quiet-tea', category: 'quiet', minDay: 4, maxDay: 28, title: '难得没人敲门',
    body: '阿禾把剩下的热水倒进几只不一样的杯子里。外面仍然很黑。',
    requiredSurvivorIds: ['ahe'],
    choices: [
      checked('talk', '坐下来聊一会儿', '把巡夜的耳朵稍微放松一会儿，坐在热水旁把今天没说完的话说完。', 'cook', { hope: 2 }, { hope: 1 }),
      resource('snack', '开一份罐头当夜宵', '开一罐还舍不得吃的东西，几个人分着吃。', { ration: 1 }, { hope: 2 }),
      consequence('keep-watch', '继续保持岗位', '杯子先放着，岗位照旧。今晚的安静不一定能持续多久。', { hope: 0 }),
    ],
  },
  {
    id: 'cat-window', category: 'quiet', minDay: 6, maxDay: 28, title: '小灰一直盯着窗外',
    body: '它没有叫，只是耳朵一直朝着西边。',
    choices: [
      checked('trust-cat', '跟着它看一眼', '顺着它盯的方向去窗边听一会儿。', 'watch', { defense: 2, addFlags: ['trusted_cat_warning'] }, { hope: 0 }),
      resource('feed-cat', '给它留一点吃的', '从自己的份里掰一点给它，屋里难得有人笑出声。', { ration: 1 }, { hope: 2, addFlags: ['cat_named'] }),
      consequence('ignore-cat', '把窗帘拉上', '把窗帘拉上，继续做手头的事。', { hope: 0 }),
    ],
  },
];

export const HORDE_EVENTS: V060NightEvent[] = [
  {
    id: 'horde-approach', category: 'horde', minDay: 1, maxDay: 29, title: '尸潮正在接近',
    body: '远处的黑影已经连成一片。声音还没到，地面先开始轻微震动。',
    choices: [
      checked('read-route', '让街口岗判断来路', '爬上最高的瞭望点，看清尸群最密的那一股正朝哪条街挤。', 'watch', { defense: 7, addFlags: ['horde_route_read'] }, { defense: -4 }),
      resource('all-lights', '打开所有探照灯', '把能亮的灯全打开，换来几分钟更清楚的视野。', { power: 12 }, { defense: 6 }),
      consequence('blackout', '关闭外围灯火', '让外围彻底黑下去，少一点目标，也让屋里的人看不见外面还有多少。', { hope: -2, defense: 2, addFlags: ['horde_blackout'] }),
    ],
  },
  {
    id: 'horde-north-gate', category: 'horde', minDay: 8, maxDay: 29, title: '北门开始整体变形',
    body: '不是某一块木板，是整段结构都在向内弯。',
    choices: [
      checked('hold-gate', '让维修和守备顶上去', '人直接顶到北门后面，木板另一侧就是不断撞上来的尸群。', 'repair', { defense: 10 }, { defense: -12, actorCondition: 'serious' }, { defense: 2, actorCondition: 'minor' }),
      resource('barricade', '消耗大量材料加第二道障碍', '把建材直接拖到北门后面，顶出第二道障碍；接下来几天仓房会空很多。', { materials: 4, parts: 1 }, { defense: 12 }),
      consequence('fall-back', '放弃北段，退到内街', '把人撤到第二条街口，北侧那段围栏和房屋今晚就不再守。', { defense: -8, hope: -1, addFlags: ['north_block_abandoned'] }),
    ],
  },
  {
    id: 'horde-clinic', category: 'horde', minDay: 10, maxDay: 29, title: '伤员一下子多了起来',
    body: '诊疗室门口排起了人。程医生只能先处理最危险的几个。',
    requiredSurvivorIds: ['cheng'],
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('triage', '让医疗岗位现场分诊', '把最危险的人先抬到灯下，药和绷带按伤势一份份分。', 'medical', { hope: 2 }, { hope: -2, actorCondition: 'fatigued' }),
      resource('meds', '开放应急药品储备', '打开封着的应急药箱，先把排在门口的人处理下去。', { medicine: 2 }, { hope: 2 }),
      consequence('combat-first', '先保防线，轻伤全部等到天亮', '把还能走的人先送回防线，轻伤今晚都排到天亮以后。', { defense: 4, hope: -2, addFlags: ['horde_medical_deferred'] }),
    ],
  },
  {
    id: 'horde-main-light', category: 'horde', minDay: 15, maxDay: 29, title: '主灯熄灭了一秒',
    body: '只有一秒。整条街却像同时停止呼吸。',
    choices: [
      checked('restore', '让维修岗位恢复主灯', '有人钻进线路箱里抢修，让所有人都能亲眼看见灯重新亮起来。', 'repair', { hope: 4, power: 4, addFlags: ['kept_main_light_on'] }, { hope: -3, power: -6 }),
      resource('backup', '切入备用线路', '把零件和备用线路一起接上，不等故障慢慢排查。', { parts: 2, power: 8 }, { hope: 3, addFlags: ['kept_main_light_on'] }),
      consequence('leave-dark', '让主灯保持熄灭', '不再点亮这个最高的目标。尸群更难盯住这里，人也失去了那盏一直看得见的灯。', { defense: 3, hope: -4, addFlags: ['main_light_went_dark'] }),
    ],
  },
  {
    id: 'horde-breakthrough', category: 'horde', minDay: 20, maxDay: 29, title: '尸群冲进外围街段',
    body: '第一道围栏已经没有意义。现在决定的是堵住缺口，还是把人撤回去。',
    choices: [
      checked('counter', '让守备人员夺回缺口', '守备人员从内街反冲回缺口，离尸群只隔几米。', 'watch', { defense: 12, hope: 2 }, { defense: -15, actorCondition: 'critical' }, { defense: 2, actorCondition: 'serious' }),
      resource('seal', '用最后的建材封街', '把建材和零件全拖到路口，直接把那一段街封死。', { materials: 5, parts: 2 }, { defense: 15 }),
      consequence('evacuate-block', '撤出外围居民', '先把外围居民往主灯方向撤，放弃那一段房屋和围栏。', { defense: -8, hope: -1, addFlags: ['outer_block_evacuated'] }),
    ],
  },
  {
    id: 'horde-last-minutes', category: 'horde', minDay: 10, maxDay: 29, title: '天边开始发白',
    body: '尸潮还没有退。所有人都知道，只要再撑一会儿。',
    choices: [
      checked('hold', '让所有值守人员坚持最后一轮', '让还站得住的人继续守在最外面，撑到天色真的亮起来。', 'watch', { defense: 8, hope: 3 }, { defense: -8, actorCondition: 'serious' }),
      resource('everything', '把剩余应急物资全部压上', '仓房里能用的材料、零件和电全拿出来。先活到太阳出来。', { materials: 2, parts: 1, power: 6 }, { defense: 10, hope: 2 }),
      consequence('retreat-inner', '退守主灯周围', '把人收回主灯周围，让外围设施自己撑过最后这一段。', { defense: -5, hope: 1, addFlags: ['last_light_retreat'] }),
    ],
  },
];

export const EMERGENCY_EVENTS: V060NightEvent[] = [
  {
    id: 'emergency-north-breach', category: 'emergency', minDay: 5, maxDay: 29, title: '⚠ 北门出现两米缺口',
    body: '一辆废车被推开，围栏后面已经能看到伸进来的手。必须现在处理。',
    choices: [
      checked('rush-repair', '让维修人员冲过去补', '维修的人要贴着缺口把板材重新钉住，伸进来的手就在旁边。', 'repair', { defense: 10 }, { defense: -12, actorCondition: 'serious' }),
      resource('steel', '使用储备材料直接封口', '把储备材料全抬过去，先把两米的洞钉死。', { materials: 4 }, { defense: 12 }),
      consequence('abandon', '放弃北侧街段', '把北侧的人和能搬的东西撤回来，让那一段街留给尸群。', { defense: -8, addFlags: ['north_block_abandoned'] }),
    ],
  },
  {
    id: 'emergency-clinic-fire', category: 'emergency', minDay: 7, maxDay: 29, title: '诊疗室起火',
    body: '旧线路短路，墙后已经有明火。伤员还在里面。',
    requiredBuildings: { clinic: 1 },
    choices: [
      checked('cut-power', '让维修人员进去断电', '抢在火势钻进墙体前切掉故障线路，烟已经开始往里灌。', 'repair', { hope: 2 }, { actorCondition: 'serious', hope: -2 }),
      resource('extinguish', '消耗材料和水直接灭火', '把水和能挡火的材料全搬进去，直接压住墙后的明火。', { materials: 2 }, { hope: 1 }),
      consequence('evacuate', '放弃设备，先撤人', '药柜和设备先不管，把床上的人一个个拖到街上。', { hope: -1, addFlags: ['clinic_fire_damage'] }),
    ],
  },
  {
    id: 'emergency-generator-fire', category: 'emergency', minDay: 6, maxDay: 29, title: '⚠ 发电机冒出明火',
    body: '火焰已经碰到旁边堆放的杂物。再迟一点，整条街都会断电。',
    choices: [
      checked('repair-fire', '维修岗位冒险处理', '维修的人贴着机器拆掉起火部件，火和发烫的金属都在手边。', 'repair', { power: 8 }, { power: -15, actorCondition: 'serious' }),
      resource('replace', '牺牲零件更换核心组件', '把烧坏的核心件整组拆下，直接换上仓房里的备件。', { parts: 3 }, { power: 10 }),
      consequence('shutdown', '彻底停机到天亮', '拉下总闸，让机器彻底停下来。今晚主灯和街区都只能靠剩下的电。', { power: -15, hope: -1, addFlags: ['generator_shutdown'] }),
    ],
  },
  {
    id: 'emergency-panic', category: 'emergency', minDay: 8, maxDay: 29, title: '⚠ 居民开始向内街拥挤',
    body: '有人喊围栏要塌了。恐慌比尸群更快地穿过人群。',
    choices: [
      checked('calm', '让可信的人稳住大家', '站到人群前面把真实情况说清楚，让往里挤的人先停下来。', 'radio', { hope: 4 }, { hope: -4 }),
      resource('food', '开放一批口粮和热水', '把热水和能马上拿到手的食物摆出来，让所有人先有一件确定的事可做。', { ration: 3 }, { hope: 3 }),
      consequence('lockdown', '封闭居民区入口', '把通往内街的入口直接关上，拥挤会停，门外的人会知道自己被挡在外面。', { hope: -2, defense: 2, addFlags: ['night_lockdown'] }),
    ],
  },
  {
    id: 'emergency-missing-child', category: 'emergency', minDay: 9, maxDay: 29, title: '⚠ 有个孩子不见了',
    body: '最后有人看见他在主灯附近。现在外面正是最危险的时候。',
    choices: [
      checked('search-child', '派守夜者立即寻找', '沿主灯到围栏的每一条暗路去找，人可能找到，也可能把自己困在外面。', 'watch', { hope: 4, addFlags: ['child_found_night'] }, { actorCondition: 'serious', hope: -3 }),
      resource('lights', '开全部照明广播寻找', '把能开的灯都点亮，再用广播一遍遍喊名字。', { power: 10 }, { hope: 3, addFlags: ['child_found_night'] }),
      consequence('wait-child', '封锁街区，等到天亮', '所有出口先封住，没人再出去。这个名字会被一直叫到天亮。', { hope: -3, addFlags: ['child_missing_until_dawn'] }),
    ],
  },
  {
    id: 'emergency-radio-distress', category: 'emergency', minDay: 15, maxDay: 29, title: '⚠ 广播收到近距离求救',
    body: '对方就在两条街之外，说他们被困在屋顶。尸潮正在靠近。',
    requiredBuildings: { radio: 1 },
    choices: [
      checked('guide', '用广播指导他们撤离', '不派人出去，只靠地图和对方报出的路口，一步步告诉他们往哪走。', 'radio', { hope: 3, addFlags: ['rescued_by_radio'] }, { hope: -1 }),
      resource('signal', '开主灯和高功率信标', '把主灯和信标都推到最亮，让屋顶上的人直接朝这条街找方向。', { power: 12 }, { hope: 2, addFlags: ['rescued_by_radio'] }),
      consequence('cannot-help', '告诉他们这里也守不住', '把实话说出去，然后关掉发射。这个声音会留在所有人记忆里。', { hope: -2, addFlags: ['refused_rooftop_rescue'] }),
    ],
  },
  {
    id: 'emergency-building-collapse', category: 'emergency', minDay: 18, maxDay: 29, title: '⚠ 一面旧墙开始倒塌',
    body: '墙后就是居民休息区。现在加固还是撤人，只有几分钟。',
    requiredBuildings: { shelter: 1 },
    choices: [
      checked('shore', '让维修人员支撑结构', '维修的人钻到裂开的墙边，把还能受力的梁一根根顶住。', 'repair', { hope: 2 }, { actorCondition: 'critical', hope: -2 }),
      resource('brace-material', '用建材搭临时支撑', '把木料和金属杆全拖进屋里，先搭出能撑到天亮的支架。', { materials: 3 }, { hope: 1 }),
      consequence('move', '全员转移到街边', '把铺盖和人一起搬出去，今晚就在街边和走廊里挤着睡。', { hope: -1, addFlags: ['shelter_partially_closed'] }),
    ],
  },
  {
    id: 'emergency-main-light', category: 'emergency', minDay: 20, maxDay: 29, title: '⚠ 主灯彻底熄灭',
    body: '这次没有立刻重新亮起。黑暗里有人开始喊老周的名字。',
    requiredSurvivorIds: ['zhou'],
    choices: [
      checked('restore-main', '现场抢修主灯', '老周要爬进线路箱里，把这盏全街都盯着的灯重新接回来。', 'repair', { hope: 5, addFlags: ['kept_main_light_on'] }, { hope: -4, actorCondition: 'serious' }),
      resource('backup-main', '牺牲备用零件和电力', '把备用零件和电一口气接上去，不等故障慢慢查清。', { parts: 3, power: 12 }, { hope: 4, addFlags: ['kept_main_light_on'] }),
      consequence('dark-main', '接受黑暗，保全其他系统', '主灯今晚不再亮。诊疗、广播和内街还能有电，但所有人抬头时只会看见黑。', { defense: 2, hope: -4, addFlags: ['main_light_went_dark'] }),
    ],
  },
];

export const ALL_V060_NIGHT_EVENTS = [...NORMAL_NIGHT_EVENTS, ...HORDE_EVENTS, ...EMERGENCY_EVENTS];

export function nightEventById(id: string): V060NightEvent | undefined {
  return ALL_V060_NIGHT_EVENTS.find((event) => event.id === id);
}
