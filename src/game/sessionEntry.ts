import { inspectGameSave, loadGame, saveGame } from './storage';
import type { GameState } from './types';
import { createV060InitialState } from './v060/campaign';

export const PHASE_LABELS: Record<GameState['phase'], string> = {
  dawn: '清晨', street: '白天', assignment: '安排人手', expedition: '外出途中',
  dusk: '黄昏', night: '夜里', 'night-summary': '天快亮了', summary: '清晨清点', ending: '结局',
};

export function savedDayLabel(state: GameState): string {
  return `第 ${state.day} 天 · ${PHASE_LABELS[state.phase]}`;
}

type EntryResult =
  | { kind: 'ready'; state: GameState }
  | { kind: 'confirm-restart' }
  | { kind: 'error'; message: string };

const saveError: EntryResult = {
  kind: 'error', message: '暂时无法保存进度。请允许浏览器保存本站数据后重试。',
};

export function startNewSession(replaceConfirmed = false): EntryResult {
  const existing = inspectGameSave();
  if (existing.kind === 'unavailable') return saveError;
  if (existing.kind !== 'empty' && !replaceConfirmed) return { kind: 'confirm-restart' };
  const state = createV060InitialState();
  // Overwrite only on explicit confirmation; never delete the previous save first.
  if (!saveGame(state, true)) return saveError;
  return { kind: 'ready', state };
}

export function continueSavedSession(): EntryResult {
  const state = loadGame();
  if (!state) return { kind: 'error', message: '没有读到可继续的进度。原有记录没有被清除。' };
  // Commit existing offline recovery once, so returning to the cover cannot grant it twice.
  if (!saveGame(state, true)) return saveError;
  return { kind: 'ready', state };
}
