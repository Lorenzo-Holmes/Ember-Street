import type { BuildingId, CommunitySupportMode, EndingId, GameState, StreetPrincipleId } from '../../src/game/types';

export type BasePolicyId = 'random' | 'survival-greedy' | 'production-greedy' | 'exploration-greedy' | 'strong-heuristic';
export type AuditPolicyId = BasePolicyId | `principle-greedy:${StreetPrincipleId}`;

export interface AuditConfig {
  runs: number;
  day29States: number;
  seed: number;
  outDir: string;
  docsDir: string;
}

export interface AuditEventRecord {
  day: number;
  id: string;
  family: string;
  mechanicalFamily: string;
  source: 'campaign' | 'principle' | 'expedition' | 'night';
  characterIds: string[];
  locationId?: string;
  choiceId?: string;
}

export interface PrinciplePickRecord {
  day: number;
  principle: StreetPrincipleId;
  resourceValueAtPick: number;
  deathsAtPick: number;
}

export interface ExpeditionRecord {
  day: number;
  locationId: string;
  eventId: string | null;
  firstVisit: boolean;
  rewardRation: number;
  rewardMedicine: number;
  rewardMaterials: number;
  rewardParts: number;
  injury: number;
  death: number;
  missing: number;
  workerEnergyCost: number;
  netValue: number;
  uniqueEventValue: number;
  storyUnlockValue: number;
}

export interface DailyRecord {
  day: number;
  food: number;
  population: number;
  residentPopulation: number;
  coreSurvivorCount: number;
  healthySurvivors: number;
  injuredSurvivors: number;
  missingSurvivors: number;
  deadSurvivors: number;
  foodProduction: number;
  foodConsumption: number;
  production: number;
  consumption: number;
  communityLabor: number;
  communityContribution: number;
  coreLaborReleased: number;
  totalEffectiveLabor: number;
  dailyNetFood: number;
  dailyNetResources: number;
  explorationProgress: number;
  failed: boolean;
}

export interface RunRecord {
  seed: number;
  policyId: AuditPolicyId;
  finalState: GameState;
  daily: DailyRecord[];
  principles: PrinciplePickRecord[];
  expeditions: ExpeditionRecord[];
  events: AuditEventRecord[];
  failureDay: number | null;
  failureReason: string | null;
  illegalActionCount: number;
}

export interface Day29Dimensions {
  population: 'low' | 'medium' | 'high';
  food: 'famine' | 'tight' | 'enough' | 'surplus';
  core: 'mostly-alive' | 'many-dead' | 'many-missing';
  buildings: 'low' | 'medium' | 'high';
  community: 'low' | 'medium' | 'high';
  principleRoute: string;
  exploration: 'low' | 'medium' | 'high';
  endingEligibility: 'weak' | 'mixed' | 'strong';
}

export interface Day29GeneratedState {
  state: GameState;
  dimensions: Day29Dimensions;
}

export interface Day29ChoiceResult {
  sourceSeed: number;
  stageEventId: string;
  choiceId: string;
  legalChoiceCount: number;
  score: number;
  endingId: EndingId;
  endingTier: NonNullable<GameState['ending']>['tier'];
  finalHordeResult: string;
  coreAlive: number;
  residents: number;
  hope: number;
  defense: number;
  resourceValue: number;
  dimensions: Day29Dimensions;
}

export interface NumericSummary {
  count: number;
  mean: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  min: number;
  max: number;
  standardDeviation: number;
}

export interface Anomaly {
  code:
    | 'DOMINANT_PRINCIPLE'
    | 'DEAD_PRINCIPLE'
    | 'OVERPOWERED_COMMUNITY_SCALING'
    | 'DEAD_LOCATION'
    | 'DOMINANT_LOCATION'
    | 'DAY29_DOMINANT_CHOICE'
    | 'HIGH_EVENT_REPEAT'
    | 'LATE_GAME_RESOURCE_EXPLOSION'
    | 'EARLY_GAME_DEATH_SPIKE'
    | 'LATE_GAME_CONTENT_COLLAPSE'
    | 'ENDING_COLLAPSE';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  evidence: string;
  recommendation: string;
}

export const PRINCIPLES: StreetPrincipleId[] = [
  'everyone-shares',
  'triage-first',
  'outward-search',
  'core-leads',
  'community-shares-risk',
  'preserve-strength',
  'hold-the-street',
  'prepare-evacuation',
  'await-aid',
];

export const BUILDING_IDS: BuildingId[] = ['searchStation', 'workshop', 'clinic', 'watchPost', 'shelter', 'radio'];
export const COMMUNITY_MODES: CommunitySupportMode[] = ['logistics', 'repair', 'defense'];

export class AuditRng {
  private value: number;

  constructor(seed: number) {
    this.value = (seed >>> 0) || 0x6d2b79f5;
  }

  next(): number {
    let x = this.value;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.value = x >>> 0;
    return this.value / 0x100000000;
  }

  int(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Math.min(maxExclusive - 1, Math.floor(this.next() * maxExclusive));
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('AuditRng.pick called with an empty array');
    return items[this.int(items.length)];
  }
}

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function policySeed(seed: number, policyId: string): number {
  return (seed ^ hashString(policyId) ^ 0x9e3779b9) >>> 0;
}

export function presentCore(state: GameState): number {
  return state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;
}

export function healthyCore(state: GameState): number {
  return state.survivors.filter((survivor) => ['healthy', 'fatigued'].includes(survivor.condition ?? 'healthy')).length;
}

export function weightedInventory(state: GameState): number {
  return state.inventory.ration
    + state.inventory.medicine * 3
    + state.inventory.materials * 1.2
    + state.inventory.parts * 2
    + state.inventory.power * 0.08;
}

export function weightedInventoryDelta(before: GameState, after: GameState): number {
  return weightedInventory(after) - weightedInventory(before);
}

export function endingScore(state: GameState): number {
  const tier = state.ending?.tier;
  const tierBase = tier === 'secret' ? 150 : tier === 'good' ? 110 : tier === 'normal' ? 65 : 15;
  const horde = state.finalHordeResult === 'perfect' ? 24 : state.finalHordeResult === 'held' ? 15 : state.finalHordeResult === 'damaged' ? 5 : -10;
  return tierBase
    + horde
    + presentCore(state) * 7
    + Math.max(0, state.civilianResidents) * 1.5
    + state.hope * 0.25
    + state.defense * 0.2
    + weightedInventory(state) * 0.08
    - state.campaignStats.deaths * 12
    - state.campaignStats.missing * 7;
}

export function outcomeTierValue(state: GameState): number {
  if (state.ending?.tier === 'secret') return 4;
  if (state.ending?.tier === 'good') return 3;
  if (state.ending?.tier === 'normal') return 2;
  return 1;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function summarize(values: readonly number[]): NumericSummary {
  if (!values.length) {
    return { count: 0, mean: 0, median: 0, p10: 0, p25: 0, p75: 0, p90: 0, min: 0, max: 0, standardDeviation: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return {
    count: values.length,
    mean,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    standardDeviation: Math.sqrt(variance),
  };
}

export function csvCell(value: unknown): string {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(Math.round(value * 10000) / 10000) : String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(','));
  return `${lines.join('\n')}\n`;
}

export function phaseForDay(day: number): 'DAY1-10' | 'DAY11-20' | 'DAY21-30' {
  if (day <= 10) return 'DAY1-10';
  if (day <= 20) return 'DAY11-20';
  return 'DAY21-30';
}

export function failureBucket(day: number | null): string {
  if (day === null) return 'none';
  if (day <= 5) return 'DAY1-5';
  if (day <= 10) return 'DAY6-10';
  if (day <= 15) return 'DAY11-15';
  if (day <= 20) return 'DAY16-20';
  if (day <= 25) return 'DAY21-25';
  return 'DAY26-30';
}

export function residentBand(residents: number): string {
  if (residents < 5) return '0-4';
  if (residents < 10) return '5-9';
  if (residents < 15) return '10-14';
  if (residents < 20) return '15-19';
  if (residents < 25) return '20-24';
  return '25+';
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}
