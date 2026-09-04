/**
 * 玩家可见文案（游戏内 UI copy）的单一来源。
 * 由 tests/full-play-experience-v060.test.ts 守卫。
 */
export const SPECIALTY_LABEL: Record<string, string> = {
  search: '熟路',
  repair: '维修熟手',
  medical: '懂医',
  watch: '守夜熟手',
  cook: '会做饭',
  radio: '懂广播',
  rest: '能补位',
};

const BUILDING_CONDITION = ['封着', '勉强能用', '已经能用', '修稳了'] as const;

export const buildingConditionLabel = (level: number) => BUILDING_CONDITION[Math.max(0, Math.min(3, level))];

export const mealCoverageLine = (coverage: number) => coverage >= 0.98
  ? '今晚这锅能顾到所有人。'
  : coverage >= 0.8
    ? '今晚这锅能顾到大多数人。'
    : coverage >= 0.6
      ? '今晚会有人得少吃一点。'
      : '今晚这锅明显不够分。';

export const nightPreparationLine = (defense: '薄弱' | '一般' | '良好') => defense === '良好'
  ? '守岗人手较充足。'
  : defense === '一般'
    ? '已安排守岗，力量有限。'
    : '街口尚未安排守岗。';
