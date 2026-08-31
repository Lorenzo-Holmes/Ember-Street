import { nextRandom } from '../rng';
import type { GameState } from '../types';
import { normalizeCommunityState } from './community';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const medicalCrisisFlag = (survivorId: string) => `medical_crisis_pending:${survivorId}`;
export const lowHopeDepartureFlag = (survivorId: string) => `low_hope_departure_pending:${survivorId}`;
const LOW_HOPE_PREFIX = 'low_hope_departure_pending:';

export function pendingLowHopeDepartureId(state: GameState): string | null {
  const flag = state.storyFlags.find((value) => value.startsWith(LOW_HOPE_PREFIX));
  return flag ? flag.slice(LOW_HOPE_PREFIX.length) : null;
}

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

export function deferMedicalCrisis(state: GameState, survivorId: string): GameState {
  const flags = new Set(state.storyFlags);
  flags.delete(medicalCrisisFlag(survivorId));
  flags.add(`medical_isolated:${survivorId}:${state.day}`);
  return {
    ...state,
    storyFlags: [...flags],
    survivors: state.survivors.map((survivor) => survivor.id === survivorId
      ? { ...survivor, untreatedDays: Math.max(0, (survivor.untreatedDays ?? 1) - 1) }
      : survivor),
    hope: clamp(state.hope - 1),
  };
}

export function queueLowHopeDeparture(state: GameState): GameState {
  if (state.day < 6 || state.hope > 12 || pendingLowHopeDepartureId(state)) return state;
  const checkedFlag = `low_hope_departure_checked:${state.day}`;
  if (state.storyFlags.includes(checkedFlag)) return state;

  const candidates = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && survivor.condition !== 'serious')
    .sort((a, b) => (a.trust ?? 0) - (b.trust ?? 0));
  let rngState = state.rngState;
  const [triggerRoll, afterTrigger] = nextRandom(rngState); rngState = afterTrigger;
  const flags = new Set(state.storyFlags);
  flags.add(checkedFlag);
  if (!candidates.length) return { ...state, rngState, storyFlags: [...flags] };

  const chance = clamp(0.12 + Math.max(0, 12 - state.hope) * 0.05, 0.12, 0.72);
  if (triggerRoll >= chance) return { ...state, rngState, storyFlags: [...flags] };

  const lowestTrust = candidates[0].trust ?? 0;
  const vulnerable = candidates.filter((survivor) => (survivor.trust ?? 0) <= lowestTrust + 1);
  const [pickRoll, afterPick] = nextRandom(rngState); rngState = afterPick;
  const target = vulnerable[Math.min(vulnerable.length - 1, Math.floor(pickRoll * vulnerable.length))];
  flags.add(lowHopeDepartureFlag(target.id));
  return {
    ...state,
    rngState,
    storyFlags: [...flags],
    lastMessage: `${target.name}整晚没有说话。天快亮时，他/她开始收拾自己的东西。`,
  };
}

export function clearLowHopeDeparture(state: GameState, survivorId: string): GameState {
  return { ...state, storyFlags: state.storyFlags.filter((flag) => flag !== lowHopeDepartureFlag(survivorId)) };
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
