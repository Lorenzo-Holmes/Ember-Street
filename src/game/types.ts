export type SupplyKind = 'ration' | 'medical' | 'battery';
export type OrderKind = 'survivor' | 'defense';
export type Phase = 'night' | 'summary' | 'street';

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

export interface GameState {
  version: 1;
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
  firstLightLevel: number;
  searchStationRepaired: boolean;
  survivorJoined: boolean;
  stats: NightStats;
  lastMessage: string;
}
