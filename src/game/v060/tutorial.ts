import type { GameState, TutorialHint, TutorialStage, TutorialState } from '../types';

export const TUTORIAL_STAGES: readonly TutorialStage[] = [
  'INTRO', 'RESOURCE_OVERVIEW', 'ASSIGN_SURVIVOR', 'SEND_EXPEDITION',
  'END_DAY', 'FIRST_NIGHT', 'OPEN_LOG', 'FREE_PLAY',
];

export function createTutorialState(initialPopulation = 3): TutorialState {
  return { version: 1, tutorialStage: 'INTRO', tutorialCompleted: false, tutorialSkipped: false,
    freePlayNoticeSeen: false, hintsSeen: [], initialPopulation };
}

/** Missing/unknown tutorial data never opts an existing run into onboarding. */
export function normalizeTutorial(value: unknown): TutorialState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1 || !TUTORIAL_STAGES.includes(raw.tutorialStage as TutorialStage)) return undefined;
  const skipped = raw.tutorialSkipped === true;
  const completed = !skipped && (raw.tutorialCompleted === true || raw.tutorialStage === 'FREE_PLAY');
  const hints: TutorialHint[] = ['injury', 'building', 'population'];
  return {
    version: 1,
    tutorialStage: skipped || completed ? 'FREE_PLAY' : raw.tutorialStage as TutorialStage,
    tutorialCompleted: completed,
    tutorialSkipped: skipped,
    freePlayNoticeSeen: skipped || raw.freePlayNoticeSeen === true,
    hintsSeen: Array.isArray(raw.hintsSeen) ? hints.filter((hint) => (raw.hintsSeen as unknown[]).includes(hint)) : [],
    initialPopulation: typeof raw.initialPopulation === 'number' && Number.isFinite(raw.initialPopulation)
      ? Math.max(0, raw.initialPopulation) : 3,
  };
}

export function tutorialIsActive(state: GameState): boolean {
  return Boolean(state.tutorial && !state.tutorial.tutorialCompleted && !state.tutorial.tutorialSkipped);
}

function stage(state: GameState, tutorialStage: TutorialStage): GameState {
  if (!state.tutorial || state.tutorial.tutorialStage === tutorialStage) return state;
  return { ...state, tutorial: { ...state.tutorial, tutorialStage } };
}

export function hasTutorialWork(state: GameState): boolean {
  return state.survivors.some((person) => person.condition !== 'dead' && person.condition !== 'missing'
    && Boolean(state.dayAssignments[person.id]) && state.dayAssignments[person.id] !== 'expedition');
}

export function hasTutorialRoute(state: GameState): boolean {
  return state.survivors.some((person) => state.dayAssignments[person.id] === 'expedition'
    && Boolean(state.dayState.expeditionRoutes?.[person.id]));
}

/** Reconcile real game milestones; never grant resources, dispatch people or advance a day. */
export function reconcileTutorial(state: GameState): GameState {
  if (!tutorialIsActive(state)) return state;
  if (state.day > 2 || state.phase === 'ending') {
    return { ...state, tutorial: { ...state.tutorial!, tutorialStage: 'FREE_PLAY', tutorialCompleted: true, freePlayNoticeSeen: true } };
  }
  if (state.day >= 2) return stage(state, 'OPEN_LOG');
  if (['night', 'night-summary', 'summary', 'dawn'].includes(state.phase)) return stage(state, 'FIRST_NIGHT');
  if (state.phase === 'dusk') return stage(state, 'END_DAY');
  if (state.phase === 'expedition') return stage(state, 'SEND_EXPEDITION');
  // An explicit, accepted job is evidence. Merely opening a card is not.
  if (['ASSIGN_SURVIVOR', 'SEND_EXPEDITION', 'END_DAY'].includes(state.tutorial!.tutorialStage)) {
    return stage(state, hasTutorialWork(state) ? 'SEND_EXPEDITION' : 'ASSIGN_SURVIVOR');
  }
  return state;
}

export function acknowledgeTutorialPage(state: GameState): GameState {
  if (!tutorialIsActive(state)) return state;
  if (state.tutorial!.tutorialStage === 'INTRO') return stage(state, 'RESOURCE_OVERVIEW');
  if (state.tutorial!.tutorialStage === 'RESOURCE_OVERVIEW') return reconcileTutorial(stage(state, 'ASSIGN_SURVIVOR'));
  return state;
}

/** Only the actual log page calls this, once its log tab has mounted. */
export function completeTutorialFromLog(state: GameState): GameState {
  if (!tutorialIsActive(state) || state.day < 2 || state.tutorial!.tutorialStage !== 'OPEN_LOG') return state;
  return { ...state, tutorial: { ...state.tutorial!, tutorialStage: 'FREE_PLAY', tutorialCompleted: true } };
}

export function skipTutorial(state: GameState): GameState {
  if (!state.tutorial) return state;
  return { ...state, tutorial: { ...state.tutorial, tutorialStage: 'FREE_PLAY', tutorialSkipped: true,
    tutorialCompleted: false, freePlayNoticeSeen: true } };
}

export function dismissTutorialNotice(state: GameState, hint?: TutorialHint): GameState {
  if (!state.tutorial) return state;
  return { ...state, tutorial: { ...state.tutorial, freePlayNoticeSeen: true,
    hintsSeen: hint ? [...new Set([...state.tutorial.hintsSeen, hint])] : state.tutorial.hintsSeen } };
}

export function tutorialDispatchBlocker(state: GameState): string | undefined {
  if (!tutorialIsActive(state) || state.day !== 1) return undefined;
  if (!hasTutorialWork(state)) return '先给一人记下屋内工作或休息';
  if (!hasTutorialRoute(state)) return '再给一人记下探索路线';
  return undefined;
}

/** Let the first real journal remain readable before showing optional day-two unlock notices. */
export function tutorialLogHasPriority(state: GameState, viewingLog: boolean): boolean {
  return Boolean(state.tutorial && !state.tutorial.tutorialSkipped && state.day === 2
    && (state.tutorial.tutorialStage === 'OPEN_LOG' || (viewingLog && state.tutorial.tutorialCompleted)));
}

/** Use a real, mild existing event in one existing slot; preserve all RNG draws and budgets. */
export function tutorialNightOrder(state: GameState, ids: string[]): string[] {
  if (!tutorialIsActive(state) || state.day !== 1 || !ids.length) return ids;
  const first = 'gate-knocking';
  if (ids.includes(first)) return [first, ...ids.filter((id) => id !== first)];
  const replaceAt = ids.findIndex((id) => !id.startsWith('horde-'));
  if (replaceAt < 0) return ids;
  return [first, ...ids.filter((_, index) => index !== replaceAt)];
}
