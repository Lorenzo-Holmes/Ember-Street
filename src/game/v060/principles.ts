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
    title: '我们怎么分资源？',
    body: '街区已经不再只是三个人的临时落脚点。谁先吃、谁先治、谁去冒险，开始变成必须公开说清楚的规则。',
    choices: [
      { id: 'everyone-shares', title: '人人有份', detail: '优先让居民轮值和供餐覆盖所有人。', effect: '居民炊事贡献 +15%，社区路线更稳定。' },
      { id: 'triage-first', title: '先救最危险的人', detail: '把稀缺药品优先留给重伤和危重者。', effect: '危重医疗的稳定用药成本 -1。' },
      { id: 'outward-search', title: '向外寻找', detail: '接受更高外出风险，换取更多可带回街区的东西。', effect: '探索主要物资 +1，但探索风险 +1。' },
    ],
  },
  {
    day: 14,
    title: '谁来承担风险？',
    body: '核心人物已经撑了两周。居民也越来越多。下一次出事时，到底应该让谁站在最前面？',
    choices: [
      { id: 'core-leads', title: '核心人物带头', detail: '需要判定时优先依赖最有经验的人。', effect: '夜间核心人物判定 +1。' },
      { id: 'community-shares-risk', title: '居民共同承担', detail: '让社区轮值真正进入防线与维修体系。', effect: '居民维修与守备贡献增强。' },
      { id: 'preserve-strength', title: '保存力量', detail: '减少非必要消耗，让人先活过今天。', effect: '休息恢复 +6，但探索额外收益 -1。' },
    ],
  },
  {
    day: 21,
    title: '我们还准备留下吗？',
    body: '最后一周已经能看见尽头。现在必须决定：把所有东西押在这条街，准备离开，还是继续等待外援。',
    choices: [
      { id: 'hold-the-street', title: '守住这条街', detail: '把剩余建设全部当成最终尸潮准备。', effect: 'DAY29 获得额外等效防线。' },
      { id: 'prepare-evacuation', title: '准备撤离', detail: '优先整理地铁、公交和南侧路线。', effect: '已知撤离路线会在终局得到额外价值。' },
      { id: 'await-aid', title: '等待外援', detail: '继续维持广播与外部联络。', effect: '广播值守在外部联系已建立时额外恢复希望。' },
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
    dawnBrief: [...(state.dawnBrief ?? []), `街区原则：《${choice.title}》——${choice.effect}`],
    lastMessage: `街区原则已确定：《${choice.title}》`,
  };
}