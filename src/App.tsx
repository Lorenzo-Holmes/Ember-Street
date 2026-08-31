import { useEffect, useMemo, useRef, useState } from 'react';
import { SUPPLY_META } from './game/config';
import { continueChapter } from './game/continue';
import { assignSurvivor, createInitialState, repairBuilding, revealStreet, takeRack, tick } from './game/engine';
import { BUILDING_META } from './game/progression';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, GameState, Role, SupplyItem, SupplyKind } from './game/types';

const ROLE_LABEL: Record<Role, string> = { search: '搜索', repair: '修理', medical: '诊疗', watch: '守夜', cook: '炊事', radio: '广播', rest: '休息' };
const BUILDING_IDS = Object.keys(BUILDING_META) as BuildingId[];

function vibrate(ms = 8) { navigator.vibrate?.(ms); }
function beep(frequency = 480, duration = 0.045) {
  try {
    const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
    oscillator.addEventListener('ended', () => context.close());
  } catch { /* progressive enhancement */ }
}

function Token({ item }: { item: SupplyItem }) {
  const meta = SUPPLY_META[item.kind];
  const label = item.tier === 1 ? meta.label : item.tier === 2 ? meta.tier2 : meta.tier3;
  return <div className={`token token--${item.kind} token--tier-${item.tier}`} title={label}><span>{meta.short}</span><small>{item.tier}</small></div>;
}

function RackButton({ kind, onClick }: { kind: SupplyKind; onClick: () => void }) {
  const meta = SUPPLY_META[kind];
  return <button className={`rack rack--${kind}`} onClick={onClick} aria-label={`拿取${meta.label}`}><span className="rack__sigil">{meta.short}</span><span className="rack__name">{meta.label}</span><span className="rack__hint">点取</span></button>;
}

function NightScene({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const orderMeta = SUPPLY_META[state.currentOrder.targetKind];
  const patience = Math.round((state.currentOrder.patienceMs / state.currentOrder.maxPatienceMs) * 100);
  const timeSeconds = Math.ceil(state.nightRemainingMs / 1000);
  return <main className={`game-shell game-shell--night intensity-${state.forecast.intensity}`}>
    <div className="sky-noise" />
    <header className="hud"><div><span className="eyebrow">NIGHT</span><strong>{state.day}</strong></div><div className="hud__center">余烬长街 · EMBER STREET</div><div><span className="eyebrow">TIME</span><strong>{timeSeconds}s</strong></div></header>
    <section className="forecast-banner"><strong>{state.forecast.title}</strong><span>{state.forecast.detail}</span></section>
    <section className="street-backdrop" aria-hidden="true"><div className="ruin ruin--left"/><div className="tower" data-level={state.firstLightLevel}><i/></div><div className="ruin ruin--right"/><div className="fence"><span/><span/><span/><span/><span/></div><div className="horde" style={{ opacity: 0.12 + state.hordePressure / 135 }}><b/><b/><b/><b/><b/><b/></div></section>
    <section className="pressure-panel"><div className="pressure-panel__top"><span>尸潮压力</span><strong>{Math.round(state.hordePressure)}%</strong></div><div className="meter"><i style={{ width: `${state.hordePressure}%` }}/></div></section>
    <section className={`request request--${state.currentOrder.kind}`}><div className="request__tag">{state.currentOrder.title}</div><p>{state.currentOrder.line}</p><div className="request__target"><span>需要</span><strong>{orderMeta.tier2}</strong><span className={`mini-sigil mini-sigil--${state.currentOrder.targetKind}`}>{orderMeta.short}</span></div><div className="patience"><i style={{ width: `${patience}%` }}/></div></section>
    <div className="status-strip"><span>希望 {state.hope}</span><span>零件 {state.parts}</span><span>{state.lastMessage}</span></div>
    <section className="tray-wrap"><div className="tray-label"><span>七格配给台</span><small>3 个同类物资自动升级</small></div><div className="tray">{state.slots.map((slot, index) => <div className="slot" key={index}>{slot ? <Token item={slot}/> : <span>{index + 1}</span>}</div>)}</div></section>
    <section className="racks">{state.racks.map((kind, index) => <RackButton key={`${index}-${kind}`} kind={kind} onClick={() => { const before = state.stats.served; const next = takeRack(state, index); if (next !== state) { vibrate(next.stats.served > before ? 14 : 6); beep(next.stats.served > before ? 720 : next.stats.merges > state.stats.merges ? 620 : 390); setState(next); } }}/>)}</section>
  </main>;
}

function Summary({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const wonChapter = state.day === 7 && state.chapterComplete;
  return <main className="game-shell summary-screen"><div className="dawn"/><div className="summary-card"><span className="eyebrow">DAWN · DAY {state.day}</span><h1>{wonChapter ? '这条街，还活着。' : state.hordePressure >= 100 ? '今晚很险。' : '天亮了。'}</h1><p>{wonChapter ? '尸潮正在退去。第一街段的灯，一盏接一盏重新亮了起来。' : '主灯还亮着。街里的人，又多撑过了一晚。'}</p><div className="summary-grid"><div><strong>{state.stats.served}</strong><span>成功交付</span></div><div><strong>{state.stats.merges}</strong><span>三合升级</span></div><div><strong>{state.parts}</strong><span>零件</span></div><div><strong>{state.hope}</strong><span>希望</span></div></div><button className="primary" onClick={() => setState(revealStreet(state))}>{wonChapter ? '看天亮后的长街' : '回到避难街'}</button></div></main>;
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

function StreetScene({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const availableRoles = rolesFor(state);
  const unlockedBuildings = BUILDING_IDS.filter((id) => BUILDING_META[id].unlockDay <= state.day);
  const failedHorde = state.day === 7 && !state.chapterComplete;
  return <main className={`game-shell street-screen ${state.chapterComplete ? 'street-screen--dawn' : ''}`}>
    <header className="hud hud--street"><div><span className="eyebrow">DAY</span><strong>{state.day}</strong></div><div className="hud__center">避难街 · 第一街段</div><div><span className="eyebrow">HOPE</span><strong>{state.hope}</strong></div></header>
    <section className="day-brief"><div><span className="eyebrow">下一夜预报</span><strong>{state.chapterComplete ? '第一章完成' : failedHorde ? '尸潮夜 · 重整再战' : `DAY ${state.day + 1} · ${state.day === 6 ? '尸潮之夜' : '继续守夜'}`}</strong></div><p>{state.chapterComplete ? '第一街段已经稳定下来。下一阶段将向更深的城区扩张。' : failedHorde ? '昨夜没有完全守住，但没有死档。调整岗位、补修设施，再试一次。' : state.day === 6 ? '大规模尸群就在外围。把人调到最关键的位置。' : '岗位收益会在下一次开夜时立即结算。'}</p></section>
    <section className="street-map">
      <article className="building building--tower"><span className="building__light building__light--main"/><small>FIRST LIGHT · LV.{state.firstLightLevel}</small><h3>主灯塔</h3><p>街区成长中枢。每修复一处设施，灯火都会更稳定。</p></article>
      {unlockedBuildings.map((id) => { const meta = BUILDING_META[id]; const level = state.buildings[id]; const canRepair = level === 0 && state.parts >= meta.cost; return <article key={id} className={`building ${level ? 'building--active' : 'building--ruin'}`}><span className="building__light"/><small>{level ? `ONLINE · LV.${level}` : `LOCK BROKEN · ${meta.cost} 零件`}</small><h3>{meta.name}</h3><p>{meta.description}</p>{!level && <button className="secondary" disabled={!canRepair} onClick={() => { const next = repairBuilding(state, id); if (next !== state) { vibrate(18); beep(780, 0.08); setState(next); } }}>{canRepair ? `修复 · ${meta.cost} 零件` : `还差 ${Math.max(0, meta.cost - state.parts)} 零件`}</button>}</article>; })}
      <article className="building building--supply building--active"><span className="building__light"/><small>SUPPLY COUNTER</small><h3>七格配给站</h3><p>夜里真正决定能否撑住的地方。七格永远不会增加。</p></article>
    </section>
    <section className="survivor-panel"><div className="section-title"><strong>幸存者分工</strong><span>{state.survivors.length} 人 · 下一夜开张时结算产出</span></div>{state.survivors.length === 0 ? <p className="empty-copy">先修好搜索站，会有人愿意留下。</p> : state.survivors.map((survivor) => <article className="survivor-row" key={survivor.id}><div className="survivor-copy"><strong>{survivor.name}</strong><span>精力 {survivor.energy} · 擅长 {ROLE_LABEL[survivor.specialty]}</span><small>{survivor.perk}</small></div><div className="role-buttons">{availableRoles.map((role) => <button key={role} className={(state.assignments[survivor.id] ?? 'rest') === role ? 'role active' : 'role'} onClick={() => setState(assignSurvivor(state, survivor.id, role))}>{ROLE_LABEL[role]}</button>)}</div></article>)}</section>
    <section className="street-bottom"><div className="resource-row"><span>零件 <strong>{state.parts}</strong></span><span>补给 <strong>{state.supplies}</strong></span><span>药品 <strong>{state.medicine}</strong></span><span>灯火 <strong>Lv.{state.firstLightLevel}</strong></span></div><p>{state.lastMessage}</p>{state.chapterComplete ? <div className="chapter-card"><strong>第一章 · 守住第一盏灯</strong><span>完成。第二街段将在下一阶段开放。</span></div> : state.searchStationRepaired ? <button className="primary" onClick={() => { const next = continueChapter(state); if (next !== state) { beep(520, 0.06); setState(next); } }}>{failedHorde ? '重整防线 · 再守尸潮夜' : `准备好了 · 进入 NIGHT ${state.day + 1}`}</button> : <div className="chapter-card"><strong>当前目标</strong><span>修复搜索站，让第一名幸存者留下。</span></div>}</section>
  </main>;
}

export default function App() {
  const [state, setStateRaw] = useState<GameState>(() => loadGame() ?? createInitialState(20260831));
  const stateRef = useRef(state);
  const setState = (next: GameState) => { stateRef.current = next; setStateRaw(next); };
  useEffect(() => { stateRef.current = state; saveGame(state); }, [state]);
  useEffect(() => {
    if (state.phase !== 'night') return;
    let previous = performance.now();
    const id = window.setInterval(() => { const now = performance.now(); const elapsed = Math.min(500, now - previous); previous = now; setState(tick(stateRef.current, elapsed)); }, 250);
    return () => window.clearInterval(id);
  }, [state.phase, state.day]);
  const screen = useMemo(() => state.phase === 'summary' ? <Summary state={state} setState={setState}/> : state.phase === 'street' ? <StreetScene state={state} setState={setState}/> : <NightScene state={state} setState={setState}/>, [state]);
  return <div className="app-root">{screen}<button className="reset" onClick={() => { if (window.confirm('重新开始余烬长街？当前本地进度会清除。')) { clearSave(); setState(createInitialState(20260831)); } }}>重置</button></div>;
}
