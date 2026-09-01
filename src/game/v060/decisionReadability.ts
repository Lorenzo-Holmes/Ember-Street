import type { GameState, Role } from '../types';
import { currentExpeditionEvent, type ExpeditionRisk } from './expedition';
import { expeditionSpecialtyBonus } from './expeditionStories';
import {
  effectiveFinalHordeChoice,
  finalHordeCheckModifiers,
  finalHordeLegacyNotes,
  finalHordeStageNumber,
  isFinalHordeEventId,
} from './finalHorde';
import { locationMemorySummary } from './locationMemory';
import type { NightChoice, NightEffect, V060NightEvent } from './nightEvents';

export type DecisionTone = 'safe' | 'stable' | 'risky' | 'severe';

export interface DecisionPreview {
  tags: string[];
  summary: string;
  tone: DecisionTone;
}

const ROLE_LABEL: Record<Role, string> = {
  search: '探索',
  repair: '维修',
  medical: '医疗',
  watch: '守备',
  cook: '炊事',
  radio: '广播',
  rest: '休息',
};

const RESOURCE_LABEL = {
  ration: '口粮',
  medicine: '药品',
  materials: '材料',
  parts: '零件',
  power: '电力',
} as const;

const RISK_LABEL: Record<ExpeditionRisk, string> = {
  safe: '安全',
  cautious: '谨慎',
  dangerous: '危险',
  extreme: '极险',
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function choiceEffects(choice: NightChoice): NightEffect[] {
  return [choice.direct, ...Object.values(choice.outcomes ?? {})].filter((effect): effect is NightEffect => Boolean(effect));
}

function costTags(choice: NightChoice): string[] {
  if (!choice.cost) return [];
  return (Object.entries(choice.cost) as Array<[keyof typeof RESOURCE_LABEL, number | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${RESOURCE_LABEL[key]} -${value}`);
}

function genericRiskTags(choice: NightChoice): string[] {
  const effects = choiceEffects(choice);
  const tags: string[] = [];
  if (effects.some((effect) => effect.actorCondition && effect.actorCondition !== 'healthy')) tags.push('可能受伤');
  if (effects.some((effect) => (effect.hope ?? 0) < 0)) tags.push('希望可能下降');
  if (effects.some((effect) => (effect.defense ?? 0) < 0)) tags.push('防线可能受损');
  if (effects.some((effect) => (effect.power ?? 0) < 0)) tags.push('电力可能损失');
  return tags;
}

function civilianIncidentTag(eventId: string, choiceId: string): string | null {
  const risky = new Set([
    'emergency-panic:calm',
    'emergency-missing-child:search-child',
    'emergency-building-collapse:shore',
    'emergency-north-breach:rush-repair',
    'horde-north-gate:hold-gate',
    'horde-breakthrough:counter',
    'horde-clinic:triage',
    'final-horde-community:final-community-calm',
    'final-horde-last-line:final-last-hold',
  ]);
  const guaranteed = new Set([
    'emergency-missing-child:wait-child',
    'horde-clinic:combat-first',
    'final-horde-community:final-community-ignore',
  ]);
  const key = `${eventId}:${choiceId}`;
  if (guaranteed.has(key)) return '居民必减员';
  if (risky.has(key)) return '居民伤亡风险';
  return null;
}

function mortalityPreview(state: GameState, event: V060NightEvent, choice: NightChoice): Partial<DecisionPreview> | null {
  if (event.id.startsWith('mortality-medical:')) {
    const targetId = event.id.slice('mortality-medical:'.length);
    const target = state.survivors.find((survivor) => survivor.id === targetId);
    const critical = target?.condition === 'critical';
    if (choice.id === 'mortality-treat') return {
      tags: critical ? ['要靠人抢救', '失败可致死'] : ['要靠人抢救', '失败会恶化'],
      summary: critical
        ? '这是今晚最后一次把人从那条线上拽回来。救成了，伤势还能稳住；救不成，天亮前可能就没了。'
        : '现在处理，还有机会把伤势压回轻伤；要是没稳住，今晚可能转成危重。',
      tone: critical ? 'severe' : 'risky',
    };
    if (choice.id === 'mortality-medicine') return {
      tags: ['拿药稳住', critical ? '危重→重伤' : '重伤→轻伤'],
      summary: '把药用在现在，人今晚能稳下来。代价会直接从药箱里扣掉。',
      tone: 'stable',
    };
    if (choice.id === 'mortality-isolate') return {
      tags: critical ? ['不耗药', '可能尸变/死亡'] : ['不耗药', '可能转危重'],
      summary: critical
        ? '今晚不再动药。已经危重的人，很可能等不到天亮。'
        : '今晚先不动药，人不会立刻死，但伤势很可能继续往危重走。',
      tone: critical ? 'severe' : 'risky',
    };
  }

  if (event.id.startsWith('mortality-hope:')) {
    if (choice.id === 'mortality-talk') return {
      tags: ['要靠人劝住', '失败可能失踪'],
      summary: '你得亲自把人留下。话说进去了，他会留下；说不进去，天亮前可能只剩一张空床。',
      tone: 'risky',
    };
    if (choice.id === 'mortality-support') return {
      tags: ['拿口粮留人', '今晚更稳'],
      summary: '拿出吃的，把人先留住。今晚不用再赌一句话到底说没说进去。',
      tone: 'stable',
    };
    if (choice.id === 'mortality-leave') return {
      tags: ['不耗资源', '必定失踪'],
      summary: '什么也不拦。天亮前，这个人会离开长街，之后只能再想办法去找。',
      tone: 'severe',
    };
  }

  return null;
}

export function nightChoicePreview(state: GameState, event: V060NightEvent, choice: NightChoice): DecisionPreview {
  const effectiveChoice = effectiveFinalHordeChoice(state, choice);
  const special = mortalityPreview(state, event, effectiveChoice);
  const tags: string[] = [];
  let tone: DecisionTone = effectiveChoice.strategy === 'resource' ? 'stable' : effectiveChoice.strategy === 'person' ? 'risky' : 'safe';

  if (effectiveChoice.strategy === 'person') tags.push('要靠人顶住');
  if (effectiveChoice.strategy === 'resource') tags.push('拿东西换稳妥');
  if (effectiveChoice.strategy === 'consequence') tags.push('先熬过眼前');
  if (effectiveChoice.check?.role) tags.push(`${ROLE_LABEL[effectiveChoice.check.role]}更合适`);
  if (effectiveChoice.check?.mode === 'advantage') tags.push('优势');
  if (effectiveChoice.check?.mode === 'disadvantage') tags.push('劣势');
  tags.push(...costTags(effectiveChoice));
  tags.push(...genericRiskTags(effectiveChoice));

  const civilian = civilianIncidentTag(event.id, effectiveChoice.id);
  if (civilian) {
    tags.push(civilian);
    tone = civilian === '居民必减员' ? 'severe' : 'risky';
  }

  if (special) {
    tags.push(...(special.tags ?? []));
    tone = special.tone ?? tone;
  }

  let finalHordeSummary: string | null = null;
  if (isFinalHordeEventId(event.id)) {
    const stage = finalHordeStageNumber(event.id);
    tags.push(`最后一夜 ${stage ?? '?'}/6`);
    for (const modifier of finalHordeCheckModifiers(state, effectiveChoice.id)) {
      tags.push(`${modifier.label} ${modifier.value >= 0 ? '+' : ''}${modifier.value}`);
    }
    const legacy = finalHordeLegacyNotes(state);
    finalHordeSummary = `这是最后一夜的第 ${stage ?? '?'} 段。${legacy.length ? `过去留下的东西正在派上用场：${legacy.slice(0, 3).join('；')}。` : '眼下没有别的旧准备能替我们多挡一下。'}${effectiveChoice.check ? ' 真要靠人顶上时，专长、伤势和手边设施都会算数。' : ''}`;
  }

  const summary = special?.summary
    ?? finalHordeSummary
    ?? (effectiveChoice.check
      ? `${effectiveChoice.check.role ? `${ROLE_LABEL[effectiveChoice.check.role]}的人更适合扛这一下。` : ''}这条路要靠现场的人顶过去；失手时，上面标出的风险会真的落下来。`
      : effectiveChoice.strategy === 'resource'
        ? '把上面这些东西拿出来，这条路更稳，不再把结果交给运气。'
        : '眼前不再多花东西，也不让谁去赌这一把；代价会留到之后。');

  return { tags: unique(tags), summary, tone };
}

export type ExpeditionDecision = 'push' | 'careful' | 'retreat';

export function expeditionDecisionPreview(state: GameState, decision: ExpeditionDecision, risk: ExpeditionRisk): DecisionPreview {
  if (decision === 'retreat') {
    return {
      tags: ['安全撤回', '今天空手', '队员精力 -6'],
      summary: '现在回头，今天就空手到这里。人会直接回来，代价只是白跑一趟和损失一点精力。',
      tone: 'safe',
    };
  }

  const event = currentExpeditionEvent(state);
  const specialtyBonus = expeditionSpecialtyBonus(state, event);
  const locationId = state.expeditionState.locationId;
  const memoryNotes = locationId ? locationMemorySummary(state, locationId) : [];
  const tags = decision === 'push'
    ? ['多拿一点', '2D6 -1', RISK_LABEL[risk]]
    : ['稳着走', '2D6 +1', RISK_LABEL[risk]];
  if (specialtyBonus && event?.specialty) tags.push(`${ROLE_LABEL[event.specialty]}专长 +1`);
  if (memoryNotes.some((note) => note.startsWith('已侦察'))) tags.push('来过这里·看过路');
  if (memoryNotes.some((note) => note.startsWith('已清理'))) tags.push('来过这里·清过路');
  if (memoryNotes.some((note) => note.startsWith('已惊动'))) tags.push('来过这里·惊动过');

  let danger = '要是出岔子，人会更累，也可能带伤回来。';
  const tone: DecisionTone = risk === 'safe' ? 'stable' : risk === 'cautious' ? 'risky' : 'severe';
  if (risk === 'dangerous') danger = '这种地方一旦出岔子，人可能重伤，诊所今晚就得接手。';
  if (risk === 'extreme' && state.day <= 5) danger = '这条路很险。真出事，最坏也足够把人拖成重伤。';
  if (risk === 'extreme' && state.day >= 6 && state.day <= 10) {
    tags.push('严重失败可能失踪');
    danger = '这种地方一旦出大事，人可能连回来的路都找不到。';
  }
  if (risk === 'extreme' && state.day >= 11) {
    tags.push('严重失败可能失踪/死亡');
    danger = '这种地方一旦出大事，人可能失踪；状态太差时，甚至可能回不来。';
  }

  const specialtyText = specialtyBonus && event?.specialty ? ` 这次正好有${ROLE_LABEL[event.specialty]}的熟手同行（+1）。` : '';
  const memoryText = memoryNotes.length ? ` 这里不是第一次来：${memoryNotes.slice(0, 2).join('；')}。` : '';
  return {
    tags,
    summary: decision === 'push'
      ? `往深处走，主要物资可能多带一份，但这一把更难（2D6 -1）。${specialtyText}${memoryText}${danger}`
      : `不贪深处那一点，把路线走稳（2D6 +1）。${specialtyText}${memoryText}${danger}`,
    tone,
  };
}

export type MissingSearchDecision = 'team' | 'radio';

export function missingSearchPreview(state: GameState, survivorId: string, decision: MissingSearchDecision): DecisionPreview {
  const previousFailures = state.storyFlags.filter((flag) => flag.startsWith(`missing_search_failed:${survivorId}:`)).length;
  const deathTag = previousFailures >= 1 ? '再失败就确认死亡' : '再找一次的机会还在';

  if (decision === 'radio') {
    const modifier = Math.max(0, state.buildings.radio - 1);
    return {
      tags: ['电力 -5', `2D6 +${modifier}`, '不用再派人出去', deathTag],
      summary: previousFailures >= 1
        ? '这是第二次找。要是广播里还是没有回应，就只能把这个名字记到纪念墙那边。'
        : '用广播一遍遍喊名字。电台收拾得越好，越可能在杂音里等到回应；这次没找到，之后还来得及再找一次。',
      tone: previousFailures >= 1 ? 'severe' : 'risky',
    };
  }

  const helpers = state.survivors
    .filter((survivor) => survivor.id !== survivorId && survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && !state.dayState.committedSurvivorIds.includes(survivor.id))
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 2);
  const modifier = state.buildings.searchStation + helpers.filter((survivor) => survivor.specialty === 'search' || survivor.specialty === 'watch').length;
  return {
    tags: [`要 ${helpers.length}/2 人`, helpers.length === 2 ? `2D6 +${modifier}` : '人手不够', '队员精力 -12', deathTag],
    summary: helpers.length < 2
      ? '现在凑不出两个还能行动的人，地面这条路走不了。'
      : previousFailures >= 1
        ? `会由 ${helpers.map((helper) => helper.name).join('、')} 出去。这已经是第二次找；再空手回来，就只能接受最坏的结果。`
        : `会由 ${helpers.map((helper) => helper.name).join('、')} 沿路去找。熟路、会搜索或会守夜的人，更容易看见别人漏掉的痕迹。`,
    tone: helpers.length < 2 || previousFailures >= 1 ? 'severe' : 'risky',
  };
}