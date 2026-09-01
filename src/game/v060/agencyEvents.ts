import type { GameState, Survivor } from '../types';
import { adjustPressure, socialStateOf } from './socialPressure';

const alive = (survivor?: Survivor) => Boolean(survivor && survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical');
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const eventFlag = (day: number) => `agency_event_day:${day}`;

function onCooldown(state: GameState): boolean {
  const days = state.storyFlags
    .filter((flag) => flag.startsWith('agency_event_day:'))
    .map((flag) => Number(flag.split(':')[1]))
    .filter(Number.isFinite);
  const latest = days.length ? Math.max(...days) : -99;
  return state.day - latest < 3;
}

function note(state: GameState, text: string): GameState {
  return {
    ...state,
    dawnBrief: [...(state.dawnBrief ?? []), `人物主动：${text}`],
    storyFlags: [...new Set([...state.storyFlags, eventFlag(state.day)])],
    lastMessage: text,
  };
}

function survivor(state: GameState, id: string): Survivor | undefined {
  return state.survivors.find((item) => item.id === id);
}

export function applyDailyAgencyEvent(state: GameState): GameState {
  if (onCooldown(state) || state.storyFlags.includes(eventFlag(state.day))) return state;
  const pressure = socialStateOf(state).pressure;

  const ahe = survivor(state, 'ahe');
  if (alive(ahe) && ahe!.condition === 'healthy' && ahe!.energy >= 35 && state.hope >= 45 && pressure <= 3 && state.dayAssignments.ahe === 'cook') {
    let next: GameState = {
      ...state,
      hope: clamp(state.hope + 1),
      survivors: state.survivors.map((item) => item.id === 'ahe' ? { ...item, energy: Math.max(0, item.energy - 4) } : item),
    };
    next = adjustPressure(next, -1, 'agency-ahe-extra-pot');
    return note(next, '阿禾多煮了一锅，没人要求她这么做。希望 +1，街区压力下降。');
  }

  const zhou = survivor(state, 'zhou');
  if (alive(zhou) && state.buildings.workshop >= 2 && state.dayAssignments.zhou === 'rest' && zhou!.energy >= 28) {
    return note({
      ...state,
      defense: clamp(state.defense + 2),
      survivors: state.survivors.map((item) => item.id === 'zhou' ? { ...item, energy: Math.max(0, item.energy - 4) } : item),
    }, '老周休息前还是去看了一眼围栏。防线 +2。');
  }

  const cheng = survivor(state, 'cheng');
  const injured = state.survivors.some((item) => ['minor', 'serious', 'critical'].includes(item.condition ?? ''));
  if (alive(cheng) && state.inventory.medicine >= 4 && injured && !state.storyFlags.includes('medical_kit_prepared')) {
    return note({ ...state, storyFlags: [...new Set([...state.storyFlags, 'medical_kit_prepared'])] }, '程医生重新整理了药箱。下一次应急医疗会多一层准备。');
  }

  const aliang = survivor(state, 'aliang');
  if (alive(aliang) && pressure >= 4 && state.dayAssignments.aliang === 'watch' && aliang!.energy >= 30) {
    const next = adjustPressure({
      ...state,
      survivors: state.survivors.map((item) => item.id === 'aliang' ? { ...item, energy: Math.max(0, item.energy - 6) } : item),
    }, -1, 'agency-aliang-night-watch');
    return note(next, '阿梁把额外的一班夜巡接了过去，让其他人先去睡。街区压力下降。');
  }

  const xiaoman = survivor(state, 'xiaoman');
  if (alive(xiaoman) && state.buildings.radio >= 2 && state.dayAssignments.xiaoman === 'radio' && xiaoman!.energy >= 30) {
    return note({ ...state, hope: clamp(state.hope + 1), storyFlags: [...new Set([...state.storyFlags, 'xiaoman_signal_log'])] }, '小满把断断续续的信号整理成了记录。希望 +1，广播线索被保存下来。');
  }

  return state;
}
