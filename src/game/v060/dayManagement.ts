import type { DayAssignment, ExpeditionPlan, GameState, Survivor } from '../types';
import { communityMedicalSupport, communityRepairSupport, communitySupportSummary } from './community';
import { isLocationUnlocked, locationForId } from './expedition';

const JOB_BUILDING: Partial<Record<DayAssignment, keyof GameState['buildings']>> = {
  expedition: 'searchStation', repair: 'workshop', medical: 'clinic', watch: 'watchPost', radio: 'radio',
};

export const DAY_ASSIGNMENT_LABEL: Record<DayAssignment, string> = {
  expedition: '探索',
  repair: '维修',
  medical: '医疗',
  watch: '守备',
  radio: '广播',
  cook: '炊事',
  rest: '休息',
};

const CLOSED_PLACE_NOTE: Partial<Record<DayAssignment, string>> = {
  expedition: '路线屋里还没有能用的地图',
  repair: '修车铺还不能动工',
  medical: '诊疗室还不能接伤员',
  watch: '街口岗还不能站人',
  radio: '广播间还收不到声音',
};

const ASSIGNMENT_NOTE: Record<DayAssignment, string> = {
  expedition: '去街外找东西',
  repair: '去修车铺值班',
  medical: '去诊疗室照看伤员',
  watch: '去街口守着',
  radio: '去广播间守着',
  cook: '去饭馆准备晚饭',
  rest: '留在屋里休息',
};

function expeditionRoutes(state: GameState): Record<string, string> {
  return state.dayState.expeditionRoutes ?? {};
}

export function expeditionRouteLimit(state: GameState): number {
  const level = state.buildings.searchStation;
  return level <= 0 ? 0 : Math.min(4, level + 1);
}

function pendingAssignments(state: GameState, committedIds = state.dayState.committedSurvivorIds): Record<string, DayAssignment> {
  const committed = new Set(committedIds);
  return Object.fromEntries(Object.entries(state.dayAssignments).filter(([survivorId]) => !committed.has(survivorId)));
}

export function survivorAvailableForDay(survivor: Survivor): boolean {
  return survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical';
}

export function canTakeDayAssignment(state: GameState, survivorId: string, job: DayAssignment): { allowed: boolean; reason?: string } {
  if (state.dayState.assignmentsLocked) return { allowed: false, reason: '人已经派出去了' };
  if (state.dayState.committedSurvivorIds.includes(survivorId)) return { allowed: false, reason: '这个人今天已经干过一趟了' };
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor) return { allowed: false, reason: '这个人现在不在街里' };
  if (!survivorAvailableForDay(survivor)) return { allowed: false, reason: survivor.condition === 'missing' ? '人还没回来' : survivor.condition === 'dead' ? '这个人已经不在了' : '伤得太重，今天起不了身' };
  if (job === 'expedition' && state.dayState.returnedExpeditions > 0) return { allowed: false, reason: '今天已经有人走过一趟了' };
  if (job === 'expedition' && (survivor.condition === 'serious' || survivor.energy < 15)) return { allowed: false, reason: survivor.condition === 'serious' ? '伤得太重，不能再往街外走' : '这身子走不了远路' };
  const building = JOB_BUILDING[job];
  if (building && state.buildings[building] <= 0) return { allowed: false, reason: CLOSED_PLACE_NOTE[job] ?? '这地方现在还不能用' };
  return { allowed: true };
}

export function assignDayJob(state: GameState, survivorId: string, job: DayAssignment): GameState {
  const availability = canTakeDayAssignment(state, survivorId, job);
  if (!availability.allowed) return { ...state, lastMessage: availability.reason ?? '今天做不了这件事' };
  const routes = expeditionRoutes(state);
  const nextRoutes = job === 'expedition' ? routes : Object.fromEntries(Object.entries(routes).filter(([id]) => id !== survivorId));
  return {
    ...state,
    dayAssignments: { ...state.dayAssignments, [survivorId]: job },
    dayState: { ...state.dayState, expeditionRoutes: nextRoutes },
    lastMessage: `${state.survivors.find((item) => item.id === survivorId)?.name ?? '这个人'}：${ASSIGNMENT_NOTE[job]}。`,
  };
}

export function clearDayJob(state: GameState, survivorId: string): GameState {
  if (state.dayState.assignmentsLocked || state.dayState.committedSurvivorIds.includes(survivorId)) return state;
  const dayAssignments = { ...state.dayAssignments };
  delete dayAssignments[survivorId];
  const routes = { ...expeditionRoutes(state) };
  delete routes[survivorId];
  return { ...state, dayAssignments, dayState: { ...state.dayState, expeditionRoutes: routes } };
}

export function assignExpeditionRoute(state: GameState, survivorId: string, locationId: string): GameState {
  if (!locationForId(locationId) || !isLocationUnlocked(state, locationId)) return { ...state, lastMessage: '这条路眼下还走不通' };
  const assigned = assignDayJob(state, survivorId, 'expedition');
  if (assigned.dayAssignments[survivorId] !== 'expedition') return assigned;
  const routes = { ...expeditionRoutes(assigned), [survivorId]: locationId };
  const distinctRoutes = new Set(Object.entries(routes)
    .filter(([id]) => assigned.dayAssignments[id] === 'expedition')
    .map(([, route]) => route));
  if (distinctRoutes.size > expeditionRouteLimit(assigned)) {
    return { ...state, lastMessage: `路线屋今天最多记清 ${expeditionRouteLimit(assigned)} 条路` };
  }
  const survivor = assigned.survivors.find((item) => item.id === survivorId);
  return {
    ...assigned,
    dayState: { ...assigned.dayState, expeditionRoutes: routes },
    lastMessage: `${survivor?.name ?? '这个人'}：去${locationForId(locationId)?.name ?? locationId}。`,
  };
}

export function expeditionRouteFor(state: GameState, survivorId: string): string | undefined {
  return expeditionRoutes(state)[survivorId];
}

export function incompleteExpeditionSurvivorIds(state: GameState): string[] {
  const routes = expeditionRoutes(state);
  const committed = new Set(state.dayState.committedSurvivorIds);
  return state.survivors
    .filter((survivor) => !committed.has(survivor.id) && survivorAvailableForDay(survivor) && state.dayAssignments[survivor.id] === 'expedition' && !routes[survivor.id])
    .map((survivor) => survivor.id);
}

export function buildExpeditionQueue(state: GameState): ExpeditionPlan[] {
  const groups = new Map<string, string[]>();
  const routes = expeditionRoutes(state);
  const committed = new Set(state.dayState.committedSurvivorIds);
  for (const survivor of state.survivors) {
    if (committed.has(survivor.id) || state.dayAssignments[survivor.id] !== 'expedition') continue;
    const locationId = routes[survivor.id];
    if (!locationId) continue;
    groups.set(locationId, [...(groups.get(locationId) ?? []), survivor.id]);
  }
  return [...groups.entries()].map(([locationId, partyIds], index) => ({
    id: `day-${state.day}-route-${index + 1}-${locationId}`,
    locationId,
    partyIds,
  }));
}

export interface DispatchConfirmationEntry {
  survivorId: string;
  name: string;
  assignment: DayAssignment | null;
  label: string;
  automatic: boolean;
  committed: boolean;
  unavailable: boolean;
}

export interface DispatchConfirmationPreview {
  entries: DispatchConfirmationEntry[];
  manuallyAssigned: number;
  autoResting: number;
  committed: number;
  expeditionCount: number;
}

export function previewDispatchConfirmation(state: GameState): DispatchConfirmationPreview {
  const entries = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
    .map((survivor): DispatchConfirmationEntry => {
      const committed = state.dayState.committedSurvivorIds.includes(survivor.id);
      const unavailable = !survivorAvailableForDay(survivor);
      const explicit = state.dayAssignments[survivor.id];
      if (committed) {
        return {
          survivorId: survivor.id,
          name: survivor.name,
          assignment: explicit ?? null,
          label: explicit ? `${ASSIGNMENT_NOTE[explicit]}，已经去过` : '今天已经干过一趟了',
          automatic: false,
          committed: true,
          unavailable: false,
        };
      }
      if (unavailable) {
        return {
          survivorId: survivor.id,
          name: survivor.name,
          assignment: null,
          label: '伤得太重，今天起不了身',
          automatic: false,
          committed: false,
          unavailable: true,
        };
      }
      const assignment: DayAssignment = explicit ?? 'rest';
      return {
        survivorId: survivor.id,
        name: survivor.name,
        assignment,
        label: explicit === 'expedition' && expeditionRouteFor(state, survivor.id)
          ? `去街外：${locationForId(expeditionRouteFor(state, survivor.id) ?? '')?.name ?? '路还没定'}`
          : explicit ? DAY_ASSIGNMENT_LABEL[assignment] : '留在屋里休息',
        automatic: !explicit,
        committed: false,
        unavailable: false,
      };
    });

  return {
    entries,
    manuallyAssigned: entries.filter((entry) => !entry.automatic && !entry.committed && !entry.unavailable).length,
    autoResting: entries.filter((entry) => entry.automatic).length,
    committed: entries.filter((entry) => entry.committed).length,
    expeditionCount: entries.filter((entry) => entry.assignment === 'expedition' && !entry.committed).length,
  };
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
    lastMessage: '人手已经定了。太阳落下以后，就不再换班。',
  };
}

export function lockDayAssignmentsAndRoute(state: GameState): GameState {
  if (state.expeditionState.departed) return { ...state, phase: 'street', lastMessage: '出去的人还没回来。先看看他们那边出了什么事。' };
  const incomplete = incompleteExpeditionSurvivorIds(state);
  if (incomplete.length) return { ...state, lastMessage: '还有人的路没定下来' };
  const queue = buildExpeditionQueue(state);
  if (queue.length > expeditionRouteLimit(state)) return { ...state, lastMessage: `路线屋今天最多记清 ${expeditionRouteLimit(state)} 条路` };
  const locked = lockDayAssignments(state);
  return {
    ...locked,
    phase: queue.length ? 'expedition' : 'dusk',
    dayState: { ...locked.dayState, expeditionQueue: queue },
  };
}

export function hasCommittedDayAction(state: GameState): boolean {
  return state.dayState.returnedExpeditions > 0 || state.dayState.committedSurvivorIds.length > 0;
}

export function reopenDayAssignments(state: GameState): GameState {
  if (hasCommittedDayAction(state)) {
    return {
      ...state,
      phase: 'dusk',
      dayState: { ...state.dayState, assignmentsLocked: true },
      lastMessage: '今天已经有人出过街，写下的安排不能再改。',
    };
  }
  return {
    ...state,
    phase: 'street',
    dayAssignments: { ...state.dayAssignments },
    dayState: { ...state.dayState, assignmentsLocked: false, committedSurvivorIds: [] },
    lastMessage: '天还没黑。现在改主意还来得及。',
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
    dayState: {
      assignmentsLocked: false,
      returnedExpeditions: 0,
      unresolvedExpeditions: [],
      committedSurvivorIds: [],
      expeditionRoutes: {},
      expeditionQueue: [],
    },
  };
}

export type PreparationCoverage = '无人' | '居民协助' | '有人值守';

export interface NightPreparationPreview {
  defense: '薄弱' | '一般' | '良好';
  defenseSource: '无人' | '居民轮值' | '核心值守';
  medical: PreparationCoverage;
  repair: PreparationCoverage;
  radio: '无人' | '有人值守';
  cooks: number;
  expeditions: number;
}

export function previewNightPreparation(state: GameState): NightPreparationPreview {
  const jobs = Object.values(pendingAssignments(state));
  const watch = jobs.filter((job) => job === 'watch').length;
  const community = communitySupportSummary(state);
  const communityDefense = community.supportMode === 'defense' && community.nightRiskReduction > 0;
  const communityRepair = community.supportMode === 'repair' && communityRepairSupport(state) > 0;
  const communityMedical = communityMedicalSupport(state) > 0;
  const defense = watch >= 2 || (watch >= 1 && state.buildings.watchPost >= 2)
    ? '良好'
    : watch >= 1 || communityDefense
      ? '一般'
      : '薄弱';
  return {
    defense,
    defenseSource: watch >= 1 ? '核心值守' : communityDefense ? '居民轮值' : '无人',
    medical: jobs.includes('medical') ? '有人值守' : communityMedical ? '居民协助' : '无人',
    repair: jobs.includes('repair') ? '有人值守' : communityRepair ? '居民协助' : '无人',
    radio: jobs.includes('radio') ? '有人值守' : '无人',
    cooks: jobs.filter((job) => job === 'cook').length,
    expeditions: jobs.filter((job) => job === 'expedition').length,
  };
}
