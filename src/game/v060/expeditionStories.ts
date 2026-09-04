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
  tertiary?: ExpeditionResource;
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
    description: '卷帘门半开着。有人记得后仓在收银台右边，门口这几天也没聚起太多尸影。',
    features: ['后仓可能有吃的', '街面还能看清', '离长街很近'], signatureEventId: 'convenience-half-shutter',
    localEventIds: ['convenience-cold-cases', 'convenience-backdoor-key'],
  },
  {
    id: 'west-pharmacy', name: '西街药店', unlockDay: 2, danger: 2, primary: 'medicine', secondary: 'ration', tertiary: 'materials',
    description: '玻璃门碎了一半。橱窗早空了，但后面的地下室一直没人进去确认。',
    features: ['地下室没确认过', '可能还有药柜', '楼梯很窄'], signatureEventId: 'pharmacy-cold-storage',
    localEventIds: ['pharmacy-unlabeled-bottles', 'pharmacy-antibiotic-crate'],
  },
  {
    id: 'apartment-402', name: '废弃居民楼', unlockDay: 4, danger: 2, primary: 'ration', secondary: 'materials', tertiary: 'parts',
    description: '四楼窗帘动过。楼道狭窄，房间很多，真出事时能退的路却不多。',
    features: ['四楼可能有人', '住户家里有余粮', '楼梯有裂缝'], signatureEventId: 'apartment-door-402',
    localEventIds: ['apartment-child-backpack', 'apartment-rooftop-light'],
  },
  {
    id: 'auto-repair', name: '汽车修理店', unlockDay: 6, danger: 3, primary: 'parts', secondary: 'materials',
    description: '卷门没落到底。里面的工具和零件值得搬，但任何金属碰撞声都会传过整条侧街。',
    features: ['工具还在里面', '可能有完整部件', '金属声会传很远'], signatureEventId: 'repair-jack-crate',
    localEventIds: ['repair-car-alarm', 'repair-working-car'],
  },
  {
    id: 'school', name: '旧学校', unlockDay: 8, danger: 3, primary: 'materials', secondary: 'ration',
    description: '体育馆做过临时避难点，广播室也许还留着当时的名单、磁带和路线记录。',
    features: ['体育馆住过人', '广播室还有东西', '操场太空'], signatureEventId: 'school-gym-roster',
    localEventIds: ['school-last-lesson', 'school-radio-tape'],
  },
  {
    id: 'subway', name: '地铁入口', unlockDay: 11, danger: 4, primary: 'parts', secondary: 'medicine', tertiary: 'materials',
    description: '入口被撬开一道缝。地下有风，说明深处可能还有出口；也说明进去以后会离地面很远。',
    features: ['隧道里有风', '可能通向别处', '黑暗里没有近退路'], signatureEventId: 'subway-wind',
    localEventIds: ['subway-platform-light', 'subway-maintenance-map'],
  },
  {
    id: 'gas-station', name: '加油站', unlockDay: 14, danger: 4, primary: 'parts', secondary: 'materials',
    description: '红色顶棚还在，维修间也没完全塌。公路两侧太开阔，被看见以后几乎没地方躲。',
    features: ['维修间可能有机组', '地下罐还有压力', '公路没有掩体'], signatureEventId: 'gas-tank-pressure',
    localEventIds: ['gas-leaking-floor', 'gas-backup-generator'],
  },
  {
    id: 'hospital', name: '医院', unlockDay: 17, danger: 5, primary: 'medicine', secondary: 'parts', tertiary: 'materials',
    description: '急诊楼还有一层备用灯。药柜不会少，走廊里的尸影也从来没真正散过。',
    features: ['急诊楼还有电', '药柜可能完整', '尸影很多'], signatureEventId: 'hospital-er-light',
    localEventIds: ['hospital-isolation-ward', 'hospital-blood-bank'],
  },
  {
    id: 'bus-station', name: '公交总站', unlockDay: 21, danger: 4, primary: 'materials', secondary: 'ration', tertiary: 'parts',
    description: '废弃车辆把站场切成很多狭窄通道。南出口还被人重新做过路线标记。',
    features: ['南出口被圈过', '车里可能有人', '站场通道很乱'], signatureEventId: 'bus-last-timetable',
    localEventIds: ['bus-locked-coach', 'bus-driver-map'],
  },
  {
    id: 'warehouse', name: '北仓库', unlockDay: 24, danger: 5, primary: 'materials', secondary: 'parts', tertiary: 'ration',
    description: '送货单上的坐标是真的。那里还有成排货架，也已经靠近尸群最近几天迁移的方向。',
    features: ['货架可能还是满的', '有工业电池', '靠近尸群迁移方向'], signatureEventId: 'warehouse-full-racks',
    localEventIds: ['warehouse-forklift-battery', 'warehouse-protection-crate'],
  },
];

export const GENERIC_EXPEDITION_EVENTS: ExpeditionEvent[] = [
  { id: 'blocked-stairs', title: '楼梯间被堵住了', body: '前面的脚步声越来越密，身后的楼梯又被杂物卡住一半。再往上走，回头时能用的空间只会更小。', riskBias: 1, tags: ['horde', 'indoor'], weight: 1, specialty: 'watch' },
  { id: 'locked-room', title: '一扇上锁的门', body: '门后没有声音。锁已经锈死，想进去只能撬；第一下金属声就会传到楼道另一头。', riskBias: 0, tags: ['loot', 'noise'], weight: 1, specialty: 'search' },
  { id: 'survivor-call', title: '有人在里面求救', body: '声音很虚弱，从两道门后传出来。听不清是一个人，还是不止一个。', riskBias: 1, tags: ['rescue', 'survivor'], weight: 1, specialty: 'search' },
  { id: 'collapsed-floor', title: '地板开始下沉', body: '裂缝一路爬到承重墙，鞋底每挪一步都会掉灰。再进去，只能更轻、更快。', riskBias: 2, tags: ['injury', 'structure'], weight: 1, specialty: 'repair' },
  { id: 'quiet-cache', title: '被遗漏的储物柜', body: '柜门没锁，附近也没有尸影。太安静了，连拉开抽屉的声音都显得很大。', riskBias: -1, tags: ['loot', 'quiet'], weight: 1, specialty: 'search' },
  { id: 'stray-horde', title: '尸群从侧街经过', body: '它们还没发现搜索队。现在只隔着一排废车，等得越久，空隙也可能越小。', riskBias: 2, tags: ['horde', 'escape'], weight: 1, specialty: 'watch' },
  { id: 'blood-trail', title: '新鲜的血迹', body: '血还没有完全干，沿着墙角一直进到更深的房间里。留下这道痕迹的人几小时前还在这里。', riskBias: 1, tags: ['survivor', 'story'], weight: 1, specialty: 'medical' },
  { id: 'roof-route', title: '屋顶之间有一条路', body: '两栋楼之间只隔一条窄缝，跨过去能少绕一整段楼梯。腿软的人最好别往下看。', riskBias: 1, tags: ['movement', 'route'], weight: 1, specialty: 'search' },
];

export const LOCATION_EXPEDITION_EVENTS: ExpeditionEvent[] = [
  // 便利店
  { id: 'convenience-half-shutter', title: '半开的卷帘门', body: '门口货架还剩一点东西，后仓却一直有碰撞声。卷帘门只够一个人弯腰进去，真有东西冲出来也只能原路退。', riskBias: 0, tags: ['loot', 'signature'], locationIds: ['convenience-store'], firstVisitOnly: true, specialty: 'search', successFlags: ['scouted:convenience-store'] },
  { id: 'convenience-cold-cases', title: '冷柜里的最后几盒东西', body: '停电以后冷柜早已不冷，但密封包装还算完整。每多搬一盒，就要在这间店里多待一会儿。', riskBias: -1, tags: ['loot', 'food'], locationIds: ['convenience-store'], specialty: 'cook', bonusInventory: { ration: 2 } },
  { id: 'convenience-backdoor-key', title: '收银台下面的钥匙', body: '一串钥匙上还贴着“后门”两个字。真能对上门锁，下次再来就不用从街面卷帘门钻进去。', riskBias: -1, tags: ['route', 'quiet'], locationIds: ['convenience-store'], specialty: 'search', successFlags: ['convenience_backdoor_known'] },

  // 药店
  { id: 'pharmacy-cold-storage', title: '地下室的冷藏柜', body: '地下室仍有密封药柜，但台阶上的血迹一直延伸到黑暗里。药就在下面，血迹也在下面。', riskBias: 1, tags: ['medicine', 'infection', 'signature'], locationIds: ['west-pharmacy'], firstVisitOnly: true, specialty: 'medical', successFlags: ['scouted:west-pharmacy'] },
  { id: 'pharmacy-unlabeled-bottles', title: '没有标签的药瓶', body: '一箱散装药瓶被水泡掉了标签。懂药的人也许能分出来，不懂的人最好别把未知东西带回诊疗室。', riskBias: 0, tags: ['medicine', 'uncertain'], locationIds: ['west-pharmacy'], specialty: 'medical', bonusInventory: { medicine: 2 } },
  { id: 'pharmacy-antibiotic-crate', title: '完整的抗生素箱', body: '一只密封运输箱卡在最里面的柜台后。诊疗室现在有冷藏和干燥位置，这批药终于能完整带回去。', riskBias: 1, tags: ['medicine', 'rare'], locationIds: ['west-pharmacy'], requiredBuilding: { id: 'clinic', level: 2 }, excludedFlags: ['antibiotic_stock'], specialty: 'medical', successFlags: ['antibiotic_stock'], bonusInventory: { medicine: 3 }, weight: 0.55 },

  // 居民楼
  { id: 'apartment-door-402', title: '402 的门后', body: '有人在门后回应，楼梯却已经裂开。门后的人在催，屋里散落的食物也就在眼前。', riskBias: 1, tags: ['rescue', 'survivor', 'signature'], locationIds: ['apartment-402'], firstVisitOnly: true, specialty: 'search', rescueResidents: 1 },
  { id: 'apartment-child-backpack', title: '儿童房里的背包', body: '书桌旁留着一个收拾得很整齐的背包，里面是几包饼干、药膏和一张写着“去楼顶”的纸。', riskBias: 0, tags: ['loot', 'story'], locationIds: ['apartment-402'], specialty: 'search', bonusInventory: { ration: 2, medicine: 1 }, successFlags: ['apartment_rooftop_hint'] },
  { id: 'apartment-rooftop-light', title: '楼顶有人点灯', body: '楼顶真的有人。不是一个，是一小群。他们已经饿了两天，还在等下面有人回应。', riskBias: 2, tags: ['rescue', 'survivor', 'rare'], locationIds: ['apartment-402'], requiredFlags: ['apartment_rooftop_hint'], excludedFlags: ['apartment_rooftop_rescued'], specialty: 'watch', rescueResidents: 2, successFlags: ['apartment_rooftop_rescued'], weight: 0.65 },

  // 修理店
  { id: 'repair-jack-crate', title: '千斤顶下面', body: '一整箱工具被压在车辆底盘下面。想拿出来就得挪车，金属摩擦声会从卷门缝里一直传出去。', riskBias: 1, tags: ['parts', 'noise', 'signature'], locationIds: ['auto-repair'], firstVisitOnly: true, specialty: 'repair', bonusInventory: { parts: 2 } },
  { id: 'repair-car-alarm', title: '汽车报警器', body: '刚碰到车门，报警灯就亮了一下。还有几秒钟决定是剪线、砸掉，还是立刻离开。', riskBias: 2, tags: ['noise', 'horde'], locationIds: ['auto-repair'], specialty: 'repair', failureFlags: ['danger:auto-repair'] },
  { id: 'repair-working-car', title: '一台还能发动的车', body: '整辆车带不回去，但传动部件完整，后备箱还有几件少见工具。老周看一眼就知道这些东西以后能用在哪。', riskBias: 0, tags: ['parts', 'rare'], locationIds: ['auto-repair'], excludedFlags: ['working_vehicle_parts'], specialty: 'repair', successFlags: ['working_vehicle_parts', 'scouted:auto-repair'], bonusInventory: { parts: 3 }, weight: 0.65 },

  // 学校
  { id: 'school-gym-roster', title: '体育馆名单', body: '墙上贴着最后一批避难者名单，有些名字被划掉，有些旁边写着“转移”。比起材料，这张纸更像有人留下的一条路。', riskBias: 0, tags: ['community', 'story', 'signature'], locationIds: ['school'], firstVisitOnly: true, specialty: 'radio', successFlags: ['school_roster_found'] },
  { id: 'school-last-lesson', title: '黑板上最后一堂课', body: '日期停在停电前一天。黑板角落写着一行字：如果还有人看到，请告诉孩子们这里有人等过他们。', riskBias: -1, tags: ['hope', 'quiet'], locationIds: ['school'], specialty: 'cook', successFlags: ['school_memory_kept'] },
  { id: 'school-radio-tape', title: '广播室磁带', body: '广播室里留着一盘手写日期的磁带，内容提到了地下交通通道和南侧临时集结点。', riskBias: 0, tags: ['radio', 'route'], locationIds: ['school'], specialty: 'radio', successFlags: ['school_broadcast_map', 'external_contact'] },

  // 地铁
  { id: 'subway-wind', title: '隧道里的风', body: '深处有空气流动。前面也许真有另一个出口，但要确认它，搜索队必须走到看不见入口灯光的地方。', riskBias: 2, tags: ['route', 'extreme', 'signature'], locationIds: ['subway'], firstVisitOnly: true, specialty: 'search', successFlags: ['subway_exit_known', 'evacuation_route_known'] },
  { id: 'subway-platform-light', title: '站台上的手电光', body: '远处有一道手电光晃了两次。可能是幸存者，也可能只是挂在尸体上的反光片。', riskBias: 2, tags: ['rescue', 'survivor'], locationIds: ['subway'], specialty: 'watch', rescueResidents: 1 },
  { id: 'subway-maintenance-map', title: '维修通道地图', body: '值班室墙上还挂着维修通道图。路线很旧，却足够让之后的人避开一段完全摸黑的隧道。', riskBias: 0, tags: ['route', 'rare'], locationIds: ['subway'], excludedFlags: ['subway_maintenance_map'], specialty: 'search', successFlags: ['subway_maintenance_map', 'scouted:subway'], weight: 0.65 },

  // 加油站
  { id: 'gas-tank-pressure', title: '地下油罐还有压力', body: '仪表还有读数。燃料没法整罐搬走，但泵和拆下来的组件能给长街的发电机续一阵。', riskBias: 2, tags: ['power', 'fire', 'signature'], locationIds: ['gas-station'], firstVisitOnly: true, specialty: 'repair', bonusInventory: { power: 8, parts: 1 } },
  { id: 'gas-leaking-floor', title: '漏油的地面', body: '地面已经铺开一层油膜。鞋底一滑都会留下声音，任何金属火花都可能把整间维修室点着。', riskBias: 2, tags: ['fire', 'injury'], locationIds: ['gas-station'], specialty: 'watch', failureFlags: ['danger:gas-station'] },
  { id: 'gas-backup-generator', title: '应急发电机', body: '后屋有一台没被拆走的应急机组。整台搬不动，但核心组件能让下一次全街断电时多撑一会儿。', riskBias: 1, tags: ['power', 'rare'], locationIds: ['gas-station'], excludedFlags: ['generator_backup'], specialty: 'repair', successFlags: ['generator_backup', 'scouted:gas-station'], bonusInventory: { power: 10, parts: 2 }, weight: 0.6 },

  // 医院
  { id: 'hospital-er-light', title: '急诊楼还有灯', body: '备用电源居然还亮着一层楼。亮着的走廊后面是药房，也是一直没有散尽的尸影。', riskBias: 3, tags: ['medicine', 'horde', 'signature'], locationIds: ['hospital'], firstVisitOnly: true, specialty: 'medical', successFlags: ['hospital_route_observed'] },
  { id: 'hospital-isolation-ward', title: '隔离病房', body: '门后的药柜基本完整，病房里的东西却一直在撞门。药离手只有几米，撞门声也只有几米。', riskBias: 3, tags: ['medicine', 'infection', 'horde'], locationIds: ['hospital'], specialty: 'medical', bonusInventory: { medicine: 3 }, failureFlags: ['danger:hospital'] },
  { id: 'hospital-blood-bank', title: '血库备用电源', body: '诊疗室现在有地方接这些设备，也有条件保存带回去的药。只要能把箱子搬过医院走廊，它们就不会白留在这里。', riskBias: 2, tags: ['medicine', 'rare'], locationIds: ['hospital'], requiredBuilding: { id: 'clinic', level: 2 }, excludedFlags: ['medical_cache'], specialty: 'medical', successFlags: ['medical_cache', 'scouted:hospital'], bonusInventory: { medicine: 4, power: 4 }, weight: 0.55 },

  // 公交总站
  { id: 'bus-last-timetable', title: '最后一张发车表', body: '墙上的发车表被人用笔重新标过。几条线路旁写着“封死”，南向路线却被圈了两次。', riskBias: 1, tags: ['route', 'signature'], locationIds: ['bus-station'], firstVisitOnly: true, specialty: 'radio', successFlags: ['evacuation_route_known'] },
  { id: 'bus-locked-coach', title: '一辆锁着的公交车', body: '车门从里面卡死，玻璃后既有旅行包，也有一张刚被翻动过的毯子。', riskBias: 1, tags: ['loot', 'rescue'], locationIds: ['bus-station'], specialty: 'search', rescueResidents: 1, bonusInventory: { ration: 2 } },
  { id: 'bus-driver-map', title: '司机的路线本', body: '路线本把主路、辅路和几个旧检查站都标得很清楚。至少有一条南向路还没有被人画上叉。', riskBias: 0, tags: ['route', 'rare'], locationIds: ['bus-station'], excludedFlags: ['southern_route_known'], specialty: 'radio', successFlags: ['southern_route_known', 'scouted:bus-station'], weight: 0.65 },

  // 北仓库
  { id: 'warehouse-full-racks', title: '卷帘门后全是货架', body: '材料真的还在，而且多得离谱。远处尸群迁移的摩擦声也是真的，仓库门每开久一分钟都更难忽略。', riskBias: 3, tags: ['materials', 'horde', 'signature'], locationIds: ['warehouse'], firstVisitOnly: true, specialty: 'watch', bonusInventory: { materials: 3, parts: 1 } },
  { id: 'warehouse-forklift-battery', title: '叉车电池', body: '几组工业电池还能拆。它们很重，抬回去却足够让主灯和工坊多撑一段时间。', riskBias: 1, tags: ['power', 'loot'], locationIds: ['warehouse'], specialty: 'repair', bonusInventory: { power: 12, parts: 2 } },
  { id: 'warehouse-protection-crate', title: '整箱防护材料', body: '箱子里是成套防护板、固定件和封堵材料。老周看过清单以后只说了一句：这批东西别在普通修补上用掉。', riskBias: 3, tags: ['horde', 'rare', 'finale'], locationIds: ['warehouse'], minDay: 24, excludedFlags: ['final_horde_supplies'], specialty: 'repair', successFlags: ['final_horde_supplies', 'scouted:warehouse'], bonusInventory: { materials: 5, parts: 3 }, weight: 0.5 },
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
  return state.expeditionState.activePartyIds.some((id) => {
    const survivor = state.survivors.find((item) => item.id === id);
    return Boolean(survivor && survivor.specialty === event.specialty && (survivor.trust ?? 0) >= 0);
  }) ? 1 : 0;
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
