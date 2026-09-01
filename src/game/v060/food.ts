import type { GameState, MealQuality, MealState, Survivor } from '../types';
import { communityCookingSupport } from './community';

const KITCHEN_MODIFIER = [0.8, 1, 1.25, 1.5] as const;

function residentPresent(survivor: Survivor): boolean {
  return survivor.condition !== 'dead' && survivor.condition !== 'missing';
}

export function baseCookingCapacity(survivor: Survivor): number {
  return survivor.id === 'ahe' || survivor.specialty === 'cook' ? 3.5 : 2.5;
}

export function effectiveCookingCapacity(state: GameState, survivor: Survivor): number {
  const level = Math.max(0, Math.min(3, state.buildings.shelter));
  let conditionModifier = 1;
  if (survivor.condition === 'serious') conditionModifier = 0.55;
  else if (survivor.condition === 'minor' || survivor.condition === 'fatigued') conditionModifier = 0.8;
  if (survivor.energy < 30) conditionModifier *= 0.8;
  return baseCookingCapacity(survivor) * KITCHEN_MODIFIER[level] * conditionModifier;
}

function qualityForCoverage(coverage: number): MealQuality {
  if (coverage <= 0) return 'cold';
  if (coverage < 0.6) return 'struggling';
  if (coverage < 1) return 'hot';
  if (coverage < 1.3) return 'full';
  return 'well-fed';
}

const QUALITY: MealQuality[] = ['cold', 'struggling', 'hot', 'full', 'well-fed'];
const qualityRank = (quality: MealQuality) => QUALITY.indexOf(quality);
const qualityFromRank = (rank: number) => QUALITY[Math.max(0, Math.min(4, rank))];

export interface MealPreview extends MealState {
  residentCount: number;
  rationNeeded: number;
  rationConsumed: number;
  rationStretch: number;
  energyRecovery: number;
  hopeDelta: number;
}

function rationStretchFor(state: GameState, cooks: Survivor[], residentCount: number, availableRations: number): number {
  if (!cooks.length || residentCount < 3 || availableRations <= 0) return 0;
  const matureKitchenBonus = state.buildings.shelter >= 3 && residentCount >= 8 ? 1 : 0;
  return Math.min(Math.max(0, residentCount - 1), 1 + matureKitchenBonus);
}

export function previewMeal(state: GameState): MealPreview {
  const coreResidents = state.survivors.filter(residentPresent);
  const residentCount = coreResidents.length + Math.max(0, state.civilianResidents);
  if (residentCount === 0) {
    return {
      quality: 'cold', coverage: 0, cookingCapacity: 0, residentsFed: 0, rationCoverage: 1,
      consecutiveShortageDays: 0, wellFed: false, wellFedPlus: false,
      residentCount: 0, rationNeeded: 0, rationConsumed: 0, rationStretch: 0, energyRecovery: 0, hopeDelta: 0,
    };
  }

  const cooks = coreResidents.filter((survivor) => state.dayAssignments[survivor.id] === 'cook');
  const coreCookingCapacity = cooks.reduce((sum, survivor) => sum + effectiveCookingCapacity(state, survivor), 0);
  const cookingCapacity = coreCookingCapacity + communityCookingSupport(state);
  const cookingCoverage = cookingCapacity / residentCount;
  const availableRations = Math.max(0, state.inventory.ration);
  const rationStretch = rationStretchFor(state, cooks, residentCount, availableRations);
  const rationNeeded = Math.max(0, residentCount - rationStretch);
  const effectiveRationSupply = availableRations + Math.min(rationStretch, availableRations);
  const rationCoverage = Math.min(1, effectiveRationSupply / residentCount);
  const rationConsumed = Math.min(rationNeeded, availableRations);

  const cookingQuality = qualityForCoverage(cookingCoverage);
  const foodQuality = qualityForCoverage(rationCoverage);
  const quality = qualityFromRank(Math.min(qualityRank(cookingQuality), qualityRank(foodQuality)));

  let energyRecovery = 4;
  let hopeDelta = 0;
  if (quality === 'struggling') { energyRecovery = 8; hopeDelta = -1; }
  if (quality === 'hot') { energyRecovery = 11; hopeDelta = 0; }
  if (quality === 'full') { energyRecovery = 15; hopeDelta = 1; }
  if (quality === 'well-fed') { energyRecovery = 19; hopeDelta = 2; }

  const shortage = quality === 'cold' || quality === 'struggling';
  const consecutiveShortageDays = shortage ? state.mealState.consecutiveShortageDays + 1 : 0;
  if (quality === 'cold') hopeDelta = consecutiveShortageDays <= 1 ? 0 : consecutiveShortageDays === 2 ? -1 : -2;

  return {
    quality,
    coverage: Math.min(cookingCoverage, rationCoverage),
    cookingCapacity,
    residentsFed: Math.min(residentCount, Math.floor(Math.min(cookingCapacity, effectiveRationSupply))),
    rationCoverage,
    consecutiveShortageDays,
    wellFed: quality === 'full' || quality === 'well-fed',
    wellFedPlus: quality === 'well-fed',
    residentCount,
    rationNeeded,
    rationConsumed,
    rationStretch,
    energyRecovery,
    hopeDelta,
  };
}

export function resolveMeal(state: GameState): GameState {
  const preview = previewMeal(state);
  const survivors = state.survivors.map((survivor) => {
    if (!residentPresent(survivor)) return survivor;
    const energy = Math.min(100, survivor.energy + preview.energyRecovery);
    let condition = survivor.condition;
    if (preview.wellFedPlus && condition === 'fatigued' && energy >= 55) condition = 'healthy';
    return { ...survivor, energy, condition };
  });
  const mealState: MealState = {
    quality: preview.quality, coverage: preview.coverage, cookingCapacity: preview.cookingCapacity,
    residentsFed: preview.residentsFed, rationCoverage: preview.rationCoverage,
    consecutiveShortageDays: preview.consecutiveShortageDays, wellFed: preview.wellFed, wellFedPlus: preview.wellFedPlus,
  };
  return {
    ...state,
    inventory: { ...state.inventory, ration: Math.max(0, state.inventory.ration - preview.rationConsumed) },
    hope: Math.max(0, Math.min(100, state.hope + preview.hopeDelta)),
    survivors,
    mealState,
    lastMessage: `今晚供餐：${mealLabel(preview.quality)} · 精力 +${preview.energyRecovery}${preview.hopeDelta ? ` · 希望 ${preview.hopeDelta > 0 ? '+' : ''}${preview.hopeDelta}` : ''}`,
  };
}

export function mealLabel(quality: MealQuality): string {
  return { cold: '冷食', struggling: '勉强开伙', hot: '普通热食', full: '饱腹', 'well-fed': '充分饱腹' }[quality];
}
