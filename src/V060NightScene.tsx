import { canTrustReroll, OUTCOME_LABEL, rerollLowestDie, rollPendingCheck } from './game/dice';
import { saveGame } from './game/storage';
import type { GameState } from './game/types';
import { effectiveNightChoiceCostLabel, enhanceFinalHordePreview } from './game/v060/day29Comprehension';
import { nightChoicePreview } from './game/v060/decisionReadability';
import {
  canAffordNightChoice,
  acceptNightCheckResult,
  chooseNightOption,
  currentNightEvent,
  scheduleNight,
} from './game/v060/nightScheduler';

const CATEGORY_LABEL = {
  threat: '街外动静',
  infrastructure: '街里的麻烦',
  survivor: '人的事',
  resource: '仓房里的事',
  world: '远处传来的',
  quiet: '长夜片刻',
  horde: '尸潮',
  emergency: '突然响起来',
} as const;

function nightProgressLabel(index: number, total: number, horde: boolean): string {
  if (horde) return index + 1 >= Math.max(1, total) ? '天快亮了，尸潮还没退' : '尸潮还在撞门';
  const progress = (index + 1) / Math.max(1, total);
  return progress <= 0.34 ? '入夜不久' : progress <= 0.67 ? '夜已经深了' : '天快亮了';
}

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function DicePanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const check = state.pendingCheck;
  if (!check) return null;

  const roll = () => commit(rollPendingCheck(state), setState);
  const reroll = () => commit(rerollLowestDie(state), setState);
  const accept = () => commit(acceptNightCheckResult(state), setState);

  return (
    <section className="v060-check" aria-label="夜间骰子判定">
      <div className="v060-event__kicker">办法已经选了，接下来只能看结果</div>
      <h2>{check.label}</h2>
      <p className="v060-check__mode">
        {check.mode === 'advantage'
          ? '这次更有把握 · 掷三枚，留下最高两枚'
          : check.mode === 'disadvantage'
            ? '这次很难办 · 掷三枚，留下最低两枚'
            : '只能试一次 · 掷两枚'}
      </p>

      {!check.dice ? (
        <div className="v060-dice-unrolled">
          <p className="v060-dice-warning">
            结果落下以后，不能再改。
          </p>
          <button className="v060-primary v060-btn-roll" onClick={roll}>
            试一次
          </button>
        </div>
      ) : (
        <div className="v060-dice-rolled">
          <div className="v060-dice">
            {check.dice.map((die, index) => <b key={`${die}-${index}`}>{die}</b>)}
          </div>
          <div className="v060-modifiers">
            {check.modifiers.map((modifier) => (
              <span key={modifier.label}>
                {modifier.label} {modifier.value >= 0 ? '+' : ''}{modifier.value}
              </span>
            ))}
          </div>
          <div className="v060-total">
            <span>结果</span>
            <strong>{check.total}</strong>
            <em>{check.outcome ? OUTCOME_LABEL[check.outcome] : ''}</em>
          </div>
          {check.twist && (
            <p className="v060-twist">
              {check.twist === 'double-six'
                ? '双六 · 今晚出现了意料之外的转机。'
                : '双一 · 事情朝最坏的方向滑了一步。'}
            </p>
          )}
          <div className="v060-check__actions">
            {canTrustReroll(state) && (
              <button className="v060-secondary" onClick={reroll}>
                有人愿意替你再试一次
              </button>
            )}
            <button className="v060-primary" onClick={accept}>
              把结果记下
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function V060NightHeader({ state }: { state: GameState }) {
  return (
    <header className="v060-night__header">
      <div className="v060-night__header-day">
        <span>NIGHT</span>
        <strong>DAY {state.day}</strong>
      </div>
      <div className="v060-night__header-center">
        <span className={state.nightState.hordeActive ? 'is-horde' : ''}>
          {state.nightState.hordeActive ? '尸潮正在靠近' : '余烬长街 · 入夜'}
        </span>
        <small>
          {state.nightState.hordeActive
            ? '声音一层一层压过来。白天钉上的每块板、留下的每个人，现在都算数。'
            : '灯尽量压低。先听清楚，再决定开不开门。'}
        </small>
      </div>
      <div className="v060-night__header-count">
        <span>这一夜</span>
        <strong>{state.nightState.eventIndex}/{state.nightState.eventTotal}</strong>
      </div>
    </header>
  );
}

export default function V060NightScene({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.nightState.scheduledEventIds.length && state.phase === 'night') {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night notebook-page notebook-page--night">
        <header className="v060-night__header">
          <div className="v060-night__header-day">
            <span>NIGHT</span>
            <strong>DAY {state.day}</strong>
          </div>
          <div className="v060-night__header-center">
            <span>余烬长街 · 天黑前</span>
            <small>最后一扇门已经上闩。</small>
          </div>
        </header>
        <section className="v060-night__opening">
          <span>DUSK · 街口已经封上</span>
          <h1>最后一扇门已经关好。</h1>
          <p>谁守街口、谁留在诊疗室、饭和电还剩多少，现在都不能再改。</p>
          <button className="v060-primary" onClick={() => commit(scheduleNight(state), setState)}>
            关掉外面的灯
          </button>
        </section>
      </main>
    );
  }

  if (state.pendingCheck) {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night notebook-page notebook-page--night">
        <V060NightHeader state={state} />
        <DicePanel state={state} setState={setState} />
      </main>
    );
  }

  if (state.phase === 'night-summary') {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night notebook-page notebook-page--night notebook-page--night-summary">
        <V060NightHeader state={state} />
        <section className="v060-night__opening">
          <span>天亮 · 外面安静下来了</span>
          <h1>天亮了。</h1>
          <p>
            这一夜留下的事都已经记下。
            {state.nightState.hordeActive
              ? '尸潮已经退去，留下的损失要到白天才能看清。'
              : '街道重新安静下来。'}
          </p>
          <button
            className="v060-primary"
            onClick={() => commit({ ...state, phase: 'summary', lastMessage: `第 ${state.day} 天 · 天亮了` }, setState)}
          >
            去看看天亮以后
          </button>
        </section>
      </main>
    );
  }

  const event = currentNightEvent(state);
  if (!event) {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night notebook-page notebook-page--night">
        <V060NightHeader state={state} />
        <section className="v060-night__opening">
          <h1>今晚暂时没有新的声音。</h1>
        </section>
      </main>
    );
  }

  const isEmergency = event.category === 'emergency';
  const mainResolved = state.nightState.scheduledEventIds.filter((id) => state.nightState.resolutions.includes(id)).length;

  return (
    <main className={`game-shell game-shell--night v6-shell v060-night notebook-page notebook-page--night${isEmergency ? ' v060-night--emergency' : ''}`}>
      <V060NightHeader state={state} />

      <section className="v060-night__resources" aria-label="夜间剩余物资">
        <span>口粮 <b>{state.inventory.ration}</b></span>
        <span>药品 <b>{state.inventory.medicine}</b></span>
        <span>电力 <b>{state.inventory.power}</b></span>
        <span>材料 <b>{state.inventory.materials}</b></span>
        <span>零件 <b>{state.inventory.parts}</b></span>
        <span>防线 <b>{Math.round(state.defense ?? 50)}</b></span>
        <span>希望 <b>{state.hope}</b></span>
      </section>

      <section className={`v060-event v060-event--${event.category}`}>
        <div className="v060-event__kicker">
          夜里发生的 · {CATEGORY_LABEL[event.category]}{isEmergency ? ' · 现在就得管' : ''}
        </div>
        <h1>{event.title}</h1>
        <p>{event.body}</p>
        {event.quote && <blockquote>{event.quote}</blockquote>}

        <div className="v060-choices">
          {event.choices.map((choice, index) => {
            const affordable = canAffordNightChoice(state, choice);
            const cost = effectiveNightChoiceCostLabel(state, choice);
            const preview = enhanceFinalHordePreview(state, event, choice, nightChoicePreview(state, event, choice));

            return (
              <button
                key={choice.id}
                className={`v060-choice v060-choice--${choice.strategy}`}
                disabled={!affordable}
                onClick={() => commit(chooseNightOption(state, choice.id), setState)}
              >
                <span className="v060-choice__letter">{String.fromCharCode(65 + index)}</span>
                <div className="v060-choice__content">
                  <strong>{choice.label}</strong>
                  <span>{choice.detail}</span>
                  <div className="v6-decision-tags" aria-label="选择提示">
                    {preview.tags.map((tag) => <span className="v6-badge--tag" key={tag}>{tag}</span>)}
                  </div>
                  <small className="v060-preview-summary">{preview.summary}</small>
                  <small className="v060-choice-cost">
                    {choice.check ? `要靠${choice.check.label}` : cost || '不用再拿东西'}
                    {cost && choice.check ? ` · ${cost}` : ''}
                    {!affordable ? ' · 手里不够' : ''}
                  </small>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="v060-night__progress">
        <div>
          <strong>
            {isEmergency
              ? '突然的动静'
              : nightProgressLabel(mainResolved, state.nightState.eventTotal, state.nightState.hordeActive)}
          </strong>
          <span>{state.nightState.hordeActive ? '尸潮还在往街口压' : '远处偶尔还有影子从路口经过'}</span>
        </div>
        <div className="v060-dots">
          {Array.from({ length: state.nightState.eventTotal }, (_, index) => (
            <i
              key={index}
              className={index < mainResolved ? 'done' : index === mainResolved && !isEmergency ? 'current' : ''}
            />
          ))}
        </div>
      </footer>
    </main>
  );
}
