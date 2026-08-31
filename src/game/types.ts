export type SupplyKind = 'ration' | 'medical' | 'battery';
export type OrderKind = 'survivor' | 'defense';
export type Phase = 'night' | 'summary' | 'street';
export type Role = 'search' | 'repair' | 'medical' | 'watch' | 'cook' | 'radio' | 'rest';
export type BuildingId = 'searchStation' | 'workshop' | 'clinic' | 'watchPost' | 'shelter' | 'radio';

export interface SupplyItem {
  id: string;
  kind: SupplyKind;
  tier: 1 | 2 | 3;
}

export interface Order {
  id: string;
  kind: OrderKind;
  targetKind: SupplyKind;
  targetTier: 2;
  title: string;
  line: string;
  patienceMs: number;
  maxPatienceMs: number;
  rewardHope: number;
  rewardParts: number;
  pressureRelief: number;
}

export interface NightStats {
  served: number;
  missed: number;
  merges: number;
  peakPressure: number;
  startedAt: number;
}

export interface Survivor {
  id: string;
  name: string;
  specialty: Role;
  energy: number;
  mood: 'low' | 'steady' | 'bright';
  perk: string;
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
  bonusKind?: SupplyKind;
}

export interface GameState {
  version: 2;
  seed: number;
  rngState: number;
  phase: Phase;
  day: number;
  nightRemainingMs: number;
  slots: Array<SupplyItem | null>;
  racks: SupplyKind[];
  queue: SupplyKind[];
  currentOrder: Order;
  orderIndex: number;
  hordePressure: number;
  hope: number;
  parts: number;
  supplies: number;
  medicine: number;
  firstLightLevel: number;
  searchStationRepaired: boolean;
  survivorJoined: boolean;
  survivors: Survivor[];
  assignments: Record<string, Role>;
  buildings: Buildings;
  forecast: DayForecast;
  chapterComplete: boolean;
  catStage?: 0 | 1 | 2 | 3;
  catFedToday?: boolean;
  stats: NightStats;
  lastMessage: string;
}
