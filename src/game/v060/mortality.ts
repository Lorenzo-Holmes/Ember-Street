import type { GameState } from '../types';
import { normalizeCommunityState } from './community';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const medicalCrisisFlag = (survivorId: string) => `medical_crisis_pending:${survivorId}`;

export function advanceUntreatedRisk(state: GameState): GameState {
  const flags = new Set(state.storyFlags);
  const survivors = state.survivors.map((survivor) => {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') return { ...survivor, untreatedDays: 0 };
    if (survivor.condition !== 'serious' && survivor.condition !== 'critical') {
      flags.delete(medicalCrisisFlag(survivor.id));
      return { ...survivor, untreatedDays: 0 };
    }
    const untreatedDays = Math.max(0, survivor.untreatedDays ?? 0) + 1;
    const threshold = survivor.condition === 'critical' ? 1 : 2;
    if (untreatedDays >= threshold && state.day >= 6) flags.add(medicalCrisisFlag(survivor.id));
    return { ...survivor, untreatedDays };
  });
  return { ...state, survivors, storyFlags: [...flags] };
}

export function clearUntreatedRisk(state: GameState, survivorIds: Iterable<string>): GameState {
  const ids = new Set(survivorIds);
  if (!ids.size) return state;
  const flags = new Set(state.storyFlags);
  for (const id of ids) flags.delete(medicalCrisisFlag(id));
  return {
    ...state,
    storyFlags: [...flags],
    survivors: state.survivors.map((survivor) => ids.has(survivor.id) ? { ...survivor, untreatedDays: 0 } : survivor),
  };
}

export function loseCommunityResidents(state: GameState, requestedLoss: number, cause: string): GameState {
  const loss = Math.min(state.civilianResidents, Math.max(0, Math.floor(requestedLoss)));
  if (!loss) return state;
  const community = normalizeCommunityState(state.communityState, state.civilianResidents);
  const pendingLoss = Math.min(community.pendingResidents, loss);
  const activeLoss = Math.min(community.activeResidents, loss - pendingLoss);
  const activeResidents = Math.max(0, community.activeResidents - activeLoss);
  const pendingResidents = Math.max(0, community.pendingResidents - pendingLoss);
  const supportMode = activeResidents >= 5 ? community.supportMode : null;
  const storyFlags = [...new Set([...state.storyFlags, `civilian_loss:${state.day}:${cause}:${loss}`])];
  return {
    ...state,
    civilianResidents: state.civilianResidents - loss,
    communityState: { ...community, activeResidents, pendingResidents, supportMode },
    hope: clamp(state.hope - Math.min(6, loss * 2)),
    storyFlags,
    lastMessage: `${cause} · ${loss} 名居民没能撑过去。`,
  };
}
