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
      ? '今晚没有熟手专门守街口，不过居民已经排了轮值。至少每个路口都还有人看着。'
      : '街口今晚没有专人盯着。门外真有东西靠近，可能要等撞上铁皮才会被听见。');
  }
  if (!assignedCount(state, 'repair')) {
    signals.push(communityRepair
      ? '修车铺今晚没有熟手留下，不过有人会帮着递工具、堵小缝。真坏了大件，还是得临时想办法。'
      : '修车铺今晚是空的。发电机、围栏或者哪扇门真坏了，只能到时候再找人。');
  }
  if (injured > 0 && !assignedCount(state, 'medical')) signals.push(`诊所里还有 ${injured} 个伤员，今晚却没人专门守着他们。`);
  if (state.inventory.power < 35) signals.push('电已经不宽裕了。几盏灯被提前关掉，发电机的声音也开始时断时续。');
  if (poorMealForCausalSignal(state)) signals.push('今晚锅里的东西不太够。有人盛完饭以后，又把自己的碗往回倒了一点。');
  if (hope === 'low' || hope === 'collapse') signals.push('这两天很少有人谈明天。有人收拾东西时，已经开始把最重要的几件单独装进包里。');
  if (pressure === 'near-breaking') signals.push('说话的声音越来越短。饭馆和宿营屋里，已经有几次争执差一点没收住。');
  if (pressure === 'breaking') signals.push('街里现在一点火星都可能点着。几个人已经不愿意再待在同一张桌子边。');
  if (assignedCount(state, 'radio')) signals.push('广播亭今晚有人守着。天线没收，收音机里的杂音也一直没有关。');
  if (state.storyFlags.includes('generator_backup')) signals.push('从加油站拖回来的备用发电组件已经放在机器旁边。真断电时，至少还有东西能换。');
  if (state.storyFlags.includes('working_vehicle_parts')) signals.push('修理店带回来的完整部件还收在工坊里。今晚真有东西坏掉，不至于只能拆东墙补西墙。');
  if (state.storyFlags.includes('final_horde_supplies') && state.day >= 24) signals.push('北仓库带回来的防护材料一直单独堆着。没人动那一摞东西，大家都知道它是在等哪一晚。');
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