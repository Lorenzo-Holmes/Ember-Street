import type { GameState } from '../../game/types';
import { canTrustReroll, OUTCOME_LABEL, rerollLowestDie, rollPendingCheck } from '../../game/dice';
import { effectiveNightChoiceCostLabel, enhanceFinalHordePreview } from '../../game/v060/day29Comprehension';
import { nightChoicePreview } from '../../game/v060/decisionReadability';
import { acceptNightCheckResult, canAffordNightChoice, chooseNightOption, currentNightEvent, scheduleNight } from '../../game/v060/nightScheduler';
import { eventVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import './explore-night.css';

interface NightEventV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
}

function NightArt({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1n-art" style={visualAssetStyle(asset)}>{!asset ? <div><strong>{label}</strong><small>夜间事件暂无专属插画</small></div> : null}</div>;
}

function DiceDecision({ state, onCommit }: NightEventV1Props) {
  const check = state.pendingCheck;
  if (!check) return null;
  return (
    <main className="v1n-page">
      <header className="v1n-night-head"><div><span>NIGHT</span><strong>DAY {state.day}</strong></div><small>办法已经选了 · 剩下的交给运气</small></header>
      <section className="v1n-dice">
        <span>{check.label}</span>
        <h1>{check.mode === 'advantage' ? '优势 · 3D6 取高二' : check.mode === 'disadvantage' ? '劣势 · 3D6 取低二' : '标准 · 2D6'}</h1>
        {!check.dice ? <><p>骰子落下以后，就当这件事真的发生过。</p><button className="v1n-primary" onClick={() => onCommit(rollPendingCheck(state))}>掷下去</button></> : <>
          <div className="v1n-dice__faces">{check.dice.map((die, index) => <b key={`${die}-${index}`}>{die}</b>)}</div>
          <div className="v1n-dice__total"><span>结果</span><strong>{check.total}</strong><em>{check.outcome ? OUTCOME_LABEL[check.outcome] : ''}</em></div>
          {canTrustReroll(state) && <button className="v1n-secondary" onClick={() => onCommit(rerollLowestDie(state))}>信任 3 · 再给最低一颗一次机会</button>}
          <button className="v1n-primary" onClick={() => onCommit(acceptNightCheckResult(state))}>就按这个结果继续</button>
        </>}
      </section>
    </main>
  );
}

export default function NightEventV1({ state, onCommit }: NightEventV1Props) {
  if (state.pendingCheck) return <DiceDecision state={state} onCommit={onCommit}/>;

  if (!state.nightState.scheduledEventIds.length && state.phase === 'night') {
    return <main className="v1n-page"><header className="v1n-night-head"><div><span>NIGHT</span><strong>DAY {state.day}</strong></div><small>最后一扇门已经上闩</small></header><section className="v1n-opening"><span>天黑前</span><h1>白天留下什么，夜里就只能靠什么。</h1><p>饭锅、门板、诊所、广播和今天留在街里的人，现在都开始算数。</p><button className="v1n-primary" onClick={() => onCommit(scheduleNight(state))}>熄掉多余的灯</button></section></main>;
  }

  const event = currentNightEvent(state);
  if (!event) return <main className="v1n-page"><header className="v1n-night-head"><div><span>NIGHT</span><strong>DAY {state.day}</strong></div></header><section className="v1n-opening"><h1>今晚暂时没有新的声音。</h1></section></main>;
  const art = eventVisual(event.id);
  return (
    <main className="v1n-page">
      <header className="v1n-night-head"><div><span>NIGHT</span><strong>DAY {state.day}</strong></div><div><b>{state.nightState.hordeActive ? '尸潮正在靠近' : '余烬长街 · 入夜'}</b><small>{state.nightState.eventIndex + 1}/{Math.max(1, state.nightState.eventTotal)}</small></div></header>
      <section className="v1n-resource-strip"><span>口粮 <b>{state.inventory.ration}</b></span><span>电力 <b>{state.inventory.power}</b></span><span>防线 <b>{Math.round(state.defense)}</b></span><span>希望 <b>{state.hope}</b></span></section>
      <NightArt asset={art} label={event.title}/>
      <section className="v1n-event-copy"><span>夜里传来的</span><h1>{event.title}</h1><p>{event.body}</p>{event.quote ? <blockquote>{event.quote}</blockquote> : null}</section>
      <div className="v1n-choices">
        {event.choices.map((choice) => {
          const affordable = canAffordNightChoice(state, choice);
          const cost = effectiveNightChoiceCostLabel(state, choice);
          const preview = enhanceFinalHordePreview(state, event, choice, nightChoicePreview(state, event, choice));
          return <button key={choice.id} disabled={!affordable} onClick={() => onCommit(chooseNightOption(state, choice.id))}><strong>{choice.label}</strong><span>{choice.detail}</span><div>{preview.tags.map((tag) => <em key={tag}>{tag}</em>)}</div><small>{preview.summary}</small><i>{choice.check ? `2D6 · ${choice.check.label}` : cost || '不消耗额外资源'}{cost && choice.check ? ` · ${cost}` : ''}{!affordable ? ' · 东西不够' : ''}</i></button>;
        })}
      </div>
    </main>
  );
}
