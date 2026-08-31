import { CHAPTER_FINAL_DAY } from './config';
import type { DayForecast, Survivor } from './types';

export const SURVIVOR_ROSTER: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 88, mood: 'bright', perk: '先看退路', trait: '先看退路', trust: 1, condition: 'healthy' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 82, mood: 'steady', perk: '修不好不睡', trait: '修不好不睡', trust: 1, condition: 'healthy' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 92, mood: 'bright', perk: '热饭很重要', trait: '热饭很重要', trust: 1, condition: 'healthy' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 78, mood: 'steady', perk: '先救能救的', trait: '先救能救的', trust: 1, condition: 'healthy' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 86, mood: 'steady', perk: '听声辨位', trait: '听声辨位', trust: 1, condition: 'healthy' },
  { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 90, mood: 'bright', perk: '别让声音断掉', trait: '别让声音断掉', trust: 1, condition: 'healthy' },
];

const FIXED: Record<number, DayForecast> = {
  1: { title: '第一盏灯', detail: '先把人和物资安排好。夜里真正重要的是谁留在街上。', intensity: 1 },
  5: { title: '街口开始拥挤', detail: '探索范围扩大以后，受伤和供餐压力都会开始出现。', intensity: 2 },
  10: { title: '第一轮尸潮', detail: '第一次确定尸潮。白天的守备、维修和广播都会在今晚兑现。', intensity: 4 },
  15: { title: '半月', detail: '活下来已经不是唯一问题。更多人意味着更多岗位，也意味着更多口粮。', intensity: 3 },
  20: { title: '第二轮尸潮', detail: '规模明显大于 DAY 10。街区成熟度开始比单次运气更重要。', intensity: 5 },
  24: { title: '围城', detail: '能安全探索的地方越来越少。每一次外派都要考虑能不能回来。', intensity: 4 },
  27: { title: '最后准备', detail: '所有岗位都应该开始为 DAY 29 做准备。', intensity: 5 },
  29: { title: '最后的白天', detail: '天黑以后就是最终尸潮。今天仍能外出，但每一次冒险都要付代价。', intensity: 6 },
  30: { title: '天亮以后', detail: 'DAY 30 不再操作。过去 29 天会自己给出答案。', intensity: 0 },
};

const ROTATING: DayForecast[] = [
  { title: '短暂晴天', detail: '视野不错，适合恢复和补齐街区短板。', intensity: 2 },
  { title: '低云', detail: '声音传得很远，晚上更难判断街外的动静。', intensity: 3 },
  { title: '远处火光', detail: '另一片街区出了事，尸群迁移方向可能改变。', intensity: 3 },
  { title: '无风', detail: '异常安静。每一次敲击和脚步都会显得更近。', intensity: 2 },
  { title: '潮湿的一天', detail: '线路、伤口和人的情绪都更容易出问题。', intensity: 3 },
];

export function forecastFor(day: number): DayForecast {
  if (FIXED[day]) return FIXED[day];
  if (day > CHAPTER_FINAL_DAY) return { title: '余烬之后', detail: '第一章已经结束。', intensity: 0 };
  const base = ROTATING[(day * 7 + Math.floor(day / 3)) % ROTATING.length];
  const phaseBonus = day >= 24 ? 1 : day >= 16 ? 1 : 0;
  return { ...base, intensity: Math.min(5, base.intensity + phaseBonus) };
}
