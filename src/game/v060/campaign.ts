import { createDefaultCampaignStats, createDefaultDayState, createDefaultExpeditionState, createDefaultMealState, createDefaultNightState, normalizeSurvivor } from '../foundation';
import { SURVIVOR_ROSTER, forecastFor } from '../progression';
import { nextRandom, normalizeSeed } from '../rng';
import type { CheckOutcome, FinalHordeResult, GameState, Survivor, SurvivorCondition } from '../types';
import { advanceCommunityDay, communityMedicalSupport, communityRepairSupport, createDefaultCommunityState, normalizeCommunityState, rescueCommunityResidents } from './community';
import {
  evaluatePromiseProgress,
  fulfillPromiseForMeal,
  fulfillPromiseForMedicalAssignment,
  fulfillPromiseForSearch,
  settlePromiseDeadline,
} from './communityPromises';
import { lockDayAssignments, survivorAvailableForDay, unlockNextDayAssignments } from './dayManagement';
import { currentExpeditionEvent, expeditionRiskLabel, expeditionRiskScore, locationForId, resolveExpeditionOutcome, retreatExpedition } from './expedition';
import { applyExpeditionStoryOutcome, expeditionSpecialtyBonus } from './expeditionStories';
import { resolveMeal } from './food';
import { resolveEnding } from './endings';
import { recordDeath, recoverMissing } from './memorial';
import { advanceUntreatedRisk, clearUntreatedRisk, queueLowHopeDeparture } from './mortality';
import { hasPrinciple } from './principles';
import { applyDailySocialPressure, applyMealPressure, createDefaultSocialState, normalizeSocialState } from './socialPressure';

const STARTERS = ['lin-xia', 'zhou', 'ahe'];
const JOIN_DAYS: Record<number, string> = { 6: 'cheng', 12: 'aliang', 18: 'xiaoman' };
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function rosterMember(id: string): Survivor | null {
  const source = SURVIVOR_ROSTER.find((item) => item.id === id);
  return source ? normalizeSurvivor({ ...source }) : null;
}

function starterRoster(): Survivor[] {
  return STARTERS.map(rosterMember).filter((item): item is Survivor => Boolean(item));
}

export function createV060InitialState(seed = Date.now()): GameState {
  const normalized = normalizeSeed(seed);
  return {
    version: 3,
    seed: normalized,
    rngState: normalized,
    phase: 'street',
    day: 1,
    inventory: { ration: 12, medicine: 3, power: 62, materials: 12, parts: 5 },
    storyItems: [],
    storyFlags: ['v060_started'],
    mainLightStage: 1,
    civilianResidents: 0,
    communityState: createDefaultCommunityState(),
    socialState: createDefaultSocialState(),
    dayAssignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    mealState: createDefaultMealState(),
    nightState: createDefaultNightState(),
    campaignStats: createDefaultCampaignStats(),
    memorials: [],
    ending: null,
    hope: 20,
    defense: 55,
    survivors: starterRoster(),
    buildings: { searchStation: 1, workshop: 0, clinic: 0, watchPost: 0, shelter: 1, radio: 0 },
    forecast: forecastFor(1),
    chapterComplete: false,
    pendingCheck: null,
    lastMessage: 'DAY 1 · 白天决定风险，晚上承担风险。',
  };
}

export function upgradeSaveToV060(input: GameState): GameState {
  if (input.storyFlags.includes('v060_started')) return {
    ...input,
    communityState: normalizeCommunityState(input.communityState, input.civilianResidents),
    socialState: normalizeSocialState(input.socialState),
    survivors: input.survivors.map(normalizeSurvivor),
  };
  const survivors = input.survivors.length ? input.survivors.map(normalizeSurvivor) : starterRoster();
  return {
    ...input,
    phase: input.day >= 30 ? 'ending' : 'street',
    survivors,
    buildings: {
      searchStation: Math.max(1, Math.min(3, input.buildings.searchStation)),
      shelter: Math.max(1, Math.min(3, input.buildings.shelter)),
      workshop: Math.min(3, input.buildings.workshop), clinic: Math.min(3, input.buildings.clinic),
      watchPost: Math.min(3, input.buildings.watchPost), radio: Math.min(3, input.buildings.radio),
    },
    communityState: normalizeCommunityState(input.communityState, input.civilianResidents),
    socialState: normalizeSocialState(input.socialState),
    dayAssignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    nightState: createDefaultNightState(),
    pendingCheck: null,
    storyFlags: [...new Set([...input.storyFlags, 'v060_started'])],
    lastMessage: '存档已迁移到 v0.6 · 七格物资已并入街区库存。',
  };
}

function spendEnergyForJobs(state: GameState): GameState {
  const cost: Record<string, number> = { expedition: 0, repair: 9, medical: 7, watch: 9, radio: 7, cook: 8, rest: -24 };
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      if (survivor.condition === 'dead' || survivor.condition === 'missing') return survivor;
      const job = state.dayAssignments[survivor.id] ?? 'rest';
      const preserveRestBonus = job === 'rest' && hasPrinciple(state, 'preserve-strength') ? 6 : 0;
      const energy = clamp(survivor.energy - (cost[job] ?? 0) + preserveRestBonus);
      let condition = survivor.condition;
      if (job === 'rest' && condition === 'fatigued' && energy >= 55) condition = 'healthy';
      if (job !== 'rest' && energy < 25 && condition === 'healthy') condition = 'fatigued';
      return { ...survivor, energy, condition };
    }),
  };
}

function medicalStep(condition: SurvivorCondition | undefined): SurvivorCondition {
  if (condition === 'critical') return 'serious';
  if (condition === 'serious') return 'minor';
  if (condition === 'minor' || condition === 'fatigued') return 'healthy';
  return condition ?? 'healthy';
}

function resolveMedicalWork(state: GameState): GameState {
  if (state.buildings.clinic <= 0) return state;
  const workers = state.survivors.filter((s) => state.dayAssignments[s.id] === 'medical' && s.condition !== 'dead' && s.condition !== 'missing').length;
  const communityCapacity = communityMedicalSupport(state);
  if (!workers && !communityCapacity) return state;
  const severity: Record<string, number> = { critical: 4, serious: 3, minor: 2, fatigued: 1, healthy: 0 };
  const candidates = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing' && (severity[s.condition ?? 'healthy'] ?? 0) > 0)
    .sort((a, b) => (severity[b.condition ?? 'healthy'] ?? 0) - (severity[a.condition ?? 'healthy'] ?? 0));
  let medicine = state.inventory.medicine;
  const treated = new Set<string>();
  const maxTreat = Math.min(workers, state.buildings.clinic >= 3 ? 2 : 1);
  for (const survivor of candidates.slice(0, maxTreat)) {
    if (medicine <= 0 && (survivor.condition === 'serious' || survivor.condition === 'critical')) continue;
    if (survivor.condition === 'serious' || survivor.condition === 'critical') medicine -= 1;
    treated.add(survivor.id);
  }
  const lightCandidates = candidates.filter((s) => !treated.has(s.id) && (s.condition === 'minor' || s.condition === 'fatigued')).slice(0, communityCapacity);
  for (const survivor of lightCandidates) treated.add(survivor.id);
  if (!treated.size) return state;
  const treatedState: GameState = {
    ...state,
    inventory: { ...state.inventory, medicine },
    survivors: state.survivors.map((s) => treated.has(s.id) ? { ...s, condition: medicalStep(s.condition) } : s),
  };
  return clearUntreatedRisk(treatedState, treated);
}

function resolveRadioWork(state: GameState): GameState {
  const staffed = state.survivors.some((s) => state.dayAssignments[s.id] === 'radio' && s.condition !== 'dead' && s.condition !== 'missing');
  if (!staffed || state.buildings.radio <= 0) return state;
  const flags = new Set(state.storyFlags);
  flags.add(`radio_contact_day:${state.day}`);
  const radioDays = [...flags].filter((value) => value.startsWith('radio_contact_day:')).length;
  if (state.buildings.radio >= 2 && radioDays >= 2) flags.add('external_contact');
  if (state.buildings.radio >= 3 && radioDays >= 4) flags.add('military_contact');
  let next: GameState = { ...state, storyFlags: [...flags] };
  if (state.buildings.radio >= 2 && radioDays % 3 === 0 && !flags.has(`radio_rescue:${state.day}`)) {
    flags.add(`radio_rescue:${state.day}`);
    next = rescueCommunityResidents({ ...next, storyFlags: [...flags], campaignStats: { ...state.campaignStats, rescued: state.campaignStats.rescued + 1 } }, 1, 1);
  }
  const aidFlag = `await_aid_hope:${state.day}`;
  const contactEstablished = next.storyFlags.includes('external_contact') || next.storyFlags.includes('military_contact');
  if (hasPrinciple(next, 'await-aid') && contactEstablished && !next.storyFlags.includes(aidFlag)) {
    next = {
      ...next,
      hope: clamp(next.hope + 1),
      storyFlags: [...new Set([...next.storyFlags, aidFlag])],
      dawnBrief: [...(next.dawnBrief ?? []), '街区原则《等待外援》：广播仍与外界保持联系，希望 +1。'],
    };
  }
  return next;
}

export function finalizeDay(state: GameState): GameState {
  if (state.expeditionState.departed) return { ...state, lastMessage: '搜索队还没有回来。' };
  let next = state.dayState.assignmentsLocked ? state : lockDayAssignments(state);
  next = spendEnergyForJobs(next);
  const watch = Object.values(next.dayAssignments).filter((job) => job === 'watch').length;
  const repair = Object.values(next.dayAssignments).filter((job) => job === 'repair').length;
  next = { ...next, defense: clamp(next.defense + watch * 4 + repair * 2 + communityRepairSupport(next)) };
  next = evaluatePromiseProgress(next);
  next = resolveMedicalWork(next);
  next = fulfillPromiseForMedicalAssignment(next);
  next = resolveRadioWork(next);
  next = resolveMeal(next);
  next = applyMealPressure(next);
  next = fulfillPromiseForMeal(next);
  next = applyDailySocialPressure(next);
  next = evaluatePromiseProgress(next);
  next = advanceUntreatedRisk(next);
  return { ...next, phase: 'night', nightState: createDefaultNightState(), pendingCheck: null, lastMessage: `NIGHT ${next.day} · 今日岗位已经锁定。` };
}

function addBonusLoot(state: GameState, amount: number): GameState {
  const location = state.expeditionState.locationId ? locationForId(state.expeditionState.locationId) : undefined;
  if (!location || amount <= 0) return state;
  return { ...state, inventory: { ...state.inventory, [location.primary]: state.inventory[location.primary] + amount } };
}

export type ExpeditionStance = 'push' | 'careful';

export function resolveExpeditionStance(state: GameState, stance: ExpeditionStance): GameState {
  if (!state.expeditionState.departed) return state;
  let rngState = state.rngState;
  const [a, nextA] = nextRandom(rngState); rngState = nextA;
  const [b, nextB] = nextRandom(rngState); rngState = nextB;
  const dice = [Math.floor(a * 6) + 1, Math.floor(b * 6) + 1];
  const risk = expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, state.expeditionState.locationId ?? ''));
  const riskModifier = risk === 'safe' ? 2 : risk === 'cautious' ? 1 : risk === 'dangerous' ? 0 : -1;
  const mealModifier = state.mealState.wellFed ? 1 : 0;
  const stanceModifier = stance === 'careful' ? 1 : -1;
  const event = currentExpeditionEvent(state);
  const specialtyModifier = expeditionSpecialtyBonus(state, event);
  const total = dice[0] + dice[1] + riskModifier + mealModifier + stanceModifier + specialtyModifier;
  const twist = dice[0] === 6 && dice[1] === 6 ? 'double-six' : dice[0] === 1 && dice[1] === 1 ? 'double-one' : undefined;
  const outcome: CheckOutcome = twist === 'double-one' ? 'failure' : twist === 'double-six' ? 'critical' : total <= 6 ? 'failure' : total <= 9 ? 'partial' : total <= 11 ? 'success' : 'critical';
  let withStory = applyExpeditionStoryOutcome({ ...state, rngState }, event, outcome);
  if (stance === 'push' && (outcome === 'success' || outcome === 'critical')) withStory = addBonusLoot(withStory, 2);
  const next = resolveExpeditionOutcome(withStory, outcome, twist);
  const specialtyText = specialtyModifier ? ' · 专长 +1' : '';
  return { ...next, lastMessage: `${next.lastMessage} · 2D6 ${dice.join('+')} = ${total}${specialtyText}` };
}

export function retreatCurrentExpedition(state: GameState): GameState { return retreatExpedition(state); }

export type MissingSearchMethod = 'team' | 'radio';

export function searchForMissing(state: GameState, survivorId: string, method: MissingSearchMethod): GameState {
  const missing = state.survivors.find((item) => item.id === survivorId && item.condition === 'missing');
  if (!missing || state.dayState.assignmentsLocked || !['street', 'assignment'].includes(state.phase)) return state;
  const attemptFlag = `missing_search:${survivorId}:${state.day}`;
  if (state.storyFlags.includes(attemptFlag)) return { ...state, lastMessage: '今天已经寻找过一次。' };

  let next = state;
  let modifier = 0;
  if (method === 'team') {
    const helpers = state.survivors.filter((s) => s.id !== survivorId && survivorAvailableForDay(s) && !state.dayState.committedSurvivorIds.includes(s.id))
      .sort((a, b) => b.energy - a.energy).slice(0, 2);
    if (helpers.length < 2) return { ...state, lastMessage: '至少需要两名可行动的人去寻找失踪者。' };
    modifier = state.buildings.searchStation + helpers.filter((s) => s.specialty === 'search' || s.specialty === 'watch').length;
    const helperIds = helpers.map((s) => s.id);
    next = {
      ...state,
      survivors: state.survivors.map((s) => helperIds.includes(s.id) ? { ...s, energy: Math.max(0, s.energy - 12) } : s),
      dayState: { ...state.dayState, committedSurvivorIds: [...state.dayState.committedSurvivorIds, ...helperIds] },
    };
  } else {
    if (state.buildings.radio <= 0 || state.inventory.power < 5) return { ...state, lastMessage: '广播搜救需要广播亭和 5 点电力。' };
    modifier = Math.max(0, state.buildings.radio - 1);
    next = { ...state, inventory: { ...state.inventory, power: state.inventory.power - 5 } };
  }

  next = fulfillPromiseForSearch(next, survivorId);

  let rngState = next.rngState;
  const [a, n1] = nextRandom(rngState); rngState = n1;
  const [b, n2] = nextRandom(rngState); rngState = n2;
  const dice = [Math.floor(a * 6) + 1, Math.floor(b * 6) + 1];
  const total = dice[0] + dice[1] + modifier;
  const flags = [...new Set([...next.storyFlags, attemptFlag])];
  next = { ...next, rngState, storyFlags: flags };
  if (total >= 8) {
    const recovered = recoverMissing(next, survivorId, total >= 11 ? 'minor' : 'serious');
    return { ...recovered, lastMessage: `${missing.name}被找回来了 · 搜救 2D6 ${dice.join('+')} +${modifier} = ${total}` };
  }

  const previousFailures = next.storyFlags.filter((value) => value.startsWith(`missing_search_failed:${survivorId}:`)).length;
  next = { ...next, storyFlags: [...next.storyFlags, `missing_search_failed:${survivorId}:${state.day}`] };
  if (previousFailures >= 1) return recordDeath(next, survivorId, '失踪后搜救失败');
  return { ...next, lastMessage: `没有找到${missing.name} · 搜救 2D6 ${dice.join('+')} +${modifier} = ${total}` };
}

export function finalHordeResultFor(state: GameState): FinalHordeResult {
  const coreAlive = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
  const severe = state.survivors.filter((s) => s.condition === 'critical' || s.condition === 'serious').length;
  const routeKnown = ['evacuation_route_known', 'subway_exit_known', 'southern_route_known'].some((flag) => state.storyFlags.includes(flag));
  const principleBonus = (hasPrinciple(state, 'hold-the-street') ? 6 : 0) + (hasPrinciple(state, 'prepare-evacuation') && routeKnown ? 4 : 0);
  const effectiveDefense = clamp(state.defense + (state.storyFlags.includes('final_horde_supplies') ? 8 : 0) + principleBonus);
  if (effectiveDefense >= 78 && state.hope >= 55 && severe === 0 && coreAlive >= 4) return 'perfect';
  if (effectiveDefense >= 52 && state.hope >= 30 && coreAlive >= 3) return 'held';
  if (effectiveDefense >= 24 && coreAlive >= 2) return 'damaged';
  return 'breached';
}

function recruitForDay(state: GameState, day: number): GameState {
  const id = JOIN_DAYS[day];
  if (!id || state.survivors.some((s) => s.id === id)) return state;
  const member = rosterMember(id);
  return member ? { ...state, survivors: [...state.survivors, member], hope: clamp(state.hope + 3), lastMessage: `${member.name}加入了余烬长街。` } : state;
}

export function advanceCampaignDay(input: GameState): GameState {
  const state = settlePromiseDeadline(input);
  if (state.day >= 29) {
    const finalHordeResult = finalHordeResultFor(state);
    const endingState: GameState = { ...state, day: 30, finalHordeResult, phase: 'ending', chapterComplete: true, nightState: createDefaultNightState(0), pendingCheck: null };
    const ending = resolveEnding(endingState);
    return { ...endingState, ending, lastMessage: `DAY 30 · ${ending.title}` };
  }
  const day = state.day + 1;
  let next: GameState = {
    ...state,
    socialState: normalizeSocialState(state.socialState),
    day,
    phase: 'street',
    forecast: forecastFor(day),
    dayAssignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    nightState: createDefaultNightState(),
    pendingCheck: null,
    lastMessage: `DAY ${day} · 新的一天开始了。`,
  };
  next = unlockNextDayAssignments(next);
  next = advanceCommunityDay(next);
  next = queueLowHopeDeparture(next);
  return recruitForDay(next, day);
}
