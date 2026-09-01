import type { CommunityState, CommunitySupportMode, GameState } from '../types';

const SUPPORT_UNLOCK_COUNT = 5;
const COOKING_PER_PAIR = [0.4, 0.5, 0.8, 1] as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const hasPrinciple = (state: GameState, id: string) => Boolean(state.socialState?.principles?.includes(id as never));

const MILESTONES = [
  { count: 2, flag: 'community_milestone_2', hope: 1 },
  { count: 5, flag: 'community_milestone_5', hope: 1 },
  { count: 8, flag: 'community_milestone_8', hope: 1 },
  { count: 10, flag: 'community_milestone_10', hope: 1 },
] as const;

export const communityEventPendingFlag = (milestone: number) => `community_event_pending:${milestone}`;

export function createDefaultCommunityState(activeResidents = 0): CommunityState {
  return { pendingResidents: 0, activeResidents: count(activeResidents), supportMode: null };
}

export function normalizeCommunityState(value: unknown, civilianResidents = 0): CommunityState {
  const total = count(civilianResidents);
  const hasStoredState = Boolean(value && typeof value === 'object');
  const source = hasStoredState ? value as Partial<CommunityState> : {};
  const pendingResidents = hasStoredState ? Math.min(total, count(source.pendingResidents)) : 0;
  const activeResidents = hasStoredState ? Math.min(total - pendingResidents, count(source.activeResidents)) : total;
  const supportMode = source.supportMode === 'logistics' || source.supportMode === 'repair' || source.supportMode === 'defense' ? source.supportMode : null;
  const lastSupportDay = Number.isFinite(Number(source.lastSupportDay)) ? count(source.lastSupportDay) : undefined;
  return { pendingResidents, activeResidents, supportMode, ...(lastSupportDay ? { lastSupportDay } : {}) };
}

function normalized(state: GameState): CommunityState {
  return normalizeCommunityState(state.communityState, state.civilianResidents);
}

function modeActive(state: GameState, mode: CommunitySupportMode): boolean {
  const community = normalized(state);
  return community.supportMode === mode && community.lastSupportDay === state.day;
}

export function rescueCommunityResidents(state: GameState, rescued = 1, hopePerRescue = 1): GameState {
  const amount = count(rescued);
  if (!amount) return state;
  const community = normalized(state);
  const hopeGain = Math.min(2, amount * Math.max(0, hopePerRescue));
  return {
    ...state,
    civilianResidents: state.civilianResidents + amount,
    communityState: { ...community, pendingResidents: community.pendingResidents + amount },
    hope: clamp(state.hope + hopeGain, 0, 100),
    lastMessage: `${amount} 名居民被带回街区。今天先安置，明天开始参与社区劳动。`,
  };
}

export function advanceCommunityDay(state: GameState): GameState {
  const community = normalized(state);
  const activeResidents = community.activeResidents + community.pendingResidents;
  let hope = state.hope;
  const flags = new Set(state.storyFlags);
  let newestMilestone: number | null = null;

  for (const milestone of MILESTONES) {
    if (activeResidents < milestone.count || flags.has(milestone.flag)) continue;
    flags.add(milestone.flag);
    flags.add(communityEventPendingFlag(milestone.count));
    hope = clamp(hope + milestone.hope, 0, 100);
    newestMilestone = milestone.count;
  }

  return {
    ...state,
    hope,
    storyFlags: [...flags],
    communityState: { pendingResidents: 0, activeResidents, supportMode: null },
    lastMessage: newestMilestone
      ? `街区已有 ${activeResidents} 名已安置居民 · 新的社区成长事件等待确认。`
      : state.lastMessage,
  };
}

export function communitySupportUnlocked(state: GameState): boolean {
  return state.storyFlags.includes('community_rotation_unlocked');
}

export function selectCommunitySupportMode(state: GameState, supportMode: CommunitySupportMode): GameState {
  const community = normalized(state);
  if (!communitySupportUnlocked(state) || community.activeResidents < SUPPORT_UNLOCK_COUNT) {
    return { ...state, communityState: community, lastMessage: '先完成 5 人社区事件《值班表》，才能组织居民轮值。' };
  }
  if (state.dayState.assignmentsLocked) return { ...state, lastMessage: '今日派遣已经锁定，居民轮值也不能再调整。' };
  return {
    ...state,
    communityState: { ...community, supportMode, lastSupportDay: state.day },
    lastMessage: `今日居民轮值：${supportMode === 'logistics' ? '后勤' : supportMode === 'repair' ? '维修' : '守备'}。`,
  };
}

export function communityCookingSupport(state: GameState): number {
  const community = normalized(state);
  const pairs = Math.floor(community.activeResidents / 2);
  if (!pairs) return 0;
  const shelter = clamp(Math.floor(state.buildings.shelter), 0, 3);
  const focused = modeActive(state, 'logistics') ? 1.5 : 1;
  const principle = hasPrinciple(state, 'everyone-shares') ? 1.15 : 1;
  return clamp(pairs * COOKING_PER_PAIR[shelter] * focused * principle, 0, 8);
}

export function communityRepairSupport(state: GameState): number {
  const community = normalized(state);
  if (community.activeResidents < 3) return 0;
  const base = 1;
  const principleBonus = hasPrinciple(state, 'community-shares-risk') ? 1 : 0;
  if (!modeActive(state, 'repair')) return clamp(base + principleBonus, 0, 6);
  const extra = clamp(Math.floor(community.activeResidents / 2), 2, 5);
  const workshop = clamp(Math.floor(state.buildings.workshop), 0, 3);
  const multiplier = workshop >= 3 ? 1.4 : workshop >= 2 ? 1.2 : 1;
  return clamp(Math.round((base + extra) * multiplier) + principleBonus, 0, 6);
}

export function communityDefenseSupport(state: GameState): number {
  const community = normalized(state);
  const groups = Math.floor(community.activeResidents / 3);
  if (!groups) return 0;
  const principleBonus = hasPrinciple(state, 'community-shares-risk') ? 0.02 : 0;
  const baseReduction = groups * 0.01 + principleBonus;
  if (!modeActive(state, 'defense')) return clamp(baseReduction, 0, 0.12);
  const watchPost = clamp(Math.floor(state.buildings.watchPost), 0, 3);
  const multiplier = watchPost >= 3 ? 1.5 : watchPost >= 2 ? 1.25 : 1;
  return clamp(baseReduction + groups * 0.012 * multiplier, 0, 0.12);
}

export function communityMedicalSupport(state: GameState): number {
  const community = normalized(state);
  if (state.buildings.clinic < 2 || community.activeResidents < 4) return 0;
  return state.buildings.clinic >= 3 && community.activeResidents >= 8 ? 2 : 1;
}

export interface CommunitySupportSummary {
  activeResidents: number;
  pendingResidents: number;
  supportMode: CommunitySupportMode | null;
  supportModeLabel: string;
  unlocked: boolean;
  cookingCapacity: number;
  repairDefense: number;
  nightRiskReduction: number;
  medicalAssist: number;
}

export function communitySupportSummary(state: GameState): CommunitySupportSummary {
  const community = normalized(state);
  const supportModeLabel = community.supportMode === 'logistics' && community.lastSupportDay === state.day
    ? '后勤'
    : community.supportMode === 'repair' && community.lastSupportDay === state.day
      ? '维修'
      : community.supportMode === 'defense' && community.lastSupportDay === state.day
        ? '守备'
        : '未选择';
  return {
    activeResidents: community.activeResidents,
    pendingResidents: community.pendingResidents,
    supportMode: community.lastSupportDay === state.day ? community.supportMode : null,
    supportModeLabel,
    unlocked: communitySupportUnlocked(state),
    cookingCapacity: communityCookingSupport(state),
    repairDefense: communityRepairSupport(state),
    nightRiskReduction: communityDefenseSupport(state),
    medicalAssist: communityMedicalSupport(state),
  };
}
