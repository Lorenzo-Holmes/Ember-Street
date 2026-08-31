import type { Order, OrderKind, SupplyKind } from './types';

export const NIGHT_DURATION_MS = 75_000;
export const SLOT_COUNT = 7;
export const RACK_COUNT = 4;

export const SUPPLY_META: Record<SupplyKind, { label: string; short: string; tier2: string; tier3: string }> = {
  ration: { label: '罐头', short: '粮', tier2: '热食包', tier3: '战地餐' },
  medical: { label: '绷带', short: '医', tier2: '急救包', tier3: '救护箱' },
  battery: { label: '电池', short: '电', tier2: '电力包', tier3: '应急电源' },
};

const LINES: Record<SupplyKind, string[]> = {
  ration: ['外面全黑了……还有热的吃吗？', '孩子一天没吃东西了。', '守夜前，能给点热食吗？'],
  medical: ['有人受伤了，急救包！', '北口刚抬回来一个伤员。', '诊疗角缺一份急救包。'],
  battery: ['北侧探照灯快灭了！', '围栏警报没电了。', '主灯需要一份电力包。'],
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
    patienceMs: resolvedKind === 'defense' ? 14_000 : 18_000,
    maxPatienceMs: resolvedKind === 'defense' ? 14_000 : 18_000,
    rewardHope: resolvedKind === 'defense' ? 2 : 3,
    rewardParts: resolvedKind === 'defense' ? 3 : 2,
    pressureRelief: resolvedKind === 'defense' ? 22 : 12,
  };
}
