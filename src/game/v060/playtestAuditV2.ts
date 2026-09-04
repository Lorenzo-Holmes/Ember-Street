import { canTrustReroll, rerollLowestDie, rollPendingCheck, totalModifier } from '../dice';
import type { BuildingId, GameState, StreetPrincipleId, Survivor } from '../types';
import { canUpgradeBuilding, upgradeBuilding } from './buildings';
import { advanceCampaignDay, createV060InitialState, finalizeDay, resolveExpeditionStance, retreatCurrentExpedition, searchForMissing } from './campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from './campaignEvents';
import { communitySupportUnlocked, selectCommunitySupportMode } from './community';
import { acceptCommunityRequest, pendingCommunityRequest } from './communityPromises';
import { assignDayJob, lockDayAssignments, survivorAvailableForDay } from './dayManagement';
import { availableExpeditionLocations, drawExpeditionEvent, expeditionRiskLabel, expeditionRiskScore, startExpedition } from './expedition';
import { previewMeal } from './food';
import { acceptNightCheckResult, canAffordNightChoice, chooseNightOption, currentNightEvent, nightCheckContext, scheduleNight } from './nightScheduler';
import type { NightChoice, NightEffect, V060NightEvent } from './nightEvents';
import { choosePrinciple, pendingPrincipleDecision } from './principles';

export type AuditV2Style = 'cautious' | 'balanced' | 'aggressive' | 'rescue';
export interface AuditV2Policy {
  id: string;
  style: AuditV2Style;
  principles: [StreetPrincipleId, StreetPrincipleId, StreetPrincipleId];
  buildingPriority: BuildingId[];
  rescuePriority?: boolean;
  routePriority?: boolean;
}

export interface AuditV2Options {
  residentInjection?: { day: number; count: number };
}

export interface AuditV2DaySnapshot {
  day: number;
  ration: number;
  medicine: number;
  power: number;
  materials: number;
  parts: number;
  hope: number;
  defense: number;
  residents: number;
  mealQuality: string;
  rationCoverage: number;
}

export interface AuditV2RunResult {
  seed: number;
  policyId: string;
  completed: boolean;
  endingId: string | null;
  finalHordeResult: string | null;
  deaths: number;
  missing: number;
  rescued: number;
  expeditions: number;
  peakResidents: number;
  firstShortageDay: number | null;
  hotMealDays: number;
  days: AuditV2DaySnapshot[];
  eventCounts: Record<string, number>;
  finalChoiceCounts: Record<string, number>;
  locationVisits: Record<string, number>;
  routeKnown: boolean;
  stalledReason?: string;
}

const PRIORITY: Record<AuditV2Style, BuildingId[]> = {
  cautious: ['clinic', 'watchPost', 'shelter', 'workshop', 'searchStation', 'radio'],
  balanced: ['shelter', 'workshop', 'clinic', 'watchPost', 'searchStation', 'radio'],
  aggressive: ['searchStation', 'workshop', 'radio', 'shelter', 'watchPost', 'clinic'],
  rescue: ['shelter', 'radio', 'clinic', 'searchStation', 'watchPost', 'workshop'],
};

export const V2_AUDIT_POLICIES: AuditV2Policy[] = [
  { id: 'cautious-v2', style: 'cautious', principles: ['triage-first', 'preserve-strength', 'prepare-evacuation'], buildingPriority: PRIORITY.cautious, routePriority: true },
  { id: 'balanced-v2', style: 'balanced', principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'], buildingPriority: PRIORITY.balanced, routePriority: true },
  { id: 'aggressive-v2', style: 'aggressive', principles: ['outward-search', 'core-leads', 'await-aid'], buildingPriority: PRIORITY.aggressive },
  { id: 'rescue-v2', style: 'rescue', principles: ['everyone-shares', 'community-shares-risk', 'prepare-evacuation'], buildingPriority: PRIORITY.rescue, rescuePriority: true, routePriority: true },
];

const present = (s: Survivor) => s.condition !== 'dead' && s.condition !== 'missing';
const active = (s: Survivor) => present(s) && survivorAvailableForDay(s);
const corePresent = (state: GameState) => state.survivors.filter(present).length;
const severe = (state: GameState) => state.survivors.filter((s) => s.condition === 'serious' || s.condition === 'critical').length;
const population = (state: GameState) => corePresent(state) + Math.max(0, state.civilianResidents);
const routeKnown = (state: GameState) => ['evacuation_route_known', 'subway_exit_known', 'southern_route_known', 'subway_maintenance_map', 'hospital_route_observed'].some((flag) => state.storyFlags.includes(flag));

function resolvePrompts(input: GameState, policy: AuditV2Policy): GameState {
  let state = input;
  for (let i = 0; i < 24; i += 1) {
    const event = pendingCampaignEvent(state);
    if (event) { state = resolveCampaignEvent(state, event.id); continue; }
    const decision = pendingPrincipleDecision(state);
    if (!decision) break;
    const target = policy.principles[decision.day === 7 ? 0 : decision.day === 14 ? 1 : 2];
    const choice = decision.choices.find((item) => item.id === target) ?? decision.choices[0];
    if (choice) state = choosePrinciple(state, choice.id);
  }
  return state;
}

function injectResidents(state: GameState, options: AuditV2Options): GameState {
  const injection = options.residentInjection;
  if (!injection || state.day !== injection.day || state.storyFlags.includes(`audit_residents:${injection.day}:${injection.count}`)) return state;
  const count = Math.max(0, Math.floor(injection.count));
  const flags = new Set(state.storyFlags);
  flags.add(`audit_residents:${injection.day}:${count}`);
  if (count >= 2) flags.add('community_milestone_2');
  if (count >= 5) { flags.add('community_milestone_5'); flags.add('community_rotation_unlocked'); }
  if (count >= 8) flags.add('community_milestone_8');
  if (count >= 10) flags.add('community_milestone_10');
  return {
    ...state,
    civilianResidents: count,
    communityState: { pendingResidents: 0, activeResidents: count, supportMode: null },
    storyFlags: [...flags],
  };
}

function housekeeping(input: GameState, policy: AuditV2Policy): GameState {
  let state = input;
  const request = pendingCommunityRequest(state);
  if (request) state = acceptCommunityRequest(state, request.id);
  const missing = state.survivors.find((s) => s.condition === 'missing');
  if (missing) {
    if (state.buildings.radio > 0 && state.inventory.power >= 8) state = searchForMissing(state, missing.id, 'radio');
    else if (state.survivors.filter((s) => s.id !== missing.id && active(s) && !state.dayState.committedSurvivorIds.includes(s.id)).length >= 2) state = searchForMissing(state, missing.id, 'team');
  }
  if (communitySupportUnlocked(state) && state.communityState.activeResidents >= 5) {
    const mode = state.inventory.ration < population(state) * 2 ? 'logistics' : state.defense < 62 ? 'defense' : 'repair';
    state = selectCommunitySupportMode(state, mode);
  }
  for (const id of policy.buildingPriority) {
    if (canUpgradeBuilding(state, id).allowed) { state = upgradeBuilding(state, id); break; }
  }
  return resolvePrompts(state, policy);
}

function resourceNeed(state: GameState, resource: 'ration' | 'medicine' | 'materials' | 'parts'): number {
  if (resource === 'ration') return Math.max(0, population(state) * 4 - state.inventory.ration) / Math.max(1, population(state));
  if (resource === 'medicine') return Math.max(0, 8 - state.inventory.medicine) * 1.5;
  if (resource === 'materials') return Math.max(0, 28 - state.inventory.materials) / 4;
  return Math.max(0, 16 - state.inventory.parts) / 3;
}

function locationStrategicBonus(state: GameState, policy: AuditV2Policy, locationId: string): number {
  let bonus = 0;
  const alreadyRouteKnown = routeKnown(state);
  if (policy.routePriority && !alreadyRouteKnown && locationId === 'subway') bonus += state.day >= 18 ? 10 : 7;
  if (policy.routePriority && !alreadyRouteKnown && locationId === 'bus-station') bonus += 8;
  if (policy.rescuePriority) {
    if (locationId === 'apartment-402') bonus += state.civilianResidents < 5 ? 10 : 5;
    if (locationId === 'subway') bonus += 4;
    if (locationId === 'bus-station') bonus += 6;
    if (locationId === 'hospital') bonus += severe(state) > 0 ? 5 : 2;
  }
  return bonus;
}

function chooseLocation(state: GameState, policy: AuditV2Policy): string | null {
  const riskCost = policy.style === 'cautious' ? 1.8 : policy.style === 'aggressive' ? 0.65 : policy.style === 'rescue' ? 0.95 : 1.05;
  const visited = new Set(state.storyFlags.filter((flag) => flag.startsWith('visited:')).map((flag) => flag.slice(8)));
  let best: { id: string; score: number } | null = null;
  for (const location of availableExpeditionLocations(state)) {
    const firstVisit = visited.has(location.id) ? 0 : 2.5;
    const score = resourceNeed(state, location.primary) * 2.2
      + resourceNeed(state, location.secondary)
      + (location.tertiary ? resourceNeed(state, location.tertiary) * 0.55 : 0)
      + firstVisit
      + locationStrategicBonus(state, policy, location.id)
      - location.danger * riskCost;
    if (!best || score > best.score) best = { id: location.id, score };
  }
  return best?.id ?? null;
}

function candidates(state: GameState, used: Set<string>): Survivor[] {
  return state.survivors
    .filter((s) => active(s) && !used.has(s.id) && !state.dayState.committedSurvivorIds.includes(s.id))
    .sort((a, b) => b.energy - a.energy);
}

function pick(state: GameState, used: Set<string>, specialty: string): Survivor | undefined {
  const pool = candidates(state, used);
  return pool.find((s) => s.specialty === specialty) ?? pool[0];
}

function assign(state: GameState, survivor: Survivor | undefined, job: Parameters<typeof assignDayJob>[2]): GameState {
  return survivor ? assignDayJob(state, survivor.id, job) : state;
}

function reserveCooking(input: GameState, used: Set<string>): GameState {
  let state = input;
  if (state.inventory.ration <= 0) return state;
  for (let i = 0; i < 2; i += 1) {
    const meal = previewMeal(state);
    if (meal.quality !== 'cold' && meal.quality !== 'struggling') break;
    const cook = pick(state, used, 'cook');
    if (!cook) break;
    state = assign(state, cook, 'cook');
    if (state.dayAssignments[cook.id] !== 'cook') break;
    used.add(cook.id);
  }
  return state;
}

function planDay(input: GameState, policy: AuditV2Policy): { state: GameState; party: string[]; location: string | null } {
  let state = input;
  const used = new Set(state.dayState.committedSurvivorIds);

  if (severe(state) > 0 && state.buildings.clinic > 0) {
    const medic = pick(state, used, 'medical');
    state = assign(state, medic, 'medical');
    if (medic && state.dayAssignments[medic.id] === 'medical') used.add(medic.id);
  }

  // V2 correction: reserve enough human cooking capacity before exploration/repair consumes the roster.
  state = reserveCooking(state, used);

  const location = chooseLocation(state, policy);
  const party: string[] = [];
  const shouldExplore = Boolean(location) && (policy.style !== 'cautious' || state.day <= 18 || state.inventory.ration < population(state) * 3 || state.inventory.materials < 12 || !routeKnown(state));
  if (shouldExplore && location) {
    const searcher = pick(state, used, 'search');
    const minEnergy = policy.style === 'aggressive' ? 24 : policy.style === 'rescue' ? 30 : 35;
    if (searcher && searcher.energy >= minEnergy) {
      state = assign(state, searcher, 'expedition');
      if (state.dayAssignments[searcher.id] === 'expedition') { party.push(searcher.id); used.add(searcher.id); }
    }
    const wantsEscort = party.length > 0 && policy.style !== 'aggressive' && candidates(state, used).length >= 2;
    if (wantsEscort) {
      const escort = pick(state, used, 'watch');
      if (escort && escort.energy >= 42) {
        state = assign(state, escort, 'expedition');
        if (state.dayAssignments[escort.id] === 'expedition') { party.push(escort.id); used.add(escort.id); }
      }
    }
  }

  if (state.defense < 68 && state.buildings.watchPost > 0) {
    const watcher = pick(state, used, 'watch');
    state = assign(state, watcher, 'watch');
    if (watcher && state.dayAssignments[watcher.id] === 'watch') used.add(watcher.id);
  }
  if (state.buildings.workshop > 0 && (state.defense < 76 || policy.style === 'cautious')) {
    const repairer = pick(state, used, 'repair');
    state = assign(state, repairer, 'repair');
    if (repairer && state.dayAssignments[repairer.id] === 'repair') used.add(repairer.id);
  }
  if (state.buildings.radio > 0 && state.day >= 8 && (policy.style === 'rescue' || policy.style === 'aggressive' || state.day % 3 === 0)) {
    const radio = pick(state, used, 'radio');
    state = assign(state, radio, 'radio');
  }
  return { state, party, location: party.length ? location : null };
}

function effectScore(effect?: NightEffect): number {
  if (!effect) return 0;
  const injury: Record<string, number> = { fatigued: -2, minor: -5, serious: -14, critical: -25, dead: -50, missing: -35 };
  return (effect.hope ?? 0) * 1.8
    + (effect.defense ?? 0) * 1.25
    + (effect.power ?? 0) * 0.18
    + (effect.inventory?.ration ?? 0) * 1.1
    + (effect.inventory?.medicine ?? 0) * 2.2
    + (effect.inventory?.materials ?? 0) * 0.75
    + (effect.inventory?.parts ?? 0) * 1.05
    + (effect.actorCondition ? injury[effect.actorCondition] ?? 0 : 0);
}

function costPenalty(state: GameState, choice: NightChoice): number {
  if (!choice.cost) return 0;
  let penalty = (choice.cost.ration ?? 0) * 1.2 + (choice.cost.medicine ?? 0) * 2.5 + (choice.cost.materials ?? 0) * 0.85 + (choice.cost.parts ?? 0) * 1.15 + (choice.cost.power ?? 0) * 0.2;
  if ((choice.cost.medicine ?? 0) > 0 && state.inventory.medicine - (choice.cost.medicine ?? 0) < 2) penalty += 5;
  if ((choice.cost.ration ?? 0) > 0 && state.inventory.ration - (choice.cost.ration ?? 0) < population(state)) penalty += 4;
  return penalty;
}

function choiceScore(state: GameState, event: V060NightEvent, choice: NightChoice, policy: AuditV2Policy): number {
  let score = choice.check
    ? (() => {
      const context = nightCheckContext(state, choice);
      return effectScore(choice.outcomes?.success) * 0.48
        + effectScore(choice.outcomes?.partial) * 0.32
        + effectScore(choice.outcomes?.failure) * 0.2
        + totalModifier(context.modifiers) * 1.1
        + (context.mode === 'advantage' ? 1.5 : context.mode === 'disadvantage' ? -2 : 0);
    })()
    : effectScore(choice.direct) - costPenalty(state, choice);
  if (choice.strategy === 'resource') score += policy.style === 'cautious' ? 3 : policy.style === 'balanced' || policy.style === 'rescue' ? 1.2 : -0.5;
  if (choice.strategy === 'person') score += policy.style === 'aggressive' ? 2 : policy.style === 'balanced' || policy.style === 'rescue' ? 0.8 : 0;
  if (choice.strategy === 'consequence') score -= policy.style === 'cautious' ? 1.5 : 0.4;
  if ((event.category === 'horde' || event.category === 'emergency') && choice.strategy === 'resource') score += 2.5;
  if (event.id.startsWith('mortality-medical:') && choice.id === 'mortality-medicine') score += 9;
  return score;
}

function chooseNight(state: GameState, event: V060NightEvent, policy: AuditV2Policy): NightChoice | null {
  return event.choices
    .filter((choice) => canAffordNightChoice(state, choice))
    .sort((a, b) => choiceScore(state, event, b, policy) - choiceScore(state, event, a, policy))[0] ?? null;
}

function playNight(input: GameState, policy: AuditV2Policy, eventCounts: Record<string, number>, finalChoiceCounts: Record<string, number>): GameState {
  let state = scheduleNight(input);
  for (let i = 0; i < 32 && state.phase === 'night'; i += 1) {
    const event = currentNightEvent(state);
    if (!event) break;
    eventCounts[event.id] = (eventCounts[event.id] ?? 0) + 1;
    const choice = chooseNight(state, event, policy);
    if (!choice) break;
    if (state.day === 29) finalChoiceCounts[choice.id] = (finalChoiceCounts[choice.id] ?? 0) + 1;
    state = chooseNightOption(state, choice.id);
    if (state.pendingCheck) {
      state = rollPendingCheck(state);
      if (state.pendingCheck?.outcome === 'failure' && canTrustReroll(state)) state = rerollLowestDie(state);
      state = acceptNightCheckResult(state);
    }
  }
  return state;
}

export function runAuditGameV2(seed: number, policy: AuditV2Policy, options: AuditV2Options = {}): AuditV2RunResult {
  let state = createV060InitialState(seed);
  const days: AuditV2DaySnapshot[] = [];
  const eventCounts: Record<string, number> = {};
  const finalChoiceCounts: Record<string, number> = {};
  const locationVisits: Record<string, number> = {};
  let peakResidents = 0;
  let firstShortageDay: number | null = null;
  let hotMealDays = 0;
  let stalledReason: string | undefined;

  for (let guard = 0; guard < 30 && state.phase !== 'ending'; guard += 1) {
    state = injectResidents(state, options);
    state = resolvePrompts(state, policy);
    state = housekeeping(state, policy);
    const plan = planDay(state, policy);
    state = lockDayAssignments(plan.state);

    if (plan.location && plan.party.length) {
      const risk = expeditionRiskLabel(expeditionRiskScore(state, plan.party, plan.location));
      state = drawExpeditionEvent(startExpedition(state, plan.party, plan.location));
      if (policy.style === 'cautious' && risk === 'extreme' && plan.party.some((id) => (state.survivors.find((s) => s.id === id)?.energy ?? 0) < 50)) state = retreatCurrentExpedition(state);
      else state = resolveExpeditionStance(state, policy.style === 'aggressive' ? 'push' : 'careful');
      locationVisits[plan.location] = (locationVisits[plan.location] ?? 0) + 1;
    }

    state = playNight(finalizeDay(state), policy, eventCounts, finalChoiceCounts);
    if (state.phase !== 'night-summary') { stalledReason = `DAY ${state.day}: ${state.phase}`; break; }

    peakResidents = Math.max(peakResidents, state.civilianResidents);
    if (firstShortageDay === null && (state.mealState.quality === 'cold' || state.mealState.quality === 'struggling')) firstShortageDay = state.day;
    if (state.mealState.quality === 'hot' || state.mealState.quality === 'full' || state.mealState.quality === 'well-fed') hotMealDays += 1;
    days.push({
      day: state.day,
      ration: state.inventory.ration,
      medicine: state.inventory.medicine,
      power: state.inventory.power,
      materials: state.inventory.materials,
      parts: state.inventory.parts,
      hope: state.hope,
      defense: state.defense,
      residents: state.civilianResidents,
      mealQuality: state.mealState.quality,
      rationCoverage: state.mealState.rationCoverage,
    });
    state = advanceCampaignDay(state);
  }

  return {
    seed,
    policyId: policy.id,
    completed: state.phase === 'ending' && state.day === 30,
    endingId: state.ending?.id ?? null,
    finalHordeResult: state.finalHordeResult ?? null,
    deaths: state.campaignStats.deaths,
    missing: state.campaignStats.missing,
    rescued: state.campaignStats.rescued,
    expeditions: state.campaignStats.expeditions,
    peakResidents,
    firstShortageDay,
    hotMealDays,
    days,
    eventCounts,
    finalChoiceCounts,
    locationVisits,
    routeKnown: routeKnown(state),
    ...(stalledReason ? { stalledReason } : {}),
  };
}
