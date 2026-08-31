import { HORDE_MILESTONE_DAYS } from '../config';
import { createPendingCheck } from '../dice';
import { nextRandom } from '../rng';
import type { BuildingId, CheckModifier, GameState, Role, Survivor, SurvivorCondition } from '../types';
import { markMissing, recordDeath } from './memorial';
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
  return clamp(dayPressure + defensePenalty + lightPressure - watchReduction - intelReduction - radioReduction, 0.02, 0.55);
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
  return clamp(0.08 + defensePenalty + powerPenalty + injuryPenalty + phasePenalty + hordePenalty - watchReduction - workshopReduction - radioReduction, 0.02, 0.8);
}

function emergencyCountFor(state: GameState, roll: number): number {
  if (state.day === 29) return roll < 0.55 ? 3 : 2;
  if (state.day === 20) return roll < 0.45 ? 2 : 1;
  if (state.day === 10) return 1;
  return roll < emergencyRisk(state) ? 1 : 0;
}

function normalComposition(state: GameState, count: number, rngState: number): [V060NightEvent[], number] {
  const poolState = state.day === 29 ? { ...state, day: 28 } : state;
  const pool = eligible(NORMAL_NIGHT_EVENTS, poolState);
  const selected: V060NightEvent[] = []; let nextState = rngState;
  for (const category of ['threat', 'infrastructure', 'survivor'] as const) {
    const candidates = pool.filter((event) => event.category === category && !selected.some((item) => item.id === event.id));
    if (!candidates.length || selected.length >= count) continue;
    const [picked, next] = pickWithoutReplacement(candidates, 1, nextState); nextState = next; selected.push(...picked);
  }
  const remaining = pool.filter((event) => !selected.some((item) => item.id === event.id));
  const [fill, next] = pickWithoutReplacement(remaining, Math.max(0, count - selected.length), nextState);
  return [[...selected, ...fill], next];
}

export function scheduleNight(state: GameState): GameState {
  if (state.day >= 30) return { ...state, phase: 'ending', nightState: { ...state.nightState, eventIndex: 0, eventTotal: 0, scheduledEventIds: [], emergencyEventIds: [], currentEventId: null, hordeActive: false, hordeStage: null, resolutions: [] }, lastMessage: 'DAY 30 · 天亮以后，只剩结算。' };
  let rngState = state.rngState;
  const [hordeRoll, afterHordeRoll] = nextRandom(rngState); rngState = afterHordeRoll;
  const hordeActive = hordeRoll < hordeChance(state);
  const eventTotal = hordeActive ? 6 : 5;
  const hordeSlots = hordeActive ? (state.day === 29 ? 3 : 2) : 0;
  const [normalEvents, afterNormal] = normalComposition(state, eventTotal - hordeSlots, rngState); rngState = afterNormal;
  const [hordeEvents, afterHorde] = pickWithoutReplacement(eligible(HORDE_EVENTS, state), hordeSlots, rngState); rngState = afterHorde;
  const scheduled = [...normalEvents];
  if (hordeEvents[0]) scheduled.splice(Math.min(2, scheduled.length), 0, hordeEvents[0]);
  if (hordeEvents[1]) scheduled.splice(Math.min(4, scheduled.length), 0, hordeEvents[1]);
  if (hordeEvents[2]) scheduled.splice(Math.min(5, scheduled.length), 0, hordeEvents[2]);
  const [emergencyRoll, afterEmergencyRoll] = nextRandom(rngState); rngState = afterEmergencyRoll;
  const [emergencies, afterEmergency] = pickWithoutReplacement(eligible(EMERGENCY_EVENTS, state), emergencyCountFor(state, emergencyRoll), rngState); rngState = afterEmergency;
  const scheduledEventIds = scheduled.slice(0, eventTotal).map((event) => event.id);
  const emergencyEventIds = emergencies.map((event) => event.id);
  return {
    ...state,
    rngState,
    phase: 'night',
    nightState: { eventIndex: 0, eventTotal: scheduledEventIds.length, scheduledEventIds, emergencyEventIds, currentEventId: scheduledEventIds[0] ?? emergencyEventIds[0] ?? null, hordeActive, hordeStage: hordeActive ? 'approach' : null, resolutions: [] },
    lastMessage: hordeActive ? `NIGHT ${state.day} · 尸群迹象正在靠近` : `NIGHT ${state.day} · 今晚先听清每一个声音`,
  };
}

function emergencyThresholds(count: number): number[] { return count >= 3 ? [1, 3, 5] : count === 2 ? [2, 4] : count === 1 ? [2] : []; }

function availableScheduledIds(state: GameState, ids: string[]): string[] {
  return ids.filter((id) => {
    const event = nightEventById(id);
    if (!event) return false;
    const dayState = state.day === 29 && event.category !== 'horde' && event.category !== 'emergency' ? { ...state, day: 28 } : state;
    return eligibleEvent(dayState, event);
  });
}

export function nextNightEventId(state: GameState): string | null {
  const mainIds = availableScheduledIds(state, state.nightState.scheduledEventIds);
  const emergencyIds = availableScheduledIds(state, state.nightState.emergencyEventIds);
  const resolved = new Set(state.nightState.resolutions);
  const mainResolved = mainIds.filter((id) => resolved.has(id)).length; const emergencyResolved = emergencyIds.filter((id) => resolved.has(id)).length;
  const thresholds = emergencyThresholds(emergencyIds.length);
  if (emergencyResolved < emergencyIds.length && mainResolved >= (thresholds[emergencyResolved] ?? Number.POSITIVE_INFINITY)) return emergencyIds[emergencyResolved];
  return mainIds.find((id) => !resolved.has(id)) ?? emergencyIds.find((id) => !resolved.has(id)) ?? null;
}

export function currentNightEvent(state: GameState): V060NightEvent | null {
  const current = state.nightState.currentEventId ? nightEventById(state.nightState.currentEventId) : null;
  if (current) {
    const dayState = state.day === 29 && current.category !== 'horde' && current.category !== 'emergency' ? { ...state, day: 28 } : state;
    if (eligibleEvent(dayState, current)) return current;
  }
  const id = nextNightEventId({ ...state, nightState: { ...state.nightState, currentEventId: null } });
  return id ? nightEventById(id) ?? null : null;
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

function checkContext(state: GameState, choice: NightChoice): { actor?: Survivor; modifiers: CheckModifier[]; mode: 'normal' | 'advantage' | 'disadvantage' } {
  const role = choice.check?.role; const actor = actorForRole(state, role); const modifiers: CheckModifier[] = [];
  if (actor && role && actor.specialty === role) modifiers.push({ label: '人物专长', value: 1 });
  if (actor && (actor.trust ?? 0) >= 2) modifiers.push({ label: '信任', value: 1 });
  if (actor?.condition === 'fatigued' || actor?.condition === 'minor') modifiers.push({ label: '状态不佳', value: -1 });
  if (actor?.condition === 'serious' || actor?.condition === 'critical') modifiers.push({ label: '伤势严重', value: -2 });
  const facility = buildingModifier(state, role); if (facility) modifiers.push(facility);
  if (!actor) modifiers.push({ label: '无人值守', value: -2 });
  return { actor, modifiers, mode: !actor ? 'disadvantage' : choice.check?.mode ?? 'normal' };
}

export function canAffordNightChoice(state: GameState, choice: NightChoice): boolean {
  const cost = choice.cost; if (!cost) return true;
  return (cost.ration ?? 0) <= state.inventory.ration && (cost.medicine ?? 0) <= state.inventory.medicine && (cost.materials ?? 0) <= state.inventory.materials && (cost.parts ?? 0) <= state.inventory.parts && (cost.power ?? 0) <= state.inventory.power;
}

function applyCost(state: GameState, choice: NightChoice): GameState {
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

function completeCurrentEvent(state: GameState, eventId: string): GameState {
  const already = state.nightState.resolutions.includes(eventId);
  const resolutions = already ? state.nightState.resolutions : [...state.nightState.resolutions, eventId];
  const temporary = { ...state, nightState: { ...state.nightState, resolutions, currentEventId: null } };
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
      emergencyEventsResolved: temporary.campaignStats.emergencyEventsResolved + (eventId.startsWith('emergency-') ? 1 : 0),
    },
    lastMessage: complete ? `NIGHT ${state.day} · 今晚的决定已经落下` : '下一个声音从黑暗里传来。',
  };
}

export function chooseNightOption(state: GameState, choiceId: string): GameState {
  const event = currentNightEvent(state); if (!event || state.pendingCheck) return state;
  const choice = event.choices.find((item) => item.id === choiceId); if (!choice || !canAffordNightChoice(state, choice)) return state;
  const paid = applyCost(state, choice);
  if (choice.check) {
    const context = checkContext(paid, choice);
    return createPendingCheck(paid, { source: 'night', eventId: event.id, choiceId: choice.id, label: choice.check.label, actorId: context.actor?.id, mode: context.mode, modifiers: context.modifiers });
  }
  return completeCurrentEvent(applyEffect(paid, choice.direct, undefined, event.title), event.id);
}

export function acceptNightCheckResult(state: GameState): GameState {
  const check = state.pendingCheck; if (!check?.outcome || check.source !== 'night') return state;
  const event = nightEventById(check.eventId); const choice = event?.choices.find((item) => item.id === check.choiceId);
  if (!event || !choice) return { ...state, pendingCheck: null };
  let next = applyEffect({ ...state, pendingCheck: null }, choice.outcomes?.[check.outcome], check.actorId, event.title);
  const actor = check.actorId ? next.survivors.find((item) => item.id === check.actorId) : undefined;
  if (state.day >= 11 && check.twist === 'double-one' && (event.category === 'horde' || event.category === 'emergency') && actor && (actor.condition === 'serious' || actor.condition === 'critical')) next = recordDeath(next, actor.id, `${event.title} · 双一`);
  return completeCurrentEvent(next, event.id);
}
