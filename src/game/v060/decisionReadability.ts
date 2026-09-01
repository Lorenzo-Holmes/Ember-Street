import type { GameState, Role } from '../types';
import { currentExpeditionEvent, type ExpeditionRisk } from './expedition';
import { expeditionSpecialtyBonus } from './expeditionStories';
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
  ]);
  const guaranteed = new Set([
    'emergency-missing-child:wait-child',
    'horde-clinic:combat-first',
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
      tags: critical ? ['医疗判定', '失败可致死'] : ['医疗判定', '失败会恶化'],
      summary: critical
        ? '这是最后的抢救窗口。成功会把伤势拉回重伤；失败会触发尸变死亡。'
        : '成功会把伤势拉回轻伤；失败会继续恶化为危重。',
      tone: critical ? 'severe' : 'risky',
    };
    if (choice.id === 'mortality-medicine') return {
      tags: ['稳定处理', critical ? '危重→重伤' : '重伤→轻伤'],
      summary: '不进行人物判定，支付药品后直接稳定伤势并清除未治疗计时。',
      tone: 'stable',
    };
    if (choice.id === 'mortality-isolate') return {
      tags: critical ? ['不耗药', '可能尸变/死亡'] : ['不耗药', '可能转危重'],
      summary: critical
        ? '危重伤员继续隔离到天亮会直接进入尸变死亡结果。'
        : '当前不会死亡，但伤势会继续推进到危重。',
      tone: critical ? 'severe' : 'risky',
    };
  }

  if (event.id.startsWith('mortality-hope:')) {
    if (choice.id === 'mortality-talk') return {
      tags: ['人物判定', '失败可能失踪'],
      summary: '成功能挽留并恢复希望；失败时对方会在夜里离开并进入失踪状态。',
      tone: 'risky',
    };
    if (choice.id === 'mortality-support') return {
      tags: ['稳定挽留', '口粮换安全'],
      summary: '直接付出口粮换取稳定结果，不需要投骰，也不会让这个人今晚离开。',
      tone: 'stable',
    };
    if (choice.id === 'mortality-leave') return {
      tags: ['不耗资源', '必定失踪'],
      summary: '选择后这个人会在天亮前离开街区，并进入可搜救的失踪状态。',
      tone: 'severe',
    };
  }

  return null;
}

export function nightChoicePreview(state: GameState, event: V060NightEvent, choice: NightChoice): DecisionPreview {
  const special = mortalityPreview(state, event, choice);
  const tags: string[] = [];
  let tone: DecisionTone = choice.strategy === 'resource' ? 'stable' : choice.strategy === 'person' ? 'risky' : 'safe';

  if (choice.strategy === 'person') tags.push('人物判定');
  if (choice.strategy === 'resource') tags.push('稳定');
  if (choice.strategy === 'consequence') tags.push('保守/接受后果');
  if (choice.check?.role) tags.push(`${ROLE_LABEL[choice.check.role]}岗位`);
  if (choice.check?.mode === 'advantage') tags.push('优势');
  if (choice.check?.mode === 'disadvantage') tags.push('劣势');
  tags.push(...costTags(choice));
  tags.push(...genericRiskTags(choice));

  const civilian = civilianIncidentTag(event.id, choice.id);
  if (civilian) {
    tags.push(civilian);
    tone = civilian === '居民必减员' ? 'severe' : 'risky';
  }

  if (special) {
    tags.push(...(special.tags ?? []));
    tone = special.tone ?? tone;
  }

  const summary = special?.summary
    ?? (choice.check
      ? `需要投骰。${choice.check.role ? `${ROLE_LABEL[choice.check.role]}岗位、对应人物状态与设施会影响判定。` : '人物状态与现场条件会影响判定。'}失败时会承担上方标出的风险。`
      : choice.strategy === 'resource'
        ? '不需要投骰。支付标出的资源后直接得到稳定结果。'
        : '不需要投骰，也通常不消耗关键资源，但会直接接受这个选择的长期或状态后果。');

  return { tags: unique(tags), summary, tone };
}

export type ExpeditionDecision = 'push' | 'careful' | 'retreat';

export function expeditionDecisionPreview(state: GameState, decision: ExpeditionDecision, risk: ExpeditionRisk): DecisionPreview {
  if (decision === 'retreat') {
    return {
      tags: ['安全撤回', '无物资收益', '队员精力 -6'],
      summary: '不进行探索判定。搜索队直接返回，今天的探索机会消耗掉，但不会因这次探索事件受伤、失踪或死亡。',
      tone: 'safe',
    };
  }

  const event = currentExpeditionEvent(state);
  const specialtyBonus = expeditionSpecialtyBonus(state, event);
  const locationId = state.expeditionState.locationId;
  const memoryNotes = locationId ? locationMemorySummary(state, locationId) : [];
  const tags = decision === 'push'
    ? ['高收益', '2D6 -1', RISK_LABEL[risk]]
    : ['普通收益', '2D6 +1', RISK_LABEL[risk]];
  if (specialtyBonus && event?.specialty) tags.push(`${ROLE_LABEL[event.specialty]}专长 +1`);
  if (memoryNotes.some((note) => note.startsWith('已侦察'))) tags.push('地点记忆·已侦察');
  if (memoryNotes.some((note) => note.startsWith('已清理'))) tags.push('地点记忆·已清理');
  if (memoryNotes.some((note) => note.startsWith('已惊动'))) tags.push('地点记忆·已惊动');

  let danger = '失败会消耗更多精力，并可能造成伤势。';
  const tone: DecisionTone = risk === 'safe' ? 'stable' : risk === 'cautious' ? 'risky' : 'severe';
  if (risk === 'dangerous') danger = '失败可能造成重伤；灾难结果会让后续医疗压力明显上升。';
  if (risk === 'extreme' && state.day <= 5) danger = '这是极险路线。前 5 天仍有永久死亡保护，但失败依然可能造成严重伤势。';
  if (risk === 'extreme' && state.day >= 6 && state.day <= 10) {
    tags.push('严重失败可能失踪');
    danger = '极险探索在 DAY 6 起，严重失败可能让队员失踪。';
  }
  if (risk === 'extreme' && state.day >= 11) {
    tags.push('严重失败可能失踪/死亡');
    danger = '极险探索在 DAY 11 起，严重失败可能失踪；双一且队员状态较差时可能直接死亡。';
  }

  const specialtyText = specialtyBonus && event?.specialty ? ` 当前事件匹配${ROLE_LABEL[event.specialty]}专长，搜索队额外获得 +1。` : '';
  const memoryText = memoryNotes.length ? ` 这里记得你之前做过的事：${memoryNotes.slice(0, 2).join('；')}。` : '';
  return {
    tags,
    summary: decision === 'push'
      ? `成功或大成功会额外获得主要物资；代价是判定 -1。${specialtyText}${memoryText}${danger}`
      : `判定获得 +1，不追求额外的“继续深入”奖励。${specialtyText}${memoryText}${danger}`,
    tone,
  };
}

export type MissingSearchDecision = 'team' | 'radio';

export function missingSearchPreview(state: GameState, survivorId: string, decision: MissingSearchDecision): DecisionPreview {
  const previousFailures = state.storyFlags.filter((flag) => flag.startsWith(`missing_search_failed:${survivorId}:`)).length;
  const deathTag = previousFailures >= 1 ? '失败将确认死亡' : '失败会累计搜救失败';

  if (decision === 'radio') {
    const modifier = Math.max(0, state.buildings.radio - 1);
    return {
      tags: ['电力 -5', `2D6 +${modifier}`, '不占用人员', deathTag],
      summary: previousFailures >= 1
        ? '这是第二次搜救机会。广播失败会直接确认失踪者死亡。'
        : '广播亭等级提供判定修正；失败后仍可在之后再尝试一次搜救。',
      tone: previousFailures >= 1 ? 'severe' : 'risky',
    };
  }

  const helpers = state.survivors
    .filter((survivor) => survivor.id !== survivorId && survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && !state.dayState.committedSurvivorIds.includes(survivor.id))
    .sort((a, b) => b.energy - a.energy)
    .slice(0, 2);
  const modifier = state.buildings.searchStation + helpers.filter((survivor) => survivor.specialty === 'search' || survivor.specialty === 'watch').length;
  return {
    tags: [`占用 ${helpers.length}/2 人`, helpers.length === 2 ? `2D6 +${modifier}` : '人员不足', '队员精力 -12', deathTag],
    summary: helpers.length < 2
      ? '当前没有两名可行动人物，无法组织地面搜救。'
      : previousFailures >= 1
        ? `将由 ${helpers.map((helper) => helper.name).join('、')} 出发。这是第二次搜救；失败会确认失踪者死亡。`
        : `将由 ${helpers.map((helper) => helper.name).join('、')} 出发。搜索站以及探索/守备专长会提高判定。`,
    tone: helpers.length < 2 || previousFailures >= 1 ? 'severe' : 'risky',
  };
}
