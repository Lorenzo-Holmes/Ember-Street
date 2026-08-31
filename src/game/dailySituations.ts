import type { GameState, LogTone } from './types';

export interface DailySituationChoice { id: string; label: string; detail: string; }
export interface DailySituationView { id: string; kicker: string; title: string; body: string; choices: DailySituationChoice[]; }

interface Effect { hope?: number; supplies?: number; parts?: number; medicine?: number; power?: number; defense?: number; title: string; body: string; tone?: LogTone; }
interface Template extends Omit<DailySituationView, 'id' | 'kicker' | 'choices'> { key: string; minDay: number; maxDay: number; choices: Array<DailySituationChoice & { effect: Effect }>; }

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const TEMPLATES: Template[] = [
  { key: 'meal-line', minDay: 1, maxDay: 30, title: '今天的配给队排得比平时长', body: '有人昨天没拿到热食，也有人想替伤员多领一份。阿禾看着锅，没有催你。', choices: [
    { id: 'equal', label: '按人头平均分', detail: '希望稳定，库存按正常节奏消耗。', effect: { hope: 1, title: '今天按人头分饭', body: '没有人多拿，也没有人空手走。', tone: 'hope' } },
    { id: 'wounded', label: '伤员优先', detail: '多消耗一点库存，换更强的街区认同。', effect: { supplies: -1, hope: 2, title: '伤员先拿到了热饭', body: '队伍安静地往前挪，没有人抱怨。', tone: 'hope' } },
  ] },
  { key: 'scrap-cart', minDay: 2, maxDay: 30, title: '街口推来一车废金属', body: '大多是弯掉的铁皮和断线。老周说整理一下，至少有一部分还能变回零件。', choices: [
    { id: 'sort', label: '花半天分类', detail: '得到更多零件。', effect: { parts: 2, title: '废金属被分成了几堆', body: '能焊的、能拆的、只能拿来压东西的，都有了去处。', tone: 'resource' } },
    { id: 'fence', label: '直接压到围栏后', detail: '少一点零件，直接增加防线。', effect: { defense: 4, title: '废铁成了第二道障碍', body: '不漂亮，但尸群也不会嫌它难看。', tone: 'resource' } },
  ] },
  { key: 'water', minDay: 2, maxDay: 30, title: '今天的干净水比预计少', body: '储水桶底部出现泥沙。程医生说今天最好少用一点。', choices: [
    { id: 'ration', label: '全街节水一天', detail: '希望略降，但保住医疗库存。', effect: { hope: -1, medicine: 1, title: '今天开始节水', body: '每个人的杯子都只装了七分满。' } },
    { id: 'boil', label: '用电烧水过滤', detail: '消耗电力，维持正常生活。', effect: { power: -4, hope: 1, title: '后院一直冒着蒸汽', body: '至少今天没人因为一杯水发愁。', tone: 'hope' } },
  ] },
  { key: 'battery-check', minDay: 3, maxDay: 30, title: '一批旧电池电压不一致', body: '混着用可能烧坏设备，逐个测试又很费时间。', choices: [
    { id: 'test', label: '逐个测试', detail: '稳定增加电力。', effect: { power: 7, title: '可用电池被重新编号', body: '小满把每一块剩余电量都写在胶带上。', tone: 'resource' } },
    { id: 'parts', label: '拆掉状态最差的', detail: '回收少量零件。', effect: { parts: 2, power: 2, title: '坏电池被拆成了零件', body: '真正能继续工作的只留下最可靠的那批。', tone: 'resource' } },
  ] },
  { key: 'fence-shift', minDay: 4, maxDay: 30, title: '围栏底座被雨水冲松', body: '目前不会倒，但再挨几次撞击就说不准了。', choices: [
    { id: 'repair', label: '今天就补', detail: '消耗一个零件，防线明显恢复。', effect: { parts: -1, defense: 7, title: '围栏底座重新压实', body: '老周用碎砖和钢片把最松的地方重新固定。', tone: 'resource' } },
    { id: 'mark', label: '先做标记，今晚重点盯', detail: '不花资源，小幅增加防线。', effect: { defense: 3, title: '松动位置被涂成红色', body: '阿梁今晚会多看这一段。' } },
  ] },
  { key: 'fever', minDay: 8, maxDay: 30, title: '宿营屋有人低烧', body: '不像感染，但连续守夜让很多人状态都变差了。', choices: [
    { id: 'medicine', label: '给一份药', detail: '消耗药品，稳定希望。', effect: { medicine: -1, hope: 2, title: '低烧在傍晚前退了', body: '程医生说最重要的是今晚让他睡。', tone: 'hope' } },
    { id: 'rest', label: '先隔离休息', detail: '不消耗药品，但街上会有一点担心。', effect: { hope: -1, title: '宿营屋腾出了一张单独的床', body: '没人说“感染”两个字，但每个人都想到了。' } },
  ] },
  { key: 'stranger-trade', minDay: 8, maxDay: 26, title: '两个陌生人想用电池换食物', body: '他们不想进街，只把东西放在围栏外。看起来是真的饿了。', choices: [
    { id: 'trade', label: '交换', detail: '口粮换电力。', effect: { supplies: -1, power: 8, hope: 1, title: '交易隔着围栏完成', body: '没人握手。双方都拿到了今晚更需要的东西。', tone: 'resource' } },
    { id: 'food', label: '直接给一份吃的', detail: '不拿他们的电池，获得更多希望。', effect: { supplies: -1, hope: 3, title: '食物被推到了围栏外', body: '他们走前回头看了主灯很久。', tone: 'hope' } },
  ] },
  { key: 'roof-leak', minDay: 5, maxDay: 30, title: '宿营屋又漏雨了', body: '漏点就在几张床中间。不是大问题，但每天睡不好会慢慢把人拖垮。', choices: [
    { id: 'patch', label: '拿零件和铁皮补好', detail: '小成本换长期安心。', effect: { parts: -1, hope: 2, title: '屋顶终于不滴水了', body: '今晚那几张床不用再挪位置。', tone: 'hope' } },
    { id: 'bucket', label: '继续用桶接', detail: '不花资源。', effect: { hope: -1, title: '床边又多了两个接水桶', body: '大家已经很熟练地避开滴水的位置。' } },
  ] },
  { key: 'radio-battery', minDay: 12, maxDay: 30, title: '广播亭要不要全天监听', body: '全天监听更容易收到完整信息，但会持续消耗电力。', choices: [
    { id: 'listen', label: '全天监听', detail: '用电力换希望和情报感。', effect: { power: -5, hope: 2, title: '广播一整天没有关', body: '大部分时间只有静电，但没人愿意错过真正的人声。', tone: 'hope' } },
    { id: 'window', label: '只在整点监听', detail: '节省电力。', effect: { power: 3, title: '广播改成整点开机', body: '小满把每次监听时间写在墙上。', tone: 'resource' } },
  ] },
  { key: 'search-rest', minDay: 10, maxDay: 30, title: '搜索队今天明显走不动了', body: '连续外出让鞋底和人一样疲惫。再逼一次也许能多带东西回来，但代价不会消失。', choices: [
    { id: 'rest', label: '今天少跑一趟', detail: '少一点资源，换希望。', effect: { hope: 2, supplies: -1, title: '搜索队提前回街', body: '太阳还没落，林夏第一次有时间坐着吃饭。', tone: 'hope' } },
    { id: 'push', label: '再跑一趟近路线', detail: '获得一点补给。', effect: { supplies: 2, hope: -1, title: '搜索队赶在黄昏前回来', body: '东西不多，但每个人都累得不想说话。', tone: 'resource' } },
  ] },
  { key: 'clinic-sheets', minDay: 10, maxDay: 30, title: '诊疗站缺干净布料', body: '绷带还能用，但床单已经到了必须换的时候。', choices: [
    { id: 'tear', label: '拆宿营屋备用床单', detail: '医疗更稳，希望略降。', effect: { medicine: 1, hope: -1, title: '备用床单被裁成了布条', body: '不体面，但比脏绷带可靠。', tone: 'resource' } },
    { id: 'wash', label: '烧水清洗旧布', detail: '用一点电力解决。', effect: { power: -3, medicine: 1, title: '院子里晾起一排白布', body: '风把它们吹得像末日前普通的一天。', tone: 'hope' } },
  ] },
  { key: 'watch-noise', minDay: 12, maxDay: 30, title: '守夜岗说南边声音越来越多', body: '不是今晚立刻会撞上来的那种，但尸群迁移方向可能正在改变。', choices: [
    { id: 'shift', label: '调整一部分防线', detail: '立即增加防线。', effect: { defense: 5, title: '南侧多了一组临时障碍', body: '没有证据证明一定有用，但至少没人什么都不做。', tone: 'resource' } },
    { id: 'save', label: '不动现有布置', detail: '节省资源，提升一点电力储备。', effect: { power: 3, title: '防线保持原样', body: '阿梁把南边写进了今晚的重点观察。' } },
  ] },
  { key: 'hope-board', minDay: 14, maxDay: 30, title: '有人开始在墙上写“还剩几天”', body: '数字每天变小。有人觉得这是倒计时，也有人觉得这是证明已经撑了这么久。', choices: [
    { id: 'keep', label: '让它继续写', detail: '把时间变成共同目标。', effect: { hope: 2, title: '倒计时留在墙上', body: '今天的数字下面，多了一句：活到明天再改。', tone: 'hope' } },
    { id: 'erase', label: '擦掉', detail: '不让所有人天天盯着终点。', effect: { hope: 1, title: '墙上的数字被擦掉', body: '墙又变成一面普通的墙。', tone: 'neutral' } },
  ] },
  { key: 'spare-light', minDay: 16, maxDay: 30, title: '找到一串还能亮的旧装饰灯', body: '它对防线几乎没用，只会消耗一点电。', choices: [
    { id: 'hang', label: '挂在配给站', detail: '用一点电力换明显希望。', effect: { power: -3, hope: 4, title: '配给站多了一串小灯', body: '光很廉价，但有人站在下面看了很久。', tone: 'hope' } },
    { id: 'strip', label: '拆成线材', detail: '换一点零件。', effect: { parts: 2, title: '装饰灯被拆成铜线', body: '末日里好看的东西也会变回材料。', tone: 'resource' } },
  ] },
  { key: 'medicine-count', minDay: 18, maxDay: 30, title: '药品清点结果比账面少一份', body: '没人承认拿过，也可能只是之前记错。程医生不想把这件事变成审问。', choices: [
    { id: 'drop', label: '到此为止', detail: '损失已经发生，不伤害信任。', effect: { medicine: -1, hope: 1, title: '药品账重新从今天开始记', body: '没人被单独叫去问话。', tone: 'neutral' } },
    { id: 'lock', label: '以后药柜上锁', detail: '希望略降，医疗管理更稳。', effect: { hope: -1, medicine: 1, title: '药柜多了一把锁', body: '程医生把钥匙挂在自己脖子上。', tone: 'resource' } },
  ] },
  { key: 'barricade-space', minDay: 20, maxDay: 30, title: '围栏后已经堆得几乎没有路走', body: '更多障碍意味着更安全，也意味着撤退时可能自己把自己堵住。', choices: [
    { id: 'more', label: '继续堆', detail: '高防线，牺牲一点希望。', effect: { defense: 7, hope: -1, title: '围栏后又多了一层废家具', body: '走路更难了，但撞击要多穿一层东西。', tone: 'resource' } },
    { id: 'lane', label: '清出撤退通道', detail: '防线少一点，街区更从容。', effect: { defense: 2, hope: 2, title: '一条黄色撤退线被画出来', body: '所有人都知道真出事时往哪里走。', tone: 'hope' } },
  ] },
  { key: 'final-rations', minDay: 24, maxDay: 30, title: '最后一周的口粮怎么分', body: '如果按现在的量吃，大家有力气守夜；如果开始减量，DAY 30 会留下更多库存。', choices: [
    { id: 'normal', label: '照常吃', detail: '消耗一份口粮，提升希望。', effect: { supplies: -1, hope: 3, title: '最后一周也照常开饭', body: '阿禾说：“饿着的人守不住门。”', tone: 'hope' } },
    { id: 'save', label: '开始减量', detail: '保留库存，但希望下降。', effect: { supplies: 1, hope: -2, title: '配给量开始减少', body: '没有人争，只是每个碗都显得更空。', tone: 'danger' } },
  ] },
  { key: 'last-repair', minDay: 26, maxDay: 30, title: '还有一批零件只能用在一个地方', body: '主灯、围栏、诊疗站都说自己最需要。', choices: [
    { id: 'fence', label: '给围栏', detail: '直接提高防线。', effect: { parts: -1, defense: 8, title: '最后一批钢件去了北门', body: '老周没有问第二遍。', tone: 'resource' } },
    { id: 'power', label: '给主灯线路', detail: '提高电力。', effect: { parts: -1, power: 10, title: '最后一批接头进了配电箱', body: '主灯今晚亮得比昨天稳定。', tone: 'resource' } },
  ] },
];

function hash(input: string): number { let value = 2166136261; for (let i = 0; i < input.length; i += 1) { value ^= input.charCodeAt(i); value = Math.imul(value, 16777619); } return value >>> 0; }
function flag(day: number): string { return `daily-situation:${day}:resolved`; }
function addLog(state: GameState, effect: Effect): GameState {
  const logs = state.logs ?? [];
  return { ...state, logs: [...logs.slice(-59), { id: `daily-${state.day}-${logs.length}`, day: state.day, time: '11:40', title: effect.title, body: effect.body, tone: effect.tone ?? 'neutral' }] };
}

export function dailySituationForState(state: GameState): DailySituationView | null {
  if (state.phase !== 'street' || state.chapterComplete || (state.storyFlags ?? []).includes(flag(state.day))) return null;
  const candidates = TEMPLATES.filter((item) => state.day >= item.minDay && state.day <= item.maxDay);
  if (!candidates.length) return null;
  const template = candidates[hash(`${state.seed}:${state.day}:daily-situation`) % candidates.length];
  return { id: `${template.key}:day:${state.day}`, kicker: `DAY ${state.day} · 街区状况`, title: template.title, body: template.body, choices: template.choices.map(({ effect: _effect, ...choice }) => choice) };
}

export function resolveDailySituation(state: GameState, situationId: string, choiceId: string): GameState {
  const current = dailySituationForState(state);
  if (!current || current.id !== situationId) return state;
  const key = current.id.split(':day:')[0];
  const template = TEMPLATES.find((item) => item.key === key);
  const choice = template?.choices.find((item) => item.id === choiceId);
  if (!choice) return state;
  const effect = choice.effect;
  const flags = new Set(state.storyFlags ?? []); flags.add(flag(state.day));
  let next: GameState = {
    ...state,
    hope: Math.max(0, state.hope + (effect.hope ?? 0)), supplies: Math.max(0, state.supplies + (effect.supplies ?? 0)), parts: Math.max(0, state.parts + (effect.parts ?? 0)), medicine: Math.max(0, state.medicine + (effect.medicine ?? 0)), power: clamp((state.power ?? 62) + (effect.power ?? 0)), defense: clamp((state.defense ?? 50) + (effect.defense ?? 0)), storyFlags: [...flags], lastMessage: `${current.title} · 已处理`,
  };
  next = addLog(next, effect);
  return next;
}

export function dailySituationResolved(state: GameState): boolean { return (state.storyFlags ?? []).includes(flag(state.day)); }
export function dailySituationContentCount(): number { return TEMPLATES.length; }
