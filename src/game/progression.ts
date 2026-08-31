import { CHAPTER_FINAL_DAY } from './config';
import type { BuildingId, DayForecast, Role, Survivor } from './types';

export const BUILDING_META: Record<BuildingId, { name: string; role: Role; cost: number; unlockDay: number; description: string }> = {
  searchStation: { name: '搜索站', role: 'search', cost: 6, unlockDay: 1, description: '派人外出搜寻补给，让每个夜晚都有准备。' },
  shelter: { name: '宿营屋', role: 'rest', cost: 9, unlockDay: 2, description: '让幸存者恢复精力，避免长期管理变成惩罚。' },
  workshop: { name: '修理工坊', role: 'repair', cost: 8, unlockDay: 3, description: '修复围栏和设备，并稳定产出零件。' },
  watchPost: { name: '守夜岗', role: 'watch', cost: 12, unlockDay: 5, description: '提前削减尸潮压力，给七格操作留出空间。' },
  clinic: { name: '诊疗站', role: 'medical', cost: 10, unlockDay: 8, description: '处理伤员，让急救订单更有价值。' },
  radio: { name: '广播亭', role: 'radio', cost: 14, unlockDay: 12, description: '提前预告危机，并稳定街区希望。' },
};

export const SURVIVOR_ROSTER: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 88, mood: 'bright', perk: '搜索岗位每天额外带回 1 份补给。' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 82, mood: 'steady', perk: '修理岗位每天额外回收 1 个零件。' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 92, mood: 'bright', perk: '在岗时，幸存者订单的耐心略高。' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 78, mood: 'steady', perk: '诊疗站每天额外整理 1 份药品。' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 86, mood: 'steady', perk: '守夜时降低开场尸潮压力。' },
  { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 90, mood: 'bright', perk: '广播值守会在天亮时额外增加希望。' },
];

const FIXED_FORECASTS: Record<number, DayForecast> = {
  1: { title: '零星游荡者', detail: '外围只有少量尸影，先学会守住七格。', intensity: 1 },
  2: { title: '搜索窗口', detail: '街西暂时安静，白天搜到的补给会直接进入今晚储备。', intensity: 1, bonusKind: 'ration' },
  3: { title: '围栏开始响', detail: '北侧第一次出现持续撞击，修理工坊开始变得重要。', intensity: 2, bonusKind: 'battery' },
  5: { title: '第一次成群', detail: '不再只是零星尸影，守夜岗应该开始有人值班。', intensity: 2 },
  7: { title: '街区开始成形', detail: '第一周撑过去了，但真正的尸潮还没来。', intensity: 2, bonusKind: 'ration' },
  10: { title: '第一轮尸潮', detail: '这是第一次真正意义上的整夜冲击。活下来，街区才算站稳。', intensity: 4, bonusKind: 'battery' },
  12: { title: '黑雨', detail: '雨水和电力同时出问题，搜索和照明都会更吃紧。', intensity: 3, bonusKind: 'medical' },
  15: { title: '半月', detail: '十五天过去。资源开始比最初更难补齐，人物状态也更重要。', intensity: 3 },
  18: { title: '伤员夜', detail: '外出搜索队带回伤员，今晚急救需求会明显增加。', intensity: 4, bonusKind: 'medical' },
  20: { title: '第二轮尸潮', detail: '尸群规模比 DAY 10 更大，过去十天的准备都会在今晚兑现。', intensity: 5, bonusKind: 'battery' },
  23: { title: '长街失衡', detail: '连续守夜让所有系统进入疲劳期。今天不要把任何一项资源看成理所当然。', intensity: 4 },
  25: { title: '围城前兆', detail: '广播开始连续出现尸群迁移警报。最后五天已经开始。', intensity: 4 },
  27: { title: '第一次总动员', detail: '所有岗位都应该开始为 DAY 30 做准备。', intensity: 5 },
  29: { title: '最后一个黄昏前夜', detail: '远处高架已经看不见路面，只剩移动的黑影。', intensity: 5, bonusKind: 'battery' },
  30: { title: '最终尸潮', detail: '三十天的所有决定、伤病、关系与准备，都在这一夜兑现。', intensity: 6 },
};

const ROTATING_FORECASTS: DayForecast[] = [
  { title: '无风夜', detail: '异常安静。尸群不快，但每一次撞击都会显得更近。', intensity: 2 },
  { title: '潮湿低云', detail: '能见度下降，医疗和电力都更容易吃紧。', intensity: 3, bonusKind: 'medical' },
  { title: '短暂晴夜', detail: '视野不错，是相对适合恢复节奏的一晚。', intensity: 2, bonusKind: 'ration' },
  { title: '远处火光', detail: '城市另一侧有火灾，游荡者正在被重新吸引和分流。', intensity: 3, bonusKind: 'battery' },
  { title: '大雾', detail: '守夜岗很难提前看见尸影，请求本身不会变快，但压力更难判断。', intensity: 3 },
];

export function forecastFor(day: number): DayForecast {
  if (FIXED_FORECASTS[day]) return FIXED_FORECASTS[day];
  if (day > CHAPTER_FINAL_DAY) return { title: '余烬之后', detail: '第一章已经结束。', intensity: 2 };
  const base = ROTATING_FORECASTS[(day * 7 + Math.floor(day / 3)) % ROTATING_FORECASTS.length];
  const phaseBonus = day >= 24 ? 2 : day >= 16 ? 1 : 0;
  return { ...base, intensity: Math.min(5, base.intensity + phaseBonus) };
}

export function survivorUnlockFor(day: number): Survivor | null {
  const byDay: Record<number, string> = { 1: 'lin-xia', 3: 'zhou', 5: 'ahe', 8: 'cheng', 12: 'aliang', 16: 'xiaoman' };
  const id = byDay[day];
  return SURVIVOR_ROSTER.find((item) => item.id === id) ?? null;
}
