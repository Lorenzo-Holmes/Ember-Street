import { nextRandom } from '../rng';
import type { GameState, Survivor } from '../types';
import { markMissing } from './memorial';

export type MoraleDecision = 'talk' | 'rest' | 'let-go';

export interface MoraleCrisis {
  survivorId: string;
  title: string;
  body: string;
  day: number;
}

const pendingPrefix = 'morale_departure_pending:';
const resolvedPrefix = 'morale_departure_resolved:';
const leftPrefix = 'missing_reason:left_voluntarily:';

function eligibleSurvivors(state: GameState): Survivor[] {
  return state.survivors.filter((survivor) =>
    survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical');
}

function riskForHope(hope: number): number {
  if (hope >= 40) return 0;
  if (hope >= 25) return 0.2;
  if (hope >= 10) return 0.5;
  return 0.8;
}

function pendingFlag(survivorId: string, day: number) {
  return `${pendingPrefix}${survivorId}:${day}`;
}

function resolvedFlag(survivorId: string, day: number) {
  return `${resolvedPrefix}${survivorId}:${day}`;
}

export function scheduleMoraleDepartureCrisis(state: GameState): GameState {
  if (state.hope >= 40) return state;
  if (state.storyFlags.some((flag) => flag.startsWith(pendingPrefix))) return state;
  if (state.storyFlags.some((flag) => flag.endsWith(`:${state.day}`) && flag.startsWith(resolvedPrefix))) return state;

  const candidates = eligibleSurvivors(state);
  if (!candidates.length) return state;
  const [riskRoll, afterRisk] = nextRandom(state.rngState);
  if (riskRoll >= riskForHope(state.hope)) return { ...state, rngState: afterRisk };

  const [candidateRoll, afterCandidate] = nextRandom(afterRisk);
  const index = Math.min(candidates.length - 1, Math.floor(candidateRoll * candidates.length));
  const survivor = candidates[index];
  return {
    ...state,
    rngState: afterCandidate,
    storyFlags: [...state.storyFlags, pendingFlag(survivor.id, state.day)],
    lastMessage: `${survivor.name}把自己的东西收进了背包。`,
  };
}

export function pendingMoraleCrisis(state: GameState): MoraleCrisis | null {
  const raw = state.storyFlags.find((flag) => flag.startsWith(pendingPrefix));
  if (!raw) return null;
  const [, survivorId, dayRaw] = raw.split(':').slice(-3);
  const survivor = state.survivors.find((item) => item.id === survivorId && item.condition !== 'dead' && item.condition !== 'missing');
  if (!survivor) return null;
  return {
    survivorId,
    day: Number(dayRaw) || state.day,
    title: `${survivor.name} · 他/她收好了背包`,
    body: `${survivor.name}觉得继续留在这里看不到希望。低落没有直接让人凭空消失，但现在必须有人回应。`,
  };
}

function clearPending(state: GameState, survivorId: string): GameState {
  return {
    ...state,
    storyFlags: state.storyFlags.filter((flag) => !flag.startsWith(`${pendingPrefix}${survivorId}:`)),
  };
}

function stay(state: GameState, survivorId: string, note: string, hopeDelta: number, energyDelta = 0): GameState {
  const next = clearPending(state, survivorId);
  return {
    ...next,
    hope: Math.min(100, Math.max(0, next.hope + hopeDelta)),
    storyFlags: [...next.storyFlags, resolvedFlag(survivorId, state.day)],
    survivors: next.survivors.map((item) => item.id === survivorId
      ? { ...item, energy: Math.min(100, Math.max(0, item.energy + energyDelta)) }
      : item),
    lastMessage: note,
  };
}

export function resolveMoraleCrisis(state: GameState, survivorId: string, decision: MoraleDecision): GameState {
  const crisis = pendingMoraleCrisis(state);
  if (!crisis || crisis.survivorId !== survivorId) return state;
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor) return state;

  if (decision === 'let-go') {
    let next = clearPending(state, survivorId);
    next = markMissing(next, survivorId, '主动离开街区');
    return {
      ...next,
      hope: Math.max(0, next.hope - 2),
      storyFlags: [...next.storyFlags, `${leftPrefix}${survivorId}`, resolvedFlag(survivorId, state.day)],
      lastMessage: `${survivor.name}自己离开了街区。没有人知道他/她会走多远。`,
    };
  }

  if (decision === 'rest') {
    const committed = [...new Set([...state.dayState.committedSurvivorIds, survivorId])];
    const resting = { ...state, dayState: { ...state.dayState, committedSurvivorIds: committed } };
    return stay(resting, survivorId, `${survivor.name}今天不再承担工作。至少今晚，他/她还会留在灯下。`, 1, 18);
  }

  let rngState = state.rngState;
  const [roll, nextRng] = nextRandom(rngState); rngState = nextRng;
  const trustBonus = (survivor.trust ?? 0) * 0.12;
  const hopeBonus = Math.min(0.25, state.hope / 160);
  const succeeds = roll < 0.35 + trustBonus + hopeBonus;
  if (succeeds) return { ...stay(state, survivorId, `${survivor.name}把背包放回了床边。`, 2), rngState };

  let next = clearPending({ ...state, rngState }, survivorId);
  next = markMissing(next, survivorId, '低 Hope 后主动离开');
  return {
    ...next,
    storyFlags: [...next.storyFlags, `${leftPrefix}${survivorId}`, resolvedFlag(survivorId, state.day)],
    lastMessage: `谈话没有留下${survivor.name}。天亮前，他/她离开了。`,
  };
}

export type MissingReason = 'voluntary' | 'expedition' | 'other';

export function missingReason(state: GameState, survivorId: string): MissingReason {
  if (state.storyFlags.includes(`${leftPrefix}${survivorId}`)) return 'voluntary';
  const cause = state.storyFlags.find((flag) => flag.startsWith(`missing_cause:${survivorId}:`)) ?? '';
  if (cause.includes('探索')) return 'expedition';
  return 'other';
}

export function canUseStandardMissingSearch(state: GameState, survivorId: string): boolean {
  return missingReason(state, survivorId) !== 'voluntary';
}
