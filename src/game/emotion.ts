import type { GameState } from './types';

export const CAT_COPY = [
  { title: '还没有猫', detail: 'DAY 3 以后，废墟边可能会出现一只灰猫。' },
  { title: '流浪猫', detail: '它总躲在灯塔照得到、尸群碰不到的地方。' },
  { title: '常驻猫', detail: '现在它会在你开夜前绕着补给站转一圈。' },
  { title: '镇街猫 · 小灰', detail: '暴雨、警报、尸潮都没把它赶走。这里已经是它的家。' },
] as const;

export function careForCat(state: GameState): GameState {
  if (state.phase !== 'street' || state.day < 3 || state.catFedToday || state.supplies < 1) return state;
  const current = state.catStage ?? 0;
  const nextStage = Math.min(3, current + 1) as 0 | 1 | 2 | 3;
  return {
    ...state,
    supplies: state.supplies - 1,
    hope: state.hope + 1,
    catStage: nextStage,
    catFedToday: true,
    lastMessage: nextStage === 1 ? '你留下一份口粮 · 灰猫没有立刻跑掉' : nextStage === 2 ? '它今天主动回来了 · 也许会留下' : '小灰有了自己的位置 · 镇街猫加入',
  };
}
