import { forecastFor } from './progression';
import type { GameState, Role } from './types';

const KEY_V2 = 'ember-street-save-v2';
const KEY_V1 = 'ember-street-save-v1';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const MAX_OFFLINE_MS = 6 * 60 * 60 * 1000;
const MIN_OFFLINE_MS = 5 * 60 * 1000;
let lastWriteAt = 0;

function countRole(state: GameState, role: Role): number {
  return Object.values(state.assignments ?? {}).filter((item) => item === role).length;
}

function normalizeV2(parsed: GameState): GameState {
  return {
    ...parsed,
    medicine: parsed.medicine ?? 0,
    survivors: parsed.survivors ?? [],
    assignments: parsed.assignments ?? {},
    buildings: parsed.buildings ?? { searchStation: parsed.searchStationRepaired ? 1 : 0, workshop: 0, clinic: 0, watchPost: 0, shelter: 0, radio: 0 },
    forecast: parsed.forecast ?? forecastFor(parsed.day ?? 1),
    chapterComplete: parsed.chapterComplete ?? false,
  };
}

export function saveGame(state: GameState, force = false): void {
  try {
    const now = Date.now();
    if (!force && state.phase === 'night' && now - lastWriteAt < 5_000) return;
    localStorage.setItem(KEY_V2, JSON.stringify(state));
    localStorage.setItem(ACTIVE_KEY, String(now));
    lastWriteAt = now;
  } catch { /* storage is optional */ }
}

function migrateV1(old: Record<string, unknown>): GameState | null {
  try {
    if (old.version !== 1) return null;
    const day = Number(old.day ?? 1);
    return {
      ...(old as unknown as Omit<GameState, 'version' | 'medicine' | 'survivors' | 'assignments' | 'buildings' | 'forecast' | 'chapterComplete'>),
      version: 2,
      medicine: 0,
      survivors: [],
      assignments: {},
      buildings: {
        searchStation: old.searchStationRepaired ? 1 : 0,
        workshop: 0,
        clinic: 0,
        watchPost: 0,
        shelter: 0,
        radio: 0,
      },
      forecast: forecastFor(day),
      chapterComplete: false,
    };
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
  return {
    ...state,
    supplies: state.supplies + gainedSupplies,
    parts: state.parts + gainedParts,
    medicine: state.medicine + gainedMedicine,
    survivors: rested,
    lastMessage: `你不在时，街坊备好了：补给 +${gainedSupplies} · 零件 +${gainedParts} · 药品 +${gainedMedicine}`,
  };
}

export function loadGame(): GameState | null {
  try {
    const lastActive = Number(localStorage.getItem(ACTIVE_KEY) ?? Date.now());
    const rawV2 = localStorage.getItem(KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as GameState;
      if (parsed?.version === 2) return applyOfflineProgress(normalizeV2(parsed), Date.now() - lastActive);
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
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
    localStorage.removeItem(ACTIVE_KEY);
  } catch { /* no-op */ }
}
