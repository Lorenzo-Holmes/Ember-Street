import { nextRandom } from './rng';
import type { CheckModifier, CheckOutcome, GameState, PendingCheck, RollMode } from './types';
import { psychologyCheckModifier } from './v060/psychology';

function rollDie(rngState: number): [number, number] {
  const [value, next] = nextRandom(rngState);
  return [Math.floor(value * 6) + 1, next];
}

function chooseDice(dice: number[], mode: RollMode): number[] {
  if (mode === 'normal') return dice.slice(0, 2);
  const sorted = [...dice].sort((a, b) => a - b);
  return mode === 'advantage' ? sorted.slice(-2) : sorted.slice(0, 2);
}

function outcomeFor(total: number, twist?: PendingCheck['twist']): CheckOutcome {
  if (twist === 'double-one') return 'failure';
  if (twist === 'double-six') return 'critical';
  if (total <= 6) return 'failure';
  if (total <= 9) return 'partial';
  if (total <= 11) return 'success';
  return 'critical';
}

export function totalModifier(modifiers: CheckModifier[]): number {
  return modifiers.reduce((sum, item) => sum + item.value, 0);
}

export function createPendingCheck(
  state: GameState,
  input: Omit<PendingCheck, 'id' | 'dice' | 'keptDice' | 'total' | 'outcome' | 'twist' | 'rerolled'>,
): GameState {
  const actor = input.actorId ? state.survivors.find((survivor) => survivor.id === input.actorId) : undefined;
  const psychology = psychologyCheckModifier(actor);
  const modifiers = psychology && !input.modifiers.some((modifier) => modifier.label === psychology.label)
    ? [...input.modifiers, psychology]
    : input.modifiers;
  const pending: PendingCheck = {
    ...input,
    id: `${state.day}-${input.source}-${input.eventId}-${input.choiceId}-${state.rngState}`,
    modifiers,
    rerolled: false,
  };
  return { ...state, pendingCheck: pending, lastMessage: `${input.label} · 等待投骰` };
}

export function rollPendingCheck(state: GameState): GameState {
  const pending = state.pendingCheck;
  if (!pending || pending.dice) return state;
  const count = pending.mode === 'normal' ? 2 : 3;
  const dice: number[] = [];
  let rngState = state.rngState;
  for (let i = 0; i < count; i += 1) {
    const [die, next] = rollDie(rngState);
    dice.push(die);
    rngState = next;
  }
  const keptDice = chooseDice(dice, pending.mode);
  const natural = [...keptDice].sort((a, b) => a - b);
  const twist = natural[0] === 6 && natural[1] === 6 ? 'double-six' : natural[0] === 1 && natural[1] === 1 ? 'double-one' : undefined;
  const total = keptDice.reduce((sum, die) => sum + die, 0) + totalModifier(pending.modifiers);
  return {
    ...state,
    rngState,
    pendingCheck: { ...pending, dice, keptDice, total, outcome: outcomeFor(total, twist), twist },
    lastMessage: `判定结果 ${total}`,
  };
}

export function canTrustReroll(state: GameState): boolean {
  const pending = state.pendingCheck;
  if (!pending?.dice || pending.rerolled || !pending.actorId) return false;
  const actor = state.survivors.find((item) => item.id === pending.actorId);
  return (actor?.trust ?? 0) >= 3;
}

export function rerollLowestDie(state: GameState): GameState {
  const pending = state.pendingCheck;
  if (!pending?.dice || !canTrustReroll(state)) return state;
  const dice = [...pending.dice];
  let targetIndex = 0;
  for (let i = 1; i < dice.length; i += 1) if (dice[i] < dice[targetIndex]) targetIndex = i;
  const [replacement, rngState] = rollDie(state.rngState);
  dice[targetIndex] = replacement;
  const keptDice = chooseDice(dice, pending.mode);
  const natural = [...keptDice].sort((a, b) => a - b);
  const twist = natural[0] === 6 && natural[1] === 6 ? 'double-six' : natural[0] === 1 && natural[1] === 1 ? 'double-one' : undefined;
  const total = keptDice.reduce((sum, die) => sum + die, 0) + totalModifier(pending.modifiers);
  return {
    ...state,
    rngState,
    pendingCheck: { ...pending, dice, keptDice, total, outcome: outcomeFor(total, twist), twist, rerolled: true },
    lastMessage: `${state.survivors.find((item) => item.id === pending.actorId)?.name ?? '幸存者'}选择再试一次`,
  };
}

export const OUTCOME_LABEL: Record<CheckOutcome, string> = {
  failure: '失败 · 代价落下来了',
  partial: '部分成功 · 做到了，但是……',
  success: '完全成功',
  critical: '极佳结果 · 命运站在你这边',
};
