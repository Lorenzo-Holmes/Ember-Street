import {
  createDefaultCampaignStats,
  createDefaultDayState,
  createDefaultExpeditionState,
  createDefaultInventory,
  createDefaultMealState,
  createDefaultNightState,
  normalizeV3Survivor,
} from '../foundation';
import type { DayAssignment, GameState, Role } from '../types';

function roleToDayAssignment(role: Role): DayAssignment {
  if (role === 'search') return 'expedition';
  return role;
}

function migrateAssignments(assignments: Record<string, Role> | undefined): Record<string, DayAssignment> {
  const output: Record<string, DayAssignment> = {};
  for (const [survivorId, role] of Object.entries(assignments ?? {})) output[survivorId] = roleToDayAssignment(role);
  return output;
}

export function promoteV2ToV3(input: unknown): GameState | null {
  if (!input || typeof input !== 'object') return null;
  const legacy = input as Partial<GameState> & { version?: number };
  if (legacy.version !== 2 && legacy.version !== 3) return null;

  const supplies = Number(legacy.supplies ?? 2);
  const medicine = Number(legacy.medicine ?? 1);
  const power = Number(legacy.power ?? 62);
  const parts = Number(legacy.parts ?? 0);
  const survivors = (legacy.survivors ?? []).map(normalizeV3Survivor);

  return {
    ...(legacy as GameState),
    version: 3,
    inventory: legacy.inventory ?? createDefaultInventory({ supplies, medicine, power, parts }),
    storyItems: legacy.storyItems ?? [],
    mainLightStage: legacy.mainLightStage ?? Math.max(1, Math.min(5, Math.ceil(Number(legacy.firstLightLevel ?? 1) / 2))) as 1 | 2 | 3 | 4 | 5,
    dayAssignments: legacy.dayAssignments ?? migrateAssignments(legacy.assignments),
    dayState: legacy.dayState ?? createDefaultDayState(),
    expeditionState: legacy.expeditionState ?? createDefaultExpeditionState(),
    mealState: legacy.mealState ?? createDefaultMealState(),
    nightState: legacy.nightState ?? createDefaultNightState(legacy.day === 10 || legacy.day === 20 || legacy.day === 29 ? 6 : 5),
    campaignStats: legacy.campaignStats ?? createDefaultCampaignStats(),
    finalHordeResult: legacy.finalHordeResult,
    ending: legacy.ending ?? null,
    survivors,
  };
}
