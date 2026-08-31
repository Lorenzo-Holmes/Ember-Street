import type { GameState, SurvivorCondition } from '../types';
import { recordDeath } from './memorial';

export type InfectionStage = 'none' | 'suspected' | 'infected' | 'turning';
export type MortalityCrisisKind = 'worsening' | 'critical' | 'infection' | 'turning';

export interface MortalityCrisis {
  survivorId: string;
  kind: MortalityCrisisKind;
  priority: number;
  title: string;
}

const flag = (prefix: string, survivorId: string, suffix?: string | number) =>
  suffix === undefined ? `${prefix}:${survivorId}` : `${prefix}:${survivorId}:${suffix}`;

const addFlag = (state: GameState, value: string): GameState =>
  state.storyFlags.includes(value) ? state : { ...state, storyFlags: [...state.storyFlags, value] };

const removeFlags = (state: GameState, prefix: string): GameState => ({
  ...state,
  storyFlags: state.storyFlags.filter((value) => !value.startsWith(prefix)),
});

function alive(state: GameState, survivorId: string) {
  return state.survivors.find((item) => item.id === survivorId && item.condition !== 'dead' && item.condition !== 'missing');
}

export function infectionStage(state: GameState, survivorId: string): InfectionStage {
  if (state.storyFlags.includes(flag('infection_turning', survivorId))) return 'turning';
  if (state.storyFlags.includes(flag('infection_infected', survivorId))) return 'infected';
  if (state.storyFlags.includes(flag('infection_suspected', survivorId))) return 'suspected';
  return 'none';
}

export function setInfectionStage(state: GameState, survivorId: string, stage: InfectionStage, cause = '未知暴露'): GameState {
  if (!alive(state, survivorId)) return state;
  let next = removeFlags(state, `infection_suspected:${survivorId}`);
  next = removeFlags(next, `infection_infected:${survivorId}`);
  next = removeFlags(next, `infection_turning:${survivorId}`);
  if (stage === 'none') return next;
  next = addFlag(next, flag(`infection_${stage}`, survivorId));
  next = addFlag(next, flag('infection_source', survivorId, cause));
  return next;
}

export function markInfectionSuspected(state: GameState, survivorId: string, cause: string): GameState {
  if (infectionStage(state, survivorId) !== 'none') return state;
  let next = setInfectionStage(state, survivorId, 'suspected', cause);
  next = addFlag(next, flag('infection_since', survivorId, state.day));
  return { ...next, lastMessage: `${alive(next, survivorId)?.name ?? '有人'}的伤口需要进一步观察。` };
}

function untreatedCount(state: GameState, survivorId: string): number {
  return state.storyFlags.filter((value) => value.startsWith(`untreated:${survivorId}:`)).length;
}

function hasMedicalAttention(state: GameState): boolean {
  return state.buildings.clinic > 0 && state.survivors.some((item) =>
    item.condition !== 'dead' && item.condition !== 'missing' && state.dayAssignments[item.id] === 'medical');
}

/**
 * Called once when a new day begins, before day assignments are reset.
 * It never kills or silently worsens a survivor. It only records that a
 * crisis must be surfaced to the player.
 */
export function advanceMortalityPressure(state: GameState): GameState {
  let next = state;
  const medicallyStaffed = hasMedicalAttention(state);

  for (const survivor of state.survivors) {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') continue;
    const condition = survivor.condition ?? 'healthy';
    if ((condition === 'serious' || condition === 'critical') && !medicallyStaffed) {
      next = addFlag(next, flag('untreated', survivor.id, state.day));
      const count = untreatedCount(next, survivor.id);
      if (condition === 'critical' && count >= 1) next = addFlag(next, flag('mortality_pending', survivor.id, 'critical'));
      if (condition === 'serious' && count >= 2) next = addFlag(next, flag('mortality_pending', survivor.id, 'worsening'));
    }

    const infection = infectionStage(next, survivor.id);
    if (infection === 'suspected') next = addFlag(next, flag('mortality_pending', survivor.id, 'infection'));
    if (infection === 'infected') next = addFlag(next, flag('mortality_pending', survivor.id, 'infection'));
    if (infection === 'turning') next = addFlag(next, flag('mortality_pending', survivor.id, 'turning'));
  }
  return next;
}

function pendingKind(state: GameState, survivorId: string): MortalityCrisisKind | null {
  for (const kind of ['turning', 'critical', 'infection', 'worsening'] as const) {
    if (state.storyFlags.includes(flag('mortality_pending', survivorId, kind))) return kind;
  }
  return null;
}

export function pendingMortalityCrises(state: GameState): MortalityCrisis[] {
  const priority: Record<MortalityCrisisKind, number> = { turning: 100, critical: 90, infection: 80, worsening: 70 };
  const title: Record<MortalityCrisisKind, string> = {
    turning: '门里面没有回应',
    critical: '呼吸越来越浅',
    infection: '高烧没有退',
    worsening: '伤口比昨天更糟',
  };
  return state.survivors.flatMap((survivor) => {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') return [];
    const kind = pendingKind(state, survivor.id);
    return kind ? [{ survivorId: survivor.id, kind, priority: priority[kind], title: `${survivor.name} · ${title[kind]}` }] : [];
  }).sort((a, b) => b.priority - a.priority);
}

function clearCrisis(state: GameState, survivorId: string, kind: MortalityCrisisKind): GameState {
  return removeFlags(state, `mortality_pending:${survivorId}:${kind}`);
}

function setCondition(state: GameState, survivorId: string, condition: SurvivorCondition): GameState {
  return { ...state, survivors: state.survivors.map((item) => item.id === survivorId ? { ...item, condition } : item) };
}

export type MortalityDecision = 'treat' | 'stabilize' | 'delay';

export function resolveMortalityCrisis(state: GameState, survivorId: string, decision: MortalityDecision): GameState {
  const survivor = alive(state, survivorId);
  const kind = pendingKind(state, survivorId);
  if (!survivor || !kind) return state;

  if (kind === 'turning') {
    if (decision === 'delay') return recordDeath(clearCrisis(state, survivorId, kind), survivorId, '感染尸变');
    if (decision === 'treat' && state.inventory.medicine > 0 && state.buildings.clinic >= 2) {
      const next = clearCrisis({ ...state, inventory: { ...state.inventory, medicine: state.inventory.medicine - 1 } }, survivorId, kind);
      return { ...setInfectionStage(next, survivorId, 'infected', '隔离延缓'), hope: Math.max(0, next.hope - 1), lastMessage: `${survivor.name}被隔离，尸变暂时被延缓。` };
    }
    return { ...clearCrisis(state, survivorId, kind), hope: Math.max(0, state.hope - 2), lastMessage: `${survivor.name}被隔离观察。情况仍然危险。` };
  }

  if (kind === 'infection') {
    if (decision === 'treat' && state.inventory.medicine > 0 && state.buildings.clinic > 0) {
      const next = clearCrisis({ ...state, inventory: { ...state.inventory, medicine: state.inventory.medicine - 1 } }, survivorId, kind);
      const stage = infectionStage(next, survivorId);
      return { ...setInfectionStage(next, survivorId, stage === 'suspected' ? 'none' : 'infected', '医疗观察'), lastMessage: `${survivor.name}接受了感染检查和处理。` };
    }
    if (decision === 'delay') {
      const stage = infectionStage(state, survivorId);
      const nextStage: InfectionStage = stage === 'suspected' ? 'infected' : 'turning';
      let next = clearCrisis(state, survivorId, kind);
      next = setInfectionStage(next, survivorId, nextStage, '感染恶化');
      if (nextStage === 'turning') next = addFlag(next, flag('mortality_pending', survivorId, 'turning'));
      return { ...next, hope: Math.max(0, next.hope - 1), lastMessage: `${survivor.name}的感染继续恶化。` };
    }
    return { ...clearCrisis(state, survivorId, kind), lastMessage: `${survivor.name}被单独安置观察。` };
  }

  if (decision === 'treat' && state.inventory.medicine > 0 && state.buildings.clinic > 0) {
    let next = clearCrisis({ ...state, inventory: { ...state.inventory, medicine: state.inventory.medicine - 1 } }, survivorId, kind);
    next = setCondition(next, survivorId, kind === 'critical' ? 'serious' : 'minor');
    next = removeFlags(next, `untreated:${survivorId}:`);
    return { ...next, lastMessage: `${survivor.name}接受了及时治疗。` };
  }

  if (decision === 'delay') {
    if (kind === 'critical') return recordDeath(clearCrisis(state, survivorId, kind), survivorId, '伤势长期未得到治疗');
    return { ...setCondition(clearCrisis(state, survivorId, kind), survivorId, 'critical'), hope: Math.max(0, state.hope - 1), lastMessage: `${survivor.name}的伤势进入危重状态。` };
  }

  return { ...clearCrisis(state, survivorId, kind), lastMessage: `${survivor.name}暂时被稳定下来，但仍需要医疗。` };
}
