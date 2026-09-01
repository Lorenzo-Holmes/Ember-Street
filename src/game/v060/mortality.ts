import { nextRandom } from '../rng';
import type { GameState } from '../types';
import { normalizeCommunityState } from './community';
import { adjustPressure } from './socialPressure';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

export const medicalCrisisFlag = (survivorId: string) => `medical_crisis_pending:${survivorId}`;
export const lowHopeDepartureFlag = (survivorId: string) => `low_hope_departure_pending:${survivorId}`;
const LOW_HOPE_PREFIX = 'low_hope_departure_pending:';

export type HopeBand = 'stable' | 'tense' | 'low' | 'collapse';

export function hopeBand(state: Pick<GameState, 'hope'>): HopeBand {
  if (state.hope >= 60) return 'stable';
  if (state.hope >= 30) return 'tense';
  if (state.hope >= 13) return 'low';
  return 'collapse';
}

export function pendingLowHopeDepartureId(state: GameState): string | null {
  const flag = state.storyFlags.find((value) => value.startsWith(LOW_HOPE_PREFIX));
  return flag ? flag.slice(LOW_HOPE_PREFIX.length) : null;
}

export function advanceUntreatedRisk(state: GameState): GameState {
  const countedFlag = `untreated_risk_counted:${state.day}`;
  if (state.storyFlags.includes(countedFlag)) return state;
  const flags = new Set(state.storyFlags);
  flags.add(countedFlag);
  const survivors = state.survivors.map((survivor) => {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') return { ...survivor, untreatedDays: 0 };
    if (survivor.condition !== 'serious' && survivor.condition !== 'critical') {
      flags.delete(medicalCrisisFlag(survivor.id));
      return { ...survivor, untreatedDays: 0 };
    }
    const untreatedDays = Math.max(0, survivor.untreatedDays ?? 0) + 1;
    const threshold = survivor.condition === 'critical' ? 1 : 2;
    if (untreatedDays >= threshold && state.day >= 6) flags.add(medicalCrisisFlag(survivor.id));
    return { ...survivor, untreatedDays };
  });
  return { ...state, survivors, storyFlags: [...flags] };
}

export function clearUntreatedRisk(state: GameState, survivorIds: Iterable<string>): GameState {
  const ids = new Set(survivorIds);
  if (!ids.size) return state;
  const flags = new Set(state.storyFlags);
  for (const id of ids) flags.delete(medicalCrisisFlag(id));
  return {
    ...state,
    storyFlags: [...flags],
    survivors: state.survivors.map((survivor) => ids.has(survivor.id) ? { ...survivor, untreatedDays: 0 } : survivor),
  };
}

export function deferMedicalCrisis(state: GameState, survivorId: string): GameState {
  const flags = new Set(state.storyFlags);
  flags.delete(medicalCrisisFlag(survivorId));
  flags.add(`medical_isolated:${survivorId}:${state.day}`);
  return {
    ...state,
    storyFlags: [...flags],
    survivors: state.survivors.map((survivor) => survivor.id === survivorId
      ? { ...survivor, untreatedDays: Math.max(0, (survivor.untreatedDays ?? 1) - 1) }
      : survivor),
    hope: clamp(state.hope - 1),
  };
}

export function queueLowHopeDeparture(input: GameState): GameState {
  let state = input;
  const existing = pendingLowHopeDepartureId(state);
  if (existing && state.storyFlags.some((flag) => flag.startsWith('low_hope_departure_resolved:'))) {
    state = clearLowHopeDeparture(state, existing);
  }
  if (state.day < 6 || state.hope > 12 || pendingLowHopeDepartureId(state)) return state;
  const checkedFlag = `low_hope_departure_checked:${state.day}`;
  if (state.storyFlags.includes(checkedFlag)) return state;

  const candidates = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && survivor.condition !== 'serious')
    .sort((a, b) => (a.trust ?? 0) - (b.trust ?? 0));
  let rngState = state.rngState;
  const [triggerRoll, afterTrigger] = nextRandom(rngState); rngState = afterTrigger;
  const flags = new Set(state.storyFlags);
  flags.add(checkedFlag);
  if (!candidates.length) return { ...state, rngState, storyFlags: [...flags] };

  const chance = clamp(0.12 + Math.max(0, 12 - state.hope) * 0.05, 0.12, 0.72);
  if (triggerRoll >= chance) return { ...state, rngState, storyFlags: [...flags] };

  const lowestTrust = candidates[0].trust ?? 0;
  const vulnerable = candidates.filter((survivor) => (survivor.trust ?? 0) <= lowestTrust + 1);
  const [pickRoll, afterPick] = nextRandom(rngState); rngState = afterPick;
  const target = vulnerable[Math.min(vulnerable.length - 1, Math.floor(pickRoll * vulnerable.length))];
  flags.add(lowHopeDepartureFlag(target.id));
  return {
    ...state,
    rngState,
    storyFlags: [...flags],
    lastMessage: `${target.name}整晚没有说话。天快亮时，他/她开始收拾自己的东西。`,
  };
}

export function clearLowHopeDeparture(state: GameState, survivorId: string): GameState {
  return { ...state, storyFlags: state.storyFlags.filter((flag) => flag !== lowHopeDepartureFlag(survivorId)) };
}

function residentLossNarrative(cause: string, loss: number): string {
  const countText = loss === 1 ? '一个人' : `${loss}个人`;
  if (cause.includes('踩踏')) return `宿营屋门口一度挤成一团。等门重新关上时，负责帮大家分热水的人里少了${countText}。`;
  if (cause.includes('搜救')) return `出去找人的队伍最后只带回了空手电。那个一直帮忙搬物资的居民没有回来。`;
  if (cause.includes('失踪')) return `天亮清点铺位时，${countText}的毯子是空的。没人知道他们什么时候离开的。`;
  if (cause.includes('坍塌')) return `倒下来的墙没有给人反应时间。清理碎石时，街区确认失去了${countText}。`;
  if (cause.includes('北门')) return `北门缺口被堵住以后，地上留下了来不及带走的东西。${countText}没能退回来。`;
  if (cause.includes('尸群')) return `尸群退开后，清点人数少了${countText}。他们原本只是帮着搬障碍和递工具。`;
  if (cause.includes('医疗')) return `诊疗站重新安静下来时，${countText}已经没有呼吸。有人替他们把毯子拉到了肩上。`;
  return `${cause}之后，街区少了${countText}。他们不是一个数字，而是每天一起吃饭、搬东西、守门的人。`;
}

export function loseCommunityResidents(state: GameState, requestedLoss: number, cause: string): GameState {
  const loss = Math.min(state.civilianResidents, Math.max(0, Math.floor(requestedLoss)));
  if (!loss) return state;
  const community = normalizeCommunityState(state.communityState, state.civilianResidents);
  const pendingLoss = Math.min(community.pendingResidents, loss);
  const activeLoss = Math.min(community.activeResidents, loss - pendingLoss);
  const activeResidents = Math.max(0, community.activeResidents - activeLoss);
  const pendingResidents = Math.max(0, community.pendingResidents - pendingLoss);
  const supportMode = activeResidents >= 5 ? community.supportMode : null;
  const storyFlags = [...new Set([...state.storyFlags, `civilian_loss:${state.day}:${cause}:${loss}`])];
  const lost: GameState = {
    ...state,
    civilianResidents: state.civilianResidents - loss,
    communityState: { ...community, activeResidents, pendingResidents, supportMode },
    campaignStats: { ...state.campaignStats, deaths: state.campaignStats.deaths + loss },
    hope: clamp(state.hope - Math.min(6, loss * 2)),
    storyFlags,
    lastMessage: residentLossNarrative(cause, loss),
  };
  return adjustPressure(lost, Math.min(2, loss), `civilian-loss-${cause}`);
}
