export type SupplyKind = 'ration' | 'medical' | 'battery';
export type OrderKind = 'survivor' | 'defense';
export type Phase = 'dawn' | 'street' | 'assignment' | 'expedition' | 'dusk' | 'night' | 'night-summary' | 'ending' | 'summary';
export type Role = 'search' | 'repair' | 'medical' | 'watch' | 'cook' | 'radio' | 'rest';
export type DayAssignment = 'expedition' | 'repair' | 'medical' | 'watch' | 'radio' | 'cook' | 'rest';
export type BuildingId = 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';
export type DayStep = 'morning' | 'event' | 'dusk';
export type InjuryState = 'healthy' | 'minor' | 'serious' | 'resting';
export type SurvivorCondition = 'healthy' | 'fatigued' | 'minor' | 'serious' | 'critical' | 'missing' | 'dead';
export type LogTone = 'neutral' | 'hope' | 'danger' | 'resource';
export type StoryCategory = 'location' | 'survivor' | 'street' | 'world' | 'cat';
export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type CheckOutcome = 'failure' | 'partial' | 'success' | 'critical';
export type CheckSource = 'story' | 'night';
export type MealQuality = 'cold' | 'struggling' | 'hot' | 'full' | 'well-fed';
export type FinalHordeResult = 'perfect' | 'held' | 'damaged' | 'breached';
export type EndingId = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07' | 'E08' | 'E09' | 'E10' | 'E11' | 'E12' | 'E13';

export interface SupplyItem { id: string; kind: SupplyKind; tier: 1 | 2 | 3; }
export interface Order { id: string; kind: OrderKind; targetKind: SupplyKind; targetTier: 2; title: string; line: string; patienceMs: number; maxPatienceMs: number; rewardHope: number; rewardParts: number; pressureRelief: number; }
export interface NightStats { served: number; missed: number; merges: number; peakPressure: number; startedAt: number; }
export interface Survivor { id: string; name: string; specialty: Role; energy: number; mood: 'low' | 'steady' | 'bright'; perk: string; trait?: string; trust?: 0 | 1 | 2 | 3; injury?: InjuryState; condition?: SurvivorCondition; }
export interface Buildings { searchStation: number; workshop: number; clinic: number; watchPost: number; shelter: number; radio: number; }
export interface DayForecast { title: string; detail: string; intensity: number; bonusKind?: SupplyKind; }
export interface StreetLogEntry { id: string; day: number; time: string; title: string; body: string; tone: LogTone; }
export interface CheckModifier { label: string; value: number; }
export interface PendingCheck {
  id: string;
  source: CheckSource;
  eventId: string;
  choiceId: string;
  label: string;
  actorId?: string;
  mode: RollMode;
  modifiers: CheckModifier[];
  dice?: number[];
  keptDice?: number[];
  total?: number;
  outcome?: CheckOutcome;
  twist?: 'double-six' | 'double-one';
  rerolled?: boolean;
}
export interface NightFeedEntry { id: string; time: string; title: string; body: string; tone: LogTone; }

export interface Inventory {
  ration: number;
  medicine: number;
  power: number;
  materials: number;
  parts: number;
}

export interface MealState {
  quality: MealQuality;
  coverage: number;
  cookingCapacity: number;
  residentsFed: number;
  rationCoverage: number;
  consecutiveShortageDays: number;
  wellFed: boolean;
  wellFedPlus: boolean;
}

export interface DayState {
  assignmentsLocked: boolean;
  returnedExpeditions: number;
  unresolvedExpeditions: string[];
}

export interface ExpeditionState {
  activePartyIds: string[];
  locationId: string | null;
  eventId: string | null;
  departed: boolean;
}

export interface NightState {
  eventIndex: number;
  eventTotal: number;
  scheduledEventIds: string[];
  emergencyEventIds: string[];
  currentEventId: string | null;
  hordeActive: boolean;
  hordeStage: 'approach' | 'impact' | 'retreat' | 'breach' | null;
  resolutions: string[];
}

export interface CampaignStats {
  rescued: number;
  deaths: number;
  missing: number;
  expeditions: number;
  locationsDiscovered: number;
  nightEventsResolved: number;
  emergencyEventsResolved: number;
}

export interface EndingResult {
  id: EndingId;
  title: string;
  tier: 'good' | 'normal' | 'bad' | 'secret';
  summary: string;
}

/**
 * v0.6 migration note:
 * The v0.5 seven-slot/order fields intentionally remain during Phase 1 so old
 * code can run while save data is promoted to v3. Phase 2 removes them.
 */
export interface GameState {
  version: 3;
  seed: number;
  rngState: number;
  phase: Phase;
  day: number;

  inventory: Inventory;
  storyItems: string[];
  mainLightStage: 1 | 2 | 3 | 4 | 5;
  dayAssignments: Record<string, DayAssignment>;
  dayState: DayState;
  expeditionState: ExpeditionState;
  mealState: MealState;
  nightState: NightState;
  campaignStats: CampaignStats;
  finalHordeResult?: FinalHordeResult;
  ending?: EndingResult | null;

  // v0.5 compatibility fields; removed in Phase 2.
  nightRemainingMs: number;
  slots: Array<SupplyItem | null>;
  racks: SupplyKind[];
  rackStock?: number[];
  queue: SupplyKind[];
  currentOrder: Order;
  orderIndex: number;
  orderActive?: boolean;
  orderCooldownMs?: number;
  nightOrderLimit?: number;
  medicalGraceUsed?: boolean;
  hordePressure: number;
  hope: number;
  parts: number;
  supplies: number;
  medicine: number;
  power?: number;
  defense?: number;
  firstLightLevel: number;
  searchStationRepaired: boolean;
  survivorJoined: boolean;
  survivors: Survivor[];
  assignments: Record<string, Role>;
  buildings: Buildings;
  forecast: DayForecast;
  chapterComplete: boolean;
  dayStep?: DayStep;
  logs?: StreetLogEntry[];
  activeEventId?: string | null;
  resolvedEventIds?: string[];
  storyFlags?: string[];
  resolvedStoryEventIds?: string[];
  storyDailyIds?: string[];
  storyPreparedDay?: number;
  pendingCheck?: PendingCheck | null;
  nightFeed?: NightFeedEntry[];
  nightNarrativeFlags?: string[];
  nightStoryDay?: number;
  nightIncidentId?: string | null;
  catStage?: 0 | 1 | 2 | 3;
  catFedToday?: boolean;
  combo?: number;
  bestCombo?: number;
  comboRemainingMs?: number;
  clearances?: number;
  extremeServes?: number;
  stats: NightStats;
  lastMessage: string;
}
