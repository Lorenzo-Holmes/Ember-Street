import { promoteV2ToV3 } from './storage/migrations';
import type { GameState } from './types';

const KEY_V3 = 'ember-street-save-v3';
const KEY_V2 = 'ember-street-save-v2';
const KEY_V1 = 'ember-street-save-v1';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const MAX_OFFLINE_MS = 3 * 60 * 60 * 1000;
const MIN_OFFLINE_MS = 5 * 60 * 1000;
export const GAME_SAVE_EVENT = 'ember-street-save-updated';
let lastWriteAt = 0;

function announceSaveChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(GAME_SAVE_EVENT));
}

export function saveGame(state: GameState, force = false): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const now = Date.now();
    if (!force && now - lastWriteAt < 2_000) return;
    localStorage.setItem(KEY_V3, JSON.stringify(state));
    localStorage.setItem(ACTIVE_KEY, String(now));
    lastWriteAt = now;
    announceSaveChange();
  } catch { /* localStorage is optional */ }
}

export function applyOfflineProgress(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== 'street' || elapsedMs < MIN_OFFLINE_MS) return state;
  const bounded = Math.min(MAX_OFFLINE_MS, Math.max(0, elapsedMs));
  const hours = bounded / 3_600_000;
  const repairers = state.survivors.filter((s) => state.dayAssignments[s.id] === 'repair' && s.condition !== 'dead' && s.condition !== 'missing').length;
  const gainedMaterials = Math.floor(hours * repairers * 0.5);
  const survivors = state.survivors.map((survivor) => {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') return survivor;
    if (state.dayAssignments[survivor.id] !== 'rest') return survivor;
    return { ...survivor, energy: Math.min(100, survivor.energy + Math.floor(hours * 4)) };
  });
  const changedEnergy = survivors.some((item, index) => item.energy !== state.survivors[index]?.energy);
  if (!gainedMaterials && !changedEnergy) return state;
  return {
    ...state,
    inventory: { ...state.inventory, materials: state.inventory.materials + gainedMaterials },
    survivors,
    lastMessage: `你不在时，街区只做了轻量后勤：材料 +${gainedMaterials}。探索、事件和尸潮不会离线推进。`,
  };
}

function readAndMigrate(raw: string | null): GameState | null {
  if (!raw) return null;
  try { return promoteV2ToV3(JSON.parse(raw)); } catch { return null; }
}

export function loadGame(): GameState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const lastActive = Number(localStorage.getItem(ACTIVE_KEY) ?? Date.now());
    const v3 = readAndMigrate(localStorage.getItem(KEY_V3));
    if (v3) return applyOfflineProgress(v3, Date.now() - lastActive);

    const v2 = readAndMigrate(localStorage.getItem(KEY_V2));
    if (v2) {
      saveGame(v2, true);
      return applyOfflineProgress(v2, Date.now() - lastActive);
    }

    const rawV1 = localStorage.getItem(KEY_V1);
    if (!rawV1) return null;
    const old = JSON.parse(rawV1) as Record<string, unknown>;
    const v1Promoted = promoteV2ToV3({ ...old, version: 2 });
    if (v1Promoted) saveGame(v1Promoted, true);
    return v1Promoted;
  } catch { return null; }
}

export function clearSave(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY_V3);
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
    localStorage.removeItem(ACTIVE_KEY);
    announceSaveChange();
  } catch { /* no-op */ }
}