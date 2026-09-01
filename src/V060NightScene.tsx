import { canTrustReroll, OUTCOME_LABEL, rerollLowestDie, rollPendingCheck } from './game/dice';
import { saveGame } from './game/storage';
import type { GameState } from './game/types';
import { nightChoicePreview } from './game/v060/decisionReadability';
import { canAffordNightChoice, acceptNightCheckResult, chooseNightOption, currentNightEvent, scheduleNight } from './game/v060/nightScheduler';

const CATEGORY_LABEL = {
  threat: '外部威胁',
  infrastructure: '街区事故',
  survivor: '人物事件',
  resource: '资源事件',
  world: '远方消息',
  quiet: '长夜片刻',
  horde: '尸潮突袭',
  emergency: '紧急处置',
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
    <section className="v060-check" aria-label="战术命运检定">
      <div className="v060-event__kicker">✦ 战术行动判定</div>
      <h2>{check.label}</h2>
      <p className="v060-check__mode">
        {check.mode === 'advantage'
          ? '优势判定 · 3D6 取最高 2 颗骰子'
          : check.mode === 'disadvantage'
          ? '劣势判定 · 3D6 取最低 2 颗骰子'
          : '标准判定 · 2D6 掷骰'}
      </p>

      {!check.dice ? (
        <div className="v060-dice-unrolled">
          <p className="v060-dice-warning">
            抉择已锁定并记入日志。掷出的骰子将直接产生后果，刷新页面无法撤销。
          </p>
          <button className="v060-primary v060-btn-roll" onClick={roll}>
            🎲 投掷命运骰子
          </button>
        </div>
      ) : (
        <div className="v060-dice-rolled">
          <div className="v060-dice">
            {check.dice.map((die, index) => (
              <b key={`${die}-${index}`}>{die}</b>
            ))}
          </div>

          <div className="v060-modifiers">
            {check.modifiers.map((modifier) => (
              <span key={modifier.label}>
                {modifier.label} {modifier.value >= 0 ? '+' : ''}{modifier.value}
              </span>
            ))}
          </div>

          <div className="v060-total">
            <span>最终判定点数:</span>
            <strong>{check.total}</strong>
            <em>{check.outcome ? OUTCOME_LABEL[check.outcome] : ''}</em>
          </div>

          {check.twist && (
            <p className="v060-twist">
              {check.twist === 'double-six'
                ? '★ 大成功（双六）· 在绝境中迎来了意料之外的转机！'
                : '☠️ 大失败（双一）· 局势朝最险恶的方向滑落了一步……'}
            </p>
          )}

          <div className="v060-check__actions">
            {canTrustReroll(state) && (
              <button className="v060-secondary" onClick={reroll}>
                🌟 消耗 3 点信任 · 重投最低骰子
              </button>
            )}
            <button className="v060-primary" onClick={accept}>
              ✓ 接受并结算判定结果
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
          {state.nightState.hordeActive ? '⚠️ 尸潮逼近 · 极度危险' : '余烬长街 · 战地夜防'}
        </span>
        <small>
          {state.nightState.hordeActive
            ? '黑暗中传来密集的撞击声，防线承受严峻压力。'
            : '听清外围一切异动，冷静做出今夜决断。'}
        </small>
      </div>
      <div className="v060-night__header-count">
        <span>已处置事件</span>
        <strong>
          {state.nightState.eventIndex} / {state.nightState.eventTotal}
        </strong>
      </div>
    </header>
  );
}

export default function V060NightScene({
  state,
  setState,
}: {
  state: GameState;
  setState: (state: GameState) => void;
}) {
  if (!state.nightState.scheduledEventIds.length && state.phase === 'night') {
    return (
      <main className="v6-shell v060-night">
        <header className="v060-night__header">
          <div className="v060-night__header-day">
            <span>NIGHT LOG</span>
            <strong>DAY {state.day}</strong>
          </div>
          <div className="v060-night__header-center">
            <span>余烬长街 · 夜幕降临</span>
            <small>天黑以后，每个决定都将延续到黎明。</small>
          </div>
        </header>
        <section className="v060-night__opening">
          <span>黄昏已逝 · 黑暗降临</span>
          <h1>今晚的值守与防御已经锁定。</h1>
          <p>
            从此刻起不可重新调遣人员。白天留下的物资储备、医疗准备与防线工事，将决定我们在黑暗中能撑多久。
          </p>
          <button className="v060-primary" onClick={() => commit(scheduleNight(state), setState)}>
            🌑 正式步入长夜
          </button>
        </section>
      </main>
    );
  }

  if (state.pendingCheck) {
    return (
      <main className="v6-shell v060-night">
        <V060NightHeader state={state} />
        <DicePanel state={state} setState={setState} />
      </main>
    );
  }

  if (state.phase === 'night-summary') {
    return (
      <main className="v6-shell v060-night">
        <V060NightHeader state={state} />
        <section className="v060-night__opening">
          <span>DAWN · 破晓</span>
          <h1>熬过长夜，天亮了。</h1>
          <p>
            今晚共处置了 {state.nightState.resolutions.length} 起夜间事件。
            {state.nightState.hordeActive
              ? '尸潮已经退去，街道上留下的创伤与损失将在白天显现。'
              : '街道重新回归沉寂，准备迎接新一天的挑战。'}
          </p>
          <button
            className="v060-primary"
            onClick={() =>
              commit({ ...state, phase: 'summary', lastMessage: `DAY ${state.day} · 天亮了` }, setState)
            }
          >
            📋 查看昨夜最终结算
          </button>
        </section>
      </main>
    );
  }

  const event = currentNightEvent(state);
  if (!event) {
    return (
      <main className="v6-shell v060-night">
        <V060NightHeader state={state} />
        <section className="v060-night__opening">
          <h1>今晚暂时没有新的异动。</h1>
        </section>
      </main>
    );
  }

  const isEmergency = event.category === 'emergency';
  const mainResolved = state.nightState.scheduledEventIds.filter((id) =>
    state.nightState.resolutions.includes(id),
  ).length;

  return (
    <main className={`v6-shell v060-night${isEmergency ? ' v060-night--emergency' : ''}`}>
      <V060NightHeader state={state} />

      <section className="v060-night__resources">
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
          {CATEGORY_LABEL[event.category]}
          {isEmergency ? ' · 立即紧急处置' : ''}
        </div>
        <h1>{event.title}</h1>
        <p>{event.body}</p>
        {event.quote && <blockquote>“{event.quote}”</blockquote>}

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
                  <div
                    className="v6-decision-tags"
                    style={{ margin: '6px 0 2px' }}
                    aria-label="选择后果预告"
                  >
                    {preview.tags.map((tag) => (
                      <span className="v6-badge--tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <small className="v060-preview-summary">{preview.summary}</small>
                  <small className="v060-choice-cost">
                    {choice.check ? `🎲 判定: ${choice.check.label}` : cost || '直接执行'}
                    {cost && choice.check ? ` · 消耗: ${cost}` : ''}
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
              ? '⚠ 突发紧急事件'
              : `长夜事件 ${Math.min(mainResolved + 1, state.nightState.eventTotal)} / ${state.nightState.eventTotal}`}
          </strong>
          <span>{state.nightState.hordeActive ? '尸潮正在加剧外围威胁' : '街区外围仍有零星死寂'}</span>
        </div>
        <div className="v060-dots">
          {Array.from({ length: state.nightState.eventTotal }, (_, index) => (
            <i
              key={index}
              className={
                index < mainResolved
                  ? 'done'
                  : index === mainResolved && !isEmergency
                  ? 'current'
                  : ''
              }
            />
          ))}
        </div>
      </footer>
    </main>
  );
}
