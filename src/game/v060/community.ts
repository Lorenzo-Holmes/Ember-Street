import type { CommunityState, CommunitySupportMode, GameState } from '../types';

const SUPPORT_UNLOCK_COUNT = 5;
const COOKING_PER_PAIR = [0.4, 0.5, 0.8, 1] as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

const MILESTONES = [
  { count: 2, flag: 'community_milestone_2', hope: 1 },
  { count: 5, flag: 'community_milestone_5', hope: 1 },
  { count: 8, flag: 'community_milestone_8', hope: 1 },
  { count: 10, flag: 'community_milestone_10', hope: 1 },
] as const;

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
  };
}

export function advanceCommunityDay(state: GameState): GameState {
  const community = normalized(state);
  const activeResidents = community.activeResidents + community.pendingResidents;
  let hope = state.hope;
  const flags = new Set(state.storyFlags);
  let dutyRosterUnlocked = false;

  for (const milestone of MILESTONES) {
    if (activeResidents < milestone.count || flags.has(milestone.flag)) continue;
    flags.add(milestone.flag);
    hope = clamp(hope + milestone.hope, 0, 100);
    if (milestone.count === SUPPORT_UNLOCK_COUNT) {
      flags.add('community_rotation_unlocked');
      flags.add('community_event_duty_roster');
      dutyRosterUnlocked = true;
    }
  }

  return {
    ...state,
    hope,
    storyFlags: [...flags],
    communityState: { pendingResidents: 0, activeResidents, supportMode: null },
    lastMessage: dutyRosterUnlocked
      ? '《值班表》：有人把一张纸钉在宿营屋门口。上面第一次不只有那几个核心幸存者的名字。居民轮值已解锁。'
      : state.lastMessage,
  };
}

export function communitySupportUnlocked(state: GameState): boolean {
  return normalized(state).activeResidents >= SUPPORT_UNLOCK_COUNT || state.storyFlags.includes('community_rotation_unlocked');
}

export function selectCommunitySupportMode(state: GameState, supportMode: CommunitySupportMode): GameState {
  const community = normalized(state);
  if (community.activeResidents < SUPPORT_UNLOCK_COUNT) return { ...state, communityState: community, lastMessage: '至少需要 5 名已安置居民才能组织居民轮值。' };
  return {
    ...state,
    storyFlags: [...new Set([...state.storyFlags, 'community_rotation_unlocked'])],
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
  return clamp(pairs * COOKING_PER_PAIR[shelter] * focused, 0, 8);
}

export function communityRepairSupport(state: GameState): number {
  const community = normalized(state);
  if (community.activeResidents < 3) return 0;
  const base = 1;
  if (!modeActive(state, 'repair')) return base;
  const extra = clamp(Math.floor(community.activeResidents / 2), 2, 5);
  const workshop = clamp(Math.floor(state.buildings.workshop), 0, 3);
  const multiplier = workshop >= 3 ? 1.4 : workshop >= 2 ? 1.2 : 1;
  return clamp(Math.round((base + extra) * multiplier), 0, 6);
}

export function communityDefenseSupport(state: GameState): number {
  const community = normalized(state);
  const groups = Math.floor(community.activeResidents / 3);
  if (!groups) return 0;
  const baseReduction = groups * 0.01;
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
