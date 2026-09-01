import type { GameState, StreetPrincipleId } from '../../src/game/types';
import { EXPEDITION_LOCATIONS } from '../../src/game/v060/expedition';
import { buildCommunityStressRows, type CommunityStressRow } from './communityStress';
import {
  endingScore,
  failureBucket,
  phaseForDay,
  presentCore,
  PRINCIPLES,
  residentBand,
  summarize,
  toCsv,
  weightedInventory,
  type Anomaly,
  type AuditConfig,
  type AuditEventRecord,
  type DailyRecord,
  type Day29ChoiceResult,
  type RunRecord,
} from './model';

const NATURAL_POLICIES = new Set(['random', 'survival-greedy', 'production-greedy', 'exploration-greedy', 'strong-heuristic']);
const CHECKPOINTS = new Set([1, 5, 10, 15, 20, 25, 30]);
const STAGE: Record<StreetPrincipleId, 7 | 14 | 21> = {
  'everyone-shares': 7,
  'triage-first': 7,
  'outward-search': 7,
  'core-leads': 14,
  'community-shares-risk': 14,
  'preserve-strength': 14,
  'hold-the-street': 21,
  'prepare-evacuation': 21,
  'await-aid': 21,
};

interface PrincipleBucket {
  picks: number;
  survival: number[];
  deaths: number[];
  finalPopulation: number[];
  finalFood: number[];
  finalHope: number[];
  endingScores: number[];
  good: number[];
  bad: number[];
  resourceDelta: number[];
}

interface DailyBucket {
  food: number[];
  population: number[];
  residentPopulation: number[];
  healthySurvivors: number[];
  injuredSurvivors: number[];
  missingSurvivors: number[];
  deadSurvivors: number[];
  production: number[];
  consumption: number[];
  communityLabor: number[];
  explorationProgress: number[];
  failure: number[];
  dailyNetFood: number[];
  dailyNetResources: number[];
}

interface CommunityObservedBucket {
  residentPopulation: number[];
  foodProduction: number[];
  foodConsumption: number[];
  communityLabor: number[];
  communityContribution: number[];
  coreLaborReleased: number[];
  totalEffectiveLabor: number[];
  dailyNetFood: number[];
  dailyNetResources: number[];
}

interface LocationBucket {
  visits: number;
  firstVisits: number;
  repeatVisits: number;
  food: number[];
  materials: number[];
  medicine: number[];
  special: number[];
  injury: number[];
  death: number[];
  missing: number[];
  workerCost: number[];
  netValue: number[];
  firstNetValue: number[];
  repeatNetValue: number[];
  uniqueEvent: number[];
  storyUnlock: number[];
}

interface RepetitionBucket {
  exact: number[];
  family: number[];
  mechanical: number[];
  consecutive2: number[];
  consecutive3: number[];
  consecutive4: number[];
  characterConcentration: number[];
  locationConcentration: number[];
  uniqueRatio: number[];
}

interface ReportBundle {
  files: Record<string, string>;
  anomalies: Anomaly[];
  summary: Record<string, unknown>;
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function makePrincipleBucket(): PrincipleBucket {
  return { picks: 0, survival: [], deaths: [], finalPopulation: [], finalFood: [], finalHope: [], endingScores: [], good: [], bad: [], resourceDelta: [] };
}

function makeDailyBucket(): DailyBucket {
  return {
    food: [], population: [], residentPopulation: [], healthySurvivors: [], injuredSurvivors: [], missingSurvivors: [], deadSurvivors: [],
    production: [], consumption: [], communityLabor: [], explorationProgress: [], failure: [], dailyNetFood: [], dailyNetResources: [],
  };
}

function makeCommunityObservedBucket(): CommunityObservedBucket {
  return { residentPopulation: [], foodProduction: [], foodConsumption: [], communityLabor: [], communityContribution: [], coreLaborReleased: [], totalEffectiveLabor: [], dailyNetFood: [], dailyNetResources: [] };
}

function makeLocationBucket(): LocationBucket {
  return { visits: 0, firstVisits: 0, repeatVisits: 0, food: [], materials: [], medicine: [], special: [], injury: [], death: [], missing: [], workerCost: [], netValue: [], firstNetValue: [], repeatNetValue: [], uniqueEvent: [], storyUnlock: [] };
}

function makeRepetitionBucket(): RepetitionBucket {
  return { exact: [], family: [], mechanical: [], consecutive2: [], consecutive3: [], consecutive4: [], characterConcentration: [], locationConcentration: [], uniqueRatio: [] };
}

function pushDaily(bucket: DailyBucket, record: DailyRecord): void {
  bucket.food.push(record.food);
  bucket.population.push(record.population);
  bucket.residentPopulation.push(record.residentPopulation);
  bucket.healthySurvivors.push(record.healthySurvivors);
  bucket.injuredSurvivors.push(record.injuredSurvivors);
  bucket.missingSurvivors.push(record.missingSurvivors);
  bucket.deadSurvivors.push(record.deadSurvivors);
  bucket.production.push(record.production);
  bucket.consumption.push(record.consumption);
  bucket.communityLabor.push(record.communityLabor);
  bucket.explorationProgress.push(record.explorationProgress);
  bucket.failure.push(record.failed ? 1 : 0);
  bucket.dailyNetFood.push(record.dailyNetFood);
  bucket.dailyNetResources.push(record.dailyNetResources);
}

function day30Record(state: GameState): DailyRecord {
  const present = presentCore(state);
  return {
    day: 30,
    food: state.inventory.ration,
    population: present + Math.max(0, state.civilianResidents),
    residentPopulation: Math.max(0, state.civilianResidents),
    coreSurvivorCount: present,
    healthySurvivors: state.survivors.filter((survivor) => ['healthy', 'fatigued'].includes(survivor.condition ?? 'healthy')).length,
    injuredSurvivors: state.survivors.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length,
    missingSurvivors: state.survivors.filter((survivor) => survivor.condition === 'missing').length,
    deadSurvivors: state.survivors.filter((survivor) => survivor.condition === 'dead').length,
    foodProduction: 0,
    foodConsumption: 0,
    production: 0,
    consumption: 0,
    communityLabor: 0,
    communityContribution: 0,
    coreLaborReleased: 0,
    totalEffectiveLabor: 0,
    dailyNetFood: 0,
    dailyNetResources: 0,
    explorationProgress: state.storyFlags.filter((flag) => flag.startsWith('visited:')).length / EXPEDITION_LOCATIONS.length,
    failed: present <= 0,
  };
}

function duplicateRate<T>(items: readonly T[], key: (item: T) => string): number {
  if (!items.length) return 0;
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  const repeats = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return repeats / items.length;
}

function concentration(events: readonly AuditEventRecord[], values: (event: AuditEventRecord) => readonly string[]): number {
  if (!events.length) return 0;
  const counts = new Map<string, number>();
  for (const event of events) for (const value of new Set(values(event))) counts.set(value, (counts.get(value) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  return top / events.length;
}

function hasConsecutiveFamily(events: readonly AuditEventRecord[], length: number): boolean {
  const byFamily = new Map<string, Set<number>>();
  for (const event of events) {
    const days = byFamily.get(event.family) ?? new Set<number>();
    days.add(event.day);
    byFamily.set(event.family, days);
  }
  for (const days of byFamily.values()) {
    const ordered = [...days].sort((a, b) => a - b);
    let streak = 1;
    for (let index = 1; index < ordered.length; index += 1) {
      streak = ordered[index] === ordered[index - 1] + 1 ? streak + 1 : 1;
      if (streak >= length) return true;
    }
  }
  return false;
}

function repetitionFor(events: readonly AuditEventRecord[]): RepetitionBucket {
  const unique = new Set(events.map((event) => event.id)).size;
  return {
    exact: [duplicateRate(events, (event) => event.id)],
    family: [duplicateRate(events, (event) => event.family)],
    mechanical: [duplicateRate(events, (event) => event.mechanicalFamily)],
    consecutive2: [hasConsecutiveFamily(events, 2) ? 1 : 0],
    consecutive3: [hasConsecutiveFamily(events, 3) ? 1 : 0],
    consecutive4: [hasConsecutiveFamily(events, 4) ? 1 : 0],
    characterConcentration: [concentration(events, (event) => event.characterIds)],
    locationConcentration: [concentration(events, (event) => event.locationId ? [event.locationId] : [])],
    uniqueRatio: [events.length ? unique / events.length : 1],
  };
}

function appendRepetition(target: RepetitionBucket, source: RepetitionBucket): void {
  target.exact.push(...source.exact);
  target.family.push(...source.family);
  target.mechanical.push(...source.mechanical);
  target.consecutive2.push(...source.consecutive2);
  target.consecutive3.push(...source.consecutive3);
  target.consecutive4.push(...source.consecutive4);
  target.characterConcentration.push(...source.characterConcentration);
  target.locationConcentration.push(...source.locationConcentration);
  target.uniqueRatio.push(...source.uniqueRatio);
}

function policiesFor(policyId: string): string[] {
  return NATURAL_POLICIES.has(policyId) ? [policyId, 'NATURAL', 'ALL'] : [policyId, 'ALL'];
}

export class AuditAccumulator {
  totalRuns = 0;
  illegalActions = 0;
  private readonly policyRuns = new Map<string, number>();
  private readonly principles = new Map<string, PrincipleBucket>();
  private readonly daily = new Map<string, DailyBucket>();
  private readonly communityObserved = new Map<string, CommunityObservedBucket>();
  private readonly locations = new Map<string, LocationBucket>();
  private readonly locationTotals = new Map<string, number>();
  private readonly endings = new Map<string, number>();
  private readonly failures = new Map<string, number>();
  private readonly repetition = new Map<string, RepetitionBucket>();

  addRun(run: RunRecord): void {
    this.totalRuns += 1;
    this.illegalActions += run.illegalActionCount;
    for (const policy of policiesFor(run.policyId)) this.policyRuns.set(policy, (this.policyRuns.get(policy) ?? 0) + 1);
    const finalPopulation = presentCore(run.finalState) + Math.max(0, run.finalState.civilianResidents);
    const score = endingScore(run.finalState);
    const finalResourceValue = weightedInventory(run.finalState);

    for (const pick of run.principles) {
      for (const policy of policiesFor(run.policyId)) {
        const key = `${policy}|${pick.principle}`;
        const bucket = this.principles.get(key) ?? makePrincipleBucket();
        bucket.picks += 1;
        bucket.survival.push(presentCore(run.finalState) > 0 ? 1 : 0);
        bucket.deaths.push(run.finalState.campaignStats.deaths > pick.deathsAtPick ? 1 : 0);
        bucket.finalPopulation.push(finalPopulation);
        bucket.finalFood.push(run.finalState.inventory.ration);
        bucket.finalHope.push(run.finalState.hope);
        bucket.endingScores.push(score);
        bucket.good.push(run.finalState.ending?.tier === 'good' || run.finalState.ending?.tier === 'secret' ? 1 : 0);
        bucket.bad.push(run.finalState.ending?.tier === 'bad' ? 1 : 0);
        bucket.resourceDelta.push(finalResourceValue - pick.resourceValueAtPick);
        this.principles.set(key, bucket);
      }
    }

    const timeline = [...run.daily, day30Record(run.finalState)];
    for (const record of timeline) {
      for (const policy of policiesFor(run.policyId)) {
        const key = `${policy}|${record.day}`;
        const bucket = this.daily.get(key) ?? makeDailyBucket();
        pushDaily(bucket, record);
        this.daily.set(key, bucket);
      }
      if (CHECKPOINTS.has(record.day)) {
        const band = residentBand(record.residentPopulation);
        for (const policy of policiesFor(run.policyId)) {
          const key = `${policy}|${record.day}|${band}`;
          const bucket = this.communityObserved.get(key) ?? makeCommunityObservedBucket();
          bucket.residentPopulation.push(record.residentPopulation);
          bucket.foodProduction.push(record.foodProduction);
          bucket.foodConsumption.push(record.foodConsumption);
          bucket.communityLabor.push(record.communityLabor);
          bucket.communityContribution.push(record.communityContribution);
          bucket.coreLaborReleased.push(record.coreLaborReleased);
          bucket.totalEffectiveLabor.push(record.totalEffectiveLabor);
          bucket.dailyNetFood.push(record.dailyNetFood);
          bucket.dailyNetResources.push(record.dailyNetResources);
          this.communityObserved.set(key, bucket);
        }
      }
    }

    for (const expedition of run.expeditions) {
      for (const policy of policiesFor(run.policyId)) {
        const key = `${policy}|${expedition.locationId}`;
        const bucket = this.locations.get(key) ?? makeLocationBucket();
        bucket.visits += 1;
        bucket.firstVisits += expedition.firstVisit ? 1 : 0;
        bucket.repeatVisits += expedition.firstVisit ? 0 : 1;
        bucket.food.push(expedition.rewardRation);
        bucket.materials.push(expedition.rewardMaterials);
        bucket.medicine.push(expedition.rewardMedicine);
        bucket.special.push(expedition.rewardParts);
        bucket.injury.push(expedition.injury);
        bucket.death.push(expedition.death);
        bucket.missing.push(expedition.missing);
        bucket.workerCost.push(expedition.workerEnergyCost);
        bucket.netValue.push(expedition.netValue);
        if (expedition.firstVisit) bucket.firstNetValue.push(expedition.netValue);
        else bucket.repeatNetValue.push(expedition.netValue);
        bucket.uniqueEvent.push(expedition.uniqueEventValue);
        bucket.storyUnlock.push(expedition.storyUnlockValue);
        this.locations.set(key, bucket);
        this.locationTotals.set(policy, (this.locationTotals.get(policy) ?? 0) + 1);
      }
    }

    for (const policy of policiesFor(run.policyId)) {
      const endingKey = `${policy}|${run.finalState.ending?.id ?? 'unknown'}`;
      this.endings.set(endingKey, (this.endings.get(endingKey) ?? 0) + 1);
      const bucket = failureBucket(run.failureDay);
      const failureKey = `${policy}|${bucket}`;
      this.failures.set(failureKey, (this.failures.get(failureKey) ?? 0) + 1);
    }

    for (const phase of ['DAY1-10', 'DAY11-20', 'DAY21-30'] as const) {
      const events = run.events.filter((event) => phaseForDay(event.day) === phase);
      const metrics = repetitionFor(events);
      for (const policy of policiesFor(run.policyId)) {
        const key = `${policy}|${phase}`;
        const bucket = this.repetition.get(key) ?? makeRepetitionBucket();
        appendRepetition(bucket, metrics);
        this.repetition.set(key, bucket);
      }
    }
  }

  principleRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const policies = [...new Set([...this.policyRuns.keys()])].sort();
    for (const policy of policies) {
      const denominator = this.policyRuns.get(policy) ?? 0;
      for (const principle of PRINCIPLES) {
        const bucket = this.principles.get(`${policy}|${principle}`) ?? makePrincipleBucket();
        const scoreSummary = summarize(bucket.endingScores);
        rows.push({
          policy,
          stageDay: STAGE[principle],
          principle,
          pickCount: bucket.picks,
          pickRate: denominator ? bucket.picks / denominator : 0,
          survivalRate: mean(bucket.survival),
          deathRate: mean(bucket.deaths),
          averageFinalPopulation: mean(bucket.finalPopulation),
          averageFood: mean(bucket.finalFood),
          averageMoraleEquivalent: mean(bucket.finalHope),
          averageEndingScore: mean(bucket.endingScores),
          goodEndingRate: mean(bucket.good),
          badEndingRate: mean(bucket.bad),
          resourceDeltaAfterPick: mean(bucket.resourceDelta),
          expectedValue30Day: mean(bucket.endingScores),
          scoreMedian: scoreSummary.median,
          scoreP10: scoreSummary.p10,
          scoreP90: scoreSummary.p90,
        });
      }
    }
    return rows;
  }

  dailyRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const policies = [...this.policyRuns.keys()].sort();
    for (const policy of policies) for (let day = 1; day <= 30; day += 1) {
      const bucket = this.daily.get(`${policy}|${day}`) ?? makeDailyBucket();
      const food = summarize(bucket.food);
      const population = summarize(bucket.population);
      const residents = summarize(bucket.residentPopulation);
      const healthy = summarize(bucket.healthySurvivors);
      const production = summarize(bucket.production);
      const consumption = summarize(bucket.consumption);
      const labor = summarize(bucket.communityLabor);
      const exploration = summarize(bucket.explorationProgress);
      rows.push({
        policy, day,
        averageFood: food.mean, medianFood: food.median, foodP10: food.p10, foodP25: food.p25, foodP75: food.p75, foodP90: food.p90,
        averagePopulation: population.mean, medianPopulation: population.median, populationP10: population.p10, populationP90: population.p90,
        averageResidentPopulation: residents.mean, residentMedian: residents.median, residentP10: residents.p10, residentP90: residents.p90,
        averageHealthySurvivors: healthy.mean,
        injuryRate: mean(bucket.injuredSurvivors),
        missingRate: mean(bucket.missingSurvivors),
        deathRate: mean(bucket.deadSurvivors),
        averageProduction: production.mean,
        productionMedian: production.median,
        averageConsumption: consumption.mean,
        consumptionMedian: consumption.median,
        averageCommunityLabor: labor.mean,
        communityLaborMedian: labor.median,
        averageExplorationProgress: exploration.mean,
        failureProbability: mean(bucket.failure),
        averageDailyNetFood: mean(bucket.dailyNetFood),
        averageDailyNetResources: mean(bucket.dailyNetResources),
      });
    }
    return rows;
  }

  observedCommunityRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const policies = [...this.policyRuns.keys()].sort();
    const bands = ['0-4', '5-9', '10-14', '15-19', '20-24', '25+'];
    for (const policy of policies) for (const day of [...CHECKPOINTS].sort((a, b) => a - b)) for (const band of bands) {
      const bucket = this.communityObserved.get(`${policy}|${day}|${band}`);
      if (!bucket?.residentPopulation.length) continue;
      rows.push({
        source: 'observed', policy, scenario: '', day, residentBand: band,
        samples: bucket.residentPopulation.length,
        residentPopulation: mean(bucket.residentPopulation),
        marginalCost: 1,
        foodProduction: mean(bucket.foodProduction),
        foodConsumption: mean(bucket.foodConsumption),
        communityLabor: mean(bucket.communityLabor),
        communityContribution: mean(bucket.communityContribution),
        coreLaborReleased: mean(bucket.coreLaborReleased),
        totalEffectiveLabor: mean(bucket.totalEffectiveLabor),
        dailyNetFood: mean(bucket.dailyNetFood),
        dailyNetResources: mean(bucket.dailyNetResources),
        marginalLaborContribution: '',
        marginalResourceProduction: '',
      });
    }
    return rows;
  }

  locationRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const policies = [...this.policyRuns.keys()].sort();
    for (const policy of policies) {
      const totalVisits = this.locationTotals.get(policy) ?? 0;
      for (const location of EXPEDITION_LOCATIONS) {
        const bucket = this.locations.get(`${policy}|${location.id}`) ?? makeLocationBucket();
        rows.push({
          policy,
          locationId: location.id,
          locationName: location.name,
          danger: location.danger,
          visits: bucket.visits,
          firstVisitCount: bucket.firstVisits,
          repeatVisitCount: bucket.repeatVisits,
          averageReward: mean(bucket.food) + mean(bucket.materials) + mean(bucket.medicine) + mean(bucket.special),
          averageFoodReward: mean(bucket.food),
          averageMaterialReward: mean(bucket.materials),
          averageMedicineReward: mean(bucket.medicine),
          averageSpecialReward: mean(bucket.special),
          averageInjuryRisk: mean(bucket.injury),
          averageDeathRisk: mean(bucket.death),
          averageMissingRisk: mean(bucket.missing),
          averageWorkerCost: mean(bucket.workerCost),
          averageNetValue: mean(bucket.netValue),
          averageFirstVisitNetValue: mean(bucket.firstNetValue),
          averageRepeatVisitNetValue: mean(bucket.repeatNetValue),
          uniqueEventValue: mean(bucket.uniqueEvent),
          storyUnlockValue: mean(bucket.storyUnlock),
          selectionRate: totalVisits ? bucket.visits / totalVisits : 0,
        });
      }
    }
    return rows;
  }

  endingRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (const policy of [...this.policyRuns.keys()].sort()) {
      const denominator = this.policyRuns.get(policy) ?? 0;
      for (let id = 1; id <= 13; id += 1) {
        const endingId = `E${String(id).padStart(2, '0')}`;
        const count = this.endings.get(`${policy}|${endingId}`) ?? 0;
        rows.push({ policy, endingId, count, rate: denominator ? count / denominator : 0 });
      }
    }
    return rows;
  }

  failureRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const buckets = ['DAY1-5', 'DAY6-10', 'DAY11-15', 'DAY16-20', 'DAY21-25', 'DAY26-30', 'none'];
    for (const policy of [...this.policyRuns.keys()].sort()) {
      const denominator = this.policyRuns.get(policy) ?? 0;
      for (const bucket of buckets) {
        const count = this.failures.get(`${policy}|${bucket}`) ?? 0;
        rows.push({ policy, bucket, count, rate: denominator ? count / denominator : 0 });
      }
    }
    return rows;
  }

  repetitionRows(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    for (const policy of [...this.policyRuns.keys()].sort()) for (const phase of ['DAY1-10', 'DAY11-20', 'DAY21-30']) {
      const bucket = this.repetition.get(`${policy}|${phase}`) ?? makeRepetitionBucket();
      rows.push({
        policy, phase,
        exactEventRepeatRate: mean(bucket.exact),
        eventFamilyRepeatRate: mean(bucket.family),
        mechanicalPatternRepeatRate: mean(bucket.mechanical),
        consecutiveRepeat2Rate: mean(bucket.consecutive2),
        consecutiveRepeat3Rate: mean(bucket.consecutive3),
        consecutiveRepeat4Rate: mean(bucket.consecutive4),
        characterEventConcentration: mean(bucket.characterConcentration),
        locationEventConcentration: mean(bucket.locationConcentration),
        uniqueEventRatio: mean(bucket.uniqueRatio),
      });
    }
    return rows;
  }

  policyRunCount(policy: string): number { return this.policyRuns.get(policy) ?? 0; }
}

function stressRowsForCsv(rows: CommunityStressRow[]): Record<string, unknown>[] {
  return rows.map((row) => ({
    source: row.source,
    policy: '',
    scenario: `${row.scenario}:${row.supportMode}`,
    day: 20,
    residentBand: residentBand(row.residentPopulation),
    samples: 1,
    residentPopulation: row.residentPopulation,
    marginalCost: row.marginalCost,
    foodProduction: 0,
    foodConsumption: row.rationNeeded,
    communityLabor: row.communityLabor,
    communityContribution: row.communityContribution,
    coreLaborReleased: row.communityLabor,
    totalEffectiveLabor: row.communityLabor,
    dailyNetFood: -row.marginalCost,
    dailyNetResources: row.marginalResourceProduction,
    marginalLaborContribution: row.marginalLaborContribution,
    marginalResourceProduction: row.marginalResourceProduction,
    cookingCapacity: row.cookingCapacity,
    repairSupport: row.repairSupport,
    medicalSupport: row.medicalSupport,
    defenseRiskReduction: row.defenseRiskReduction,
    rationNeeded: row.rationNeeded,
  }));
}

export function buildDay29Rows(results: readonly Day29ChoiceResult[]): Record<string, unknown>[] {
  const sourceGroups = new Map<string, Day29ChoiceResult[]>();
  for (const result of results) {
    const key = `${result.sourceSeed}|${result.stageEventId}`;
    const group = sourceGroups.get(key) ?? [];
    group.push(result);
    sourceGroups.set(key, group);
  }
  const bestWeight = new Map<string, number>();
  const worstWeight = new Map<string, number>();
  for (const [key, group] of sourceGroups) {
    const best = Math.max(...group.map((item) => item.score));
    const worst = Math.min(...group.map((item) => item.score));
    const bestIds = group.filter((item) => item.score === best).map((item) => item.choiceId);
    const worstIds = group.filter((item) => item.score === worst).map((item) => item.choiceId);
    for (const choiceId of bestIds) bestWeight.set(`${key}|${choiceId}`, 1 / bestIds.length);
    for (const choiceId of worstIds) worstWeight.set(`${key}|${choiceId}`, 1 / worstIds.length);
  }

  interface Bucket { rows: Day29ChoiceResult[]; best: number; worst: number; }
  const buckets = new Map<string, Bucket>();
  for (const result of results) {
    const key = `${result.stageEventId}|${result.choiceId}`;
    const bucket = buckets.get(key) ?? { rows: [], best: 0, worst: 0 };
    bucket.rows.push(result);
    bucket.best += bestWeight.get(`${result.sourceSeed}|${result.stageEventId}|${result.choiceId}`) ?? 0;
    bucket.worst += worstWeight.get(`${result.sourceSeed}|${result.stageEventId}|${result.choiceId}`) ?? 0;
    buckets.set(key, bucket);
  }

  const rows: Record<string, unknown>[] = [];
  for (const [key, bucket] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [stageEventId, choiceId] = key.split('|');
    const scores = bucket.rows.map((item) => item.score);
    const summary = summarize(scores);
    const conditional: Record<string, Record<string, number>> = {};
    for (const dimension of ['population', 'food', 'core', 'buildings', 'community', 'exploration', 'endingEligibility'] as const) {
      const groups = new Map<string, number[]>();
      for (const item of bucket.rows) {
        const value = item.dimensions[dimension];
        const values = groups.get(value) ?? [];
        values.push(item.score);
        groups.set(value, values);
      }
      conditional[dimension] = Object.fromEntries([...groups].map(([value, values]) => [value, mean(values)]));
    }
    rows.push({
      stageEventId,
      choiceId,
      samples: bucket.rows.length,
      bestChoiceRate: bucket.rows.length ? bucket.best / bucket.rows.length : 0,
      worstChoiceRate: bucket.rows.length ? bucket.worst / bucket.rows.length : 0,
      averageOutcome: summary.mean,
      medianOutcome: summary.median,
      p10Outcome: summary.p10,
      p90Outcome: summary.p90,
      variance: summary.standardDeviation ** 2,
      standardDeviation: summary.standardDeviation,
      averageCoreAlive: mean(bucket.rows.map((item) => item.coreAlive)),
      averageResidents: mean(bucket.rows.map((item) => item.residents)),
      averageHope: mean(bucket.rows.map((item) => item.hope)),
      averageDefense: mean(bucket.rows.map((item) => item.defense)),
      averageResourceValue: mean(bucket.rows.map((item) => item.resourceValue)),
      stateConditionalValue: JSON.stringify(conditional),
    });
  }
  return rows;
}

function rowNumber(row: Record<string, unknown> | undefined, key: string): number {
  const value = row?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function naturalRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.filter((row) => row.policy === 'NATURAL');
}

function detectPrincipleAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const natural = naturalRows(rows);
  for (const principle of PRINCIPLES) {
    const row = natural.find((candidate) => candidate.principle === principle);
    if (row && rowNumber(row, 'pickRate') < 0.03) {
      anomalies.push({ code: 'DEAD_PRINCIPLE', priority: 'P1', title: `原则几乎无人选择：${principle}`, evidence: `自然策略 pickRate=${(rowNumber(row, 'pickRate') * 100).toFixed(1)}%。`, recommendation: '先检查适用条件、收益可读性和机会成本；不要直接加数值。' });
    }
  }
  for (const stage of [7, 14, 21]) {
    const stageRows = natural.filter((row) => row.stageDay === stage && rowNumber(row, 'pickCount') > 0).sort((a, b) => rowNumber(b, 'averageEndingScore') - rowNumber(a, 'averageEndingScore'));
    if (stageRows.length < 2) continue;
    const top = stageRows[0];
    const second = stageRows[1];
    const margin = rowNumber(top, 'averageEndingScore') - rowNumber(second, 'averageEndingScore');
    const topPrinciple = String(top.principle);
    let policyWins = 0;
    for (const policy of NATURAL_POLICIES) {
      const policyStage = rows.filter((row) => row.policy === policy && row.stageDay === stage && rowNumber(row, 'pickCount') > 0).sort((a, b) => rowNumber(b, 'averageEndingScore') - rowNumber(a, 'averageEndingScore'));
      if (policyStage[0]?.principle === topPrinciple) policyWins += 1;
    }
    if (margin >= 7 && policyWins >= 4) {
      anomalies.push({ code: 'DOMINANT_PRINCIPLE', priority: margin >= 10 ? 'P0' : 'P1', title: `原则疑似统治解：${topPrinciple}`, evidence: `DAY${stage} 自然策略平均结局分领先第二名 ${margin.toFixed(1)}，并在 ${policyWins}/5 类自然策略中居首。`, recommendation: '先分解收益来源与触发状态，确认是否同时具备高收益、低代价、广适用，再做最小补丁。' });
    }
  }
  return anomalies;
}

function detectCommunityAnomalies(stress: CommunityStressRow[]): Anomaly[] {
  const relevant = stress.filter((row) => row.scenario === 'mature-principle-synergy');
  const bestByResidents = new Map<number, CommunityStressRow>();
  for (const row of relevant) {
    const current = bestByResidents.get(row.residentPopulation);
    if (!current || row.communityLabor > current.communityLabor) bestByResidents.set(row.residentPopulation, row);
  }
  const twenty = bestByResidents.get(20);
  const thirty = bestByResidents.get(30);
  if (!twenty || !thirty) return [];
  const lateGrowth = thirty.communityLabor - twenty.communityLabor;
  const marginalLate = [...bestByResidents.entries()].filter(([residents]) => residents >= 25).map(([, row]) => row.marginalLaborContribution);
  if (lateGrowth > Math.max(1, twenty.communityLabor * 0.15) && mean(marginalLate) > 0.15) {
    return [{ code: 'OVERPOWERED_COMMUNITY_SCALING', priority: 'P0', title: '社区后期仍在明显加速', evidence: `成熟设施+原则协同时，20→30 居民有效劳动力从 ${twenty.communityLabor.toFixed(2)} 增至 ${thirty.communityLabor.toFixed(2)}，25+ 平均边际劳动力 ${mean(marginalLate).toFixed(2)}。`, recommendation: '检查各支持函数的叠加上限与共享人口池是否重复计功；优先做边际递减而非砍掉社区价值。' }];
  }
  return [];
}

function detectLocationAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const row of naturalRows(rows)) {
    const rate = rowNumber(row, 'selectionRate');
    const id = String(row.locationId);
    if (rate < 0.05) anomalies.push({ code: 'DEAD_LOCATION', priority: 'P1', title: `探索地点低使用：${id}`, evidence: `自然策略 selectionRate=${(rate * 100).toFixed(1)}%，平均净值=${rowNumber(row, 'averageNetValue').toFixed(2)}。`, recommendation: '区分奖励弱、风险高、解锁过晚、信息表达弱或仅特殊状态有价值，再决定是否调整。' });
    if (rate > 0.4) anomalies.push({ code: 'DOMINANT_LOCATION', priority: rate > 0.6 ? 'P0' : 'P1', title: `探索地点高集中：${id}`, evidence: `自然策略 selectionRate=${(rate * 100).toFixed(1)}%，平均净值=${rowNumber(row, 'averageNetValue').toFixed(2)}。`, recommendation: '检查是否成为默认必刷路线；优先比较首次价值与重复价值，而不是直接削弱首次故事奖励。' });
  }
  return anomalies;
}

function detectDay29Anomalies(rows: Record<string, unknown>[]): Anomaly[] {
  return rows.filter((row) => rowNumber(row, 'bestChoiceRate') > 0.7).map((row): Anomaly => ({
    code: 'DAY29_DOMINANT_CHOICE',
    priority: rowNumber(row, 'bestChoiceRate') > 0.8 ? 'P0' : 'P1',
    title: `DAY29 选择疑似假选择：${String(row.choiceId)}`,
    evidence: `${String(row.stageEventId)} 中 bestChoiceRate=${(rowNumber(row, 'bestChoiceRate') * 100).toFixed(1)}%，worstChoiceRate=${(rowNumber(row, 'worstChoiceRate') * 100).toFixed(1)}%。`,
    recommendation: '检查该选项是否在跨人口/食物/建筑/路线状态下仍占优；若是，再做条件化代价或收益修正。',
  }));
}

function detectRepetitionAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const natural = naturalRows(rows);
  const early = natural.find((row) => row.phase === 'DAY1-10');
  const late = natural.find((row) => row.phase === 'DAY21-30');
  if (late && (rowNumber(late, 'exactEventRepeatRate') > 0.12 || rowNumber(late, 'mechanicalPatternRepeatRate') > 0.45)) {
    anomalies.push({ code: 'HIGH_EVENT_REPEAT', priority: rowNumber(late, 'mechanicalPatternRepeatRate') > 0.55 ? 'P0' : 'P1', title: '后期事件重复偏高', evidence: `DAY21-30 exact=${(rowNumber(late, 'exactEventRepeatRate') * 100).toFixed(1)}%，mechanical=${(rowNumber(late, 'mechanicalPatternRepeatRate') * 100).toFixed(1)}%。`, recommendation: '先定位重复来自 eventId、family 还是支付/拒绝等机械模板，再决定补内容还是调调度权重。' });
  }
  if (early && late && rowNumber(late, 'uniqueEventRatio') < rowNumber(early, 'uniqueEventRatio') * 0.65) {
    anomalies.push({ code: 'LATE_GAME_CONTENT_COLLAPSE', priority: 'P1', title: '后期内容池明显缩水', evidence: `uniqueEventRatio 从前期 ${(rowNumber(early, 'uniqueEventRatio') * 100).toFixed(1)}% 降至后期 ${(rowNumber(late, 'uniqueEventRatio') * 100).toFixed(1)}%。`, recommendation: '检查 eligibility、已消耗唯一事件和后期可用 family 数量；不要用纯随机加权掩盖池子不足。' });
  }
  return anomalies;
}

function detectPressureAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const natural = naturalRows(rows);
  const day15 = natural.find((row) => row.day === 15);
  const day29 = natural.find((row) => row.day === 29);
  if (day15 && day29 && rowNumber(day29, 'averageFood') > rowNumber(day15, 'averageFood') * 2 + 5 && rowNumber(day29, 'averageDailyNetResources') > 2.5) {
    return [{ code: 'LATE_GAME_RESOURCE_EXPLOSION', priority: 'P0', title: '后期资源出现爆炸式正反馈', evidence: `自然策略平均食物 DAY15=${rowNumber(day15, 'averageFood').toFixed(1)} → DAY29=${rowNumber(day29, 'averageFood').toFixed(1)}，DAY29 平均净资源=${rowNumber(day29, 'averageDailyNetResources').toFixed(2)}。`, recommendation: '分解来源为探索、社区、建筑或事件奖励，优先修真正造成复利的环节。' }];
  }
  return [];
}

function detectFailureAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const natural = naturalRows(rows);
  const failures = natural.filter((row) => row.bucket !== 'none').reduce((sum, row) => sum + rowNumber(row, 'count'), 0);
  const early = natural.find((row) => row.bucket === 'DAY1-5');
  const share = failures ? rowNumber(early, 'count') / failures : 0;
  if (share > 0.35 && failures >= 20) return [{ code: 'EARLY_GAME_DEATH_SPIKE', priority: share > 0.5 ? 'P0' : 'P1', title: '失败过度集中在 DAY1-5', evidence: `自然策略失败样本中 ${(share * 100).toFixed(1)}% 发生在 DAY1-5。`, recommendation: '检查早期口粮、首轮随机事件和初始岗位容错，避免把学习成本误当难度。' }];
  return [];
}

function detectEndingAnomalies(rows: Record<string, unknown>[]): Anomaly[] {
  const natural = naturalRows(rows).sort((a, b) => rowNumber(b, 'rate') - rowNumber(a, 'rate'));
  const top = natural[0];
  if (top && rowNumber(top, 'rate') > 0.8) return [{ code: 'ENDING_COLLAPSE', priority: 'P0', title: `结局分布坍缩：${String(top.endingId)}`, evidence: `自然策略中该结局占 ${(rowNumber(top, 'rate') * 100).toFixed(1)}%。`, recommendation: '检查结局条件是否被一条通用发展路线自动满足，或其他结局条件几乎不可达。' }];
  return [];
}

function markdownTable(headers: string[], rows: string[][]): string {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`;
}

function pct(value: number): string { return `${(value * 100).toFixed(1)}%`; }
function n(value: unknown, digits = 2): string { return typeof value === 'number' ? value.toFixed(digits) : String(value ?? ''); }

function principleMarkdown(rows: Record<string, unknown>[]): string {
  const natural = naturalRows(rows);
  const table = markdownTable(
    ['阶段', '原则', '选择率', '生存率', '坏结局率', '结局分', '资源Δ'],
    natural.map((row) => [String(row.stageDay), String(row.principle), pct(rowNumber(row, 'pickRate')), pct(rowNumber(row, 'survivalRate')), pct(rowNumber(row, 'badEndingRate')), n(row.averageEndingScore), n(row.resourceDeltaAfterPick)]),
  );
  const analyses: string[] = [];
  for (const day of [7, 14, 21]) {
    const stage = natural.filter((row) => row.stageDay === day && rowNumber(row, 'pickCount') > 0);
    const avgScore = mean(stage.map((row) => rowNumber(row, 'averageEndingScore')));
    for (const row of stage) {
      const scoreDelta = rowNumber(row, 'averageEndingScore') - avgScore;
      const resource = rowNumber(row, 'resourceDeltaAfterPick');
      const tradeoff = scoreDelta > 5 && resource > 0 ? '同时提高终局表现和资源余量，trade-off 偏弱'
        : scoreDelta > 5 ? '终局收益较高，但资源面没有同步占优，存在可见代价'
          : scoreDelta < -5 && resource < 0 ? '终局与资源均偏弱，需要检查适用状态是否过窄'
            : '总体接近同阶段均值，价值更依赖具体状态';
      analyses.push(`- **DAY${day} · ${String(row.principle)}**：相对同阶段平均结局分 ${scoreDelta >= 0 ? '+' : ''}${scoreDelta.toFixed(1)}；${tradeoff}。`);
    }
  }
  return `# Principle audit\n\n本报告只把自然策略（Random、Survival、Production、Exploration、Strong Heuristic）用于“是否统治/是否死亡”的判断；Principle Greedy 只用于反事实强度测量，避免人为选择偏好污染 pickRate。\n\n${table}\n\n## 状态与 trade-off 解读\n\n${analyses.join('\n')}\n\n> resourceDeltaAfterPick 是从选择时点到 DAY30 的观察性加权库存变化，不应单独解释为原则的纯因果效应；需和 Principle Greedy 反事实结果一起看。\n`;
}

function communityMarkdown(stress: CommunityStressRow[], observed: Record<string, unknown>[]): string {
  const best = new Map<number, CommunityStressRow>();
  for (const row of stress.filter((item) => item.scenario === 'mature-principle-synergy')) {
    const current = best.get(row.residentPopulation);
    if (!current || row.communityLabor > current.communityLabor) best.set(row.residentPopulation, row);
  }
  const checkpoints = [0, 5, 10, 15, 20, 25, 30].map((residents) => best.get(residents)).filter((row): row is CommunityStressRow => Boolean(row));
  const table = markdownTable(['居民', '最优轮值', '有效劳动力', '边际劳动力', '维修贡献', '防御减险', '每日新增口粮成本'], checkpoints.map((row) => [String(row.residentPopulation), row.supportMode, row.communityLabor.toFixed(2), row.marginalLaborContribution.toFixed(2), row.repairSupport.toFixed(2), pct(row.defenseRiskReduction), row.marginalCost.toFixed(0)]));
  const observedSamples = observed.filter((row) => row.policy === 'NATURAL').reduce((sum, row) => sum + rowNumber(row, 'samples'), 0);
  return `# Community scaling audit\n\n同时使用两类证据：完整 30 天模拟中的 observed 样本，以及 0→30 居民的 counterfactual sweep。后者直接调用当前社区与供餐 domain 函数，保证 >10、>15、>20、>25 居民区间一定被覆盖。\n\n自然策略 observed checkpoint 样本合计：**${observedSamples}**。\n\n${table}\n\n## 判读原则\n\n居民的直接边际成本固定包含每人每天 1 份口粮；正反馈来自炊事、维修、医疗和守备的“核心劳动力释放”。健康曲线应当是前期安置成本明显、中期回本、后期仍有价值但各支持函数逐步触顶。如果 20→30 人仍持续加速且多个支持模式同时叠加增长，才标记为 OVERPOWERED_COMMUNITY_SCALING。\n`;
}

function locationMarkdown(rows: Record<string, unknown>[]): string {
  const natural = naturalRows(rows);
  const table = markdownTable(['地点', '选择率', '访问', '首次净值', '重复净值', '总净值', '伤', '死', '失踪'], natural.map((row) => [String(row.locationId), pct(rowNumber(row, 'selectionRate')), String(row.visits), n(row.averageFirstVisitNetValue), n(row.averageRepeatVisitNetValue), n(row.averageNetValue), n(row.averageInjuryRisk), n(row.averageDeathRisk), n(row.averageMissingRisk)]));
  return `# Location value audit\n\n选择率按所有探索访问次数归一化；首次探索与重复探索分别输出平均净值。低使用地点不自动判定为“奖励太少”：可能是解锁太晚、风险过高、信息表达失败，或只在少数资源状态下有价值。\n\n${table}\n`;
}

function day29Markdown(rows: Record<string, unknown>[]): string {
  const table = markdownTable(['阶段', '选择', '样本', '最佳率', '最差率', '平均结果', 'σ'], rows.map((row) => [String(row.stageEventId), String(row.choiceId), String(row.samples), pct(rowNumber(row, 'bestChoiceRate')), pct(rowNumber(row, 'worstChoiceRate')), n(row.averageOutcome), n(row.standardDeviation)]));
  return `# DAY29 choice audit\n\nDAY29 当前是 6 个连续最终尸潮阶段，而不是单一终局按钮。因此矩阵按 **stageEventId × choiceId** fork：每个合法状态先复制同一源状态，强制执行一个候选选择，再由同一 Strong Heuristic 完成剩余阶段；源状态 mutation 会触发测试失败。\n\n${table}\n\n`;
}

function repetitionMarkdown(rows: Record<string, unknown>[]): string {
  const natural = naturalRows(rows);
  const table = markdownTable(['阶段', 'exact', 'family', 'mechanical', '连续2天', '连续3天', '连续4天', 'unique'], natural.map((row) => [String(row.phase), pct(rowNumber(row, 'exactEventRepeatRate')), pct(rowNumber(row, 'eventFamilyRepeatRate')), pct(rowNumber(row, 'mechanicalPatternRepeatRate')), pct(rowNumber(row, 'consecutiveRepeat2Rate')), pct(rowNumber(row, 'consecutiveRepeat3Rate')), pct(rowNumber(row, 'consecutiveRepeat4Rate')), pct(rowNumber(row, 'uniqueEventRatio'))]));
  return `# Content repetition audit\n\nexact = 同 eventId 重复；family = 同系统/类别重复；mechanical = 选择结构（人物判定 / 支付资源 / 接受后果）模式重复。后两项故意比文本更严格，用来发现“换了文案但还是支付/拒绝”的内容疲劳。\n\n${table}\n`;
}

function anomalyMarkdown(anomalies: Anomaly[]): string {
  const sections = (['P0', 'P1', 'P2'] as const).map((priority) => {
    const items = anomalies.filter((anomaly) => anomaly.priority === priority);
    if (!items.length) return `## ${priority}\n\n本轮自动阈值未标记问题。`;
    return `## ${priority}\n\n${items.map((item) => `### ${item.code} · ${item.title}\n\n**证据：** ${item.evidence}\n\n**下一步：** ${item.recommendation}`).join('\n\n')}`;
  });
  return `# Balance anomalies\n\n这是 baseline 自动异常筛查，不是平衡补丁清单。任何数值修改都应在第二个独立 balance 分支进行。\n\n${sections.join('\n\n')}\n`;
}

function baselineMarkdown(config: AuditConfig, accumulator: AuditAccumulator, endingRows: Record<string, unknown>[], anomalies: Anomaly[]): string {
  const naturalEndings = naturalRows(endingRows).sort((a, b) => rowNumber(b, 'rate') - rowNumber(a, 'rate')).slice(0, 5);
  const endingTable = markdownTable(['结局', '自然策略占比'], naturalEndings.map((row) => [String(row.endingId), pct(rowNumber(row, 'rate'))]));
  const priorities = ['P0', 'P1', 'P2'].map((priority) => `${priority}: ${anomalies.filter((anomaly) => anomaly.priority === priority).length}`).join(' · ');
  return `# v0.6.0 baseline playtest\n\nBaseline tag/name: **v0.6.0-baseline-playtest**\n\n- DAY1→30 完整模拟：${accumulator.totalRuns}\n- baseline seed 起点：${config.seed}\n- DAY29 synthetic states：${config.day29States}\n- 非法 policy action：${accumulator.illegalActions}\n- 自然策略：Random / Survival Greedy / Production Greedy / Exploration Greedy / Strong Heuristic\n- 反事实原则策略：9 个 Principle Greedy\n- 异常：${priorities}\n\n## 自然策略结局 Top 5\n\n${endingTable}\n\n## 解释边界\n\n本报告不是“平均值排行榜”。CSV 同时输出 median、p10/p25/p75/p90 等分位数；原则、社区、地点、DAY29 与事件重复分别有专项报告。第一轮只测量，不对原则、社区、地点、结局或事件池做大规模重写。\n`;
}

export function buildReportBundle(config: AuditConfig, accumulator: AuditAccumulator, day29Results: readonly Day29ChoiceResult[]): ReportBundle {
  const principleRows = accumulator.principleRows();
  const dailyRows = accumulator.dailyRows();
  const observedCommunity = accumulator.observedCommunityRows();
  const communityStress = buildCommunityStressRows();
  const communityRows = [...observedCommunity, ...stressRowsForCsv(communityStress)];
  const locationRows = accumulator.locationRows();
  const day29Rows = buildDay29Rows(day29Results);
  const repetitionRows = accumulator.repetitionRows();
  const endingRows = accumulator.endingRows();
  const failureRows = accumulator.failureRows();
  const anomalies = [
    ...detectPrincipleAnomalies(principleRows),
    ...detectCommunityAnomalies(communityStress),
    ...detectLocationAnomalies(locationRows),
    ...detectDay29Anomalies(day29Rows),
    ...detectRepetitionAnomalies(repetitionRows),
    ...detectPressureAnomalies(dailyRows),
    ...detectFailureAnomalies(failureRows),
    ...detectEndingAnomalies(endingRows),
  ];

  const principleHeaders = ['policy', 'stageDay', 'principle', 'pickCount', 'pickRate', 'survivalRate', 'deathRate', 'averageFinalPopulation', 'averageFood', 'averageMoraleEquivalent', 'averageEndingScore', 'goodEndingRate', 'badEndingRate', 'resourceDeltaAfterPick', 'expectedValue30Day', 'scoreMedian', 'scoreP10', 'scoreP90'];
  const communityHeaders = ['source', 'policy', 'scenario', 'day', 'residentBand', 'samples', 'residentPopulation', 'marginalCost', 'foodProduction', 'foodConsumption', 'communityLabor', 'communityContribution', 'coreLaborReleased', 'totalEffectiveLabor', 'dailyNetFood', 'dailyNetResources', 'marginalLaborContribution', 'marginalResourceProduction', 'cookingCapacity', 'repairSupport', 'medicalSupport', 'defenseRiskReduction', 'rationNeeded'];
  const locationHeaders = ['policy', 'locationId', 'locationName', 'danger', 'visits', 'firstVisitCount', 'repeatVisitCount', 'averageReward', 'averageFoodReward', 'averageMaterialReward', 'averageMedicineReward', 'averageSpecialReward', 'averageInjuryRisk', 'averageDeathRisk', 'averageMissingRisk', 'averageWorkerCost', 'averageNetValue', 'averageFirstVisitNetValue', 'averageRepeatVisitNetValue', 'uniqueEventValue', 'storyUnlockValue', 'selectionRate'];
  const day29Headers = ['stageEventId', 'choiceId', 'samples', 'bestChoiceRate', 'worstChoiceRate', 'averageOutcome', 'medianOutcome', 'p10Outcome', 'p90Outcome', 'variance', 'standardDeviation', 'averageCoreAlive', 'averageResidents', 'averageHope', 'averageDefense', 'averageResourceValue', 'stateConditionalValue'];
  const repetitionHeaders = ['policy', 'phase', 'exactEventRepeatRate', 'eventFamilyRepeatRate', 'mechanicalPatternRepeatRate', 'consecutiveRepeat2Rate', 'consecutiveRepeat3Rate', 'consecutiveRepeat4Rate', 'characterEventConcentration', 'locationEventConcentration', 'uniqueEventRatio'];
  const dailyHeaders = ['policy', 'day', 'averageFood', 'medianFood', 'foodP10', 'foodP25', 'foodP75', 'foodP90', 'averagePopulation', 'medianPopulation', 'populationP10', 'populationP90', 'averageResidentPopulation', 'residentMedian', 'residentP10', 'residentP90', 'averageHealthySurvivors', 'injuryRate', 'missingRate', 'deathRate', 'averageProduction', 'productionMedian', 'averageConsumption', 'consumptionMedian', 'averageCommunityLabor', 'communityLaborMedian', 'averageExplorationProgress', 'failureProbability', 'averageDailyNetFood', 'averageDailyNetResources'];

  const summary = {
    baseline: 'v0.6.0-baseline-playtest',
    runs: accumulator.totalRuns,
    seed: config.seed,
    day29States: config.day29States,
    day29ForkResults: day29Results.length,
    illegalActionCount: accumulator.illegalActions,
    anomalies,
  };

  return {
    anomalies,
    summary,
    files: {
      'principle_balance.csv': toCsv(principleHeaders, principleRows),
      'community_curve.csv': toCsv(communityHeaders, communityRows),
      'location_value.csv': toCsv(locationHeaders, locationRows),
      'day29_choice_matrix.csv': toCsv(day29Headers, day29Rows),
      'event_repetition.csv': toCsv(repetitionHeaders, repetitionRows),
      'daily_pressure_curve.csv': toCsv(dailyHeaders, dailyRows),
      'ending_distribution.csv': toCsv(['policy', 'endingId', 'count', 'rate'], endingRows),
      'failure_day_distribution.csv': toCsv(['policy', 'bucket', 'count', 'rate'], failureRows),
      'baseline-summary.json': `${JSON.stringify(summary, null, 2)}\n`,
      'balance_anomalies.json': `${JSON.stringify(anomalies, null, 2)}\n`,
      'baseline-summary.md': baselineMarkdown(config, accumulator, endingRows, anomalies),
      'principle-audit.md': principleMarkdown(principleRows),
      'community-scaling.md': communityMarkdown(communityStress, observedCommunity),
      'location-audit.md': locationMarkdown(locationRows),
      'day29-audit.md': day29Markdown(day29Rows),
      'content-repetition.md': repetitionMarkdown(repetitionRows),
      'balance-anomalies.md': anomalyMarkdown(anomalies),
    },
  };
}
