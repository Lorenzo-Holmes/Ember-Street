import { nextRandom } from '../rng';
import type { GameState } from '../types';
import { normalizeCommunityState } from './community';
import { adjustPressure, socialStateOf } from './socialPressure';

export type CommunityDepartureReason = 'hope' | 'food' | 'pressure' | 'defense';
export type CommunityDepartureResolution = 'leave' | 'ration';

export interface PendingCommunityDeparture {
  day: number;
  count: number;
  reason: CommunityDepartureReason;
  rationCost: number;
  title: string;
  body: string;
}

const PENDING_PREFIX = 'community_departure_pending:';
const CHECKED_PREFIX = 'community_departure_checked:';
const clampHope = (value: number) => Math.max(0, Math.min(100, value));

const checkedFlag = (day: number) => `${CHECKED_PREFIX}${day}`;
const pendingFlag = (day: number, count: number, reason: CommunityDepartureReason) => `${PENDING_PREFIX}${day}:${count}:${reason}`;

function parsePending(flag: string): PendingCommunityDeparture | null {
  if (!flag.startsWith(PENDING_PREFIX)) return null;
  const [dayRaw, countRaw, reasonRaw] = flag.slice(PENDING_PREFIX.length).split(':');
  const day = Math.max(0, Math.floor(Number(dayRaw) || 0));
  const count = Math.max(1, Math.floor(Number(countRaw) || 1));
  const reason = reasonRaw as CommunityDepartureReason;
  if (!['hope', 'food', 'pressure', 'defense'].includes(reason)) return null;
  return {
    day,
    count,
    reason,
    rationCost: Math.max(2, count * 2),
    title: departureTitle(reason),
    body: departureBody(reason, count),
  };
}

function departureTitle(reason: CommunityDepartureReason): string {
  if (reason === 'food') return '有人把毯子卷起来了';
  if (reason === 'hope') return '有人开始收拾自己的东西';
  if (reason === 'pressure') return '街里有人不想再等下去';
  return '有人觉得这里已经守不住了';
}

function departureBody(reason: CommunityDepartureReason, count: number): string {
  const who = count === 1 ? '一个人' : `${count}个人`;
  if (reason === 'food') return `连续几天没吃饱以后，${who}把包放到了门边。“趁路还能走，我们想试试别的地方。”`;
  if (reason === 'hope') return `天刚亮，${who}已经把能带走的东西收好了。这里最近没有什么还能让他们相信明天会更好。`;
  if (reason === 'pressure') return `昨晚的争执没有真正结束。${who}说再这样下去，留在街里也只是等下一次出事。`;
  return `门板和围栏越来越薄。${who}不想等到下一次动静真的冲进来以后才后悔。`;
}

function primaryReason(state: GameState): CommunityDepartureReason {
  const pressure = socialStateOf(state).pressure;
  const shortageDays = state.mealState.consecutiveShortageDays;
  if (shortageDays >= 3) return 'food';
  if (state.hope <= 12) return 'hope';
  if (pressure >= 6) return 'pressure';
  if (state.defense < 30) return 'defense';
  if (shortageDays >= 2) return 'food';
  if (state.hope <= 24) return 'hope';
  if (pressure >= 4) return 'pressure';
  return 'defense';
}

export function communityDepartureRisk(state: GameState): number {
  let risk = 0;
  if (state.hope <= 12) risk += 2;
  else if (state.hope <= 24) risk += 1;

  if (state.mealState.consecutiveShortageDays >= 2) risk += 1;
  if (state.mealState.consecutiveShortageDays >= 3) risk += 1;

  const pressure = socialStateOf(state).pressure;
  if (pressure >= 6) risk += 2;
  else if (pressure >= 4) risk += 1;

  if (state.defense < 30) risk += 1;
  return risk;
}

export function communityDepartureChance(risk: number): number {
  if (risk < 2) return 0;
  if (risk === 2) return 0.15;
  if (risk === 3) return 0.30;
  if (risk === 4) return 0.50;
  return 0.70;
}

export function pendingCommunityDeparture(state: GameState): PendingCommunityDeparture | null {
  const flag = state.storyFlags.find((value) => value.startsWith(PENDING_PREFIX));
  return flag ? parsePending(flag) : null;
}

export function queueCommunityDeparture(input: GameState): GameState {
  if (input.day < 6 || input.civilianResidents <= 0) return input;
  if (pendingCommunityDeparture(input) || input.storyFlags.includes(checkedFlag(input.day))) return input;

  const risk = communityDepartureRisk(input);
  const flags = new Set(input.storyFlags);
  flags.add(checkedFlag(input.day));
  if (risk < 2) return { ...input, storyFlags: [...flags] };

  const [roll, rngState] = nextRandom(input.rngState);
  if (roll >= communityDepartureChance(risk)) return { ...input, rngState, storyFlags: [...flags] };

  const count = risk >= 5 && input.civilianResidents >= 6 ? 2 : 1;
  const reason = primaryReason(input);
  flags.add(pendingFlag(input.day, count, reason));
  const pending = parsePending(pendingFlag(input.day, count, reason))!;
  return {
    ...input,
    rngState,
    storyFlags: [...flags],
    lastMessage: `${pending.title}。${pending.body}`,
  };
}

function removeResidents(state: GameState, count: number): GameState {
  const loss = Math.min(state.civilianResidents, Math.max(0, Math.floor(count)));
  if (!loss) return state;
  const community = normalizeCommunityState(state.communityState, state.civilianResidents);
  const pendingLoss = Math.min(community.pendingResidents, loss);
  const activeLoss = Math.min(community.activeResidents, loss - pendingLoss);
  const activeResidents = Math.max(0, community.activeResidents - activeLoss);
  const pendingResidents = Math.max(0, community.pendingResidents - pendingLoss);
  return {
    ...state,
    civilianResidents: state.civilianResidents - loss,
    communityState: {
      ...community,
      activeResidents,
      pendingResidents,
      supportMode: activeResidents >= 5 ? community.supportMode : null,
    },
  };
}

function withoutPendingFlag(state: GameState): string[] {
  return state.storyFlags.filter((flag) => !flag.startsWith(PENDING_PREFIX));
}

function appendBrief(state: GameState, entry: string): GameState {
  return { ...state, dawnBrief: [...(state.dawnBrief ?? []), entry].slice(-8) };
}

export function resolveCommunityDeparture(state: GameState, resolution: CommunityDepartureResolution): GameState {
  const pending = pendingCommunityDeparture(state);
  if (!pending) return state;

  if (resolution === 'ration') {
    if (state.inventory.ration < pending.rationCost) {
      return { ...state, lastMessage: `口粮不够。至少还需要 ${pending.rationCost} 份，才能让他们愿意再等一等。` };
    }
    const flags = [...new Set([
      ...withoutPendingFlag(state),
      `community_departure_resolved:${state.day}:ration`,
      `community_departure_stayed:${state.day}:${pending.count}:${pending.reason}`,
    ])];
    const reassured = adjustPressure({
      ...state,
      inventory: { ...state.inventory, ration: state.inventory.ration - pending.rationCost },
      hope: clampHope(state.hope + 1),
      storyFlags: flags,
    }, -1, 'community-departure-reassured');
    const entry = `第 ${state.day} 天：${pending.count} 名街区居民暂时留下。支出 ${pending.rationCost} 份口粮。`;
    return appendBrief({ ...reassured, lastMessage: entry }, entry);
  }

  const reduced = removeResidents(state, pending.count);
  const flags = [...new Set([
    ...withoutPendingFlag(reduced),
    `community_departure_resolved:${state.day}:leave`,
    `civilian_departure:${state.day}:${pending.reason}:${pending.count}`,
  ])];
  const departed = adjustPressure({
    ...reduced,
    hope: clampHope(reduced.hope - 1),
    campaignStats: {
      ...reduced.campaignStats,
      civilianDepartures: reduced.campaignStats.civilianDepartures + pending.count,
    },
    storyFlags: flags,
  }, 1, 'community-departure');
  const entry = `第 ${state.day} 天：${pending.count} 名街区居民离开。街区可用人手减少。`;
  return appendBrief({ ...departed, lastMessage: entry }, entry);
}
