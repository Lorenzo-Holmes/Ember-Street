import { CHAPTER_FINAL_DAY } from './config';
import type { BuildingId, DayForecast, Role, Survivor } from './types';

export const BUILDING_META: Record<BuildingId, { name: string; role: Role; cost: number; unlockDay: number; description: string }> = {
  searchStation: { name: '搜索站', role: 'search', cost: 6, unlockDay: 1, description: '派人外出搜寻补给，探索风险会受到人物状态影响。' },
  shelter: { name: '宿营屋', role: 'rest', cost: 9, unlockDay: 1, description: '提供休息与公共厨房，人口越多后勤压力越大。' },
  workshop: { name: '修理工坊', role: 'repair', cost: 8, unlockDay: 1, description: '修复围栏和设备，让建筑事故更容易处理。' },
  watchPost: { name: '守夜岗', role: 'watch', cost: 12, unlockDay: 1, description: '降低紧急事件风险并提前发现夜间危险。' },
  clinic: { name: '诊疗站', role: 'medical', cost: 10, unlockDay: 1, description: '处理伤员，降低伤势继续恶化的风险。' },
  radio: { name: '广播亭', role: 'radio', cost: 14, unlockDay: 1, description: '联系外界、发现幸存者，并打开军方联络路线。' },
};

export const SURVIVOR_ROSTER: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 88, mood: 'bright', perk: '探索时更善于判断退路。' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 82, mood: 'steady', perk: '维修与建筑事故判定更可靠。' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 92, mood: 'bright', perk: '一人能承担更多人口的炊事。' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 78, mood: 'steady', perk: '医疗岗位更容易稳定重伤居民。' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 86, mood: 'steady', perk: '守备时能更早听见危险靠近。' },
  { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 90, mood: 'bright', perk: '广播值守更容易建立远距联系。' },
];

const FIXED_FORECASTS: Record<number, DayForecast> = {
  1: { title: '第一顿早饭', detail: '先安排今天的人手。有人出去，有人留下。', intensity: 1 },
  2: { title: '搜索窗口', detail: '街西暂时安静，适合补足口粮和材料。', intensity: 1, bonusKind: 'ration' },
  3: { title: '围栏开始响', detail: '北侧第一次出现持续撞击，维修和守备开始变得重要。', intensity: 2, bonusKind: 'battery' },
  5: { title: '第一次成群', detail: '不再只是零星尸影。白天的岗位会开始明显影响夜晚。', intensity: 2 },
  7: { title: '街区开始成形', detail: '第一周撑过去了，人口、供餐和建筑开始互相牵制。', intensity: 2, bonusKind: 'ration' },
  10: { title: '第一轮尸潮', detail: '第一次必定尸潮。过去几天的守备和建设会直接兑现。', intensity: 4, bonusKind: 'battery' },
  12: { title: '黑雨', detail: '雨水和电力一起出问题，探索与设施事故都会更危险。', intensity: 3, bonusKind: 'medical' },
  15: { title: '半月', detail: '资源开始难补，疲劳和伤病不再只是小数字。', intensity: 3 },
  18: { title: '伤员夜', detail: '街上出现更多伤者，诊疗和药品储备正在被检验。', intensity: 4, bonusKind: 'medical' },
  20: { title: '第二轮尸潮', detail: '尸群规模更大。建筑等级和守备人数会明显改变夜间事件。', intensity: 5, bonusKind: 'battery' },
  23: { title: '长街失衡', detail: '连续的探索、后勤和守夜开始消耗所有人的状态。', intensity: 4 },
  25: { title: '围城前兆', detail: '广播里反复出现尸群迁移警报。最后几天开始了。', intensity: 4 },
  27: { title: '最后准备', detail: '该修的设施、该存的药、该休息的人，都没有多少时间了。', intensity: 5 },
  29: { title: '最后的白天', detail: '天黑以后就是最终尸潮。最后一次外出，或者所有人留下。', intensity: 6, bonusKind: 'battery' },
  30: { title: '天亮以后', detail: '今天没有调遣，也没有下一场夜晚。过去二十九天开始结算。', intensity: 0 },
};

const ROTATING_FORECASTS: DayForecast[] = [
  { title: '无风夜', detail: '异常安静。晚上更容易听清远处的声音。', intensity: 2 },
  { title: '潮湿低云', detail: '能见度下降，探索与电力设施更容易出问题。', intensity: 3, bonusKind: 'medical' },
  { title: '短暂晴天', detail: '视野不错，适合恢复状态和补一次物资。', intensity: 2, bonusKind: 'ration' },
  { title: '远处火光', detail: '城市另一侧有火灾，尸群迁移方向正在变化。', intensity: 3, bonusKind: 'battery' },
  { title: '大雾', detail: '守夜岗很难提前看见尸影，情报价值更高。', intensity: 3 },
];

export function forecastFor(day: number): DayForecast {
  if (FIXED_FORECASTS[day]) return FIXED_FORECASTS[day];
  if (day > CHAPTER_FINAL_DAY) return { title: '余烬之后', detail: '第一章已经结束。', intensity: 0 };
  const base = ROTATING_FORECASTS[(day * 7 + Math.floor(day / 3)) % ROTATING_FORECASTS.length];
  const phaseBonus = day >= 24 ? 2 : day >= 16 ? 1 : 0;
  return { ...base, intensity: Math.min(5, base.intensity + phaseBonus) };
}

export function survivorUnlockFor(day: number): Survivor | null {
  const byDay: Record<number, string> = { 1: 'lin-xia', 3: 'zhou', 5: 'ahe', 8: 'cheng', 12: 'aliang', 16: 'xiaoman' };
  const id = byDay[day];
  return SURVIVOR_ROSTER.find((item) => item.id === id) ?? null;
}
