import type { EndingId, GameState } from '../../game/types';
import { advanceCampaignDay, finalizeDay } from '../../game/v060/campaign';
import type { CampaignFixedEvent } from '../../game/v060/campaignEvents';
import { nightCausalSignals } from '../../game/v060/causalNight';
import { previewNightPreparation, reopenDayAssignments } from '../../game/v060/dayManagement';
import { ENDINGS, endingHint, type MetaProgress } from '../../game/v060/endings';
import { mealLabel, previewMeal } from '../../game/v060/food';
import { dawnBriefEntries } from '../../game/v060/morningBrief';
import { guardCoverageLabel } from '../../game/v060/defenseFeedback';
import DefensePanel from './DefensePanel';
import { buildingVisual, characterVisual, locationVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import './story-phases.css';

interface CommitProps {
  state: GameState;
  onCommit: (next: GameState) => void;
}

const RESULT_LABEL = { perfect: '完整守住', held: '守住了', damaged: '损失很重', breached: '街区失守' } as const;
const TIER_LABEL = { good: '留下了好消息', normal: '日子还要继续', bad: '没能留下全部', secret: '还有下一页' } as const;

const corePresent = (state: GameState) => state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;
const population = (state: GameState) => corePresent(state) + Math.max(0, state.civilianResidents);

const mealCoverageLine = (coverage: number) => coverage >= 0.98
  ? '今晚这锅能顾到所有人。'
  : coverage >= 0.8
    ? '今晚这锅能顾到大多数人。'
    : coverage >= 0.6
      ? '今晚会有人得少吃一点。'
      : '今晚这锅明显不够分。';

const mealMorningLine = (energyRecovery: number, hopeDelta: number) => `${energyRecovery > 0 ? '明早还能缓回一些力气' : '这顿饭补不回多少力气'}；${hopeDelta > 0 ? '今晚分饭时能安稳些' : hopeDelta < 0 ? '仍会有人吃不饱' : '人心暂时不会更坏'}。`;

const staffed = (value: '无人' | '居民协助' | '有人值守', place: string) => value === '有人值守'
  ? `${place}有人守着`
  : value === '居民协助'
    ? `${place}有居民搭手`
    : `${place}没人值守`;

function StoryArt({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1-phase-art" aria-label={label} style={visualAssetStyle(asset)}>{!asset ? <span>{label}</span> : null}</div>;
}

function eventArt(event: CampaignFixedEvent): VisualAsset | undefined {
  if (event.survivorId) return characterVisual(event.survivorId);
  if (event.buildingId) return buildingVisual(event.buildingId);
  if (event.locationId) return locationVisual(event.locationId);
  return buildingVisual('shelter');
}

export function CampaignEventV1({ state, event, onCommit }: { state: GameState; event: CampaignFixedEvent; onCommit: (next: GameState, eventId: string) => void }) {
  const kind = event.kind === 'character' ? '有人做了决定' : event.kind === 'building' ? '街里多了一处能用的地方' : event.kind === 'community' ? '住下来的人越来越多' : '有人带回一条新路';
  return (
    <main className="v1-mobile-page v1-story-page notebook-page notebook-page--story-event">
      <header className="v1-page-title"><span>第 {state.day} 天 · {kind}</span><h1>{event.title}</h1><p>这件事先记下来，再安排今天的人手。</p></header>
      <StoryArt asset={eventArt(event)} label={event.title}/>
      <section className="v1-phase-note"><span>刚刚发生的</span><p>{event.body}</p></section>
      <button className="v1-primary-action v1-phase-primary" onClick={() => onCommit(state, event.id)}>{event.actionLabel}</button>
    </main>
  );
}

export function DuskV1({ state, onCommit }: CommitProps) {
  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const signals = nightCausalSignals(state);
  const people = population(state);
  const entries = [
    ['口粮', state.inventory.ration, state.inventory.ration <= people, '不够再吃一天'],
    ['药品', state.inventory.medicine, state.inventory.medicine <= 2, '得省着用'],
    ['电力', state.inventory.power, state.inventory.power <= 20, '少开几盏灯'],
    ['材料', state.inventory.materials, state.inventory.materials <= 2, '补不起下一处'],
    ['零件', state.inventory.parts, state.inventory.parts <= 1, '箱底快空了'],
    ['希望', state.hope, state.hope < 30, '人心快散了'],
    ['居民', people, false, ''],
  ] as const;
  const lowCount = entries.filter((entry) => entry[2]).length;
  const committed = state.dayState.returnedExpeditions > 0 || state.dayState.committedSurvivorIds.length > 0;
  return (
    <main className="v1-mobile-page v1-story-page notebook-page notebook-page--dusk-v1">
      <header className="v1-page-title"><span>第 {state.day} 天 · 黄昏</span><h1>太阳快下去了。</h1><p>门已经开始上闩。饭、药、人手和门墙，最后再看一遍。</p></header>
      <section className="v1-phase-ledger">
        <header><div><span>仓房清点</span><h2>手里还剩这些</h2></div><small>{lowCount ? `${lowCount} 样东西快见底` : '今天都记清了'}</small></header>
        <div>{entries.map(([label, value, low, note]) => <p className={low ? 'is-low' : ''} key={label}><span>{label}</span><b>{value}</b>{low ? <em>{note}</em> : null}</p>)}</div>
        {!!state.storyItems.length && <small>箱底另外收着：{state.storyItems.join('、')}</small>}
      </section>
      <DefensePanel state={state} context="dusk"/>
      <section className="v1-phase-columns">
        <article><span>饭锅</span><h2>{mealLabel(meal.quality)}</h2><p>{mealCoverageLine(meal.coverage)}</p><small>锅里大约够 {meal.cookingCapacity.toFixed(1)} 人吃，街里有 {meal.residentCount} 人。</small><strong>{mealMorningLine(meal.energyRecovery, meal.hopeDelta)}</strong></article>
        <article><span>夜间值守</span><h2>{guardCoverageLabel(prep)}</h2><p>{staffed(prep.medical, '诊疗室')}；{staffed(prep.repair, '修补处')}；广播间{prep.radio === '有人值守' ? '有人听着' : '今晚没人'}。</p><small>值守反映人手安排，不代表门板和围栏已经修好。</small></article>
      </section>
      <section className="v1-phase-checklist"><header><span>入夜前</span><h2>白天露出的麻烦</h2></header><ul>{(signals.length ? signals : ['今晚暂时没有新的坏消息。']).map((signal) => <li key={signal}>{signal}</li>)}</ul></section>
      <button className="v1-primary-action v1-phase-primary" onClick={() => onCommit(finalizeDay(state))}>合上本子，等天黑</button>
      {!committed ? <button className="v1-phase-link" onClick={() => onCommit(reopenDayAssignments(state))}>← 还有时间，重新安排</button> : <p className="v1-phase-margin">今天已经有人出过街，这一页不能重写。</p>}
    </main>
  );
}

export function NightSummaryV1({ state, onCommit }: CommitProps) {
  const horde = state.nightState.hordeActive;
  return (
    <main className="v1-mobile-page v1-story-page notebook-page notebook-page--night-summary-v1">
      <header className="v1-page-title"><span>第 {state.day} 天 · 天快亮了</span><h1>{horde ? '撞门声终于远了。' : '外面重新安静下来。'}</h1><p>{horde ? '尸潮退了，门后留下什么，要等天亮才能看清。' : '这一夜留下的事都已经记下。'}</p></header>
      <section className="v1-phase-note"><span>门外</span><p>{horde ? '街面上还散着拖动和撞击的声音，但已经不再往门口压。' : '发电机的声音重新盖住了远处的脚步。'}</p></section>
      <button className="v1-primary-action v1-phase-primary" onClick={() => onCommit({ ...state, phase: 'summary', lastMessage: `第 ${state.day} 天 · 天亮了` })}>等天亮再清点</button>
    </main>
  );
}

export function DawnV1({ state, onCommit }: CommitProps) {
  const brief = dawnBriefEntries(state);
  return (
    <main className="v1-mobile-page v1-story-page notebook-page notebook-page--dawn-v1">
      <header className="v1-page-title"><span>第 {state.day} 天 · 清晨</span><h1>{state.day === 29 ? '最后一夜过去了。' : '天亮了。'}</h1><p>{state.nightState.hordeActive ? '街道重新有了颜色，昨夜留下的损失也都看清了。' : '先数人，再看门墙和仓房。今天仍然有事要做。'}</p></header>
      <section className="v1-phase-tally" aria-label="昨夜清点">
        <p><span>没能活下来</span><b>{state.campaignStats.deaths}</b></p>
        <p><span>还没回来</span><b>{state.campaignStats.missing}</b></p>
        <p><span>带回街里</span><b>{state.campaignStats.rescued}</b></p>
        <p><span>街里还在</span><b>{population(state)}</b></p>
      </section>
      <DefensePanel state={state} context="dawn"/>
      <section className="v1-phase-checklist"><header><span>昨夜留下的</span><h2>天亮以后才看清</h2></header>{brief.length ? <ul>{brief.map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ul> : <p>没有新的名字，也没有新的空床。</p>}</section>
      <button className="v1-primary-action v1-phase-primary" onClick={() => onCommit(advanceCampaignDay(state))}>{state.day === 29 ? '翻到最后一页' : `翻到第 ${state.day + 1} 天`}</button>
    </main>
  );
}

export function EndingV1({ state, meta, onRestart }: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending;
  if (!ending) return null;
  return (
    <main className="v1-mobile-page v1-story-page notebook-page notebook-page--ending-v1">
      <header className="v1-page-title"><span>第 30 天 · 最后一页</span><h1>《{ending.title}》</h1><p>{TIER_LABEL[ending.tier]}</p></header>
      <section className="v1-ending-story"><p>{ending.summary}</p></section>
      <section className="v1-phase-tally v1-ending-tally" aria-label="三十天清点">
        <p><span>带回来的人</span><b>{state.campaignStats.rescued}</b></p>
        <p><span>还在这条街</span><b>{population(state)}</b></p>
        <p><span>没能活下来</span><b>{state.campaignStats.deaths}</b></p>
        <p><span>最后一夜</span><b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '没写下'}</b></p>
      </section>
      <section className="v1-ending-pages"><header><span>留下的结局</span><small>{meta.endingsUnlocked.length}/13</small></header><div>{(Object.keys(ENDINGS) as EndingId[]).map((id) => <p className={meta.endingsUnlocked.includes(id) ? 'seen' : ''} key={id}><strong>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].title : '这一页还空着'}</strong><small>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].hint : endingHint(id)}</small></p>)}</div></section>
      <button className="v1-primary-action v1-phase-primary" onClick={onRestart}>从第一天再守一次</button>
    </main>
  );
}
