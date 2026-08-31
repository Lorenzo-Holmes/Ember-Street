export type SupplyKind = 'ration' | 'medical' | 'battery';
export type OrderKind = 'survivor' | 'defense';
export type Phase = 'night' | 'summary' | 'street';
export type Role = 'search' | 'repair' | 'medical' | 'watch' | 'cook' | 'radio' | 'rest';
export type BuildingId = 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';
export type DayStep = 'morning' | 'event' | 'dusk';
export type InjuryState = 'healthy' | 'minor' | 'serious' | 'resting';
export type LogTone = 'neutral' | 'hope' | 'danger' | 'resource';
export type StoryCategory = 'location' | 'survivor' | 'street' | 'world' | 'cat';
export type RollMode = 'normal' | 'advantage' | 'disadvantage';
export type CheckOutcome = 'failure' | 'partial' | 'success' | 'critical';
export type CheckSource = 'story' | 'night';

export interface SupplyItem { id: string; kind: SupplyKind; tier: 1 | 2 | 3; }
export interface Order { id: string; kind: OrderKind; targetKind: SupplyKind; targetTier: 2; title: string; line: string; patienceMs: number; maxPatienceMs: number; rewardHope: number; rewardParts: number; pressureRelief: number; }
export interface NightStats { served: number; missed: number; merges: number; peakPressure: number; startedAt: number; }
export interface Survivor { id: string; name: string; specialty: Role; energy: number; mood: 'low' | 'steady' | 'bright'; perk: string; trait?: string; trust?: 0 | 1 | 2 | 3; injury?: InjuryState; }
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

export interface GameState {
  version: 2;
  seed: number;
  rngState: number;
  phase: Phase;
  day: number;
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
