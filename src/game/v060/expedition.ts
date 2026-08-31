import { nextRandom } from '../rng';
import type { CheckOutcome, GameState, Survivor } from '../types';
import { isLocationUnlocked } from './campaignEvents';
import { markMissing, recordDeath } from './memorial';

export type ExpeditionRisk = 'safe' | 'cautious' | 'dangerous' | 'extreme';
export type ExpeditionResource = 'ration' | 'medicine' | 'materials' | 'parts';

export interface ExpeditionLocation {
  id: string;
  name: string;
  unlockDay: number;
  danger: 1 | 2 | 3 | 4 | 5;
  primary: ExpeditionResource;
  secondary: ExpeditionResource;
  description: string;
}

export interface ExpeditionEvent {
  id: string;
  title: string;
  body: string;
  riskBias: number;
  tags: string[];
}

export const EXPEDITION_LOCATIONS: ExpeditionLocation[] = [
  { id: 'convenience-store', name: '便利店', unlockDay: 1, danger: 1, primary: 'ration', secondary: 'materials', description: '卷帘门半开着，后仓也许还有东西。' },
  { id: 'west-pharmacy', name: '西街药店', unlockDay: 2, danger: 2, primary: 'medicine', secondary: 'ration', description: '玻璃门碎了一半，地下室一直没人确认过。' },
  { id: 'apartment-402', name: '废弃居民楼', unlockDay: 4, danger: 2, primary: 'ration', secondary: 'materials', description: '楼道狭窄，房间很多，也意味着退路很少。' },
  { id: 'auto-repair', name: '汽车修理店', unlockDay: 6, danger: 3, primary: 'parts', secondary: 'materials', description: '工具和零件很值钱，金属碰撞声也会传得很远。' },
  { id: 'school', name: '旧学校', unlockDay: 8, danger: 3, primary: 'materials', secondary: 'ration', description: '体育馆曾经是临时避难点，广播室可能还留着记录。' },
  { id: 'subway', name: '地铁入口', unlockDay: 11, danger: 4, primary: 'parts', secondary: 'medicine', description: '黑暗、潮湿，而且声音会沿隧道传很远。' },
  { id: 'gas-station', name: '加油站', unlockDay: 14, danger: 4, primary: 'parts', secondary: 'materials', description: '附近视野开阔，一旦被发现几乎没有掩体。' },
  { id: 'hospital', name: '医院', unlockDay: 17, danger: 5, primary: 'medicine', secondary: 'parts', description: '药很多。尸群也很多。这里是典型的“值不值得再赌一次”。' },
  { id: 'bus-station', name: '公交总站', unlockDay: 21, danger: 4, primary: 'materials', secondary: 'ration', description: '车辆残骸形成复杂通道，也可能藏着撤离路线。' },
  { id: 'warehouse', name: '北仓库', unlockDay: 24, danger: 5, primary: 'materials', secondary: 'parts', description: '最后几天仍值得冒险的地方之一，但已经靠近尸群迁移方向。' },
];

const EVENTS: ExpeditionEvent[] = [
  { id: 'blocked-stairs', title: '楼梯间被堵住了', body: '前面的脚步声越来越密。继续走可以拿到更多东西，但退路会被压缩。', riskBias: 1, tags: ['horde', 'indoor'] },
  { id: 'locked-room', title: '一扇上锁的门', body: '门后没有声音。锁很旧，但撬门会制造很大的动静。', riskBias: 0, tags: ['loot', 'noise'] },
  { id: 'survivor-call', title: '有人在里面求救', body: '声音很虚弱，也可能不是一个人。', riskBias: 1, tags: ['rescue', 'survivor'] },
  { id: 'collapsed-floor', title: '地板开始下沉', body: '裂缝一路延伸到承重墙，继续深入需要更轻、更快。', riskBias: 2, tags: ['injury', 'structure'] },
  { id: 'quiet-cache', title: '被遗漏的储物柜', body: '没有尸影，也没有声音。越安静的时候，越让人不敢相信运气。', riskBias: -1, tags: ['loot', 'quiet'] },
  { id: 'stray-horde', title: '尸群从侧街经过', body: '它们还没发现搜索队。现在决定的是继续等，还是趁空隙撤。', riskBias: 2, tags: ['horde', 'escape'] },
  { id: 'blood-trail', title: '新鲜的血迹', body: '痕迹向建筑深处延伸，时间不会超过几个小时。', riskBias: 1, tags: ['survivor', 'story'] },
  { id: 'roof-route', title: '屋顶之间有一条路', body: '路线更快，但跳跃距离不小。体力差的人会很吃亏。', riskBias: 1, tags: ['movement', 'route'] },
];

function aliveForExpedition(survivor: Survivor): boolean {
  return survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && survivor.condition !== 'serious';
}

export function locationForId(id: string): ExpeditionLocation | undefined {
  return EXPEDITION_LOCATIONS.find((location) => location.id === id);
}

export function availableExpeditionLocations(state: GameState): ExpeditionLocation[] {
  return EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
}

export function expeditionRiskScore(state: GameState, partyIds: string[], locationId: string): number {
  const location = locationForId(locationId);
  if (!location) return 99;
  let score = location.danger * 2;
  if (state.day >= 24) score += 2;
  else if (state.day >= 16) score += 1;
  if (partyIds.length === 1) score += 1;
  if (partyIds.length >= 2) score -= 1;
  score -= Math.min(2, Math.max(0, state.buildings.searchStation - 1));
  for (const id of partyIds) {
    const survivor = state.survivors.find((item) => item.id === id);
    if (!survivor) { score += 4; continue; }
    if (survivor.energy < 20) score += 3;
    else if (survivor.energy < 40) score += 2;
    else if (survivor.energy < 60) score += 1;
    if (survivor.condition === 'minor' || survivor.condition === 'fatigued') score += 1;
    if (survivor.specialty === 'search') score -= 1;
    if (survivor.specialty === 'watch' && partyIds.length > 1) score -= 1;
  }
  if (state.storyFlags.includes(`scouted:${locationId}`)) score -= 2;
  if (state.storyFlags.includes(`danger:${locationId}`)) score += 2;
  return Math.max(0, score);
}

export function expeditionRiskLabel(score: number): ExpeditionRisk {
  if (score <= 3) return 'safe';
  if (score <= 6) return 'cautious';
  if (score <= 9) return 'dangerous';
  return 'extreme';
}

export function canStartExpedition(state: GameState, partyIds: string[], locationId: string): { allowed: boolean; reason?: string } {
  const location = locationForId(locationId);
  if (!location) return { allowed: false, reason: '地点不存在' };
  if (state.day > 29) return { allowed: false, reason: '最终尸潮以后不再外出' };
  if (!state.dayState.assignmentsLocked) return { allowed: false, reason: '请先锁定今日调遣' };
  if (state.expeditionState.departed) return { allowed: false, reason: '搜索队已经在外面' };
  if (state.dayState.returnedExpeditions > 0) return { allowed: false, reason: '今天的搜索队已经执行过一次' };
  if (!isLocationUnlocked(state, locationId)) return { allowed: false, reason: '这片区域还没有被事件情报解锁' };
  if (partyIds.length < 1 || partyIds.length > 2) return { allowed: false, reason: '探索队必须是 1–2 人' };
  if (new Set(partyIds).size !== partyIds.length) return { allowed: false, reason: '同一个人不能重复派遣' };
  for (const id of partyIds) {
    const survivor = state.survivors.find((item) => item.id === id);
    if (!survivor || !aliveForExpedition(survivor)) return { allowed: false, reason: '队伍中有人无法外出' };
    if (state.dayState.committedSurvivorIds.includes(id)) return { allowed: false, reason: '人物今天已经执行过行动' };
    if (state.dayAssignments[id] !== 'expedition') return { allowed: false, reason: '人物没有被安排为探索岗位' };
  }
  return { allowed: true };
}

export function startExpedition(state: GameState, partyIds: string[], locationId: string): GameState {
  const validation = canStartExpedition(state, partyIds, locationId);
  if (!validation.allowed) return { ...state, lastMessage: validation.reason ?? '无法出发' };
  return {
    ...state,
    expeditionState: { activePartyIds: [...partyIds], locationId, eventId: null, departed: true },
    campaignStats: { ...state.campaignStats, expeditions: state.campaignStats.expeditions + 1 },
    lastMessage: `${partyIds.map((id) => state.survivors.find((item) => item.id === id)?.name ?? id).join('、')}出发前往${locationForId(locationId)?.name}`,
  };
}

export function drawExpeditionEvent(state: GameState): GameState {
  if (!state.expeditionState.departed || !state.expeditionState.locationId || state.expeditionState.eventId) return state;
  const risk = expeditionRiskScore(state, state.expeditionState.activePartyIds, state.expeditionState.locationId);
  const weighted = EVENTS.flatMap((event) => Array.from({ length: Math.max(1, 3 + event.riskBias + Math.floor(risk / 4)) }, () => event));
  const [value, rngState] = nextRandom(state.rngState);
  const event = weighted[Math.floor(value * weighted.length) % weighted.length];
  return { ...state, rngState, expeditionState: { ...state.expeditionState, eventId: event.id }, lastMessage: event.title };
}

export function currentExpeditionEvent(state: GameState): ExpeditionEvent | null {
  return EVENTS.find((event) => event.id === state.expeditionState.eventId) ?? null;
}

function advanceCondition(survivor: Survivor, severe: boolean): Survivor {
  if (survivor.condition === 'minor') return { ...survivor, condition: severe ? 'critical' : 'serious' };
  if (survivor.condition === 'fatigued') return { ...survivor, condition: severe ? 'serious' : 'minor' };
  return { ...survivor, condition: severe ? 'serious' : 'minor' };
}

function lootFor(state: GameState, multiplier: number): Partial<Record<ExpeditionResource, number>> {
  const location = state.expeditionState.locationId ? locationForId(state.expeditionState.locationId) : undefined;
  if (!location) return {};
  const base = Math.max(1, Math.round((2 + location.danger) * multiplier));
  return { [location.primary]: base, [location.secondary]: Math.max(1, Math.floor(base / 2)) };
}

function addLoot(state: GameState, loot: Partial<Record<ExpeditionResource, number>>): GameState {
  const inventory = { ...state.inventory };
  inventory.ration += loot.ration ?? 0;
  inventory.medicine += loot.medicine ?? 0;
  inventory.materials += loot.materials ?? 0;
  inventory.parts += loot.parts ?? 0;
  return { ...state, inventory };
}

export function retreatExpedition(state: GameState): GameState {
  if (!state.expeditionState.departed) return state;
  const partyIds = [...state.expeditionState.activePartyIds];
  const party = new Set(partyIds);
  const committedSurvivorIds = [...new Set([...state.dayState.committedSurvivorIds, ...partyIds])];
  return {
    ...state,
    survivors: state.survivors.map((survivor) => party.has(survivor.id) ? { ...survivor, energy: Math.max(0, survivor.energy - 6) } : survivor),
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
    dayState: { ...state.dayState, returnedExpeditions: state.dayState.returnedExpeditions + 1, committedSurvivorIds },
    lastMessage: '搜索队选择撤回 · 没有物资，但人回来了',
  };
}

export function resolveExpeditionOutcome(state: GameState, outcome: CheckOutcome, twist?: 'double-six' | 'double-one'): GameState {
  if (!state.expeditionState.departed || !state.expeditionState.locationId) return state;
  const partyIds = state.expeditionState.activePartyIds;
  const risk = expeditionRiskLabel(expeditionRiskScore(state, partyIds, state.expeditionState.locationId));
  const targetId = [...partyIds].sort((a, b) => (state.survivors.find((item) => item.id === a)?.energy ?? 100) - (state.survivors.find((item) => item.id === b)?.energy ?? 100))[0];
  let next: GameState = {
    ...state,
    survivors: state.survivors.map((survivor) => partyIds.includes(survivor.id) ? { ...survivor, energy: Math.max(0, survivor.energy - (outcome === 'failure' ? 18 : 10)) } : survivor),
  };
  let message = '搜索队回来了。';

  if (outcome === 'critical') { next = addLoot(next, lootFor(next, 1.7)); message = '搜索非常顺利 · 还发现了额外物资'; }
  else if (outcome === 'success') { next = addLoot(next, lootFor(next, 1)); message = '搜索队安全返回 · 物资已经入箱'; }
  else if (outcome === 'partial') {
    next = addLoot(next, lootFor(next, 0.55));
    next = { ...next, survivors: next.survivors.map((survivor) => survivor.id === targetId ? advanceCondition(survivor, false) : survivor) };
    message = '带回了一些东西，但有人受了伤';
  } else {
    const target = next.survivors.find((survivor) => survivor.id === targetId);
    const extreme = risk === 'extreme';
    const canDie = state.day >= 11 && extreme && twist === 'double-one' && Boolean(target && (target.energy < 45 || target.condition === 'minor' || target.condition === 'fatigued'));
    const canGoMissing = state.day >= 6 && (extreme || twist === 'double-one');
    if (canDie && target) {
      next = recordDeath(next, target.id, `探索 · ${locationForId(state.expeditionState.locationId)?.name ?? '未知地点'}`);
      message = `${target.name}没能回来`;
    } else if (canGoMissing && target) {
      next = markMissing(next, target.id, `探索 · ${locationForId(state.expeditionState.locationId)?.name ?? '未知地点'}`);
      message = `${target.name}失踪了`;
    } else {
      next = { ...next, survivors: next.survivors.map((survivor) => survivor.id === targetId ? advanceCondition(survivor, true) : survivor) };
      message = '搜索队狼狈撤回 · 有人伤得很重';
    }
  }

  const locationFlag = `visited:${state.expeditionState.locationId}`;
  const firstVisit = !next.storyFlags.includes(locationFlag);
  const committedSurvivorIds = [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])];
  return {
    ...next,
    storyFlags: firstVisit ? [...next.storyFlags, locationFlag] : next.storyFlags,
    campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + (firstVisit ? 1 : 0) },
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
    dayState: { ...next.dayState, returnedExpeditions: next.dayState.returnedExpeditions + 1, committedSurvivorIds },
    lastMessage: message,
  };
}
