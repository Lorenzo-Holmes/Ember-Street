import type { CheckModifier, GameState, Survivor, SurvivorPsychology } from '../types';

const alive = (survivor: Survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing';

export function psychologyLabel(psychology?: SurvivorPsychology): string | null {
  if (!psychology) return null;
  if (psychology.state === 'shaken') return '动摇';
  if (psychology.state === 'grieving') return '哀悼';
  return '坚定';
}

export function psychologyCheckModifier(survivor?: Survivor): CheckModifier | null {
  if (!survivor?.psychology) return null;
  if (survivor.psychology.state === 'shaken') return { label: '心理·动摇', value: -1 };
  if (survivor.psychology.state === 'determined') return { label: '心理·坚定', value: 1 };
  return null;
}

export function psychologyWorkEnergyDelta(survivor: Survivor, resting: boolean): number {
  if (survivor.psychology?.state !== 'grieving') return 0;
  return resting ? -6 : 2;
}

export function applyPsychology(state: GameState, survivorId: string, psychology: SurvivorPsychology): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId && alive(survivor) ? { ...survivor, psychology } : survivor),
  };
}

export function applyDeathPsychology(state: GameState, deadId: string, name: string): GameState {
  const living = state.survivors.filter((survivor) => survivor.id !== deadId && alive(survivor));
  if (!living.length) return state;
  const griefTarget = [...living].sort((a, b) => (b.trust ?? 0) - (a.trust ?? 0) || a.id.localeCompare(b.id))[0];
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      if (!alive(survivor) || survivor.id === deadId) return survivor;
      if (survivor.id === griefTarget.id) return { ...survivor, psychology: { state: 'grieving' as const, untilDay: state.day + 3, cause: `${name}死亡` } };
      if (survivor.psychology?.state === 'grieving') return survivor;
      return { ...survivor, psychology: { state: 'shaken' as const, untilDay: state.day + 2, cause: `${name}死亡` } };
    }),
  };
}

export function advancePsychologyDay(state: GameState): GameState {
  return {
    ...state,
    survivors: state.survivors.map((survivor) => {
      const psychology = survivor.psychology;
      if (!psychology || !alive(survivor) || state.day <= psychology.untilDay) return survivor;
      if ((psychology.state === 'shaken' || psychology.state === 'grieving') && state.hope >= 45) {
        return { ...survivor, psychology: { state: 'determined' as const, untilDay: state.day + 1, cause: `挺过了${psychology.cause}` } };
      }
      return { ...survivor, psychology: undefined };
    }),
  };
}
