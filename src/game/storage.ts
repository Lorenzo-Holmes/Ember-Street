import type { GameState } from './types';

const KEY = 'ember-street-save-v1';

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage is optional */ }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    return parsed?.version === 1 ? parsed : null;
  } catch { return null; }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* no-op */ }
}
