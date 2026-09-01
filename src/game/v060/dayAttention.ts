import type { BuildingId, GameState } from '../types';
import { activeMentalState } from './characterPsychology';
import { canUpgradeBuilding } from './buildings';
import { communitySupportSummary } from './community';
import { activePromiseSummary, pendingCommunityRequest } from './communityPromises';
import { pendingPrincipleDecision } from './principles';

const BUILDING_IDS: BuildingId[] = ['searchStation', 'workshop', 'clinic', 'watchPost', 'shelter', 'radio'];

export interface DayAttentionSummary {
  missingCount: number;
  criticalCount: number;
  socialNeedsAttention: boolean;
  communityNeedsChoice: boolean;
  buildableCount: number;
}

export function dayAttentionSummary(state: GameState): DayAttentionSummary {
  const missingCount = state.survivors.filter((survivor) => survivor.condition === 'missing').length;
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
