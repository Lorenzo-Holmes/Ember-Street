import type { GameState } from '../types';
import type { DecisionPreview, DecisionTone } from './decisionReadability';
import {
  effectiveFinalHordeChoice,
  finalHordeLegacyNotes,
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
    tags: ['先撤进内街', '先保住人', '主动放弃外层'],
    summary: '不再为外层最后几米冒险，把人全部收进内街。这里不用再拿东西，也不让谁留在外面冒险；代价是放弃外层。前些天留下的损失太重，这一步也救不回整条街。',
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
    .map(([key, value]) => `要用${COST_LABEL[key]} ${value}`)
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
  const legacy = finalHordeLegacyNotes(state);
  const stageTag = `尸潮压到 · ${event.title.replace(/^第[^·]+阵\s*·\s*/, '')}`;
  const legacyTail = legacy.length
    ? ` 过去留下的准备正在帮忙：${legacy.slice(0, 2).join('；')}。`
    : ' 眼下没有别的旧准备能替这一段多挡一下。';

  if (choice.strategy === 'person') {
    return {
      tone: 'risky',
      tags: unique([...base.tags, stageTag, '不用再拿东西', '得让人顶上']),
      summary: `不动仓房里的东西，让还站得住的人去顶。熟手、伤势和以前修好的地方都能帮上忙；真守不住，代价会直接落在人身上。${legacyTail}`,
    };
  }

  if (choice.strategy === 'resource') {
    const discounted = reducedByPastPreparation(rawChoice, choice);
    return {
      tone: 'stable',
      tags: unique([...base.tags, stageTag, '不用冒险', '直接拿东西顶住', discounted ? '以前的准备省下一些' : '']),
      summary: discounted
        ? `把标出的东西直接拿出来，不再让人冒险。以前留下的准备已经省下一部分，现在写着的就是还要从仓房拿走的量。${legacyTail}`
        : `把标出的东西直接拿出来，不再让人冒险。没有别的旧准备能替这一步省下东西。${legacyTail}`,
    };
  }

  const concession = CONCESSION_COPY[choice.id];
  if (concession) {
    return {
      tone: concession.tone,
      tags: unique([...base.tags, stageTag, '不用冒险', ...concession.tags]),
      summary: concession.summary,
    };
  }

  return {
    ...base,
    tags: unique([...base.tags, stageTag, '不用冒险']),
  };
}
