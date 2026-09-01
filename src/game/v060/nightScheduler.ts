import { HORDE_MILESTONE_DAYS } from '../config';
import { createPendingCheck } from '../dice';
import { nextRandom } from '../rng';
import type { BuildingId, CheckModifier, CheckOutcome, GameState, Role, Survivor, SurvivorCondition } from '../types';
import { nightEventWeight } from './causalNight';
import { communityDefenseSupport, communitySupportSummary } from './community';
import {
  FINAL_HORDE_EVENT_IDS,
  applyFinalHordeResolution,
  effectiveFinalHordeChoice,
  finalHordeCheckModifiers,
  finalHordeEventById,
  isFinalHordeEventId,
} from './finalHorde';
import { markMissing, recordDeath } from './memorial';
import { advanceUntreatedRisk, clearUntreatedRisk, loseCommunityResidents } from './mortality';
import { mortalityEventById, pendingMortalityEventIds } from './mortalityEvents';
import { appendDawnBrief } from './morningBrief';
import { EMERGENCY_EVENTS, HORDE_EVENTS, NORMAL_NIGHT_EVENTS, nightEventById, type NightChoice, type NightEffect, type V060NightEvent } from './nightEvents';

const ROLE_ASSIGNMENT: Partial<Record<Role, string>> = { search: 'expedition', repair: 'repair', medical: 'medical', watch: 'watch', cook: 'cook', radio: 'radio', rest: 'rest' };
const ROLE_BUILDING: Partial<Record<Role, BuildingId>> = { search: 'searchStation', repair: 'workshop', medical: 'clinic', watch: 'watchPost', radio: 'radio', rest: 'shelter' };
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const playable = (survivor: Survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing';

function drawIndex(rngState: number, size: number): [number, number] {
  const [value, next] = nextRandom(rngState);
  return [Math.min(size - 1, Math.floor(value * size)), next];
}

function pickWithoutReplacement<T>(pool: T[], count: number, rngState: number): [T[], number] {
  const available = [...pool]; const selected: T[] = []; let nextState = rngState;
  while (available.length && selected.length < count) {
    const [index, next] = drawIndex(nextState, available.length); nextState = next; selected.push(available.splice(index, 1)[0]);
  }
  return [selected, nextState];
}

function pickWeightedWithoutReplacement(pool: V060NightEvent[], count: number, rngState: number, state: GameState): [V060NightEvent[], number] {
  const available = [...pool]; const selected: V060NightEvent[] = []; let nextState = rngState;
  while (available.length && selected.length < count) {
    const weights = available.map((event) => Math.max(1, nightEventWeight(state, event)));
    const total = weights.reduce((sum, value) => sum + value, 0);
    const [roll, next] = nextRandom(nextState); nextState = next;
    let cursor = roll * total;
    let index = available.length - 1;
    for (let i = 0; i < available.length; i += 1) {
      cursor -= weights[i];
      if (cursor < 0) { index = i; break; }
    }
    selected.push(available.splice(index, 1)[0]);
  }
  return [selected, nextState];
}

function eventById(state: GameState, id: string): V060NightEvent | undefined {
  return finalHordeEventById(id) ?? nightEventById(id) ?? mortalityEventById(state, id);
}

export function eligibleEvent(state: GameState, event: V060NightEvent): boolean {
  if (state.day < event.minDay || state.day > event.maxDay) return false;
  if ((event.requiredSurvivorIds ?? []).some((id) => !state.survivors.some((survivor) => survivor.id === id && playable(survivor)))) return false;
  const requiredBuildings = event.requiredBuildings ?? {};
  for (const id of Object.keys(requiredBuildings) as BuildingId[]) {
    const minimumLevel = requiredBuildings[id];
    if (minimumLevel !== undefined && state.buildings[id] < minimumLevel) return false;
  }
  if ((event.requiredFlags ?? []).some((flag) => !state.storyFlags.includes(flag))) return false;
  if ((event.excludedFlags ?? []).some((flag) => state.storyFlags.includes(flag))) return false;
  return true;
}

const eligible = (events: V060NightEvent[], state: GameState) => events.filter((event) => eligibleEvent(state, event));

function assignedCount(state: GameState, role: Role): number {
  const assignment = ROLE_ASSIGNMENT[role];
  if (!assignment) return 0;
  return state.survivors.filter((survivor) => playable(survivor) && state.dayAssignments[survivor.id] === assignment).length;
}

function hordeChance(state: GameState): number {
  if (HORDE_MILESTONE_DAYS.includes(state.day as (typeof HORDE_MILESTONE_DAYS)[number])) return 1;
  const dayPressure = state.day <= 5 ? 0.03 : state.day <= 12 ? 0.08 : state.day <= 20 ? 0.13 : 0.2;
  const defensePenalty = Math.max(0, 55 - state.defense) * 0.004;
  const lightPressure = state.mainLightStage >= 4 ? 0.04 : state.mainLightStage >= 3 ? 0.02 : 0;
  const watchReduction = Math.min(0.12, assignedCount(state, 'watch') * 0.04 + state.buildings.watchPost * 0.02);
  const intelReduction = state.storyFlags.includes('horde_route_known') || state.storyFlags.includes('east_route_known') ? 0.06 : 0;
  const radioReduction = state.buildings.radio >= 3 && assignedCount(state, 'radio') ? 0.04 : 0;
  const communityReduction = communityDefenseSupport(state);
  return clamp(dayPressure + defensePenalty + lightPressure - watchReduction - intelReduction - radioReduction - communityReduction, 0.02, 0.55);
}

export function emergencyRisk(state: GameState): number {
  const injured = state.survivors.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const defensePenalty = Math.max(0, 50 - state.defense) * 0.006;
  const powerPenalty = Math.max(0, 35 - state.inventory.power) * 0.006;
  const injuryPenalty = Math.min(0.15, injured * 0.035);
  const phasePenalty = state.day >= 24 ? 0.12 : state.day >= 15 ? 0.06 : 0;
  const hordePenalty = HORDE_MILESTONE_DAYS.includes(state.day as (typeof HORDE_MILESTONE_DAYS)[number]) ? 0.2 : 0;
  const watchReduction = Math.min(0.18, assignedCount(state, 'watch') * 0.05 + state.buildings.watchPost * 0.025);
  const workshopReduction = state.buildings.workshop >= 2 ? 0.04 : 0;
  const radioReduction = state.buildings.radio >= 2 ? 0.03 : 0;
  const communityReduction = communityDefenseSupport(state);
  return clamp(0.08 + defensePenalty + powerPenalty + injuryPenalty + phasePenalty + hordePenalty - watchReduction - workshopReduction - radioReduction - communityReduction, 0.02, 0.8);
}

function emergencyCountFor(state: GameState, roll: number): number {
  if (state.day === 20) return roll < 0.45 ? 2 : 1;
  if (state.day === 10) return 1;
  return roll < emergencyRisk(state) ? 1 : 0;
}

function normalComposition(state: GameState, count: number, rngState: number): [V060NightEvent[], number] {
  const pool = eligible(NORMAL_NIGHT_EVENTS, state);
  const selected: V060NightEvent[] = []; let nextState = rngState;
  for (const category of ['threat', 'infrastructure', 'survivor'] as const) {
    const candidates = pool.filter((event) => event.category === category && !selected.some((item) => item.id === event.id));
    if (!candidates.length || selected.length >= count) continue;
    const [picked, next] = pickWeightedWithoutReplacement(candidates, 1, nextState, state); nextState = next; selected.push(...picked);
  }
  const remaining = pool.filter((event) => !selected.some((item) => item.id === event.id));
  const [fill, next] = pickWeightedWithoutReplacement(remaining, Math.max(0, count - selected.length), nextState, state);
  return [[...selected, ...fill], next];
}

export function scheduleNight(input: GameState): GameState {
  if (input.day >= 30) return { ...input, phase: 'ending', nightState: { ...input.nightState, eventIndex: 0, eventTotal: 0, scheduledEventIds: [], emergencyEventIds: [], currentEventId: null, hordeActive: false, hordeStage: null, resolutions: [] }, lastMessage: 'DAY 30 · 天亮以后，只剩结算。' };
  const state = advanceUntreatedRisk({ ...input, dawnBrief: [] });

  if (state.day === 29) {
    const scheduledEventIds = [...FINAL_HORDE_EVENT_IDS];
    return {
      ...state,
      phase: 'night',
      nightState: {
        eventIndex: 0,
        eventTotal: scheduledEventIds.length,
        scheduledEventIds,
        emergencyEventIds: [],
        currentEventId: scheduledEventIds[0],
        hordeActive: true,
        hordeStage: 'approach',
        resolutions: [],
      },
      lastMessage: 'NIGHT 29 · 最终尸潮第一阶段：北门。过去二十八天正在决定今晚。',
    };
  }

  let rngState = state.rngState;
  const [hordeRoll, afterHordeRoll] = nextRandom(rngState); rngState = afterHordeRoll;
  const hordeActive = hordeRoll < hordeChance(state);
  const eventTotal = hordeActive ? 6 : 5;
  const hordeSlots = hordeActive ? 2 : 0;
  const [normalEvents, afterNormal] = normalComposition(state, eventTotal - hordeSlots, rngState); rngState = afterNormal;
  const [hordeEvents, afterHorde] = pickWithoutReplacement(eligible(HORDE_EVENTS, state), hordeSlots, rngState); rngState = afterHorde;
  const scheduled = [...normalEvents];
  if (hordeEvents[0]) scheduled.splice(Math.min(2, scheduled.length), 0, hordeEvents[0]);
  if (hordeEvents[1]) scheduled.splice(Math.min(4, scheduled.length), 0, hordeEvents[1]);
  const [emergencyRoll, afterEmergencyRoll] = nextRandom(rngState); rngState = afterEmergencyRoll;
  const [emergencies, afterEmergency] = pickWeightedWithoutReplacement(eligible(EMERGENCY_EVENTS, state), emergencyCountFor(state, emergencyRoll), rngState, state); rngState = afterEmergency;
  const scheduledEventIds = scheduled.slice(0, eventTotal).map((event) => event.id);
  const mortalityIds = pendingMortalityEventIds(state);
  const emergencyEventIds = [...new Set([...mortalityIds, ...emergencies.map((event) => event.id)])];
  const urgentMedical = emergencyEventIds.find((id) => id.startsWith('mortality-medical:'));
  return {
    ...state,
    rngState,
    phase: 'night',
    nightState: { eventIndex: 0, eventTotal: scheduledEventIds.length, scheduledEventIds, emergencyEventIds, currentEventId: urgentMedical ?? scheduledEventIds[0] ?? emergencyEventIds[0] ?? null, hordeActive, hordeStage: hordeActive ? 'approach' : null, resolutions: [] },
    lastMessage: urgentMedical ? `NIGHT ${state.day} · 有人的伤势已经不能再拖` : hordeActive ? `NIGHT ${state.day} · 尸群迹象正在靠近` : `NIGHT ${state.day} · 今晚先听清每一个声音`,
  };
}

function emergencyThresholds(count: number): number[] { return count >= 3 ? [1, 3, 5] : count === 2 ? [2, 4] : count === 1 ? [2] : []; }

function availableScheduledIds(state: GameState, ids: string[]): string[] {
  return ids.filter((id) => {
    const event = eventById(state, id);
    if (!event) return false;
    return eligibleEvent(state, event);
  });
}

export function nextNightEventId(state: GameState): string | null {
  const mainIds = availableScheduledIds(state, state.nightState.scheduledEventIds);
  const emergencyIds = availableScheduledIds(state, state.nightState.emergencyEventIds);
  const resolved = new Set(state.nightState.resolutions);
  const urgentMedical = emergencyIds.find((id) => id.startsWith('mortality-medical:') && !resolved.has(id));
  if (urgentMedical) return urgentMedical;
  const mainResolved = mainIds.filter((id) => resolved.has(id)).length; const emergencyResolved = emergencyIds.filter((id) => resolved.has(id)).length;
  const thresholds = emergencyThresholds(emergencyIds.length);
  if (emergencyResolved < emergencyIds.length && mainResolved >= (thresholds[emergencyResolved] ?? Number.POSITIVE_INFINITY)) return emergencyIds[emergencyResolved];
  return mainIds.find((id) => !resolved.has(id)) ?? emergencyIds.find((id) => !resolved.has(id)) ?? null;
}

export function currentNightEvent(state: GameState): V060NightEvent | null {
  const current = state.nightState.currentEventId ? eventById(state, state.nightState.currentEventId) : undefined;
  if (current && eligibleEvent(state, current)) return current;
  const id = nextNightEventId({ ...state, nightState: { ...state.nightState, currentEventId: null } });
  return id ? eventById(state, id) ?? null : null;
}

function actorForRole(state: GameState, role: Role | undefined): Survivor | undefined {
  if (!role) return undefined;
  const assignment = ROLE_ASSIGNMENT[role]; const candidates = state.survivors.filter(playable);
  return candidates.find((survivor) => assignment && state.dayAssignments[survivor.id] === assignment) ?? candidates.find((survivor) => survivor.specialty === role);
}

function buildingModifier(state: GameState, role: Role | undefined): CheckModifier | null {
  if (!role) return null; const id = ROLE_BUILDING[role]; if (!id) return null;
  const level = state.buildings[id]; return level >= 3 ? { label: '设施 Lv3', value: 2 } : level >= 2 ? { label: '设施 Lv2', value: 1 } : null;
}

function communityRoleSupport(state: GameState, role: Role | undefined): CheckModifier | null {
  if (role !== 'watch' && role !== 'repair') return null;
  const support = communitySupportSummary(state);
  if (role === 'watch' && support.supportMode === 'defense' && support.activeResidents >= 5) return { label: '居民守备轮值', value: -1 };
  if (role === 'repair' && support.supportMode === 'repair' && support.activeResidents >= 5) return { label: '居民维修轮值', value: -1 };
  return null;
}

export function nightCheckContext(state: GameState, choice: NightChoice): { actor?: Survivor; modifiers: CheckModifier[]; mode: 'normal' | 'advantage' | 'disadvantage' } {
  const role = choice.check?.role; const actor = actorForRole(state, role); const modifiers: CheckModifier[] = [];
  if (actor && role && actor.specialty === role) modifiers.push({ label: '人物专长', value: 1 });
  if (actor && (actor.trust ?? 0) >= 2) modifiers.push({ label: '信任', value: 1 });
  if (actor?.condition === 'fatigued' || actor?.condition === 'minor') modifiers.push({ label: '状态不佳', value: -1 });
  if (actor?.condition === 'serious' || actor?.condition === 'critical') modifiers.push({ label: '伤势严重', value: -2 });
  const facility = buildingModifier(state, role); if (facility) modifiers.push(facility);
  const community = actor ? null : communityRoleSupport(state, role);
  if (community) modifiers.push(community);
  if (!actor && !community) modifiers.push({ label: '无人值守', value: -2 });
  modifiers.push(...finalHordeCheckModifiers(state, choice.id));
  return { actor, modifiers, mode: !actor && !community ? 'disadvantage' : choice.check?.mode ?? 'normal' };
}

export function canAffordNightChoice(state: GameState, rawChoice: NightChoice): boolean {
  const choice = effectiveFinalHordeChoice(state, rawChoice);
  const cost = choice.cost; if (!cost) return true;
  return (cost.ration ?? 0) <= state.inventory.ration && (cost.medicine ?? 0) <= state.inventory.medicine && (cost.materials ?? 0) <= state.inventory.materials && (cost.parts ?? 0) <= state.inventory.parts && (cost.power ?? 0) <= state.inventory.power;
}

function applyCost(state: GameState, rawChoice: NightChoice): GameState {
  const choice = effectiveFinalHordeChoice(state, rawChoice);
  const cost = choice.cost; if (!cost) return state;
  return { ...state, inventory: {
    ration: Math.max(0, state.inventory.ration - (cost.ration ?? 0)), medicine: Math.max(0, state.inventory.medicine - (cost.medicine ?? 0)),
    materials: Math.max(0, state.inventory.materials - (cost.materials ?? 0)), parts: Math.max(0, state.inventory.parts - (cost.parts ?? 0)),
    power: Math.max(0, state.inventory.power - (cost.power ?? 0)),
  } };
}

function applyActorCondition(state: GameState, actorId: string | undefined, condition: SurvivorCondition | undefined, cause: string): GameState {
  if (!actorId || !condition) return state;
  if (condition === 'dead') return recordDeath(state, actorId, cause);
  if (condition === 'missing') return markMissing(state, actorId, cause);
  return { ...state, survivors: state.survivors.map((survivor) => survivor.id === actorId ? { ...survivor, condition } : survivor) };
}

function applyEffect(input: GameState, effect: NightEffect | undefined, actorId?: string, cause = '夜间事件'): GameState {
  if (!effect) return input;
  const inventory = {
    ...input.inventory,
    ration: Math.max(0, input.inventory.ration + (effect.inventory?.ration ?? 0)), medicine: Math.max(0, input.inventory.medicine + (effect.inventory?.medicine ?? 0)),
    materials: Math.max(0, input.inventory.materials + (effect.inventory?.materials ?? 0)), parts: Math.max(0, input.inventory.parts + (effect.inventory?.parts ?? 0)),
    power: Math.max(0, Math.min(100, input.inventory.power + (effect.power ?? 0))),
  };
  let next: GameState = { ...input, inventory, hope: clamp(input.hope + (effect.hope ?? 0)), defense: clamp(input.defense + (effect.defense ?? 0)), storyFlags: [...new Set([...input.storyFlags, ...(effect.addFlags ?? [])])] };
  next = applyActorCondition(next, actorId, effect.actorCondition, cause);
  return next;
}

function mortalityTarget(eventId: string): string | null {
  if (eventId.startsWith('mortality-medical:')) return eventId.slice('mortality-medical:'.length);
  if (eventId.startsWith('mortality-hope:')) return eventId.slice('mortality-hope:'.length);
  return null;
}

function setTargetCondition(state: GameState, survivorId: string, condition: SurvivorCondition, untreatedDays = 0): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId ? { ...survivor, condition, untreatedDays } : survivor),
  };
}

function addResolutionFlag(state: GameState, flag: string): GameState {
  return state.storyFlags.includes(flag) ? state : { ...state, storyFlags: [...state.storyFlags, flag] };
}

function resolveMedicalDirect(state: GameState, eventId: string, choiceId: string): GameState {
  const targetId = mortalityTarget(eventId); if (!targetId) return state;
  const target = state.survivors.find((survivor) => survivor.id === targetId); if (!target) return state;
  if (choiceId === 'mortality-medicine') {
    const condition: SurvivorCondition = target.condition === 'critical' ? 'serious' : 'minor';
    return clearUntreatedRisk(setTargetCondition(state, targetId, condition, 0), [targetId]);
  }
  if (choiceId === 'mortality-isolate') {
    if (target.condition === 'critical') {
      const dead = recordDeath(state, targetId, '尸变 · 长时间未接受医疗');
      return addResolutionFlag(dead, `turned:${targetId}`);
    }
    return setTargetCondition(state, targetId, 'critical', 0);
  }
  return state;
}

function resolveMedicalCheck(state: GameState, eventId: string, outcome: CheckOutcome): GameState {
  const targetId = mortalityTarget(eventId); if (!targetId) return state;
  const target = state.survivors.find((survivor) => survivor.id === targetId); if (!target) return state;
  if (outcome === 'success' || outcome === 'critical') {
    const condition: SurvivorCondition = target.condition === 'critical' ? 'serious' : 'minor';
    return clearUntreatedRisk(setTargetCondition(state, targetId, condition, 0), [targetId]);
  }
  if (outcome === 'partial') {
    const condition: SurvivorCondition = 'serious';
    return clearUntreatedRisk(setTargetCondition(state, targetId, condition, 0), [targetId]);
  }
  if (target.condition === 'critical') {
    const dead = recordDeath(state, targetId, '尸变 · 医疗危机处理失败');
    return addResolutionFlag(dead, `turned:${targetId}`);
  }
  return setTargetCondition(state, targetId, 'critical', 0);
}

function resolveHopeDirect(state: GameState, eventId: string, choiceId: string): GameState {
  const targetId = mortalityTarget(eventId); if (!targetId) return state;
  let next = addResolutionFlag(state, `low_hope_departure_resolved:${state.day}`);
  if (choiceId === 'mortality-leave') next = markMissing(next, targetId, '希望崩溃后离开街区');
  return next;
}

function resolveHopeCheck(state: GameState, eventId: string, outcome: CheckOutcome): GameState {
  const targetId = mortalityTarget(eventId); if (!targetId) return state;
  let next = addResolutionFlag(state, `low_hope_departure_resolved:${state.day}`);
  if (outcome === 'failure') next = markMissing(next, targetId, '希望过低 · 夜间离开');
  return next;
}

function applyCivilianIncident(state: GameState, eventId: string, choiceId: string, outcome?: CheckOutcome): GameState {
  if (state.civilianResidents <= 0) return state;
  const failed = outcome === 'failure';
  if (eventId === 'emergency-panic' && choiceId === 'calm' && failed) return loseCommunityResidents(state, 1, '恐慌踩踏');
  if (eventId === 'emergency-missing-child' && choiceId === 'search-child' && failed) return loseCommunityResidents(state, 1, '夜间搜救失败');
  if (eventId === 'emergency-missing-child' && choiceId === 'wait-child' && outcome === undefined) return loseCommunityResidents(state, 1, '居民失踪');
  if (eventId === 'emergency-building-collapse' && choiceId === 'shore' && failed) return loseCommunityResidents(state, state.day >= 24 ? 2 : 1, '建筑坍塌');
  if (eventId === 'emergency-north-breach' && choiceId === 'rush-repair' && failed) return loseCommunityResidents(state, 1, '北门缺口');
  if (eventId === 'horde-north-gate' && choiceId === 'hold-gate' && failed) return loseCommunityResidents(state, 1, '北门失守');
  if (eventId === 'horde-breakthrough' && choiceId === 'counter' && failed) return loseCommunityResidents(state, state.day >= 24 ? 2 : 1, '尸群突破外围');
  if (eventId === 'horde-clinic' && choiceId === 'triage' && failed) return loseCommunityResidents(state, 1, '伤员没能等到救治');
  if (eventId === 'horde-clinic' && choiceId === 'combat-first' && outcome === undefined) return loseCommunityResidents(state, 1, '医疗被延后');
  if (eventId === 'final-horde-community' && choiceId === 'final-community-calm' && failed) return loseCommunityResidents(state, 1, '最终尸潮中的恐慌');
  if (eventId === 'final-horde-community' && choiceId === 'final-community-ignore' && outcome === undefined) return loseCommunityResidents(state, 1, '最终尸潮中无人照看居民');
  if (eventId === 'final-horde-last-line' && choiceId === 'final-last-hold' && failed) return loseCommunityResidents(state, 1, '最后防线失守');
  return state;
}

function rememberNightEvent(state: GameState, eventId: string): GameState {
  const flag = `night_seen:${eventId}:${state.day}`;
  return state.storyFlags.includes(flag) ? state : { ...state, storyFlags: [...state.storyFlags, flag] };
}

function completeCurrentEvent(state: GameState, eventId: string): GameState {
  const already = state.nightState.resolutions.includes(eventId);
  const remembered = already ? state : rememberNightEvent(state, eventId);
  const resolutions = already ? remembered.nightState.resolutions : [...remembered.nightState.resolutions, eventId];
  const temporary = { ...remembered, nightState: { ...remembered.nightState, resolutions, currentEventId: null } };
  const nextId = nextNightEventId(temporary);
  const validMainIds = availableScheduledIds(temporary, temporary.nightState.scheduledEventIds);
  const mainResolved = validMainIds.filter((id) => resolutions.includes(id)).length;
  const complete = !nextId;
  const hordeStage = !temporary.nightState.hordeActive ? null : complete ? 'retreat' : mainResolved >= Math.ceil(Math.max(1, validMainIds.length) * 0.65) ? 'impact' : 'approach';
  return {
    ...temporary,
    phase: complete ? 'night-summary' : 'night',
    nightState: { ...temporary.nightState, eventIndex: mainResolved, eventTotal: validMainIds.length, currentEventId: nextId, hordeStage },
    campaignStats: already ? temporary.campaignStats : {
      ...temporary.campaignStats,
      nightEventsResolved: temporary.campaignStats.nightEventsResolved + 1,
      emergencyEventsResolved: temporary.campaignStats.emergencyEventsResolved + (eventId.startsWith('emergency-') || eventId.startsWith('mortality-') ? 1 : 0),
    },
    lastMessage: complete
      ? (state.day === 29 ? 'NIGHT 29 · 最后一波尸群终于开始退去。' : `NIGHT ${state.day} · 今晚的决定已经落下`)
      : (state.day === 29 ? `最终尸潮 · 第 ${mainResolved + 1}/6 阶段` : '下一个声音从黑暗里传来。'),
  };
}

export function chooseNightOption(state: GameState, choiceId: string): GameState {
  const event = currentNightEvent(state); if (!event || state.pendingCheck) return state;
  const choice = event.choices.find((item) => item.id === choiceId); if (!choice || !canAffordNightChoice(state, choice)) return state;
  const before = state;
  const paid = applyCost(state, choice);
  if (choice.check) {
    const context = nightCheckContext(paid, choice);
    return createPendingCheck(paid, { source: 'night', eventId: event.id, choiceId: choice.id, label: choice.check.label, actorId: context.actor?.id, mode: context.mode, modifiers: context.modifiers });
  }
  let next = applyEffect(paid, choice.direct, undefined, event.title);
  if (event.id.startsWith('mortality-medical:')) next = resolveMedicalDirect(next, event.id, choice.id);
  if (event.id.startsWith('mortality-hope:')) next = resolveHopeDirect(next, event.id, choice.id);
  if (isFinalHordeEventId(event.id)) next = applyFinalHordeResolution(next, event.id, choice.id);
  next = applyCivilianIncident(next, event.id, choice.id);
  next = appendDawnBrief(before, next, event.title);
  return completeCurrentEvent(next, event.id);
}

export function acceptNightCheckResult(state: GameState): GameState {
  const check = state.pendingCheck; if (!check?.outcome || check.source !== 'night') return state;
  const event = eventById(state, check.eventId); const choice = event?.choices.find((item) => item.id === check.choiceId);
  if (!event || !choice) return { ...state, pendingCheck: null };
  const before = state;
  let next = applyEffect({ ...state, pendingCheck: null }, choice.outcomes?.[check.outcome], check.actorId, event.title);
  if (event.id.startsWith('mortality-medical:')) next = resolveMedicalCheck(next, event.id, check.outcome);
  if (event.id.startsWith('mortality-hope:')) next = resolveHopeCheck(next, event.id, check.outcome);
  if (isFinalHordeEventId(event.id)) next = applyFinalHordeResolution(next, event.id, choice.id, check.outcome);
  next = applyCivilianIncident(next, event.id, choice.id, check.outcome);
  const actor = check.actorId ? next.survivors.find((item) => item.id === check.actorId) : undefined;
  if (state.day >= 11 && check.twist === 'double-one' && (event.category === 'horde' || event.category === 'emergency') && actor && (actor.condition === 'serious' || actor.condition === 'critical')) next = recordDeath(next, actor.id, `${event.title} · 双一`);
  next = appendDawnBrief(before, next, event.title);
  return completeCurrentEvent(next, event.id);
}
