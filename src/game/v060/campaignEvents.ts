import { SURVIVOR_ROSTER } from '../progression';
import type { BuildingId, GameState } from '../types';
import { setMentalState } from './characterPsychology';
import { communityEventPendingFlag } from './community';
import { adjustPressure } from './socialPressure';

export type CampaignEventKind = 'character' | 'building' | 'community' | 'location';

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
  communityCount?: number;
  initiative?: true;
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

  { id: 'initiative-linxia-route', kind: 'character', initiative: true, survivorId: 'lin-xia', minDay: 3, title: '林夏把退路画在门后', body: '没人让她这么做。林夏把便利店周围的巷口重新画了一遍，又在最窄的出口旁写了一个箭头：“真出事就从这儿撤。”她回来时裤脚全是灰。', actionLabel: '把这条退路记进地图' },
  { id: 'initiative-zhou-fence', kind: 'character', initiative: true, survivorId: 'zhou', minDay: 4, title: '老周没等你开口', body: '老周盯着北侧围栏看了半天，最后只说了一句“这段今晚会响”。等你再过去时，他已经拆了两块旧门板开始补缝。', actionLabel: '让他把这段补完' },
  { id: 'initiative-ahe-pot', kind: 'character', initiative: true, survivorId: 'ahe', minDay: 5, title: '锅里多了一勺', body: '阿禾把自己留的那点口粮倒进锅里，又往汤里加了更多水。她说吃不饱和吃不到热的，是两回事。今晚至少先解决后一个。', actionLabel: '让这锅汤端出去' },
  { id: 'initiative-cheng-triage', kind: 'character', initiative: true, survivorId: 'cheng', minDay: 8, title: '程医生重新排了伤员名单', body: '程医生没有等排班。她先把伤口最危险的人挪到离药箱最近的位置，又把明早必须复查的名字写在门上。她说这不是治疗，只是别让人死在“没人想起来”上。', actionLabel: '按她的顺序处理' },
  { id: 'initiative-aliang-watch', kind: 'character', initiative: true, survivorId: 'aliang', minDay: 13, title: '阿梁换了巡夜顺序', body: '阿梁把原来的巡夜路线划掉了一半。他说有两处死角根本听不见围栏外的脚步，今晚应该先把人放到真正有用的位置。', actionLabel: '采用新的巡夜顺序' },
];

const COMMUNITY_EVENTS: CampaignFixedEvent[] = [
  { id: 'community-2', kind: 'community', communityCount: 2, title: '有人开始烧水', body: '最开始没有人说是谁负责。第二天早上，炉子上的水壶已经是热的。有人洗锅，有人整理睡垫，街区第一次出现了不需要核心人物提醒的杂活。', actionLabel: '让他们继续帮忙' },
  { id: 'community-5', kind: 'community', communityCount: 5, title: '值班表', body: '有人把一张纸钉在宿营屋门口。上面第一次不只有那几个核心幸存者的名字。后勤、维修和守备终于可以由居民轮值分担。', actionLabel: '启用居民轮值' },
  { id: 'community-8', kind: 'community', communityCount: 8, title: '第二张桌子', body: '第一张桌子已经坐不下所有人。于是有人从废墟里拖回木板，拼出了第二张。吃饭、包扎和修东西第一次可以同时进行。', actionLabel: '扩展公共区域' },
  { id: 'community-10', kind: 'community', communityCount: 10, title: '这已经不是避难点了', body: '夜里有人说，这里已经不像临时躲雨的地方。有人记得谁负责烧水，谁知道哪面墙漏风，谁会在天黑前主动检查门栓。它开始像一个社区。', actionLabel: '承认这条街已经长大' },
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

export const CAMPAIGN_FIXED_EVENTS: CampaignFixedEvent[] = [...BUILDING_EVENTS, ...CHARACTER_EVENTS, ...COMMUNITY_EVENTS, ...LOCATION_EVENTS];

const seenFlag = (eventId: string) => `fixed_event_seen:${eventId}`;
const buildingPendingFlag = (buildingId: BuildingId) => `building_event_pending:${buildingId}`;
const initiativeDayFlag = (day: number) => `initiative_event_day:${day}`;
export const locationUnlockFlag = (locationId: string) => `location_unlocked:${locationId}`;

export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  return locationId === 'convenience-store' || state.storyFlags.includes(locationUnlockFlag(locationId));
}

export function collectedSurvivorIsPresent(state: GameState, survivorId: string): boolean {
  return state.survivors.some((survivor) => survivor.id === survivorId && survivor.condition !== 'dead' && survivor.condition !== 'missing');
}

function initiativeActorReady(state: GameState, survivorId: string): boolean {
  return state.survivors.some((survivor) => survivor.id === survivorId
    && survivor.condition !== 'dead'
    && survivor.condition !== 'missing'
    && survivor.condition !== 'critical'
    && survivor.energy >= 20);
}

function initiativeEligible(state: GameState, event: CampaignFixedEvent): boolean {
  if (!event.initiative) return true;
  if (!event.survivorId || state.storyFlags.includes(initiativeDayFlag(state.day)) || !initiativeActorReady(state, event.survivorId)) return false;
  if (event.id === 'initiative-linxia-route') return state.buildings.searchStation >= 1 && !state.storyFlags.includes('scouted:convenience-store');
  if (event.id === 'initiative-zhou-fence') return state.defense <= 60;
  if (event.id === 'initiative-ahe-pot') return state.inventory.ration >= 1 && (state.hope <= 35 || state.mealState.consecutiveShortageDays >= 1);
  if (event.id === 'initiative-cheng-triage') return state.buildings.clinic >= 1 && state.survivors.some((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? ''));
  if (event.id === 'initiative-aliang-watch') return state.buildings.watchPost >= 1 && state.defense < 75;
  return false;
}

function eventEligible(state: GameState, event: CampaignFixedEvent): boolean {
  if (state.storyFlags.includes(seenFlag(event.id))) return false;
  if ((event.minDay ?? 1) > state.day) return false;
  if (event.kind === 'building') {
    const buildingId = event.buildingId;
    return buildingId ? state.storyFlags.includes(buildingPendingFlag(buildingId)) : false;
  }
  if (event.kind === 'character') return Boolean(event.survivorId && collectedSurvivorIsPresent(state, event.survivorId) && initiativeEligible(state, event));
  if (event.kind === 'community') {
    const communityCount = event.communityCount;
    return communityCount !== undefined && state.storyFlags.includes(communityEventPendingFlag(communityCount));
  }
  if (event.kind === 'location') return Boolean(event.locationId && !isLocationUnlocked(state, event.locationId));
  return false;
}

export function pendingCampaignEvent(state: GameState): CampaignFixedEvent | null {
  if (!['street', 'assignment'].includes(state.phase) || state.expeditionState.departed) return null;
  const priority: CampaignEventKind[] = ['character', 'building', 'community', 'location'];
  for (const kind of priority) {
    const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.kind === kind && eventEligible(state, candidate));
    if (event) return event;
  }
  return null;
}

function spendInitiativeEnergy(state: GameState, survivorId: string, amount: number): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, energy: Math.max(0, survivor.energy - amount) } : survivor),
  };
}

function applyInitiativeEffect(state: GameState, event: CampaignFixedEvent): GameState {
  if (!event.initiative || !event.survivorId) return state;
  let next: GameState = { ...state, storyFlags: [...new Set([...state.storyFlags, initiativeDayFlag(state.day)])] };
  if (event.id === 'initiative-linxia-route') {
    next = spendInitiativeEnergy(next, event.survivorId, 5);
    next = { ...next, storyFlags: [...new Set([...next.storyFlags, 'scouted:convenience-store'])] };
  } else if (event.id === 'initiative-zhou-fence') {
    next = spendInitiativeEnergy(next, event.survivorId, 6);
    next = { ...next, defense: Math.min(100, next.defense + 6) };
  } else if (event.id === 'initiative-ahe-pot') {
    next = spendInitiativeEnergy(next, event.survivorId, 4);
    next = { ...next, inventory: { ...next.inventory, ration: Math.max(0, next.inventory.ration - 1) }, hope: Math.min(100, next.hope + 2) };
    next = adjustPressure(next, -1, 'ahe-hot-pot');
  } else if (event.id === 'initiative-cheng-triage') {
    next = spendInitiativeEnergy(next, event.survivorId, 4);
    const injured = [...next.survivors]
      .filter((survivor) => ['serious', 'critical'].includes(survivor.condition ?? ''))
      .sort((a, b) => (b.untreatedDays ?? 0) - (a.untreatedDays ?? 0))[0];
    if (injured) {
      next = { ...next, survivors: next.survivors.map((survivor) => survivor.id === injured.id ? { ...survivor, untreatedDays: Math.max(0, (survivor.untreatedDays ?? 0) - 1) } : survivor) };
    }
  } else if (event.id === 'initiative-aliang-watch') {
    next = spendInitiativeEnergy(next, event.survivorId, 5);
    next = { ...next, defense: Math.min(100, next.defense + 3) };
  }
  return setMentalState(next, event.survivorId, 'focused', next.day + 1);
}

export function resolveCampaignEvent(state: GameState, eventId: string): GameState {
  const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event || !eventEligible(state, event)) return state;
  let storyFlags = [...new Set([...state.storyFlags, seenFlag(event.id)])];
  const resolvedBuildingId = event.buildingId;
  if (resolvedBuildingId) storyFlags = storyFlags.filter((flag) => flag !== buildingPendingFlag(resolvedBuildingId));
  const resolvedCommunityCount = event.communityCount;
  if (event.kind === 'community' && resolvedCommunityCount !== undefined) {
    storyFlags = storyFlags.filter((flag) => flag !== communityEventPendingFlag(resolvedCommunityCount));
    if (resolvedCommunityCount === 5) storyFlags = [...new Set([...storyFlags, 'community_rotation_unlocked'])];
  }
  let next: GameState = { ...state, storyFlags };

  if (event.kind === 'location' && event.locationId) {
    next = {
      ...next,
      storyFlags: [...new Set([...next.storyFlags, locationUnlockFlag(event.locationId)])],
      campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + 1 },
    };
  }

  next = applyInitiativeEffect(next, event);
  const survivorName = event.survivorId ? SURVIVOR_ROSTER.find((item) => item.id === event.survivorId)?.name : null;
  return {
    ...next,
    lastMessage: event.initiative && survivorName
      ? `${survivorName}主动完成了这件事 · 接下来一段时间更专注`
      : survivorName ? `${survivorName}的人物事件已记录` : event.title,
  };
}
