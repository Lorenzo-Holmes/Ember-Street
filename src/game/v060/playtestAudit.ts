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

export type AuditStyle = 'cautious' | 'balanced' | 'aggressive';
export interface AuditPolicy { id: string; style: AuditStyle; principles: [StreetPrincipleId, StreetPrincipleId, StreetPrincipleId]; buildingPriority: BuildingId[]; }
export interface AuditDaySnapshot { day: number; ration: number; medicine: number; power: number; materials: number; parts: number; hope: number; defense: number; residents: number; corePresent: number; severe: number; }
export interface AuditRunResult {
  seed: number; policyId: string; completed: boolean; endingId: string | null; finalHordeResult: string | null;
  deaths: number; missing: number; rescued: number; expeditions: number; peakResidents: number;
  firstShortageDay: number | null; firstSeriousDay: number | null; days: AuditDaySnapshot[];
  eventCounts: Record<string, number>; finalChoiceCounts: Record<string, number>; locationVisits: Record<string, number>;
  locationDeaths: Record<string, number>; locationMissing: Record<string, number>; principles: StreetPrincipleId[]; stalledReason?: string;
}
export interface AuditBatchSummary {
  policyId: string; runs: number; completionRate: number; successRate: number; perfectRate: number; averageDeaths: number;
  averageRescued: number; averagePeakResidents: number; averageFirstShortageDay: number | null; averageFirstSeriousDay: number | null;
  endingCounts: Record<string, number>; finalHordeCounts: Record<string, number>; eventCounts: Record<string, number>;
  finalChoiceCounts: Record<string, number>; locationVisitCounts: Record<string, number>; locationDeathCounts: Record<string, number>;
  locationMissingCounts: Record<string, number>; residentBands: Record<string, { runs: number; successRate: number }>;
}
export interface PrincipleAuditRow { principle: StreetPrincipleId; stage: 7 | 14 | 21; runs: number; successRate: number; perfectRate: number; averageDeaths: number; averageRescued: number; }
export interface FullAuditReport {
  generatedAt: string; simulatorVersion: 1; totalRuns: number; policies: AuditBatchSummary[]; principles: PrincipleAuditRow[];
  diagnostics: {
    dominantDay29Choices: Array<{ choiceId: string; share: number; uses: number }>;
    underusedLocations: Array<{ locationId: string; visitShare: number; visits: number }>;
    highRepeatEvents: Array<{ eventId: string; averagePerRun: number; occurrences: number }>;
    residentSuccessBands: Record<string, { runs: number; successRate: number }>;
    warnings: string[];
  };
}

const PRIORITIES: Record<AuditStyle, BuildingId[]> = {
  cautious: ['clinic', 'watchPost', 'shelter', 'workshop', 'searchStation', 'radio'],
  balanced: ['workshop', 'shelter', 'clinic', 'watchPost', 'searchStation', 'radio'],
  aggressive: ['searchStation', 'workshop', 'radio', 'shelter', 'watchPost', 'clinic'],
};
export const DEFAULT_AUDIT_POLICIES: AuditPolicy[] = [
  { id: 'cautious', style: 'cautious', principles: ['triage-first', 'preserve-strength', 'prepare-evacuation'], buildingPriority: PRIORITIES.cautious },
  { id: 'balanced', style: 'balanced', principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'], buildingPriority: PRIORITIES.balanced },
  { id: 'aggressive', style: 'aggressive', principles: ['outward-search', 'core-leads', 'await-aid'], buildingPriority: PRIORITIES.aggressive },
];

const present = (s: Survivor) => s.condition !== 'dead' && s.condition !== 'missing';
const active = (s: Survivor) => present(s) && survivorAvailableForDay(s);
const corePresent = (s: GameState) => s.survivors.filter(present).length;
const severe = (s: GameState) => s.survivors.filter((v) => v.condition === 'serious' || v.condition === 'critical').length;
const population = (s: GameState) => corePresent(s) + Math.max(0, s.civilianResidents);
const addCounts = (to: Record<string, number>, from: Record<string, number>) => { for (const [k, v] of Object.entries(from)) to[k] = (to[k] ?? 0) + v; };
const avgNullable = (values: Array<number | null>) => { const xs = values.filter((v): v is number => v !== null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
const won = (r: AuditRunResult) => r.finalHordeResult === 'held' || r.finalHordeResult === 'perfect';

function resolvePrompts(input: GameState, policy: AuditPolicy): GameState {
  let state = input;
  for (let i = 0; i < 24; i += 1) {
    const event = pendingCampaignEvent(state);
    if (event) { state = resolveCampaignEvent(state, event.id); continue; }
    const decision = pendingPrincipleDecision(state);
    if (decision) {
      const target = policy.principles[decision.day === 7 ? 0 : decision.day === 14 ? 1 : 2];
      const choice = decision.choices.find((c) => c.id === target) ?? decision.choices[0];
      if (choice) state = choosePrinciple(state, choice.id);
      continue;
    }
    break;
  }
  return state;
}

function housekeeping(input: GameState, policy: AuditPolicy): GameState {
  let state = input;
  const request = pendingCommunityRequest(state);
  if (request) state = acceptCommunityRequest(state, request.id);
  const missing = state.survivors.find((s) => s.condition === 'missing');
  if (missing) {
    if (state.buildings.radio > 0 && state.inventory.power >= 8) state = searchForMissing(state, missing.id, 'radio');
    else if (state.survivors.filter((s) => s.id !== missing.id && active(s) && !state.dayState.committedSurvivorIds.includes(s.id)).length >= 2) state = searchForMissing(state, missing.id, 'team');
  }
  if (communitySupportUnlocked(state) && state.communityState.activeResidents >= 5) {
    const mode = state.defense < 58 ? 'defense' : state.inventory.ration < population(state) * 2 ? 'logistics' : 'repair';
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

function chooseLocation(state: GameState, policy: AuditPolicy): string | null {
  const styleRisk = policy.style === 'cautious' ? 1.7 : policy.style === 'aggressive' ? 0.65 : 1.05;
  const visited = new Set(state.storyFlags.filter((f) => f.startsWith('visited:')).map((f) => f.slice(8)));
  let best: { id: string; score: number } | null = null;
  for (const loc of availableExpeditionLocations(state)) {
    const score = resourceNeed(state, loc.primary) * 2.2
      + resourceNeed(state, loc.secondary)
      + (loc.tertiary ? resourceNeed(state, loc.tertiary) * 0.55 : 0)
      + (visited.has(loc.id) ? 0 : 2.5)
      - loc.danger * styleRisk;
    if (!best || score > best.score) best = { id: loc.id, score };
  }
  return best?.id ?? null;
}

function candidates(state: GameState, used: Set<string>): Survivor[] {
  return state.survivors.filter((s) => active(s) && !used.has(s.id) && !state.dayState.committedSurvivorIds.includes(s.id)).sort((a, b) => b.energy - a.energy);
}
function pick(state: GameState, used: Set<string>, specialty: string): Survivor | undefined { const xs = candidates(state, used); return xs.find((s) => s.specialty === specialty) ?? xs[0]; }
function assign(state: GameState, survivor: Survivor | undefined, job: Parameters<typeof assignDayJob>[2]): GameState { return survivor ? assignDayJob(state, survivor.id, job) : state; }

function planDay(input: GameState, policy: AuditPolicy): { state: GameState; party: string[]; location: string | null } {
  let state = input;
  const used = new Set(state.dayState.committedSurvivorIds);
  const location = chooseLocation(state, policy);
  const party: string[] = [];
  const explore = Boolean(location) && (policy.style !== 'cautious' || state.day <= 18 || state.inventory.ration < population(state) * 3 || state.inventory.materials < 12);
  if (explore && location) {
    const searcher = pick(state, used, 'search');
    if (searcher && searcher.energy >= (policy.style === 'aggressive' ? 24 : 35)) {
      state = assign(state, searcher, 'expedition');
      if (state.dayAssignments[searcher.id] === 'expedition') { party.push(searcher.id); used.add(searcher.id); }
    }
    if (party.length && policy.style !== 'aggressive') {
      const escort = pick(state, used, 'watch');
      if (escort && escort.energy >= 42) { state = assign(state, escort, 'expedition'); if (state.dayAssignments[escort.id] === 'expedition') { party.push(escort.id); used.add(escort.id); } }
    }
  }
  if (severe(state) > 0 && state.buildings.clinic > 0) { const v = pick(state, used, 'medical'); state = assign(state, v, 'medical'); if (v && state.dayAssignments[v.id] === 'medical') used.add(v.id); }
  if (state.defense < 68 && state.buildings.watchPost > 0) { const v = pick(state, used, 'watch'); state = assign(state, v, 'watch'); if (v && state.dayAssignments[v.id] === 'watch') used.add(v.id); }
  if (state.buildings.workshop > 0 && (state.defense < 76 || policy.style === 'cautious')) { const v = pick(state, used, 'repair'); state = assign(state, v, 'repair'); if (v && state.dayAssignments[v.id] === 'repair') used.add(v.id); }
  if (state.buildings.radio > 0 && state.day >= 9 && (policy.style === 'aggressive' || state.day % 3 === 0)) { const v = pick(state, used, 'radio'); state = assign(state, v, 'radio'); if (v && state.dayAssignments[v.id] === 'radio') used.add(v.id); }
  for (let i = 0; i < 3; i += 1) {
    const meal = previewMeal(state);
    if (meal.quality !== 'cold' && meal.quality !== 'struggling') break;
    const v = pick(state, used, 'cook'); if (!v) break;
    state = assign(state, v, 'cook'); if (state.dayAssignments[v.id] !== 'cook') break; used.add(v.id);
  }
  return { state, party, location: party.length ? location : null };
}

function effectScore(e?: NightEffect): number {
  if (!e) return 0;
  const injury: Record<string, number> = { fatigued: -2, minor: -5, serious: -14, critical: -25, dead: -50, missing: -35 };
  return (e.hope ?? 0) * 1.8 + (e.defense ?? 0) * 1.25 + (e.power ?? 0) * 0.18 + (e.inventory?.ration ?? 0) * 1.1 + (e.inventory?.medicine ?? 0) * 2.2 + (e.inventory?.materials ?? 0) * 0.75 + (e.inventory?.parts ?? 0) * 1.05 + (e.actorCondition ? injury[e.actorCondition] ?? 0 : 0);
}
function costPenalty(state: GameState, c: NightChoice): number {
  if (!c.cost) return 0;
  let p = (c.cost.ration ?? 0) * 1.2 + (c.cost.medicine ?? 0) * 2.5 + (c.cost.materials ?? 0) * 0.85 + (c.cost.parts ?? 0) * 1.15 + (c.cost.power ?? 0) * 0.2;
  if ((c.cost.medicine ?? 0) > 0 && state.inventory.medicine - (c.cost.medicine ?? 0) < 2) p += 5;
  if ((c.cost.ration ?? 0) > 0 && state.inventory.ration - (c.cost.ration ?? 0) < population(state)) p += 4;
  return p;
}
function choiceScore(state: GameState, event: V060NightEvent, c: NightChoice, policy: AuditPolicy): number {
  let score = c.check ? (() => { const ctx = nightCheckContext(state, c); return effectScore(c.outcomes?.success) * 0.48 + effectScore(c.outcomes?.partial) * 0.32 + effectScore(c.outcomes?.failure) * 0.2 + totalModifier(ctx.modifiers) * 1.1 + (ctx.mode === 'advantage' ? 1.5 : ctx.mode === 'disadvantage' ? -2 : 0); })() : effectScore(c.direct) - costPenalty(state, c);
  if (c.strategy === 'resource') score += policy.style === 'cautious' ? 3 : policy.style === 'balanced' ? 1.2 : -0.5;
  if (c.strategy === 'person') score += policy.style === 'aggressive' ? 2 : policy.style === 'balanced' ? 0.8 : 0;
  if (c.strategy === 'consequence') score -= policy.style === 'cautious' ? 1.5 : 0.4;
  if ((event.category === 'horde' || event.category === 'emergency') && c.strategy === 'resource') score += 2.5;
  if (event.id.startsWith('mortality-medical:') && c.id === 'mortality-medicine') score += 9;
  return score;
}
function chooseNight(state: GameState, event: V060NightEvent, policy: AuditPolicy): NightChoice | null {
  return event.choices.filter((c) => canAffordNightChoice(state, c)).sort((a, b) => choiceScore(state, event, b, policy) - choiceScore(state, event, a, policy))[0] ?? null;
}
function playNight(input: GameState, policy: AuditPolicy, events: Record<string, number>, finals: Record<string, number>): GameState {
  let state = scheduleNight(input);
  for (let i = 0; i < 32 && state.phase === 'night'; i += 1) {
    const event = currentNightEvent(state); if (!event) break;
    events[event.id] = (events[event.id] ?? 0) + 1;
    const choice = chooseNight(state, event, policy); if (!choice) break;
    if (state.day === 29) finals[choice.id] = (finals[choice.id] ?? 0) + 1;
    state = chooseNightOption(state, choice.id);
    if (state.pendingCheck) { state = rollPendingCheck(state); if (state.pendingCheck?.outcome === 'failure' && canTrustReroll(state)) state = rerollLowestDie(state); state = acceptNightCheckResult(state); }
  }
  return state;
}

export function runAuditGame(seed: number, policy: AuditPolicy): AuditRunResult {
  let state = createV060InitialState(seed);
  const days: AuditDaySnapshot[] = [], eventCounts: Record<string, number> = {}, finalChoiceCounts: Record<string, number> = {}, locationVisits: Record<string, number> = {}, locationDeaths: Record<string, number> = {}, locationMissing: Record<string, number> = {};
  let peakResidents = 0, firstShortageDay: number | null = null, firstSeriousDay: number | null = null, stalledReason: string | undefined;
  for (let guard = 0; guard < 30 && state.phase !== 'ending'; guard += 1) {
    state = resolvePrompts(state, policy); state = housekeeping(state, policy);
    const plan = planDay(state, policy); state = lockDayAssignments(plan.state);
    if (plan.location && plan.party.length) {
      const beforeDeaths = state.campaignStats.deaths, beforeMissing = state.campaignStats.missing;
      const risk = expeditionRiskLabel(expeditionRiskScore(state, plan.party, plan.location));
      state = drawExpeditionEvent(startExpedition(state, plan.party, plan.location));
      if (policy.style === 'cautious' && risk === 'extreme' && plan.party.some((id) => (state.survivors.find((s) => s.id === id)?.energy ?? 0) < 50)) state = retreatCurrentExpedition(state);
      else state = resolveExpeditionStance(state, policy.style === 'aggressive' ? 'push' : 'careful');
      locationVisits[plan.location] = (locationVisits[plan.location] ?? 0) + 1;
      locationDeaths[plan.location] = (locationDeaths[plan.location] ?? 0) + Math.max(0, state.campaignStats.deaths - beforeDeaths);
      locationMissing[plan.location] = (locationMissing[plan.location] ?? 0) + Math.max(0, state.campaignStats.missing - beforeMissing);
    }
    state = playNight(finalizeDay(state), policy, eventCounts, finalChoiceCounts);
    if (state.phase !== 'night-summary') { stalledReason = `DAY ${state.day}: ${state.phase}`; break; }
    peakResidents = Math.max(peakResidents, state.civilianResidents);
    if (firstShortageDay === null && (state.mealState.quality === 'cold' || state.mealState.quality === 'struggling')) firstShortageDay = state.day;
    if (firstSeriousDay === null && severe(state) > 0) firstSeriousDay = state.day;
    days.push({ day: state.day, ration: state.inventory.ration, medicine: state.inventory.medicine, power: state.inventory.power, materials: state.inventory.materials, parts: state.inventory.parts, hope: state.hope, defense: state.defense, residents: state.civilianResidents, corePresent: corePresent(state), severe: severe(state) });
    state = advanceCampaignDay(state);
  }
  return { seed, policyId: policy.id, completed: state.phase === 'ending' && state.day === 30, endingId: state.ending?.id ?? null, finalHordeResult: state.finalHordeResult ?? null, deaths: state.campaignStats.deaths, missing: state.campaignStats.missing, rescued: state.campaignStats.rescued, expeditions: state.campaignStats.expeditions, peakResidents, firstShortageDay, firstSeriousDay, days, eventCounts, finalChoiceCounts, locationVisits, locationDeaths, locationMissing, principles: [...(state.socialState?.principles ?? [])], ...(stalledReason ? { stalledReason } : {}) };
}

export function summarizeAuditRuns(policyId: string, runs: AuditRunResult[]): AuditBatchSummary {
  const completed = runs.filter((r) => r.completed), endingCounts: Record<string, number> = {}, finalHordeCounts: Record<string, number> = {}, eventCounts: Record<string, number> = {}, finalChoiceCounts: Record<string, number> = {}, locationVisitCounts: Record<string, number> = {}, locationDeathCounts: Record<string, number> = {}, locationMissingCounts: Record<string, number> = {};
  for (const r of runs) { endingCounts[r.endingId ?? 'none'] = (endingCounts[r.endingId ?? 'none'] ?? 0) + 1; finalHordeCounts[r.finalHordeResult ?? 'none'] = (finalHordeCounts[r.finalHordeResult ?? 'none'] ?? 0) + 1; addCounts(eventCounts, r.eventCounts); addCounts(finalChoiceCounts, r.finalChoiceCounts); addCounts(locationVisitCounts, r.locationVisits); addCounts(locationDeathCounts, r.locationDeaths); addCounts(locationMissingCounts, r.locationMissing); }
  const residentBands: Record<string, { runs: number; successRate: number }> = {};
  for (const [label, pred] of [['0-4', (r: AuditRunResult) => r.peakResidents <= 4], ['5-8', (r: AuditRunResult) => r.peakResidents >= 5 && r.peakResidents <= 8], ['9+', (r: AuditRunResult) => r.peakResidents >= 9]] as const) { const band = completed.filter(pred); residentBands[label] = { runs: band.length, successRate: band.length ? band.filter(won).length / band.length : 0 }; }
  return { policyId, runs: runs.length, completionRate: runs.length ? completed.length / runs.length : 0, successRate: completed.length ? completed.filter(won).length / completed.length : 0, perfectRate: completed.length ? completed.filter((r) => r.finalHordeResult === 'perfect').length / completed.length : 0, averageDeaths: completed.length ? completed.reduce((s, r) => s + r.deaths, 0) / completed.length : 0, averageRescued: completed.length ? completed.reduce((s, r) => s + r.rescued, 0) / completed.length : 0, averagePeakResidents: completed.length ? completed.reduce((s, r) => s + r.peakResidents, 0) / completed.length : 0, averageFirstShortageDay: avgNullable(completed.map((r) => r.firstShortageDay)), averageFirstSeriousDay: avgNullable(completed.map((r) => r.firstSeriousDay)), endingCounts, finalHordeCounts, eventCounts, finalChoiceCounts, locationVisitCounts, locationDeathCounts, locationMissingCounts, residentBands };
}

function forcedPolicy(principle: StreetPrincipleId): AuditPolicy {
  const base = DEFAULT_AUDIT_POLICIES[1]; const p: [StreetPrincipleId, StreetPrincipleId, StreetPrincipleId] = [...base.principles];
  const d7: StreetPrincipleId[] = ['everyone-shares', 'triage-first', 'outward-search'], d14: StreetPrincipleId[] = ['core-leads', 'community-shares-risk', 'preserve-strength'];
  if (d7.includes(principle)) p[0] = principle; else if (d14.includes(principle)) p[1] = principle; else p[2] = principle;
  return { ...base, id: `principle:${principle}`, principles: p };
}

export function runFullAudit(options: { policyRuns?: number; principleRuns?: number; seedBase?: number } = {}): FullAuditReport {
  const policyRuns = Math.max(1, options.policyRuns ?? 200), principleRuns = Math.max(1, options.principleRuns ?? 80); let seed = Math.max(1, options.seedBase ?? 860901);
  const policies: AuditBatchSummary[] = [], baseline: AuditRunResult[] = [];
  for (const policy of DEFAULT_AUDIT_POLICIES) { const runs = Array.from({ length: policyRuns }, () => runAuditGame(seed++, policy)); baseline.push(...runs); policies.push(summarizeAuditRuns(policy.id, runs)); }
  const ids: StreetPrincipleId[] = ['everyone-shares', 'triage-first', 'outward-search', 'core-leads', 'community-shares-risk', 'preserve-strength', 'hold-the-street', 'prepare-evacuation', 'await-aid'];
  const principles: PrincipleAuditRow[] = ids.map((principle, index) => { const policy = forcedPolicy(principle), runs = Array.from({ length: principleRuns }, () => runAuditGame(seed++, policy)), s = summarizeAuditRuns(policy.id, runs); return { principle, stage: index < 3 ? 7 : index < 6 ? 14 : 21, runs: s.runs, successRate: s.successRate, perfectRate: s.perfectRate, averageDeaths: s.averageDeaths, averageRescued: s.averageRescued }; });
  const choices: Record<string, number> = {}, events: Record<string, number> = {}, locations: Record<string, number> = {};
  for (const r of baseline) { addCounts(choices, r.finalChoiceCounts); addCounts(events, r.eventCounts); addCounts(locations, r.locationVisits); }
  const totalChoices = Object.values(choices).reduce((a, b) => a + b, 0), totalVisits = Object.values(locations).reduce((a, b) => a + b, 0), totalRuns = baseline.length;
  const dominantDay29Choices = Object.entries(choices).map(([choiceId, uses]) => ({ choiceId, uses, share: totalChoices ? uses / totalChoices : 0 })).filter((x) => x.share >= 0.12).sort((a, b) => b.share - a.share);
  const underusedLocations = Object.entries(locations).map(([locationId, visits]) => ({ locationId, visits, visitShare: totalVisits ? visits / totalVisits : 0 })).filter((x) => x.visitShare < 0.025).sort((a, b) => a.visitShare - b.visitShare);
  const highRepeatEvents = Object.entries(events).map(([eventId, occurrences]) => ({ eventId, occurrences, averagePerRun: totalRuns ? occurrences / totalRuns : 0 })).filter((x) => x.averagePerRun > 1.25).sort((a, b) => b.averagePerRun - a.averagePerRun);
  const residentSuccessBands: Record<string, { runs: number; successRate: number }> = {};
  for (const label of ['0-4', '5-8', '9+']) { const groups = policies.map((p) => p.residentBands[label]).filter((x) => x.runs); const runs = groups.reduce((a, b) => a + b.runs, 0), wins = groups.reduce((a, b) => a + b.runs * b.successRate, 0); residentSuccessBands[label] = { runs, successRate: runs ? wins / runs : 0 }; }
  const warnings: string[] = [];
  for (const stage of [7, 14, 21] as const) { const rows = principles.filter((p) => p.stage === stage), rates = rows.map((r) => r.successRate); if (Math.max(...rates) - Math.min(...rates) > 0.15) warnings.push(`DAY ${stage} principle success-rate spread > 15pp`); }
  if (dominantDay29Choices[0]?.share > 0.4) warnings.push(`DAY29 choice ${dominantDay29Choices[0].choiceId} exceeds 40% share`);
  if (underusedLocations.length) warnings.push(`${underusedLocations.length} locations receive <2.5% of visits`);
  if (highRepeatEvents.length) warnings.push(`${highRepeatEvents.length} night events average >1.25 appearances/run`);
  const low = residentSuccessBands['0-4'], high = residentSuccessBands['9+']; if (low.runs >= 20 && high.runs >= 20 && high.successRate - low.successRate > 0.25) warnings.push('9+ residents outperform 0-4 residents by >25pp');
  return { generatedAt: new Date().toISOString(), simulatorVersion: 1, totalRuns: DEFAULT_AUDIT_POLICIES.length * policyRuns + ids.length * principleRuns, policies, principles, diagnostics: { dominantDay29Choices, underusedLocations, highRepeatEvents, residentSuccessBands, warnings } };
}
