import { createV060InitialState } from '../../src/game/v060/campaign';
import {
  communityCookingSupport,
  communityDefenseSupport,
  communityMedicalSupport,
  communityRepairSupport,
} from '../../src/game/v060/community';
import { previewMeal } from '../../src/game/v060/food';
import { createDefaultSocialState } from '../../src/game/v060/socialPressure';
import type { CommunitySupportMode, GameState, StreetPrincipleId } from '../../src/game/types';

export interface CommunityStressRow {
  source: 'counterfactual';
  scenario: string;
  residentPopulation: number;
  supportMode: CommunitySupportMode;
  shelterLevel: number;
  workshopLevel: number;
  clinicLevel: number;
  watchPostLevel: number;
  marginalCost: number;
  cookingCapacity: number;
  repairSupport: number;
  medicalSupport: number;
  defenseRiskReduction: number;
  communityLabor: number;
  communityContribution: number;
  marginalLaborContribution: number;
  marginalResourceProduction: number;
  rationNeeded: number;
  rationCoverage: number;
}

interface Scenario {
  id: string;
  buildings: Pick<GameState['buildings'], 'shelter' | 'workshop' | 'clinic' | 'watchPost'>;
  principles: StreetPrincipleId[];
}

const SCENARIOS: Scenario[] = [
  { id: 'low-infrastructure', buildings: { shelter: 1, workshop: 1, clinic: 1, watchPost: 1 }, principles: [] },
  { id: 'mature-infrastructure', buildings: { shelter: 3, workshop: 3, clinic: 3, watchPost: 3 }, principles: [] },
  { id: 'mature-principle-synergy', buildings: { shelter: 3, workshop: 3, clinic: 3, watchPost: 3 }, principles: ['everyone-shares', 'community-shares-risk'] },
];

function stateFor(residents: number, scenario: Scenario, supportMode: CommunitySupportMode): GameState {
  const base = createV060InitialState(606060 + residents);
  const social = createDefaultSocialState();
  return {
    ...base,
    day: 20,
    civilianResidents: residents,
    communityState: { pendingResidents: 0, activeResidents: residents, supportMode, lastSupportDay: 20 },
    socialState: { ...social, principles: scenario.principles },
    storyFlags: [...base.storyFlags, ...(residents >= 5 ? ['community_rotation_unlocked'] : [])],
    buildings: {
      ...base.buildings,
      shelter: scenario.buildings.shelter,
      workshop: scenario.buildings.workshop,
      clinic: scenario.buildings.clinic,
      watchPost: scenario.buildings.watchPost,
    },
    inventory: { ...base.inventory, ration: 999 },
  };
}

function laborEquivalent(state: GameState): { labor: number; contribution: number; repair: number } {
  const cooking = communityCookingSupport(state);
  const repair = communityRepairSupport(state);
  const medical = communityMedicalSupport(state);
  const defense = communityDefenseSupport(state);
  return {
    labor: cooking / 2.5 + repair / 2 + medical + defense / 0.04,
    contribution: cooking + repair + medical * 2 + defense * 25,
    repair,
  };
}

export function buildCommunityStressRows(): CommunityStressRow[] {
  const rows: CommunityStressRow[] = [];
  for (const scenario of SCENARIOS) {
    for (const supportMode of ['logistics', 'repair', 'defense'] as const) {
      let previousLabor = 0;
      let previousRepair = 0;
      for (let residents = 0; residents <= 30; residents += 1) {
        const state = stateFor(residents, scenario, supportMode);
        const meal = previewMeal(state);
        const cookingCapacity = communityCookingSupport(state);
        const repairSupport = communityRepairSupport(state);
        const medicalSupport = communityMedicalSupport(state);
        const defenseRiskReduction = communityDefenseSupport(state);
        const equivalent = laborEquivalent(state);
        rows.push({
          source: 'counterfactual',
          scenario: scenario.id,
          residentPopulation: residents,
          supportMode,
          shelterLevel: scenario.buildings.shelter,
          workshopLevel: scenario.buildings.workshop,
          clinicLevel: scenario.buildings.clinic,
          watchPostLevel: scenario.buildings.watchPost,
          marginalCost: residents === 0 ? 0 : 1,
          cookingCapacity,
          repairSupport,
          medicalSupport,
          defenseRiskReduction,
          communityLabor: equivalent.labor,
          communityContribution: equivalent.contribution,
          marginalLaborContribution: residents === 0 ? 0 : equivalent.labor - previousLabor,
          marginalResourceProduction: residents === 0 ? 0 : repairSupport - previousRepair,
          rationNeeded: meal.rationNeeded,
          rationCoverage: meal.rationCoverage,
        });
        previousLabor = equivalent.labor;
        previousRepair = repairSupport;
      }
    }
  }
  return rows;
}
