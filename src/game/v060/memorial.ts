import type { GameState } from '../types';

const EPITAPH: Record<string, string> = {
  'lin-xia': '“先看好退路，再往前走。”',
  zhou: '“能修的东西，就别让它坏在手里。”',
  ahe: '“热饭很重要。”',
  cheng: '“先救能救的。”',
  aliang: '“听见声音以前，先看清方向。”',
  xiaoman: '“别让声音断掉。”',
};

export function markMissing(state: GameState, survivorId: string, cause: string): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition === 'dead' || survivor.condition === 'missing') return state;
  return {
    ...state,
    survivors: state.survivors.map((item) => item.id === survivorId ? { ...item, condition: 'missing' as const } : item),
    campaignStats: { ...state.campaignStats, missing: state.campaignStats.missing + 1 },
    storyFlags: [...new Set([...state.storyFlags, `missing_since:${survivorId}:${state.day}`, `missing_cause:${survivorId}:${cause}`])],
  };
}

export function recoverMissing(state: GameState, survivorId: string, condition: 'minor' | 'serious' = 'serious'): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition !== 'missing') return state;
  return {
    ...state,
    survivors: state.survivors.map((item) => item.id === survivorId ? { ...item, condition, energy: Math.min(item.energy, 35) } : item),
    campaignStats: { ...state.campaignStats, missing: Math.max(0, state.campaignStats.missing - 1) },
    storyFlags: [...new Set([...state.storyFlags, `missing_recovered:${survivorId}`])],
    hope: Math.min(100, state.hope + 2),
    lastMessage: `${survivor.name}被找回来了。人很虚弱，但还活着。`,
  };
}

export function recordDeath(state: GameState, survivorId: string, cause: string): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition === 'dead') return state;
  const wasMissing = survivor.condition === 'missing';
  const memorialExists = state.memorials.some((entry) => entry.survivorId === survivorId);
  const memorials = memorialExists ? state.memorials : [...state.memorials, {
    survivorId,
    name: survivor.name,
    day: state.day,
    cause,
    epitaph: EPITAPH[survivorId] ?? '“这里曾经有人。”',
  }];
  return {
    ...state,
    survivors: state.survivors.map((item) => item.id === survivorId ? { ...item, condition: 'dead' as const, energy: 0 } : item),
    campaignStats: {
      ...state.campaignStats,
      deaths: state.campaignStats.deaths + 1,
      missing: Math.max(0, state.campaignStats.missing - (wasMissing ? 1 : 0)),
    },
    memorials,
    storyFlags: [...new Set([...state.storyFlags, `death:${survivorId}`, `death_cause:${survivorId}:${cause}`])],
    hope: Math.max(0, state.hope - 4),
    lastMessage: `${survivor.name}没有回来。纪念墙上多了一个名字。`,
  };
}
