import type { GameState } from '../../game/types';
import {
  acceptCommunityRequest,
  activePromiseSummary,
  declineCommunityRequest,
  pendingCommunityRequest,
} from '../../game/v060/communityPromises';
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

  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div><span>街区状态</span><h2>希望告诉你大家还信不信，压力告诉你大家还撑不撑得住</h2></div>
        <small>兑现 {social.fulfilledPromises} · 食言 {social.brokenPromises}</small>
      </div>
      <section className="v6-preview">
        <div><span>希望</span><strong>{state.hope}</strong><small>长期：大家是否还相信这里值得守</small></div>
        <div><span>街区压力</span><strong>{pressureLabel(state)}</strong><small>短期：冷食、伤亡、无人医疗和低防线会把人逼到极限</small></div>
      </section>

      {active && <article className="v6-survivor" style={{ marginTop: 10 }}>
        <div className="v6-survivor__top"><div><h3>当前承诺 · 《{active.title}》</h3><span>{active.detail}</span></div><div><b>{active.remainingDays}</b><small>剩余天数</small></div></div>
        <p>承诺只检查你能控制的行动，不会因为一次坏骰子判你食言。</p>
      </article>}

      {!active && request && !compact && <article className="v6-survivor" style={{ marginTop: 10 }}>
        <div className="v6-survivor__top"><div><h3>居民诉求 · 《{request.title}》</h3><span>{request.body}</span></div></div>
        <p><strong>如果答应：</strong>{request.promiseText}</p>
        <div className="v6-job-grid">
          <button onClick={() => onCommit(acceptCommunityRequest(state, request.id))}>答应这件事</button>
          <button onClick={() => onCommit(declineCommunityRequest(state, request.id))}>不作承诺</button>
        </div>
        <small>拒绝不会制造隐藏任务，但会让希望略降、街区压力上升。</small>
      </article>}

      {social.lastOutcome && <p className="v6-message">{social.lastOutcome}</p>}
    </section>
  );
}
