import type { BuildingId, CheckOutcome, GameState, Inventory, Role } from '../types';
import { rescueCommunityResidents } from './community';

export type ExpeditionResource = 'ration' | 'medicine' | 'materials' | 'parts';

export interface ExpeditionLocation {
  id: string;
  name: string;
  unlockDay: number;
  danger: 1 | 2 | 3 | 4 | 5;
  primary: ExpeditionResource;
  secondary: ExpeditionResource;
  description: string;
  features: string[];
  signatureEventId: string;
  localEventIds: string[];
}

export interface ExpeditionEvent {
  id: string;
  title: string;
  body: string;
  riskBias: number;
  tags: string[];
  locationIds?: string[];
  firstVisitOnly?: boolean;
  requiredFlags?: string[];
  excludedFlags?: string[];
  requiredBuilding?: { id: BuildingId; level: number };
  minDay?: number;
  weight?: number;
  specialty?: Role;
  successFlags?: string[];
  failureFlags?: string[];
  bonusInventory?: Partial<Inventory>;
  rescueResidents?: number;
}

export const EXPEDITION_LOCATIONS: ExpeditionLocation[] = [
  {
    id: 'convenience-store', name: '便利店', unlockDay: 1, danger: 1, primary: 'ration', secondary: 'materials',
    description: '卷帘门半开着，后仓也许还有东西。',
    features: ['稳定口粮', '低风险', '前期缓冲'], signatureEventId: 'convenience-half-shutter',
    localEventIds: ['convenience-cold-cases', 'convenience-backdoor-key'],
  },
  {
    id: 'west-pharmacy', name: '西街药店', unlockDay: 2, danger: 2, primary: 'medicine', secondary: 'ration',
    description: '玻璃门碎了一半，地下室一直没人确认过。',
    features: ['药品', '感染风险', '封闭空间'], signatureEventId: 'pharmacy-cold-storage',
    localEventIds: ['pharmacy-unlabeled-bottles', 'pharmacy-antibiotic-crate'],
  },
  {
    id: 'apartment-402', name: '废弃居民楼', unlockDay: 4, danger: 2, primary: 'ration', secondary: 'materials',
    description: '楼道狭窄，房间很多，也意味着退路很少。',
    features: ['居民搜救', '口粮', '坍塌'], signatureEventId: 'apartment-door-402',
    localEventIds: ['apartment-child-backpack', 'apartment-rooftop-light'],
  },
  {
    id: 'auto-repair', name: '汽车修理店', unlockDay: 6, danger: 3, primary: 'parts', secondary: 'materials',
    description: '工具和零件很值钱，金属碰撞声也会传得很远。',
    features: ['零件', '维修设备', '噪音'], signatureEventId: 'repair-jack-crate',
    localEventIds: ['repair-car-alarm', 'repair-working-car'],
  },
  {
    id: 'school', name: '旧学校', unlockDay: 8, danger: 3, primary: 'materials', secondary: 'ration',
    description: '体育馆曾经是临时避难点，广播室可能还留着记录。',
    features: ['社区记忆', 'Hope', '广播情报'], signatureEventId: 'school-gym-roster',
    localEventIds: ['school-last-lesson', 'school-radio-tape'],
  },
  {
    id: 'subway', name: '地铁入口', unlockDay: 11, danger: 4, primary: 'parts', secondary: 'medicine',
    description: '黑暗、潮湿，而且声音会沿隧道传很远。',
    features: ['撤离路线', '黑暗', '失踪风险'], signatureEventId: 'subway-wind',
    localEventIds: ['subway-platform-light', 'subway-maintenance-map'],
  },
  {
    id: 'gas-station', name: '加油站', unlockDay: 14, danger: 4, primary: 'parts', secondary: 'materials',
    description: '附近视野开阔，一旦被发现几乎没有掩体。',
    features: ['能源', '零件', '火灾风险'], signatureEventId: 'gas-tank-pressure',
    localEventIds: ['gas-leaking-floor', 'gas-backup-generator'],
  },
  {
    id: 'hospital', name: '医院', unlockDay: 17, danger: 5, primary: 'medicine', secondary: 'parts',
    description: '药很多。尸群也很多。这里是典型的“值不值得再赌一次”。',
    features: ['大量药品', '感染', '高尸群密度'], signatureEventId: 'hospital-er-light',
    localEventIds: ['hospital-isolation-ward', 'hospital-blood-bank'],
  },
  {
    id: 'bus-station', name: '公交总站', unlockDay: 21, danger: 4, primary: 'materials', secondary: 'ration',
    description: '车辆残骸形成复杂通道，也可能藏着撤离路线。',
    features: ['撤离情报', '居民', '开阔地带'], signatureEventId: 'bus-last-timetable',
    localEventIds: ['bus-locked-coach', 'bus-driver-map'],
  },
  {
    id: 'warehouse', name: '北仓库', unlockDay: 24, danger: 5, primary: 'materials', secondary: 'parts',
    description: '最后几天仍值得冒险的地方之一，但已经靠近尸群迁移方向。',
    features: ['大量材料', '零件', 'DAY29 准备'], signatureEventId: 'warehouse-full-racks',
    localEventIds: ['warehouse-forklift-battery', 'warehouse-protection-crate'],
  },
];

export const GENERIC_EXPEDITION_EVENTS: ExpeditionEvent[] = [
  { id: 'blocked-stairs', title: '楼梯间被堵住了', body: '前面的脚步声越来越密。继续走可以拿到更多东西，但退路会被压缩。', riskBias: 1, tags: ['horde', 'indoor'], weight: 1, specialty: 'watch' },
  { id: 'locked-room', title: '一扇上锁的门', body: '门后没有声音。锁很旧，但撬门会制造很大的动静。', riskBias: 0, tags: ['loot', 'noise'], weight: 1, specialty: 'search' },
  { id: 'survivor-call', title: '有人在里面求救', body: '声音很虚弱，也可能不是一个人。', riskBias: 1, tags: ['rescue', 'survivor'], weight: 1, specialty: 'search' },
  { id: 'collapsed-floor', title: '地板开始下沉', body: '裂缝一路延伸到承重墙，继续深入需要更轻、更快。', riskBias: 2, tags: ['injury', 'structure'], weight: 1, specialty: 'repair' },
  { id: 'quiet-cache', title: '被遗漏的储物柜', body: '没有尸影，也没有声音。越安静的时候，越让人不敢相信运气。', riskBias: -1, tags: ['loot', 'quiet'], weight: 1, specialty: 'search' },
  { id: 'stray-horde', title: '尸群从侧街经过', body: '它们还没发现搜索队。现在决定的是继续等，还是趁空隙撤。', riskBias: 2, tags: ['horde', 'escape'], weight: 1, specialty: 'watch' },
  { id: 'blood-trail', title: '新鲜的血迹', body: '痕迹向建筑深处延伸，时间不会超过几个小时。', riskBias: 1, tags: ['survivor', 'story'], weight: 1, specialty: 'medical' },
  { id: 'roof-route', title: '屋顶之间有一条路', body: '路线更快，但跳跃距离不小。体力差的人会很吃亏。', riskBias: 1, tags: ['movement', 'route'], weight: 1, specialty: 'search' },
];

export const LOCATION_EXPEDITION_EVENTS: ExpeditionEvent[] = [
  // 便利店
  { id: 'convenience-half-shutter', title: '半开的卷帘门', body: '门口的货架还剩一点东西，但后仓传来断断续续的碰撞声。这里不值得赌命，却很适合决定今天要稳还是要贪。', riskBias: 0, tags: ['loot', 'signature'], locationIds: ['convenience-store'], firstVisitOnly: true, specialty: 'search', successFlags: ['scouted:convenience-store'] },
  { id: 'convenience-cold-cases', title: '冷柜里的最后几盒东西', body: '停电以后冷柜早已不冷，但密封包装还算完整。搬得越多，在里面停留的时间就越久。', riskBias: -1, tags: ['loot', 'food'], locationIds: ['convenience-store'], specialty: 'cook', bonusInventory: { ration: 2 } },
  { id: 'convenience-backdoor-key', title: '收银台下面的钥匙', body: '一串钥匙上还贴着“后门”两个字。找到对应门锁以后，下一次再来就不用从街面正门暴露自己。', riskBias: -1, tags: ['route', 'quiet'], locationIds: ['convenience-store'], specialty: 'search', successFlags: ['convenience_backdoor_known'] },

  // 药店
  { id: 'pharmacy-cold-storage', title: '地下室的冷藏柜', body: '地下室仍有密封药柜，但台阶上的血迹一直延伸到黑暗里。药就在下面，危险也在下面。', riskBias: 1, tags: ['medicine', 'infection', 'signature'], locationIds: ['west-pharmacy'], firstVisitOnly: true, specialty: 'medical', successFlags: ['scouted:west-pharmacy'] },
  { id: 'pharmacy-unlabeled-bottles', title: '没有标签的药瓶', body: '一箱散装药瓶被水泡掉了标签。懂药的人也许能分出来，不懂的人最好别把未知东西带回诊疗站。', riskBias: 0, tags: ['medicine', 'uncertain'], locationIds: ['west-pharmacy'], specialty: 'medical', bonusInventory: { medicine: 2 } },
  { id: 'pharmacy-antibiotic-crate', title: '完整的抗生素箱', body: '一只密封运输箱卡在最里面的柜台后。诊疗站已经有能力保存它，这批药可能在下一次危机里救命。', riskBias: 1, tags: ['medicine', 'rare'], locationIds: ['west-pharmacy'], requiredBuilding: { id: 'clinic', level: 2 }, excludedFlags: ['antibiotic_stock'], specialty: 'medical', successFlags: ['antibiotic_stock'], bonusInventory: { medicine: 3 }, weight: 0.55 },

  // 居民楼
  { id: 'apartment-door-402', title: '402 的门后', body: '有人在门后回应，但楼梯已经裂开。先把人带出来会少拿很多东西；继续搜屋，则可能错过救人的窗口。', riskBias: 1, tags: ['rescue', 'survivor', 'signature'], locationIds: ['apartment-402'], firstVisitOnly: true, specialty: 'search', rescueResidents: 1 },
  { id: 'apartment-child-backpack', title: '儿童房里的背包', body: '书桌旁留着一个收拾得很整齐的背包，里面是几包饼干、药膏和一张写着“去楼顶”的纸。', riskBias: 0, tags: ['loot', 'story'], locationIds: ['apartment-402'], specialty: 'search', bonusInventory: { ration: 2, medicine: 1 }, successFlags: ['apartment_rooftop_hint'] },
  { id: 'apartment-rooftop-light', title: '楼顶有人点灯', body: '楼顶真的有人。不是一个，是一小群。他们已经饿了两天，但还在等下面有人回应。', riskBias: 2, tags: ['rescue', 'survivor', 'rare'], locationIds: ['apartment-402'], requiredFlags: ['apartment_rooftop_hint'], excludedFlags: ['apartment_rooftop_rescued'], specialty: 'watch', rescueResidents: 2, successFlags: ['apartment_rooftop_rescued'], weight: 0.65 },

  // 修理店
  { id: 'repair-jack-crate', title: '千斤顶下面', body: '一整箱工具被压在车辆底盘下面。移动汽车最快，但金属摩擦声会传过整条街。', riskBias: 1, tags: ['parts', 'noise', 'signature'], locationIds: ['auto-repair'], firstVisitOnly: true, specialty: 'repair', bonusInventory: { parts: 2 } },
  { id: 'repair-car-alarm', title: '汽车报警器', body: '刚碰到车门，报警器就亮了一下。还有几秒钟决定是剪线、砸掉还是立刻离开。', riskBias: 2, tags: ['noise', 'horde'], locationIds: ['auto-repair'], specialty: 'repair', failureFlags: ['danger:auto-repair'] },
  { id: 'repair-working-car', title: '一台还能发动的车', body: '整辆车带不回去，但里面有完整的传动部件和几件少见工具。以后修街区大型设施会轻松一点。', riskBias: 0, tags: ['parts', 'rare'], locationIds: ['auto-repair'], excludedFlags: ['working_vehicle_parts'], specialty: 'repair', successFlags: ['working_vehicle_parts', 'scouted:auto-repair'], bonusInventory: { parts: 3 }, weight: 0.65 },

  // 学校
  { id: 'school-gym-roster', title: '体育馆名单', body: '墙上贴着最后一批避难者名单，有些名字被划掉，有些旁边写着“转移”。这比一箱材料更像一条线索。', riskBias: 0, tags: ['community', 'story', 'signature'], locationIds: ['school'], firstVisitOnly: true, specialty: 'radio', successFlags: ['school_roster_found'] },
  { id: 'school-last-lesson', title: '黑板上最后一堂课', body: '日期停在停电前一天。黑板角落写着一行字：如果还有人看到，请告诉孩子们这里有人等过他们。', riskBias: -1, tags: ['hope', 'quiet'], locationIds: ['school'], specialty: 'cook', successFlags: ['school_memory_kept'] },
  { id: 'school-radio-tape', title: '广播室磁带', body: '广播室里留着一盘手写日期的磁带，内容提到了地下交通通道和南侧临时集结点。', riskBias: 0, tags: ['radio', 'route'], locationIds: ['school'], specialty: 'radio', successFlags: ['school_broadcast_map', 'external_contact'] },

  // 地铁
  { id: 'subway-wind', title: '隧道里的风', body: '深处有空气流动。那意味着前方可能存在另一个出口，也意味着搜索队必须走得比以前更深。', riskBias: 2, tags: ['route', 'extreme', 'signature'], locationIds: ['subway'], firstVisitOnly: true, specialty: 'search', successFlags: ['subway_exit_known', 'evacuation_route_known'] },
  { id: 'subway-platform-light', title: '站台上的手电光', body: '远处有一道手电光晃了两次。可能是幸存者，也可能只是挂在尸体上的反光片。', riskBias: 2, tags: ['rescue', 'survivor'], locationIds: ['subway'], specialty: 'watch', rescueResidents: 1 },
  { id: 'subway-maintenance-map', title: '维修通道地图', body: '值班室墙上还挂着维修通道图。路线很旧，却足够让之后的搜索队少走一段完全黑暗的隧道。', riskBias: 0, tags: ['route', 'rare'], locationIds: ['subway'], excludedFlags: ['subway_maintenance_map'], specialty: 'search', successFlags: ['subway_maintenance_map', 'scouted:subway'], weight: 0.65 },

  // 加油站
  { id: 'gas-tank-pressure', title: '地下油罐还有压力', body: '仪表还有读数。不能把燃料当成新资源带回去，但抽取和拆解设备足够补充街区的电力与零件。', riskBias: 2, tags: ['power', 'fire', 'signature'], locationIds: ['gas-station'], firstVisitOnly: true, specialty: 'repair', bonusInventory: { power: 8, parts: 1 } },
  { id: 'gas-leaking-floor', title: '漏油的地面', body: '地面已经铺开一层油膜。任何金属火花都可能让这次探索立刻变成撤离。', riskBias: 2, tags: ['fire', 'injury'], locationIds: ['gas-station'], specialty: 'watch', failureFlags: ['danger:gas-station'] },
  { id: 'gas-backup-generator', title: '应急发电机', body: '后屋有一台没被拆走的应急机组。完整带走不现实，但核心组件能让街区下一次断电没那么狼狈。', riskBias: 1, tags: ['power', 'rare'], locationIds: ['gas-station'], excludedFlags: ['generator_backup'], specialty: 'repair', successFlags: ['generator_backup', 'scouted:gas-station'], bonusInventory: { power: 10, parts: 2 }, weight: 0.6 },

  // 医院
  { id: 'hospital-er-light', title: '急诊楼还有灯', body: '备用电源居然还亮着一层楼。灯意味着药品，也意味着里面的尸影从来没有真正散去。', riskBias: 3, tags: ['medicine', 'horde', 'signature'], locationIds: ['hospital'], firstVisitOnly: true, specialty: 'medical', successFlags: ['hospital_route_observed'] },
  { id: 'hospital-isolation-ward', title: '隔离病房', body: '门后的药柜基本完整，病房里的东西却一直在撞门。这里的收益和危险一样明确。', riskBias: 3, tags: ['medicine', 'infection', 'horde'], locationIds: ['hospital'], specialty: 'medical', bonusInventory: { medicine: 3 }, failureFlags: ['danger:hospital'] },
  { id: 'hospital-blood-bank', title: '血库备用电源', body: '诊疗站已经足够完善，可以保存这批设备和药品。拿回去以后，下一次危重抢救会多一个真正的底牌。', riskBias: 2, tags: ['medicine', 'rare'], locationIds: ['hospital'], requiredBuilding: { id: 'clinic', level: 2 }, excludedFlags: ['medical_cache'], specialty: 'medical', successFlags: ['medical_cache', 'scouted:hospital'], bonusInventory: { medicine: 4, power: 4 }, weight: 0.55 },

  // 公交总站
  { id: 'bus-last-timetable', title: '最后一张发车表', body: '墙上的发车表被人用笔重新标过。几条线路旁写着“封死”，南向路线却被圈了两次。', riskBias: 1, tags: ['route', 'signature'], locationIds: ['bus-station'], firstVisitOnly: true, specialty: 'radio', successFlags: ['evacuation_route_known'] },
  { id: 'bus-locked-coach', title: '一辆锁着的公交车', body: '车门从里面卡死，玻璃后既有旅行包，也有一张刚被翻动过的毯子。', riskBias: 1, tags: ['loot', 'rescue'], locationIds: ['bus-station'], specialty: 'search', rescueResidents: 1, bonusInventory: { ration: 2 } },
  { id: 'bus-driver-map', title: '司机的路线本', body: '路线本把主路、辅路和几个旧检查站都标得很清楚。它不能保证撤离成功，却能让街区知道还有哪条路没彻底死掉。', riskBias: 0, tags: ['route', 'rare'], locationIds: ['bus-station'], excludedFlags: ['southern_route_known'], specialty: 'radio', successFlags: ['southern_route_known', 'scouted:bus-station'], weight: 0.65 },

  // 北仓库
  { id: 'warehouse-full-racks', title: '卷帘门后全是货架', body: '材料真的还在，而且多得离谱。远处尸群迁移的声音也是真的。最后几天还来这里，本身就是一场赌博。', riskBias: 3, tags: ['materials', 'horde', 'signature'], locationIds: ['warehouse'], firstVisitOnly: true, specialty: 'watch', bonusInventory: { materials: 3, parts: 1 } },
  { id: 'warehouse-forklift-battery', title: '叉车电池', body: '几组工业电池还能拆。它们很重，但足够让主灯和工坊多撑一段时间。', riskBias: 1, tags: ['power', 'loot'], locationIds: ['warehouse'], specialty: 'repair', bonusInventory: { power: 12, parts: 2 } },
  { id: 'warehouse-protection-crate', title: '整箱防护材料', body: '箱子里不是普通建材，而是成套防护板、固定件和封堵材料。带回去，它们应该留给最后那一夜。', riskBias: 3, tags: ['horde', 'rare', 'finale'], locationIds: ['warehouse'], minDay: 24, excludedFlags: ['final_horde_supplies'], specialty: 'repair', successFlags: ['final_horde_supplies', 'scouted:warehouse'], bonusInventory: { materials: 5, parts: 3 }, weight: 0.5 },
];

export const ALL_EXPEDITION_EVENTS: ExpeditionEvent[] = [...GENERIC_EXPEDITION_EVENTS, ...LOCATION_EXPEDITION_EVENTS];

export function expeditionLocationForId(id: string): ExpeditionLocation | undefined {
  return EXPEDITION_LOCATIONS.find((location) => location.id === id);
}

export function expeditionEventById(id: string | null | undefined): ExpeditionEvent | undefined {
  return id ? ALL_EXPEDITION_EVENTS.find((event) => event.id === id) : undefined;
}

function eventEligible(state: GameState, event: ExpeditionEvent, locationId: string): boolean {
  if (event.locationIds && !event.locationIds.includes(locationId)) return false;
  if (event.minDay && state.day < event.minDay) return false;
  if (event.requiredFlags?.some((flag) => !state.storyFlags.includes(flag))) return false;
  if (event.excludedFlags?.some((flag) => state.storyFlags.includes(flag))) return false;
  if (event.requiredBuilding && state.buildings[event.requiredBuilding.id] < event.requiredBuilding.level) return false;
  return true;
}

export function signatureEventForLocation(state: GameState, locationId: string): ExpeditionEvent | undefined {
  const location = expeditionLocationForId(locationId);
  if (!location || state.storyFlags.includes(`signature_seen:${locationId}`)) return undefined;
  const event = expeditionEventById(location.signatureEventId);
  return event && eventEligible(state, event, locationId) ? event : undefined;
}

export function localEventsForLocation(state: GameState, locationId: string): ExpeditionEvent[] {
  const location = expeditionLocationForId(locationId);
  if (!location) return [];
  return location.localEventIds
    .map((id) => expeditionEventById(id))
    .filter((event): event is ExpeditionEvent => Boolean(event && eventEligible(state, event, locationId)));
}

export function genericEventsForLocation(state: GameState, locationId: string): ExpeditionEvent[] {
  return GENERIC_EXPEDITION_EVENTS.filter((event) => eventEligible(state, event, locationId));
}

export function expeditionSpecialtyBonus(state: GameState, event: ExpeditionEvent | null | undefined): number {
  if (!event?.specialty) return 0;
  return state.expeditionState.activePartyIds.some((id) => state.survivors.find((survivor) => survivor.id === id)?.specialty === event.specialty) ? 1 : 0;
}

function clampInventory(value: number): number {
  return Math.max(0, Math.min(999, Math.floor(value)));
}

export function applyExpeditionStoryOutcome(state: GameState, event: ExpeditionEvent | null | undefined, outcome: CheckOutcome): GameState {
  if (!event) return state;
  const locationId = state.expeditionState.locationId;
  const success = outcome !== 'failure';
  const flags = new Set(state.storyFlags);
  if (event.firstVisitOnly && locationId) flags.add(`signature_seen:${locationId}`);
  for (const flag of success ? event.successFlags ?? [] : event.failureFlags ?? []) flags.add(flag);
  if (success && locationId) flags.delete(`danger:${locationId}`);

  let next: GameState = { ...state, storyFlags: [...flags] };
  if (success && event.bonusInventory) {
    const inventory = { ...next.inventory };
    for (const [key, raw] of Object.entries(event.bonusInventory) as Array<[keyof Inventory, number | undefined]>) {
      if (!raw) continue;
      inventory[key] = clampInventory(inventory[key] + raw);
    }
    next = { ...next, inventory };
  }

  if (success && (event.rescueResidents || event.tags.includes('rescue'))) {
    const amount = Math.max(1, event.rescueResidents ?? 1);
    const rescueFlag = `expedition_rescue:${state.day}:${event.id}`;
    if (!next.storyFlags.includes(rescueFlag)) {
      next = rescueCommunityResidents({
        ...next,
        storyFlags: [...next.storyFlags, rescueFlag],
        campaignStats: { ...next.campaignStats, rescued: next.campaignStats.rescued + amount },
      }, amount, 1);
    }
  }
  return next;
}
