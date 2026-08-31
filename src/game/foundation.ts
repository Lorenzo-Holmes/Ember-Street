import type {
  CampaignStats,
  DayState,
  ExpeditionState,
  Inventory,
  MealState,
  NightState,
  Survivor,
  SurvivorCondition,
} from './types';

export function createDefaultInventory(input: {
  supplies?: number;
  medicine?: number;
  power?: number;
  parts?: number;
} = {}): Inventory {
  return {
    ration: Math.max(0, Math.floor(input.supplies ?? 2)),
    medicine: Math.max(0, Math.floor(input.medicine ?? 1)),
    power: Math.max(0, Math.min(100, Math.floor(input.power ?? 62))),
    materials: 0,
    parts: Math.max(0, Math.floor(input.parts ?? 0)),
  };
}

export function createDefaultMealState(): MealState {
  return {
    quality: 'cold',
    coverage: 0,
    cookingCapacity: 0,
    residentsFed: 0,
    rationCoverage: 1,
    consecutiveShortageDays: 0,
    wellFed: false,
    wellFedPlus: false,
  };
}

export function createDefaultDayState(): DayState {
  return {
    assignmentsLocked: false,
    returnedExpeditions: 0,
    unresolvedExpeditions: [],
  };
}

export function createDefaultExpeditionState(): ExpeditionState {
  return {
    activePartyIds: [],
    locationId: null,
    eventId: null,
    departed: false,
  };
}

export function createDefaultNightState(eventTotal = 5): NightState {
  return {
    eventIndex: 0,
    eventTotal,
    scheduledEventIds: [],
    emergencyEventIds: [],
    currentEventId: null,
    hordeActive: false,
    hordeStage: null,
    resolutions: [],
  };
}

export function createDefaultCampaignStats(): CampaignStats {
  return {
    rescued: 0,
    deaths: 0,
    missing: 0,
    expeditions: 0,
    locationsDiscovered: 0,
    nightEventsResolved: 0,
    emergencyEventsResolved: 0,
  };
}

export function conditionFromLegacy(survivor: Survivor): SurvivorCondition {
  if (survivor.condition) return survivor.condition;
  if (survivor.injury === 'serious') return 'serious';
  if (survivor.injury === 'minor') return 'minor';
  if (survivor.injury === 'resting') return survivor.energy < 40 ? 'fatigued' : 'healthy';
  return survivor.energy < 40 ? 'fatigued' : 'healthy';
}

export function normalizeV3Survivor(survivor: Survivor): Survivor {
  return {
    ...survivor,
    trust: survivor.trust ?? 0,
    injury: survivor.injury ?? 'healthy',
    trait: survivor.trait ?? survivor.perk,
    condition: conditionFromLegacy(survivor),
  };
}
