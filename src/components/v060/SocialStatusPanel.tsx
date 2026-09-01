import type { GameState } from '../../game/types';
import { activeMentalState, MENTAL_LABEL } from '../../game/v060/characterPsychology';
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

export function SocialStatusPanel({ state, onCommit, compact = false }: SocialStatusPanelProps) {
  const social = socialStateOf(state);
  const active = activePromiseSummary(state);
  const request = pendingCommunityRequest(state);
  const mentalNotes = state.survivors
    .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
    .map((survivor) => ({ survivor, mental: activeMentalState(state, survivor) }))
    .filter(({ mental }) => mental !== 'steady');

  return (
    <section className="v6-dossier-sheet v6-social-dossier" aria-label="避难所民心与社会契约档案">
      {/* Decorative Tape Strip */}
      <div className="v6-tape v6-tape--top-right" aria-hidden="true" />

      <div className="v6-dossier-header">
        <div>
          <span className="v6-dossier-tag">RECORD // SOCIAL & PSYCHOLOGY</span>
          <h2 className="v6-dossier-title">避难所民心记录与战时协议</h2>
        </div>
        <div className="v6-promise-ledger">
          <span>履约台账:</span>
          <span className="v6-stamp v6-stamp--ok">兑现 {social.fulfilledPromises}</span>
          <span className="v6-stamp v6-stamp--danger">失信 {social.brokenPromises}</span>
        </div>
      </div>

      {/* 3 Survival Metric Plates */}
      <div className="v6-ledger-triptych">
        {/* Metric 1: Hope */}
        <div className="v6-ledger-plate v6-ledger-plate--hope">
          <div className="v6-plate-header">
            <span className="v6-plate-code">01 / MORALE</span>
            <span className="v6-stamp">{state.hope >= 60 ? '稳定' : state.hope >= 30 ? '动摇' : '告急'}</span>
          </div>
          <div className="v6-plate-body">
            <strong className="v6-plate-val">{state.hope}</strong>
            <span className="v6-plate-unit">/ 100</span>
          </div>
          <p className="v6-plate-memo">长期支柱：大家是否还相信这条街区值得坚守到天亮。</p>
        </div>

        {/* Metric 2: Pressure */}
        <div className="v6-ledger-plate v6-ledger-plate--pressure">
          <div className="v6-plate-header">
            <span className="v6-plate-code">02 / STRESS</span>
            <span className="v6-stamp v6-stamp--warning">{pressureLabel(state)}</span>
          </div>
          <div className="v6-plate-body">
            <strong className="v6-plate-val" style={{ fontSize: '1.25rem' }}>{pressureLabel(state)}</strong>
          </div>
          <p className="v6-plate-memo">短期负担：冷食、伤亡、无人医疗和防线受损会加剧压力。</p>
        </div>

        {/* Metric 3: Core Psychology */}
        <div className="v6-ledger-plate v6-ledger-plate--psy">
          <div className="v6-plate-header">
            <span className="v6-plate-code">03 / TRAUMA & AGENCY</span>
            <span className={`v6-stamp ${mentalNotes.length ? 'v6-stamp--danger' : 'v6-stamp--ok'}`}>
              {mentalNotes.length ? `${mentalNotes.length} 人波动` : '全员平稳'}
            </span>
          </div>
          <div className="v6-plate-body">
            <strong className="v6-plate-val" style={{ fontSize: '1.25rem' }}>
              {mentalNotes.length ? '动摇' : '平稳'}
            </strong>
          </div>
          <p className="v6-plate-memo">
            {mentalNotes.length
              ? mentalNotes
                  .map(
                    ({ survivor, mental }) =>
                      `${survivor.name} · ${MENTAL_LABEL[mental]}${
                        survivor.mentalUntilDay ? ` (至 DAY ${survivor.mentalUntilDay})` : ''
                      }`
                  )
                  .join('；')
              : '专注判定 +1，动摇判定 -1；未受创伤时将自然平复。'}
          </p>
        </div>
      </div>

      {/* Active Signed Pacts */}
      {active && (
        <div className="v6-pacts-section">
          <div className="v6-section-subhead">
            <span>SIGNED AGREEMENT // 现行生效协议</span>
            <span className="v6-stamp v6-stamp--ok">剩余 {active.remainingDays} 天</span>
          </div>
          <div className="v6-pact-card">
            <div className="v6-pact-header">
              <span className="v6-pact-title">[ 战时协议 ] 《{active.title}》</span>
              <span className="v6-pact-deadline">期限: {active.remainingDays} 天</span>
            </div>
            <p className="v6-pact-desc">{active.detail}</p>
            <div className="v6-pact-consequences">
              <span>承诺只检查你能控制的行动，不会因为一次坏骰子判你食言。</span>
            </div>
          </div>
        </div>
      )}

      {/* Pending Community Request */}
      {!active && request && !compact && (
        <div className="v6-requests-section">
          <div className="v6-section-subhead">
            <span className="v6-text--urgent">[ ! ] PENDING PETITION // 居民紧急诉求</span>
            <small>拒绝将导致希望下降与街区压力上升</small>
          </div>
          <div className="v6-request-memo">
            <div className="v6-memo-header">
              <span className="v6-memo-author">诉求事项: 《{request.title}》</span>
              <span className="v6-memo-type">[ 居民请愿 ]</span>
            </div>
            <p className="v6-memo-body">“{request.body}”</p>
            <div className="v6-memo-promise-terms">
              <span>如果答应：</span>
              <strong>{request.promiseText}</strong>
            </div>
            <div className="v6-memo-actions">
              <button
                type="button"
                className="v6-btn-pact v6-btn-pact--sign"
                onClick={() => onCommit(acceptCommunityRequest(state, request.id))}
              >
                [ 签署并承诺履行 ]
              </button>
              <button
                type="button"
                className="v6-btn-pact v6-btn-pact--reject"
                onClick={() => onCommit(declineCommunityRequest(state, request.id))}
              >
                [ 现状艰难 · 予以驳回 ]
              </button>
            </div>
          </div>
        </div>
      )}

      {social.lastOutcome && <p className="v6-plate-memo" style={{ marginTop: '8px', color: 'var(--ember-core)' }}>{social.lastOutcome}</p>}
    </section>
  );
}

export default SocialStatusPanel;
