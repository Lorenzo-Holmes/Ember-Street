import type { GameState } from '../../game/types';
import { activeMentalState, MENTAL_LABEL } from '../../game/v060/characterPsychology';
import {
  acceptCommunityRequest,
  activePromiseSummary,
  declineCommunityRequest,
  pendingCommunityRequest,
} from '../../game/v060/communityPromises';
import { choosePrinciple, pendingPrincipleDecision, PRINCIPLE_DECISIONS } from '../../game/v060/principles';
import { pressureBand, pressureLabel, socialStateOf } from '../../game/v060/socialPressure';

interface SocialStatusPanelProps {
  state: GameState;
  onCommit: (next: GameState) => void;
  compact?: boolean;
}

export default function SocialStatusPanel({ state, onCommit, compact = false }: SocialStatusPanelProps) {
  const social = socialStateOf(state);
  const pressure = pressureBand(state);
  const active = activePromiseSummary(state);
  const request = pendingCommunityRequest(state);
  const principle = pendingPrincipleDecision(state);
  const principleChoices = PRINCIPLE_DECISIONS.flatMap((decision) => decision.choices);
  const mentalNotes = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
    .map((survivor) => ({ survivor, mental: activeMentalState(state, survivor) }))
    .filter(({ mental }) => mental !== 'steady');
  const hopeCopy = state.hope >= 60
    ? { label: '稳定', note: '早上的取水、添柴和清点都有人主动完成。' }
    : state.hope >= 40
      ? { label: '动摇', note: '日常工作仍在进行，但愿意主动帮忙的人已经减少。' }
    : state.hope >= 20
      ? { label: '低落', note: '多数人领完口粮后直接回到住处，很少有人谈起之后的安排。' }
      : { label: '接近崩溃', note: '取水、添柴和清点都需要反复催促，已经有人拒绝参与轮班。' };
  const pressureNote = {
    calm: '分饭和守夜换班都没有发生争执。',
    tense: '分饭时有人争吵，守夜换班也比平时更晚。',
    'near-breaking': '分饭时发生争执，北口的守夜轮班出现了空缺。',
    breaking: '争执没有平息，已经有人拒绝值守并整理自己的物品。',
  }[pressure];

  return (
    <section className="v6-section v6-social-panel" aria-label="街区近况、承诺与人物状态">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">街区记录</span>
          <h2>今天早上的情况</h2>
        </div>
        <div className="v6-promise-tally" aria-label="说过的话">
          <span>做到 <b>{social.fulfilledPromises}</b></span>
          <span className="v6-tally-sep">·</span>
          <span>没做到 <b>{social.brokenPromises}</b></span>
        </div>
      </div>

      <div className="v6-preview v6-social-metrics">
        <div className="v6-metric-card v6-metric-card--hope">
          <div className="v6-metric-header">
            <span>屋里的人</span>
          </div>
          <strong>{hopeCopy.label}</strong>
          <small>{hopeCopy.note}</small>
        </div>

        <div className={`v6-metric-card v6-metric-card--pressure v6-metric-card--pressure-${social.pressure >= 3 ? 'extreme' : social.pressure >= 2 ? 'high' : social.pressure >= 1 ? 'moderate' : 'calm'}`}>
          <div className="v6-metric-header">
            <span>街里</span>
          </div>
          <strong>{pressureLabel(state)}</strong>
          <small>{pressureNote}</small>
        </div>

        <div className="v6-metric-card v6-metric-card--mental">
          <div className="v6-metric-header">
            <span>需要看住的人</span>
          </div>
          <strong>{mentalNotes.length ? `${mentalNotes.length} 人需要留意` : '暂时稳定'}</strong>
          <small>
            {mentalNotes.length
              ? mentalNotes
                  .map(
                    ({ survivor, mental }) =>
                      `${survivor.name}：${MENTAL_LABEL[mental]}${survivor.mentalUntilDay ? `，这几天别让他单独待着（到第 ${survivor.mentalUntilDay} 天）` : ''}`,
                  )
                  .join('；')
              : '今天早上所有人都露了面，暂时没有发现异常。'}
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
        <article className="v6-survivor v6-principle-card v1-social-entry">
          <header className="v1-social-entry__head">
            <div>
              <span className="v1-social-entry__eyebrow">第 {principle.day} 天 · 街里的规矩</span>
              <h3>{principle.title}</h3>
            </div>
            <span className="v6-principle-stamp">今天要说定</span>
          </header>
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
                <small>照这个办：{choice.effect}</small>
              </button>
            ))}
          </div>
          <small className="v6-principle-hint">写下以后，往后就按这条办。</small>
        </article>
      )}

      {active && (
        <article className="v6-survivor v6-promise-active v1-social-entry">
          <header className="v1-social-entry__head">
            <div>
              <span className="v1-social-entry__eyebrow">记在本上的承诺</span>
              <h3>还没做到 · 《{active.title}》</h3>
            </div>
            <span className="v6-principle-stamp">还剩 {active.remainingDays} 天</span>
          </header>
          <p className="v1-social-entry__detail">{active.detail}</p>
          <p className="v6-promise-note">只看最后做没做到。路上出一次岔子，不算食言。</p>
        </article>
      )}

      {!active && request && !principle && !compact && (
        <article className="v6-survivor v6-request-card v1-social-entry">
          <header className="v1-social-entry__head">
            <div>
              <span className="v1-social-entry__eyebrow">门口等答复</span>
              <h3>{request.title}</h3>
            </div>
          </header>
          <p className="v1-social-entry__detail">{request.body}</p>
          <div className="v6-request-promise-box">
            <strong>他们要你答应：</strong>
            <span>{request.promiseText}</span>
          </div>
          <div className="v6-job-grid">
            <button className="v6-btn-pledge" onClick={() => onCommit(acceptCommunityRequest(state, request.id))}>
              答应下来
            </button>
            <button className="v6-btn-decline" onClick={() => onCommit(declineCommunityRequest(state, request.id))}>
              不答应
            </button>
          </div>
          <small className="v6-request-hint">不答应，这句话就不会写进本子。</small>
        </article>
      )}

      {social.lastOutcome && <p className="v6-message v6-message--social">{social.lastOutcome}</p>}
    </section>
  );
}
