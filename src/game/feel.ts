import { takeRack, tick } from './engine';
import type { GameState } from './types';

const COMBO_WINDOW_MS = 8_000;

export function takeRackWithFeel(state: GameState, rackIndex: number): GameState {
  const beforeServed = state.stats.served;
  const patienceRatio = state.currentOrder.maxPatienceMs > 0 ? state.currentOrder.patienceMs / state.currentOrder.maxPatienceMs : 1;
  let next = takeRack(state, rackIndex);
  if (next.stats.served <= beforeServed) return next;

  const previousCombo = (state.comboRemainingMs ?? 0) > 0 ? (state.combo ?? 0) : 0;
  const combo = previousCombo + 1;
  const extreme = patienceRatio <= 0.15;
  const comboHope = combo >= 3 ? 1 : 0;
  const extremeHope = extreme ? 2 : 0;
  const extremeRelief = extreme ? 6 : 0;
  next = {
    ...next,
    combo,
    bestCombo: Math.max(state.bestCombo ?? 0, combo),
    comboRemainingMs: COMBO_WINDOW_MS,
    extremeServes: (state.extremeServes ?? 0) + (extreme ? 1 : 0),
    hope: next.hope + comboHope + extremeHope,
    hordePressure: Math.max(0, next.hordePressure - extremeRelief),
    lastMessage: extreme ? '⚡ 极限出餐 · 防线被你硬救回来了' : combo >= 3 ? `🔥 COMBO ×${combo}` : next.lastMessage,
  };
  return next;
}

export function tickWithFeel(state: GameState, elapsedMs: number): GameState {
  const next = tick(state, elapsedMs);
  const remaining = Math.max(0, (state.comboRemainingMs ?? 0) - elapsedMs);
  if (remaining <= 0 && (state.combo ?? 0) > 0) return { ...next, combo: 0, comboRemainingMs: 0 };
  if (remaining !== (state.comboRemainingMs ?? 0)) return { ...next, comboRemainingMs: remaining };
  return next;
}

export function emergencyClear(state: GameState): GameState {
  if (state.phase !== 'night' || state.slots.some((slot) => slot === null)) return state;
  const candidates = state.slots
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item?.tier ?? 9) - (b.item?.tier ?? 9) || a.index - b.index)
    .slice(0, 3);
  const slots = [...state.slots];
  for (const candidate of candidates) slots[candidate.index] = null;
  const clearances = (state.clearances ?? 0) + 1;
  const next: GameState = {
    ...state,
    slots,
    clearances,
    combo: 0,
    comboRemainingMs: 0,
    hope: Math.max(0, state.hope - 1),
    hordePressure: Math.min(100, state.hordePressure + 6),
    lastMessage: clearances >= 3 ? '配给台第三次失控 · 今晚提前收摊' : `紧急清台 ${clearances}/3 · 丢掉低阶物资换回空间`,
  };
  if (clearances >= 3) return { ...next, phase: 'summary' };
  return next;
}
