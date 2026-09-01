import type { CheckModifier, GameState, Survivor, SurvivorMentalState } from '../types';

export const MENTAL_LABEL: Record<SurvivorMentalState, string> = {
  steady: '稳定',
  focused: '专注',
  shaken: '动摇',
};

export function activeMentalState(state: Pick<GameState, 'day'>, survivor: Survivor): SurvivorMentalState {
  const mental = survivor.mentalState ?? 'steady';
  if (mental === 'steady') return 'steady';
  const until = survivor.mentalUntilDay ?? state.day;
  return state.day <= until ? mental : 'steady';
}

export function mentalCheckModifier(state: Pick<GameState, 'day'>, survivor: Survivor | undefined): CheckModifier | null {
  if (!survivor) return null;
  const mental = activeMentalState(state, survivor);
  if (mental === 'focused') return { label: '心理 · 专注', value: 1 };
  if (mental === 'shaken') return { label: '心理 · 动摇', value: -1 };
  return null;
}

export function setMentalState(state: GameState, survivorId: string, mentalState: SurvivorMentalState, untilDay = state.day + 1): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId
      ? { ...survivor, mentalState, mentalUntilDay: mentalState === 'steady' ? undefined : Math.max(state.day, untilDay) }
      : survivor),
  };
}

export function shockLivingCore(state: GameState, exceptId?: string, untilDay = state.day + 1): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      if (survivor.id === exceptId || survivor.condition === 'dead' || survivor.condition === 'missing') return survivor;
      return { ...survivor, mentalState: 'shaken' as const, mentalUntilDay: untilDay };
    }),
  };
}

export function recoverMentalFromRest(state: GameState): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      if (state.dayAssignments[survivor.id] !== 'rest') return survivor;
      if (activeMentalState(state, survivor) !== 'shaken') return survivor;
      return { ...survivor, mentalState: 'steady' as const, mentalUntilDay: undefined };
    }),
  };
}

export function expireMentalStates(state: GameState): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => activeMentalState(state, survivor) === 'steady'
      ? { ...survivor, mentalState: 'steady' as const, mentalUntilDay: undefined }
      : survivor),
  };
}

export function applyCheckAftermath(state: GameState, actorId: string | undefined, outcome: 'failure' | 'partial' | 'success' | 'critical'): GameState {
  if (!actorId) return state;
  if (outcome === 'failure') return setMentalState(state, actorId, 'shaken', state.day + 1);
  if (outcome === 'critical') return setMentalState(state, actorId, 'focused', state.day + 1);
  return state;
}
