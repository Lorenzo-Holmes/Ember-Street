import { canTrustReroll, rerollLowestDie, rollPendingCheck } from '../../src/game/dice';
import { createDefaultDayState, createDefaultExpeditionState, createDefaultMealState, createDefaultNightState } from '../../src/game/foundation';
import { forecastFor, SURVIVOR_ROSTER } from '../../src/game/progression';
import type { DayAssignment, GameState, StreetPrincipleId, SurvivorCondition } from '../../src/game/types';
import { advanceCampaignDay, finalizeDay } from '../../src/game/v060/campaign';
import { locationUnlockFlag } from '../../src/game/v060/campaignEvents';
import { selectCommunitySupportMode } from '../../src/game/v060/community';
import { assignDayJob, canTakeDayAssignment, lockDayAssignments } from '../../src/game/v060/dayManagement';
import { EXPEDITION_LOCATIONS } from '../../src/game/v060/expedition';
import {
  acceptNightCheckResult,
  canAffordNightChoice,
  chooseNightOption,
  currentNightEvent,
  scheduleNight,
} from '../../src/game/v060/nightScheduler';
import { createDefaultSocialState } from '../../src/game/v060/socialPressure';
import {
  AuditRng,
  cloneState,
  endingScore,
  presentCore,
  type Day29ChoiceResult,
  type Day29Dimensions,
  type Day29GeneratedState,
  weightedInventory,
} from './model';
import { strongPolicy } from './policies';

const STAGE_ONE: StreetPrincipleId[] = ['everyone-shares', 'triage-first', 'outward-search'];
const STAGE_TWO: StreetPrincipleId[] = ['core-leads', 'community-shares-risk', 'preserve-strength'];
const STAGE_THREE: StreetPrincipleId[] = ['hold-the-street', 'prepare-evacuation', 'await-aid'];

function mainLightStage(buildings: GameState['buildings']): 1 | 2 | 3 | 4 | 5 {
  const sum = Object.values(buildings).reduce((total, value) => total + value, 0);
  return Math.max(1, Math.min(5, Math.ceil((sum + 1) / 4))) as 1 | 2 | 3 | 4 | 5;
}

function classifyPopulation(total: number): Day29Dimensions['population'] {
  if (total <= 5) return 'low';
  if (total <= 13) return 'medium';
  return 'high';
}

function communityCount(level: Day29Dimensions['community'], rng: AuditRng): number {
  if (level === 'low') return rng.pick([0, 1, 3, 4]);
  if (level === 'medium') return rng.pick([6, 8, 10, 12]);
  return rng.pick([16, 20, 25, 30]);
}

function buildingsFor(level: Day29Dimensions['buildings'], rng: AuditRng): GameState['buildings'] {
  if (level === 'low') return {
    searchStation: 1,
    shelter: 1,
    workshop: rng.int(2),
    clinic: rng.int(2),
    watchPost: rng.int(2),
    radio: rng.int(2),
  };
  if (level === 'medium') return {
    searchStation: 2,
    shelter: 2,
    workshop: 1 + rng.int(2),
    clinic: 1 + rng.int(2),
    watchPost: 1 + rng.int(2),
    radio: 1 + rng.int(2),
  };
  return {
    searchStation: 2 + rng.int(2),
    shelter: 2 + rng.int(2),
    workshop: 2 + rng.int(2),
    clinic: 2 + rng.int(2),
    watchPost: 2 + rng.int(2),
    radio: 2 + rng.int(2),
  };
}

function foodFor(level: Day29Dimensions['food'], totalPopulation: number, rng: AuditRng): number {
  if (level === 'famine') return rng.int(Math.max(2, Math.floor(totalPopulation * 0.35) + 1));
  if (level === 'tight') return Math.max(1, Math.round(totalPopulation * (0.55 + rng.next() * 0.35)));
  if (level === 'enough') return Math.round(totalPopulation * (1.1 + rng.next() * 0.8));
  return Math.round(totalPopulation * (2.2 + rng.next() * 1.8));
}

function survivorConditions(mode: Day29Dimensions['core'], rng: AuditRng): { conditions: SurvivorCondition[]; deaths: number; missing: number } {
  const conditions: SurvivorCondition[] = SURVIVOR_ROSTER.map(() => rng.next() < 0.18 ? 'minor' : 'healthy');
  if (mode === 'many-dead') {
    const count = 2 + rng.int(3);
    for (let i = 0; i < count; i += 1) conditions[(i * 2 + rng.int(2)) % conditions.length] = 'dead';
  }
  if (mode === 'many-missing') {
    const count = 2 + rng.int(3);
    for (let i = 0; i < count; i += 1) conditions[(i * 2 + 1 + rng.int(2)) % conditions.length] = 'missing';
  }
  if (conditions.every((condition) => condition === 'dead' || condition === 'missing')) conditions[0] = 'serious';
  return {
    conditions,
    deaths: conditions.filter((condition) => condition === 'dead').length,
    missing: conditions.filter((condition) => condition === 'missing').length,
  };
}

function explorationFlags(level: Day29Dimensions['exploration']): string[] {
  const count = level === 'low' ? 2 : level === 'medium' ? 6 : EXPEDITION_LOCATIONS.length;
  const flags: string[] = [];
  for (const location of EXPEDITION_LOCATIONS.slice(0, count)) {
    flags.push(locationUnlockFlag(location.id), `visited:${location.id}`, `scouted:${location.id}`);
  }
  if (level === 'medium' || level === 'high') flags.push('subway_maintenance_map', 'subway_exit_known');
  if (level === 'high') flags.push('evacuation_route_known', 'southern_route_known', 'hospital_route_observed', 'medical_cache', 'working_vehicle_parts', 'generator_backup', 'final_horde_supplies');
  return flags;
}

export function generateDay29States(seed: number, count: number): Day29GeneratedState[] {
  const result: Day29GeneratedState[] = [];
  const communityLevels: Day29Dimensions['community'][] = ['low', 'medium', 'high'];
  const foodLevels: Day29Dimensions['food'][] = ['famine', 'tight', 'enough', 'surplus'];
  const coreLevels: Day29Dimensions['core'][] = ['mostly-alive', 'many-dead', 'many-missing'];
  const buildingLevels: Day29Dimensions['buildings'][] = ['low', 'medium', 'high'];
  const explorationLevels: Day29Dimensions['exploration'][] = ['low', 'medium', 'high'];
  const endingLevels: Day29Dimensions['endingEligibility'][] = ['weak', 'mixed', 'strong'];

  for (let index = 0; index < count; index += 1) {
    const rng = new AuditRng((seed + index * 2654435761) >>> 0);
    const community = communityLevels[index % communityLevels.length];
    const food = foodLevels[Math.floor(index / 3) % foodLevels.length];
    const core = coreLevels[Math.floor(index / 12) % coreLevels.length];
    const buildingsLevel = buildingLevels[Math.floor(index / 36) % buildingLevels.length];
    const exploration = explorationLevels[Math.floor(index / 108) % explorationLevels.length];
    const endingEligibility = endingLevels[Math.floor(index / 324) % endingLevels.length];
    const civilians = communityCount(community, rng);
    const conditions = survivorConditions(core, rng);
    const survivors = SURVIVOR_ROSTER.map((survivor, survivorIndex) => ({
      ...survivor,
      condition: conditions.conditions[survivorIndex],
      energy: Math.max(20, Math.min(100, 42 + rng.int(59))),
      trust: (1 + rng.int(3)) as 1 | 2 | 3,
    }));
    const buildings = buildingsFor(buildingsLevel, rng);
    const corePresent = survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;
    const totalPopulation = corePresent + civilians;
    const principleA = STAGE_ONE[index % STAGE_ONE.length];
    const principleB = STAGE_TWO[Math.floor(index / 3) % STAGE_TWO.length];
    const principleC = STAGE_THREE[Math.floor(index / 9) % STAGE_THREE.length];
    const principles = [principleA, principleB, principleC];
    const social = createDefaultSocialState();
    const strongEnding = endingEligibility === 'strong';
    const weakEnding = endingEligibility === 'weak';
    const storyFlags = [
      'v060_started',
      ...principles.map((principle) => `principle:${principle}`),
      ...explorationFlags(exploration),
      ...(civilians >= 5 ? ['community_rotation_unlocked'] : []),
      ...(strongEnding ? ['external_contact', 'military_contact'] : endingEligibility === 'mixed' && buildings.radio >= 2 ? ['external_contact'] : []),
    ];
    const hope = weakEnding ? 12 + rng.int(24) : strongEnding ? 70 + rng.int(26) : 38 + rng.int(28);
    const defense = weakEnding ? 20 + rng.int(28) : strongEnding ? 72 + rng.int(24) : 45 + rng.int(30);
    const state: GameState = {
      version: 3,
      seed: (seed + index) >>> 0,
      rngState: ((seed + index * 17 + 1) >>> 0) || 1,
      phase: 'street',
      day: 29,
      inventory: {
        ration: foodFor(food, totalPopulation, rng),
        medicine: weakEnding ? rng.int(4) : strongEnding ? 5 + rng.int(8) : 2 + rng.int(6),
        power: weakEnding ? 8 + rng.int(35) : strongEnding ? 60 + rng.int(41) : 30 + rng.int(51),
        materials: weakEnding ? rng.int(10) : strongEnding ? 18 + rng.int(28) : 7 + rng.int(22),
        parts: weakEnding ? rng.int(6) : strongEnding ? 10 + rng.int(18) : 4 + rng.int(13),
      },
      storyItems: [],
      storyFlags: [...new Set(storyFlags)],
      mainLightStage: mainLightStage(buildings),
      civilianResidents: civilians,
      communityState: { pendingResidents: 0, activeResidents: civilians, supportMode: null },
      socialState: {
        ...social,
        pressure: weakEnding ? 5 : strongEnding ? 1 : 3,
        fulfilledPromises: strongEnding ? 4 : endingEligibility === 'mixed' ? 2 : 0,
        brokenPromises: weakEnding ? 3 : strongEnding ? 0 : 1,
        principles,
      },
      dayAssignments: {},
      dayState: createDefaultDayState(),
      expeditionState: createDefaultExpeditionState(),
      mealState: createDefaultMealState(),
      nightState: createDefaultNightState(),
      campaignStats: {
        rescued: civilians,
        deaths: conditions.deaths,
        missing: conditions.missing,
        expeditions: exploration === 'low' ? 4 : exploration === 'medium' ? 12 : 22,
        locationsDiscovered: exploration === 'low' ? 2 : exploration === 'medium' ? 6 : 10,
        nightEventsResolved: 120,
        emergencyEventsResolved: 12,
      },
      memorials: [],
      ending: null,
      hope,
      defense,
      survivors,
      buildings,
      forecast: forecastFor(29),
      chapterComplete: false,
      pendingCheck: null,
      lastMessage: 'DAY29 synthetic audit state',
    };
    result.push({
      state,
      dimensions: {
        population: classifyPopulation(totalPopulation),
        food,
        core,
        buildings: buildingsLevel,
        community,
        principleRoute: principles.join('+'),
        exploration,
        endingEligibility,
      },
    });
  }
  return result;
}

function prepareDay29(input: GameState): GameState {
  let state = cloneState(input);
  const policy = strongPolicy();
  const rng = new AuditRng(state.seed ^ 0x29d29);
  if (state.communityState.activeResidents >= 5 && state.storyFlags.includes('community_rotation_unlocked')) {
    state = selectCommunitySupportMode(state, policy.chooseCommunityMode(state, rng));
  }
  const desired: Record<string, DayAssignment> = {
    'lin-xia': 'rest',
    zhou: state.buildings.workshop > 0 ? 'repair' : 'rest',
    ahe: 'cook',
    cheng: state.buildings.clinic > 0 ? 'medical' : 'rest',
    aliang: state.buildings.watchPost > 0 ? 'watch' : 'rest',
    xiaoman: state.buildings.radio > 0 ? 'radio' : 'rest',
  };
  for (const survivor of state.survivors) {
    const job = desired[survivor.id] ?? 'rest';
    if (canTakeDayAssignment(state, survivor.id, job).allowed) state = assignDayJob(state, survivor.id, job);
  }
  state = lockDayAssignments(state);
  state = finalizeDay(state);
  return scheduleNight(state);
}

function resolveOneChoice(state: GameState, choiceId: string, reroll = true): GameState {
  let next = chooseNightOption(state, choiceId);
  if (next.pendingCheck) {
    next = rollPendingCheck(next);
    if (reroll && canTrustReroll(next) && (next.pendingCheck?.outcome === 'failure' || next.pendingCheck?.outcome === 'partial')) next = rerollLowestDie(next);
    next = acceptNightCheckResult(next);
  }
  return next;
}

function finishScheduledNight(input: GameState, sourceSeed: number): GameState {
  const policy = strongPolicy();
  const rng = new AuditRng((sourceSeed ^ 0x6f726465) >>> 0);
  let next = input;
  let guard = 0;
  while (next.phase === 'night' && guard < 20) {
    const event = currentNightEvent(next);
    if (!event) throw new Error('DAY29 continuation lost current event');
    const legal = event.choices.filter((choice) => canAffordNightChoice(next, choice));
    const choice = policy.chooseNightChoice(next, event, legal, rng);
    next = resolveOneChoice(next, choice.id);
    guard += 1;
  }
  if (next.phase !== 'night-summary') throw new Error(`DAY29 continuation ended in ${next.phase}`);
  return advanceCampaignDay(next);
}

export function auditDay29Choices(seed: number, count: number): Day29ChoiceResult[] {
  const generated = generateDay29States(seed, count);
  const policy = strongPolicy();
  const results: Day29ChoiceResult[] = [];

  for (const generatedState of generated) {
    let canonical = prepareDay29(generatedState.state);
    let stage = 0;
    while (canonical.phase === 'night' && stage < 6) {
      const event = currentNightEvent(canonical);
      if (!event) throw new Error('DAY29 audit expected a final horde event');
      const legal = event.choices.filter((choice) => canAffordNightChoice(canonical, choice));
      const sourceJson = JSON.stringify(canonical);
      for (const choice of legal) {
        const fork = cloneState(canonical);
        const afterChoice = resolveOneChoice(fork, choice.id);
        const ended = finishScheduledNight(afterChoice, generatedState.state.seed ^ stage ^ choice.id.length);
        if (!ended.ending) throw new Error('DAY29 fork did not reach an ending');
        results.push({
          sourceSeed: generatedState.state.seed,
          stageEventId: event.id,
          choiceId: choice.id,
          legalChoiceCount: legal.length,
          score: endingScore(ended),
          endingId: ended.ending.id,
          endingTier: ended.ending.tier,
          finalHordeResult: ended.finalHordeResult ?? 'unknown',
          coreAlive: presentCore(ended),
          residents: ended.civilianResidents,
          hope: ended.hope,
          defense: ended.defense,
          resourceValue: weightedInventory(ended),
          dimensions: generatedState.dimensions,
        });
        if (JSON.stringify(canonical) !== sourceJson) throw new Error('DAY29 fork mutated source state');
      }
      const rng = new AuditRng((generatedState.state.seed ^ stage ^ 0xabcdef) >>> 0);
      const canonicalChoice = policy.chooseNightChoice(canonical, event, legal, rng);
      canonical = resolveOneChoice(canonical, canonicalChoice.id);
      stage += 1;
    }
  }
  return results;
}
