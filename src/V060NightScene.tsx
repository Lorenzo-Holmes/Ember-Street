import { canTrustReroll, OUTCOME_LABEL, rerollLowestDie, rollPendingCheck } from './game/dice';
import { saveGame } from './game/storage';
import type { GameState } from './game/types';
import { nightChoicePreview } from './game/v060/decisionReadability';
import {
  canAffordNightChoice,
  acceptNightCheckResult,
  chooseNightOption,
  currentNightEvent,
  scheduleNight,
} from './game/v060/nightScheduler';

const CATEGORY_LABEL = {
  threat: '外部威胁',
  infrastructure: '街区事故',
  survivor: '人物事件',
  resource: '资源事件',
  world: '远方消息',
  quiet: '长夜片刻',
  horde: '尸潮',
  emergency: '紧急事件',
} as const;

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function costLabel(cost: Parameters<typeof canAffordNightChoice>[1]['cost']): string {
  if (!cost) return '';
  const parts = [
    cost.ration ? `口粮 -${cost.ration}` : '',
    cost.medicine ? `药品 -${cost.medicine}` : '',
    cost.materials ? `材料 -${cost.materials}` : '',
    cost.parts ? `零件 -${cost.parts}` : '',
    cost.power ? `电力 -${cost.power}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function DicePanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const check = state.pendingCheck;
  if (!check) return null;

  const roll = () => commit(rollPendingCheck(state), setState);
  const reroll = () => commit(rerollLowestDie(state), setState);
  const accept = () => commit(acceptNightCheckResult(state), setState);

  return (
    <section className="v060-check" aria-label="夜间命运判定">
      <div className="v060-event__kicker">战时记录 · 命运判定</div>
      <h2>{check.label}</h2>
      <p className="v060-check__mode">
        {check.mode === 'advantage'
          ? '优势 · 3D6 取高二'
          : check.mode === 'disadvantage'
            ? '劣势 · 3D6 取低二'
            : '标准 · 2D6'}
      </p>

      {!check.dice ? (
        <div className="v060-dice-unrolled">
          <p className="v060-dice-warning">
            选择已经锁定。投出的骰子会立即写入存档，刷新页面不会改变结果。
          </p>
          <button className="v060-primary v060-btn-roll" onClick={roll}>
            🎲 投骰 · 写入战时日志
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
            <span>最终</span>
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
                信任 3 · 重投最低一颗
              </button>
            )}
            <button className="v060-primary" onClick={accept}>
              接受结果 · 继续长夜
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
        <span>NIGHT LOG</span>
        <strong>DAY {state.day}</strong>
      </div>
      <div className="v060-night__header-center">
        <span className={state.nightState.hordeActive ? 'is-horde' : ''}>
          {state.nightState.hordeActive ? '⚠ 尸潮迹象' : 'EMBER STREET · 夜防记录'}
        </span>
        <small>
          {state.nightState.hordeActive
            ? '今晚的声音比往常更多。白天留下的每一项准备都在被检验。'
            : '听清楚，再决定。每个选择都可能留到明天。'}
        </small>
      </div>
      <div className="v060-night__header-count">
        <span>事件</span>
        <strong>{state.nightState.eventIndex}/{state.nightState.eventTotal}</strong>
      </div>
    </header>
  );
}

export default function V060NightScene({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.nightState.scheduledEventIds.length && state.phase === 'night') {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night">
        <header className="v060-night__header">
          <div className="v060-night__header-day">
            <span>NIGHT LOG</span>
            <strong>DAY {state.day}</strong>
          </div>
          <div className="v060-night__header-center">
            <span>余烬长街 · 黄昏交接记录</span>
            <small>天黑以后，每个决定都可能留到明天。</small>
          </div>
        </header>
        <section className="v060-night__opening">
          <span>DUSK CLOSED · 人员调遣已封存</span>
          <h1>今晚的人已经安排好了。</h1>
          <p>从现在开始不能重新调遣。白天留下的准备，会决定黑暗里有哪些办法可用。</p>
          <button className="v060-primary" onClick={() => commit(scheduleNight(state), setState)}>
            🌑 进入长夜
          </button>
        </section>
      </main>
    );
  }

  if (state.pendingCheck) {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night">
        <V060NightHeader state={state} />
        <DicePanel state={state} setState={setState} />
      </main>
    );
  }

  if (state.phase === 'night-summary') {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night">
        <V060NightHeader state={state} />
        <section className="v060-night__opening">
          <span>DAWN · 夜间档案封存</span>
          <h1>天亮了。</h1>
          <p>
            今晚处理了 {state.nightState.resolutions.length} 件事。
            {state.nightState.hordeActive
              ? '尸潮已经退去，留下的损失要到白天才能看清。'
              : '街道重新安静下来。'}
          </p>
          <button
            className="v060-primary"
            onClick={() => commit({ ...state, phase: 'summary', lastMessage: `DAY ${state.day} · 天亮了` }, setState)}
          >
            查看昨夜结果
          </button>
        </section>
      </main>
    );
  }

  const event = currentNightEvent(state);
  if (!event) {
    return (
      <main className="game-shell game-shell--night v6-shell v060-night">
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
    <main className={`game-shell game-shell--night v6-shell v060-night${isEmergency ? ' v060-night--emergency' : ''}`}>
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
          FIELD REPORT · {CATEGORY_LABEL[event.category]}{isEmergency ? ' · 立即处理' : ''}
        </div>
        <h1>{event.title}</h1>
        <p>{event.body}</p>
        {event.quote && <blockquote>{event.quote}</blockquote>}

        <div className="v060-choices">
          {event.choices.map((choice, index) => {
            const affordable = canAffordNightChoice(state, choice);
            const cost = costLabel(choice.cost);
            const preview = nightChoicePreview(state, event, choice);

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
                    {choice.check ? `🎲 ${choice.check.label}` : cost || '直接处理'}
                    {cost && choice.check ? ` · ${cost}` : ''}
                    {!affordable ? ' · 物资不足' : ''}
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
              ? '⚠ 紧急事件'
              : `事件 ${Math.min(mainResolved + 1, state.nightState.eventTotal)} / ${state.nightState.eventTotal}`}
          </strong>
          <span>{state.nightState.hordeActive ? '尸潮正在影响今晚的事件池' : '外围仍有零星尸影'}</span>
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
