import type { GameState } from '../../game/types';
import { canTrustReroll, OUTCOME_LABEL, rerollLowestDie, rollPendingCheck } from '../../game/dice';
import { effectiveNightChoiceCostLabel, enhanceFinalHordePreview } from '../../game/v060/day29Comprehension';
import { nightChoicePreview } from '../../game/v060/decisionReadability';
import { defenseNumber } from '../../game/v060/defenseFeedback';
import { acceptNightCheckResult, canAffordNightChoice, chooseNightOption, currentNightEvent, scheduleNight } from '../../game/v060/nightScheduler';
import { buildingVisual, eventVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import './explore-night.css';

interface NightEventV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
}

function nightProgressLabel(index: number, total: number, horde: boolean): string {
  if (horde) return index + 1 >= Math.max(1, total) ? '天快亮了，尸潮还没退' : '尸潮还在撞门';
  const progress = (index + 1) / Math.max(1, total);
  return progress <= 0.34 ? '入夜不久' : progress <= 0.67 ? '夜已经深了' : '天快亮了';
}

function NightArt({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1n-art" aria-label={label} style={visualAssetStyle(asset)}>{!asset ? <div><strong>{label}</strong><small>黑暗里看不清发生了什么</small></div> : null}</div>;
}

function NightHeader({ day, title, detail }: { day: number; title?: string; detail?: string }) {
  return <header className="v1n-night-head"><div className="v1n-night-head__day"><span>入夜</span><strong>第 {day} 天</strong></div>{title ? <div className="v1n-night-head__status"><b>{title}</b>{detail ? <small>{detail}</small> : null}</div> : null}</header>;
}

function DiceDecision({ state, onCommit }: NightEventV1Props) {
  const check = state.pendingCheck;
  if (!check) return null;
  const odds = check.mode === 'advantage' ? '这次更有把握' : check.mode === 'disadvantage' ? '这次很难办' : '只能试一次';
  const diceNote = check.mode === 'advantage' ? '掷三枚，留下最高两枚' : check.mode === 'disadvantage' ? '掷三枚，留下最低两枚' : '掷两枚';
  return (
      <main className="v1n-page notebook-page notebook-page--night">
      <NightHeader day={state.day} title="办法已经选了" detail="接下来只能看结果"/>
      <section className="v1n-dice">
        <span>{check.label}</span>
        <h1>{odds}</h1>
        {!check.dice ? <><p>{diceNote}。结果落下以后，不能再改。</p><button className="v1n-primary" onClick={() => onCommit(rollPendingCheck(state))}>试一次</button></> : <>
          <div className="v1n-dice__faces">{check.dice.map((die, index) => <b key={`${die}-${index}`}>{die}</b>)}</div>
          <div className="v1n-dice__total"><span>骰子停下</span><strong>{check.total}</strong><em>{check.outcome ? OUTCOME_LABEL[check.outcome] : ''}</em></div>
          {canTrustReroll(state) && <button className="v1n-secondary" onClick={() => onCommit(rerollLowestDie(state))}>有人愿意替你再试一次</button>}
          <button className="v1n-primary" onClick={() => onCommit(acceptNightCheckResult(state))}>把结果记下</button>
        </>}
      </section>
    </main>
  );
}

export default function NightEventV1({ state, onCommit }: NightEventV1Props) {
  if (state.pendingCheck) return <DiceDecision state={state} onCommit={onCommit}/>;

  if (!state.nightState.scheduledEventIds.length && state.phase === 'night') {
    return <main className="v1n-page notebook-page notebook-page--night"><NightHeader day={state.day} title="最后一扇门已经上闩"/><section className="v1n-opening"><span>天黑前</span><h1>最后一扇门已经关好。</h1><p>谁守街口、谁留在诊疗室、饭和电还剩多少，现在都不能再改。</p><button className="v1n-primary" onClick={() => onCommit(scheduleNight(state))}>关掉外面的灯</button></section></main>;
  }

  const event = currentNightEvent(state);
  if (!event) return <main className="v1n-page notebook-page notebook-page--night"><NightHeader day={state.day}/><section className="v1n-opening"><h1>今晚暂时没有新的声音。</h1></section></main>;
  const exactArt = eventVisual(event.id);
  const art = exactArt ?? buildingVisual('shelter');
  return (
    <main className="v1n-page notebook-page notebook-page--night">
      <NightHeader day={state.day} title={state.nightState.hordeActive ? '尸潮正在靠近' : '余烬长街 · 入夜'} detail={nightProgressLabel(state.nightState.eventIndex, state.nightState.eventTotal, state.nightState.hordeActive)}/>
      <section className="v1n-resource-strip"><span>口粮 <b>{state.inventory.ration}</b></span><span>电力 <b>{state.inventory.power}</b></span><span>防线 <b>{defenseNumber(state.defense)}</b></span><span>希望 <b>{state.hope}</b></span></section>
      <NightArt asset={art} label={exactArt ? event.title : '余烬长街 · 夜里的据点'}/>
      <section className="v1n-event-copy"><span>夜里发生的</span><h1>{event.title}</h1><p>{event.body}</p>{event.quote ? <blockquote>{event.quote}</blockquote> : null}</section>
      <div className="v1n-choices">
        {event.choices.map((choice) => {
          const affordable = canAffordNightChoice(state, choice);
          const cost = effectiveNightChoiceCostLabel(state, choice);
          const preview = enhanceFinalHordePreview(state, event, choice, nightChoicePreview(state, event, choice));
          const costNote = [cost || (!choice.check ? '不用再拿东西' : ''), !affordable ? '手里不够' : ''].filter(Boolean).join(' · ');
          const costParts = new Set(costNote.split(' · '));
          const tags = preview.tags.filter((tag) => !costParts.has(tag));
          return <button key={choice.id} disabled={!affordable} onClick={() => onCommit(chooseNightOption(state, choice.id))}><strong>{choice.label}</strong><span>{choice.detail}</span><div>{tags.map((tag) => <em key={tag}>{tag}</em>)}</div>{costNote ? <i>{costNote}</i> : null}</button>;
        })}
      </div>
    </main>
  );
}
