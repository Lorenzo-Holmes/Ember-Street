import type { GameState } from '../types';
import type { NightChoice, NightEffect, V060NightEvent } from './nightEvents';
import { medicalCrisisFlag, pendingLowHopeDepartureId } from './mortality';

const checked = (
  id: string,
  label: string,
  detail: string,
  role: 'medical' | 'cook',
  success: NightEffect,
  failure: NightEffect,
  partial: NightEffect = failure,
): NightChoice => ({
  id,
  label,
  detail,
  strategy: 'person',
  check: { label, role },
  outcomes: { failure, partial, success, critical: { ...success, hope: (success.hope ?? 0) + 1 } },
});

const resource = (id: string, label: string, detail: string, cost: NightChoice['cost'], effect: NightEffect): NightChoice => ({
  id, label, detail, strategy: 'resource', cost, direct: effect,
});

const consequence = (id: string, label: string, detail: string, effect: NightEffect): NightChoice => ({
  id, label, detail, strategy: 'consequence', direct: effect,
});

export function lowHopeDepartureTarget(state: GameState): string | null {
  return pendingLowHopeDepartureId(state);
}

function medicalCrisisEvent(state: GameState, survivorId: string): V060NightEvent | undefined {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || (survivor.condition !== 'serious' && survivor.condition !== 'critical')) return undefined;
  if (!state.storyFlags.includes(medicalCrisisFlag(survivorId))) return undefined;
  const critical = survivor.condition === 'critical';
  const expeditionCache = state.storyFlags.includes('medical_cache') || state.storyFlags.includes('antibiotic_stock');
  const triageFirst = state.socialState?.principles?.includes('triage-first') ?? false;
  const criticalDiscount = expeditionCache || triageFirst;
  const medicineCost = critical ? (criticalDiscount ? 1 : 2) : 1;
  const supportText = expeditionCache
      ? '之前从医院和药店搬回来的药还封在诊疗室最里面。'
    : triageFirst
      ? '之前已经说清楚过：药不够时，先留给最危险的人。'
      : '药柜里没有能额外顶上来的储备。';
  return {
    id: `mortality-medical:${survivorId}`,
    category: 'emergency',
    minDay: 6,
    maxDay: 29,
    title: critical ? `${survivor.name}的伤口开始发黑` : `${survivor.name}的高烧没有退`,
    body: critical
      ? `${survivor.name}已经${survivor.untreatedDays ?? 0}天没有得到有效治疗。呼吸很浅，伤口边缘正在变色。程医生把灯拉近以后没有再说“等到早上”。${supportText}`
      : `${survivor.name}的伤一直没有真正处理。今晚体温突然升高，回答问题时也开始断断续续。程医生已经把药箱和水放到床边。${supportText}`,
    choices: [
      checked('mortality-treat', '立即组织治疗', '让医疗岗位现在动手清创、降温和处理伤口；拖延的时间已经不多。', 'medical', { hope: 1 }, { hope: -2 }, { hope: 0 }),
      resource('mortality-medicine', `使用 ${medicineCost} 份应急药品`, criticalDiscount ? '把之前留下的应急药拿出来，先压住高烧和伤口恶化。' : '把药柜里最宝贵的那几份拿出来，先压住高烧和伤口恶化。', { medicine: medicineCost }, { hope: 1 }),
      consequence('mortality-isolate', '隔离观察到天亮', critical ? '今晚不再动药。已经危重的人，很可能等不到天亮。' : '先把人单独安置，不再处理伤口；到天亮前情况还可能继续往坏处走。', { hope: -2 }),
    ],
  };
}

function lowHopeEvent(state: GameState, survivorId: string): V060NightEvent | undefined {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  if (!survivor || survivor.condition === 'dead' || survivor.condition === 'missing') return undefined;
  return {
    id: `mortality-hope:${survivorId}`,
    category: 'survivor',
    minDay: 6,
    maxDay: 29,
    title: `${survivor.name}把东西装进了包里`,
    body: `${survivor.name}把能带走的东西都塞进包里，说自己已经连续几晚睡不着，也不相信下一次天亮会比今天更好。门就在旁边。`,
    choices: [
      checked('mortality-talk', '坐下来把话说开', '让最会照顾人的人陪着坐一会儿，把想走的理由一件件听完。', 'cook', { hope: 2 }, { hope: -2 }, { hope: 0 }),
      resource('mortality-support', '分出食物和休息名额', '把两份口粮和一个真正能睡觉的位置留出来，告诉对方明天不用再硬撑岗位。', { ration: 2 }, { hope: 2 }),
      consequence('mortality-leave', '不阻拦', '不给食物，也不拦门。天亮前，这个人会离开余烬长街，之后只能再去找。', { hope: -1 }),
    ],
  };
}

export function pendingMortalityEventIds(state: GameState): string[] {
  const events = state.storyFlags
    .filter((flag) => flag.startsWith('medical_crisis_pending:'))
    .map((flag) => flag.slice('medical_crisis_pending:'.length))
    .filter((id) => Boolean(medicalCrisisEvent(state, id)))
    .sort()
    .slice(0, 2)
    .map((id) => `mortality-medical:${id}`);
  const lowHopeTarget = lowHopeDepartureTarget(state);
  if (lowHopeTarget) events.push(`mortality-hope:${lowHopeTarget}`);
  return events;
}

export function mortalityEventById(state: GameState, id: string): V060NightEvent | undefined {
  if (id.startsWith('mortality-medical:')) return medicalCrisisEvent(state, id.slice('mortality-medical:'.length));
  if (id.startsWith('mortality-hope:')) {
    const target = id.slice('mortality-hope:'.length);
    return lowHopeDepartureTarget(state) === target || state.nightState.emergencyEventIds.includes(id) ? lowHopeEvent(state, target) : undefined;
  }
  return undefined;
}
