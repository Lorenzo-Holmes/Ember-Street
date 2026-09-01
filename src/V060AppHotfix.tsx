import { useEffect, useMemo, useRef, useState } from 'react';
import SocialStatusPanel from './components/v060/SocialStatusPanel';
import V060NightScene from './V060NightScene';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, DayAssignment, EndingId, GameState, Survivor, SurvivorCondition } from './game/types';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from './game/v060/buildings';
import {
  advanceCampaignDay,
  createV060InitialState,
  finalizeDay,
  resolveExpeditionStance,
  retreatCurrentExpedition,
  searchForMissing,
  upgradeSaveToV060,
} from './game/v060/campaign';
import { nightCausalSignals } from './game/v060/causalNight';
import { communitySupportSummary, selectCommunitySupportMode } from './game/v060/community';
import { expeditionDecisionPreview, missingSearchPreview } from './game/v060/decisionReadability';
import {
  assignDayJob,
  canTakeDayAssignment,
  clearDayJob,
  hasCommittedDayAction,
  lockDayAssignments,
  previewDispatchConfirmation,
  previewNightPreparation,
  reopenDayAssignments,
} from './game/v060/dayManagement';
import { ENDINGS, endingHint, loadMetaProgress, recordEnding, type MetaProgress } from './game/v060/endings';
import {
  EXPEDITION_LOCATIONS,
  currentExpeditionEvent,
  drawExpeditionEvent,
  expeditionRiskLabel,
  expeditionRiskScore,
  startExpedition,
} from './game/v060/expedition';
import { mealLabel, previewMeal } from './game/v060/food';
import { isLocationUnlocked, pendingCampaignEvent, resolveCampaignEvent } from './game/v060/campaignEvents';
import { dawnBriefEntries } from './game/v060/morningBrief';
import { activeMentalState, MENTAL_LABEL } from './game/v060/characterPsychology';

const JOBS: Array<{ id: DayAssignment; label: string; code: string; note: string }> = [
  { id: 'expedition', label: '探索搜寻', code: 'SCAV', note: '外出搜集关键物资，面临伤亡、失联或死亡风险。' },
  { id: 'repair',     label: '设施维修', code: 'MAINT', note: '加固街区防线，并在夜间降低设施事故损失。' },
  { id: 'medical',    label: '战地医疗', code: 'MED',  note: '优先处理街区中最严重的伤员。' },
  { id: 'watch',      label: '防线守备', code: 'GUARD', note: '压制夜间紧急事件和尸潮突袭概率。' },
  { id: 'radio',      label: '无线电呼', code: 'RADIO', note: '积累外界联系，搜寻幸存者与军方信号。' },
  { id: 'cook',       label: '后勤配给', code: 'RATION', note: '按当前人口提高供餐覆盖率和次日体力恢复。' },
  { id: 'rest',       label: '休整恢复', code: 'REST',  note: '在避难所内休息，恢复个人精力与心态。' },
];

const CONDITION_BADGE: Record<SurvivorCondition, { label: string; stampClass: string }> = {
  healthy:  { label: '状态良好 // HEALTHY', stampClass: 'v6-stamp--ok' },
  fatigued: { label: '体力透支 // FATIGUED', stampClass: 'v6-stamp--cautious' },
  minor:    { label: '轻微创伤 // MINOR', stampClass: 'v6-stamp--warning' },
  serious:  { label: '严重伤残 // SERIOUS', stampClass: 'v6-stamp--danger' },
  critical: { label: '濒死垂危 // CRITICAL', stampClass: 'v6-stamp--danger v6-stamp--pulse' },
  missing:  { label: '失联下落不明 // MIA', stampClass: 'v6-stamp--missing' },
  dead:     { label: '已经阵亡 // KIA', stampClass: 'v6-stamp--dead' },
};

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function initialRun(): GameState {
  const loaded = loadGame();
  return loaded ? upgradeSaveToV060(loaded) : createV060InitialState();
}

function population(state: GameState): number {
  return state.survivors.filter((s) => s.condition !== 'dead').length;
}

function DecisionTags({ tags }: { tags: string[] }) {
  return (
    <div className="v6-decision-tags" aria-label="决策预告标签">
      {tags.map((tag) => (
        <span key={tag} className="v6-stamp v6-stamp--tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

/* ==========================================================================
   TOPBAR LEDGER
   ========================================================================== */
function TopBar({ state }: { state: GameState }) {
  const aliveCount = population(state);
  return (
    <header className="v6-topbar-ledger">
      <div className="v6-ledger-meta">
        <div className="v6-stencil-title">
          <span className="v6-stencil-brand">EMBER STREET</span>
          <span className="v6-stencil-sub">废墟求生台账 // SURVIVAL LOG</span>
        </div>
        <div className="v6-day-stamp-box">
          <span className="v6-stamp-caption">LOG ENTRY</span>
          <strong className="v6-stamp-day">DAY {String(state.day).padStart(2, '0')}</strong>
          <span className="v6-stamp-total">/ 30</span>
        </div>
      </div>

      <div className="v6-vitals-dock">
        <div className="v6-vital-cell">
          <span className="v6-vital-label">幸存人口</span>
          <strong className="v6-vital-num">{aliveCount} <small>人</small></strong>
        </div>
        <div className="v6-vital-cell">
          <span className="v6-vital-label">街区希望</span>
          <strong className="v6-vital-num v6-text--hope">{state.hope} <small>%</small></strong>
        </div>
        <div className="v6-vital-cell">
          <span className="v6-vital-label">防御工事</span>
          <strong className="v6-vital-num v6-text--defense">{Math.round(state.defense ?? 50)} <small>%</small></strong>
        </div>
        <div className={`v6-vital-cell v6-vital-cell--light stage-${state.mainLightStage}`}>
          <span className="v6-vital-label">路灯照明</span>
          <strong className="v6-vital-num">阶 {state.mainLightStage} <small>{state.mainLightStage === 1 ? '昏黄' : '明亮'}</small></strong>
        </div>
      </div>

      <div className="v6-phase-tag-box">
        <span className="v6-stamp v6-stamp--phase">● 白昼调遣 // DAY SHIFT</span>
        <small className="v6-forecast-hint">REPORT: {state.forecast.title} · {state.forecast.detail}</small>
      </div>
    </header>
  );
}

/* ==========================================================================
   STREET RUIN PANORAMA
   ========================================================================== */
function StreetVisual({ state }: { state: GameState }) {
  const aliveCount = population(state);
  return (
    <section className={`v6-street-ruin v6-street--stage-${state.mainLightStage}`} aria-label="街区废墟全景">
      <div className="v6-ruin-particles" aria-hidden="true" />
      <div className="v6-ruin-silhouette v6-ruin--back" aria-hidden="true" />
      <div className="v6-ruin-silhouette v6-ruin--mid-left" aria-hidden="true" />
      <div className="v6-ruin-silhouette v6-ruin--mid-right" aria-hidden="true" />
      <div className="v6-ruin-silhouette v6-ruin--fore" aria-hidden="true" />
      <div className="v6-street-wire" aria-hidden="true" />

      <div className="v6-lamp-rig">
        <div className="v6-lamp-housing" />
        <div className="v6-lamp-beam" />
      </div>

      <div className="v6-street-hud-strip">
        <span className="v6-hud-stencil">SECTOR 04 // 废墟生存核心区</span>
        <span className="v6-hud-stencil v6-hud-stencil--right">
          [ 照亮人数: {aliveCount} ] · [ 核心掩体: 运转中 ]
        </span>
      </div>
    </section>
  );
}

/* ==========================================================================
   INVENTORY MANIFEST SHEET
   ========================================================================== */
function InventoryBar({ state }: { state: GameState }) {
  const aliveCount = population(state);
  return (
    <section className="v6-manifest-sheet" aria-label="避难所物资配给与生存底线清单">
      <div className="v6-sheet-title-bar">
        <span className="v6-sheet-code">[ MANIFEST // 避难所物资存量与生存底线 ]</span>
        <small className="v6-sheet-rule">救回的居民每日均需口粮 · 维持电力与建材才能熬过黑夜</small>
      </div>

      <div className="v6-manifest-columns">
        {/* Col 1: Vitals */}
        <div className="v6-manifest-col">
          <div className="v6-col-header">
            <span>01 / 生命底线</span>
            <small>VITALS</small>
          </div>
          <div className="v6-resource-entry">
            <div className="v6-entry-meta">
              <span className="v6-entry-name">口粮储备</span>
              <span className={`v6-stamp ${state.inventory.ration <= 3 ? 'v6-stamp--danger' : 'v6-stamp--ok'}`}>
                {state.inventory.ration <= 3 ? '告急' : '充足'}
              </span>
            </div>
            <div className="v6-entry-digits">
              <strong>{state.inventory.ration}</strong>
              <small>份</small>
            </div>
          </div>
          <div className="v6-resource-entry">
            <div className="v6-entry-meta">
              <span className="v6-entry-name">战地药品</span>
              <span className={`v6-stamp ${state.inventory.medicine <= 1 ? 'v6-stamp--warning' : 'v6-stamp--ok'}`}>
                {state.inventory.medicine <= 1 ? '偏低' : '可用'}
              </span>
            </div>
            <div className="v6-entry-digits">
              <strong>{state.inventory.medicine}</strong>
              <small>件</small>
            </div>
          </div>
        </div>

        {/* Col 2: Engineering */}
        <div className="v6-manifest-col">
          <div className="v6-col-header">
            <span>02 / 工业与建材</span>
            <small>ENGINEERING</small>
          </div>
          <div className="v6-manifest-subgrid">
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">发电机电力</span>
                <span className="v6-stamp v6-stamp--ok">充足</span>
              </div>
              <div className="v6-entry-digits">
                <strong>{state.inventory.power}</strong>
                <small>kW</small>
              </div>
            </div>
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">工程材料</span>
                <span className="v6-stamp v6-stamp--ok">充足</span>
              </div>
              <div className="v6-entry-digits">
                <strong>{state.inventory.materials}</strong>
                <small>捆</small>
              </div>
            </div>
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">机械零件</span>
                <span className="v6-stamp v6-stamp--warning">偏低</span>
              </div>
              <div className="v6-entry-digits">
                <strong>{state.inventory.parts}</strong>
                <small>组</small>
              </div>
            </div>
          </div>
        </div>

        {/* Col 3: Defense & Morale */}
        <div className="v6-manifest-col">
          <div className="v6-col-header">
            <span>03 / 街区防务</span>
            <small>DEFENSE & MORALE</small>
          </div>
          <div className="v6-manifest-subgrid">
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">防线稳固度</span>
                <span className="v6-stamp v6-stamp--ok">充足</span>
              </div>
              <div className="v6-entry-digits">
                <strong className="v6-text--defense">{Math.round(state.defense ?? 50)}</strong>
                <small>%</small>
              </div>
            </div>
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">民心希望</span>
                <span className="v6-stamp v6-stamp--warning">偏低</span>
              </div>
              <div className="v6-entry-digits">
                <strong className="v6-text--hope">{state.hope}</strong>
                <small>%</small>
              </div>
            </div>
            <div className="v6-resource-entry">
              <div className="v6-entry-meta">
                <span className="v6-entry-name">避难所人口</span>
                <span className="v6-stamp v6-stamp--ok">充足</span>
              </div>
              <div className="v6-entry-digits">
                <strong>{aliveCount}</strong>
                <small>人</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   MEMORIAL PANEL
   ========================================================================== */
function MemorialPanel({ state }: { state: GameState }) {
  if (!state.memorials.length) return null;
  return (
    <section className="v6-causal-warning-dossier" style={{ borderColor: 'var(--twom-border-light)' }}>
      <div className="v6-warning-header">
        <span>MEMORIAL RECORD // 阵亡与离世档案</span>
      </div>
      <div className="v6-warning-list">
        {state.memorials.map((m) => (
          <div key={`${m.name}-${m.day}`} className="v6-warning-item">
            <span className="v6-stamp v6-stamp--dead">KIA DAY {m.day}</span>
            <strong>{m.name}</strong>
            <span style={{ color: 'var(--paper-faint)', fontStyle: 'italic' }}>“{m.epitaph}”</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ==========================================================================
   CAMPAIGN EVENT SCREEN
   ========================================================================== */
function CampaignEventScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const event = pendingCampaignEvent(state);
  if (!event) return null;
  return (
    <main className="v6-desk-workspace">
      <TopBar state={state} />
      <section className="v6-request-memo" style={{ marginTop: 24 }}>
        <div className="v6-memo-header">
          <span>[ 街区突发事件 // CAMPAIGN EVENT ]</span>
          <strong>{event.title}</strong>
        </div>
        <p className="v6-memo-body">{event.body}</p>
        <div className="v6-memo-actions">
          <button
            type="button"
            className="v6-btn-pact v6-btn-pact--sign"
            onClick={() => commit(resolveCampaignEvent(state, event.id), setState)}
          >
            [ 确认并处理事件 ]
          </button>
        </div>
      </section>
    </main>
  );
}

/* ==========================================================================
   EXPEDITION STATUS IN DAY SCREEN
   ========================================================================== */
function ExpeditionStatus({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.expeditionState.departed) return null;
  const party = state.expeditionState.activePartyIds
    .map((id) => state.survivors.find((s) => s.id === id)?.name ?? id)
    .join('、');
  const location = EXPEDITION_LOCATIONS.find((item) => item.id === state.expeditionState.locationId)?.name ?? '未知地点';
  const event = currentExpeditionEvent(state);
  return (
    <section className="v6-causal-warning-dossier" style={{ borderColor: 'var(--ember-border)' }}>
      <div className="v6-warning-header">
        <span>EXPEDITION IN PROGRESS // 搜索队外出中: {party} · {location}</span>
      </div>
      <p style={{ fontSize: '0.74rem', color: 'var(--paper-bone)', margin: '6px 0 10px' }}>
        {event ? `途中传来消息：${event.title}` : '搜索队还在废墟探索中。'}
      </p>
      <button
        type="button"
        className="v6-btn-cta"
        onClick={() => commit({ ...state, phase: 'expedition' }, setState)}
      >
        [ 进入并处理探索决策 // HANDLE ENCOUNTER ]
      </button>
    </section>
  );
}

/* ==========================================================================
   DAY SCREEN
   ========================================================================== */
function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [reviewingDispatch, setReviewingDispatch] = useState(false);
  const [activeTab, setActiveTab] = useState<'survivors' | 'buildings' | 'social'>('survivors');

  const fixedEvent = !state.expeditionState.departed ? pendingCampaignEvent(state) : null;
  if (fixedEvent) return <CampaignEventScreen state={state} setState={setState} />;

  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const dispatch = previewDispatchConfirmation(state);
  const assigned = Object.keys(state.dayAssignments).length;
  const available = state.survivors.filter(
    (s) =>
      s.condition !== 'dead' &&
      s.condition !== 'missing' &&
      s.condition !== 'critical' &&
      !state.dayState.committedSurvivorIds.includes(s.id)
  ).length;

  const lock = () => {
    const locked = lockDayAssignments(state);
    const pendingExpeditions = Object.entries(locked.dayAssignments).filter(
      ([id, job]) => job === 'expedition' && !locked.dayState.committedSurvivorIds.includes(id)
    ).length;
    commit({ ...locked, phase: pendingExpeditions ? 'expedition' : 'dusk' }, setState);
  };

  const supportSummary = communitySupportSummary(state);

  return (
    <main className="v6-desk-workspace" aria-label="避难所废墟生存记录板">
      <TopBar state={state} />
      <StreetVisual state={state} />
      <InventoryBar state={state} />

      <ExpeditionStatus state={state} setState={setState} />

      {/* Workspace Navigation Tabs */}
      <nav className="v6-tab-deck" aria-label="指挥模块切换">
        <button
          type="button"
          className={`v6-tab-btn v6-nav-tab ${activeTab === 'survivors' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('survivors')}
        >
          [ 01 · 幸存人员调度与健康档案 ]
        </button>
        <button
          type="button"
          className={`v6-tab-btn v6-nav-tab ${activeTab === 'buildings' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('buildings')}
        >
          [ 02 · 废墟清理与避难工事 ]
        </button>
        <button
          type="button"
          className={`v6-tab-btn v6-nav-tab ${activeTab === 'social' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('social')}
        >
          [ 03 · 街区民心与战时协议 ]
        </button>
      </nav>

      {/* TAB 1: SURVIVORS */}
      {activeTab === 'survivors' && (
        <section className="v6-dossier-workspace" aria-label="幸存者战术档案">
          <div className="v6-dossier-grid">
            {state.survivors.map((survivor) => {
              const isMissing = survivor.condition === 'missing';
              const isDead = survivor.condition === 'dead';
              const assignedJob = state.dayAssignments[survivor.id];
              const isCommitted = state.dayState.committedSurvivorIds.includes(survivor.id);
              const condition = survivor.condition ?? 'healthy';
              const conditionInfo = CONDITION_BADGE[condition] || CONDITION_BADGE.healthy;
              const mental = activeMentalState(state, survivor);

              if (isMissing) {
                const searchPreview = missingSearchPreview(state, survivor.id, 'team');
                const contactPreview = missingSearchPreview(state, survivor.id, 'radio');
                return (
                  <article key={survivor.id} className="v6-folder-card v6-folder--missing">
                    <div className="v6-folder-tab">
                      <span className="v6-tab-title">[ 失联卷宗 ] {survivor.name}</span>
                      <span className="v6-stamp v6-stamp--missing">下落不明</span>
                    </div>
                    <div className="v6-folder-body">
                      <p className="v6-missing-brief">
                        在先前的外围搜寻中未能按时归队。根据残存无线电信号，可能受困于坍塌废墟。
                      </p>
                      <div className="v6-rescue-orders">
                        <button
                          type="button"
                          className="v6-btn-rescue"
                          onClick={() => commit(searchForMissing(state, survivor.id, 'team'), setState)}
                        >
                          [ 组织两人地面搜寻小队 ]
                          <DecisionTags tags={searchPreview.tags} />
                          <small>{searchPreview.summary}</small>
                        </button>
                        <button
                          type="button"
                          className="v6-btn-rescue"
                          onClick={() => commit(searchForMissing(state, survivor.id, 'radio'), setState)}
                        >
                          [ 启动高频定向无线电信标 ]
                          <DecisionTags tags={contactPreview.tags} />
                          <small>{contactPreview.summary}</small>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              }

              return (
                <article key={survivor.id} className={`v6-folder-card v6-folder--${condition}`}>
                  <div className="v6-folder-tab">
                    <div className="v6-tab-left">
                      <span className="v6-survivor-name">{survivor.name}</span>
                      <span className="v6-survivor-role">/ {survivor.trait ?? survivor.perk ?? '避难所同伴'}</span>
                    </div>
                    <div className="v6-tab-right">
                      <span className={`v6-stamp ${conditionInfo.stampClass}`}>{conditionInfo.label}</span>
                    </div>
                  </div>

                  <div className="v6-folder-body">
                    <div className="v6-dossier-row">
                      <div className="v6-energy-block">
                        <div className="v6-energy-meta">
                          <span>体力负荷</span>
                          <strong>{survivor.energy} / 100</strong>
                        </div>
                        <div className="v6-segmented-track">
                          {Array.from({ length: 10 }).map((_, i) => (
                            <div
                              key={i}
                              className={`v6-segment ${i * 10 < survivor.energy ? 'is-filled' : ''}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="v6-traits-block">
                        <span className="v6-stamp v6-stamp--specialty">专长: {survivor.specialty || '搜寻'}</span>
                        <span className="v6-stamp v6-stamp--trust">信任: {survivor.trust ?? 0}</span>
                        {mental !== 'steady' && (
                          <span className={`v6-stamp ${mental === 'focused' ? 'v6-stamp--ok' : 'v6-stamp--danger'}`}>
                            心理 · {MENTAL_LABEL[mental]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="v6-orders-deck">
                      <div className="v6-orders-header">
                        <span>今日派遣指派:</span>
                        {assignedJob && (
                          <span className="v6-stamp v6-stamp--assigned">
                            已指派: {JOBS.find((j) => j.id === assignedJob)?.label}
                          </span>
                        )}
                      </div>

                      {isCommitted ? (
                        <div className="v6-committed-notice">
                          [ 指派已锁定 · 正在执行 {assignedJob ? JOBS.find((j) => j.id === assignedJob)?.label : '自动休整'} ]
                        </div>
                      ) : (
                        <div className="v6-order-buttons-grid">
                          {JOBS.map((job) => {
                            const isSelected = assignedJob === job.id;
                            const availability = canTakeDayAssignment(state, survivor.id, job.id);
                            return (
                              <button
                                key={job.id}
                                type="button"
                                className={`v6-order-btn ${isSelected ? 'is-selected' : ''}`}
                                disabled={isDead || !availability.allowed}
                                onClick={() => {
                                  if (isSelected) {
                                    commit(clearDayJob(state, survivor.id), setState);
                                  } else {
                                    commit(assignDayJob(state, survivor.id, job.id), setState);
                                  }
                                }}
                              >
                                <span className="v6-btn-code">[{job.code}]</span>
                                <span className="v6-btn-name">{job.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 2: BUILDINGS */}
      {activeTab === 'buildings' && (
        <section className="v6-dossier-workspace" aria-label="掩体与防御设施改建">
          <div className="v6-buildings-grid">
            {(Object.keys(V060_BUILDINGS) as BuildingId[]).map((id) => {
              const building = V060_BUILDINGS[id];
              const level = state.buildings[id] ?? 0;
              const isRuin = level === 0;
              const upgradeCheck = canUpgradeBuilding(state, id);

              return (
                <article key={id} className={`v6-building-folder ${isRuin ? 'is-ruin' : ''}`}>
                  <div className="v6-building-folder-tab">
                    <span className="v6-bldg-title">{building.name}</span>
                    <span className={`v6-stamp ${isRuin ? 'v6-stamp--ruin' : level >= 3 ? 'v6-stamp--max' : 'v6-stamp--ok'}`}>
                      {isRuin ? '🏚️ 废墟掩体' : level >= 3 ? '★ 满级运作' : `Lv.${level} 运作中`}
                    </span>
                  </div>

                  <div className="v6-building-folder-body">
                    <p className="v6-bldg-desc">
                      {isRuin ? '破败废墟，亟待清理。修复后将真正改变白天探索或黑夜防守的规则。' : building.levels[level - 1]?.unlock}
                    </p>

                    {level < 3 && upgradeCheck.next ? (
                      <div className="v6-bldg-action-box">
                        <div className="v6-bldg-cost-tag">
                          <span>所需材料:</span>
                          <strong>材料 {upgradeCheck.next.materials} · 零件 {upgradeCheck.next.parts}</strong>
                        </div>
                        <button
                          type="button"
                          className="v6-btn-upgrade-fort"
                          disabled={!upgradeCheck.allowed}
                          onClick={() => commit(upgradeBuilding(state, id), setState)}
                        >
                          {isRuin ? '[ 清理废墟 Lv.1 ]' : `[ 加固升级至 Lv.${level + 1} ]`}
                        </button>
                      </div>
                    ) : (
                      <div className="v6-bldg-max-banner">
                        [ 该设施已完成最高规格修缮与战备加固 ]
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 3: SOCIAL */}
      {activeTab === 'social' && (
        <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} />
      )}

      {/* Community Labor Mode Buttons */}
      <section className="v6-causal-warning-dossier" style={{ borderColor: 'var(--twom-border)', marginTop: 14 }}>
        <div className="v6-warning-header">
          <span>COMMUNITY LABOR // 群众劳作与后勤分配 (当前: {supportSummary.supportModeLabel})</span>
        </div>
        <div className="v6-tab-deck" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`v6-tab-btn ${supportSummary.supportMode === 'logistics' ? 'is-active' : ''}`}
            onClick={() => commit(selectCommunitySupportMode(state, 'logistics'), setState)}
          >
            [ 专注后勤 · 提升供餐与配给 ]
          </button>
          <button
            type="button"
            className={`v6-tab-btn ${supportSummary.supportMode === 'repair' ? 'is-active' : ''}`}
            onClick={() => commit(selectCommunitySupportMode(state, 'repair'), setState)}
          >
            [ 专注维护 · 稳固设施与防线 ]
          </button>
          <button
            type="button"
            className={`v6-tab-btn ${supportSummary.supportMode === 'defense' ? 'is-active' : ''}`}
            onClick={() => commit(selectCommunitySupportMode(state, 'defense'), setState)}
          >
            [ 专注守备 · 压制夜间风险 ]
          </button>
        </div>
      </section>

      {/* Memorial Panel */}
      <MemorialPanel state={state} />

      {/* Dispatch Confirmation Dock */}
      <section className="v6-dispatch-dock" aria-label="战备复核与调遣确认">
        {reviewingDispatch ? (
          <div className="v6-confirm-dossier-box">
            <div className="v6-confirm-header">
              <span className="v6-text--urgent">[ ! ] 最终核定 // 锁定今日所有战术指派</span>
              <small>{dispatch.manuallyAssigned} 人手动安排 · {dispatch.autoResting} 人自动休整</small>
            </div>

            <div className="v6-confirm-cards-row">
              {dispatch.entries.map((entry) => (
                <div key={entry.survivorId} className="v6-confirm-card">
                  <div className="v6-confirm-name">{entry.name}</div>
                  <div className="v6-confirm-job-stamp">
                    <span className="v6-stamp v6-stamp--ok">
                      {entry.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="v6-confirm-actions">
              <button
                type="button"
                className="v6-btn-cta v6-btn-cta--confirm"
                onClick={lock}
              >
                [ 🔒 确认签署并正式派出搜寻与防御岗位 ]
              </button>
              <button
                type="button"
                className="v6-btn-cancel"
                onClick={() => setReviewingDispatch(false)}
              >
                [ ← 返回重新调整岗位 ]
              </button>
            </div>
          </div>
        ) : (
          <div className="v6-preview-dock-bar">
            <div className="v6-preview-stats">
              <div className="v6-preview-stat-cell">
                <span>今晚供餐预估:</span>
                <strong>{mealLabel(meal.quality)}</strong>
              </div>
              <div className="v6-preview-stat-cell">
                <span>夜防就绪评估:</span>
                <strong>{prep.defense}</strong>
              </div>
            </div>

            {!state.expeditionState.departed && (state.dayState.assignmentsLocked ? (
              <button
                type="button"
                className="v6-btn-cta"
                onClick={() => commit({ ...state, phase: 'dusk' }, setState)}
              >
                [ 进入黄昏准备 // DUSK COUNTDOWN ]
              </button>
            ) : (
              <button
                type="button"
                className="v6-btn-cta"
                disabled={!available && !Object.keys(state.dayAssignments).length}
                onClick={() => setReviewingDispatch(true)}
              >
                [ 确认今日避难所人员调遣 ({assigned} 已指派) ]
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

/* ==========================================================================
   EXPEDITION SCREEN
   ========================================================================== */
function ExpeditionScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const assignedIds = state.survivors
    .filter(
      (s) =>
        state.dayAssignments[s.id] === 'expedition' &&
        s.condition !== 'dead' &&
        s.condition !== 'missing' &&
        !state.dayState.committedSurvivorIds.includes(s.id)
    )
    .map((s) => s.id)
    .slice(0, 2);

  const availableLocations = EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
  const [party, setParty] = useState<string[]>(assignedIds);
  const [locationId, setLocationId] = useState(availableLocations[availableLocations.length - 1]?.id ?? 'convenience_store');

  const event = currentExpeditionEvent(state);
  const risk = expeditionRiskLabel(expeditionRiskScore(state, party, locationId));
  const activeRisk = state.expeditionState.departed
    ? expeditionRiskLabel(
        expeditionRiskScore(
          state,
          state.expeditionState.activePartyIds,
          state.expeditionState.locationId ?? locationId
        )
      )
    : risk;

  const pushPreview = expeditionDecisionPreview(state, 'push', activeRisk);
  const carefulPreview = expeditionDecisionPreview(state, 'careful', activeRisk);
  const retreatPreview = expeditionDecisionPreview(state, 'retreat', activeRisk);

  const begin = () => {
    if (!isLocationUnlocked(state, locationId)) return;
    let next = startExpedition(state, party, locationId);
    if (!next.expeditionState.departed) return commit(next, setState);
    next = drawExpeditionEvent(next);
    commit(
      {
        ...next,
        phase: 'street',
        lastMessage: `${party.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、')}已经出发 · 今日派遣保持锁定`,
      },
      setState
    );
  };

  const finish = (stance: 'push' | 'careful') => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const wasFirstVisit = state.expeditionState.locationId
      ? !state.storyFlags.includes(`visited:${state.expeditionState.locationId}`)
      : false;
    let next = resolveExpeditionStance(state, stance);
    const committedSurvivorIds = [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])];
    if (wasFirstVisit && next.campaignStats.locationsDiscovered > 0) {
      next = {
        ...next,
        campaignStats: {
          ...next.campaignStats,
          locationsDiscovered: next.campaignStats.locationsDiscovered - 1,
        },
      };
    }
    commit(
      {
        ...next,
        phase: 'dusk',
        dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds },
      },
      setState
    );
  };

  const retreat = () => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const next = retreatCurrentExpedition(state);
    commit(
      {
        ...next,
        phase: 'dusk',
        dayState: {
          ...next.dayState,
          assignmentsLocked: true,
          committedSurvivorIds: [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])],
        },
      },
      setState
    );
  };

  if (!state.expeditionState.departed) {
    return (
      <main className="v6-desk-workspace v6-desk--expedition">
        <header className="v6-tactical-header">
          <span className="v6-stamp v6-stamp--ok">[ 外围搜寻计划 // EXPEDITION RECON ]</span>
          <h1 className="v6-tactical-title">选择搜寻队与已解锁地点</h1>
          <p className="v6-tactical-desc">
            新地点不会因为天数自动出现。只有街区事件提供情报以后，它才会进入探索地图。
          </p>
        </header>

        <InventoryBar state={state} />

        <section className="v6-causal-warning-dossier" style={{ borderColor: 'var(--twom-border)' }}>
          <div className="v6-warning-header">
            <span>EXPEDITION PARTY // 出勤队员 (1~2 人)</span>
          </div>
          <div className="v6-tab-deck" style={{ marginBottom: 0 }}>
            {assignedIds.map((id) => {
              const survivor = state.survivors.find((item) => item.id === id)!;
              const active = party.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`v6-tab-btn ${active ? 'is-active' : ''}`}
                  onClick={() =>
                    setParty((current) =>
                      active
                        ? current.filter((x) => x !== id)
                        : current.length < 2
                        ? [...current, id]
                        : current
                    )
                  }
                >
                  <strong>{survivor.name}</strong> · 体力 {survivor.energy} · {CONDITION_BADGE[survivor.condition ?? 'healthy'].label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="v6-locations-deck">
          {availableLocations.map((location) => (
            <button
              key={location.id}
              type="button"
              className={`v6-loc-folder ${location.id === locationId ? 'is-selected' : ''}`}
              onClick={() => setLocationId(location.id)}
            >
              <div className="v6-loc-folder-tab">
                <span className="v6-loc-name">{location.name}</span>
                <span className="v6-stamp v6-stamp--warning">危险 {location.danger} / 5</span>
              </div>
              <div className="v6-loc-folder-body">
                <p className="v6-loc-desc">{location.description}</p>
                <div className="v6-loc-loot-tag">
                  主要产出: {location.primary} · 风险评估: {risk}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="v6-expedition-actions">
          <button
            type="button"
            className="v6-btn-cta"
            disabled={!party.length || !availableLocations.length}
            onClick={begin}
          >
            [ 🚶 搜索队出发 · 返回主界面 ]
          </button>
          <button
            type="button"
            className="v6-btn-cancel"
            onClick={() => commit(reopenDayAssignments(state), setState)}
          >
            [ ← 取消并返回调遣台账 ]
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="v6-desk-workspace v6-desk--expedition">
      <header className="v6-tactical-header">
        <span className="v6-stamp v6-stamp--warning">[ 探索途中 · 风险评估: {activeRisk === 'safe' ? '安全' : activeRisk === 'cautious' ? '谨慎' : activeRisk === 'dangerous' ? '危险' : '极险'} ]</span>
        <h1 className="v6-tactical-title">{event?.title ?? '搜索队进入了建筑'}</h1>
        <p className="v6-tactical-desc">{event?.body ?? '前面没有声音，但没人知道拐角后面有什么。'}</p>
      </header>

      <div className="v6-stances-deck">
        <button type="button" className="v6-stance-card v6-stance--push" onClick={() => finish('push')}>
          <div className="v6-stance-badge">[ A ]</div>
          <div className="v6-stance-content">
            <strong className="v6-stance-name">继续深入 (Push Forward)</strong>
            <span className="v6-stance-desc">更高收益，但判定更难。成功将额外获得关键生存物资。</span>
            <DecisionTags tags={pushPreview.tags} />
            <small className="v6-stance-summary">{pushPreview.summary}</small>
          </div>
        </button>

        <button type="button" className="v6-stance-card v6-stance--careful" onClick={() => finish('careful')}>
          <div className="v6-stance-badge">[ B ]</div>
          <div className="v6-stance-content">
            <strong className="v6-stance-name">谨慎绕行 (Cautious Route)</strong>
            <span className="v6-stance-desc">降低判定压力，不追求额外收益，优先保证队员人身安全。</span>
            <DecisionTags tags={carefulPreview.tags} />
            <small className="v6-stance-summary">{carefulPreview.summary}</small>
          </div>
        </button>

        <button type="button" className="v6-stance-card v6-stance--retreat" onClick={retreat}>
          <div className="v6-stance-badge">[ C ]</div>
          <div className="v6-stance-content">
            <strong className="v6-stance-name">立刻撤回 (Retreat to Base)</strong>
            <span className="v6-stance-desc">放弃今天的物资收益，把人原路带回避难所。</span>
            <DecisionTags tags={retreatPreview.tags} />
            <small className="v6-stance-summary">{retreatPreview.summary}</small>
          </div>
        </button>
      </div>

      <p className="v6-forecast-hint" style={{ marginTop: 12 }}>{state.lastMessage}</p>
    </main>
  );
}

/* ==========================================================================
   DUSK SCREEN
   ========================================================================== */
function DuskScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const committed = hasCommittedDayAction(state);
  const causalSignals = nightCausalSignals(state);

  return (
    <main className="v6-desk-workspace v6-desk--dusk">
      <header className="v6-tactical-header">
        <span className="v6-stamp v6-stamp--danger">[ 暮色将至 // DUSK COUNTDOWN · DAY {state.day} ]</span>
        <h1 className="v6-tactical-title">天黑以后，不再换岗。</h1>
        <p className="v6-tactical-desc">
          这是白天最后一次确认。今晚发生什么，取决于现在留下了谁、修好了什么、物资还剩多少。
        </p>
      </header>

      <InventoryBar state={state} />

      <div className="v6-dusk-audit-deck">
        <div className="v6-dusk-plate">
          <span className="v6-dusk-code">01 / PROVISIONS</span>
          <h3>供餐状态: {mealLabel(meal.quality)}</h3>
          <p>
            人口 {meal.residentCount} · 炊事能力 {meal.cookingCapacity.toFixed(1)} · 覆盖率 {Math.round(meal.coverage * 100)}%
          </p>
          <span className="v6-stamp v6-stamp--ok" style={{ marginTop: 6 }}>
            精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
          </span>
        </div>

        <div className="v6-dusk-plate">
          <span className="v6-dusk-code">02 / NIGHT DEFENSE</span>
          <h3>夜间准备: {prep.defense}</h3>
          <p>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</p>
          <span className="v6-stamp v6-stamp--warning" style={{ marginTop: 6 }}>
            守备人员与防御设施会显著改变随机事件风险
          </span>
        </div>
      </div>

      {causalSignals.length > 0 && (
        <div className="v6-causal-warning-dossier">
          <div className="v6-warning-header">
            <span className="v6-text--urgent">[ ! ] 今晚的因果 // 这些不是固定剧本，而是今天留下的风险</span>
          </div>
          <ul className="v6-warning-list">
            {causalSignals.map((signal) => (
              <li key={signal} className="v6-warning-item">
                <span className="v6-warn-icon">⚠️</span>
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="v6-dusk-cta-block">
        <button
          type="button"
          className="v6-btn-cta v6-btn-cta--night"
          onClick={() => commit(finalizeDay(state), setState)}
        >
          [ 🌑 进入夜晚 // NIGHT DEFENSE ]
        </button>
      </div>

      {!committed ? (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button type="button" className="v6-btn-cancel" onClick={() => commit(reopenDayAssignments(state), setState)}>
            [ ← 返回调整派遣 ]
          </button>
        </div>
      ) : (
        <p className="v6-forecast-hint" style={{ textAlign: 'center', marginTop: 10 }}>
          今日已经执行过探索或搜救，派遣不可再调整。
        </p>
      )}

      <p className="v6-forecast-hint" style={{ textAlign: 'center', marginTop: 6 }}>{state.lastMessage}</p>
    </main>
  );
}

/* ==========================================================================
   DAWN SCREEN
   ========================================================================== */
function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const brief = dawnBriefEntries(state);

  return (
    <main className="v6-desk-workspace v6-desk--dawn">
      <header className="v6-tactical-header">
        <span className="v6-stamp v6-stamp--ok">[ 破晓简报 // DAWN · DAY {state.day} ]</span>
        <h1 className="v6-tactical-title">{state.day === 29 ? '最后的夜结束了。' : '天亮了。'}</h1>
        <p className="v6-tactical-desc">
          {state.nightState.hordeActive
            ? '尸潮退去以后，街道重新有了颜色。现在才看得清昨夜留下的损失。'
            : '发电机的声音重新盖过远处的脚步。今天仍然有事要做。'}
        </p>
      </header>

      <InventoryBar state={state} />

      <div className="v6-dawn-stats-deck">
        <div className="v6-dawn-cell">
          <span>夜间事件</span>
          <strong>{state.nightState.resolutions.length}</strong>
        </div>
        <div className="v6-dawn-cell">
          <span>死亡</span>
          <strong className={state.campaignStats.deaths > 0 ? 'v6-text--danger' : ''}>
            {state.campaignStats.deaths}
          </strong>
        </div>
        <div className="v6-dawn-cell">
          <span>失踪</span>
          <strong className={state.campaignStats.missing > 0 ? 'v6-text--warning' : ''}>
            {state.campaignStats.missing}
          </strong>
        </div>
        <div className="v6-dawn-cell">
          <span>救回</span>
          <strong className="v6-text--hope">{state.campaignStats.rescued}</strong>
        </div>
      </div>

      <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} compact />

      {brief.length > 0 && (
        <div className="v6-causal-warning-dossier" style={{ borderColor: 'var(--twom-border-light)' }}>
          <div className="v6-warning-header">
            <span>DAWN BRIEF // 昨夜简报 · 昨天的选择留下了什么</span>
          </div>
          <div className="v6-warning-list">
            {brief.map((entry, index) => (
              <div key={`${entry}-${index}`} className="v6-warning-item">
                <span className="v6-stamp v6-stamp--ok">•</span>
                <span>{entry}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <MemorialPanel state={state} />

      <div className="v6-dawn-cta-block">
        <button
          type="button"
          className="v6-btn-cta"
          onClick={() => commit(advanceCampaignDay(state), setState)}
        >
          {state.day === 29 ? '[ 进入 DAY 30 · 结算 ]' : `[ ☀️ 开始 DAY ${state.day + 1} ]`}
        </button>
      </div>
    </main>
  );
}

/* ==========================================================================
   ENDING SCREEN
   ========================================================================== */
function EndingScreen({ state, meta, onRestart }: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending;
  if (!ending) return null;
  const aliveCount = population(state);

  return (
    <main className="v6-desk-workspace v6-desk--ending">
      <header className="v6-tactical-header" style={{ textAlign: 'center' }}>
        <span className="v6-stamp v6-stamp--max">[ 终局总账 // DAY 30 · FINAL LEDGER ]</span>
        <h1 className="v6-tactical-title">《{ending.title}》</h1>
        <p className="v6-tactical-desc" style={{ margin: '0 auto' }}>{ending.summary}</p>
      </header>

      <div className="v6-ending-ledger-card">
        <div className="v6-ledger-row">
          <span>坚守天数: <b>DAY 30</b></span>
          <span>救回幸存者: <b>{state.campaignStats.rescued} 人</b></span>
          <span>仍在街区: <b>{aliveCount} 人</b></span>
          <span>确认死亡: <b>{state.campaignStats.deaths} 人</b></span>
          <span>探索次数: <b>{state.campaignStats.expeditions} 次</b></span>
          <span>发现据点: <b>{state.campaignStats.locationsDiscovered} 处</b></span>
        </div>
      </div>

      <MemorialPanel state={state} />

      <section className="v6-causal-warning-dossier" style={{ borderColor: 'var(--twom-border)', marginTop: 16 }}>
        <div className="v6-warning-header">
          <span>ENDINGS ARCHIVE // 结局解锁记录 ({meta.endingsUnlocked.length} / 13)</span>
        </div>
        <div className="v6-dossier-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {(Object.keys(ENDINGS) as EndingId[]).map((id) => {
            const isUnlocked = meta.endingsUnlocked.includes(id);
            return (
              <div key={id} className="v6-folder-card" style={{ padding: 10, opacity: isUnlocked ? 1 : 0.4 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--paper-bone)' }}>
                  {isUnlocked ? ENDINGS[id].title : '？？？？'}
                </span>
                <small style={{ fontSize: '0.65rem', color: 'var(--paper-faint)' }}>
                  {isUnlocked ? ENDINGS[id].tier : endingHint(id)}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button type="button" className="v6-btn-cta" onClick={onRestart}>
          [ 🔄 开始新的 30 天 ]
        </button>
      </div>
    </main>
  );
}

/* ==========================================================================
   ROOT COMPONENT
   ========================================================================== */
export default function V060AppHotfix() {
  const [state, setState] = useState<GameState>(() => initialRun());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    saveGame(state);
  }, [state]);

  useEffect(() => {
    if (
      state.phase !== 'ending' ||
      !state.ending ||
      !state.finalHordeResult ||
      recorded.current === `${state.seed}:${state.ending.id}`
    )
      return;
    recorded.current = `${state.seed}:${state.ending.id}`;
    setMeta((current) => recordEnding(current, state.ending!, state.finalHordeResult!));
  }, [state.phase, state.ending, state.finalHordeResult, state.seed]);

  const restart = () => {
    clearSave();
    recorded.current = null;
    const next = createV060InitialState();
    saveGame(next, true);
    setState(next);
  };

  const screen = useMemo(() => {
    if (state.phase === 'street' || state.phase === 'assignment') return <DayScreen state={state} setState={setState} />;
    if (state.phase === 'expedition') return <ExpeditionScreen state={state} setState={setState} />;
    if (state.phase === 'dusk') return <DuskScreen state={state} setState={setState} />;
    if (state.phase === 'night' || state.phase === 'night-summary')
      return <V060NightScene state={state} setState={setState} />;
    if (state.phase === 'summary' || state.phase === 'dawn') return <DawnScreen state={state} setState={setState} />;
    if (state.phase === 'ending') return <EndingScreen state={state} meta={meta} onRestart={restart} />;
    return <DayScreen state={{ ...state, phase: 'street' }} setState={setState} />;
  }, [state, meta]);

  return <>{screen}</>;
}