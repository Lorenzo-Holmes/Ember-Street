import { HORDE_MILESTONE_DAYS } from '../config';
import { createPendingCheck } from '../dice';
import { nextRandom } from '../rng';
import type { BuildingId, CheckModifier, GameState, Role, Survivor, SurvivorCondition } from '../types';
import { EMERGENCY_EVENTS, HORDE_EVENTS, NORMAL_NIGHT_EVENTS, nightEventById, type NightChoice, type NightEffect, type V060NightEvent } from './nightEvents';

const ROLE_ASSIGNMENT: Partial<Record<Role, string>> = {
  search: 'expedition',
  repair: 'repair',
  medical: 'medical',
  watch: 'watch',
  cook: 'cook',
  radio: 'radio',
  rest: 'rest',
};

const ROLE_BUILDING: Partial<Record<Role, BuildingId>> = {
  search: 'searchStation',
  repair: 'workshop',
  medical: 'clinic',
  watch: 'watchPost',
  radio: 'radio',
  rest: 'shelter',
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const playable = (survivor: Survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing';

function drawIndex(rngState: number, size: number): [number, number] {
  const [value, next] = nextRandom(rngState);
  return [Math.min(size - 1, Math.floor(value * size)), next];
}

function pickWithoutReplacement<T>(pool: T[], count: number, rngState: number): [T[], number] {
  const available = [...pool];
  const selected: T[] = [];
  let nextState = rngState;
  while (available.length && selected.length < count) {
    const [index, next] = drawIndex(nextState, available.length);
    nextState = next;
    selected.push(available.splice(index, 1)[0]);
  }
  return [selected, nextState];
}

function eligible(events: V060NightEvent[], day: number): V060NightEvent[] {
  return events.filter((event) => day >= event.minDay && day <= event.maxDay);
}

function assignedCount(state: GameState, role: Role): number {
  const assignment = ROLE_ASSIGNMENT[role];
  if (!assignment) return 0;
  return state.survivors.filter((survivor) => playable(survivor) && state.dayAssignments[survivor.id] === assignment).length;
}

function hordeChance(state: GameState): number {
  if (HORDE_MILESTONE_DAYS.includes(state.day as (typeof HORDE_MILESTONE_DAYS)[number])) return 1;
  const dayPressure = state.day <= 5 ? 0.03 : state.day <= 12 ? 0.08 : state.day <= 20 ? 0.13 : 0.2;
  const defensePenalty = Math.max(0, 55 - (state.defense ?? 50)) * 0.004;
  const lightPressure = state.mainLightStage >= 4 ? 0.04 : state.mainLightStage >= 3 ? 0.02 : 0;
  const watchReduction = Math.min(0.12, assignedCount(state, 'watch') * 0.04 + state.buildings.watchPost * 0.02);
  const intelReduction = (state.storyFlags ?? []).includes('horde_route_known') || (state.storyFlags ?? []).includes('east_route_known') ? 0.06 : 0;
  return clamp(dayPressure + defensePenalty + lightPressure - watchReduction - intelReduction, 0.02, 0.55);
}

export function emergencyRisk(state: GameState): number {
  const injured = state.survivors.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const defensePenalty = Math.max(0, 50 - (state.defense ?? 50)) * 0.006;
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
  const pool = eligible(NORMAL_NIGHT_EVENTS, state.day);
  const selected: V060NightEvent[] = [];
  let nextState = rngState;
  const preferred = ['threat', 'infrastructure', 'survivor'] as const;
  for (const category of preferred) {
    const candidates = pool.filter((event) => event.category === category && !selected.some((item) => item.id === event.id));
    if (!candidates.length || selected.length >= count) continue;
    const [picked, next] = pickWithoutReplacement(candidates, 1, nextState);
    nextState = next;
    selected.push(...picked);
  }
  const remaining = pool.filter((event) => !selected.some((item) => item.id === event.id));
  const [fill, next] = pickWithoutReplacement(remaining, Math.max(0, count - selected.length), nextState);
  return [[...selected, ...fill], next];
}

export function scheduleNight(state: GameState): GameState {
  if (state.day >= 30) {
    return {
      ...state,
      phase: 'ending',
      nightState: { ...state.nightState, eventIndex: 0, eventTotal: 0, scheduledEventIds: [], emergencyEventIds: [], currentEventId: null, hordeActive: false, hordeStage: null, resolutions: [] },
      lastMessage: 'DAY 30 · 天亮以后，只剩结算。',
    };
  }

  let rngState = state.rngState;
  const [hordeRoll, afterHordeRoll] = nextRandom(rngState);
  rngState = afterHordeRoll;
  const hordeActive = hordeRoll < hordeChance(state);
  const eventTotal = hordeActive ? 6 : 5;
  const hordeSlots = hordeActive ? (state.day === 29 ? 3 : 2) : 0;
  const [normalEvents, afterNormal] = normalComposition(state, eventTotal - hordeSlots, rngState);
  rngState = afterNormal;
  const [hordeEvents, afterHorde] = pickWithoutReplacement(eligible(HORDE_EVENTS, state.day), hordeSlots, rngState);
  rngState = afterHorde;

  const scheduled: V060NightEvent[] = [...normalEvents];
  if (hordeEvents.length) {
    const firstAt = Math.min(2, scheduled.length);
    scheduled.splice(firstAt, 0, hordeEvents[0]);
    if (hordeEvents[1]) scheduled.splice(Math.min(4, scheduled.length), 0, hordeEvents[1]);
    if (hordeEvents[2]) scheduled.splice(Math.min(5, scheduled.length), 0, hordeEvents[2]);
  }

  const [emergencyRoll, afterEmergencyRoll] = nextRandom(rngState);
  rngState = afterEmergencyRoll;
  const emergencyCount = emergencyCountFor(state, emergencyRoll);
  const [emergencies, afterEmergency] = pickWithoutReplacement(eligible(EMERGENCY_EVENTS, state.day), emergencyCount, rngState);
  rngState = afterEmergency;

  const scheduledEventIds = scheduled.slice(0, eventTotal).map((event) => event.id);
  const emergencyEventIds = emergencies.map((event) => event.id);
  const firstEventId = scheduledEventIds[0] ?? emergencyEventIds[0] ?? null;

  return {
    ...state,
    rngState,
    phase: 'night',
    nightState: {
      eventIndex: 0,
      eventTotal,
      scheduledEventIds,
      emergencyEventIds,
      currentEventId: firstEventId,
      hordeActive,
      hordeStage: hordeActive ? 'approach' : null,
      resolutions: [],
    },
    lastMessage: hordeActive ? `NIGHT ${state.day} · 尸群迹象正在靠近` : `NIGHT ${state.day} · 今晚先听清每一个声音`,
  };
}

function emergencyThresholds(count: number): number[] {
  if (count >= 3) return [1, 3, 5];
  if (count === 2) return [2, 4];
  if (count === 1) return [2];
  return [];
}

export function nextNightEventId(state: GameState): string | null {
  const mainIds = state.nightState.scheduledEventIds;
  const emergencyIds = state.nightState.emergencyEventIds;
  const resolved = new Set(state.nightState.resolutions);
  const mainResolved = mainIds.filter((id) => resolved.has(id)).length;
  const emergencyResolved = emergencyIds.filter((id) => resolved.has(id)).length;
  const thresholds = emergencyThresholds(emergencyIds.length);
  if (emergencyResolved < emergencyIds.length && mainResolved >= (thresholds[emergencyResolved] ?? Number.POSITIVE_INFINITY)) return emergencyIds[emergencyResolved];
  return mainIds.find((id) => !resolved.has(id)) ?? emergencyIds.find((id) => !resolved.has(id)) ?? null;
}

export function currentNightEvent(state: GameState): V060NightEvent | null {
  const id = state.nightState.currentEventId ?? nextNightEventId(state);
  return id ? nightEventById(id) ?? null : null;
}

function actorForRole(state: GameState, role: Role | undefined): Survivor | undefined {
  if (!role) return undefined;
  const assignment = ROLE_ASSIGNMENT[role];
  const candidates = state.survivors.filter((survivor) => playable(survivor));
  return candidates.find((survivor) => assignment && state.dayAssignments[survivor.id] === assignment)
    ?? candidates.find((survivor) => survivor.specialty === role);
}

function buildingModifier(state: GameState, role: Role | undefined): CheckModifier | null {
  if (!role) return null;
  const buildingId = ROLE_BUILDING[role];
  if (!buildingId) return null;
  const level = state.buildings[buildingId] ?? 0;
  if (level >= 3) return { label: '设施 Lv3', value: 2 };
  if (level >= 2) return { label: '设施 Lv2', value: 1 };
  return null;
}

function checkContext(state: GameState, choice: NightChoice): { actor?: Survivor; modifiers: CheckModifier[]; mode: 'normal' | 'advantage' | 'disadvantage' } {
  const role = choice.check?.role;
  const actor = actorForRole(state, role);
  const modifiers: CheckModifier[] = [];
  if (actor && role && actor.specialty === role) modifiers.push({ label: '人物专长', value: 1 });
  if (actor && (actor.trust ?? 0) >= 2) modifiers.push({ label: '信任', value: 1 });
  if (actor?.condition === 'fatigued' || actor?.condition === 'minor') modifiers.push({ label: '状态不佳', value: -1 });
  if (actor?.condition === 'serious' || actor?.condition === 'critical') modifiers.push({ label: '伤势严重', value: -2 });
  const facility = buildingModifier(state, role);
  if (facility) modifiers.push(facility);
  if (!actor) modifiers.push({ label: '无人值守', value: -2 });
  return { actor, modifiers, mode: !actor ? 'disadvantage' : choice.check?.mode ?? 'normal' };
}

export function canAffordNightChoice(state: GameState, choice: NightChoice): boolean {
  const cost = choice.cost;
  if (!cost) return true;
  if ((cost.ration ?? 0) > state.inventory.ration) return false;
  if ((cost.medicine ?? 0) > state.inventory.medicine) return false;
  if ((cost.materials ?? 0) > state.inventory.materials) return false;
  if ((cost.parts ?? 0) > state.inventory.parts) return false;
  if ((cost.power ?? 0) > state.inventory.power) return false;
  return true;
}

function applyCost(state: GameState, choice: NightChoice): GameState {
  const cost = choice.cost;
  if (!cost) return state;
  const inventory = {
    ...state.inventory,
    ration: Math.max(0, state.inventory.ration - (cost.ration ?? 0)),
    medicine: Math.max(0, state.inventory.medicine - (cost.medicine ?? 0)),
    materials: Math.max(0, state.inventory.materials - (cost.materials ?? 0)),
    parts: Math.max(0, state.inventory.parts - (cost.parts ?? 0)),
    power: Math.max(0, state.inventory.power - (cost.power ?? 0)),
  };
  return { ...state, inventory, supplies: inventory.ration, medicine: inventory.medicine, parts: inventory.parts, power: inventory.power };
}

function applyActorCondition(state: GameState, actorId: string | undefined, condition: SurvivorCondition | undefined): GameState {
  if (!actorId || !condition) return state;
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === actorId ? { ...survivor, condition } : survivor),
    campaignStats: {
      ...state.campaignStats,
      deaths: state.campaignStats.deaths + (condition === 'dead' ? 1 : 0),
      missing: state.campaignStats.missing + (condition === 'missing' ? 1 : 0),
    },
  };
}

function applyEffect(input: GameState, effect: NightEffect | undefined, actorId?: string): GameState {
  if (!effect) return input;
  const inventory = {
    ...input.inventory,
    ration: Math.max(0, input.inventory.ration + (effect.inventory?.ration ?? 0)),
    medicine: Math.max(0, input.inventory.medicine + (effect.inventory?.medicine ?? 0)),
    materials: Math.max(0, input.inventory.materials + (effect.inventory?.materials ?? 0)),
    parts: Math.max(0, input.inventory.parts + (effect.inventory?.parts ?? 0)),
    power: Math.max(0, input.inventory.power + (effect.power ?? 0)),
  };
  const storyFlags = [...new Set([...(input.storyFlags ?? []), ...(effect.addFlags ?? [])])];
  let next: GameState = {
    ...input,
    inventory,
    supplies: inventory.ration,
    medicine: inventory.medicine,
    parts: inventory.parts,
    power: inventory.power,
    hope: clamp(input.hope + (effect.hope ?? 0)),
    defense: clamp((input.defense ?? 50) + (effect.defense ?? 0)),
    storyFlags,
  };
  next = applyActorCondition(next, actorId, effect.actorCondition);
  return next;
}

function completeCurrentEvent(state: GameState, eventId: string): GameState {
  const resolutions = state.nightState.resolutions.includes(eventId) ? state.nightState.resolutions : [...state.nightState.resolutions, eventId];
  const temporary = { ...state, nightState: { ...state.nightState, resolutions } };
  const nextId = nextNightEventId(temporary);
  const mainResolved = state.nightState.scheduledEventIds.filter((id) => resolutions.includes(id)).length;
  const complete = !nextId;
  return {
    ...temporary,
    phase: complete ? 'night-summary' : 'night',
    nightState: {
      ...temporary.nightState,
      eventIndex: Math.min(temporary.nightState.eventTotal, mainResolved),
      currentEventId: nextId,
      hordeStage: complete && temporary.nightState.hordeActive ? 'retreat' : temporary.nightState.hordeStage,
    },
    campaignStats: { ...temporary.campaignStats, nightEventsResolved: temporary.campaignStats.nightEventsResolved + 1, emergencyEventsResolved: temporary.campaignStats.emergencyEventsResolved + (eventId.startsWith('emergency-') ? 1 : 0) },
    lastMessage: complete ? `NIGHT ${state.day} · 今晚的决定已经落下` : '下一个声音从黑暗里传来。',
  };
}

export function chooseNightOption(state: GameState, choiceId: string): GameState {
  const event = currentNightEvent(state);
  if (!event || state.pendingCheck) return state;
  const choice = event.choices.find((item) => item.id === choiceId);
  if (!choice || !canAffordNightChoice(state, choice)) return state;
  const paid = applyCost(state, choice);
  if (choice.check) {
    const context = checkContext(paid, choice);
    return createPendingCheck(paid, {
      source: 'night', eventId: event.id, choiceId: choice.id, label: choice.check.label,
      actorId: context.actor?.id, mode: context.mode, modifiers: context.modifiers,
    });
  }
  return completeCurrentEvent(applyEffect(paid, choice.direct), event.id);
}

export function acceptNightCheckResult(state: GameState): GameState {
  const check = state.pendingCheck;
  if (!check?.outcome || check.source !== 'night') return state;
  const event = nightEventById(check.eventId);
  const choice = event?.choices.find((item) => item.id === check.choiceId);
  if (!event || !choice) return { ...state, pendingCheck: null };
  const effect = choice.outcomes?.[check.outcome];
  const resolved = applyEffect({ ...state, pendingCheck: null }, effect, check.actorId);
  return completeCurrentEvent(resolved, event.id);
}
