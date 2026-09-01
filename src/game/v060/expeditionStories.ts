import { nextRandom } from '../rng';
import type { BuildingId, CheckOutcome, GameState, Inventory, Role } from '../types';
import { rescueCommunityResidents } from './community';

export type ExpeditionResource = 'ration' | 'medicine' | 'materials' | 'parts';
export type ExpeditionStoryKind = 'generic' | 'signature' | 'local' | 'rare';

export interface ExpeditionStoryEffect {
  flags?: string[];
  inventory?: Partial<Inventory>;
  hope?: number;
  defense?: number;
  residentGain?: number;
}

export interface ExpeditionStoryEvent {
  id: string;
  title: string;
  body: string;
  riskBias: number;
  tags: string[];
  kind: ExpeditionStoryKind;
  locationIds?: string[];
  weight?: number;
  requiredFlags?: string[];
  excludedFlags?: string[];
  requiredBuildings?: Partial<Record<BuildingId, number>>;
  preferredRoles?: Role[];
  outcomes?: Partial<Record<CheckOutcome, ExpeditionStoryEffect>>;
}

export interface ExpeditionLocationProfile {
  id: string;
  signatureEventId: string;
  theme: string;
  features: string[];
  preferredRoles: Role[];
}

const profile = (
  id: string,
  signatureEventId: string,
  theme: string,
  features: string[],
  preferredRoles: Role[],
): ExpeditionLocationProfile => ({ id, signatureEventId, theme, features, preferredRoles });

export const LOCATION_STORY_PROFILES: Record<string, ExpeditionLocationProfile> = {
  'convenience-store': profile('convenience-store', 'sig-convenience-shutter', '稳定补给', ['口粮稳定', '噪音较低', '前期缓冲'], ['search']),
  'west-pharmacy': profile('west-pharmacy', 'sig-pharmacy-basement', '医疗资源', ['药品丰富', '感染风险', '封闭空间'], ['medical', 'search']),
  'apartment-402': profile('apartment-402', 'sig-apartment-402', '居民搜救', ['居民机会', '楼梯坍塌', '狭窄退路'], ['search', 'watch']),
  'auto-repair': profile('auto-repair', 'sig-auto-jack', '工业零件', ['零件丰富', '机械噪音', '维修联动'], ['repair', 'watch']),
  school: profile('school', 'sig-school-roster', '社区记忆', ['Hope/居民', '广播情报', '地点线索'], ['radio', 'search']),
  subway: profile('subway', 'sig-subway-wind', '撤离路线', ['黑暗', '失踪风险', '长期路线'], ['search', 'watch']),
  'gas-station': profile('gas-station', 'sig-gas-pressure', '能源设备', ['电力收益', '火灾风险', '维修联动'], ['repair', 'watch']),
  hospital: profile('hospital', 'sig-hospital-er-light', '高风险医疗', ['药品高收益', '感染/尸群', '严重失败可致死'], ['medical', 'watch']),
  'bus-station': profile('bus-station', 'sig-bus-timetable', '撤离情报', ['路线线索', '居民机会', '开阔区域'], ['radio', 'search']),
  warehouse: profile('warehouse', 'sig-warehouse-shelves', '终局储备', ['材料/零件高收益', '尸群迁徙', 'DAY29准备'], ['repair', 'watch']),
};

const generic = (id: string, title: string, body: string, riskBias: number, tags: string[]): ExpeditionStoryEvent => ({
  id, title, body, riskBias, tags, kind: 'generic', weight: 3,
});

const story = (
  id: string,
  locationId: string,
  kind: Exclude<ExpeditionStoryKind, 'generic'>,
  title: string,
  body: string,
  riskBias: number,
  tags: string[],
  options: Partial<Pick<ExpeditionStoryEvent, 'requiredFlags' | 'excludedFlags' | 'requiredBuildings' | 'preferredRoles' | 'outcomes' | 'weight'>> = {},
): ExpeditionStoryEvent => ({
  id, title, body, riskBias, tags, kind, locationIds: [locationId],
  weight: kind === 'local' ? 7 : kind === 'rare' ? 2 : 1,
  ...options,
});

const GENERIC_EVENTS: ExpeditionStoryEvent[] = [
  generic('blocked-stairs', '楼梯间被堵住了', '前面的脚步声越来越密。继续走可以拿到更多东西，但退路会被压缩。', 1, ['horde', 'indoor']),
  generic('locked-room', '一扇上锁的门', '门后没有声音。锁很旧，但撬门会制造很大的动静。', 0, ['loot', 'noise']),
  generic('survivor-call', '有人在里面求救', '声音很虚弱，也可能不是一个人。', 1, ['rescue', 'survivor']),
  generic('collapsed-floor', '地板开始下沉', '裂缝一路延伸到承重墙，继续深入需要更轻、更快。', 2, ['injury', 'structure']),
  generic('quiet-cache', '被遗漏的储物柜', '没有尸影，也没有声音。越安静的时候，越让人不敢相信运气。', -1, ['loot', 'quiet']),
  generic('stray-horde', '尸群从侧街经过', '它们还没发现搜索队。现在决定的是继续等，还是趁空隙撤。', 2, ['horde', 'escape']),
  generic('blood-trail', '新鲜的血迹', '痕迹向建筑深处延伸，时间不会超过几个小时。', 1, ['survivor', 'story']),
  generic('roof-route', '屋顶之间有一条路', '路线更快，但跳跃距离不小。体力差的人会很吃亏。', 1, ['movement', 'route']),
];

const LOCATION_EVENTS: ExpeditionStoryEvent[] = [
  // 便利店
  story('sig-convenience-shutter', 'convenience-store', 'signature', '半开的卷帘门', '前厅货架已经被扫过，但后仓门还关着。里面有轻微碰撞声，也可能只是倒下的纸箱。', 0, ['loot', 'signature'], {
    preferredRoles: ['search'],
    outcomes: {
      partial: { inventory: { ration: 2, materials: 1 } },
      success: { inventory: { ration: 3, materials: 1 }, flags: ['scouted:convenience-store'] },
      critical: { inventory: { ration: 2 }, hope: 1 },
      failure: { flags: ['danger:convenience-store'] },
    },
  }),
  story('convenience-cold-locker', 'convenience-store', 'local', '冷柜里的最后几盒东西', '停电以后冷柜早就不冷了，但密封食品仍然可能安全。要花时间一盒盒确认。', -1, ['loot', 'food'], {
    outcomes: { partial: { inventory: { ration: 1 } }, success: { inventory: { ration: 2 } }, critical: { inventory: { ration: 2 }, hope: 1 } },
  }),
  story('convenience-counter-key', 'convenience-store', 'local', '收银台下面的钥匙', '一串贴着“后门”的旧钥匙卡在抽屉夹层里。找到正确那把，之后进出会轻松很多。', 0, ['route', 'loot'], {
    preferredRoles: ['search'],
    outcomes: { success: { flags: ['scouted:convenience-store'] }, critical: { inventory: { ration: 1 } } },
  }),
  story('convenience-delivery-note', 'convenience-store', 'rare', '送货单上的手写地址', '最后一张送货单上圈出了西街药店，并写着“地下室冷藏柜还能用”。', -1, ['intel', 'rare'], {
    excludedFlags: ['location_unlocked:west-pharmacy'],
    outcomes: { success: { flags: ['location_unlocked:west-pharmacy'] }, critical: { hope: 1 } },
  }),

  // 西街药店
  story('sig-pharmacy-basement', 'west-pharmacy', 'signature', '地下室的冷藏柜', '一楼被翻得很乱，但通往地下室的铁门还锁着。门缝里有冷气，也有一股不太对劲的味道。', 1, ['medicine', 'infection', 'signature'], {
    preferredRoles: ['medical', 'search'],
    outcomes: {
      partial: { inventory: { medicine: 2 } },
      success: { inventory: { medicine: 3 }, flags: ['scouted:west-pharmacy'] },
      critical: { inventory: { medicine: 2 }, hope: 1 },
      failure: { flags: ['danger:west-pharmacy'] },
    },
  }),
  story('pharmacy-unlabelled', 'west-pharmacy', 'local', '没有标签的药瓶', '柜台后散着几瓶没有外包装的药。带回去有价值，但拿错药也可能把麻烦带回街区。', 1, ['medicine', 'judgement'], {
    preferredRoles: ['medical'],
    outcomes: { partial: { inventory: { medicine: 1 } }, success: { inventory: { medicine: 2 } }, failure: { flags: ['danger:west-pharmacy'] } },
  }),
  story('pharmacy-backdoor', 'west-pharmacy', 'local', '后门有人敲了两下', '敲门声很虚弱。门外的人说自己一直躲在隔壁库房，但外面也有拖行的脚步。', 1, ['survivor'], {
    outcomes: { partial: { residentGain: 1 }, success: { residentGain: 1, hope: 1 }, critical: { inventory: { medicine: 1 } } },
  }),
  story('pharmacy-antibiotics', 'west-pharmacy', 'rare', '完整的抗生素箱', '一只冷藏运输箱还保持密封。诊疗站如果已经成型，这批药能真正改变下一次危机。', 0, ['medicine', 'rare'], {
    requiredBuildings: { clinic: 2 },
    excludedFlags: ['antibiotic_stock'],
    preferredRoles: ['medical'],
    outcomes: { success: { inventory: { medicine: 4 }, flags: ['antibiotic_stock'] }, critical: { inventory: { medicine: 2 }, hope: 1 } },
  }),

  // 居民楼
  story('sig-apartment-402', 'apartment-402', 'signature', '402 的门后', '门后有人回应，但楼梯平台已经裂开。物资就在另一侧房间，而救人意味着先处理危险的通道。', 1, ['survivor', 'structure', 'signature'], {
    preferredRoles: ['search', 'watch'],
    outcomes: { partial: { residentGain: 1 }, success: { residentGain: 1, hope: 1 }, critical: { inventory: { ration: 2 } }, failure: { flags: ['danger:apartment-402'] } },
  }),
  story('apartment-child-bag', 'apartment-402', 'local', '儿童房里的背包', '背包里装着几包饼干、一张写满电话号码的纸，还有一只被认真缝过的布偶。', -1, ['food', 'hope'], {
    outcomes: { partial: { inventory: { ration: 1 } }, success: { inventory: { ration: 2 }, hope: 1 }, critical: { hope: 1 } },
  }),
  story('apartment-cracked-stair', 'apartment-402', 'local', '楼梯又塌了一截', '回去的路还在，但承重墙正在掉灰。继续搜必须先找另一条路线。', 2, ['structure', 'route'], {
    preferredRoles: ['search'],
    outcomes: { success: { flags: ['scouted:apartment-402'] }, failure: { flags: ['danger:apartment-402'] } },
  }),
  story('apartment-rooftop-light', 'apartment-402', 'rare', '楼顶有人点灯', '两个人在屋顶用镜子反光。他们已经撑了很多天，只等一个能带他们下楼的机会。', 1, ['survivor', 'rare'], {
    outcomes: { partial: { residentGain: 1 }, success: { residentGain: 2, hope: 2 }, critical: { inventory: { ration: 1 } } },
  }),

  // 修理店
  story('sig-auto-jack', 'auto-repair', 'signature', '千斤顶下面', '一辆车架下面压着整箱工具和轴承。移动它能拿到真正值钱的东西，也会让整间店发出金属声。', 1, ['parts', 'noise', 'signature'], {
    preferredRoles: ['repair'],
    outcomes: { partial: { inventory: { parts: 2, materials: 1 } }, success: { inventory: { parts: 4, materials: 1 } }, critical: { inventory: { parts: 2 } }, failure: { flags: ['danger:auto-repair'] } },
  }),
  story('auto-alarm', 'auto-repair', 'local', '汽车报警器突然响了', '一辆旧车的电瓶居然还有电。尖锐的报警声正在往街口传。', 2, ['noise', 'horde'], {
    preferredRoles: ['repair', 'watch'],
    outcomes: { success: { flags: ['scouted:auto-repair'] }, failure: { flags: ['danger:auto-repair'] } },
  }),
  story('auto-working-frame', 'auto-repair', 'local', '一台还能转动的发动机', '整车开不走，但发动机、皮带和部分传动件还能拆下来。', 0, ['parts', 'infrastructure'], {
    preferredRoles: ['repair'],
    outcomes: { partial: { inventory: { parts: 2 } }, success: { inventory: { parts: 3 }, flags: ['working_vehicle_parts'] } },
  }),
  story('auto-generator-rotor', 'auto-repair', 'rare', '完整的发电机转子', '货架顶层有一只封装完好的转子组件。老线路最怕的那种故障，它正好能顶一次。', 0, ['power', 'rare'], {
    excludedFlags: ['generator_backup'],
    preferredRoles: ['repair'],
    outcomes: { success: { inventory: { parts: 2, power: 8 }, flags: ['generator_backup'] }, critical: { inventory: { power: 5 } } },
  }),

  // 学校
  story('sig-school-roster', 'school', 'signature', '体育馆名单', '墙上还贴着临时避难名单。几个名字旁边画了箭头，指向广播室和地铁方向。', 0, ['community', 'intel', 'signature'], {
    preferredRoles: ['radio', 'search'],
    outcomes: { partial: { hope: 1 }, success: { hope: 1, flags: ['school_roster_known', 'school_broadcast_log'] }, critical: { flags: ['location_unlocked:subway'] } },
  }),
  story('school-blackboard', 'school', 'local', '黑板上最后一堂课', '日期停在灾难发生前一天。有人后来又在下面写了一句：如果看到这行字，说明你还活着。', -1, ['hope', 'quiet'], {
    outcomes: { success: { hope: 2 }, critical: { hope: 1 } },
  }),
  story('school-radio-tape', 'school', 'local', '广播室磁带', '录音里提到地铁维修通道和一支向南撤离的车队。信号断断续续，但地点是真实的。', 0, ['radio', 'intel'], {
    preferredRoles: ['radio'],
    outcomes: { partial: { flags: ['location_unlocked:subway'] }, success: { flags: ['location_unlocked:subway', 'external_contact'] }, critical: { hope: 1 } },
  }),
  story('school-gym-backdoor', 'school', 'rare', '体育馆后门', '后门后藏着几名一直不敢开灯的居民。他们没有多少物资，但愿意跟搜索队回街区。', 0, ['survivor', 'rare'], {
    outcomes: { partial: { residentGain: 1 }, success: { residentGain: 2, hope: 1 } },
  }),

  // 地铁
  story('sig-subway-wind', 'subway', 'signature', '隧道里的风', '站台深处有持续的气流。那意味着某处仍然通向地面，也意味着必须离安全出口更远。', 2, ['route', 'dark', 'signature'], {
    preferredRoles: ['search', 'watch'],
    outcomes: { partial: { flags: ['subway_exit_known'] }, success: { flags: ['subway_exit_known', 'evacuation_route_known'] }, critical: { flags: ['scouted:subway'], hope: 1 }, failure: { flags: ['danger:subway'] } },
  }),
  story('subway-flashlight', 'subway', 'local', '站台尽头的手电光', '光点停一下、闪两下，又消失。它可能是幸存者，也可能只是有人留下的诱饵。', 2, ['survivor', 'dark'], {
    preferredRoles: ['watch'],
    outcomes: { success: { residentGain: 1, hope: 1 }, failure: { flags: ['danger:subway'] } },
  }),
  story('subway-stalled-train', 'subway', 'local', '停在隧道里的列车', '维修舱门没有锁，里面可能有电气零件和急救箱。车厢另一头却不断传来撞击声。', 2, ['parts', 'medicine', 'horde'], {
    outcomes: { partial: { inventory: { parts: 2 } }, success: { inventory: { parts: 3, medicine: 1 } }, failure: { flags: ['danger:subway'] } },
  }),
  story('subway-maintenance-map', 'subway', 'rare', '维修通道地图', '一张塑封地图标出了三个地面检修口。它比任何一箱零件都更像一条未来。', 0, ['route', 'rare'], {
    excludedFlags: ['subway_maintenance_map'],
    preferredRoles: ['search'],
    outcomes: { success: { flags: ['subway_maintenance_map', 'scouted:subway', 'evacuation_route_known'], hope: 1 } },
  }),

  // 加油站
  story('sig-gas-pressure', 'gas-station', 'signature', '地下油罐还有压力', '油本身未必还能直接用，但抽油设备、电池和稳压器都很值钱。最怕的是一颗火星。', 2, ['power', 'fire', 'signature'], {
    preferredRoles: ['repair'],
    outcomes: { partial: { inventory: { parts: 2, power: 5 } }, success: { inventory: { parts: 2, power: 10 }, flags: ['scouted:gas-station'] }, critical: { inventory: { power: 5 } }, failure: { flags: ['danger:gas-station'] } },
  }),
  story('gas-oil-slick', 'gas-station', 'local', '漏油的地面', '后仓地面已经浸湿。绕过去很慢，踩过去则任何金属碰撞都可能变成灾难。', 2, ['fire', 'movement'], {
    preferredRoles: ['repair', 'watch'],
    outcomes: { success: { inventory: { parts: 2 } }, failure: { flags: ['danger:gas-station'] } },
  }),
  story('gas-ambulance', 'gas-station', 'local', '停在角落的救护车', '车门半开，急救箱仍固定在墙上。附近很安静，安静得不像好事。', 1, ['medicine', 'loot'], {
    outcomes: { partial: { inventory: { medicine: 1 } }, success: { inventory: { medicine: 2, parts: 1 } } },
  }),
  story('gas-emergency-generator', 'gas-station', 'rare', '应急发电机', '仓库里有一台小型应急发电机。搬不回整机，但电池组和控制器完全可以拆走。', 1, ['power', 'rare'], {
    excludedFlags: ['generator_backup'],
    preferredRoles: ['repair'],
    outcomes: { success: { inventory: { power: 16, parts: 2 }, flags: ['generator_backup'] }, critical: { inventory: { power: 6 } } },
  }),

  // 医院
  story('sig-hospital-er-light', 'hospital', 'signature', '急诊楼还有灯', '备用电源竟然还亮着几盏灯。药房就在里面，但玻璃门后密密麻麻全是晃动的影子。', 3, ['medicine', 'horde', 'signature'], {
    preferredRoles: ['medical', 'watch'],
    outcomes: { partial: { inventory: { medicine: 3 } }, success: { inventory: { medicine: 5, parts: 1 }, flags: ['scouted:hospital'] }, critical: { inventory: { medicine: 2 }, hope: 1 }, failure: { flags: ['danger:hospital'] } },
  }),
  story('hospital-isolation', 'hospital', 'local', '隔离病房', '门上贴着感染警告。柜子里还有大量药品，但里面的东西并没有完全安静下来。', 3, ['medicine', 'infection'], {
    preferredRoles: ['medical'],
    outcomes: { partial: { inventory: { medicine: 2 } }, success: { inventory: { medicine: 4 } }, failure: { flags: ['danger:hospital'] } },
  }),
  story('hospital-operating-room', 'hospital', 'local', '手术室器械柜', '器械保存得比药品还完整。懂医疗的人能分辨哪些值得冒险带走，其他人只能凭感觉。', 1, ['medical', 'equipment'], {
    preferredRoles: ['medical'],
    outcomes: { success: { inventory: { medicine: 2, parts: 2 }, flags: ['medical_instruments'] }, critical: { hope: 1 } },
  }),
  story('hospital-blood-bank', 'hospital', 'rare', '血库备用电源', '血库已经失效，但旁边的应急柜保存着完整的急救耗材和药品。诊疗站够完善才能真正用上。', 1, ['medicine', 'rare'], {
    requiredBuildings: { clinic: 2 },
    excludedFlags: ['medical_cache'],
    preferredRoles: ['medical'],
    outcomes: { success: { inventory: { medicine: 6 }, flags: ['medical_cache'], hope: 1 }, critical: { inventory: { medicine: 2 } } },
  }),

  // 公交总站
  story('sig-bus-timetable', 'bus-station', 'signature', '最后一张发车表', '调度室里钉着灾难当天的手写改道图。南边有一条绕过主干道的路线，但几处标记已经模糊。', 1, ['route', 'intel', 'signature'], {
    preferredRoles: ['radio', 'search'],
    outcomes: { partial: { flags: ['bus_route_fragment'] }, success: { flags: ['evacuation_route_known'] }, critical: { flags: ['southern_route_known'], hope: 1 } },
  }),
  story('bus-locked-coach', 'bus-station', 'local', '一辆锁着的公交车', '车窗里面能看到物资箱，也能看到后排有一只手轻轻敲玻璃。', 1, ['survivor', 'loot'], {
    outcomes: { partial: { inventory: { ration: 2 } }, success: { inventory: { ration: 2 }, residentGain: 1, hope: 1 } },
  }),
  story('bus-radio', 'bus-station', 'local', '候车厅的无线电', '设备已经坏了一半，但最后接收的频率仍写在纸上。它和街区广播亭记录里的频段很接近。', 0, ['radio', 'intel'], {
    preferredRoles: ['radio'],
    outcomes: { success: { flags: ['external_contact'], hope: 1 } },
  }),
  story('bus-driver-route', 'bus-station', 'rare', '司机的路线本', '路线本夹层里画着一条南向小路，避开了两个已经沦陷的路口。', 0, ['route', 'rare'], {
    excludedFlags: ['southern_route_known'],
    outcomes: { success: { flags: ['southern_route_known', 'evacuation_route_known'], hope: 1 } },
  }),

  // 北仓库
  story('sig-warehouse-shelves', 'warehouse', 'signature', '卷帘门后全是货架', '这里的库存比预想更多。真正的问题是远处不断靠近的尸群声——最后几天还要不要再赌一次。', 3, ['materials', 'horde', 'signature'], {
    preferredRoles: ['repair', 'watch'],
    outcomes: { partial: { inventory: { materials: 3, parts: 1 } }, success: { inventory: { materials: 6, parts: 3 }, flags: ['scouted:warehouse'] }, critical: { inventory: { materials: 3 } }, failure: { flags: ['danger:warehouse'] } },
  }),
  story('warehouse-fallen-rack', 'warehouse', 'local', '倒塌的货架', '成捆建材压在钢架下面。搬出来要时间，继续留在这里则每分钟都更危险。', 2, ['materials', 'structure'], {
    preferredRoles: ['repair'],
    outcomes: { partial: { inventory: { materials: 2 } }, success: { inventory: { materials: 4 } }, failure: { flags: ['danger:warehouse'] } },
  }),
  story('warehouse-forklift', 'warehouse', 'local', '叉车电池', '叉车不能开了，但电池组还能拆。它足够让街区多撑一个晚上。', 1, ['power', 'equipment'], {
    preferredRoles: ['repair'],
    outcomes: { success: { inventory: { power: 12, parts: 1 } }, critical: { inventory: { power: 5 } } },
  }),
  story('warehouse-protection-crate', 'warehouse', 'rare', '整箱防护材料', '仓库最里面有一整箱防护板和固定件。把它带回去，最终尸潮前就能直接加到主防线上。', 2, ['defense', 'rare'], {
    excludedFlags: ['final_horde_supplies'],
    preferredRoles: ['repair', 'watch'],
    outcomes: { success: { inventory: { materials: 6 }, defense: 8, flags: ['final_horde_supplies'] }, critical: { inventory: { materials: 3 }, defense: 4, hope: 1 } },
  }),
];

export const EXPEDITION_STORY_EVENTS: ExpeditionStoryEvent[] = [...GENERIC_EVENTS, ...LOCATION_EVENTS];

export function expeditionStoryEventById(id: string | null | undefined): ExpeditionStoryEvent | null {
  if (!id) return null;
  return EXPEDITION_STORY_EVENTS.find((event) => event.id === id) ?? null;
}

export function locationStoryProfile(locationId: string): ExpeditionLocationProfile | null {
  return LOCATION_STORY_PROFILES[locationId] ?? null;
}

export function signatureSeenFlag(locationId: string): string {
  return `signature_seen:${locationId}`;
}

function buildingsMeet(state: GameState, required: ExpeditionStoryEvent['requiredBuildings']): boolean {
  if (!required) return true;
  return Object.entries(required).every(([id, level]) => state.buildings[id as BuildingId] >= (level ?? 0));
}

function flagsMeet(state: GameState, event: ExpeditionStoryEvent): boolean {
  if (event.requiredFlags?.some((flag) => !state.storyFlags.includes(flag))) return false;
  if (event.excludedFlags?.some((flag) => state.storyFlags.includes(flag))) return false;
  if (event.kind === 'rare' && state.storyFlags.includes(`expedition_event_seen:${event.id}`)) return false;
  return buildingsMeet(state, event.requiredBuildings);
}

export function eligibleExpeditionStories(state: GameState, locationId: string): ExpeditionStoryEvent[] {
  const profile = locationStoryProfile(locationId);
  if (!profile) return GENERIC_EVENTS;
  const signature = expeditionStoryEventById(profile.signatureEventId);
  if (signature && !state.storyFlags.includes(signatureSeenFlag(locationId)) && flagsMeet(state, signature)) return [signature];
  return EXPEDITION_STORY_EVENTS.filter((event) => {
    if (event.kind === 'signature') return false;
    if (event.kind !== 'generic' && !event.locationIds?.includes(locationId)) return false;
    return flagsMeet(state, event);
  });
}

export function drawExpeditionStory(state: GameState, locationId: string, riskScore: number): { event: ExpeditionStoryEvent; rngState: number } | null {
  const pool = eligibleExpeditionStories(state, locationId);
  if (!pool.length) return null;
  if (pool.length === 1 && pool[0].kind === 'signature') return { event: pool[0], rngState: state.rngState };
  const weighted = pool.flatMap((event) => {
    const riskWeight = Math.max(0, Math.floor(riskScore / 4) + event.riskBias);
    const weight = Math.max(1, (event.weight ?? 1) + riskWeight);
    return Array.from({ length: weight }, () => event);
  });
  const [value, rngState] = nextRandom(state.rngState);
  const event = weighted[Math.floor(value * weighted.length) % weighted.length];
  return { event, rngState };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mergeEffects(base: ExpeditionStoryEffect | undefined, extra: ExpeditionStoryEffect | undefined): ExpeditionStoryEffect {
  return {
    flags: [...(base?.flags ?? []), ...(extra?.flags ?? [])],
    inventory: { ...(base?.inventory ?? {}), ...(extra?.inventory ?? {}) },
    hope: (base?.hope ?? 0) + (extra?.hope ?? 0),
    defense: (base?.defense ?? 0) + (extra?.defense ?? 0),
    residentGain: (base?.residentGain ?? 0) + (extra?.residentGain ?? 0),
  };
}

function effectFor(event: ExpeditionStoryEvent, outcome: CheckOutcome): ExpeditionStoryEffect {
  if (outcome === 'critical') return mergeEffects(event.outcomes?.success, event.outcomes?.critical);
  return event.outcomes?.[outcome] ?? {};
}

export function applyExpeditionStoryOutcome(state: GameState, event: ExpeditionStoryEvent | null, outcome: CheckOutcome, locationId: string): GameState {
  if (!event) return state;
  const effect = effectFor(event, outcome);
  const flags = new Set(state.storyFlags);
  flags.add(`expedition_event_seen:${event.id}`);
  if (event.kind === 'signature') flags.add(signatureSeenFlag(locationId));
  for (const flag of effect.flags ?? []) flags.add(flag);

  let next: GameState = {
    ...state,
    storyFlags: [...flags],
    inventory: {
      ...state.inventory,
      ration: Math.max(0, state.inventory.ration + (effect.inventory?.ration ?? 0)),
      medicine: Math.max(0, state.inventory.medicine + (effect.inventory?.medicine ?? 0)),
      power: Math.max(0, state.inventory.power + (effect.inventory?.power ?? 0)),
      materials: Math.max(0, state.inventory.materials + (effect.inventory?.materials ?? 0)),
      parts: Math.max(0, state.inventory.parts + (effect.inventory?.parts ?? 0)),
    },
    hope: clamp(state.hope + (effect.hope ?? 0), 0, 100),
    defense: clamp(state.defense + (effect.defense ?? 0), 0, 100),
  };

  if ((effect.residentGain ?? 0) > 0) {
    const amount = Math.max(0, Math.floor(effect.residentGain ?? 0));
    next = rescueCommunityResidents({
      ...next,
      campaignStats: { ...next.campaignStats, rescued: next.campaignStats.rescued + amount },
    }, amount, 1);
  }
  return next;
}

export function locationRoleRiskReduction(state: GameState, partyIds: string[], locationId: string): number {
  const profile = locationStoryProfile(locationId);
  if (!profile) return 0;
  const roles = new Set(partyIds.map((id) => state.survivors.find((survivor) => survivor.id === id)?.specialty).filter(Boolean));
  return profile.preferredRoles.some((role) => roles.has(role)) ? 1 : 0;
}

export function expeditionStoryRoleNote(state: GameState, event: ExpeditionStoryEvent | null): string | null {
  if (!event?.preferredRoles?.length) return null;
  const partyRoles = new Set(state.expeditionState.activePartyIds.map((id) => state.survivors.find((survivor) => survivor.id === id)?.specialty).filter(Boolean));
  const active = event.preferredRoles.find((role) => partyRoles.has(role));
  if (!active) return `适合专长：${event.preferredRoles.join(' / ')}`;
  return `${active} 专长正在降低这次地点风险`;
}
