import type { DayAssignment, GameState, StreetPrincipleId, Survivor } from '../../src/game/types';
import { canUpgradeBuilding } from '../../src/game/v060/buildings';
import { expeditionRiskScore, type ExpeditionLocation } from '../../src/game/v060/expedition';
import { nightCheckContext } from '../../src/game/v060/nightScheduler';
import type { NightChoice, NightEffect, V060NightEvent } from '../../src/game/v060/nightEvents';
import type { StreetPrincipleDecision } from '../../src/game/v060/principles';
import { AuditRng, BUILDING_IDS, PRINCIPLES, type AuditPolicyId, type BasePolicyId } from './model';

export interface AssignmentContext {
  residentCount: number;
  injured: number;
  assigned: Partial<Record<DayAssignment, number>>;
  requiredCookCapacity: number;
  currentCookCapacity: number;
}

export interface SimulationPolicy {
  id: AuditPolicyId;
  base: BasePolicyId;
  principleTarget?: StreetPrincipleId;
  choosePrinciple(state: GameState, decision: StreetPrincipleDecision, rng: AuditRng): StreetPrincipleId;
  chooseBuilding(state: GameState, rng: AuditRng): keyof GameState['buildings'] | null;
  chooseCommunityMode(state: GameState, rng: AuditRng): 'logistics' | 'repair' | 'defense';
  explorationDrive(state: GameState): number;
  locationScore(state: GameState, location: ExpeditionLocation, firstVisit: boolean): number;
  partySize(state: GameState, location: ExpeditionLocation, candidates: Survivor[]): 1 | 2;
  jobScore(state: GameState, survivor: Survivor, job: DayAssignment, context: AssignmentContext): number;
  chooseExpeditionStance(state: GameState, location: ExpeditionLocation): 'push' | 'careful';
  chooseNightChoice(state: GameState, event: V060NightEvent, choices: NightChoice[], rng: AuditRng): NightChoice;
  shouldTrustReroll(state: GameState): boolean;
}

const routeKnown = (state: GameState) => ['evacuation_route_known', 'subway_exit_known', 'southern_route_known', 'subway_maintenance_map', 'hospital_route_observed']
  .some((flag) => state.storyFlags.includes(flag));

const present = (state: GameState) => state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing');
const injuredCount = (state: GameState) => present(state).filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
const population = (state: GameState) => present(state).length + Math.max(0, state.civilianResidents);

function defaultPrinciple(state: GameState, decision: StreetPrincipleDecision, base: BasePolicyId, rng: AuditRng): StreetPrincipleId {
  if (base === 'random') return rng.pick(decision.choices).id;
  if (decision.day === 7) {
    if (base === 'survival-greedy') return injuredCount(state) >= 2 ? 'triage-first' : 'everyone-shares';
    if (base === 'production-greedy') return 'everyone-shares';
    if (base === 'exploration-greedy') return 'outward-search';
    if (state.civilianResidents >= 5) return 'everyone-shares';
    if (injuredCount(state) >= 2 || state.inventory.medicine <= 2) return 'triage-first';
    return 'outward-search';
  }
  if (decision.day === 14) {
    if (base === 'survival-greedy') return 'preserve-strength';
    if (base === 'production-greedy') return 'community-shares-risk';
    if (base === 'exploration-greedy') return 'core-leads';
    const averageEnergy = present(state).reduce((sum, survivor) => sum + survivor.energy, 0) / Math.max(1, present(state).length);
    if (state.civilianResidents >= 5) return 'community-shares-risk';
    if (averageEnergy < 45) return 'preserve-strength';
    return 'core-leads';
  }
  if (base === 'survival-greedy') return routeKnown(state) ? 'prepare-evacuation' : 'hold-the-street';
  if (base === 'production-greedy') return 'hold-the-street';
  if (base === 'exploration-greedy') return 'prepare-evacuation';
  if (routeKnown(state)) return 'prepare-evacuation';
  if (state.buildings.radio >= 2 && (state.storyFlags.includes('external_contact') || state.storyFlags.includes('military_contact'))) return 'await-aid';
  return 'hold-the-street';
}

function buildingScore(base: BasePolicyId, state: GameState, id: keyof GameState['buildings']): number {
  const level = state.buildings[id];
  const injured = injuredCount(state);
  const people = population(state);
  let score = -level * 2;
  if (base === 'survival-greedy') {
    if (id === 'shelter') score += 14 + Math.max(0, people - 4) * 1.5;
    if (id === 'clinic') score += 11 + injured * 4;
    if (id === 'watchPost') score += 10 + Math.max(0, 60 - state.defense) * 0.25;
    if (id === 'searchStation') score += state.inventory.ration < people * 2 ? 12 : 4;
    if (id === 'workshop') score += 6;
    if (id === 'radio') score += 4;
  } else if (base === 'production-greedy') {
    if (id === 'workshop') score += 15;
    if (id === 'shelter') score += 14 + state.civilianResidents;
    if (id === 'radio') score += 12;
    if (id === 'searchStation') score += 9;
    if (id === 'clinic') score += 6 + injured * 2;
    if (id === 'watchPost') score += 7;
  } else if (base === 'exploration-greedy') {
    if (id === 'searchStation') score += 18;
    if (id === 'workshop') score += 10;
    if (id === 'shelter') score += 9;
    if (id === 'clinic') score += 8 + injured * 2;
    if (id === 'watchPost') score += 7;
    if (id === 'radio') score += 7;
  } else {
    if (id === 'shelter') score += 10 + Math.max(0, people - 4);
    if (id === 'clinic') score += 8 + injured * 3;
    if (id === 'watchPost') score += 8 + Math.max(0, 55 - state.defense) * 0.2;
    if (id === 'searchStation') score += 9 + (state.inventory.ration < people * 2 ? 5 : 0);
    if (id === 'workshop') score += 9;
    if (id === 'radio') score += state.day >= 10 ? 9 : 5;
  }
  if (level === 0) score += 2;
  return score;
}

function directEffectScore(effect: NightEffect | undefined, base: BasePolicyId): number {
  if (!effect) return 0;
  const inventory = effect.inventory ?? {};
  const survival = base === 'survival-greedy';
  const production = base === 'production-greedy';
  return (effect.hope ?? 0) * (survival ? 1.2 : 0.8)
    + (effect.defense ?? 0) * (survival ? 1.2 : 0.9)
    + (effect.power ?? 0) * 0.15
    + (inventory.ration ?? 0) * (survival ? 2 : 1.2)
    + (inventory.medicine ?? 0) * (survival ? 4 : 2.5)
    + (inventory.materials ?? 0) * (production ? 2 : 1.2)
    + (inventory.parts ?? 0) * (production ? 3 : 2)
    + (effect.actorCondition === 'dead' ? -40 : effect.actorCondition === 'missing' ? -28 : effect.actorCondition === 'critical' ? -18 : effect.actorCondition === 'serious' ? -10 : effect.actorCondition === 'minor' ? -4 : 0);
}

function costScore(state: GameState, choice: NightChoice, base: BasePolicyId): number {
  const cost = choice.cost ?? {};
  const scarcity = (stock: number, threshold: number) => stock <= threshold ? 1.8 : stock <= threshold * 2 ? 1.25 : 1;
  return (cost.ration ?? 0) * (base === 'survival-greedy' ? 2.2 : 1.3) * scarcity(state.inventory.ration, Math.max(4, population(state)))
    + (cost.medicine ?? 0) * 3.4 * scarcity(state.inventory.medicine, 3)
    + (cost.materials ?? 0) * (base === 'production-greedy' ? 2.4 : 1.4) * scarcity(state.inventory.materials, 8)
    + (cost.parts ?? 0) * (base === 'production-greedy' ? 3 : 2) * scarcity(state.inventory.parts, 5)
    + (cost.power ?? 0) * 0.18 * scarcity(state.inventory.power, 25);
}

function nightChoiceScore(state: GameState, event: V060NightEvent, choice: NightChoice, base: BasePolicyId): number {
  let score = directEffectScore(choice.direct, base) - costScore(state, choice, base);
  if (choice.check) {
    const outcomes = Object.values(choice.outcomes ?? {});
    score += outcomes.reduce((sum, effect) => sum + directEffectScore(effect, base), 0) / Math.max(1, outcomes.length);
    const context = nightCheckContext(state, choice);
    score += context.modifiers.reduce((sum, modifier) => sum + modifier.value, 0) * 2;
    if (!context.actor) score -= 5;
  }
  if (base === 'survival-greedy') {
    if (choice.strategy === 'resource') score += 4;
    if (choice.strategy === 'consequence') score -= 2;
  }
  if (base === 'production-greedy') {
    if (choice.strategy === 'person') score += 3;
    if (choice.strategy === 'resource') score -= 2;
  }
  if (base === 'exploration-greedy' && choice.strategy === 'person') score += 1;
  if (event.category === 'horde' && choice.strategy === 'consequence') score -= 4;
  return score;
}

function jobScore(base: BasePolicyId, state: GameState, survivor: Survivor, job: DayAssignment, context: AssignmentContext): number {
  if (job === 'rest') {
    const lowEnergy = Math.max(0, 55 - survivor.energy) * 0.35;
    const injured = ['minor', 'serious', 'critical', 'fatigued'].includes(survivor.condition ?? '') ? 8 : 0;
    return lowEnergy + injured + (base === 'survival-greedy' ? 3 : 0);
  }
  let score = survivor.specialty === (job === 'expedition' ? 'search' : job) ? 7 : 0;
  if (job === 'cook') {
    const gap = Math.max(0, context.requiredCookCapacity - context.currentCookCapacity);
    score += gap * 3 + (survivor.specialty === 'cook' ? 5 : 0);
    if (base === 'survival-greedy') score += 5;
  }
  if (job === 'medical') score += context.injured * 5 + (base === 'survival-greedy' ? 4 : 0);
  if (job === 'watch') score += Math.max(0, 70 - state.defense) * 0.2 + (state.day >= 20 ? 4 : 0);
  if (job === 'repair') score += Math.max(0, 72 - state.defense) * 0.12 + (base === 'production-greedy' ? 5 : 0);
  if (job === 'radio') {
    score += state.buildings.radio >= 2 && !state.storyFlags.includes('external_contact') ? 8 : 3;
    if (base === 'production-greedy') score += 3;
  }
  if (base === 'production-greedy' && job !== 'rest' && job !== 'cook') score += 2;
  if (survivor.energy < 30) score -= 10;
  if (survivor.condition === 'serious') score -= 8;
  return score;
}

function createPolicy(id: AuditPolicyId, base: BasePolicyId, principleTarget?: StreetPrincipleId): SimulationPolicy {
  return {
    id,
    base,
    principleTarget,
    choosePrinciple(state, decision, rng) {
      if (principleTarget && decision.choices.some((choice) => choice.id === principleTarget)) return principleTarget;
      return defaultPrinciple(state, decision, base, rng);
    },
    chooseBuilding(state, rng) {
      const affordable = BUILDING_IDS.filter((id) => canUpgradeBuilding(state, id).allowed);
      if (!affordable.length) return null;
      if (base === 'random') return rng.next() < 0.45 ? rng.pick(affordable) : null;
      const scored = affordable.map((buildingId) => ({ buildingId, score: buildingScore(base, state, buildingId) }));
      scored.sort((a, b) => b.score - a.score || a.buildingId.localeCompare(b.buildingId));
      const threshold = base === 'production-greedy' ? 5 : 7;
      return scored[0].score >= threshold ? scored[0].buildingId : null;
    },
    chooseCommunityMode(state, rng) {
      if (base === 'random') return rng.pick(['logistics', 'repair', 'defense'] as const);
      const people = population(state);
      if (base === 'survival-greedy') {
        if (state.inventory.ration < people * 1.5) return 'logistics';
        return state.defense < 60 || state.day >= 20 ? 'defense' : 'repair';
      }
      if (base === 'production-greedy') return state.defense < 58 ? 'repair' : 'logistics';
      if (base === 'exploration-greedy') return state.inventory.ration < people * 2 ? 'logistics' : 'defense';
      if (state.inventory.ration < people * 1.5) return 'logistics';
      if (state.day >= 20 || state.defense < 55) return 'defense';
      return 'repair';
    },
    explorationDrive(state) {
      const people = population(state);
      if (base === 'random') return 0.5;
      if (base === 'exploration-greedy') return 0.94;
      if (base === 'production-greedy') return state.inventory.materials < 14 || state.inventory.parts < 8 ? 0.65 : 0.35;
      if (base === 'survival-greedy') return state.inventory.ration < people * 2 || state.inventory.medicine < 2 ? 0.82 : 0.25;
      let drive = 0.5;
      if (state.inventory.ration < people * 2) drive += 0.25;
      if (state.inventory.materials < 10 || state.inventory.parts < 5) drive += 0.15;
      if (state.day >= 24) drive -= 0.12;
      if (injuredCount(state) >= 2) drive -= 0.12;
      return Math.max(0.15, Math.min(0.9, drive));
    },
    locationScore(state, location, firstVisit) {
      if (base === 'random') return 0;
      const needFood = Math.max(0, population(state) * 2 - state.inventory.ration);
      const resourceNeed = location.primary === 'ration' ? needFood * 0.9
        : location.primary === 'medicine' ? Math.max(0, 5 - state.inventory.medicine) * 3
          : location.primary === 'materials' ? Math.max(0, 18 - state.inventory.materials) * 0.8
            : Math.max(0, 10 - state.inventory.parts) * 1.4;
      let score = resourceNeed - location.danger * (base === 'survival-greedy' ? 4 : base === 'exploration-greedy' ? 1.5 : 2.5);
      if (firstVisit) score += base === 'exploration-greedy' ? 16 : 6;
      if (base === 'production-greedy' && (location.primary === 'materials' || location.primary === 'parts')) score += 8;
      if (base === 'survival-greedy' && (location.primary === 'ration' || location.primary === 'medicine')) score += 8;
      if (state.day >= 21 && ['subway', 'bus-station', 'warehouse'].includes(location.id)) score += 5;
      return score;
    },
    partySize(state, location, candidates) {
      if (candidates.length < 2) return 1;
      if (base === 'production-greedy' && location.danger <= 2) return 1;
      const oneRisk = expeditionRiskScore(state, [candidates[0].id], location.id);
      return oneRisk >= 6 || location.danger >= 4 || base === 'exploration-greedy' ? 2 : 1;
    },
    jobScore(state, survivor, job, context) {
      if (base === 'random') return 0;
      return jobScore(base, state, survivor, job, context);
    },
    chooseExpeditionStance(state, location) {
      if (base === 'exploration-greedy') return 'push';
      if (base === 'survival-greedy') return 'careful';
      if (base === 'production-greedy') return location.danger <= 3 ? 'push' : 'careful';
      return state.day >= 24 || location.danger >= 4 ? 'careful' : 'push';
    },
    chooseNightChoice(state, event, choices, rng) {
      if (!choices.length) throw new Error(`No legal choices for ${event.id}`);
      if (base === 'random') return rng.pick(choices);
      const scored = choices.map((choice) => ({ choice, score: nightChoiceScore(state, event, choice, base) }));
      scored.sort((a, b) => b.score - a.score || a.choice.id.localeCompare(b.choice.id));
      return scored[0].choice;
    },
    shouldTrustReroll(state) {
      const outcome = state.pendingCheck?.outcome;
      if (!outcome) return false;
      if (base === 'random') return outcome === 'failure';
      if (base === 'survival-greedy') return outcome === 'failure' || outcome === 'partial';
      return outcome === 'failure';
    },
  };
}

export function allPolicies(): SimulationPolicy[] {
  const base: SimulationPolicy[] = [
    createPolicy('random', 'random'),
    createPolicy('survival-greedy', 'survival-greedy'),
    createPolicy('production-greedy', 'production-greedy'),
    createPolicy('exploration-greedy', 'exploration-greedy'),
    createPolicy('strong-heuristic', 'strong-heuristic'),
  ];
  const principlePolicies = PRINCIPLES.map((principle) => createPolicy(`principle-greedy:${principle}`, 'strong-heuristic', principle));
  return [...base, ...principlePolicies];
}

export function strongPolicy(): SimulationPolicy {
  return createPolicy('strong-heuristic', 'strong-heuristic');
}
