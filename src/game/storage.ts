import { eventForDay } from './narrative';
import { forecastFor } from './progression';
import { ensureStoryDay } from './story';
import { promoteV2ToV3 } from './storage/migrations';
import type { GameState, Role } from './types';

const KEY_V3 = 'ember-street-save-v3';
const KEY_V2 = 'ember-street-save-v2';
const KEY_V1 = 'ember-street-save-v1';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const MAX_OFFLINE_MS = 6 * 60 * 60 * 1000;
const MIN_OFFLINE_MS = 5 * 60 * 1000;
let lastWriteAt = 0;

function countRole(state: GameState, role: Role): number {
  return Object.values(state.assignments ?? {}).filter((item) => item === role).length;
}

function syncLegacyResources(state: GameState): GameState {
  return {
    ...state,
    version: 3,
    inventory: {
      ...state.inventory,
      ration: Math.max(0, state.supplies),
      medicine: Math.max(0, state.medicine),
      power: Math.max(0, Math.min(100, state.power ?? state.inventory.power)),
      parts: Math.max(0, state.parts),
    },
  };
}

function normalizeV3(input: unknown): GameState | null {
  const promoted = promoteV2ToV3(input);
  if (!promoted) return null;
  const resolved = promoted.resolvedEventIds ?? [];
  const event = eventForDay(promoted.day ?? 1);
  const shouldSurfaceEvent = promoted.phase === 'street' && !promoted.chapterComplete && event && !resolved.includes(event.id) && promoted.dayStep !== 'dusk';

  let normalized: GameState = {
    ...promoted,
    version: 3,
    rackStock: promoted.rackStock ?? Array.from({ length: promoted.racks?.length ?? 4 }, () => 3),
    orderActive: promoted.orderActive ?? true,
    orderCooldownMs: promoted.orderCooldownMs ?? 0,
    nightOrderLimit: promoted.nightOrderLimit ?? 5,
    medicalGraceUsed: promoted.medicalGraceUsed ?? false,
    supplies: promoted.supplies ?? promoted.inventory.ration,
    medicine: promoted.medicine ?? promoted.inventory.medicine,
    power: promoted.power ?? promoted.inventory.power,
    parts: promoted.parts ?? promoted.inventory.parts,
    defense: promoted.defense ?? 50,
    assignments: promoted.assignments ?? {},
    buildings: promoted.buildings ?? { searchStation: promoted.searchStationRepaired ? 1 : 0, workshop: 0, clinic: 0, watchPost: 0, shelter: 0, radio: 0 },
    forecast: promoted.forecast ?? forecastFor(promoted.day ?? 1),
    chapterComplete: promoted.chapterComplete ?? false,
    dayStep: shouldSurfaceEvent ? 'event' : promoted.dayStep ?? 'morning',
    activeEventId: shouldSurfaceEvent ? event.id : promoted.activeEventId ?? null,
    resolvedEventIds: resolved,
    logs: promoted.logs ?? [],
    storyFlags: promoted.storyFlags ?? [],
    resolvedStoryEventIds: promoted.resolvedStoryEventIds ?? [],
    storyDailyIds: promoted.storyDailyIds ?? [],
    storyPreparedDay: promoted.storyPreparedDay ?? 0,
    pendingCheck: promoted.pendingCheck ?? null,
    nightFeed: promoted.nightFeed ?? [],
    nightNarrativeFlags: promoted.nightNarrativeFlags ?? [],
    nightStoryDay: promoted.nightStoryDay ?? 0,
    nightIncidentId: promoted.nightIncidentId ?? null,
  };
  normalized = syncLegacyResources(normalized);
  if (normalized.phase === 'street' && normalized.dayStep !== 'dusk') normalized = ensureStoryDay(normalized);
  return normalized;
}

export function saveGame(state: GameState, force = false): void {
  try {
    const now = Date.now();
    if (!force && state.phase === 'night' && now - lastWriteAt < 5_000) return;
    localStorage.setItem(KEY_V3, JSON.stringify(syncLegacyResources(state)));
    localStorage.setItem(ACTIVE_KEY, String(now));
    lastWriteAt = now;
  } catch { /* storage is optional */ }
}

function migrateV1(old: Record<string, unknown>): GameState | null {
  try {
    if (old.version !== 1) return null;
    const day = Number(old.day ?? 1);
    return normalizeV3({
      ...old,
      version: 2,
      medicine: 0,
      power: 62,
      defense: 50,
      medicalGraceUsed: false,
      survivors: [],
      assignments: {},
      buildings: { searchStation: old.searchStationRepaired ? 1 : 0, workshop: 0, clinic: 0, watchPost: 0, shelter: 0, radio: 0 },
      forecast: forecastFor(day),
      chapterComplete: false,
      dayStep: 'morning',
      activeEventId: null,
      resolvedEventIds: [],
      logs: [],
      storyFlags: [],
      resolvedStoryEventIds: [],
      storyDailyIds: [],
      storyPreparedDay: 0,
      pendingCheck: null,
      nightFeed: [],
      nightNarrativeFlags: [],
      nightStoryDay: 0,
      nightIncidentId: null,
    });
  } catch { return null; }
}

export function applyOfflineProgress(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== 'street' || elapsedMs < MIN_OFFLINE_MS) return state;
  const bounded = Math.min(MAX_OFFLINE_MS, Math.max(0, elapsedMs));
  const hours = bounded / 3_600_000;
  const searchers = state.buildings.searchStation ? countRole(state, 'search') : 0;
  const repairers = state.buildings.workshop ? countRole(state, 'repair') : 0;
  const medics = state.buildings.clinic ? countRole(state, 'medical') : 0;
  const gainedSupplies = Math.floor(hours * searchers * 2);
  const gainedParts = Math.floor(hours * repairers * 0.8);
  const gainedMedicine = Math.floor(hours * medics * 0.6);
  const rested = state.survivors.map((survivor) => ({ ...survivor, energy: Math.min(100, survivor.energy + Math.floor(hours * 5)) }));
  if (gainedSupplies + gainedParts + gainedMedicine === 0 && rested.every((item, index) => item.energy === state.survivors[index]?.energy)) return state;
  return syncLegacyResources({
    ...state,
    supplies: state.supplies + gainedSupplies,
    parts: state.parts + gainedParts,
    medicine: state.medicine + gainedMedicine,
    survivors: rested,
    lastMessage: `你不在时，街坊备好了：口粮 +${gainedSupplies} · 零件 +${gainedParts} · 药品 +${gainedMedicine}`,
  });
}

export function loadGame(): GameState | null {
  try {
    const lastActive = Number(localStorage.getItem(ACTIVE_KEY) ?? Date.now());
    const rawV3 = localStorage.getItem(KEY_V3);
    if (rawV3) {
      const normalized = normalizeV3(JSON.parse(rawV3));
      if (normalized) return applyOfflineProgress(normalized, Date.now() - lastActive);
    }

    const rawV2 = localStorage.getItem(KEY_V2);
    if (rawV2) {
      const migrated = normalizeV3(JSON.parse(rawV2));
      if (migrated) {
        saveGame(migrated, true);
        return applyOfflineProgress(migrated, Date.now() - lastActive);
      }
    }

    const rawV1 = localStorage.getItem(KEY_V1);
    if (!rawV1) return null;
    const migrated = migrateV1(JSON.parse(rawV1) as Record<string, unknown>);
    if (migrated) saveGame(migrated, true);
    return migrated;
  } catch { return null; }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY_V3);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
    localStorage.removeItem(ACTIVE_KEY);
  } catch { /* no-op */ }
}
