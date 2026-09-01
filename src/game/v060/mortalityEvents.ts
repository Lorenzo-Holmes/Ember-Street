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
  const medicineCost = critical ? (expeditionCache ? 1 : 2) : 1;
  const cacheText = expeditionCache ? '之前从医院/药店带回的储备让应急用药成本降低。' : '没有额外医疗储备可用。';
  return {
    id: `mortality-medical:${survivorId}`,
    category: 'emergency',
    minDay: 6,
    maxDay: 29,
    title: critical ? `${survivor.name}的伤口开始发黑` : `${survivor.name}的高烧没有退`,
    body: critical
      ? `${survivor.name}已经${survivor.untreatedDays ?? 0}天没有得到有效治疗。呼吸变得很浅，伤口边缘出现了不正常的颜色。再拖下去，最坏的事情可能就在今晚发生。${cacheText}`
      : `${survivor.name}的伤势一直没有真正处理。今晚体温突然升高，意识也开始断断续续。现在还来得及，但不能继续当作普通伤口。${cacheText}`,
    choices: [
      checked('mortality-treat', '立即组织治疗', '让医疗岗位现在处理。成功能把危险拉回来；严重失败可能让伤势彻底失控。', 'medical', { hope: 1 }, { hope: -2 }, { hope: 0 }),
      resource('mortality-medicine', `使用 ${medicineCost} 份应急药品`, expeditionCache ? '使用探索带回的医疗储备，不赌诊断，直接把人先稳定下来。' : '不赌诊断，直接用最宝贵的药把人先稳定下来。', { medicine: medicineCost }, { hope: 1 }),
      consequence('mortality-isolate', '隔离观察到天亮', critical ? '不再消耗药，但对危重伤员来说，这实际上是在赌他还能不能撑过今晚。' : '暂时不消耗资源，但伤势可能继续恶化成危重。', { hope: -2 }),
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
    body: `希望已经降得很低。${survivor.name}说自己不是要背叛谁，只是不相信继续留在这里还能等到下一次天亮。门就在旁边，现在必须决定要不要留下这个人。`,
    choices: [
      checked('mortality-talk', '坐下来把话说开', '让最会照顾人的人陪他/她把这一夜谈完。失败的话，对方可能直接离开。', 'cook', { hope: 2 }, { hope: -2 }, { hope: 0 }),
      resource('mortality-support', '分出食物和休息名额', '给一个看得见的理由，让他/她至少再留下几天。', { ration: 2 }, { hope: 2 }),
      consequence('mortality-leave', '不阻拦', '不消耗任何资源。天亮前，这个人会离开余烬长街，并进入失踪状态。', { hope: -1 }),
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
