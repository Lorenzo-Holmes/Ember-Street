import type { DayAssignment, GameState, Survivor } from '../types';

const JOB_BUILDING: Partial<Record<DayAssignment, keyof GameState['buildings']>> = {
  expedition: 'searchStation', repair: 'workshop', medical: 'clinic', watch: 'watchPost', radio: 'radio',
};

function pendingAssignments(state: GameState): Record<string, DayAssignment> {
  const committed = new Set(state.dayState.committedSurvivorIds);
  return Object.fromEntries(Object.entries(state.dayAssignments).filter(([survivorId]) => !committed.has(survivorId)));
}

export function survivorAvailableForDay(survivor: Survivor): boolean {
  return survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical';
}

export function canTakeDayAssignment(state: GameState, survivorId: string, job: DayAssignment): { allowed: boolean; reason?: string } {
  if (state.dayState.assignmentsLocked) return { allowed: false, reason: '今日调遣已经锁定' };
  if (state.dayState.committedSurvivorIds.includes(survivorId)) return { allowed: false, reason: '今天已经执行过行动' };
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor) return { allowed: false, reason: '人物不在街区' };
  if (!survivorAvailableForDay(survivor)) return { allowed: false, reason: survivor.condition === 'missing' ? '人物仍然失踪' : survivor.condition === 'dead' ? '人物已经死亡' : '人物情况危重' };
  if (job === 'expedition' && state.dayState.returnedExpeditions > 0) return { allowed: false, reason: '今天的搜索队已经执行过一次' };
  if (job === 'expedition' && (survivor.condition === 'serious' || survivor.energy < 15)) return { allowed: false, reason: survivor.condition === 'serious' ? '重伤人物不能正常外出' : '精力过低，无法出发' };
  const building = JOB_BUILDING[job];
  if (building && state.buildings[building] <= 0) return { allowed: false, reason: '对应设施尚未修复' };
  return { allowed: true };
}

export function assignDayJob(state: GameState, survivorId: string, job: DayAssignment): GameState {
  const availability = canTakeDayAssignment(state, survivorId, job);
  if (!availability.allowed) return { ...state, lastMessage: availability.reason ?? '无法执行这项调遣' };
  return {
    ...state,
    dayAssignments: { ...state.dayAssignments, [survivorId]: job },
    lastMessage: `${state.survivors.find((item) => item.id === survivorId)?.name ?? '幸存者'} · ${job === 'expedition' ? '探索' : job}`,
  };
}

export function clearDayJob(state: GameState, survivorId: string): GameState {
  if (state.dayState.assignmentsLocked || state.dayState.committedSurvivorIds.includes(survivorId)) return state;
  const dayAssignments = { ...state.dayAssignments };
  delete dayAssignments[survivorId];
  return { ...state, dayAssignments };
}

export function hasPendingExpeditionAssignment(state: GameState): boolean {
  if (state.dayState.returnedExpeditions > 0) return false;
  const committed = new Set(state.dayState.committedSurvivorIds);
  return state.survivors.some((survivor) => !committed.has(survivor.id) && survivorAvailableForDay(survivor) && state.dayAssignments[survivor.id] === 'expedition');
}

export function lockDayAssignments(state: GameState): GameState {
  if (state.dayState.assignmentsLocked) return state;
  const available = state.survivors.filter(survivorAvailableForDay).filter((s) => !state.dayState.committedSurvivorIds.includes(s.id));
  const nextAssignments = pendingAssignments(state);
  for (const survivor of available) if (!nextAssignments[survivor.id]) nextAssignments[survivor.id] = 'rest';
  return {
    ...state,
    dayAssignments: nextAssignments,
    dayState: { ...state.dayState, assignmentsLocked: true },
    lastMessage: '今日调遣已锁定 · 天黑以后不能临时换岗',
  };
}

export function lockDayAssignmentsAndRoute(state: GameState): GameState {
  if (state.expeditionState.departed) return { ...state, phase: 'street', lastMessage: '搜索队还在外出中 · 先处理探索事件。' };
  const locked = lockDayAssignments(state);
  return { ...locked, phase: hasPendingExpeditionAssignment(locked) ? 'expedition' : 'dusk' };
}

export function reopenDayAssignments(state: GameState): GameState {
  return {
    ...state,
    phase: 'street',
    dayAssignments: pendingAssignments(state),
    dayState: { ...state.dayState, assignmentsLocked: false },
    lastMessage: '已返回白天调遣 · 已行动人物保持锁定。',
  };
}

export function openExpeditionEvent(state: GameState): GameState {
  if (!state.expeditionState.departed) return state;
  return { ...state, phase: 'expedition' };
}

export function unlockNextDayAssignments(state: GameState): GameState {
  return {
    ...state,
    dayAssignments: {},
    dayState: { assignmentsLocked: false, returnedExpeditions: 0, unresolvedExpeditions: [], committedSurvivorIds: [] },
  };
}

export interface NightPreparationPreview {
  defense: '薄弱' | '一般' | '良好';
  medical: '无人' | '有人值守';
  repair: '无人' | '有人值守';
  radio: '无人' | '有人值守';
  cooks: number;
  expeditions: number;
}

export function previewNightPreparation(state: GameState): NightPreparationPreview {
  const jobs = Object.values(pendingAssignments(state));
  const watch = jobs.filter((job) => job === 'watch').length;
  return {
    defense: watch >= 2 || (watch >= 1 && state.buildings.watchPost >= 2) ? '良好' : watch >= 1 ? '一般' : '薄弱',
    medical: jobs.includes('medical') ? '有人值守' : '无人',
    repair: jobs.includes('repair') ? '有人值守' : '无人',
    radio: jobs.includes('radio') ? '有人值守' : '无人',
    cooks: jobs.filter((job) => job === 'cook').length,
    expeditions: jobs.filter((job) => job === 'expedition').length,
  };
}
