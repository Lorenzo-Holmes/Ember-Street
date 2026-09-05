import { nextRandom } from '../rng';
import type { CheckOutcome, GameState, Survivor } from '../types';
import { isLocationUnlocked } from './campaignEvents';
import { locationMemory, locationMemoryRiskModifier, rememberLocationLoot } from './locationMemory';
import { markMissing, recordDeath } from './memorial';
import { applyInjuryTrustLoss, specialtyAvailable, trustCheckModifier } from './trust';
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

function hasPrinciple(state: GameState, id: string): boolean {
  return Boolean(state.socialState?.principles?.includes(id as never));
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
  score -= Math.max(0, partyIds.length - 1);
  score -= Math.min(2, Math.max(0, state.buildings.searchStation - 1));
  for (const id of partyIds) {
    const survivor = state.survivors.find((item) => item.id === id);
    if (!survivor) { score += 4; continue; }
    if (survivor.energy < 20) score += 3;
    else if (survivor.energy < 40) score += 2;
    else if (survivor.energy < 60) score += 1;
    if (survivor.condition === 'minor' || survivor.condition === 'fatigued') score += 1;
    if (survivor.specialty === 'search' && specialtyAvailable(survivor)) score -= 1;
    if (survivor.specialty === 'watch' && partyIds.length > 1 && specialtyAvailable(survivor)) score -= 1;
    score += Math.max(0, -trustCheckModifier(survivor));
  }
  score += locationMemoryRiskModifier(state, locationId);
  if (locationId === 'convenience-store' && state.storyFlags.includes('convenience_backdoor_known')) score -= 1;
  if (locationId === 'subway' && state.storyFlags.includes('subway_maintenance_map')) score -= 1;
  if (locationId === 'hospital' && state.storyFlags.includes('hospital_route_observed')) score -= 1;
  if (hasPrinciple(state, 'outward-search')) score += 1;
  return Math.max(0, score);
}

export function expeditionRiskLabel(score: number): ExpeditionRisk {
  if (score <= 3) return 'safe';
  if (score <= 6) return 'cautious';
  if (score <= 9) return 'dangerous';
  return 'extreme';
}

export function canStartExpedition(state: GameState, partyIds: string[], locationId: string, planned = false): { allowed: boolean; reason?: string } {
  const location = locationForId(locationId);
  if (!location) return { allowed: false, reason: '这条路没有记在地图上' };
  if (state.day > 29) return { allowed: false, reason: '最后一夜以后，没人再往街外走' };
  if (!state.dayState.assignmentsLocked) return { allowed: false, reason: '先把今天的人手定下来' };
  if (state.expeditionState.departed) return { allowed: false, reason: '出去的人还没回来' };
  if (!planned && state.dayState.returnedExpeditions > 0) return { allowed: false, reason: '今天已经有人走过一趟了' };
  if (!isLocationUnlocked(state, locationId)) return { allowed: false, reason: '还没人确认这条路能走' };
  if (partyIds.length < 1) return { allowed: false, reason: '至少得有一个人出去' };
  if (new Set(partyIds).size !== partyIds.length) return { allowed: false, reason: '名单里有人写重了' };
  for (const id of partyIds) {
    const survivor = state.survivors.find((item) => item.id === id);
    if (!survivor || !aliveForExpedition(survivor)) return { allowed: false, reason: '名单里有人今天走不了远路' };
    if (state.dayState.committedSurvivorIds.includes(id)) return { allowed: false, reason: '名单里有人今天已经出去过' };
    if (state.dayAssignments[id] !== 'expedition') return { allowed: false, reason: '名单里有人没有被派去街外' };
  }
  return { allowed: true };
}

export function startExpedition(state: GameState, partyIds: string[], locationId: string, planned = false): GameState {
  const validation = canStartExpedition(state, partyIds, locationId, planned);
  if (!validation.allowed) return { ...state, lastMessage: validation.reason ?? '今天走不了这条路' };
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
    lastMessage: `${partyIds.map((id) => state.survivors.find((item) => item.id === id)?.name ?? id).join('、')}已经往${locationForId(locationId)?.name}去了。`,
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
    return { ...state, expeditionState: { ...state.expeditionState, eventId: signature.id }, lastMessage: `第一次走到这里：${signature.title}` };
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
  const locationId = state.expeditionState.locationId;
  const location = locationId ? locationForId(locationId) : undefined;
  if (!location || !locationId) return {};
  const partyMultiplier = expeditionPartyLootMultiplier(state.expeditionState.activePartyIds.length);
  const fullBase = Math.max(1, Math.round((2 + location.danger) * multiplier * partyMultiplier));
  const base = locationMemory(state, locationId).depleted ? Math.max(1, Math.floor(fullBase * 0.5)) : fullBase;
  const principleDelta = (hasPrinciple(state, 'outward-search') ? 1 : 0) - (hasPrinciple(state, 'preserve-strength') ? 1 : 0);
  const loot: Partial<Record<ExpeditionResource, number>> = {
    [location.primary]: Math.max(1, base + principleDelta),
    [location.secondary]: Math.max(1, Math.floor(base / 2)),
  };
  if (location.tertiary) loot[location.tertiary] = Math.max(1, Math.floor(base / 3));
  return loot;
}

export function expeditionPartyLootMultiplier(partySize: number): number {
  if (partySize <= 1) return 1;
  if (partySize === 2) return 1.4;
  if (partySize === 3) return 1.7;
  if (partySize === 4) return 1.9;
  if (partySize === 5) return 2.05;
  return 2.15;
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
    lastMessage: '他们空手回来了。至少人都在。',
  };
}

export function resolveExpeditionOutcome(state: GameState, outcome: CheckOutcome, twist?: 'double-six' | 'double-one'): GameState {
  if (!state.expeditionState.departed || !state.expeditionState.locationId) return state;
  const locationId = state.expeditionState.locationId;
  const partyIds = state.expeditionState.activePartyIds;
  const risk = expeditionRiskLabel(expeditionRiskScore(state, partyIds, locationId));
  const targetId = [...partyIds].sort((a, b) => (state.survivors.find((item) => item.id === a)?.energy ?? 100) - (state.survivors.find((item) => item.id === b)?.energy ?? 100))[0];
  let next: GameState = {
    ...state,
    survivors: state.survivors.map((survivor) => partyIds.includes(survivor.id) ? { ...survivor, energy: Math.max(0, survivor.energy - (outcome === 'failure' ? 18 : 10)) } : survivor),
  };
  let message = '搜索队回来了。';

  if (outcome === 'critical') { next = addLoot(next, lootFor(next, 1.7)); message = '他们带回来的东西比预计更多。'; }
  else if (outcome === 'success') { next = addLoot(next, lootFor(next, 1)); message = '人平安回来了，找到的东西已经收进仓房。'; }
  else if (outcome === 'partial') {
    next = addLoot(next, lootFor(next, 0.55));
    next = { ...next, survivors: next.survivors.map((survivor) => survivor.id === targetId ? advanceCondition(survivor, false) : survivor) };
    message = '东西带回来了，但有人受了伤。';
  } else {
    const target = next.survivors.find((survivor) => survivor.id === targetId);
    const extreme = risk === 'extreme';
    const canDie = state.day >= 11 && extreme && twist === 'double-one' && Boolean(target && (target.energy < 45 || target.condition === 'minor' || target.condition === 'fatigued'));
    const canGoMissing = state.day >= 6 && (extreme || twist === 'double-one');
    if (canDie && target) {
      next = recordDeath(next, target.id, `探索 · ${locationForId(locationId)?.name ?? '未知地点'}`);
      message = `${target.name}没能回来。`;
    } else if (canGoMissing && target) {
      next = markMissing(next, target.id, `探索 · ${locationForId(locationId)?.name ?? '未知地点'}`);
      message = `${target.name}没有回来，也没人知道去了哪里。`;
    } else {
      next = { ...next, survivors: next.survivors.map((survivor) => survivor.id === targetId ? advanceCondition(survivor, true) : survivor) };
      message = '他们勉强撤了回来。有人伤得很重。';
    }
  }

  const locationFlag = `visited:${locationId}`;
  next = applyInjuryTrustLoss(state, next, targetId ? [targetId] : [], `expedition:${state.day}:${locationId}:${state.expeditionState.eventId ?? 'street'}`);
  if (outcome !== 'failure') next = rememberLocationLoot(next, locationId);
  const firstVisit = !next.storyFlags.includes(locationFlag);
  const committedSurvivorIds = [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])];
  return {
    ...next,
    phase: 'dusk',
    storyFlags: firstVisit ? [...next.storyFlags, locationFlag] : next.storyFlags,
    campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered + (firstVisit ? 1 : 0) },
    expeditionState: { activePartyIds: [], locationId: null, eventId: null, departed: false },
    dayState: { ...next.dayState, assignmentsLocked: true, returnedExpeditions: next.dayState.returnedExpeditions + 1, committedSurvivorIds },
    lastMessage: message,
  };
}
