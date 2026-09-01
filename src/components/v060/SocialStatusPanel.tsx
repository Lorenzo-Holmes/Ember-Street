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
    <section className="v6-section v6-social-panel" aria-label="街区社会状态、原则与心理记录">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">街区社会与心理记录</span>
          <h2>生存压力、信任与长期原则</h2>
        </div>
        <div className="v6-promise-tally" aria-label="承诺履约统计">
          <span>兑现 <b>{social.fulfilledPromises}</b></span>
          <span className="v6-tally-sep">·</span>
          <span>食言 <b>{social.brokenPromises}</b></span>
        </div>
      </div>

      <div className="v6-preview v6-social-metrics">
        <div className="v6-metric-card v6-metric-card--hope">
          <div className="v6-metric-header">
            <span>街区希望</span>
            <span className="v6-metric-chip">{state.hope >= 40 ? '充裕' : state.hope >= 20 ? '警戒' : '濒临绝望'}</span>
          </div>
          <strong>{state.hope}</strong>
          <small>长期支柱：大家是否还相信这条街能够守到天亮。</small>
        </div>

        <div className={`v6-metric-card v6-metric-card--pressure v6-metric-card--pressure-${social.pressure >= 3 ? 'extreme' : social.pressure >= 2 ? 'high' : social.pressure >= 1 ? 'moderate' : 'calm'}`}>
          <div className="v6-metric-header">
            <span>街区压力</span>
            <span className="v6-metric-chip">{pressureLabel(state)}</span>
          </div>
          <strong>{pressureLabel(state)}</strong>
          <small>短期负担：冷食、伤亡、无人医疗和防线受损会持续累积压力。</small>
        </div>

        <div className="v6-metric-card v6-metric-card--mental">
          <div className="v6-metric-header">
            <span>核心心理</span>
            <span className="v6-metric-chip">{mentalNotes.length ? `${mentalNotes.length} 人波动` : '平稳'}</span>
          </div>
          <strong>{mentalNotes.length ? `${mentalNotes.length} 人出现波动` : '平稳'}</strong>
          <small>
            {mentalNotes.length
              ? mentalNotes
                  .map(
                    ({ survivor, mental }) =>
                      `${survivor.name} · ${MENTAL_LABEL[mental]}${survivor.mentalUntilDay ? ` (至 DAY ${survivor.mentalUntilDay})` : ''}`,
                  )
                  .join('；')
              : '专注判定 +1，动摇判定 -1；状态会随时间自然消退。'}
          </small>
        </div>
      </div>

      {!!social.principles.length && (
        <div className="v6-principle-ledger" aria-label="已确立街区原则">
          <span className="v6-principle-ledger__label">已确立原则</span>
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
                <h3>街区原则 · DAY {principle.day}</h3>
                <div className="v6-survivor__trait">{principle.title}</div>
              </div>
            </div>
            <span className="v6-principle-stamp">不可撤回</span>
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
                <small>长期效果：{choice.effect}</small>
              </button>
            ))}
          </div>
          <small className="v6-principle-hint">每个阶段只能确定一个原则；选定后本局不可撤销，并会影响后续事件与最终尸潮。</small>
        </article>
      )}

      {active && (
        <article className="v6-survivor v6-promise-active" style={{ marginTop: 12 }}>
          <div className="v6-survivor__top">
            <div className="v6-survivor__profile">
              <span className="v6-survivor__avatar-tag">📜</span>
              <div>
                <h3>已生效承诺 · 《{active.title}》</h3>
                <div className="v6-survivor__trait">{active.detail}</div>
              </div>
            </div>
            <div className="v6-survivor__energy">
              <div className="v6-energy-header">
                <span className="v6-survivor__energy-label">剩余期限</span>
                <span className="v6-survivor__energy-val">{active.remainingDays} 天</span>
              </div>
            </div>
          </div>
          <p className="v6-promise-note">承诺只检验你能够主动安排的行动，不会因单次判定失误而判定食言。</p>
        </article>
      )}

      {!active && request && !principle && !compact && (
        <article className="v6-survivor v6-request-card" style={{ marginTop: 12 }}>
          <div className="v6-survivor__top">
            <div className="v6-survivor__profile">
              <span className="v6-survivor__avatar-tag">📢</span>
              <div>
                <h3>居民诉求 · 《{request.title}》</h3>
                <div className="v6-survivor__trait">{request.body}</div>
              </div>
            </div>
          </div>
          <div className="v6-request-promise-box">
            <strong>如果应允承诺：</strong>
            <span>{request.promiseText}</span>
          </div>
          <div className="v6-job-grid" style={{ marginTop: 10 }}>
            <button className="v6-btn-pledge" onClick={() => onCommit(acceptCommunityRequest(state, request.id))}>
              ✍ 答应这件事
            </button>
            <button className="v6-btn-decline" onClick={() => onCommit(declineCommunityRequest(state, request.id))}>
              ✕ 不作承诺
            </button>
          </div>
          <small className="v6-request-hint">拒绝不会产生隐藏任务，但会让希望值略降、街区短期压力上升。</small>
        </article>
      )}

      {social.lastOutcome && <p className="v6-message v6-message--social">{social.lastOutcome}</p>}
    </section>
  );
}
