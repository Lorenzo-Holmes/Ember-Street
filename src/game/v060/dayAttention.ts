import type { BuildingId, GameState } from '../types';
import { activeMentalState } from './characterPsychology';
import { canUpgradeBuilding } from './buildings';
import { communitySupportSummary } from './community';
import { activePromiseSummary, pendingCommunityRequest } from './communityPromises';
import { pendingPrincipleDecision } from './principles';

const BUILDING_IDS: BuildingId[] = ['searchStation', 'workshop', 'clinic', 'watchPost', 'shelter', 'radio'];
const missingAttentionFlag = (day: number) => `missing_attention_ack:${day}`;

export interface DayAttentionSummary {
  /** Missing people that still require the forced morning attention screen today. */
  missingCount: number;
  criticalCount: number;
  socialNeedsAttention: boolean;
  communityNeedsChoice: boolean;
  buildableCount: number;
}

export function acknowledgeMissingAttention(state: GameState): GameState {
  const flag = missingAttentionFlag(state.day);
  if (state.storyFlags.includes(flag)) return state;
  return {
    ...state,
    storyFlags: [...state.storyFlags, flag],
    lastMessage: '今天先把剩下的人手安排好。没回来的人，明天还能继续找。',
  };
}

export function dayAttentionSummary(state: GameState): DayAttentionSummary {
  const missingTotal = state.survivors.filter((survivor) => survivor.condition === 'missing').length;
  const missingCount = state.storyFlags.includes(missingAttentionFlag(state.day)) ? 0 : missingTotal;
  const criticalCount = state.survivors.filter((survivor) => survivor.condition === 'critical').length;
  const hasMentalConcern = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
    .some((survivor) => activeMentalState(state, survivor) !== 'steady');
  const socialNeedsAttention = Boolean(
    pendingPrincipleDecision(state)
    || activePromiseSummary(state)
    || pendingCommunityRequest(state)
    || hasMentalConcern,
  );

  const community = communitySupportSummary(state);
  const communityNeedsChoice = Boolean(
    state.civilianResidents > 0
    && community.unlocked
    && !community.supportMode
    && !state.dayState.assignmentsLocked,
  );

  const buildableCount = state.dayState.assignmentsLocked
    ? 0
    : BUILDING_IDS.filter((id) => canUpgradeBuilding(state, id).allowed).length;

  return {
    missingCount,
    criticalCount,
    socialNeedsAttention,
    communityNeedsChoice,
    buildableCount,
  };
}
