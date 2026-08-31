import type { BuildingId, DayForecast, Role, Survivor } from './types';

export const BUILDING_META: Record<BuildingId, { name: string; role: Role; cost: number; unlockDay: number; description: string }> = {
  searchStation: { name: '搜索站', role: 'search', cost: 6, unlockDay: 1, description: '派人外出搜寻补给，让每个夜晚都有准备。' },
  workshop: { name: '修理工坊', role: 'repair', cost: 8, unlockDay: 2, description: '修复围栏和设备，并稳定产出零件。' },
  clinic: { name: '诊疗站', role: 'medical', cost: 10, unlockDay: 4, description: '处理伤员，让急救订单更有价值。' },
  watchPost: { name: '守夜岗', role: 'watch', cost: 12, unlockDay: 3, description: '提前削减尸潮压力，给七格操作留出空间。' },
  shelter: { name: '宿营屋', role: 'rest', cost: 9, unlockDay: 2, description: '让幸存者恢复精力，避免长期管理变成惩罚。' },
  radio: { name: '广播亭', role: 'radio', cost: 14, unlockDay: 5, description: '提前预告危机，并稳定街区希望。' },
};

export const SURVIVOR_ROSTER: Survivor[] = [
  { id: 'lin-xia', name: '林夏', specialty: 'search', energy: 88, mood: 'bright', perk: '搜索岗位每天额外带回 1 份补给。' },
  { id: 'zhou', name: '老周', specialty: 'repair', energy: 82, mood: 'steady', perk: '修理岗位每天额外回收 1 个零件。' },
  { id: 'ahe', name: '阿禾', specialty: 'cook', energy: 92, mood: 'bright', perk: '在岗时，幸存者订单的耐心略高。' },
  { id: 'cheng', name: '程医生', specialty: 'medical', energy: 78, mood: 'steady', perk: '诊疗站每天额外整理 1 份药品。' },
  { id: 'aliang', name: '阿梁', specialty: 'watch', energy: 86, mood: 'steady', perk: '守夜时降低开场尸潮压力。' },
  { id: 'xiaoman', name: '小满', specialty: 'radio', energy: 90, mood: 'bright', perk: '广播值守会在天亮时额外增加希望。' },
];

export const DAY_FORECASTS: Record<number, DayForecast> = {
  1: { title: '零星游荡者', detail: '外围只有少量尸影，先学会守住七格。', intensity: 1 },
  2: { title: '搜索窗口', detail: '街西暂时安静，白天搜到的补给会直接进入今晚储备。', intensity: 1, bonusKind: 'ration' },
  3: { title: '第一次夜袭', detail: '北侧围栏会承受更高压力，守夜岗位开始重要。', intensity: 2, bonusKind: 'battery' },
  4: { title: '伤员涌入', detail: '急救需求增加，诊疗准备会转化成希望。', intensity: 2, bonusKind: 'medical' },
  5: { title: '停电预警', detail: '主灯线路不稳，电力包会比平时更关键。', intensity: 3, bonusKind: 'battery' },
  6: { title: '尸潮接近', detail: '广播确认大规模尸群正在靠近。今天就是准备日。', intensity: 3 },
  7: { title: '尸潮之夜', detail: '第一章高潮。活过今晚，让整段长街重新亮起来。', intensity: 5 },
};

export function forecastFor(day: number): DayForecast {
  return DAY_FORECASTS[day] ?? { title: '漫长守夜', detail: '尸潮仍在，但街区已经学会怎样活下去。', intensity: Math.min(5, 2 + Math.floor(day / 4)) };
}

export function survivorUnlockFor(day: number): Survivor | null {
  const byDay: Record<number, string> = { 1: 'lin-xia', 2: 'zhou', 3: 'ahe', 4: 'cheng', 5: 'aliang', 6: 'xiaoman' };
  const id = byDay[day];
  return SURVIVOR_ROSTER.find((item) => item.id === id) ?? null;
}
