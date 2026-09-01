import { nextRandom } from '../rng';
import type { CheckOutcome, GameState, Survivor } from '../types';
import { isLocationUnlocked } from './campaignEvents';
import { locationMemoryRiskModifier } from './locationMemory';
import { markMissing, recordDeath } from './memorial';
import {
  EXPEDITION_LOCATIONS,
  expeditionEventById,
  expeditionLocationForId,
  genericEventsForLocation,
  localEventsForLocation,
  signatureEventForLocation,
  type ExpeditionEvent,
  type ExpeditionLocation,
  type ExpeditionResource,
} from './expeditionStories';

export { isLocationUnlocked, EXPEDITION_LOCATIONS };
export type { ExpeditionEvent, ExpeditionLocation, ExpeditionResource };

export type ExpeditionRisk = 'safe' | 'cautious' | 'dangerous' | 'extreme';

function aliveForExpedition(survivor: Survivor): boolean {
  return survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && survivor.condition !== 'serious';
}

export function locationForId(id: string): ExpeditionLocation | undefined {
  return expeditionLocationForId(id);
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
  score += locationMemoryRiskModifier(state, locationId);
  if (locationId === 'convenience-store' && state.storyFlags.includes('convenience_backdoor_known')) score -= 1;
  if (locationId === 'subway' && state.storyFlags.includes('subway_maintenance_map')) score -= 1;
  if (locationId === 'hospital' && state.storyFlags.includes('hospital_route_observed')) score -= 1;
  if (state.socialState?.principles?.includes('outward-search')) score += 1;
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
  if (!state.dayState.assignmentsLocked) return { allowed: false, reason: '请先锁定今日派遣' };
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
    phase: 'street',
    expeditionState: { activePartyIds: [...partyIds], locationId, eventId: null, departed: true },
    dayState: {
      ...state.dayState,
      assignmentsLocked: true,
      committedSurvivorIds: [...new Set([...state.dayState.committedSurvivorIds, ...partyIds])],
    },
    campaignStats: { ...state.campaignStats, expeditions: state.campaignStats.expeditions + 1 },
    lastMessage: `${partyIds.map((id) => state.survivors.find((item) => item.id === id)?.name ?? id).join('、')}出发前往${locationForId(locationId)?.name}`,
  };
}

function weightedPick(events: ExpeditionEvent[], value: number, risk: number): ExpeditionEvent | undefined {
  if (!events.length) return undefined;
  const weights = events.map((event) => Math.max(1, Math.round((event.weight ?? 1) * 10 + Math.max(0, event.riskBias) * Math.floor(risk / 3))));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = value * total;
  for (let index = 0; index < events.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return events[index];
  }
  return events[events.length - 1];
}

export function drawExpeditionEvent(state: GameState): GameState {
  if (!state.expeditionState.departed || !state.expeditionState.locationId || state.expeditionState.eventId) return state;
  const locationId = state.expeditionState.locationId;
  const signature = signatureEventForLocation(state, locationId);
  if (signature) {
    return { ...state, expeditionState: { ...state.expeditionState, eventId: signature.id }, lastMessage: `${signature.title} · 首次地点事件` };
  }

  const risk = expeditionRiskScore(state, state.expeditionState.activePartyIds, locationId);
  const local = localEventsForLocation(state, locationId);
  const generic = genericEventsForLocation(state, locationId);
  let rngState = state.rngState;
  const [bucket, nextBucket] = nextRandom(rngState); rngState = nextBucket;
  const preferLocal = bucket < 0.7;
  const pool = preferLocal && local.length ? local : generic.length ? generic : local;
  const [choice, nextChoice] = nextRandom(rngState); rngState = nextChoice;
  const event = weightedPick(pool, choice, risk);
  if (!event) return { ...state, rngState, lastMessage: '这里暂时没有新的发现。' };
  return { ...state, rngState, expeditionState: { ...state.expeditionState, eventId: event.id }, lastMessage: event.title };
}

export function currentExpeditionEvent(state: GameState): ExpeditionEvent | null {
  return expeditionEventById(state.expeditionState.eventId) ?? null;
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
  const principleDelta = (state.socialState?.principles?.includes('outward-search') ? 1 : 0)
    - (state.socialState?.principles?.includes('preserve-strength') ? 1 : 0);
  return {
    [location.primary]: Math.max(1, base + principleDelta),
    [location.secondary]: Math.max(1, Math.floor(base / 2)),
  };
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
    phase: 'dusk',
    survivors: state.survivors.map((survivor) => party.has(survivor.id) ? { ...survivor, energy: Math.max(0, survivor.energy - 6) } : survivor),
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
    dayState: { ...state.dayState, assignmentsLocked: true, returnedExpeditions: state.dayState.returnedExpeditions + 1, committedSurvivorIds },
    lastMessage: '搜索队选择撤回 · 没有物资，但人回来了 · 进入黄昏',
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
    phase: 'dusk',
    storyFlags: firstVisit ? [...next.storyFlags, locationFlag] : next.storyFlags,
    campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + (firstVisit ? 1 : 0) },
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
    dayState: { ...next.dayState, assignmentsLocked: true, returnedExpeditions: next.dayState.returnedExpeditions + 1, committedSurvivorIds },
    lastMessage: `${message} · 进入黄昏`,
  };
}
