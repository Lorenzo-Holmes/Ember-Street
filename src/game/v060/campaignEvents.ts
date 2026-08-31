import { normalizeSurvivor } from '../foundation';
import { SURVIVOR_ROSTER } from '../progression';
import type { BuildingId, GameState, Survivor } from '../types';

export type CampaignEventKind = 'character' | 'building' | 'location';

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
}

const BUILDING_EVENTS: CampaignFixedEvent[] = [
  { id: 'building-search-station', kind: 'building', buildingId: 'searchStation', title: '把地图铺开', body: '搜索站终于能用了。林夏把几张捡来的街区图钉在墙上，所有外出的人都被要求先在这里留下路线。', actionLabel: '启用搜索站' },
  { id: 'building-shelter', kind: 'building', buildingId: 'shelter', title: '今晚有屋檐', body: '宿营屋清出第一块能真正睡人的地方。阿禾把炉子挪到通风口边，街区第一次有了“回家”的样子。', actionLabel: '开放宿营屋' },
  { id: 'building-workshop', kind: 'building', buildingId: 'workshop', title: '坏掉的东西还能修', body: '老周把最后一张工作台扶正。扳手、钳子和拆下来的零件终于有了固定位置，防线不必再靠临时补丁撑着。', actionLabel: '启用修理工坊' },
  { id: 'building-clinic', kind: 'building', buildingId: 'clinic', title: '留一张干净的床', body: '诊疗角被隔出一块干净区域。灯不亮，但药品和绷带终于不用再堆在纸箱里。', actionLabel: '启用诊疗站' },
  { id: 'building-watch-post', kind: 'building', buildingId: 'watchPost', title: '先看见它们', body: '瞭望架超过了围墙高度。从这里能看到两条街外的动静，也意味着尸群靠近前，街区终于有机会先做准备。', actionLabel: '启用守夜岗' },
  { id: 'building-radio', kind: 'building', buildingId: 'radio', title: '噪声里有人吗', body: '广播设备第一次发出稳定底噪。频道里暂时只有杂音，但所有人都知道：从现在开始，这条街可以听见更远的地方。', actionLabel: '启用广播亭' },
];

const CHARACTER_EVENTS: CampaignFixedEvent[] = [
  { id: 'character-cheng', kind: 'character', survivorId: 'cheng', minDay: 6, title: '白大褂已经看不出颜色', body: '一个背着旧急救包的人在街口停下。她先问这里有多少伤员，然后才说自己的名字。程医生决定留下。', actionLabel: '让程医生加入' },
  { id: 'character-aliang', kind: 'character', survivorId: 'aliang', minDay: 12, title: '他先听见了脚步', body: '阿梁没有直接走进灯下。他站在街角听了很久，准确说出了北侧有几只游荡者。这样的耳朵，值得留在守夜岗。', actionLabel: '让阿梁加入' },
  { id: 'character-xiaoman', kind: 'character', survivorId: 'xiaoman', minDay: 18, title: '别让声音断掉', body: '小满带来一只缺旋钮的收音机和一叠抄满频率的纸。她说外面还有人在播，只是大多数人已经不再回应。', actionLabel: '让小满加入' },
];

const LOCATION_EVENTS: CampaignFixedEvent[] = [
  { id: 'location-west-pharmacy', kind: 'location', locationId: 'west-pharmacy', minDay: 2, title: '西街的绿色招牌', body: '有人看见药店后门还锁着。橱窗已经空了，但真正的库存通常不会摆在外面。', actionLabel: '记录西街药店' },
  { id: 'location-apartment-402', kind: 'location', locationId: 'apartment-402', minDay: 4, title: '四楼还有一扇窗', body: '夜里有人看见居民楼四层的窗帘动过。那里可能有人，也可能只是风。至少这栋楼还值得再去一次。', actionLabel: '记录废弃居民楼' },
  { id: 'location-auto-repair', kind: 'location', locationId: 'auto-repair', minDay: 6, title: '机油痕一直延伸到巷子里', body: '一条新鲜的机油痕从侧街拖向汽车修理店。卷门没有完全落下，里面可能还有工具和能用的零件。', actionLabel: '记录汽车修理店' },
  { id: 'location-school', kind: 'location', locationId: 'school', minDay: 8, title: '操场广播响了一秒', body: '旧学校方向传来短促的扩音器啸叫。没人知道是谁碰到了开关，但那里显然还有能工作的线路。', actionLabel: '记录旧学校' },
  { id: 'location-subway', kind: 'location', locationId: 'subway', minDay: 11, title: '地铁口有风', body: '封死的地铁入口旁出现了一道能钻进去的缝。地下很危险，但隧道也可能通向尸群较少的区域。', actionLabel: '记录地铁入口' },
  { id: 'location-gas-station', kind: 'location', locationId: 'gas-station', minDay: 14, title: '公路边的红色顶棚', body: '远处的加油站顶棚还没有塌。储油罐未必有用，但维修间和便利区可能还留着东西。', actionLabel: '记录加油站' },
  { id: 'location-hospital', kind: 'location', locationId: 'hospital', minDay: 17, title: '救护车灯还在闪', body: '医院停车区有一辆救护车的警示灯偶尔亮起。药品很多，尸群也一定很多。', actionLabel: '记录医院' },
  { id: 'location-bus-station', kind: 'location', locationId: 'bus-station', minDay: 21, title: '南边车站的路线牌', body: '广播里有人提到公交总站的南出口仍能通行。那可能不只是搜索地点，也可能是一条离开这里的路。', actionLabel: '记录公交总站' },
  { id: 'location-warehouse', kind: 'location', locationId: 'warehouse', minDay: 24, title: '北仓库坐标', body: '一张旧送货单标出了北仓库的位置。那里靠近尸群迁移方向，但如果还想做最后几次大规模建设，这可能是唯一选择。', actionLabel: '记录北仓库' },
];

export const CAMPAIGN_FIXED_EVENTS: CampaignFixedEvent[] = [...BUILDING_EVENTS, ...CHARACTER_EVENTS, ...LOCATION_EVENTS];

const seenFlag = (eventId: string) => `fixed_event_seen:${eventId}`;
export const locationUnlockFlag = (locationId: string) => `location_unlocked:${locationId}`;

export function isLocationUnlocked(state: GameState, locationId: string): boolean {
  return locationId === 'convenience-store' || state.storyFlags.includes(locationUnlockFlag(locationId));
}

function characterFor(id: string): Survivor | null {
  const source = SURVIVOR_ROSTER.find((item) => item.id === id);
  return source ? normalizeSurvivor({ ...source }) : null;
}

function eventEligible(state: GameState, event: CampaignFixedEvent): boolean {
  if (state.storyFlags.includes(seenFlag(event.id))) return false;
  if ((event.minDay ?? 1) > state.day) return false;
  if (event.kind === 'building') return Boolean(event.buildingId && state.buildings[event.buildingId] >= 1);
  if (event.kind === 'character') return Boolean(event.survivorId);
  if (event.kind === 'location') return Boolean(event.locationId && !isLocationUnlocked(state, event.locationId));
  return false;
}

export function pendingCampaignEvent(state: GameState): CampaignFixedEvent | null {
  if (!['street', 'assignment'].includes(state.phase)) return null;
  const priority: CampaignEventKind[] = ['character', 'building', 'location'];
  for (const kind of priority) {
    const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.kind === kind && eventEligible(state, candidate));
    if (event) return event;
  }
  return null;
}

export function resolveCampaignEvent(state: GameState, eventId: string): GameState {
  const event = CAMPAIGN_FIXED_EVENTS.find((candidate) => candidate.id === eventId);
  if (!event || !eventEligible(state, event)) return state;
  const storyFlags = [...new Set([...state.storyFlags, seenFlag(event.id)])];
  let next: GameState = { ...state, storyFlags };

  if (event.kind === 'character' && event.survivorId && !next.survivors.some((survivor) => survivor.id === event.survivorId)) {
    const survivor = characterFor(event.survivorId);
    if (survivor) next = { ...next, survivors: [...next.survivors, survivor], hope: Math.min(100, next.hope + 3) };
  }

  if (event.kind === 'location' && event.locationId) {
    next = {
      ...next,
      storyFlags: [...new Set([...next.storyFlags, locationUnlockFlag(event.locationId)])],
      campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + 1 },
    };
  }

  return { ...next, lastMessage: event.title };
}
