import type { Order, OrderKind, SupplyKind } from './types';

export const NIGHT_DURATION_MS = 75_000;
export const CHAPTER_FINAL_DAY = 30;
export const ENDING_DAY = 30;
export const FINAL_PLAYABLE_DAY = 29;
export const HORDE_MILESTONE_DAYS = [10, 20, 29] as const;

// v0.5 compatibility exports. These are removed when the seven-slot runtime is deleted.
export const SLOT_COUNT = 7;
export const RACK_COUNT = 4;
export const RACK_BATCH_SIZE = 3;

export function isHordeMilestone(day: number): boolean {
  return HORDE_MILESTONE_DAYS.includes(day as (typeof HORDE_MILESTONE_DAYS)[number]);
}

export function nightDurationFor(day: number): number {
  if (day >= FINAL_PLAYABLE_DAY) return 120_000;
  if (day === 20) return 100_000;
  if (day === 10) return 90_000;
  if (day >= 24) return 85_000;
  return NIGHT_DURATION_MS;
}

export function nightOrderLimitFor(day: number): number {
  if (day <= 1) return 3;
  if (day <= 6) return 4;
  if (day <= 14) return day === 10 ? 6 : 5;
  if (day <= 23) return day === 20 ? 7 : 6;
  if (day < FINAL_PLAYABLE_DAY) return 7;
  return 8;
}

export const SUPPLY_META: Record<SupplyKind, { label: string; short: string; tier2: string; tier3: string }> = {
  ration: { label: '罐头', short: '粮', tier2: '热食包', tier3: '战地餐' },
  medical: { label: '绷带', short: '医', tier2: '急救包', tier3: '救护箱' },
  battery: { label: '电池', short: '电', tier2: '电力包', tier3: '应急电源' },
};

const LINES: Record<SupplyKind, string[]> = {
  ration: ['外面全黑了……还有热的吃吗？', '孩子一天没吃东西了。', '守夜前，能给点热食吗？', '巡夜的人还没吃晚饭。', '南口刚回来两个人，能匀一份热的吗？'],
  medical: ['有人受伤了，急救包！', '北口刚抬回来一个伤员。', '诊疗角缺一份急救包。', '有人从废墟回来一直在流血。', '程医生要一份能直接用的急救包。'],
  battery: ['北侧探照灯快灭了！', '围栏警报没电了。', '主灯需要一份电力包。', '广播亭备用电池见底了。', '南口手电只剩最后一格。'],
};

export function makeOrder(index: number, kind: SupplyKind, orderKind?: OrderKind): Order {
  const resolvedKind: OrderKind = orderKind ?? (index % 3 === 2 ? 'defense' : 'survivor');
  const lines = LINES[kind];
  return {
    id: `order-${index}-${kind}`,
    kind: resolvedKind,
    targetKind: kind,
    targetTier: 2,
    title: resolvedKind === 'defense' ? '防线急需' : '幸存者求助',
    line: lines[index % lines.length],
    patienceMs: resolvedKind === 'defense' ? 20_000 : 24_000,
    maxPatienceMs: resolvedKind === 'defense' ? 20_000 : 24_000,
    rewardHope: resolvedKind === 'defense' ? 2 : 3,
    rewardParts: resolvedKind === 'defense' ? 3 : 2,
    pressureRelief: resolvedKind === 'defense' ? 22 : 12,
  };
}
