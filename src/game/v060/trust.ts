import type { GameState, Survivor, SurvivorCondition } from '../types';

export type TrustLevel = NonNullable<Survivor['trust']>;

const CONDITION_RANK: Record<SurvivorCondition, number> = {
  healthy: 0,
  fatigued: 1,
  minor: 2,
  serious: 3,
  critical: 4,
  missing: 5,
  dead: 6,
};

export function clampTrust(value: number): TrustLevel {
  return Math.max(-3, Math.min(3, Math.round(value))) as TrustLevel;
}

export function trustLabel(value: number | undefined): string {
  const trust = clampTrust(value ?? 0);
  if (trust >= 3) return '肯跟你担最难的事';
  if (trust === 2) return '愿意照你的安排';
  if (trust === 1) return '愿意听你一句';
  if (trust === 0) return '还在看你怎么做';
  if (trust === -1) return '开始怀疑你的判断';
  if (trust === -2) return '只肯做分内的事';
  return '几乎不再配合你';
}

export function energyLabel(energy: number): string {
  if (energy >= 80) return '精神头还足';
  if (energy >= 60) return '身上还有力气';
  if (energy >= 40) return '已经有些乏了';
  if (energy >= 20) return '脚步发沉';
  return '快撑不住了';
}

export function trustWorkFactor(survivor: Survivor): number {
  const trust = clampTrust(survivor.trust ?? 0);
  if (trust <= -3) return 0.5;
  if (trust === -2) return 0.75;
  return 1;
}

export function trustCheckModifier(survivor: Survivor): number {
  const trust = clampTrust(survivor.trust ?? 0);
  if (trust >= 2) return 1;
  if (trust <= -3) return -2;
  if (trust === -2) return -1;
  return 0;
}

export function specialtyAvailable(survivor: Survivor): boolean {
  return clampTrust(survivor.trust ?? 0) >= 0;
}

export function adjustTrust(state: GameState, survivorId: string, delta: number): GameState {
  if (!delta) return state;
  return {
    ...state,
    survivors: state.survivors.map((survivor) => survivor.id === survivorId
      ? { ...survivor, trust: clampTrust((survivor.trust ?? 0) + delta) }
      : survivor),
  };
}

export function recoverTrustFromCare(state: GameState, survivorId: string, reason: 'medical' | 'rescue'): GameState {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  const flag = `trust_recovered:${survivorId}:${state.day}`;
  if (!survivor || (survivor.trust ?? 0) >= 0 || state.storyFlags.includes(flag)) return state;
  return {
    ...adjustTrust(state, survivorId, 1),
    storyFlags: [...new Set([...state.storyFlags, flag, `trust_recovery_reason:${survivorId}:${reason}`])],
  };
}

export function applyInjuryTrustLoss(before: GameState, after: GameState, survivorIds: string[], incidentId: string): GameState {
  let next = after;
  for (const survivorId of survivorIds) {
    const prior = before.survivors.find((item) => item.id === survivorId);
    const current = next.survivors.find((item) => item.id === survivorId);
    const flag = `trust_loss:${incidentId}:${survivorId}`;
    if (!prior || !current || current.condition === 'dead' || next.storyFlags.includes(flag)) continue;
    const priorRank = CONDITION_RANK[prior.condition ?? 'healthy'];
    const currentRank = CONDITION_RANK[current.condition ?? 'healthy'];
    if (currentRank <= priorRank) continue;
    next = {
      ...adjustTrust(next, survivorId, -1),
      storyFlags: [...new Set([...next.storyFlags, flag])],
    };
  }
  return next;
}
