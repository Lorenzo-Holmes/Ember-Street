export type Phase = 'dawn' | 'street' | 'assignment' | 'expedition' | 'dusk' | 'night' | 'night-summary' | 'summary' | 'ending';
export type Role = 'search' | 'repair' | 'medical' | 'watch' | 'cook' | 'radio' | 'rest';
export type DayAssignment = 'expedition' | 'repair' | 'medical' | 'watch' | 'radio' | 'cook' | 'rest';
export type BuildingId = 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';
export type SurvivorCondition = 'healthy' | 'fatigued' | 'minor' | 'serious' | 'critical' | 'missing' | 'dead';
export type SurvivorMentalState = 'steady' | 'focused' | 'shaken';
export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type CheckOutcome = 'failure' | 'partial' | 'success' | 'critical';
export type MealQuality = 'cold' | 'struggling' | 'hot' | 'full' | 'well-fed';
export type FinalHordeResult = 'perfect' | 'held' | 'damaged' | 'breached';
export type EndingId = 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07' | 'E08' | 'E09' | 'E10' | 'E11' | 'E12' | 'E13';
export type CommunitySupportMode = 'logistics' | 'repair' | 'defense';
export type CommunityPromiseKind = 'hot-meal' | 'search-missing' | 'restore-defense' | 'medical-care' | 'shelter';
export type CommunityPromiseStatus = 'active' | 'fulfilled' | 'broken';
export type StreetPrincipleId =
  | 'everyone-shares'
  | 'triage-first'
  | 'outward-search'
  | 'core-leads'
  | 'community-shares-risk'
  | 'preserve-strength'
  | 'hold-the-street'
  | 'prepare-evacuation'
  | 'await-aid';

export interface CommunityPromise {
  id: string;
  kind: CommunityPromiseKind;
  title: string;
  createdDay: number;
  deadlineDay: number;
  status: CommunityPromiseStatus;
  targetId?: string;
  targetValue?: number;
}

export interface SocialState {
  pressure: number;
  activePromise: CommunityPromise | null;
  fulfilledPromises: number;
  brokenPromises: number;
  principles: StreetPrincipleId[];
  lastRequestDay?: number;
  lastOutcome?: string;
}

export interface CommunityState {
  pendingResidents: number;
  activeResidents: number;
  supportMode: CommunitySupportMode | null;
  lastSupportDay?: number;
}

export interface Survivor {
  id: string;
  name: string;
  specialty: Role;
  energy: number;
  mood: 'low' | 'steady' | 'bright';
  perk: string;
  trait?: string;
  trust?: -3 | -2 | -1 | 0 | 1 | 2 | 3;
  condition?: SurvivorCondition;
  untreatedDays?: number;
  mentalState?: SurvivorMentalState;
  mentalUntilDay?: number;
}

export interface Buildings {
  searchStation: number;
  workshop: number;
  clinic: number;
  watchPost: number;
  shelter: number;
  radio: number;
}

export interface DayForecast {
  title: string;
  detail: string;
  intensity: number;
}

export interface CheckModifier { label: string; value: number; }
export interface PendingCheck {
  id: string;
  source: 'night';
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

export interface ExpeditionPlan {
  id: string;
  locationId: string;
  partyIds: string[];
}

export interface DayState {
  assignmentsLocked: boolean;
  returnedExpeditions: number;
  unresolvedExpeditions: string[];
  committedSurvivorIds: string[];
  expeditionRoutes?: Record<string, string>;
  expeditionQueue?: ExpeditionPlan[];
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

export interface DefenseNightRecord {
  day: number;
  start: number;
  end: number;
  reinforced: number;
  damaged: number;
  complete: boolean;
}

export interface CampaignStats {
  rescued: number;
  deaths: number;
  missing: number;
  civilianDepartures: number;
  expeditions: number;
  locationsDiscovered: number;
  nightEventsResolved: number;
  emergencyEventsResolved: number;
}

export interface MemorialEntry {
  survivorId: string;
  name: string;
  day: number;
  cause: string;
  epitaph: string;
}

export interface EndingResult {
  id: EndingId;
  title: string;
  tier: 'good' | 'normal' | 'bad' | 'secret';
  summary: string;
}

export interface GameState {
  version: 3;
  seed: number;
  rngState: number;
  phase: Phase;
  day: number;
  inventory: Inventory;
  storyItems: string[];
  storyFlags: string[];
  mainLightStage: 1 | 2 | 3 | 4 | 5;
  civilianResidents: number;
  communityState: CommunityState;
  socialState?: SocialState;
  dayAssignments: Record<string, DayAssignment>;
  dayState: DayState;
  expeditionState: ExpeditionState;
  mealState: MealState;
  nightState: NightState;
  campaignStats: CampaignStats;
  memorials: MemorialEntry[];
  dawnBrief?: string[];
  defenseNight?: DefenseNightRecord;
  finalHordeResult?: FinalHordeResult;
  ending?: EndingResult | null;
  hope: number;
  defense: number;
  survivors: Survivor[];
  buildings: Buildings;
  forecast: DayForecast;
  chapterComplete: boolean;
  pendingCheck: PendingCheck | null;
  lastMessage: string;
}
