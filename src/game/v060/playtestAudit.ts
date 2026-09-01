import { canTrustReroll, rerollLowestDie, rollPendingCheck, totalModifier } from '../dice';
import type { BuildingId, GameState, StreetPrincipleId, Survivor } from '../types';
import { canUpgradeBuilding, upgradeBuilding } from './buildings';
import { advanceCampaignDay, createV060InitialState, finalizeDay, resolveExpeditionStance, searchForMissing } from './campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from './campaignEvents';
import { communitySupportUnlocked, selectCommunitySupportMode } from './community';
import { acceptCommunityRequest, pendingCommunityRequest } from './communityPromises';
import { assignDayJob, lockDayAssignments, survivorAvailableForDay } from './dayManagement';
import { availableExpeditionLocations, drawExpeditionEvent, expeditionRiskLabel, expeditionRiskScore, startExpedition } from './expedition';
import { previewMeal } from './food';
import { acceptNightCheckResult, canAffordNightChoice, chooseNightOption, currentNightEvent, nightCheckContext, scheduleNight } from './nightScheduler';
import type { NightChoice, NightEffect, V060NightEvent } from './nightEvents';
import { choosePrinciple, pendingPrincipleDecision } from './principles';

export type AuditStyle = 'cautious' | 'balanced' | 'aggressive';

export interface AuditPolicy {
  id: string;
  style: AuditStyle;
  principles: [StreetPrincipleId, StreetPrincipleId, StreetPrincipleId];
  buildingPriority: BuildingId[];
}

export interface AuditDaySnapshot {
  day: number;
  ration: number;
  medicine: number;
  power: number;
  materials: number;
  parts: number;
  hope: number;
  defense: number;
  residents: number;
  corePresent: number;
  seriousOrCritical: number;
  mealQuality: string;
}

export interface AuditLocationVisit {
  day: number;
  locationId: string;
  risk: string;
  stance: 'push' | 'careful' | 'retreat';
  rationDelta: number;
  medicineDelta: number;
  powerDelta: number;
  materialsDelta: number;
  partsDelta: number;
  missingDelta: number;
  deathDelta: number;
}

export interface AuditRunResult {
  seed: number;
  policyId: string;
  endingId: string | null;
  endingTier: string | null;
  finalHordeResult: string | null;
  deaths: number;
  missing: number;
  rescued: number;
  expeditions: number;
  peakResidents: number;
  firstShortageDay: number | null;
  firstSeriousDay: number | null;
  days: AuditDaySnapshot[];
  eventCounts: Record<string, number>;
  finalChoiceCounts: Record<string, number>;
  locationVisits: AuditLocationVisit[];
  principles: StreetPrincipleId[];
  completed: boolean;
  stalledReason?: string;
}

export interface AuditBatchSummary {
  policyId: string;
  runs: number;
  completionRate: number;
  successRate: number;
  perfectRate: number;
  averageDeaths: number;
  averageRescued: number;
  averagePeakResidents: number;
  averageFirstShortageDay: number | null;
  averageFirstSeriousDay: number | null;
  endingCounts: Record<string, number>;
  finalHordeCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  finalChoiceCounts: Record<string, number>;
  locationVisitCounts: Record<string, number>;
  locationDeathCounts: Record<string, number>;
  locationMissingCounts: Record<string, number>;
  residentBands: Record<string, { runs: number; successRate: number }>;
  dayAverages: AuditDaySnapshot[];
}

export interface PrincipleAuditRow {
  principle: StreetPrincipleId;
  stage: 7 | 14 | 21;
  runs: number;
  successRate: number;
  perfectRate: number;
  averageDeaths: number;
  averageRescued: number;
  averagePeakResidents: number;
}

export interface FullAuditReport {
  generatedAt: string;
  simulatorVersion: 1;
  totalRuns: number;
  policies: AuditBatchSummary[];
  principles: PrincipleAuditRow[];
  diagnostics: {
    dominantDay29Choices: Array<{ choiceId: string; share: number; uses: number }>;
    underusedLocations: Array<{ locationId: string; visitShare: number; visits: number }>;
    highRepeatEvents: Array<{ eventId: string; averagePerRun: number; occurrences: number }>;
    residentSuccessBands: Record<string, { runs: number; successRate: number }>;
    warnings: string[];
  };
}

const DEFAULT_BUILDINGS: Record<AuditStyle, BuildingId[]> = {
  cautious: ['clinic', 'watchPost', 'shelter', 'workshop', 'searchStation', 'radio'],
  balanced: ['workshop', 'shelter', 'clinic', 'watchPost', 'searchStation', 'radio'],
  aggressive: ['searchStation', 'workshop', 'radio', 'shelter', 'watchPost', 'clinic'],
};

export const DEFAULT_AUDIT_POLICIES: AuditPolicy[] = [
  {
    id: 'cautious',
    style: 'cautious',
    principles: ['triage-first', 'preserve-strength', 'prepare-evacuation'],
    buildingPriority: DEFAULT_BUILDINGS.cautious,
  },
  {
    id: 'balanced',
    style: 'balanced',
    principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'],
    buildingPriority: DEFAULT_BUILDINGS.balanced,
  },
  {
    id: 'aggressive',
    style: 'aggressive',
    principles: ['outward-search', 'core-leads', 'await-aid'],
    buildingPriority: DEFAULT_BUILDINGS.aggressive,
  },
];

const present = (survivor: Survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing';
const active = (survivor: Survivor) => present(survivor) && survivorAvailableForDay(survivor);
const corePresent = (state: GameState) => state.survivors.filter(present).length;
const severeCount = (state: GameState) => state.survivors.filter((survivor) => survivor.condition === 'serious' || survivor.condition === 'critical').length;
const population = (state: GameState) => corePresent(state) + Math.max(0, state.civilianResidents);

function resolveStreetPrompts(input: GameState, policy: AuditPolicy): GameState {
  let state = input;
  for (let guard = 0; guard < 24; guard += 1) {
    const event = pendingCampaignEvent(state);
    if (event) {
      state = resolveCampaignEvent(state, event.id);
      continue;
    }
    const principle = pendingPrincipleDecision(state);
    if (principle) {
      const target = policy.principles[principle.day === 7 ? 0 : principle.day === 14 ? 1 : 2];
      const choice = principle.choices.some((item) => item.id === target) ? target : principle.choices[0]?.id;
      if (choice) state = choosePrinciple(state, choice);
      continue;
    }
    break;
  }
  return state;
}

function maybeAcceptPromise(input: GameState): GameState {
  const request = pendingCommunityRequest(input);
  if (!request) return input;
  return acceptCommunityRequest(input, request.id);
}

function maybeSearchMissing(input: GameState): GameState {
  const missing = input.survivors.find((survivor) => survivor.condition === 'missing');
  if (!missing) return input;
  if (input.buildings.radio > 0 && input.inventory.power >= 8) return searchForMissing(input, missing.id, 'radio');
  const helpers = input.survivors.filter((survivor) => survivor.id !== missing.id && active(survivor) && !input.dayState.committedSurvivorIds.includes(survivor.id));
  return helpers.length >= 2 ? searchForMissing(input, missing.id, 'team') : input;
}

function chooseCommunitySupport(input: GameState): GameState {
  if (!communitySupportUnlocked(input) || input.communityState.activeResidents < 5) return input;
  if (input.defense < 58) return selectCommunitySupportMode(input, 'defense');
  if (input.inventory.ration < Math.max(10, population(input) * 2)) return selectCommunitySupportMode(input, 'logistics');
  return selectCommunitySupportMode(input, 'repair');
}

function upgradeOneBuilding(input: GameState, policy: AuditPolicy): GameState {
  for (const id of policy.buildingPriority) {
    if (canUpgradeBuilding(input, id).allowed) return upgradeBuilding(input, id);
  }
  return input;
}

function resourceNeed(state: GameState, resource: 'ration' | 'medicine' | 'materials' | 'parts'): number {
  if (resource === 'ration') return Math.max(0, population(state) * 4 - state.inventory.ration) / Math.max(1, population(state));
  if (resource === 'medicine') return Math.max(0, 8 - state.inventory.medicine) * 1.5;
  if (resource === 'materials') return Math.max(0, 28 - state.inventory.materials) / 4;
  return Math.max(0, 16 - state.inventory.parts) / 3;
}

function chooseLocation(state: GameState, policy: AuditPolicy): string | null {
  const candidates = availableExpeditionLocations(state);
  if (!candidates.length) return null;
  const visited = new Set(state.storyFlags.filter((flag) => flag.startsWith('visited:')).map((flag) => flag.slice('visited:'.length)));
  const styleRisk = policy.style === 'cautious' ? 1.7 : policy.style === 'aggressive' ? 0.65 : 1.05;
  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const location of candidates) {
    const need = resourceNeed(state, location.primary) * 2.2 + resourceNeed(state, location.secondary);
    const firstVisit = visited.has(location.id) ? 0 : 2.5;
    const routeBonus = ['subway', 'bus-station', 'warehouse', 'hospital'].includes(location.id) && state.day >= location.unlockDay + 2 ? 1.5 : 0;
    const riskPenalty = location.danger * styleRisk;
    const score = need + firstVisit + routeBonus - riskPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestId = location.id;
    }
  }
  return bestId;
}

function candidateOrder(state: GameState): Survivor[] {
  return state.survivors
    .filter((survivor) => active(survivor) && !state.dayState.committedSurvivorIds.includes(survivor.id))
    .sort((a, b) => b.energy - a.energy);
}

function pickForRole(state: GameState, specialty: string, excluded = new Set<string>()): Survivor | undefined {
  const candidates = candidateOrder(state).filter((survivor) => !excluded.has(survivor.id));
  return candidates.find((survivor) => survivor.specialty === specialty) ?? candidates[0];
}

function assign(input: GameState, survivor: Survivor | undefined, job: Parameters<typeof assignDayJob>[2]): GameState {
  return survivor ? assignDayJob(input, survivor.id, job) : input;
}

function planDay(input: GameState, policy: AuditPolicy): { state: GameState; expeditionParty: string[]; locationId: string | null } {
  let state = input;
  const used = new Set<string>(state.dayState.committedSurvivorIds);
  const locationId = chooseLocation(state, policy);
  const expeditionParty: string[] = [];

  const exploreToday = Boolean(locationId) && (policy.style !== 'cautious' || state.day <= 18 || state.inventory.ration < population(state) * 3 || state.inventory.materials < 12);
  if (exploreToday && locationId) {
    const searcher = pickForRole(state, 'search', used);
    if (searcher && searcher.energy >= (policy.style === 'aggressive' ? 24 : 35)) {
      state = assign(state, searcher, 'expedition');
      if (state.dayAssignments[searcher.id] === 'expedition') {
        expeditionParty.push(searcher.id);
        used.add(searcher.id);
      }
    }
    if (expeditionParty.length && policy.style !== 'aggressive') {
      const escort = pickForRole(state, 'watch', used);
      if (escort && escort.energy >= 42) {
        state = assign(state, escort, 'expedition');
        if (state.dayAssignments[escort.id] === 'expedition') {
          expeditionParty.push(escort.id);
          used.add(escort.id);
        }
      }
    }
  }

  if (severeCount(state) > 0 && state.buildings.clinic > 0) {
    const medic = pickForRole(state, 'medical', used);
    state = assign(state, medic, 'medical');
    if (medic && state.dayAssignments[medic.id] === 'medical') used.add(medic.id);
  }

  if (state.defense < 68 && state.buildings.watchPost > 0) {
    const watcher = pickForRole(state, 'watch', used);
    state = assign(state, watcher, 'watch');
    if (watcher && state.dayAssignments[watcher.id] === 'watch') used.add(watcher.id);
  }

  if (state.buildings.workshop > 0 && (state.defense < 76 || policy.style === 'cautious')) {
    const repairer = pickForRole(state, 'repair', used);
    state = assign(state, repairer, 'repair');
    if (repairer && state.dayAssignments[repairer.id] === 'repair') used.add(repairer.id);
  }

  if (state.buildings.radio > 0 && state.day >= 9 && (policy.style === 'aggressive' || state.day % 3 === 0)) {
    const radio = pickForRole(state, 'radio', used);
    state = assign(state, radio, 'radio');
    if (radio && state.dayAssignments[radio.id] === 'radio') used.add(radio.id);
  }

  for (let guard = 0; guard < 3; guard += 1) {
    const meal = previewMeal(state);
    if (meal.quality !== 'cold' && meal.quality !== 'struggling') break;
    const cook = pickForRole(state, 'cook', used);
    if (!cook) break;
    state = assign(state, cook, 'cook');
    if (state.dayAssignments[cook.id] !== 'cook') break;
    used.add(cook.id);
  }

  return { state, expeditionParty, locationId: expeditionParty.length ? locationId : null };
}

function effectScore(effect: NightEffect | undefined): number {
  if (!effect) return 0;
  const conditionPenalty: Record<string, number> = { healthy: 0, fatigued: -2, minor: -5, serious: -14, critical: -25, dead: -50, missing: -35 };
  return (effect.hope ?? 0) * 1.8
    + (effect.defense ?? 0) * 1.25
    + (effect.power ?? 0) * 0.18
    + (effect.inventory?.ration ?? 0) * 1.1
    + (effect.inventory?.medicine ?? 0) * 2.2
    + (effect.inventory?.materials ?? 0) * 0.75
    + (effect.inventory?.parts ?? 0) * 1.05
    + (effect.actorCondition ? conditionPenalty[effect.actorCondition] ?? 0 : 0);
}

function costPenalty(state: GameState, choice: NightChoice): number {
  const cost = choice.cost;
  if (!cost) return 0;
  let penalty = (cost.ration ?? 0) * 1.2 + (cost.medicine ?? 0) * 2.5 + (cost.materials ?? 0) * 0.85 + (cost.parts ?? 0) * 1.15 + (cost.power ?? 0) * 0.2;
  if ((cost.medicine ?? 0) > 0 && state.inventory.medicine - (cost.medicine ?? 0) < 2) penalty += 5;
  if ((cost.ration ?? 0) > 0 && state.inventory.ration - (cost.ration ?? 0) < population(state)) penalty += 4;
  if ((cost.power ?? 0) > 0 && state.inventory.power - (cost.power ?? 0) < 12) penalty += 3;
  return penalty;
}

function checkedChoiceScore(state: GameState, choice: NightChoice): number {
  const context = nightCheckContext(state, choice);
  const modifier = totalModifier(context.modifiers);
  const success = effectScore(choice.outcomes?.success);
  const partial = effectScore(choice.outcomes?.partial);
  const failure = effectScore(choice.outcomes?.failure);
  const modeBias = context.mode === 'advantage' ? 1.5 : context.mode === 'disadvantage' ? -2 : 0;
  return success * 0.48 + partial * 0.32 + failure * 0.2 + modifier * 1.1 + modeBias;
}

function chooseNightChoice(state: GameState, event: V060NightEvent, policy: AuditPolicy): NightChoice | null {
  let best: NightChoice | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const choice of event.choices) {
    if (!canAffordNightChoice(state, choice)) continue;
    let score = 0;
    if (choice.check) score = checkedChoiceScore(state, choice);
    else score = effectScore(choice.direct) - costPenalty(state, choice);
    if (choice.strategy === 'resource') score += policy.style === 'cautious' ? 3 : policy.style === 'balanced' ? 1.2 : -0.5;
    if (choice.strategy === 'person') score += policy.style === 'aggressive' ? 2 : policy.style === 'balanced' ? 0.8 : 0;
    if (choice.strategy === 'consequence') score -= policy.style === 'cautious' ? 1.5 : 0.4;
    if ((event.category === 'horde' || event.category === 'emergency') && choice.strategy === 'resource') score += 2.5;
    if (event.id.startsWith('mortality-medical:') && choice.id === 'mortality-medicine') score += 9;
    if (event.id.startsWith('mortality-hope:') && choice.id === 'mortality-support') score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = choice;
    }
  }
  return best;
}

function playNight(input: GameState, policy: AuditPolicy, eventCounts: Record<string, number>, finalChoiceCounts: Record<string, number>): GameState {
  let state = scheduleNight(input);
  for (let guard = 0; guard < 32 && state.phase === 'night'; guard += 1) {
    const event = currentNightEvent(state);
    if (!event) break;
    eventCounts[event.id] = (eventCounts[event.id] ?? 0) + 1;
    const choice = chooseNightChoice(state, event, policy);
    if (!choice) return { ...state, phase: 'night-summary', lastMessage: `audit:no-affordable-choice:${event.id}` };
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

function takeDaySnapshot(state: GameState): AuditDaySnapshot {
  return {
    day: state.day,
    ration: state.inventory.ration,
    medicine: state.inventory.medicine,
    power: state.inventory.power,
    materials: state.inventory.materials,
    parts: state.inventory.parts,
    hope: state.hope,
    defense: state.defense,
    residents: state.civilianResidents,
    corePresent: corePresent(state),
    seriousOrCritical: severeCount(state),
    mealQuality: state.mealState.quality,
  };
}

export function runAuditGame(seed: number, policy: AuditPolicy): AuditRunResult {
  let state = createV060InitialState(seed);
  const days: AuditDaySnapshot[] = [];
  const eventCounts: Record<string, number> = {};
  const finalChoiceCounts: Record<string, number> = {};
  const locationVisits: AuditLocationVisit[] = [];
  let peakResidents = 0;
  let firstShortageDay: number | null = null;
  let firstSeriousDay: number | null = null;
  let stalledReason: string | undefined;

  for (let dayGuard = 0; dayGuard < 30 && state.phase !== 'ending'; dayGuard += 1) {
    state = resolveStreetPrompts(state, policy);
    state = maybeAcceptPromise(state);
    state = maybeSearchMissing(state);
    state = chooseCommunitySupport(state);
    state = upgradeOneBuilding(state, policy);
    state = resolveStreetPrompts(state, policy);

    const planned = planDay(state, policy);
    state = lockDayAssignments(planned.state);

    if (planned.locationId && planned.expeditionParty.length) {
      const before = state;
      const beforeMissing = before.campaignStats.missing;
      const beforeDeaths = before.campaignStats.deaths;
      const risk = expeditionRiskLabel(expeditionRiskScore(before, planned.expeditionParty, planned.locationId));
      state = startExpedition(state, planned.expeditionParty, planned.locationId);
      state = drawExpeditionEvent(state);
      let stance: 'push' | 'careful' | 'retreat' = policy.style === 'aggressive' ? 'push' : 'careful';
      if (policy.style === 'cautious' && risk === 'extreme') {
        const partyLow = planned.expeditionParty.some((id) => (state.survivors.find((survivor) => survivor.id === id)?.energy ?? 0) < 50);
        if (partyLow) stance = 'retreat';
      }
      state = stance === 'retreat' ? { ...state, phase: 'dusk' } : resolveExpeditionStance(state, stance);
      if (stance === 'retreat') {
        const { retreatCurrentExpedition } = requireCampaignRetreat();
        state = retreatCurrentExpedition(state);
      }
      locationVisits.push({
        day: before.day,
        locationId: planned.locationId,
        risk,
        stance,
        rationDelta: state.inventory.ration - before.inventory.ration,
        medicineDelta: state.inventory.medicine - before.inventory.medicine,
        powerDelta: state.inventory.power - before.inventory.power,
        materialsDelta: state.inventory.materials - before.inventory.materials,
        partsDelta: state.inventory.parts - before.inventory.parts,
        missingDelta: state.campaignStats.missing - beforeMissing,
        deathDelta: state.campaignStats.deaths - beforeDeaths,
      });
    }

    state = finalizeDay(state);
    state = playNight(state, policy, eventCounts, finalChoiceCounts);
    if (state.phase !== 'night-summary') {
      stalledReason = `DAY ${state.day}: night did not settle (${state.phase})`;
      break;
    }

    peakResidents = Math.max(peakResidents, state.civilianResidents);
    if (firstShortageDay === null && (state.mealState.quality === 'cold' || state.mealState.quality === 'struggling')) firstShortageDay = state.day;
    if (firstSeriousDay === null && severeCount(state) > 0) firstSeriousDay = state.day;
    days.push(takeDaySnapshot(state));
    state = advanceCampaignDay(state);
  }

  return {
    seed,
    policyId: policy.id,
    endingId: state.ending?.id ?? null,
    endingTier: state.ending?.tier ?? null,
    finalHordeResult: state.finalHordeResult ?? null,
    deaths: state.campaignStats.deaths,
    missing: state.campaignStats.missing,
    rescued: state.campaignStats.rescued,
    expeditions: state.campaignStats.expeditions,
    peakResidents,
    firstShortageDay,
    firstSeriousDay,
    days,
    eventCounts,
    finalChoiceCounts,
    locationVisits,
    principles: [...(state.socialState?.principles ?? [])],
    completed: state.phase === 'ending' && state.day === 30,
    ...(stalledReason ? { stalledReason } : {}),
  };
}

// Kept behind a function to avoid a circular import at module initialization time in tooling bundles.
function requireCampaignRetreat(): { retreatCurrentExpedition: (state: GameState) => GameState } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./campaign') as { retreatCurrentExpedition: (state: GameState) => GameState };
}

function addCount(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
}

function averageNullable(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function success(run: AuditRunResult): boolean {
  return run.finalHordeResult === 'held' || run.finalHordeResult === 'perfect';
}

export function summarizeAuditRuns(policyId: string, runs: AuditRunResult[]): AuditBatchSummary {
  const completed = runs.filter((run) => run.completed);
  const endingCounts: Record<string, number> = {};
  const finalHordeCounts: Record<string, number> = {};
  const eventCounts: Record<string, number> = {};
  const finalChoiceCounts: Record<string, number> = {};
  const locationVisitCounts: Record<string, number> = {};
  const locationDeathCounts: Record<string, number> = {};
  const locationMissingCounts: Record<string, number> = {};
  for (const run of runs) {
    endingCounts[run.endingId ?? 'none'] = (endingCounts[run.endingId ?? 'none'] ?? 0) + 1;
    finalHordeCounts[run.finalHordeResult ?? 'none'] = (finalHordeCounts[run.finalHordeResult ?? 'none'] ?? 0) + 1;
    addCount(eventCounts, run.eventCounts);
    addCount(finalChoiceCounts, run.finalChoiceCounts);
    for (const visit of run.locationVisits) {
      locationVisitCounts[visit.locationId] = (locationVisitCounts[visit.locationId] ?? 0) + 1;
      locationDeathCounts[visit.locationId] = (locationDeathCounts[visit.locationId] ?? 0) + Math.max(0, visit.deathDelta);
      locationMissingCounts[visit.locationId] = (locationMissingCounts[visit.locationId] ?? 0) + Math.max(0, visit.missingDelta);
    }
  }

  const residentBands: Record<string, { runs: number; successRate: number }> = {};
  for (const [label, predicate] of [
    ['0-4', (run: AuditRunResult) => run.peakResidents <= 4],
    ['5-8', (run: AuditRunResult) => run.peakResidents >= 5 && run.peakResidents <= 8],
    ['9+', (run: AuditRunResult) => run.peakResidents >= 9],
  ] as const) {
    const band = completed.filter(predicate);
    residentBands[label] = { runs: band.length, successRate: band.length ? band.filter(success).length / band.length : 0 };
  }

  const dayAverages: AuditDaySnapshot[] = [];
  for (let day = 1; day <= 29; day += 1) {
    const snapshots = completed.map((run) => run.days.find((entry) => entry.day === day)).filter((entry): entry is AuditDaySnapshot => Boolean(entry));
    if (!snapshots.length) continue;
    const avg = (key: keyof AuditDaySnapshot) => snapshots.reduce((sum, item) => sum + Number(item[key] ?? 0), 0) / snapshots.length;
    dayAverages.push({
      day,
      ration: avg('ration'), medicine: avg('medicine'), power: avg('power'), materials: avg('materials'), parts: avg('parts'),
      hope: avg('hope'), defense: avg('defense'), residents: avg('residents'), corePresent: avg('corePresent'), seriousOrCritical: avg('seriousOrCritical'),
      mealQuality: snapshots.sort((a, b) => a.mealQuality.localeCompare(b.mealQuality))[Math.floor(snapshots.length / 2)]?.mealQuality ?? 'cold',
    });
  }

  return {
    policyId,
    runs: runs.length,
    completionRate: runs.length ? completed.length / runs.length : 0,
    successRate: completed.length ? completed.filter(success).length / completed.length : 0,
    perfectRate: completed.length ? completed.filter((run) => run.finalHordeResult === 'perfect').length / completed.length : 0,
    averageDeaths: completed.length ? completed.reduce((sum, run) => sum + run.deaths, 0) / completed.length : 0,
    averageRescued: completed.length ? completed.reduce((sum, run) => sum + run.rescued, 0) / completed.length : 0,
    averagePeakResidents: completed.length ? completed.reduce((sum, run) => sum + run.peakResidents, 0) / completed.length : 0,
    averageFirstShortageDay: averageNullable(completed.map((run) => run.firstShortageDay)),
    averageFirstSeriousDay: averageNullable(completed.map((run) => run.firstSeriousDay)),
    endingCounts,
    finalHordeCounts,
    eventCounts,
    finalChoiceCounts,
    locationVisitCounts,
    locationDeathCounts,
    locationMissingCounts,
    residentBands,
    dayAverages,
  };
}

function forcedPrinciplePolicy(principle: StreetPrincipleId): AuditPolicy {
  const base = DEFAULT_AUDIT_POLICIES[1];
  const day7 = ['everyone-shares', 'triage-first', 'outward-search'] as StreetPrincipleId[];
  const day14 = ['core-leads', 'community-shares-risk', 'preserve-strength'] as StreetPrincipleId[];
  const day21 = ['hold-the-street', 'prepare-evacuation', 'await-aid'] as StreetPrincipleId[];
  const principles: [StreetPrincipleId, StreetPrincipleId, StreetPrincipleId] = [...base.principles];
  if (day7.includes(principle)) principles[0] = principle;
  else if (day14.includes(principle)) principles[1] = principle;
  else if (day21.includes(principle)) principles[2] = principle;
  return { ...base, id: `principle:${principle}`, principles };
}

export function runFullAudit(options: { policyRuns?: number; principleRuns?: number; seedBase?: number } = {}): FullAuditReport {
  const policyRuns = Math.max(1, options.policyRuns ?? 200);
  const principleRuns = Math.max(1, options.principleRuns ?? 80);
  const seedBase = Math.max(1, options.seedBase ?? 860901);
  let seedCursor = seedBase;
  const policies: AuditBatchSummary[] = [];
  const allBaselineRuns: AuditRunResult[] = [];

  for (const policy of DEFAULT_AUDIT_POLICIES) {
    const runs: AuditRunResult[] = [];
    for (let index = 0; index < policyRuns; index += 1) runs.push(runAuditGame(seedCursor++, policy));
    allBaselineRuns.push(...runs);
    policies.push(summarizeAuditRuns(policy.id, runs));
  }

  const principleIds: StreetPrincipleId[] = [
    'everyone-shares', 'triage-first', 'outward-search',
    'core-leads', 'community-shares-risk', 'preserve-strength',
    'hold-the-street', 'prepare-evacuation', 'await-aid',
  ];
  const principles: PrincipleAuditRow[] = [];
  for (const principle of principleIds) {
    const policy = forcedPrinciplePolicy(principle);
    const runs: AuditRunResult[] = [];
    for (let index = 0; index < principleRuns; index += 1) runs.push(runAuditGame(seedCursor++, policy));
    const summary = summarizeAuditRuns(policy.id, runs);
    const stage: 7 | 14 | 21 = principleIds.indexOf(principle) < 3 ? 7 : principleIds.indexOf(principle) < 6 ? 14 : 21;
    principles.push({
      principle,
      stage,
      runs: summary.runs,
      successRate: summary.successRate,
      perfectRate: summary.perfectRate,
      averageDeaths: summary.averageDeaths,
      averageRescued: summary.averageRescued,
      averagePeakResidents: summary.averagePeakResidents,
    });
  }

  const totalBaselineRuns = allBaselineRuns.length;
  const choiceCounts: Record<string, number> = {};
  const eventCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  for (const run of allBaselineRuns) {
    addCount(choiceCounts, run.finalChoiceCounts);
    addCount(eventCounts, run.eventCounts);
    for (const visit of run.locationVisits) locationCounts[visit.locationId] = (locationCounts[visit.locationId] ?? 0) + 1;
  }
  const totalFinalChoices = Object.values(choiceCounts).reduce((sum, value) => sum + value, 0);
  const totalVisits = Object.values(locationCounts).reduce((sum, value) => sum + value, 0);
  const dominantDay29Choices = Object.entries(choiceCounts)
    .map(([choiceId, uses]) => ({ choiceId, uses, share: totalFinalChoices ? uses / totalFinalChoices : 0 }))
    .filter((entry) => entry.share >= 0.12)
    .sort((a, b) => b.share - a.share);
  const underusedLocations = Object.entries(locationCounts)
    .map(([locationId, visits]) => ({ locationId, visits, visitShare: totalVisits ? visits / totalVisits : 0 }))
    .filter((entry) => entry.visitShare < 0.025)
    .sort((a, b) => a.visitShare - b.visitShare);
  const highRepeatEvents = Object.entries(eventCounts)
    .map(([eventId, occurrences]) => ({ eventId, occurrences, averagePerRun: totalBaselineRuns ? occurrences / totalBaselineRuns : 0 }))
    .filter((entry) => entry.averagePerRun > 1.25)
    .sort((a, b) => b.averagePerRun - a.averagePerRun);

  const residentSuccessBands: Record<string, { runs: number; successRate: number }> = {};
  for (const label of ['0-4', '5-8', '9+']) {
    const grouped = policies.map((summary) => summary.residentBands[label]).filter((value) => value.runs > 0);
    const runs = grouped.reduce((sum, value) => sum + value.runs, 0);
    const weightedWins = grouped.reduce((sum, value) => sum + value.successRate * value.runs, 0);
    residentSuccessBands[label] = { runs, successRate: runs ? weightedWins / runs : 0 };
  }

  const warnings: string[] = [];
  for (const stage of [7, 14, 21] as const) {
    const rows = principles.filter((row) => row.stage === stage);
    const rates = rows.map((row) => row.successRate);
    if (rates.length && Math.max(...rates) - Math.min(...rates) > 0.15) warnings.push(`DAY ${stage} principle success-rate spread exceeds 15 percentage points.`);
  }
  if (dominantDay29Choices[0]?.share > 0.4) warnings.push(`DAY29 choice ${dominantDay29Choices[0].choiceId} exceeds 40% of all final-horde selections.`);
  if (underusedLocations.length) warnings.push(`${underusedLocations.length} exploration locations receive less than 2.5% of baseline visits.`);
  if (highRepeatEvents.length) warnings.push(`${highRepeatEvents.length} night events average more than 1.25 appearances per run.`);
  const lowResidents = residentSuccessBands['0-4'];
  const highResidents = residentSuccessBands['9+'];
  if (lowResidents.runs >= 20 && highResidents.runs >= 20 && highResidents.successRate - lowResidents.successRate > 0.25) warnings.push('Runs reaching 9+ residents outperform 0-4 resident runs by more than 25 percentage points.');

  return {
    generatedAt: new Date().toISOString(),
    simulatorVersion: 1,
    totalRuns: DEFAULT_AUDIT_POLICIES.length * policyRuns + principleIds.length * principleRuns,
    policies,
    principles,
    diagnostics: { dominantDay29Choices, underusedLocations, highRepeatEvents, residentSuccessBands, warnings },
  };
}
