import type { GameState } from '../types';
import type { DecisionPreview, DecisionTone } from './decisionReadability';
import {
  effectiveFinalHordeChoice,
  finalHordeLegacyNotes,
  finalHordeStageNumber,
  isFinalHordeEventId,
} from './finalHorde';
import type { NightChoice, V060NightEvent } from './nightEvents';

const COST_LABEL = {
  ration: '口粮',
  medicine: '药品',
  materials: '材料',
  parts: '零件',
  power: '电力',
} as const;

const CONCESSION_COPY: Record<string, { tags: string[]; summary: string; tone: DecisionTone }> = {
  'final-gate-fallback': {
    tags: ['主动放掉外层', '少让人暴露'],
    summary: '不再争最外面的几米，把人撤进第二道障碍。防线会变短，但也不用再让一个人站在门外硬顶。',
    tone: 'stable',
  },
  'final-grid-dark': {
    tags: ['外围熄灯', '电留给关键处'],
    summary: '不追着把整条街重新点亮。外围会更难看清，但省下来的电继续留给主灯和诊疗。',
    tone: 'stable',
  },
  'final-clinic-delay': {
    tags: ['先补回防线', '重伤员往后排'],
    summary: '先把还能站起来的人包扎好送回街口。防线马上多几双手，但躺着的人只能继续等。',
    tone: 'severe',
  },
  'final-community-ignore': {
    tags: ['把秩序换成战力', '混乱里会有人掉队'],
    summary: '把还能行动的人全部推去守线。前面立刻多出人手，但街里没人照看，混乱里一定会有人掉队。',
    tone: 'severe',
  },
  'final-route-stand': {
    tags: ['主动丢外层', '先疏散人群'],
    summary: '打开东侧通道，把居民往内街送，让压力从外层泄出去。会丢一段街，但人群不会全挤死在一个口子上。',
    tone: 'stable',
  },
  'final-last-retreat': {
    tags: ['不再赌最后一把', '先保住人', '主动放弃外层'],
    summary: '不再为外层最后几米冒险，把人全部收进内街。这一阶段不掷骰，也不再烧库存；代价是主动承认外层守不住。前二十八天已经伤得太重的话，这一步也不会凭空把整条街救回来。',
    tone: 'stable',
  },
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function reducedByPastPreparation(rawChoice: NightChoice, effectiveChoice: NightChoice): boolean {
  if (!rawChoice.cost || !effectiveChoice.cost) return false;
  return (Object.keys(COST_LABEL) as Array<keyof typeof COST_LABEL>)
    .some((key) => (effectiveChoice.cost?.[key] ?? 0) < (rawChoice.cost?.[key] ?? 0));
}

export function effectiveNightChoiceCostLabel(state: GameState, rawChoice: NightChoice): string {
  const choice = effectiveFinalHordeChoice(state, rawChoice);
  if (!choice.cost) return '';
  return (Object.entries(choice.cost) as Array<[keyof typeof COST_LABEL, number | undefined]>)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${COST_LABEL[key]} -${value}`)
    .join(' · ');
}

export function enhanceFinalHordePreview(
  state: GameState,
  event: V060NightEvent,
  rawChoice: NightChoice,
  base: DecisionPreview,
): DecisionPreview {
  if (!isFinalHordeEventId(event.id)) return base;

  const choice = effectiveFinalHordeChoice(state, rawChoice);
  const stage = finalHordeStageNumber(event.id);
  const legacy = finalHordeLegacyNotes(state);
  const stageTag = `最后一夜 ${stage ?? '?'}/6`;
  const legacyTail = legacy.length
    ? ` 过去留下的准备正在帮忙：${legacy.slice(0, 2).join('；')}。`
    : ' 眼下没有别的旧准备能替这一段多挡一下。';

  if (choice.strategy === 'person') {
    return {
      tone: 'risky',
      tags: unique([...base.tags, stageTag, '省下库存', '结果交给人']),
      summary: `不烧这一段的保底物资，把结果交给还站得住的人。专长、伤势、设施和过去的准备都会算在这一把里；守住了最省仓房，失手也会直接落在人身上。${legacyTail}`,
    };
  }

  if (choice.strategy === 'resource') {
    const discounted = reducedByPastPreparation(rawChoice, choice);
    return {
      tone: 'stable',
      tags: unique([...base.tags, stageTag, '不掷骰', '用库存换确定', discounted ? '过去准备省下物资' : '']),
      summary: discounted
        ? `把现在标出的东西直接拿出来，这一段不再交给骰子。过去的准备已经替这一步省下一部分东西，现在这笔就是还要从仓房拿走的量。${legacyTail}`
        : `把现在标出的东西直接拿出来，这一段不再交给骰子。没有额外的旧准备替这一步省库存。${legacyTail}`,
    };
  }

  const concession = CONCESSION_COPY[choice.id];
  if (concession) {
    return {
      tone: concession.tone,
      tags: unique([...base.tags, stageTag, '不掷骰', ...concession.tags]),
      summary: concession.summary,
    };
  }

  return {
    ...base,
    tags: unique([...base.tags, stageTag, '不掷骰']),
  };
}
