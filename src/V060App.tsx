import { useEffect, useMemo, useRef, useState } from 'react';
import V060NightScene from './V060NightScene';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, DayAssignment, EndingId, GameState, SurvivorCondition } from './game/types';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from './game/v060/buildings';
import { advanceCampaignDay, createV060InitialState, finalizeDay, resolveExpeditionStance, retreatCurrentExpedition, upgradeSaveToV060 } from './game/v060/campaign';
import { assignDayJob, canTakeDayAssignment, clearDayJob, lockDayAssignments, previewNightPreparation } from './game/v060/dayManagement';
import { ENDINGS, endingHint, loadMetaProgress, recordEnding, type MetaProgress } from './game/v060/endings';
import { EXPEDITION_LOCATIONS, currentExpeditionEvent, drawExpeditionEvent, expeditionRiskLabel, expeditionRiskScore, startExpedition } from './game/v060/expedition';
import { mealLabel, previewMeal } from './game/v060/food';

const JOBS: Array<{ id: DayAssignment; label: string; note: string }> = [
  { id: 'expedition', label: '探索', note: '外出搜集物资，可能受伤、失踪或死亡。' },
  { id: 'repair', label: '维修', note: '加固防线，并让工坊在夜里发挥作用。' },
  { id: 'medical', label: '医疗', note: '优先处理街区里最严重的伤员。' },
  { id: 'watch', label: '守备', note: '降低夜间紧急事件和尸潮风险。' },
  { id: 'radio', label: '广播', note: '积累外界联系，可能找到幸存者与军方信号。' },
  { id: 'cook', label: '炊事', note: '按当前人口提高供餐覆盖率和次日恢复。' },
  { id: 'rest', label: '休息', note: '恢复个人精力。' },
];

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡',
};
const RESULT_LABEL = { perfect: '完美守住', held: '守住', damaged: '严重受损', breached: '街区失守' } as const;
const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];

function initialRun(): GameState {
  const loaded = loadGame();
  return loaded ? upgradeSaveToV060(loaded) : createV060InitialState();
}

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function InventoryBar({ state }: { state: GameState }) {
  return <section className="v6-inventory" aria-label="物资箱">
    <div className="v6-inventory__title"><span>📦 物资箱</span><small>白天带回来的东西都在这里</small></div>
    <div className="v6-resource-grid">
      <div><span>口粮</span><b>{state.inventory.ration}</b></div><div><span>药品</span><b>{state.inventory.medicine}</b></div><div><span>电力</span><b>{state.inventory.power}</b></div><div><span>材料</span><b>{state.inventory.materials}</b></div><div><span>零件</span><b>{state.inventory.parts}</b></div><div><span>希望</span><b>{state.hope}</b></div><div><span>防线</span><b>{Math.round(state.defense ?? 50)}</b></div><div><span>救回</span><b>{state.campaignStats.rescued}</b></div>
    </div>
    {!!state.storyItems.length && <div className="v6-story-items"><strong>特殊物品</strong>{state.storyItems.map((item) => <span key={item}>{item}</span>)}</div>}
  </section>;
}

function StreetVisual({ state }: { state: GameState }) {
  const alive = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
  return <section className={`v6-street v6-street--stage-${state.mainLightStage}`}>
    <div className="v6-street__sky"/><div className="v6-building v6-building--left"/><div className="v6-building v6-building--right"/>
    <div className="v6-main-light"><i/><strong>主灯 · 阶段 {state.mainLightStage}</strong></div>
    <div className="v6-street__meta"><span>居民 {alive}</span><span>DAY {state.day}/30</span><span>{state.forecast.title}</span></div>
  </section>;
}

function BuildingsPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return <section className="v6-section"><div className="v6-section__head"><div><span>街区建设</span><h2>把物资变成能救命的设施</h2></div><small>每座建筑最高 Lv3</small></div>
    <div className="v6-buildings">{BUILDING_IDS.map((id) => {
      const definition = V060_BUILDINGS[id]; const level = state.buildings[id]; const next = definition.levels[level] ?? null; const check = canUpgradeBuilding(state, id);
      return <article className="v6-building-card" key={id}><div><span>{definition.name}</span><b>Lv{level}</b></div><h3>{level ? definition.levels[level - 1].title : '废墟'}</h3><p>{level ? definition.levels[level - 1].unlock : '修复以后才会真正改变白天或夜晚的规则。'}</p>{next ? <><small>下一阶：材料 {next.materials} · 零件 {next.parts}</small><button disabled={!check.allowed} onClick={() => commit(upgradeBuilding(state, id), setState)}>{check.allowed ? `升级到 Lv${next.level}` : check.reason}</button></> : <strong className="v6-max">已完成</strong>}</article>;
    })}</div>
  </section>;
}

function AssignmentPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const expeditionCount = Object.values(state.dayAssignments).filter((job) => job === 'expedition').length;
  return <section className="v6-section"><div className="v6-section__head"><div><span>今日调遣</span><h2>一个人，一天只做一件主要的事</h2></div><small>黄昏后不可改岗</small></div>
    <div className="v6-survivors">{state.survivors.map((survivor) => {
      const condition = survivor.condition ?? 'healthy'; const unavailable = condition === 'dead' || condition === 'missing' || condition === 'critical'; const current = state.dayAssignments[survivor.id];
      return <article className={`v6-survivor ${unavailable ? 'is-unavailable' : ''}`} key={survivor.id}><div className="v6-survivor__top"><div><h3>{survivor.name}</h3><span>{survivor.trait ?? survivor.perk}</span></div><div><b>{survivor.energy}</b><small>精力</small></div></div><div className="v6-survivor__status"><span>{CONDITION_LABEL[condition]}</span><span>信任 {survivor.trust ?? 0}</span><span>{survivor.specialty}</span></div><div className="v6-job-grid">{JOBS.map((job) => {
        const availability = canTakeDayAssignment(state, survivor.id, job.id); const extraLimit = job.id === 'expedition' && current !== 'expedition' && expeditionCount >= 2; const disabled = !availability.allowed || extraLimit;
        return <button key={job.id} className={current === job.id ? 'active' : ''} disabled={disabled} title={extraLimit ? '一支探索队最多两人' : availability.reason ?? job.note} onClick={() => commit(current === job.id ? clearDayJob(state, survivor.id) : assignDayJob(state, survivor.id, job.id), setState)}>{job.label}</button>;
      })}</div></article>;
    })}</div>
  </section>;
}

function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state); const prep = previewNightPreparation(state); const assigned = Object.keys(state.dayAssignments).length; const living = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing' && s.condition !== 'critical').length;
  const lock = () => { const locked = lockDayAssignments(state); const expeditions = Object.values(locked.dayAssignments).filter((job) => job === 'expedition').length; commit({ ...locked, phase: expeditions ? 'expedition' : 'dusk' }, setState); };
  return <main className="v6-shell"><header className="v6-topbar"><div><span>EMBER STREET</span><strong>DAY {state.day}</strong></div><div><b>{state.day === 29 ? '最后的白天' : state.forecast.title}</b><small>{state.day === 29 ? '天黑以后就是最终尸潮。' : state.forecast.detail}</small></div></header><StreetVisual state={state}/><InventoryBar state={state}/><BuildingsPanel state={state} setState={setState}/><AssignmentPanel state={state} setState={setState}/>
    <section className="v6-preview"><div><span>预计供餐</span><strong>{mealLabel(meal.quality)}</strong><small>炊事能力 {meal.cookingCapacity.toFixed(1)} / 人口 {meal.residentCount} · 精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}</small></div><div><span>预计夜间</span><strong>{prep.defense}</strong><small>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</small></div></section>
    <button className="v6-cta" disabled={!living} onClick={lock}>确认今日调遣 <small>{assigned}/{living} 已手动安排 · 未安排者自动休息</small></button><p className="v6-message">{state.lastMessage}</p>
  </main>;
}

function ExpeditionScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const assignedIds = state.survivors.filter((s) => state.dayAssignments[s.id] === 'expedition' && s.condition !== 'dead' && s.condition !== 'missing').map((s) => s.id).slice(0, 2);
  const availableLocations = EXPEDITION_LOCATIONS.filter((location) => location.unlockDay <= state.day);
  const [party, setParty] = useState<string[]>(assignedIds);
  const [locationId, setLocationId] = useState(availableLocations[availableLocations.length - 1]?.id ?? 'convenience-store');
  const event = currentExpeditionEvent(state);
  const riskScore = expeditionRiskScore(state, party, locationId); const risk = expeditionRiskLabel(riskScore);
  const begin = () => { let next = startExpedition(state, party, locationId); next = drawExpeditionEvent(next); commit(next, setState); };
  if (!state.expeditionState.departed) return <main className="v6-shell"><header className="v6-page-head"><span>白天 · 探索</span><h1>今天谁出去？</h1><p>外出的人可能带回整条街需要的东西，也可能受伤、失踪，DAY 11 之后甚至可能死去。</p></header><InventoryBar state={state}/><section className="v6-section"><div className="v6-section__head"><div><span>探索队</span><h2>1–2 人</h2></div></div><div className="v6-party">{assignedIds.map((id) => { const s = state.survivors.find((item) => item.id === id)!; const active = party.includes(id); return <button className={active ? 'active' : ''} key={id} onClick={() => setParty((current) => active ? current.filter((x) => x !== id) : current.length < 2 ? [...current, id] : current)}><strong>{s.name}</strong><span>精力 {s.energy} · {CONDITION_LABEL[s.condition ?? 'healthy']}</span></button>; })}</div></section><section className="v6-section"><div className="v6-section__head"><div><span>地点</span><h2>选择今天要赌在哪里</h2></div><strong className={`v6-risk v6-risk--${risk}`}>{risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险' : '极险'}</strong></div><div className="v6-locations">{availableLocations.map((location) => <button className={location.id === locationId ? 'active' : ''} key={location.id} onClick={() => setLocationId(location.id)}><strong>{location.name}</strong><span>{location.description}</span><small>主要：{location.primary} · 危险 {location.danger}/5</small></button>)}</div></section><button className="v6-cta" disabled={!party.length} onClick={begin}>搜索队出发</button><button className="v6-link" onClick={() => commit({ ...state, phase: 'dusk', lastMessage: '今天取消外出，所有人留在街区。' }, setState)}>取消今天的探索</button></main>;
  return <main className="v6-shell"><header className="v6-page-head"><span>探索途中</span><h1>{event?.title ?? '搜索队进入了建筑'}</h1><p>{event?.body ?? '前面没有声音，但没人知道拐角后面有什么。'}</p></header><section className="v6-expedition-choices"><button onClick={() => commit(resolveExpeditionStance(state, 'push'), setState)}><b>A</b><strong>继续深入</strong><span>更高风险；成功时额外带回主要物资。</span></button><button onClick={() => commit(resolveExpeditionStance(state, 'careful'), setState)}><b>B</b><strong>谨慎绕行</strong><span>2D6 获得 +1，但不追求额外收益。</span></button><button onClick={() => commit(retreatCurrentExpedition(state), setState)}><b>C</b><strong>立刻撤回</strong><span>今天什么都拿不到，但人会回来。</span></button></section><p className="v6-message">{state.lastMessage}</p></main>;
}

function DuskScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state); const prep = previewNightPreparation(state);
  return <main className="v6-shell v6-shell--dusk"><header className="v6-page-head"><span>DUSK · DAY {state.day}</span><h1>天黑以后，不再换岗。</h1><p>这是白天最后一次确认。今晚发生什么，取决于现在留下了谁、修好了什么、物资还剩多少。</p></header><InventoryBar state={state}/><section className="v6-dusk-grid"><article><span>供餐</span><h2>{mealLabel(meal.quality)}</h2><p>人口 {meal.residentCount} · 炊事能力 {meal.cookingCapacity.toFixed(1)} · 覆盖 {Math.round(meal.coverage * 100)}%</p><strong>精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}</strong></article><article><span>夜间准备</span><h2>{prep.defense}</h2><p>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</p><strong>守备和设施会改变随机事件风险</strong></article></section><button className="v6-cta" onClick={() => commit(finalizeDay(state), setState)}>进入黄昏</button><p className="v6-message">{state.lastMessage}</p></main>;
}

function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return <main className="v6-shell v6-shell--dawn"><header className="v6-page-head"><span>DAWN · DAY {state.day}</span><h1>{state.day === 29 ? '最后的夜结束了。' : '天亮了。'}</h1><p>{state.nightState.hordeActive ? '尸潮退去以后，街道重新有了颜色。现在才看得清昨夜留下的损失。' : '发电机的声音重新盖过远处的脚步。今天仍然有事要做。'}</p></header><InventoryBar state={state}/><section className="v6-stats"><div><span>夜间事件</span><b>{state.nightState.resolutions.length}</b></div><div><span>死亡</span><b>{state.campaignStats.deaths}</b></div><div><span>失踪</span><b>{state.campaignStats.missing}</b></div><div><span>救回</span><b>{state.campaignStats.rescued}</b></div></section><button className="v6-cta" onClick={() => commit(advanceCampaignDay(state), setState)}>{state.day === 29 ? '进入 DAY 30 · 结算' : `开始 DAY ${state.day + 1}`}</button></main>;
}

function EndingScreen({ state, meta, onRestart }: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending; if (!ending) return null;
  const alive = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
  return <main className={`v6-ending v6-ending--${ending.tier}`}><div className="v6-ending__day">DAY 30</div><p>天亮了。</p><section className="v6-ending__ledger"><span>过去 29 天</span><div><b>{state.campaignStats.rescued}</b><small>救回的人</small></div><div><b>{alive}</b><small>仍在街区</small></div><div><b>{state.campaignStats.deaths}</b><small>确认死亡</small></div><div><b>{state.campaignStats.expeditions}</b><small>探索次数</small></div><div><b>{state.campaignStats.locationsDiscovered}</b><small>发现地点</small></div><div><b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '未知'}</b><small>DAY 29</small></div></section><section className="v6-ending__story"><span>{ending.tier === 'secret' ? '隐藏结局' : '结局'}</span><h1>《{ending.title}》</h1><p>{ending.summary}</p></section><section className="v6-ending-gallery"><div><span>结局记录</span><strong>{meta.endingsUnlocked.length}/13</strong></div><div className="v6-ending-grid">{(Object.keys(ENDINGS) as EndingId[]).map((id) => <div className={meta.endingsUnlocked.includes(id) ? 'unlocked' : ''} key={id}><b>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].title : '？？？？'}</b><small>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].tier : endingHint(id)}</small></div>)}</div></section><button className="v6-cta" onClick={onRestart}>开始新的 30 天</button></main>;
}

export default function V060App() {
  const [state, setState] = useState<GameState>(() => initialRun());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const recorded = useRef<string | null>(null);
  useEffect(() => { saveGame(state); }, [state]);
  useEffect(() => {
    if (state.phase !== 'ending' || !state.ending || !state.finalHordeResult || recorded.current === `${state.seed}:${state.ending.id}`) return;
    recorded.current = `${state.seed}:${state.ending.id}`;
    setMeta((current) => recordEnding(current, state.ending!, state.finalHordeResult!));
  }, [state.phase, state.ending, state.finalHordeResult, state.seed]);
  const restart = () => { clearSave(); recorded.current = null; const next = createV060InitialState(); saveGame(next, true); setState(next); };
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
