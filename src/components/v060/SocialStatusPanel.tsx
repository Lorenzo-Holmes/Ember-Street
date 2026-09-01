import type { GameState } from '../../game/types';
import { activeMentalState, MENTAL_LABEL } from '../../game/v060/characterPsychology';
import {
  acceptCommunityRequest,
  activePromiseSummary,
  declineCommunityRequest,
  pendingCommunityRequest,
} from '../../game/v060/communityPromises';
import { choosePrinciple, pendingPrincipleDecision, PRINCIPLE_DECISIONS } from '../../game/v060/principles';
import { pressureLabel, socialStateOf } from '../../game/v060/socialPressure';

interface SocialStatusPanelProps {
  state: GameState;
  onCommit: (next: GameState) => void;
  compact?: boolean;
}

export default function SocialStatusPanel({ state, onCommit, compact = false }: SocialStatusPanelProps) {
  const social = socialStateOf(state);
  const active = activePromiseSummary(state);
  const request = pendingCommunityRequest(state);
  const principle = pendingPrincipleDecision(state);
  const principleChoices = PRINCIPLE_DECISIONS.flatMap((decision) => decision.choices);
  const mentalNotes = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
    .map((survivor) => ({ survivor, mental: activeMentalState(state, survivor) }))
    .filter(({ mental }) => mental !== 'steady');

  return (
    <section className="v6-section v6-social-panel" aria-label="街区近况、承诺与人物状态">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">街区近况</span>
          <h2>有些东西不会写进仓房的清单</h2>
        </div>
        <div className="v6-promise-tally" aria-label="承诺记录">
          <span>守约 <b>{social.fulfilledPromises}</b></span>
          <span className="v6-tally-sep">·</span>
          <span>食言 <b>{social.brokenPromises}</b></span>
        </div>
      </div>

      <div className="v6-preview v6-social-metrics">
        <div className="v6-metric-card v6-metric-card--hope">
          <div className="v6-metric-header">
            <span>火还亮不亮</span>
            <span className="v6-metric-chip">{state.hope >= 40 ? '还亮着' : state.hope >= 20 ? '有些发虚' : '快灭了'}</span>
          </div>
          <strong>{state.hope}</strong>
          <small>还有人愿意为明天多做一件事，这就是现在剩下的希望。</small>
        </div>

        <div className={`v6-metric-card v6-metric-card--pressure v6-metric-card--pressure-${social.pressure >= 3 ? 'extreme' : social.pressure >= 2 ? 'high' : social.pressure >= 1 ? 'moderate' : 'calm'}`}>
          <div className="v6-metric-header">
            <span>这条街绷得多紧</span>
            <span className="v6-metric-chip">{pressureLabel(state)}</span>
          </div>
          <strong>{pressureLabel(state)}</strong>
          <small>冷饭、伤亡、没人照看的伤口和松掉的门，都会一点点压在人身上。</small>
        </div>

        <div className="v6-metric-card v6-metric-card--mental">
          <div className="v6-metric-header">
            <span>谁已经快撑不住了</span>
            <span className="v6-metric-chip">{mentalNotes.length ? `${mentalNotes.length} 人不太对劲` : '暂时平静'}</span>
          </div>
          <strong>{mentalNotes.length ? `${mentalNotes.length} 人最近有些不对劲` : '暂时没人掉队'}</strong>
          <small>
            {mentalNotes.length
              ? mentalNotes
                  .map(
                    ({ survivor, mental }) =>
                      `${survivor.name} · ${MENTAL_LABEL[mental]}${survivor.mentalUntilDay ? `（到 DAY ${survivor.mentalUntilDay} 左右）` : ''}`,
                  )
                  .join('；')
              : '至少今天早上，没人把难受写在脸上。'}
          </small>
        </div>
      </div>

      {!!social.principles.length && (
        <div className="v6-principle-ledger" aria-label="街区已经说定的规矩">
          <span className="v6-principle-ledger__label">我们说过的话</span>
          <div className="v6-principle-ledger__items">
            {social.principles.map((id) => (
              <span className="v6-stamp-badge v6-stamp--principle" key={id}>
                {principleChoices.find((choice) => choice.id === id)?.title ?? id}
              </span>
            ))}
          </div>
        </div>
      )}

      {principle && !compact && (
        <article className="v6-survivor v6-principle-card" style={{ marginTop: 12 }}>
          <div className="v6-survivor__top">
            <div className="v6-survivor__profile">
              <span className="v6-survivor__avatar-tag">⚖</span>
              <div>
                <h3>街上得有个说法 · DAY {principle.day}</h3>
                <div className="v6-survivor__trait">{principle.title}</div>
              </div>
            </div>
            <span className="v6-principle-stamp">说出口就算数</span>
          </div>
          <p className="v6-principle-body">{principle.body}</p>
          <div className="v6-principle-choice-grid">
            {principle.choices.map((choice) => (
              <button
                key={choice.id}
                className="v6-principle-choice"
                onClick={() => onCommit(choosePrinciple(state, choice.id))}
              >
                <strong>{choice.title}</strong>
                <span>{choice.detail}</span>
                <small>这句话会留下：{choice.effect}</small>
              </button>
            ))}
          </div>
          <small className="v6-principle-hint">一旦定下来，往后的事都会记着它。</small>
        </article>
      )}

      {active && (
        <article className="v6-survivor v6-promise-active" style={{ marginTop: 12 }}>
          <div className="v6-survivor__top">
            <div className="v6-survivor__profile">
              <span className="v6-survivor__avatar-tag">📜</span>
              <div>
                <h3>我们答应过的 · 《{active.title}》</h3>
                <div className="v6-survivor__trait">{active.detail}</div>
              </div>
            </div>
            <div className="v6-survivor__energy">
              <div className="v6-energy-header">
                <span className="v6-survivor__energy-label">还剩</span>
                <span className="v6-survivor__energy-val">{active.remainingDays} 天</span>
              </div>
            </div>
          </div>
          <p className="v6-promise-note">答应过的事，看的是我们有没有去做。一次失手，不算食言。</p>
        </article>
      )}

      {!active && request && !principle && !compact && (
        <article className="v6-survivor v6-request-card" style={{ marginTop: 12 }}>
          <div className="v6-survivor__top">
            <div className="v6-survivor__profile">
              <span className="v6-survivor__avatar-tag">📢</span>
              <div>
                <h3>有人来问 · 《{request.title}》</h3>
                <div className="v6-survivor__trait">{request.body}</div>
              </div>
            </div>
          </div>
          <div className="v6-request-promise-box">
            <strong>要是答应：</strong>
            <span>{request.promiseText}</span>
          </div>
          <div className="v6-job-grid" style={{ marginTop: 10 }}>
            <button className="v6-btn-pledge" onClick={() => onCommit(acceptCommunityRequest(state, request.id))}>
              ✍ 答应这件事
            </button>
            <button className="v6-btn-decline" onClick={() => onCommit(declineCommunityRequest(state, request.id))}>
              ✕ 现在不答应
            </button>
          </div>
          <small className="v6-request-hint">不答应，就是现在把话说清楚。有人会失望，但不会凭空多出一笔旧账。</small>
        </article>
      )}

      {social.lastOutcome && <p className="v6-message v6-message--social">{social.lastOutcome}</p>}
    </section>
  );
}