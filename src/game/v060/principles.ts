import type { GameState, StreetPrincipleId } from '../types';
import { socialStateOf } from './socialPressure';

export interface StreetPrincipleChoice {
  id: StreetPrincipleId;
  title: string;
  detail: string;
  effect: string;
}

export interface StreetPrincipleDecision {
  day: 7 | 14 | 21;
  title: string;
  body: string;
  choices: StreetPrincipleChoice[];
}

export const PRINCIPLE_DECISIONS: StreetPrincipleDecision[] = [
  {
    day: 7,
    title: '下一口先给谁？',
    body: '饭馆那只米袋已经能看见底。今晚有人为了半袋东西吵了起来，最后还是问出了大家一直没说的话：下次真的不够分的时候，谁先拿到？',
    choices: [
      { id: 'everyone-shares', title: '人人有份', detail: '“只要还住在这条街上，就不能有人连一口热的都分不到。”', effect: '饭锅更容易顾全所有人，居民也更愿意轮着搭手。' },
      { id: 'triage-first', title: '先救伤得最重的', detail: '“轻伤还能熬。躺着起不来的，今晚可能就没了。”', effect: '药会优先留给最危险的伤口，重伤时更不容易把药耗空。' },
      { id: 'outward-search', title: '先顾出去找东西的人', detail: '“没人出去，我们早晚还是会把仓房吃空。”', effect: '外出的人会更敢往深处走，带回来的东西更多，也更容易出事。' },
    ],
  },
  {
    day: 14,
    title: '下一次出事，谁站前面？',
    body: '守门、跑腿、搬人、出去找东西，最熟练的那几个人已经撑了两个星期。现在街里的人多了，夜里再响起来时，总得有人说清楚谁先往前站。',
    choices: [
      { id: 'core-leads', title: '熟手带头', detail: '“真出了事，先让最知道该怎么做的人上。”', effect: '需要有人顶住的时候，老手更容易把事情稳下来。' },
      { id: 'community-shares-risk', title: '大家一起扛', detail: '“住在这里的人，不能永远只等那几个人回来。”', effect: '居民会更深地进入维修和守夜轮值，街口不再只靠少数人。' },
      { id: 'preserve-strength', title: '先把人留下', detail: '“不是每件事都值得拿一条命去换。”', effect: '休息能让人恢复得更好，但外出时也会少贪一些东西。' },
    ],
  },
  {
    day: 21,
    title: '这条街还要守多久？',
    body: '最后一周已经看得见了。广播里的声音越来越少，北边的动静却越来越近。有人开始收拾包，有人继续往门上钉铁皮。现在必须把话说清楚：等那一天真的到了，我们准备往哪里去？',
    choices: [
      { id: 'hold-the-street', title: '守住这条街', detail: '“都撑到这里了。能加固的地方，全部加固。”', effect: '最后那一夜，长街会比现在更经得住撞击。' },
      { id: 'prepare-evacuation', title: '准备离开', detail: '“门可以守，但退路也得先留出来。”', effect: '已经摸清的地铁、公交和南侧路线会变得更重要。' },
      { id: 'await-aid', title: '继续等声音', detail: '“只要广播还答得回来，就不能当外面已经没人了。”', effect: '只要外界还有回应，守着广播的人就更能让大家撑下去。' },
    ],
  },
];

function selectedForStage(state: GameState, day: 7 | 14 | 21): boolean {
  const principles = socialStateOf(state).principles;
  const allowed = new Set(PRINCIPLE_DECISIONS.find((decision) => decision.day === day)!.choices.map((choice) => choice.id));
  return principles.some((principle) => allowed.has(principle));
}

export function pendingPrincipleDecision(state: GameState): StreetPrincipleDecision | null {
  if (!['street', 'assignment'].includes(state.phase) || state.expeditionState.departed) return null;
  for (const decision of PRINCIPLE_DECISIONS) {
    if (state.day >= decision.day && !selectedForStage(state, decision.day)) return decision;
  }
  return null;
}

export function hasPrinciple(state: GameState, principle: StreetPrincipleId): boolean {
  return socialStateOf(state).principles.includes(principle);
}

export function choosePrinciple(state: GameState, principle: StreetPrincipleId): GameState {
  const decision = pendingPrincipleDecision(state);
  if (!decision || !decision.choices.some((choice) => choice.id === principle)) return state;
  const social = socialStateOf(state);
  const choice = decision.choices.find((item) => item.id === principle)!;
  return {
    ...state,
    socialState: { ...social, principles: [...social.principles, principle] },
    storyFlags: [...new Set([...state.storyFlags, `principle:${principle}`, `principle_day:${decision.day}`])],
    dawnBrief: [...(state.dawnBrief ?? []), `昨晚把一件事说定了：《${choice.title}》——${choice.effect}`],
    lastMessage: `这句话定下来了：《${choice.title}》`,
  };
}