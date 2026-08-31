import { useEffect, useMemo, useRef, useState } from 'react';
import { SUPPLY_META } from './game/config';
import { createInitialState, repairSearchStation, revealStreet, startSecondNight, takeRack, tick } from './game/engine';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { GameState, SupplyItem, SupplyKind } from './game/types';

function vibrate(ms = 8) { navigator.vibrate?.(ms); }

function beep(frequency = 480, duration = 0.045) {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.04, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
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
  return <main className="game-shell game-shell--night">
    <div className="sky-noise" />
    <header className="hud"><div><span className="eyebrow">NIGHT</span><strong>{state.day}</strong></div><div className="hud__center">余烬长街 · EMBER STREET</div><div><span className="eyebrow">TIME</span><strong>{timeSeconds}s</strong></div></header>
    <section className="street-backdrop" aria-hidden="true"><div className="ruin ruin--left"/><div className="tower" data-level={state.firstLightLevel}><i/></div><div className="ruin ruin--right"/><div className="fence"><span/><span/><span/><span/><span/></div><div className="horde" style={{ opacity: 0.16 + state.hordePressure / 150 }}><b/><b/><b/><b/><b/><b/></div></section>
    <section className="pressure-panel"><div className="pressure-panel__top"><span>尸潮压力</span><strong>{Math.round(state.hordePressure)}%</strong></div><div className="meter"><i style={{ width: `${state.hordePressure}%` }}/></div></section>
    <section className={`request request--${state.currentOrder.kind}`}><div className="request__tag">{state.currentOrder.title}</div><p>{state.currentOrder.line}</p><div className="request__target"><span>需要</span><strong>{orderMeta.tier2}</strong><span className={`mini-sigil mini-sigil--${state.currentOrder.targetKind}`}>{orderMeta.short}</span></div><div className="patience"><i style={{ width: `${patience}%` }}/></div></section>
    <div className="status-strip"><span>希望 {state.hope}</span><span>零件 {state.parts}</span><span>{state.lastMessage}</span></div>
    <section className="tray-wrap"><div className="tray-label"><span>七格配给台</span><small>3 个同类物资自动升级</small></div><div className="tray">{state.slots.map((slot, index) => <div className="slot" key={index}>{slot ? <Token item={slot}/> : <span>{index + 1}</span>}</div>)}</div></section>
    <section className="racks">{state.racks.map((kind, index) => <RackButton key={`${index}-${kind}`} kind={kind} onClick={() => { const before = state.stats.served; const next = takeRack(state, index); if (next !== state) { vibrate(next.stats.served > before ? 14 : 6); beep(next.stats.served > before ? 720 : next.stats.merges > state.stats.merges ? 620 : 390); setState(next); } }}/>)}</section>
  </main>;
}

function Summary({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  return <main className="game-shell summary-screen"><div className="dawn"/><div className="summary-card"><span className="eyebrow">DAWN · DAY {state.day}</span><h1>{state.hordePressure >= 100 ? '今晚很险。' : '天亮了。'}</h1><p>主灯还亮着。街里的人，又多撑过了一晚。</p><div className="summary-grid"><div><strong>{state.stats.served}</strong><span>成功交付</span></div><div><strong>{state.stats.merges}</strong><span>三合升级</span></div><div><strong>{state.parts}</strong><span>回收零件</span></div><div><strong>{state.hope}</strong><span>街区希望</span></div></div><button className="primary" onClick={() => setState(revealStreet(state))}>看看你守住了什么</button></div></main>;
}

function StreetScene({ state, setState }: { state: GameState; setState: (next: GameState) => void }) {
  const canRepair = state.parts >= 6 && !state.searchStationRepaired;
  return <main className="game-shell street-screen"><header className="hud hud--street"><div><span className="eyebrow">DAY</span><strong>{state.day}</strong></div><div className="hud__center">避难街 · 第一街段</div><div><span className="eyebrow">HOPE</span><strong>{state.hope}</strong></div></header><section className="street-map">
    <article className={`building building--ruin ${state.searchStationRepaired ? 'building--active' : ''}`}><span className="building__light"/><small>{state.searchStationRepaired ? 'SEARCH STATION' : 'DARK BUILDING'}</small><h3>{state.searchStationRepaired ? '搜索站' : '废弃搜索站'}</h3><p>{state.searchStationRepaired ? '林夏正在整理下一次外出路线。' : '如果明晚还想撑住，我们得先把这里修起来。'}</p>{!state.searchStationRepaired && <button className="secondary" disabled={!canRepair} onClick={() => { const next = repairSearchStation(state); if (next !== state) { vibrate(18); beep(780, 0.08); setState(next); } }}>{canRepair ? '用 6 零件修复' : `还差 ${Math.max(0, 6 - state.parts)} 零件`}</button>}</article>
    <article className="building building--tower"><span className="building__light building__light--main"/><small>FIRST LIGHT · LV.{state.firstLightLevel}</small><h3>主灯塔</h3><p>整条街最后稳定的光源。只要它还亮着，就还有人会往这里走。</p></article>
    <article className="building building--supply building--active"><span className="building__light"/><small>SUPPLY COUNTER</small><h3>七格配给站</h3><p>刚才的七格柜台，只是这条街的一部分。</p></article>
  </section><section className="street-bottom"><div className="resource-row"><span>零件 <strong>{state.parts}</strong></span><span>补给 <strong>{state.supplies}</strong></span><span>灯火 <strong>Lv.{state.firstLightLevel}</strong></span></div><p>{state.lastMessage}</p>{state.searchStationRepaired && <div className="join-card"><strong>林夏加入避难街</strong><span>擅长：搜索 · 她知道附近还有哪些路能走。</span></div>}{state.searchStationRepaired && <button className="primary" onClick={() => setState(startSecondNight(state))}>进入 NIGHT 2</button>}</section></main>;
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
  return <div className="app-root">{screen}<button className="reset" onClick={() => { if (window.confirm('重新开始 First Light？当前本地进度会清除。')) { clearSave(); setState(createInitialState(20260831)); } }}>重置</button></div>;
}
