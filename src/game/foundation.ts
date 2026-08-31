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

export function createDefaultInventory(input: Partial<Inventory> = {}): Inventory {
  return {
    ration: Math.max(0, Math.floor(input.ration ?? 12)),
    medicine: Math.max(0, Math.floor(input.medicine ?? 3)),
    power: Math.max(0, Math.min(100, Math.floor(input.power ?? 62))),
    materials: Math.max(0, Math.floor(input.materials ?? 12)),
    parts: Math.max(0, Math.floor(input.parts ?? 5)),
  };
}

export function createDefaultMealState(): MealState {
  return {
    quality: 'cold', coverage: 0, cookingCapacity: 0, residentsFed: 0,
    rationCoverage: 1, consecutiveShortageDays: 0, wellFed: false, wellFedPlus: false,
  };
}

export function createDefaultDayState(): DayState {
  return { assignmentsLocked: false, returnedExpeditions: 0, unresolvedExpeditions: [], committedSurvivorIds: [] };
}

export function createDefaultExpeditionState(): ExpeditionState {
  return { activePartyIds: [], locationId: null, eventId: null, departed: false };
}

export function createDefaultNightState(eventTotal = 5): NightState {
  return {
    eventIndex: 0, eventTotal, scheduledEventIds: [], emergencyEventIds: [], currentEventId: null,
    hordeActive: false, hordeStage: null, resolutions: [],
  };
}

export function createDefaultCampaignStats(): CampaignStats {
  return { rescued: 0, deaths: 0, missing: 0, expeditions: 0, locationsDiscovered: 0, nightEventsResolved: 0, emergencyEventsResolved: 0 };
}

export function normalizeSurvivor(survivor: Survivor): Survivor {
  let condition: SurvivorCondition = survivor.condition ?? (survivor.energy < 40 ? 'fatigued' : 'healthy');
  if (!['healthy', 'fatigued', 'minor', 'serious', 'critical', 'missing', 'dead'].includes(condition)) condition = 'healthy';
  return {
    ...survivor,
    trust: survivor.trust ?? 0,
    trait: survivor.trait ?? survivor.perk,
    condition,
    untreatedDays: Math.max(0, Math.floor(Number(survivor.untreatedDays) || 0)),
  };
}
