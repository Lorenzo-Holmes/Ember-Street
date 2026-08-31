import type { GameState } from './types';
import { forecastFor } from './progression';

const KEY_V2 = 'ember-street-save-v2';
const KEY_V1 = 'ember-street-save-v1';

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY_V2, JSON.stringify(state)); } catch { /* storage is optional */ }
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

export function loadGame(): GameState | null {
  try {
    const rawV2 = localStorage.getItem(KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as GameState;
      if (parsed?.version === 2) return parsed;
    }
    const rawV1 = localStorage.getItem(KEY_V1);
    if (!rawV1) return null;
    const migrated = migrateV1(JSON.parse(rawV1) as Record<string, unknown>);
    if (migrated) saveGame(migrated);
    return migrated;
  } catch { return null; }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  } catch { /* no-op */ }
}
