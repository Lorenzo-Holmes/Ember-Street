import { useEffect, useRef, useState } from 'react';
import { beep, getFeedbackPreferences, saveFeedbackPreferences, vibrate } from './feedback';
import { challengeScore, createDailyChallenge, encodeChallenge } from './game/challenge';
import { SUPPLY_META } from './game/config';
import { continueChapter } from './game/continue';
import { careForCat, CAT_COPY } from './game/emotion';
import { assignSurvivor, createInitialState, repairBuilding, revealStreet } from './game/engine';
import { emergencyClear, takeRackWithFeel, tickWithFeel } from './game/feel';
import { autoAssignBySpecialty, autoAssignForHorde } from './game/management';
import { choiceAvailability, enterDusk, eventForDay, leaveDusk, resolveNarrativeChoice, survivalSnapshot } from './game/narrative';
import { BUILDING_META, forecastFor } from './game/progression';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, GameState, Role, SupplyItem, SupplyKind } from './game/types';
import { downloadCampaignShareCard, downloadChallengeShareCard } from './shareCard';

const ROLE_LABEL: Record<Role, string> = {
  search: '搜索', repair: '修理', medical: '诊疗', watch: '守夜', cook: '炊事', radio: '广播', rest: '休息',
};
const BUILDING_IDS = Object.keys(BUILDING_META) as BuildingId[];
type DayTab = 'street' | 'action' | 'log';

function SupplyGlyph({ kind }: { kind: SupplyKind }) {
  if (kind === 'ration') return <svg className="supply-glyph" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 7h14l2 4-2 15H9L7 11l2-4Z"/><path d="M10 12h12M12 17h8M13 21h6"/></svg>;
  if (kind === 'medical') return <svg className="supply-glyph" viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="8" width="20" height="17" rx="4"/><path d="M12 8V6h8v2M16 12v9M11.5 16.5h9"/></svg>;
  return <svg className="supply-glyph" viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="8" width="17" height="17" rx="3"/><path d="M24 13h2v7h-2M17 10l-5 7h4l-2 6 6-8h-4l1-5Z"/></svg>;
}

function Token({ item }: { item: SupplyItem }) {
  const meta = SUPPLY_META[item.kind];
  const label = item.tier === 1 ? meta.label : item.tier === 2 ? meta.tier2 : meta.tier3;
  return <div className={`token token--${item.kind} token--tier-${item.tier}`} title={label} aria-label={`${label}，等级 ${item.tier}`}><SupplyGlyph kind={item.kind}/><small>T{item.tier}</small></div>;
}

function RackButton({ kind, stock, onClick, guided = false }: { kind: SupplyKind; stock: number; onClick: () => void; guided?: boolean }) {
  const meta = SUPPLY_META[kind];
  return <button className={`rack rack--${kind}${guided ? ' rack--guided' : ''}`} onClick={onClick} aria-label={`拿取${meta.label}，本批剩余${stock}`}>
    <span className="rack__sigil"><SupplyGlyph kind={kind}/></span>
    <span className="rack__name">{meta.label}</span>
    <span className="rack__hint">本批 ×{stock}</span>
  </button>;
}

function hordeStage(value: number): string {
  if (value < 30) return '外围零星尸影';
  if (value < 55) return '尸群正在接近';
  if (value < 75) return '警戒 · 围栏受压';
  if (value < 90) return '冲击 · 红灯已亮';
  return '危险 · 主灯不稳';
}

function NightScene({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const patience = Math.round((state.currentOrder.patienceMs / state.currentOrder.maxPatienceMs) * 100);
  const timeSeconds = Math.ceil(state.nightRemainingMs / 1000);
  const full = state.slots.every((slot) => slot !== null);
  const combo = state.combo ?? 0;
  const firstOrderGuide = state.day === 1 && state.stats.served === 0 && state.stats.merges === 0;
  const orderActive = state.orderActive !== false && state.orderIndex < (state.nightOrderLimit ?? 5);
  const orderMeta = SUPPLY_META[state.currentOrder.targetKind];

  return <main className={`game-shell game-shell--night intensity-${state.forecast.intensity}`}>
    <div className="sky-noise" />
    <header className="hud">
      <div><span className="eyebrow">NIGHT</span><strong>{state.day}</strong></div>
      <div className="hud__center">余烬长街 · EMBER STREET</div>
      <div><span className="eyebrow">TIME</span><strong>{timeSeconds}s</strong></div>
    </header>

    <section className="street-backdrop" aria-hidden="true">
      <div className="ruin ruin--left"/><div className="tower" data-level={state.firstLightLevel}><i/></div><div className="ruin ruin--right"/>
      <div className="fence"><span/><span/><span/><span/><span/></div>
      <div className="horde" style={{ opacity: 0.12 + state.hordePressure / 135 }}><b/><b/><b/><b/><b/><b/></div>
    </section>

    <section className="pressure-panel">
      <div className="pressure-panel__top"><span>{hordeStage(state.hordePressure)}</span><strong>{Math.round(state.hordePressure)}%</strong></div>
      <div className="meter"><i style={{ width: `${state.hordePressure}%` }}/></div>
    </section>

    {orderActive ? <section className={`request request--${state.currentOrder.kind}`}>
      <div className="request__tag">{state.currentOrder.title} · {state.orderIndex + 1}/{state.nightOrderLimit ?? 5}</div>
      <p>{state.currentOrder.line}</p>
      <div className="request__target"><span>需要</span><strong>{orderMeta.tier2}</strong><span className={`mini-sigil mini-sigil--${state.currentOrder.targetKind}`}><SupplyGlyph kind={state.currentOrder.targetKind}/></span></div>
      <div className="patience"><i style={{ width: `${patience}%` }}/></div>
    </section> : <section className="request request--quiet">
      <div className="request__tag">短暂平静</div>
      <p>{state.orderIndex >= (state.nightOrderLimit ?? 5) ? '主要请求已经处理完。守住最后几分钟。' : '街口暂时没人敲门。听得见远处围栏的声音。'}</p>
      <div className="quiet-line">下一次请求不会立刻跳出来。</div>
    </section>}

    <div className="status-strip"><span>希望 {state.hope}{combo >= 2 ? ` · COMBO ×${combo}` : ''}</span><span>防线 {Math.round(state.defense ?? 50)}</span><span>{firstOrderGuide ? '点亮的罐头货架正在等你' : state.lastMessage}</span></div>

    <section className="tray-wrap">
      <div className="tray-label"><span>七格配给台</span><div className="tray-meta">{combo >= 2 && <strong>🔥 ×{combo}</strong>}{full ? <button className="clear-tray" onClick={() => { const next = emergencyClear(state); vibrate(20); beep(230, .08); setState(next); }}>紧急清台 {(state.clearances ?? 0) + 1}/3</button> : <small>3 个同类自动升级</small>}</div></div>
      <div className="tray">{state.slots.map((slot, index) => <div className="slot" key={index}>{slot ? <Token item={slot}/> : <span>{index + 1}</span>}</div>)}</div>
    </section>

    <section className="racks">{state.racks.map((kind, index) => <RackButton key={index} kind={kind} stock={state.rackStock?.[index] ?? 3} guided={firstOrderGuide && kind === 'ration'} onClick={() => {
      const beforeServed = state.stats.served;
      const beforeMerges = state.stats.merges;
      const next = takeRackWithFeel(state, index);
      if (next !== state) {
        vibrate(next.stats.served > beforeServed ? 14 : 6);
        beep(next.extremeServes !== state.extremeServes ? 860 : next.stats.served > beforeServed ? 720 : next.stats.merges > beforeMerges ? 620 : 390);
        setState(next);
      }
    }}/>)}</section>
  </main>;
}

function Summary({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const wonChapter = state.day === 7 && state.chapterComplete;
  return <main className="game-shell summary-screen"><div className="dawn"/><div className="summary-card">
    <span className="eyebrow">DAWN · DAY {state.day}</span>
    <h1>{wonChapter ? '这条街，还活着。' : state.hordePressure >= 100 ? '今晚很险。' : '天亮了。'}</h1>
    <p>{wonChapter ? '尸潮正在退去。第一街段的灯，一盏接一盏重新亮了起来。' : '声音停下来以后，才知道昨晚到底失去了什么、又守住了什么。'}</p>
    <div className="summary-grid"><div><strong>{state.stats.served}</strong><span>成功交付</span></div><div><strong>{state.stats.missed}</strong><span>漏掉请求</span></div><div><strong>{state.bestCombo ?? 0}</strong><span>最高 Combo</span></div><div><strong>{Math.round(state.stats.peakPressure)}%</strong><span>最高压力</span></div></div>
    <button className="primary" onClick={() => setState(revealStreet(state))}>{wonChapter ? '看天亮后的长街' : '读今天的余烬日志'}</button>
  </div></main>;
}

function ChallengeSummary({ state, onRetry, onBack }: { state: GameState; onRetry: () => void; onBack: () => void }) {
  const score = challengeScore(state);
  const code = encodeChallenge(state.seed, score);
  return <main className="game-shell summary-screen"><div className="dawn"/><div className="summary-card">
    <span className="eyebrow">DAILY CHALLENGE</span><h1>{score}</h1><p>挑战只看七格判断，不改动主线。</p>
    <div className="summary-grid"><div><strong>{state.stats.served}</strong><span>成功交付</span></div><div><strong>{state.bestCombo ?? 0}</strong><span>最高 Combo</span></div><div><strong>{Math.round(state.stats.peakPressure)}%</strong><span>最高压力</span></div><div><strong>{state.extremeServes ?? 0}</strong><span>极限出餐</span></div></div>
    <div className="challenge-code">{code}</div>
    <button className="primary" onClick={() => { const generated = downloadChallengeShareCard(state); navigator.clipboard?.writeText(generated).catch(() => undefined); }}>生成分享卡 + 复制挑战码</button>
    <div className="summary-actions"><button className="secondary" onClick={onRetry}>再挑战一次</button><button className="secondary" onClick={onBack}>返回主线</button></div>
  </div></main>;
}

function rolesFor(state: GameState): Role[] {
  const roles: Role[] = ['cook', 'rest'];
  if (state.buildings.searchStation) roles.push('search');
  if (state.buildings.workshop) roles.push('repair');
  if (state.buildings.clinic) roles.push('medical');
  if (state.buildings.watchPost) roles.push('watch');
  if (state.buildings.radio) roles.push('radio');
  return roles;
}

function SurvivalHeader({ state }: { state: GameState }) {
  const snapshot = survivalSnapshot(state);
  return <section className="survival-strip">
    <div><span>口粮</span><strong>{snapshot.ration}</strong></div>
    <div><span>药品</span><strong>{snapshot.medicine}</strong></div>
    <div><span>防线</span><strong>{snapshot.defense}</strong></div>
    <div><span>电力</span><strong>{snapshot.power}</strong></div>
  </section>;
}

function WorldStage({ state }: { state: GameState }) {
  const activeCount = Object.values(state.buildings).filter(Boolean).length;
  return <section className={`world-stage world-stage--light-${Math.min(7, state.firstLightLevel)}`}>
    <div className="world-stage__sky"><span>DAY {state.day}</span><small>{state.chapterComplete ? '晨光越过第一街段' : '废墟之外仍然没有城市灯光'}</small></div>
    <div className="world-building world-building--search" data-on={state.buildings.searchStation > 0}>搜索站</div>
    <div className="world-building world-building--clinic" data-on={state.buildings.clinic > 0}>诊疗</div>
    <div className="world-tower"><i/><b>主灯</b></div>
    <div className="world-building world-building--workshop" data-on={state.buildings.workshop > 0}>工坊</div>
    <div className="world-building world-building--radio" data-on={state.buildings.radio > 0}>广播</div>
    <div className="world-road">{state.survivors.slice(0, 6).map((survivor, index) => <span key={survivor.id} style={{ left: `${10 + index * 14}%` }}>{survivor.name}</span>)}{(state.catStage ?? 0) > 0 && <em>小灰</em>}</div>
    <div className="world-caption">{activeCount + 1} 处灯火仍在工作</div>
  </section>;
}

function EventCard({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const event = eventForDay(state.day);
  if (!event || event.id !== state.activeEventId) return <div className="empty-state"><strong>今天没有新的突发事件。</strong><span>你可以调整岗位、修设施，然后进入黄昏。</span></div>;
  return <article className="event-card">
    <span className="event-kicker">{event.kicker}</span><h2>{event.title}</h2><p>{event.body}</p>{event.quote && <blockquote>{event.quote}</blockquote>}
    <div className="event-choices">{event.choices.map((choice) => {
      const availability = choiceAvailability(state, event.id, choice.id);
      return <button key={choice.id} disabled={!availability.available} onClick={() => { const next = resolveNarrativeChoice(state, choice.id); if (next !== state) { vibrate(12); beep(520, .05); setState(next); } }}>
        <strong>{choice.label}</strong><span>{choice.detail}</span><small>{availability.reason ?? `${choice.cost ?? '无直接资源消耗'}${choice.risk ? ` · 风险：${choice.risk}` : ''}`}</small>
      </button>;
    })}</div>
  </article>;
}

function SurvivorManagement({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const roles = rolesFor(state);
  return <section className="survivor-panel narrative-panel">
    <div className="section-title"><strong>今天谁去哪里</strong><span>{state.survivors.length} 人</span></div>
    {state.survivors.length >= 3 && <div className="management-tools"><button className="secondary" onClick={() => setState(autoAssignBySpecialty(state))}>按专长排班</button>{state.day >= 6 && <button className="secondary" onClick={() => setState(autoAssignForHorde(state))}>尸潮班表</button>}</div>}
    {state.survivors.length === 0 ? <p className="empty-copy">修好搜索站以后，才会有人愿意长期留下。</p> : state.survivors.map((survivor) => <article className="survivor-row survivor-row--story" key={survivor.id}>
      <div className="survivor-avatar">{survivor.name.slice(0, 1)}</div>
      <div className="survivor-copy"><strong>{survivor.name}</strong><span>{survivor.trait ?? survivor.perk} · 信任 {survivor.trust ?? 0}/3</span><small>精力 {survivor.energy} · {survivor.injury === 'healthy' || !survivor.injury ? '状态正常' : `状态：${survivor.injury}`}</small></div>
      <div className="role-buttons">{roles.map((role) => <button key={role} className={(state.assignments[survivor.id] ?? 'rest') === role ? 'role active' : 'role'} onClick={() => setState(assignSurvivor(state, survivor.id, role))}>{ROLE_LABEL[role]}</button>)}</div>
    </article>)}
  </section>;
}

function BuildingPanel({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const unlocked = BUILDING_IDS.filter((id) => BUILDING_META[id].unlockDay <= state.day);
  return <section className="facility-list">
    <div className="section-title"><strong>街区设施</strong><span>零件 {state.parts}</span></div>
    {unlocked.map((id) => {
      const meta = BUILDING_META[id];
      const online = state.buildings[id] > 0;
      const canRepair = !online && state.parts >= meta.cost;
      return <article className={online ? 'facility facility--on' : 'facility'} key={id}>
        <div><span className="facility-dot"/><strong>{meta.name}</strong><small>{online ? '工作中' : `修复需要 ${meta.cost} 零件`}</small></div>
        <p>{meta.description}</p>
        {!online && <button className="secondary" disabled={!canRepair} onClick={() => setState(repairBuilding(state, id))}>{canRepair ? '修复' : `还差 ${Math.max(0, meta.cost - state.parts)}`}</button>}
      </article>;
    })}
  </section>;
}

function LogPanel({ state }: { state: GameState }) {
  const logs = [...(state.logs ?? [])].reverse();
  return <section className="log-panel"><div className="section-title"><strong>余烬日志</strong><span>最近 {logs.length} 条</span></div>{logs.length === 0 ? <div className="empty-state">第一篇日志会在天亮后出现。</div> : logs.map((entry) => <article key={entry.id} className={`log-entry log-entry--${entry.tone}`}><time>DAY {entry.day} · {entry.time}</time><strong>{entry.title}</strong><p>{entry.body}</p></article>)}</section>;
}

function StreetDay({ state, setState, onDaily, onShare }: { state: GameState; setState: (next: GameState) => void; onDaily: () => void; onShare: () => void }) {
  const [tab, setTab] = useState<DayTab>(state.activeEventId ? 'action' : 'street');
  const cat = CAT_COPY[state.catStage ?? 0];
  const canDusk = !state.activeEventId && state.searchStationRepaired && !state.chapterComplete;

  return <main className={`game-shell day-shell ${state.chapterComplete ? 'day-shell--dawn' : ''}`}>
    <header className="hud hud--street"><div><span className="eyebrow">DAY</span><strong>{state.day}</strong></div><div className="hud__center">余烬长街 · 第一街段</div><div><span className="eyebrow">HOPE</span><strong>{state.hope}</strong></div></header>
    <SurvivalHeader state={state}/>
    <WorldStage state={state}/>

    <nav className="day-tabs" aria-label="白天功能">
      <button className={tab === 'street' ? 'active' : ''} onClick={() => setTab('street')}>街区</button>
      <button className={tab === 'action' ? 'active' : ''} onClick={() => setTab('action')}>行动{state.activeEventId ? <i/> : null}</button>
      <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>日志</button>
    </nav>

    <div className="day-content">
      {tab === 'street' && <>
        <section className="day-brief"><div><span className="eyebrow">今晚预报</span><strong>{state.day === 6 ? '尸潮之夜正在靠近' : forecastFor(Math.min(7, state.day + 1)).title}</strong></div><p>{state.day === 6 ? '今天做的每个选择都会在 NIGHT 7 兑现。' : '白天不用抢时间。先看清街区，再决定谁去哪里。'}</p></section>
        <BuildingPanel state={state} setState={setState}/>
        <article className="cat-card"><strong>{cat.title}</strong><span>{cat.detail}</span>{state.day >= 3 && !(state.catFedToday ?? false) && state.supplies > 0 && <button className="secondary" onClick={() => setState(careForCat(state))}>留一份口粮</button>}</article>
        <div className="street-tools"><button className="secondary" onClick={onDaily}>今日七格挑战</button><button className="secondary" onClick={onShare}>保存成长卡</button></div>
      </>}
      {tab === 'action' && <><EventCard state={state} setState={setState}/><SurvivorManagement state={state} setState={setState}/></>}
      {tab === 'log' && <LogPanel state={state}/>} 
    </div>

    <footer className="day-cta">
      <p>{state.chapterComplete ? '第一街段已经稳定下来。' : state.activeEventId ? '先把今天这件事处理完，再进入黄昏。' : !state.searchStationRepaired ? '先修好搜索站，让白天经营真正开始。' : '准备好以后进入黄昏。之后岗位和库存会真正影响今晚。'}</p>
      {state.chapterComplete ? <button className="primary" onClick={onShare}>保存第一章成长卡</button> : <button className="primary" disabled={!canDusk} onClick={() => setState(enterDusk(state))}>进入黄昏准备</button>}
    </footer>
  </main>;
}

function DuskScene({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const snapshot = survivalSnapshot(state);
  const nextDay = state.day === 7 ? 7 : state.day + 1;
  const forecast = forecastFor(nextDay);
  return <main className="game-shell dusk-shell">
    <header className="hud"><div><span className="eyebrow">DUSK</span><strong>{state.day}</strong></div><div className="hud__center">太阳下去了</div><div><span className="eyebrow">NEXT</span><strong>N{nextDay}</strong></div></header>
    <section className="dusk-hero"><span className="eyebrow">今夜</span><h1>{forecast.title}</h1><p>{forecast.detail}</p></section>
    <SurvivalHeader state={state}/>
    <section className="dusk-checklist">
      <div><span>口粮</span><strong>{snapshot.ration}</strong><small>开夜时会按居民数消耗</small></div>
      <div><span>防线</span><strong>{snapshot.defenseValue}%</strong><small>越高，开场和持续压力越低</small></div>
      <div><span>电力</span><strong>{snapshot.powerValue}%</strong><small>停电日会更吃紧</small></div>
      <div><span>值守</span><strong>{Object.values(state.assignments).filter((role) => role === 'watch').length} 人</strong><small>守夜岗位直接削减压力</small></div>
    </section>
    <section className="dusk-roster"><span className="eyebrow">今晚的人</span>{state.survivors.map((survivor) => <div key={survivor.id}><strong>{survivor.name}</strong><span>{ROLE_LABEL[state.assignments[survivor.id] ?? 'rest']}</span></div>)}</section>
    <div className="dusk-actions"><button className="secondary" onClick={() => setState(leaveDusk(state))}>回白天再看看</button><button className="primary" onClick={() => { vibrate(20); beep(260, .08); setState(continueChapter(state)); }}>开始守夜</button></div>
  </main>;
}

function FeedbackDock() {
  const [prefs, setPrefs] = useState(() => getFeedbackPreferences());
  const change = (key: 'sound' | 'haptics') => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveFeedbackPreferences(next);
  };
  return <div className="feedback-dock"><button aria-pressed={prefs.sound} onClick={() => change('sound')}>声音</button><button aria-pressed={prefs.haptics} onClick={() => change('haptics')}>震动</button></div>;
}

export default function App() {
  const [state, setState] = useState<GameState>(() => loadGame() ?? createInitialState());
  const [challenge, setChallenge] = useState<GameState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (state.phase !== 'night') return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(1000, now - previous);
      previous = now;
      setState((current) => current.phase === 'night' ? tickWithFeel(current, elapsed) : current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (!challenge || challenge.phase !== 'night') return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(1000, now - previous);
      previous = now;
      setChallenge((current) => current?.phase === 'night' ? tickWithFeel(current, elapsed) : current);
    }, 250);
    return () => window.clearInterval(timer);
  }, [challenge?.phase]);

  useEffect(() => { saveGame(state); }, [state]);
  useEffect(() => {
    const forceSave = () => saveGame(stateRef.current, true);
    window.addEventListener('pagehide', forceSave);
    document.addEventListener('visibilitychange', forceSave);
    return () => { window.removeEventListener('pagehide', forceSave); document.removeEventListener('visibilitychange', forceSave); };
  }, []);

  const reset = () => {
    if (!window.confirm('清空当前《余烬长街》存档并重新开始？')) return;
    clearSave();
    setChallenge(null);
    setState(createInitialState());
  };

  let content;
  if (challenge) {
    content = challenge.phase === 'night' ? <NightScene state={challenge} setState={setChallenge}/> : <ChallengeSummary state={challenge} onRetry={() => setChallenge(createDailyChallenge())} onBack={() => setChallenge(null)}/>;
  } else if (state.phase === 'night') {
    content = <NightScene state={state} setState={setState}/>;
  } else if (state.phase === 'summary') {
    content = <Summary state={state} setState={setState}/>;
  } else if (state.dayStep === 'dusk') {
    content = <DuskScene state={state} setState={setState}/>;
  } else {
    content = <StreetDay state={state} setState={setState} onDaily={() => setChallenge(createDailyChallenge())} onShare={() => downloadCampaignShareCard(state)}/>;
  }

  return <div className="app-root">{content}<FeedbackDock/><button className="reset" onClick={reset}>重置</button></div>;
}
