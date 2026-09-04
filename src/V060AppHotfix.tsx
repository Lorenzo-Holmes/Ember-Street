import { useEffect, useMemo, useRef, useState } from 'react';
import SocialStatusPanel from './components/v060/SocialStatusPanel';
import V060NightScene from './V060NightScene';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, DayAssignment, EndingId, GameState, SurvivorCondition } from './game/types';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from './game/v060/buildings';
import {
  advanceCampaignDay,
  createV060InitialState,
  finalizeDay,
  resolveExpeditionStance,
  retreatCurrentExpedition,
  searchForMissing,
  upgradeSaveToV060,
} from './game/v060/campaign';
import { nightCausalSignals } from './game/v060/causalNight';
import { communitySupportSummary, selectCommunitySupportMode } from './game/v060/community';
import { dayAttentionSummary } from './game/v060/dayAttention';
import { expeditionDecisionPreview, missingSearchPreview } from './game/v060/decisionReadability';
import {
  assignDayJob,
  canTakeDayAssignment,
  clearDayJob,
  hasCommittedDayAction,
  lockDayAssignments,
  previewDispatchConfirmation,
  previewNightPreparation,
  reopenDayAssignments,
} from './game/v060/dayManagement';
import { ENDINGS, endingHint, loadMetaProgress, recordEnding, type MetaProgress } from './game/v060/endings';
import { energyLabel, trustLabel } from './game/v060/trust';
import {
  EXPEDITION_LOCATIONS,
  currentExpeditionEvent,
  drawExpeditionEvent,
  expeditionRiskLabel,
  expeditionRiskScore,
  startExpedition,
} from './game/v060/expedition';
import { mealLabel, previewMeal } from './game/v060/food';
import { isLocationUnlocked, pendingCampaignEvent, resolveCampaignEvent } from './game/v060/campaignEvents';
import { dawnBriefEntries } from './game/v060/morningBrief';

const JOBS: Array<{ id: DayAssignment; label: string; note: string }> = [
  { id: 'expedition', label: '探索', note: '趁天亮去街外找吃的、药和还能用的东西。' },
  { id: 'repair', label: '维修', note: '把门、墙和线路再撑一晚。' },
  { id: 'medical', label: '医疗', note: '去诊疗室守着，先照看伤得最重的人。' },
  { id: 'watch', label: '守备', note: '守着街口，盯住那些不该靠近的动静。' },
  { id: 'radio', label: '广播', note: '把天线架起来，听听这座城里还有谁。' },
  { id: 'cook', label: '炊事', note: '把现有的东西尽量做成一顿热的。' },
  { id: 'rest', label: '休息', note: '让人睡一会儿。今晚可能很长。' },
];

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡',
};
export const SPECIALTY_LABEL: Record<string, string> = {
  search: '熟路',
  repair: '维修熟手',
  medical: '懂医',
  watch: '守夜熟手',
  cook: '会做饭',
  radio: '懂广播',
  rest: '能补位',
};
const BUILDING_CONDITION = ['封着', '勉强能用', '已经能用', '修稳了'] as const;
const RESULT_LABEL = { perfect: '完美守住', held: '守住', damaged: '严重受损', breached: '街区失守' } as const;
const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];
const corePresent = (state: GameState) => state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
const population = (state: GameState) => corePresent(state) + state.civilianResidents;
const mainLightLabel = (stage: number) => stage <= 0 ? '熄着' : stage === 1 ? '微亮' : stage === 2 ? '亮得很稳' : '照过街口';
export const buildingConditionLabel = (level: number) => BUILDING_CONDITION[Math.max(0, Math.min(3, level))];
export const mealCoverageLine = (coverage: number) => coverage >= 0.98
  ? '今晚这锅能顾到所有人。'
  : coverage >= 0.8
    ? '今晚这锅能顾到大多数人。'
    : coverage >= 0.6
      ? '今晚会有人得少吃一点。'
      : '今晚这锅明显不够分。';
export const nightPreparationLine = (defense: '薄弱' | '一般' | '良好') => defense === '良好'
  ? '守岗人手较充足。'
  : defense === '一般'
    ? '已安排守岗，力量有限。'
    : '街口尚未安排守岗。';
const mealMorningLine = (energyRecovery: number, hopeDelta: number) => `${energyRecovery > 0 ? '明早还能缓回一些力气' : '这顿饭补不回多少力气'}；${hopeDelta > 0 ? '今晚分饭时能安稳些' : hopeDelta < 0 ? '仍会有人吃不饱' : '人心暂时不会更坏'}。`;
const dutyCoverageLine = (medical: '无人' | '居民协助' | '有人值守', repair: '无人' | '居民协助' | '有人值守', radio: '无人' | '有人值守') => `诊疗室${medical === '有人值守' ? '有人守着' : medical === '居民协助' ? '有居民搭手' : '没人值守'}；修补处${repair === '有人值守' ? '有人守着' : repair === '居民协助' ? '有居民搭手' : '没人值守'}；广播间${radio === '有人值守' ? '有人听着' : '今晚没人'}。`;

function initialRun(): GameState {
  const loaded = loadGame();
  return loaded ? upgradeSaveToV060(loaded) : createV060InitialState();
}

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function DecisionTags({ tags }: { tags: string[] }) {
  return <div className="v6-survivor__status" style={{ margin: '7px 0 2px' }}>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

function InventoryBar({ state }: { state: GameState }) {
  return (
    <section className="v6-inventory" aria-label="街区仓房">
      <div className="v6-inventory__title"><span>仓房</span><small>东西只会越来越少</small></div>
      <div className="v6-resource-grid">
        <div><span>口粮</span><b>{state.inventory.ration}</b></div>
        <div><span>药品</span><b>{state.inventory.medicine}</b></div>
        <div><span>电力</span><b>{state.inventory.power}</b></div>
        <div><span>材料</span><b>{state.inventory.materials}</b></div>
        <div><span>零件</span><b>{state.inventory.parts}</b></div>
        <div><span>希望</span><b>{state.hope}</b></div>
        <div><span>防线</span><b>{Math.round(state.defense)}</b></div>
        <div><span>居民</span><b>{population(state)}</b></div>
      </div>
      {!!state.storyItems.length && <div className="v6-story-items"><strong>另外收着</strong>{state.storyItems.map((item) => <span key={item}>{item}</span>)}</div>}
    </section>
  );
}

function DuskLedger({ state }: { state: GameState }) {
  const people = population(state);
  const entries = [
    { label: '口粮', value: state.inventory.ration, low: state.inventory.ration <= people, note: '不够再吃一天' },
    { label: '药品', value: state.inventory.medicine, low: state.inventory.medicine <= 2, note: '得省着用' },
    { label: '电力', value: state.inventory.power, low: state.inventory.power <= 20, note: '少开几盏灯' },
    { label: '材料', value: state.inventory.materials, low: state.inventory.materials <= 2, note: '补不起下一处' },
    { label: '零件', value: state.inventory.parts, low: state.inventory.parts <= 1, note: '箱底快空了' },
    { label: '希望', value: state.hope, low: state.hope < 30, note: '人心快散了' },
    { label: '防线', value: Math.round(state.defense), low: state.defense < 45, note: '防线需要加固' },
    { label: '居民', value: people, low: false, note: '' },
  ];
  const lowCount = entries.filter((entry) => entry.low).length;
  return (
    <section className="dusk-ledger" aria-label="黄昏仓房记录">
      <header>
        <div><span>仓房清点</span><h2>仓房里还剩——</h2></div>
        <p className="dusk-correction"><del>{lowCount ? '应该还够用' : '今晚先别数了'}</del><ins>{lowCount ? `${lowCount} 样东西快见底了` : '还是得每天记清'}</ins></p>
      </header>
      <div className="dusk-ledger__grid">
        {entries.map((entry, index) => <div className={entry.low ? 'is-low' : ''} key={entry.label} style={{ '--ledger-tilt': `${index % 2 ? 0.45 : -0.35}deg` } as React.CSSProperties}>
          <span>{entry.label}</span><b>{entry.value}</b>{entry.low ? <small>{entry.note}</small> : null}
        </div>)}
      </div>
      {!!state.storyItems.length && <p className="dusk-ledger__kept"><strong>另外压在箱底：</strong>{state.storyItems.join('、')}</p>}
    </section>
  );
}

function StreetVisual({ state }: { state: GameState }) {
  return (
    <section className={`v6-street v6-street--stage-${state.mainLightStage}`}>
      <div className="v6-street__sky"/><div className="v6-building v6-building--left"/><div className="v6-building v6-building--right"/>
      <div className="v6-main-light"><i/><strong>主灯 · {mainLightLabel(state.mainLightStage)}</strong></div>
      <div className="v6-street__meta"><span>街里 {population(state)} 人</span><span>熟面孔 {corePresent(state)}</span><span>DAY {state.day}/30</span><span>{state.forecast.title}</span></div>
    </section>
  );
}

function MemorialPanel({ state }: { state: GameState }) {
  if (!state.memorials.length) return null;
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>纪念墙</span><h2>这里曾经有人</h2></div><small>{state.memorials.length} 个名字</small></div>
      <div className="v6-survivors">{state.memorials.map((entry) => (
        <article className="v6-survivor" key={entry.survivorId}><div className="v6-survivor__top"><div><h3>{entry.name}</h3><span>DAY {entry.day} · {entry.cause}</span></div></div><p>{entry.epitaph}</p></article>
      ))}</div>
    </section>
  );
}

function CampaignEventScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const event = pendingCampaignEvent(state);
  if (!event) return null;
  const kind = event.kind === 'character' ? '有人找你' : event.kind === 'building' ? '街上有了新动静' : event.kind === 'community' ? '街里的人' : '带回来的消息';
  const subtitle = event.kind === 'location'
    ? '这条路，现在有人知道怎么走了'
    : event.kind === 'building'
      ? '今晚开始，这里终于能派上用场'
      : event.kind === 'community'
        ? '这里越来越不像临时落脚的地方'
        : '有些话，只有真正留下以后才会说';
  return (
    <main className="v6-shell notebook-page notebook-page--campaign-event">
      <header className="v6-page-head"><span>{kind} · DAY {state.day}</span><h1>{event.title}</h1><p>{event.body}</p></header>
      <InventoryBar state={state}/>
      <section className="v6-section">
        <div className="v6-section__head"><div><span>{kind}</span><h2>{subtitle}</h2></div></div>
        <button className="v6-cta" onClick={() => commit(resolveCampaignEvent(state, event.id), setState)}>{event.actionLabel}</button>
      </section>
    </main>
  );
}

function CommunityPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>街里的人手</span><h2>{summary.activeResidents} 人已经能搭把手 · {summary.pendingResidents} 人还没缓过来</h2></div><small>{summary.unlocked ? `今天大家在帮：${summary.supportModeLabel}` : '等人手再多一点，才轮得开'}</small></div>
      <section className="v6-preview">
        <div><span>饭馆</span><strong>{summary.cookingCapacity > 0 ? `能多顾到约 ${summary.cookingCapacity.toFixed(1)} 人份` : '还腾不出额外人手'}</strong><small>有人帮着洗、切、分餐，锅里的东西更容易顾全。</small></div>
        <div><span>修补</span><strong>{summary.repairDefense > 0 ? '今晚能多补一轮薄弱处' : '今天还轮不开额外修补'}</strong><small>搬铁皮、递工具、堵住松开的缝。</small></div>
        <div><span>街口</span><strong>{summary.nightRiskReduction > 0 ? '夜里的岗能轮得更开' : '今晚还是得靠原来的人盯着'}</strong><small>门口多一双眼睛，就少一点没人看见的空当。</small></div>
        <div><span>诊疗室</span><strong>{summary.medicalAssist > 0 ? `能多照看 ${summary.medicalAssist} 个轻伤的人` : '还腾不出额外照护人手'}</strong><small>有人递药、换水、看着轻伤，懂医的人才能把手留给更重的伤。</small></div>
      </section>
      {summary.unlocked && <div className="v6-job-grid">
        {(['logistics', 'repair', 'defense'] as const).map((mode) => <button key={mode} className={summary.supportMode === mode ? 'active' : ''} disabled={state.dayState.assignmentsLocked} onClick={() => commit(selectCommunitySupportMode(state, mode), setState)}>{mode === 'logistics' ? '去饭馆搭手' : mode === 'repair' ? '帮着修补' : '去街口轮值'}</button>)}
      </div>}
    </section>
  );
}

function BuildingsPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>维修记录</span><h2>天黑前，先把要紧的地方修起来</h2></div><small>坏在哪里、还缺多少，都记在下面</small></div>
      <div className="v6-buildings">{BUILDING_IDS.map((id) => {
        const definition = V060_BUILDINGS[id];
        const level = state.buildings[id];
        const next = definition.levels[level] ?? null;
        const check = canUpgradeBuilding(state, id);
        return (
          <article className="v6-building-card" key={id}>
            <div><span>{definition.name}</span><b>{buildingConditionLabel(level)}</b></div>
            <h3>{level ? definition.levels[level - 1].title : definition.inactiveTitle}</h3>
            <p>{level ? definition.levels[level - 1].unlock : definition.inactiveDescription}</p>
            {next ? <><small>要用：材料 {next.materials} · 零件 {next.parts}</small><button disabled={!check.allowed || state.dayState.assignmentsLocked} onClick={() => commit(upgradeBuilding(state, id), setState)}>{state.dayState.assignmentsLocked ? '人已经派出去了' : check.allowed ? level === 0 ? '动手抢修' : '接着修' : check.reason}</button></> : <strong className="v6-max">这里已经修完</strong>}
          </article>
        );
      })}</div>
    </section>
  );
}

export function MissingPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const missing = state.survivors.filter((s) => s.condition === 'missing');
  if (!missing.length) return null;
  return (
    <section className="v6-section v6-missing-ledger">
      <div className="v6-section__head"><div><span>没回来的人</span><h2>还有人没回来</h2></div><small>再拖一天，留下的痕迹只会更少</small></div>
      <div className="v6-survivors">{missing.map((s) => {
        const attempted = state.storyFlags.includes(`missing_search:${s.id}:${state.day}`);
        const teamPreview = missingSearchPreview(state, s.id, 'team');
        const radioPreview = missingSearchPreview(state, s.id, 'radio');
        return (
          <article className="v6-survivor v6-missing-person" key={s.id}>
            <div className="v6-survivor__top"><div><h3>{s.name}</h3><span>昨晚以前，还能在这条街上看见这个人。</span></div><div className="v6-missing-person__mark"><b>未归</b><small>到现在没消息</small></div></div>
            <p>{attempted ? '今天已经出去找过一次了。' : '地上还能找脚印，广播也还能喊名字。只是两条路都要付代价。'}</p>
            <div className="v6-missing-actions">
              <button className="v6-link v6-missing-action" disabled={!teamPreview.available} onClick={() => commit(searchForMissing(state, s.id, 'team'), setState)}>
                <strong>派两个人沿路找</strong><DecisionTags tags={teamPreview.tags}/><small>{teamPreview.summary}</small>
              </button>
              <button className="v6-link v6-missing-action" disabled={!radioPreview.available} onClick={() => commit(searchForMissing(state, s.id, 'radio'), setState)}>
                <strong>在广播里喊名字</strong><DecisionTags tags={radioPreview.tags}/><small>{radioPreview.summary}</small>
              </button>
            </div>
          </article>
        );
      })}</div>
    </section>
  );
}

function AssignmentPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const criticalCount = state.survivors.filter((survivor) => survivor.condition === 'critical').length;
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>今日派遣</span><h2>天黑以前，每个人都得有个去处</h2></div><small>{criticalCount ? `${criticalCount} 人伤得太重，今天动不了 · ` : ''}太阳落下以后，就没人能换班了</small></div>
      <div className="v6-survivors">{state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').map((survivor) => {
        const condition = survivor.condition ?? 'healthy';
        const unavailable = condition === 'critical';
        const current = state.dayAssignments[survivor.id];
        const committed = state.dayState.committedSurvivorIds.includes(survivor.id);
        return (
          <article className={`v6-survivor ${unavailable || committed ? 'is-unavailable' : ''}`} key={survivor.id}>
            <div className="v6-survivor__top"><div><h3>{survivor.name}</h3><span>{committed ? '今天已经忙过一趟了' : survivor.trait ?? survivor.perk}</span></div><div><b>{energyLabel(survivor.energy)}</b><small>精神</small></div></div>
            <div className="v6-survivor__status"><span>{CONDITION_LABEL[condition]}</span><span>{trustLabel(survivor.trust)}</span><span>{SPECIALTY_LABEL[survivor.specialty] ?? '能搭把手'}</span></div>
            <div className="v6-job-grid">{JOBS.map((job) => {
              const availability = canTakeDayAssignment(state, survivor.id, job.id);
              const disabled = !availability.allowed;
              return <button key={job.id} className={current === job.id ? 'active' : ''} disabled={disabled} title={availability.reason ?? job.note} onClick={() => commit(current === job.id ? clearDayJob(state, survivor.id) : assignDayJob(state, survivor.id, job.id), setState)}>{job.label}</button>;
            })}</div>
          </article>
        );
      })}</div>
    </section>
  );
}

function ExpeditionStatus({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.expeditionState.departed) return null;
  const party = state.expeditionState.activePartyIds.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、');
  const location = EXPEDITION_LOCATIONS.find((item) => item.id === state.expeditionState.locationId)?.name ?? '未知地点';
  const event = currentExpeditionEvent(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>外出的人还没回来</span><h2>{party} · {location}</h2></div><small>今天的人手已经定了</small></div>
      <p>{event ? `途中传来消息：${event.title}` : '他们还在路上。'}</p>
      <button className="v6-cta" onClick={() => commit({ ...state, phase: 'expedition' }, setState)}>去看他们传回来的消息</button>
    </section>
  );
}

function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [reviewingDispatch, setReviewingDispatch] = useState(false);
  const fixedEvent = !state.expeditionState.departed ? pendingCampaignEvent(state) : null;
  if (fixedEvent) return <CampaignEventScreen state={state} setState={setState}/>;

  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const dispatch = previewDispatchConfirmation(state);
  const attention = dayAttentionSummary(state);
  const assigned = Object.keys(state.dayAssignments).length;
  const available = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing' && s.condition !== 'critical' && !state.dayState.committedSurvivorIds.includes(s.id)).length;
  const lock = () => {
    const locked = lockDayAssignments(state);
    const pendingExpeditions = Object.entries(locked.dayAssignments).filter(([id, job]) => job === 'expedition' && !locked.dayState.committedSurvivorIds.includes(id)).length;
    commit({ ...locked, phase: pendingExpeditions ? 'expedition' : 'dusk' }, setState);
  };

  return (
    <main className="v6-shell notebook-page notebook-page--day">
      <header className="v6-topbar"><div><span>EMBER STREET</span><strong>DAY {state.day}</strong></div><div><b>{state.day === 29 ? '最后的白天' : state.forecast.title}</b><small>{state.day === 29 ? '北边从昨晚起就没安静过。天黑前，把该做的都做完。' : state.forecast.detail}</small></div></header>
      <StreetVisual state={state}/><InventoryBar state={state}/>
      <ExpeditionStatus state={state} setState={setState}/>
      {!state.dayState.assignmentsLocked && !reviewingDispatch && attention.missingCount > 0 && <MissingPanel state={state} setState={setState}/>}
      {!reviewingDispatch && attention.socialNeedsAttention && <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)}/>}      
      {!state.dayState.assignmentsLocked && !reviewingDispatch && attention.communityNeedsChoice && <CommunityPanel state={state} setState={setState}/>}      
      {!state.dayState.assignmentsLocked && !reviewingDispatch && <AssignmentPanel state={state} setState={setState}/>}      
      {!state.dayState.assignmentsLocked && reviewingDispatch && <section className="v6-section">
        <div className="v6-section__head"><div><span>天快黑了</span><h2>最后再看一眼，今天每个人去了哪里</h2></div><small>{dispatch.manuallyAssigned} 人有安排 · {dispatch.autoResting} 人留下休息{attention.buildableCount ? ` · 还有 ${attention.buildableCount} 处地方今天能收拾` : ''}</small></div>
        <div className="v6-survivors">{dispatch.entries.map((entry) => <article className={`v6-survivor ${entry.unavailable || entry.committed ? 'is-unavailable' : ''}`} key={entry.survivorId}>
          <div className="v6-survivor__top"><div><h3>{entry.name}</h3><span>{entry.automatic ? '今天没人叫他/她出门' : entry.committed ? '今天已经忙过一趟了' : '今天就去这里'}</span></div><div><b>{entry.label}</b><small>{entry.unavailable ? '去不了' : entry.automatic ? '留下' : '定了'}</small></div></div>
        </article>)}</div>
          <section className="v6-preview"><div><span>今晚锅里</span><strong>{mealLabel(meal.quality)}</strong><small>{mealCoverageLine(meal.coverage)}</small><small>锅里大约够 {meal.cookingCapacity.toFixed(1)} 人吃，街里现在有 {meal.residentCount} 人。{mealMorningLine(meal.energyRecovery, meal.hopeDelta)}</small></div><div><span>夜里靠什么</span><strong>{nightPreparationLine(prep.defense)}</strong><small>{dutyCoverageLine(prep.medical, prep.repair, prep.radio)}{dispatch.expeditionCount ? ` 还有 ${dispatch.expeditionCount} 人在街外。` : ''}</small></div></section>
        <p className="v6-message">没人安排的，就留在屋里歇一歇。出去搜索的人会先去挑今天要走的路；没有人出门，就直接等天黑。</p>
        {attention.buildableCount > 0 && <p className="v6-message">还有 {attention.buildableCount} 处地方今天能动工。要修，就得趁天黑前回去。</p>}
        <button className="v6-cta" onClick={lock}>就这么定了</button>
        <button className="v6-link" onClick={() => setReviewingDispatch(false)}>← 再改一遍</button>
      </section>}
      {!reviewingDispatch && <section className="v6-preview"><div><span>今晚锅里</span><strong>{mealLabel(meal.quality)}</strong><small>{mealCoverageLine(meal.coverage)}</small><small>锅里大约够 {meal.cookingCapacity.toFixed(1)} 人吃，街里现在有 {meal.residentCount} 人。{mealMorningLine(meal.energyRecovery, meal.hopeDelta)}</small></div><div><span>夜里靠什么</span><strong>{nightPreparationLine(prep.defense)}</strong><small>{dutyCoverageLine(prep.medical, prep.repair, prep.radio)}</small></div></section>}
      {!state.expeditionState.departed && !reviewingDispatch && (state.dayState.assignmentsLocked
        ? <button className="v6-cta" onClick={() => commit({ ...state, phase: 'dusk' }, setState)}>等天黑</button>
        : <button className="v6-cta" disabled={!available && !Object.keys(state.dayAssignments).length} onClick={() => setReviewingDispatch(true)}>安排好了 <small>{assigned} 人有安排 · 其余人休息{attention.buildableCount ? ` · 还有 ${attention.buildableCount} 处能收拾` : ''}</small></button>)}
      {!state.dayState.assignmentsLocked && !reviewingDispatch && <BuildingsPanel state={state} setState={setState}/>}      
      {!reviewingDispatch && !attention.communityNeedsChoice && <CommunityPanel state={state} setState={setState}/>}      
      {!reviewingDispatch && !attention.socialNeedsAttention && <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)}/>}      
      <MemorialPanel state={state}/>
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

function ExpeditionScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const assignedIds = state.survivors
    .filter((s) => state.dayAssignments[s.id] === 'expedition' && s.condition !== 'dead' && s.condition !== 'missing' && !state.dayState.committedSurvivorIds.includes(s.id))
    .map((s) => s.id)
    .slice(0, 2);
  const availableLocations = EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
  const [party, setParty] = useState<string[]>(assignedIds);
  const [locationId, setLocationId] = useState(availableLocations[availableLocations.length - 1]?.id ?? 'convenience-store');
  const event = currentExpeditionEvent(state);
  const risk = expeditionRiskLabel(expeditionRiskScore(state, party, locationId));
  const activeRisk = state.expeditionState.departed
    ? expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, state.expeditionState.locationId ?? locationId))
    : risk;
  const pushPreview = expeditionDecisionPreview(state, 'push', activeRisk);
  const carefulPreview = expeditionDecisionPreview(state, 'careful', activeRisk);
  const retreatPreview = expeditionDecisionPreview(state, 'retreat', activeRisk);

  const begin = () => {
    if (!isLocationUnlocked(state, locationId)) return;
    let next = startExpedition(state, party, locationId);
    if (!next.expeditionState.departed) return commit(next, setState);
    next = drawExpeditionEvent(next);
    commit({ ...next, phase: 'street', lastMessage: `${party.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、')}已经出发。今天剩下的人手不会再改。` }, setState);
  };

  const finish = (stance: 'push' | 'careful') => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const wasFirstVisit = state.expeditionState.locationId ? !state.storyFlags.includes(`visited:${state.expeditionState.locationId}`) : false;
    let next = resolveExpeditionStance(state, stance);
    const committedSurvivorIds = [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])];
    if (wasFirstVisit && next.campaignStats.locationsDiscovered > 0) next = { ...next, campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered - 1 } };
    commit({ ...next, phase: 'dusk', dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds } }, setState);
  };

  const retreat = () => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const next = retreatCurrentExpedition(state);
    commit({ ...next, phase: 'dusk', dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds: [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])] } }, setState);
  };

  if (!state.expeditionState.departed) {
    return (
      <main className="v6-shell notebook-page notebook-page--legacy-explore">
        <header className="v6-page-head"><span>白天 · 出门</span><h1>今天往哪边走</h1><p>地图上没有凭空多出来的路。每一个能去的地方，都来自有人见过、听过，或者活着回来过。</p></header>
        <InventoryBar state={state}/>
        <section className="v6-section"><div className="v6-section__head"><div><span>同行的人</span><h2>最多两人</h2></div></div><div className="v6-party">{assignedIds.map((id) => {
          const survivor = state.survivors.find((item) => item.id === id)!;
          const active = party.includes(id);
          return <button className={active ? 'active' : ''} key={id} onClick={() => setParty((current) => active ? current.filter((x) => x !== id) : current.length < 2 ? [...current, id] : current)}><strong>{survivor.name}</strong><span>精力 {survivor.energy} · {CONDITION_LABEL[survivor.condition ?? 'healthy']}</span></button>;
        })}</div></section>
        <section className="v6-section"><div className="v6-section__head"><div><span>手里的路线</span><h2>这些地方有人去过</h2></div><strong className={`v6-risk v6-risk--${risk}`}>{risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险' : '极险'}</strong></div><div className="v6-locations">{availableLocations.map((location) => <button className={location.id === locationId ? 'active' : ''} key={location.id} onClick={() => setLocationId(location.id)}><strong>{location.name}</strong><span>{location.description}</span><small>可能找到：{location.primary} · 风险 {location.danger}/5</small></button>)}</div></section>
        <button className="v6-cta" disabled={!party.length || !availableLocations.length} onClick={begin}>出发</button>
        <button className="v6-link" onClick={() => commit(reopenDayAssignments(state), setState)}>← 回去重新安排</button>
      </main>
    );
  }

  return (
    <main className="v6-shell notebook-page notebook-page--legacy-explore notebook-page--expedition-event">
      <header className="v6-page-head"><span>街外 · {activeRisk === 'safe' ? '安全' : activeRisk === 'cautious' ? '谨慎' : activeRisk === 'dangerous' ? '危险' : '极险'}</span><h1>{event?.title ?? '搜索队进入了建筑'}</h1><p>{event?.body ?? '前面没有声音，但没人知道拐角后面有什么。'}</p></header>
      <section className="v6-expedition-choices">
        <button onClick={() => finish('push')}><b>A</b><strong>继续深入</strong><span>再往里走，也许还能带回更多。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={pushPreview.tags}/><small>{pushPreview.summary}</small></div></button>
        <button onClick={() => finish('careful')}><b>B</b><strong>谨慎绕行</strong><span>绕开动静大的地方，不贪那一点。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={carefulPreview.tags}/><small>{carefulPreview.summary}</small></div></button>
        <button onClick={retreat}><b>C</b><strong>立刻撤回</strong><span>今天空手也行，人回来就行。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={retreatPreview.tags}/><small>{retreatPreview.summary}</small></div></button>
      </section>
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

function DuskScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const committed = hasCommittedDayAction(state);
  const causalSignals = nightCausalSignals(state);
  return (
    <main className="v6-shell v6-shell--dusk">
      <div className="dusk-binding" aria-hidden="true"/>
      <header className="dusk-page-head">
        <div className="dusk-date"><span>第 {state.day} 天</span><i>黄昏</i></div>
        <h1>太阳快下去了。</h1>
        <p>门已经开始上闩。谁还在街外、哪扇窗没钉死、锅里够不够——现在都看得清了。</p>
        <small>门闩再看一遍。</small>
      </header>
      <DuskLedger state={state}/>
      <section className="dusk-night-notes" aria-label="今夜准备">
        <article>
          <span>饭锅</span><h2>今晚吃：{mealLabel(meal.quality)}</h2><p>{mealCoverageLine(meal.coverage)}</p>
          <small>锅里大约够 {meal.cookingCapacity.toFixed(1)} 人吃，街里现在有 {meal.residentCount} 人。</small>
          <strong>{mealMorningLine(meal.energyRecovery, meal.hopeDelta)}</strong>
        </article>
        <article>
          <span>门口</span><h2>{nightPreparationLine(prep.defense)}</h2><p>{dutyCoverageLine(prep.medical, prep.repair, prep.radio)}</p>
          <small>{prep.defenseSource === '无人' ? '街口今晚没人值守。' : prep.defenseSource === '居民轮值' ? '街口由居民轮着守。' : '街口已经有人守着。'}</small>
          <strong>有人守着的地方越多，夜里越不容易出事。</strong>
        </article>
      </section>
      <section className="dusk-checklist">
        <header><span>入夜前的几句话</span><h2>有些麻烦，白天就已经露了头</h2></header>
        <ul>{(causalSignals.length ? causalSignals : ['今晚暂时没有新的坏消息。']).map((signal) => <li key={signal}><i>{causalSignals.length ? '□' : '✓'}</i><span>{signal}</span></li>)}</ul>
      </section>
      <button className="dusk-close-book" onClick={() => commit(finalizeDay(state), setState)}>合上本子，等天黑</button>
      {!committed ? <button className="dusk-rewrite" onClick={() => commit(reopenDayAssignments(state), setState)}>← 还有时间，重新安排</button> : <p className="dusk-margin-message">今天已经有人出过街，不能把这一页撕掉重写。</p>}
      <p className="dusk-margin-message">{state.lastMessage}</p>
    </main>
  );
}

function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const brief = dawnBriefEntries(state);
  return (
    <main className="v6-shell v6-shell--dawn notebook-page notebook-page--dawn">
      <header className="v6-page-head"><span>DAWN · DAY {state.day}</span><h1>{state.day === 29 ? '最后的夜结束了。' : '天亮了。'}</h1><p>{state.nightState.hordeActive ? '尸潮退去以后，街道重新有了颜色。现在才看得清昨夜留下的损失。' : '发电机的声音重新盖过远处的脚步。今天仍然有事要做。'}</p></header>
      <InventoryBar state={state}/>
      <section className="v6-stats"><div><span>昨夜动静</span><b>{state.nightState.resolutions.length}</b></div><div><span>死亡</span><b>{state.campaignStats.deaths}</b></div><div><span>没回来</span><b>{state.campaignStats.missing}</b></div><div><span>带回来</span><b>{state.campaignStats.rescued}</b></div></section>
      <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} compact/>
      {!!brief.length && <section className="v6-section"><div className="v6-section__head"><div><span>昨夜留下的</span><h2>天亮以后才看清的事</h2></div><small>只记真正发生过的</small></div>{brief.map((entry, index) => <p key={`${entry}-${index}`}>• {entry}</p>)}</section>}
      <MemorialPanel state={state}/>
      <button className="v6-cta" onClick={() => commit(advanceCampaignDay(state), setState)}>{state.day === 29 ? '去看看天亮以后' : `继续到 DAY ${state.day + 1}`}</button>
    </main>
  );
}

function EndingScreen({ state, meta, onRestart }: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending;
  if (!ending) return null;
  return (
    <main className={`v6-ending v6-ending--${ending.tier} notebook-page notebook-page--ending`}>
      <div className="v6-ending__day">DAY 30</div><p>天亮了。</p>
      <section className="v6-ending__ledger"><span>过去 29 天</span><div><b>{state.campaignStats.rescued}</b><small>带回来的人</small></div><div><b>{population(state)}</b><small>还在这条街</small></div><div><b>{state.campaignStats.deaths}</b><small>确认死亡</small></div><div><b>{state.campaignStats.expeditions}</b><small>出街次数</small></div><div><b>{state.campaignStats.locationsDiscovered}</b><small>走通过的地方</small></div><div><b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '未知'}</b><small>最后一夜</small></div></section>
      <MemorialPanel state={state}/>
      <section className="v6-ending__story"><span>{ending.tier === 'secret' ? '隐藏结局' : '结局'}</span><h1>《{ending.title}》</h1><p>{ending.summary}</p></section>
      <section className="v6-ending-gallery"><div><span>结局记录</span><strong>{meta.endingsUnlocked.length}/13</strong></div><div className="v6-ending-grid">{(Object.keys(ENDINGS) as EndingId[]).map((id) => <div className={meta.endingsUnlocked.includes(id) ? 'unlocked' : ''} key={id}><b>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].title : '？？？？'}</b><small>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].tier : endingHint(id)}</small></div>)}</div></section>
      <button className="v6-cta" onClick={onRestart}>再守一次</button>
    </main>
  );
}

export default function V060AppHotfix() {
  const [state, setState] = useState<GameState>(() => initialRun());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const recorded = useRef<string | null>(null);

  useEffect(() => { saveGame(state); }, [state]);
  useEffect(() => {
    if (state.phase !== 'ending' || !state.ending || !state.finalHordeResult || recorded.current === `${state.seed}:${state.ending.id}`) return;
    recorded.current = `${state.seed}:${state.ending.id}`;
    setMeta((current) => recordEnding(current, state.ending!, state.finalHordeResult!));
  }, [state.phase, state.ending, state.finalHordeResult, state.seed]);

  const restart = () => {
    clearSave();
    recorded.current = null;
    const next = createV060InitialState();
    saveGame(next, true);
    setState(next);
  };

  const screen = useMemo(() => {
    if (state.phase === 'street' || state.phase === 'assignment') return <DayScreen state={state} setState={setState}/>;
    if (state.phase === 'expedition') return <ExpeditionScreen state={state} setState={setState}/>;
    if (state.phase === 'dusk') return <DuskScreen state={state} setState={setState}/>;
    if (state.phase === 'night' || state.phase === 'night-summary') return <V060NightScene state={state} setState={setState}/>;
    if (state.phase === 'summary' || state.phase === 'dawn') return <DawnScreen state={state} setState={setState}/>;
    if (state.phase === 'ending') return <EndingScreen state={state} meta={meta} onRestart={restart}/>;
    return <DayScreen state={{ ...state, phase: 'street' }} setState={setState}/>;
  }, [state, meta]);

  return <>{screen}</>;
}
