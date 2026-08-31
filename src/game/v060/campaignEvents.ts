import { SURVIVOR_ROSTER } from '../progression';
import type { BuildingId, GameState } from '../types';
import { markMissing, recordDeath } from './memorial';
import {
  clearLowHopeDeparture,
  clearUntreatedRisk,
  deferMedicalCrisis,
  lowHopeDepartureFlag,
  medicalCrisisFlag,
  pendingLowHopeDepartureId,
} from './mortality';

export type CampaignEventKind = 'crisis' | 'character' | 'building' | 'location';

export interface CampaignEventChoice {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface CampaignFixedEvent {
  id: string;
  kind: CampaignEventKind;
  title: string;
  body: string;
  actionLabel: string;
  minDay?: number;
  survivorId?: string;
  buildingId?: BuildingId;
  locationId?: string;
  choices?: CampaignEventChoice[];
}

const BUILDING_EVENTS: CampaignFixedEvent[] = [
  { id: 'building-search-station', kind: 'building', buildingId: 'searchStation', title: '把地图铺开', body: '搜索站终于能用了。几张捡来的街区图被钉在墙上，所有外出的人都被要求先在这里留下路线。', actionLabel: '启用搜索站' },
  { id: 'building-shelter', kind: 'building', buildingId: 'shelter', title: '今晚有屋檐', body: '宿营屋清出第一块能真正睡人的地方。炉子被挪到通风口边，街区第一次有了“回家”的样子。', actionLabel: '开放宿营屋' },
  { id: 'building-workshop', kind: 'building', buildingId: 'workshop', title: '坏掉的东西还能修', body: '最后一张工作台被扶正。扳手、钳子和拆下来的零件终于有了固定位置，防线不必再靠临时补丁撑着。', actionLabel: '启用修理工坊' },
  { id: 'building-clinic', kind: 'building', buildingId: 'clinic', title: '留一张干净的床', body: '诊疗角被隔出一块干净区域。灯不亮，但药品和绷带终于不用再堆在纸箱里。', actionLabel: '启用诊疗站' },
  { id: 'building-watch-post', kind: 'building', buildingId: 'watchPost', title: '先看见它们', body: '瞭望架超过了围墙高度。从这里能看到两条街外的动静，也意味着尸群靠近前，街区终于有机会先做准备。', actionLabel: '启用守夜岗' },
  { id: 'building-radio', kind: 'building', buildingId: 'radio', title: '噪声里有人吗', body: '广播设备第一次发出稳定底噪。频道里暂时只有杂音，但所有人都知道：从现在开始，这条街可以听见更远的地方。', actionLabel: '启用广播亭' },
];

const CHARACTER_EVENTS: CampaignFixedEvent[] = [
  { id: 'character-cheng', kind: 'character', survivorId: 'cheng', minDay: 6, title: '白大褂已经看不出颜色', body: '程医生把旧急救包放到桌上，先问这里有多少伤员。直到确认药品和床位，她才真正把自己的名字写进值班表。', actionLabel: '记住程医生' },
  { id: 'character-aliang', kind: 'character', survivorId: 'aliang', minDay: 12, title: '他先听见了脚步', body: '阿梁没有直接坐进灯下。他站在街角听了很久，准确说出了北侧有几只游荡者。这样的耳朵，从今天开始属于这条街。', actionLabel: '记住阿梁' },
  { id: 'character-xiaoman', kind: 'character', survivorId: 'xiaoman', minDay: 18, title: '别让声音断掉', body: '小满把缺旋钮的收音机摆到广播桌上，又摊开一叠抄满频率的纸。她说外面还有人在播，只是大多数人已经不再回应。', actionLabel: '记住小满' },
];

const LOCATION_EVENTS: CampaignFixedEvent[] = [
  { id: 'location-west-pharmacy', kind: 'location', locationId: 'west-pharmacy', minDay: 2, title: '西街的绿色招牌', body: '有人看见药店后门还锁着。橱窗已经空了，但真正的库存通常不会摆在外面。', actionLabel: '解锁西街药店' },
  { id: 'location-apartment-402', kind: 'location', locationId: 'apartment-402', minDay: 4, title: '四楼还有一扇窗', body: '夜里有人看见居民楼四层的窗帘动过。那里可能有人，也可能只是风。至少这栋楼还值得再去一次。', actionLabel: '解锁废弃居民楼' },
  { id: 'location-auto-repair', kind: 'location', locationId: 'auto-repair', minDay: 6, title: '机油痕一直延伸到巷子里', body: '一条新鲜的机油痕从侧街拖向汽车修理店。卷门没有完全落下，里面可能还有工具和能用的零件。', actionLabel: '解锁汽车修理店' },
  { id: 'location-school', kind: 'location', locationId: 'school', minDay: 8, title: '操场广播响了一秒', body: '旧学校方向传来短促的扩音器啸叫。没人知道是谁碰到了开关，但那里显然还有能工作的线路。', actionLabel: '解锁旧学校' },
  { id: 'location-subway', kind: 'location', locationId: 'subway', minDay: 11, title: '地铁口有风', body: '封死的地铁入口旁出现了一道能钻进去的缝。地下很危险，但隧道也可能通向尸群较少的区域。', actionLabel: '解锁地铁入口' },
  { id: 'location-gas-station', kind: 'location', locationId: 'gas-station', minDay: 14, title: '公路边的红色顶棚', body: '远处的加油站顶棚还没有塌。储油罐未必有用，但维修间和便利区可能还留着东西。', actionLabel: '解锁加油站' },
  { id: 'location-hospital', kind: 'location', locationId: 'hospital', minDay: 17, title: '救护车灯还在闪', body: '医院停车区有一辆救护车的警示灯偶尔亮起。药品很多，尸群也一定很多。', actionLabel: '解锁医院' },
  { id: 'location-bus-station', kind: 'location', locationId: 'bus-station', minDay: 21, title: '南边车站的路线牌', body: '广播里有人提到公交总站的南出口仍能通行。那可能不只是搜索地点，也可能是一条离开这里的路。', actionLabel: '解锁公交总站' },
  { id: 'location-warehouse', kind: 'location', locationId: 'warehouse', minDay: 24, title: '北仓库坐标', body: '一张旧送货单标出了北仓库的位置。那里靠近尸群迁移方向，但如果还想做最后几次大规模建设，这可能是唯一选择。', actionLabel: '解锁北仓库' },
];

export const CAMPAIGN_FIXED_EVENTS: CampaignFixedEvent[] = [...BUILDING_EVENTS, ...CHARACTER_EVENTS, ...LOCATION_EVENTS];

const seenFlag = (eventId: string) => `fixed_event_seen:${eventId}`;
const buildingPendingFlag = (buildingId: BuildingId) => `building_event_pending:${buildingId}`;
export const locationUnlockFlag = (locationId: string) => `location_unlocked:${locationId}`;

export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  return locationId === 'convenience-store' || state.storyFlags.includes(locationUnlockFlag(locationId));
}

export function collectedSurvivorIsPresent(state: GameState, survivorId: string): boolean {
  return state.survivors.some((survivor) => survivor.id === survivorId && survivor.condition !== 'dead' && survivor.condition !== 'missing');
}

function medicalCrisisEvent(state: GameState): CampaignFixedEvent | null {
  const pending = state.storyFlags.find((flag) => flag.startsWith('medical_crisis_pending:'));
  if (!pending) return null;
  const survivorId = pending.slice('medical_crisis_pending:'.length);
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition === 'dead' || survivor.condition === 'missing' || (survivor.condition !== 'serious' && survivor.condition !== 'critical')) return null;
  const days = Math.max(1, survivor.untreatedDays ?? 1);
  return {
    id: `medical-crisis:${survivorId}`,
    kind: 'crisis',
    survivorId,
    title: `${survivor.name}的伤口开始发黑`,
    body: `${survivor.name}已经有 ${days} 天没有得到足够治疗。高烧、意识混乱和伤口恶化正在同时出现；继续拖下去，最坏的结果不再只是重伤。`,
    actionLabel: '处理医疗危机',
    choices: [
      { id: 'treat', label: '立刻用药', detail: '消耗 1 份药品，立即控制恶化并重置未治疗计时。', disabled: state.inventory.medicine < 1, disabledReason: '药品不足' },
      { id: 'isolate', label: '先隔离一晚', detail: '不消耗药品，争取一天时间；希望 -1，危机之后仍可能再次出现。' },
      { id: 'delay', label: '继续拖延', detail: survivor.condition === 'critical' ? '危重状态继续拖延会直接触发尸变死亡。' : '重伤会恶化为危重，下一个治疗窗口会更短。' },
    ],
  };
}

function lowHopeEvent(state: GameState): CampaignFixedEvent | null {
  const survivorId = pendingLowHopeDepartureId(state);
  if (!survivorId) return null;
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition === 'dead' || survivor.condition === 'missing') return null;
  return {
    id: `low-hope-departure:${survivorId}`,
    kind: 'crisis',
    survivorId,
    title: `${survivor.name}把自己的东西收进了包里`,
    body: `希望已经低到让人开始怀疑“留在这里”是否还有意义。${survivor.name}没有争吵，只说想趁天亮以前离开。`,
    actionLabel: '处理离开危机',
    choices: [
      { id: 'ration', label: '拿出一份口粮挽留', detail: '口粮 -1，希望 +2；至少让对方知道街区还愿意承担这份成本。', disabled: state.inventory.ration < 1, disabledReason: '口粮不足' },
      { id: 'talk', label: '让熟悉的人去谈', detail: `信任 ${survivor.trust ?? 0}/3。信任达到 2 时会留下，否则仍会离开并进入失踪状态。` },
      { id: 'leave', label: '不再阻拦', detail: '对方离开街区并进入失踪状态，之后仍可以组织搜救。' },
    ],
  };
}

function eventEligible(state: GameState, event: CampaignFixedEvent): boolean {
  if (state.storyFlags.includes(seenFlag(event.id))) return false;
  if ((event.minDay ?? 1) > state.day) return false;
  if (event.kind === 'building') {
    const buildingId = event.buildingId;
    return buildingId ? state.storyFlags.includes(buildingPendingFlag(buildingId)) : false;
  }
  if (event.kind === 'character') return Boolean(event.survivorId && collectedSurvivorIsPresent(state, event.survivorId));
  if (event.kind === 'location') return Boolean(event.locationId && !isLocationUnlocked(state, event.locationId));
  return false;
}

export function pendingCampaignEvent(state: GameState): CampaignFixedEvent | null {
  if (!['street', 'assignment'].includes(state.phase) || state.expeditionState.departed) return null;
  const crisis = medicalCrisisEvent(state) ?? lowHopeEvent(state);
  if (crisis) return crisis;
  const priority: CampaignEventKind[] = ['character', 'building', 'location'];
  for (const kind of priority) {
    const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.kind === kind && eventEligible(state, candidate));
    if (event) return event;
  }
  return null;
}

function resolveMedicalCrisis(state: GameState, survivorId: string, choiceId: string | undefined): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || !state.storyFlags.includes(medicalCrisisFlag(survivorId))) return state;
  if (choiceId === 'treat') {
    if (state.inventory.medicine < 1) return { ...state, lastMessage: '药品不足，无法进行紧急治疗。' };
    const nextCondition = survivor.condition === 'critical' ? 'serious' : survivor.condition === 'serious' ? 'minor' : survivor.condition;
    const treated = {
      ...state,
      inventory: { ...state.inventory, medicine: state.inventory.medicine - 1 },
      survivors: state.survivors.map((item) => item.id === survivorId ? { ...item, condition: nextCondition, untreatedDays: 0 } : item),
      hope: Math.min(100, state.hope + 1),
    };
    return { ...clearUntreatedRisk(treated, [survivorId]), lastMessage: `${survivor.name}接受了紧急治疗，恶化暂时被压住。` };
  }
  if (choiceId === 'isolate') return { ...deferMedicalCrisis(state, survivorId), lastMessage: `${survivor.name}被暂时隔离。所有人都知道这只是争取时间。` };
  if (choiceId === 'delay') {
    const cleared = { ...state, storyFlags: state.storyFlags.filter((flag) => flag !== medicalCrisisFlag(survivorId)) };
    if (survivor.condition === 'critical') return recordDeath(cleared, survivorId, '尸变 · 长时间未接受医疗');
    return {
      ...cleared,
      survivors: cleared.survivors.map((item) => item.id === survivorId ? { ...item, condition: 'critical' as const, untreatedDays: 0 } : item),
      hope: Math.max(0, cleared.hope - 2),
      lastMessage: `${survivor.name}的伤势恶化为危重。下一次再拖延，可能不会再有治疗机会。`,
    };
  }
  return state;
}

function resolveLowHopeDeparture(state: GameState, survivorId: string, choiceId: string | undefined): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || !state.storyFlags.includes(lowHopeDepartureFlag(survivorId))) return state;
  if (choiceId === 'ration') {
    if (state.inventory.ration < 1) return { ...state, lastMessage: '口粮不足，无法用物资稳定人心。' };
    const cleared = clearLowHopeDeparture(state, survivorId);
    return {
      ...cleared,
      inventory: { ...cleared.inventory, ration: cleared.inventory.ration - 1 },
      hope: Math.min(100, cleared.hope + 2),
      lastMessage: `${survivor.name}把包重新放下了。至少今天，他/她还愿意留下。`,
    };
  }
  if (choiceId === 'talk') {
    const cleared = clearLowHopeDeparture(state, survivorId);
    if ((survivor.trust ?? 0) >= 2) return { ...cleared, hope: Math.min(100, cleared.hope + 1), lastMessage: `${survivor.name}沉默了很久，最后还是回到了灯下。` };
    return { ...markMissing(cleared, survivorId, '希望过低 · 主动离开街区'), lastMessage: `${survivor.name}没有被劝回来。天亮以后，床位空了。` };
  }
  if (choiceId === 'leave') {
    const cleared = clearLowHopeDeparture(state, survivorId);
    return { ...markMissing(cleared, survivorId, '希望过低 · 主动离开街区'), lastMessage: `${survivor.name}离开了街区。之后还能不能找到，没人知道。` };
  }
  return state;
}

export function resolveCampaignEvent(state: GameState, eventId: string, choiceId?: string): GameState {
  if (eventId.startsWith('medical-crisis:')) return resolveMedicalCrisis(state, eventId.slice('medical-crisis:'.length), choiceId);
  if (eventId.startsWith('low-hope-departure:')) return resolveLowHopeDeparture(state, eventId.slice('low-hope-departure:'.length), choiceId);

  const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event || !eventEligible(state, event)) return state;
  let storyFlags = [...new Set([...state.storyFlags, seenFlag(event.id)])];
  const resolvedBuildingId = event.buildingId;
  if (resolvedBuildingId) storyFlags = storyFlags.filter((flag) => flag !== buildingPendingFlag(resolvedBuildingId));
  let next: GameState = { ...state, storyFlags };

  if (event.kind === 'location' && event.locationId) {
    next = {
      ...next,
      storyFlags: [...new Set([...next.storyFlags, locationUnlockFlag(event.locationId)])],
      campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + 1 },
    };
  }

  const survivorName = event.survivorId ? SURVIVOR_ROSTER.find((item) => item.id === event.survivorId)?.name : null;
  return { ...next, lastMessage: survivorName ? `${survivorName}的人物事件已记录` : event.title };
}
