import type { GameState, Role } from '../types';
import { buildingEventWeightModifier } from './buildingEcology';
import { communitySupportSummary } from './community';
import { previewMeal } from './food';
import { hopeBand } from './mortality';
import type { V060NightEvent } from './nightEvents';
import { pressureBand } from './socialPressure';

const ROLE_ASSIGNMENT: Partial<Record<Role, string>> = {
  search: 'expedition', repair: 'repair', medical: 'medical', watch: 'watch', cook: 'cook', radio: 'radio', rest: 'rest',
};
const clamp = (value: number, min = 1, max = 9) => Math.min(max, Math.max(min, value));

function assignedCount(state: GameState, role: Role): number {
  const assignment = ROLE_ASSIGNMENT[role];
  if (!assignment) return 0;
  return state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing' && state.dayAssignments[survivor.id] === assignment).length;
}

function poorMealForCausalSignal(state: GameState): boolean {
  const preparingTonight = ['street', 'assignment', 'expedition', 'dusk'].includes(state.phase);
  const meal = preparingTonight ? previewMeal(state) : state.mealState;
  return meal.quality === 'cold' || meal.quality === 'struggling' || meal.consecutiveShortageDays >= 2;
}

export function nightCausalSignals(state: GameState): string[] {
  const signals: string[] = [];
  const injured = state.survivors.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const hope = hopeBand(state);
  const pressure = pressureBand(state);
  const community = communitySupportSummary(state);
  const communityDefense = community.supportMode === 'defense' && community.nightRiskReduction > 0;
  const communityRepair = community.supportMode === 'repair' && community.repairDefense > 1;

  if (!assignedCount(state, 'watch')) {
    signals.push(communityDefense
      ? '居民正在守备轮值：能分担巡夜与示警，但仍不如核心人物专职守备稳定'
      : '无人守备：外部威胁与围栏事故更容易出现');
  }
  if (!assignedCount(state, 'repair')) {
    signals.push(communityRepair
      ? '居民正在维修轮值：能处理轻度故障，但复杂设施事故仍缺少核心维修人员'
      : '无人维修：发电机、围栏与建筑故障权重上升');
  }
  if (injured > 0 && !assignedCount(state, 'medical')) signals.push(`有 ${injured} 名伤员且无人医疗：医疗危机更容易在夜里爆发`);
  if (state.inventory.power < 35) signals.push('电力吃紧：断电与设备故障更容易发生');
  if (poorMealForCausalSignal(state)) signals.push('今晚供餐不足：配给争执与低士气事件更容易出现');
  if (hope === 'low' || hope === 'collapse') signals.push('希望低迷：争执、离开与恐慌事件权重上升');
  if (pressure === 'near-breaking') signals.push('街区压力濒临失控：争吵、恐慌和居民事故更容易被放大');
  if (pressure === 'breaking') signals.push('街区压力已经失控：今晚社会危机事件的权重显著上升');
  if (assignedCount(state, 'radio')) signals.push('广播有人值守：远方信号与外界情报更容易出现');
  if (state.storyFlags.includes('generator_backup')) signals.push('加油站带回的备用发电组件：断电类事故权重下降');
  if (state.storyFlags.includes('working_vehicle_parts')) signals.push('修理店带回的完整部件：基础设施事故更容易被街区消化');
  if (state.storyFlags.includes('final_horde_supplies') && state.day >= 24) signals.push('北仓库防护材料已经单独封存：DAY29 最终防守会获得额外准备');
  return signals.slice(0, 6);
}

export function nightEventWeight(state: GameState, event: V060NightEvent): number {
  let weight = 1;
  const watch = assignedCount(state, 'watch');
  const repair = assignedCount(state, 'repair');
  const medical = assignedCount(state, 'medical');
  const radio = assignedCount(state, 'radio');
  const injured = state.survivors.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const hope = hopeBand(state);
  const pressure = pressureBand(state);
  const poorMeal = state.mealState.quality === 'cold' || state.mealState.quality === 'struggling' || state.mealState.consecutiveShortageDays >= 2;
  const community = communitySupportSummary(state);
  const communityDefense = community.supportMode === 'defense' && community.nightRiskReduction > 0;
  const communityRepair = community.supportMode === 'repair' && community.repairDefense > 1;

  if (!watch && event.category === 'threat') weight += communityDefense ? 1 : 2;
  if (!repair && event.category === 'infrastructure') weight += communityRepair ? 1 : 2;
  if (injured > 0 && !medical && event.category === 'survivor') weight += 2;
  if ((hope === 'low' || hope === 'collapse') && event.category === 'survivor') weight += hope === 'collapse' ? 3 : 2;
  if (radio && event.category === 'world') weight += 2;
  if (state.hope >= 60 && event.category === 'quiet') weight += 2;

  if (state.inventory.power < 35 && ['generator-drop', 'clinic-blackout', 'water-on-radio'].includes(event.id)) weight += 3;
  if (!repair && ['generator-drop', 'fence-rattle', 'emergency-building-collapse'].includes(event.id)) weight += communityRepair ? 1 : 2;
  if (!watch && ['gate-knocking', 'east-footsteps', 'stray-dogs', 'emergency-north-breach'].includes(event.id)) weight += communityDefense ? 1 : 2;
  if (poorMeal && ['argument-rations', 'ration-mice'].includes(event.id)) weight += 3;
  if (injured > 0 && !medical && ['fever-resident', 'medicine-count', 'horde-clinic'].includes(event.id)) weight += 3;
  if (state.civilianResidents >= 4 && ['nightmare-child', 'emergency-panic', 'emergency-missing-child'].includes(event.id)) weight += 2;
  if (hope === 'collapse' && ['argument-rations', 'missing-name', 'emergency-panic'].includes(event.id)) weight += 2;
  if (radio && ['water-on-radio'].includes(event.id)) weight += 1;

  const socialCrisis = ['argument-rations', 'missing-name', 'nightmare-child', 'emergency-panic', 'emergency-missing-child'].includes(event.id);
  if (pressure === 'near-breaking' && socialCrisis) weight += 2;
  if (pressure === 'breaking' && socialCrisis) weight += 4;
  if (pressure === 'calm' && (event.category === 'quiet' || event.category === 'world')) weight += 1;

  if (state.storyFlags.includes('generator_backup') && ['generator-drop', 'clinic-blackout', 'water-on-radio'].includes(event.id)) weight -= 2;
  if (state.storyFlags.includes('working_vehicle_parts') && event.category === 'infrastructure') weight -= 1;

  weight += buildingEventWeightModifier(state, event);
  return clamp(weight);
}
