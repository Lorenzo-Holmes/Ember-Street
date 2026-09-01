import { canTrustReroll, rerollLowestDie, rollPendingCheck } from '../../src/game/dice';
import type { DayAssignment, GameState, Survivor } from '../../src/game/types';
import { upgradeBuilding } from '../../src/game/v060/buildings';
import { advanceCampaignDay, createV060InitialState, finalizeDay, resolveExpeditionStance } from '../../src/game/v060/campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from '../../src/game/v060/campaignEvents';
import { communitySupportSummary, communitySupportUnlocked, selectCommunitySupportMode } from '../../src/game/v060/community';
import { assignDayJob, canTakeDayAssignment, lockDayAssignments, survivorAvailableForDay } from '../../src/game/v060/dayManagement';
import { availableExpeditionLocations, currentExpeditionEvent, drawExpeditionEvent, startExpedition, EXPEDITION_LOCATIONS } from '../../src/game/v060/expedition';
import { effectiveCookingCapacity, previewMeal } from '../../src/game/v060/food';
import {
  acceptNightCheckResult,
  canAffordNightChoice,
  chooseNightOption,
  currentNightEvent,
  scheduleNight,
} from '../../src/game/v060/nightScheduler';
import { choosePrinciple, pendingPrincipleDecision } from '../../src/game/v060/principles';
import {
  AuditRng,
  type AuditEventRecord,
  type DailyRecord,
  type ExpeditionRecord,
  type PrinciplePickRecord,
  type RunRecord,
  policySeed,
  presentCore,
  weightedInventory,
} from './model';
import type { AssignmentContext, SimulationPolicy } from './policies';

const JOBS: DayAssignment[] = ['repair', 'medical', 'watch', 'radio', 'cook', 'rest'];
const conditionRank: Record<string, number> = { healthy: 0, fatigued: 1, minor: 2, serious: 3, critical: 4, missing: 5, dead: 6 };

function visiblePopulation(state: GameState): number {
  return presentCore(state) + Math.max(0, state.civilianResidents);
}

function countCondition(state: GameState, conditions: string[]): number {
  const wanted = new Set(conditions);
  return state.survivors.filter((survivor) => wanted.has(survivor.condition ?? 'healthy')).length;
}

function sumEnergy(state: GameState, ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + (state.survivors.find((survivor) => survivor.id === id)?.energy ?? 0), 0);
}

function storyValue(flags: readonly string[]): number {
  return flags.filter((flag) => /route|scouted|medical_cache|antibiotic|generator|vehicle|final_horde|rescue|contact/.test(flag)).length;
}

function eventMechanicalFamily(event: ReturnType<typeof currentNightEvent>): string {
  if (!event) return 'night:unknown';
  return event.choices.map((choice) => {
    const costKeys = Object.entries(choice.cost ?? {}).filter(([, value]) => (value ?? 0) > 0).map(([key]) => key).sort();
    const check = choice.check ? `check:${choice.check.role ?? 'generic'}` : 'direct';
    const cost = costKeys.length ? `pay:${costKeys.join('+')}` : 'free';
    return `${choice.strategy}:${check}:${cost}`;
  }).join('|');
}

function drainCampaignEvents(state: GameState, events: AuditEventRecord[]): GameState {
  let next = state;
  let guard = 0;
  while (guard < 50) {
    const event = pendingCampaignEvent(next);
    if (!event) return next;
    events.push({
      day: next.day,
      id: event.id,
      family: `campaign:${event.kind}`,
      mechanicalFamily: 'campaign:acknowledge-fixed-event',
      source: 'campaign',
      characterIds: event.survivorId ? [event.survivorId] : [],
      locationId: event.locationId,
    });
    next = resolveCampaignEvent(next, event.id);
    guard += 1;
  }
  throw new Error(`campaign fixed-event loop exceeded guard on DAY ${state.day}`);
}

function applyPrincipleDecision(
  state: GameState,
  policy: SimulationPolicy,
  rng: AuditRng,
  events: AuditEventRecord[],
  picks: PrinciplePickRecord[],
): GameState {
  const decision = pendingPrincipleDecision(state);
  if (!decision) return state;
  const principle = policy.choosePrinciple(state, decision, rng);
  if (!decision.choices.some((choice) => choice.id === principle)) throw new Error(`${policy.id} selected illegal principle ${principle}`);
  picks.push({ day: state.day, principle, resourceValueAtPick: weightedInventory(state), deathsAtPick: state.campaignStats.deaths });
  events.push({ day: state.day, id: `principle:${principle}`, family: `principle:day${decision.day}`, mechanicalFamily: 'principle:three-way-rule-choice', source: 'principle', characterIds: [], choiceId: principle });
  return choosePrinciple(state, principle);
}

function maybeUpgradeBuilding(state: GameState, policy: SimulationPolicy, rng: AuditRng, events: AuditEventRecord[]): GameState {
  const id = policy.chooseBuilding(state, rng);
  if (!id) return state;
  const before = state.buildings[id];
  const next = upgradeBuilding(state, id);
  if (next.buildings[id] <= before) return state;
  return drainCampaignEvents(next, events);
}

function maybeSelectCommunityMode(state: GameState, policy: SimulationPolicy, rng: AuditRng): GameState {
  if (!communitySupportUnlocked(state) || state.communityState.activeResidents < 5 || state.dayState.assignmentsLocked) return state;
  return selectCommunitySupportMode(state, policy.chooseCommunityMode(state, rng));
}

function expeditionCandidateScore(survivor: Survivor): number {
  return survivor.energy
    + (survivor.specialty === 'search' ? 30 : 0)
    + (survivor.specialty === 'watch' ? 8 : 0)
    - (conditionRank[survivor.condition ?? 'healthy'] ?? 0) * 12;
}

interface ExpeditionPlan {
  locationId: string;
  partyIds: string[];
}

function chooseExpeditionPlan(state: GameState, policy: SimulationPolicy, rng: AuditRng): ExpeditionPlan | null {
  const locations = availableExpeditionLocations(state);
  if (!locations.length || rng.next() > policy.explorationDrive(state)) return null;
  const scored = locations.map((location) => ({
    location,
    firstVisit: !state.storyFlags.includes(`visited:${location.id}`),
    score: policy.locationScore(state, location, !state.storyFlags.includes(`visited:${location.id}`)),
  }));
  if (policy.base === 'random') {
    for (const item of scored) item.score = rng.next();
  }
  scored.sort((a, b) => b.score - a.score || a.location.id.localeCompare(b.location.id));
  const location = scored[0]?.location;
  if (!location) return null;

  const candidates = state.survivors.filter((survivor) => survivorAvailableForDay(survivor)
    && survivor.condition !== 'serious'
    && survivor.energy >= 15
    && !state.dayState.committedSurvivorIds.includes(survivor.id));
  if (!candidates.length) return null;
  if (policy.base === 'random') candidates.sort(() => rng.next() - 0.5);
  else candidates.sort((a, b) => expeditionCandidateScore(b) - expeditionCandidateScore(a) || a.id.localeCompare(b.id));
  const count = policy.partySize(state, location, candidates);
  return { locationId: location.id, partyIds: candidates.slice(0, count).map((survivor) => survivor.id) };
}

function assignCoreJobs(state: GameState, policy: SimulationPolicy, rng: AuditRng, expedition: ExpeditionPlan | null): { state: GameState; illegal: number } {
  let next = state;
  let illegal = 0;
  const expeditionIds = new Set(expedition?.partyIds ?? []);
  for (const survivorId of expeditionIds) {
    if (!canTakeDayAssignment(next, survivorId, 'expedition').allowed) { illegal += 1; continue; }
    next = assignDayJob(next, survivorId, 'expedition');
  }

  const people = visiblePopulation(next);
  const support = communitySupportSummary(next);
  const injured = countCondition(next, ['minor', 'serious', 'critical']);
  const assigned: Partial<Record<DayAssignment, number>> = { expedition: expeditionIds.size };
  let currentCookCapacity = support.cookingCapacity;
  const available = next.survivors
    .filter((survivor) => survivorAvailableForDay(survivor) && !expeditionIds.has(survivor.id) && !next.dayState.committedSurvivorIds.includes(survivor.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const survivor of available) {
    const legal = JOBS.filter((job) => canTakeDayAssignment(next, survivor.id, job).allowed);
    if (!legal.length) continue;
    let selected: DayAssignment;
    if (policy.base === 'random') selected = rng.pick(legal);
    else {
      const context: AssignmentContext = {
        residentCount: people,
        injured,
        assigned,
        requiredCookCapacity: people,
        currentCookCapacity,
      };
      const scored = legal.map((job) => ({ job, score: policy.jobScore(next, survivor, job, context) }));
      scored.sort((a, b) => b.score - a.score || a.job.localeCompare(b.job));
      selected = scored[0].job;
    }
    next = assignDayJob(next, survivor.id, selected);
    assigned[selected] = (assigned[selected] ?? 0) + 1;
    if (selected === 'cook') currentCookCapacity += effectiveCookingCapacity(next, survivor);
  }
  return { state: next, illegal };
}

function resolveExpedition(
  state: GameState,
  plan: ExpeditionPlan | null,
  policy: SimulationPolicy,
  events: AuditEventRecord[],
  seenEventIds: Set<string>,
): { state: GameState; record: ExpeditionRecord | null; illegal: number } {
  if (!plan) return { state, record: null, illegal: 0 };
  const beforeStart = state;
  let next = startExpedition(state, plan.partyIds, plan.locationId);
  if (!next.expeditionState.departed) return { state, record: null, illegal: 1 };
  next = drawExpeditionEvent(next);
  const expeditionEvent = currentExpeditionEvent(next);
  const beforeResolve = next;
  const beforeFlags = new Set(beforeResolve.storyFlags);
  const beforeInjured = countCondition(beforeResolve, ['fatigued', 'minor', 'serious', 'critical']);
  const beforeDeaths = beforeResolve.campaignStats.deaths;
  const beforeMissing = beforeResolve.campaignStats.missing;
  const beforeEnergy = sumEnergy(beforeResolve, plan.partyIds);
  const location = EXPEDITION_LOCATIONS.find((item) => item.id === plan.locationId);
  if (!location) return { state: beforeStart, record: null, illegal: 1 };
  const stance = policy.chooseExpeditionStance(beforeResolve, location);
  next = resolveExpeditionStance(beforeResolve, stance);

  const rewardRation = next.inventory.ration - beforeResolve.inventory.ration;
  const rewardMedicine = next.inventory.medicine - beforeResolve.inventory.medicine;
  const rewardMaterials = next.inventory.materials - beforeResolve.inventory.materials;
  const rewardParts = next.inventory.parts - beforeResolve.inventory.parts;
  const injury = Math.max(0, countCondition(next, ['fatigued', 'minor', 'serious', 'critical']) - beforeInjured);
  const death = Math.max(0, next.campaignStats.deaths - beforeDeaths);
  const missing = Math.max(0, next.campaignStats.missing - beforeMissing);
  const workerEnergyCost = Math.max(0, beforeEnergy - sumEnergy(next, plan.partyIds));
  const addedFlags = next.storyFlags.filter((flag) => !beforeFlags.has(flag));
  const eventId = expeditionEvent?.id ?? null;
  const uniqueEventValue = eventId && !seenEventIds.has(eventId) ? 1 : 0;
  if (eventId) seenEventIds.add(eventId);
  const storyUnlockValue = storyValue(addedFlags);
  const rewardValue = rewardRation + rewardMedicine * 3 + rewardMaterials * 1.2 + rewardParts * 2;
  const netValue = rewardValue + uniqueEventValue * 1.5 + storyUnlockValue * 2 - injury * 4 - death * 35 - missing * 18 - workerEnergyCost * 0.08;
  const firstVisit = !beforeStart.storyFlags.includes(`visited:${plan.locationId}`);

  if (expeditionEvent) {
    events.push({
      day: state.day,
      id: expeditionEvent.id,
      family: `expedition:${plan.locationId}`,
      mechanicalFamily: `expedition:${[...expeditionEvent.tags].sort().slice(0, 3).join('+') || 'generic'}`,
      source: 'expedition',
      characterIds: [...plan.partyIds],
      locationId: plan.locationId,
      choiceId: stance,
    });
  }

  return {
    state: next,
    illegal: 0,
    record: {
      day: state.day,
      locationId: plan.locationId,
      eventId,
      firstVisit,
      rewardRation,
      rewardMedicine,
      rewardMaterials,
      rewardParts,
      injury,
      death,
      missing,
      workerEnergyCost,
      netValue,
      uniqueEventValue,
      storyUnlockValue,
    },
  };
}

export function resolveNightWithPolicy(
  input: GameState,
  policy: SimulationPolicy,
  rng: AuditRng,
  events: AuditEventRecord[] = [],
): GameState {
  let next = scheduleNight(input);
  let guard = 0;
  while (next.phase === 'night' && guard < 80) {
    const event = currentNightEvent(next);
    if (!event) throw new Error(`night has no current event on DAY ${next.day}`);
    const choices = event.choices.filter((choice) => canAffordNightChoice(next, choice));
    if (!choices.length) throw new Error(`no affordable/legal night choice for ${event.id}`);
    const choice = policy.chooseNightChoice(next, event, choices, rng);
    if (!choices.some((candidate) => candidate.id === choice.id)) throw new Error(`${policy.id} selected illegal night choice ${choice.id}`);
    const characterIds = [...(event.requiredSurvivorIds ?? [])];
    next = chooseNightOption(next, choice.id);
    if (next.pendingCheck) {
      next = rollPendingCheck(next);
      const actorId = next.pendingCheck?.actorId;
      if (actorId) characterIds.push(actorId);
      if (canTrustReroll(next) && policy.shouldTrustReroll(next)) next = rerollLowestDie(next);
      next = acceptNightCheckResult(next);
    }
    events.push({
      day: input.day,
      id: event.id,
      family: `night:${event.category}`,
      mechanicalFamily: eventMechanicalFamily(event),
      source: 'night',
      characterIds: [...new Set(characterIds)],
      choiceId: choice.id,
    });
    guard += 1;
  }
  if (guard >= 80) throw new Error(`night loop exceeded guard on DAY ${input.day}`);
  if (next.phase !== 'night-summary') throw new Error(`night terminated in unexpected phase ${next.phase} on DAY ${input.day}`);
  if (next.pendingCheck) throw new Error(`night left a pending check on DAY ${input.day}`);
  return next;
}

function makeDailyRecord(dayStart: GameState, preNight: GameState, endNight: GameState): DailyRecord {
  const meal = previewMeal(preNight);
  const support = communitySupportSummary(preNight);
  const coreWorking = Object.values(preNight.dayAssignments).filter((assignment) => assignment !== 'rest').length;
  const communityLabor = support.cookingCapacity / 2.5
    + support.repairDefense / 2
    + support.medicalAssist
    + support.nightRiskReduction / 0.04;
  const communityContribution = support.cookingCapacity + support.repairDefense + support.medicalAssist * 2 + support.nightRiskReduction * 25;
  const people = visiblePopulation(endNight);
  const resourceBefore = weightedInventory(dayStart);
  const resourcePreNight = weightedInventory(preNight);
  const resourceAfter = weightedInventory(endNight);
  const foodProduction = Math.max(0, preNight.inventory.ration - dayStart.inventory.ration);
  const production = Math.max(0, resourcePreNight - resourceBefore);
  return {
    day: dayStart.day,
    food: endNight.inventory.ration,
    population: people,
    residentPopulation: Math.max(0, endNight.civilianResidents),
    coreSurvivorCount: presentCore(endNight),
    healthySurvivors: countCondition(endNight, ['healthy', 'fatigued']),
    injuredSurvivors: countCondition(endNight, ['minor', 'serious', 'critical']),
    missingSurvivors: countCondition(endNight, ['missing']),
    deadSurvivors: countCondition(endNight, ['dead']),
    foodProduction,
    foodConsumption: meal.rationConsumed,
    production,
    consumption: meal.rationConsumed,
    communityLabor,
    communityContribution,
    coreLaborReleased: Math.min(presentCore(preNight), communityLabor),
    totalEffectiveLabor: coreWorking + communityLabor,
    dailyNetFood: endNight.inventory.ration - dayStart.inventory.ration,
    dailyNetResources: resourceAfter - resourceBefore,
    explorationProgress: endNight.storyFlags.filter((flag) => flag.startsWith('visited:')).length / EXPEDITION_LOCATIONS.length,
    failed: presentCore(endNight) <= 0,
  };
}

export function simulateRun(seed: number, policy: SimulationPolicy): RunRecord {
  const rng = new AuditRng(policySeed(seed, policy.id));
  let state = createV060InitialState(seed);
  const daily: DailyRecord[] = [];
  const principles: PrinciplePickRecord[] = [];
  const expeditions: ExpeditionRecord[] = [];
  const events: AuditEventRecord[] = [];
  const seenEventIds = new Set<string>();
  let failureDay: number | null = null;
  let failureReason: string | null = null;
  let illegalActionCount = 0;
  let dayGuard = 0;

  while (state.day < 30 && dayGuard < 35) {
    const dayStart = structuredClone(state);
    state = drainCampaignEvents(state, events);
    state = applyPrincipleDecision(state, policy, rng, events, principles);
    state = maybeUpgradeBuilding(state, policy, rng, events);
    state = maybeSelectCommunityMode(state, policy, rng);

    const expeditionPlan = chooseExpeditionPlan(state, policy, rng);
    const assignments = assignCoreJobs(state, policy, rng, expeditionPlan);
    state = assignments.state;
    illegalActionCount += assignments.illegal;
    state = lockDayAssignments(state);

    const expedition = resolveExpedition(state, expeditionPlan, policy, events, seenEventIds);
    state = expedition.state;
    illegalActionCount += expedition.illegal;
    if (expedition.record) expeditions.push(expedition.record);

    const preNight = state;
    state = finalizeDay(state);
    if (state.phase !== 'night') throw new Error(`finalizeDay failed to reach night on DAY ${state.day}`);
    state = resolveNightWithPolicy(state, policy, rng, events);
    daily.push(makeDailyRecord(dayStart, preNight, state));

    if (failureDay === null && presentCore(state) <= 0) {
      failureDay = state.day;
      failureReason = 'all-core-lost';
    }

    state = advanceCampaignDay(state);
    dayGuard += 1;
  }

  if (dayGuard >= 35) throw new Error(`campaign did not terminate for ${policy.id} seed ${seed}`);
  if (state.day !== 30 || state.phase !== 'ending' || !state.ending) throw new Error(`campaign failed to reach deterministic DAY30 ending for ${policy.id} seed ${seed}`);
  if (failureDay === null && state.ending.tier === 'bad') {
    failureDay = 30;
    failureReason = `ending:${state.ending.id}`;
  }
  return { seed, policyId: policy.id, finalState: state, daily, principles, expeditions, events, failureDay, failureReason, illegalActionCount };
}

export function assertStateInvariants(state: GameState): void {
  const inventoryValues = Object.values(state.inventory);
  if (inventoryValues.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('inventory invariant violated');
  if (!Number.isFinite(state.civilianResidents) || state.civilianResidents < 0) throw new Error('civilian population invariant violated');
  if (state.communityState.pendingResidents < 0 || state.communityState.activeResidents < 0) throw new Error('community invariant violated');
  if (state.communityState.pendingResidents + state.communityState.activeResidents > state.civilianResidents) throw new Error('community residents exceed civilian population');
  for (const survivor of state.survivors) {
    if (!Number.isFinite(survivor.energy)) throw new Error(`survivor energy NaN: ${survivor.id}`);
  }
  for (const level of Object.values(state.buildings)) if (!Number.isInteger(level) || level < 0 || level > 3) throw new Error('building level invariant violated');
}
