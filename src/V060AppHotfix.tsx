import { useEffect, useMemo, useRef, useState } from 'react';
import SocialStatusPanel from './components/v060/SocialStatusPanel';
import V060NightScene from './V060NightScene';
import { clearSave, loadGame, saveGame } from './game/storage';
import type { BuildingId, DayAssignment, EndingId, GameState, SurvivorCondition } from './game/types';
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

// ─────────────────────────────────────────────
// STATIC DATA & DICTIONARIES
// ─────────────────────────────────────────────
const JOBS: Array<{ id: DayAssignment; label: string; icon: string; code: string; note: string }> = [
  { id: 'expedition', label: '探索', icon: '⬡', code: 'EXP', note: '外出搜集物资，面临遭遇、受伤或死亡风险。' },
  { id: 'repair',     label: '维修', icon: '⚙', code: 'REP', note: '加固街区防线，确保夜间工坊设施正常运转。' },
  { id: 'medical',    label: '医疗', icon: '✚', code: 'MED', note: '优先救治重伤员，防止伤情恶化至危重或死亡。' },
  { id: 'watch',      label: '守备', icon: '◉', code: 'DEF', note: '加强夜间巡逻警戒，降低突发威胁与尸潮压力。' },
  { id: 'radio',      label: '广播', icon: '◎', code: 'RAD', note: '监听外界无线电波，搜寻幸存者与避难所信号。' },
  { id: 'cook',       label: '炊事', icon: '◈', code: 'KIT', note: '调配现有口粮，提升供餐覆盖率以恢复精力与希望。' },
  { id: 'rest',       label: '休息', icon: '◌', code: 'RST', note: '在避难所卧床静养，加快恢复体能精力。' },
];

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康',
  fatigued: '疲劳',
  minor: '轻伤',
  serious: '重伤',
  critical: '危重',
  missing: '失踪',
  dead: '死亡',
};

const RESULT_LABEL = {
  perfect: '完美守住',
  held: '勉强守住',
  damaged: '严重受损',
  breached: '街区失守',
} as const;

const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const corePresent = (state: GameState) =>
  state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;

const population = (state: GameState) => corePresent(state) + state.civilianResidents;

function initialRun(): GameState {
  const loaded = loadGame();
  return loaded ? upgradeSaveToV060(loaded) : createV060InitialState();
}

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function resTier(value: number, crit: number, warn: number): 'critical' | 'warning' | 'ok' {
  if (value <= crit) return 'critical';
  if (value <= warn) return 'warning';
  return 'ok';
}

function DecisionTags({ tags }: { tags: string[] }) {
  if (!tags || !tags.length) return null;
  return (
    <div className="v6-decision-tags" aria-label="决策影响标签">
      {tags.map((tag) => (
        <span className="v6-badge--tag" key={tag}>{tag}</span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOPBAR — WARTIME SHELTER COMMAND HEADER
// ─────────────────────────────────────────────
function TopBar({ state }: { state: GameState }) {
  const pop = population(state);
  const phase = state.phase;
  const phaseLabel =
    phase === 'dusk' ? '黄昏阶段' :
    (phase === 'night' || phase === 'night-summary') ? '长夜防守' :
    (phase === 'summary' || phase === 'dawn') ? '黎明结算' :
    '白天调遣';
  const phaseClass =
    phase === 'dusk' ? 'dusk' :
    (phase === 'night' || phase === 'night-summary') ? 'night' :
    (phase === 'summary' || phase === 'dawn') ? 'dawn' :
    'day';

  return (
    <header className="v6-topbar" aria-label="战时指挥日志抬头">
      <div className="v6-topbar__brand">
        <div className="v6-brand-stamp">
          <span className="v6-stamp-title">EMBER STREET</span>
          <span className="v6-stamp-sub">余烬长街 · 生存纪事</span>
        </div>
        <div className="v6-day-stamp" title="生存天数记录">
          <span className="v6-day-tag">SURVIVAL LOG</span>
          <div className="v6-day-num-wrap">
            <span className="v6-day-prefix">DAY</span>
            <span className="v6-day-number">{String(state.day).padStart(2, '0')}</span>
            <span className="v6-day-total">/ 30</span>
          </div>
        </div>
      </div>

      <div className="v6-topbar__status">
        <div className="v6-status-gauge" title={`街区人口：${pop} 人（核心 ${corePresent(state)} + 居民 ${state.civilianResidents}）`}>
          <span className="v6-gauge-icon">👥</span>
          <div className="v6-gauge-content">
            <span className="v6-gauge-label">总人口</span>
            <span className="v6-gauge-val">{pop}<small>人</small></span>
          </div>
        </div>

        <div className={`v6-status-gauge v6-status-gauge--hope ${state.hope <= 15 ? 'is-critical' : ''}`} title="希望值：街区民众对生存的信心">
          <span className="v6-gauge-icon">🔥</span>
          <div className="v6-gauge-content">
            <span className="v6-gauge-label">希望</span>
            <span className="v6-gauge-val">{state.hope}</span>
          </div>
        </div>

        <div className={`v6-status-gauge v6-status-gauge--defense ${state.defense <= 30 ? 'is-critical' : ''}`} title="防线强度：阻挡夜间威胁的屏障">
          <span className="v6-gauge-icon">🛡️</span>
          <div className="v6-gauge-content">
            <span className="v6-gauge-label">防线</span>
            <span className="v6-gauge-val">{Math.round(state.defense)}</span>
          </div>
        </div>

        <div className={`v6-status-gauge v6-status-gauge--light stage-${state.mainLightStage}`} title="主街路灯：驱散黑暗的灯火">
          <span className="v6-gauge-icon">💡</span>
          <div className="v6-gauge-content">
            <span className="v6-gauge-label">主路灯</span>
            <span className="v6-gauge-val">阶段 {state.mainLightStage}</span>
          </div>
        </div>
      </div>

      <div className="v6-topbar__phase">
        <div className={`v6-phase-stamp v6-phase-stamp--${phaseClass}`}>
          <span className="v6-phase-indicator" />
          <span className="v6-phase-text">{phaseLabel}</span>
        </div>
        <div className="v6-forecast-banner" title={state.forecast.detail}>
          <span className="v6-forecast-alert">REPORT:</span>
          <span className="v6-forecast-title">{state.day === 29 ? '决战前夕 · 最终尸潮' : state.forecast.title}</span>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// STREET VISUAL — BESIEGED STREET WITH DYNAMIC LIGHT
// ─────────────────────────────────────────────
function StreetVisual({ state }: { state: GameState }) {
  const stage = state.mainLightStage;
  const stageInfo = [
    { label: '主灯熄灭', desc: '黑暗吞噬整条街道 · 寒冷与绝望逼近', status: 'dark' },
    { label: '孤灯残照', desc: '一盏昏黄路灯 · 艰难照亮核心避难所', status: 'dim' },
    { label: '主灯恢复', desc: '部分街区重现光明 · 防线有了依托', status: 'glow' },
    { label: '灯火通明', desc: '街区安全区形成 · 希望之火长存', status: 'bright' },
  ][stage] ?? { label: '状态未知', desc: '主灯运转异常', status: 'dim' };

  return (
    <section className={`v6-street v6-street--stage-${stage}`} aria-label="街区废墟全景">
      {/* Sky & Atmospheric Dust */}
      <div className="v6-street__sky">
        <div className="v6-dust-layer" />
        <div className="v6-soot-particles" />
        <div className="v6-mist-layer" />
      </div>

      {/* Layered Ruined City Silhouettes */}
      <div className="v6-ruins-layer v6-ruins--distant" />
      <div className="v6-ruins-layer v6-ruins--mid-l" />
      <div className="v6-ruins-layer v6-ruins--mid-r" />
      <div className="v6-ruins-layer v6-ruins--fore-l" />
      <div className="v6-ruins-layer v6-ruins--fore-r" />

      {/* Broken Telephone Wire */}
      <div className="v6-street__wires" />

      {/* Street Lamp Post & Light Cone */}
      <div className="v6-main-light">
        <div className="v6-lamp-arm" />
        <div className="v6-lamp-head" />
        <div className="v6-lamp-cone" />
      </div>

      {/* Ground Road & Barricades */}
      <div className="v6-street__ground">
        <div className="v6-barricade-wood" />
        <div className="v6-barricade-sandbags" />
      </div>

      {/* Worn Stencil HUD Strip */}
      <div className="v6-street__hud">
        <div className="v6-hud-items">
          <span className="v6-hud-chip">👥 居民 {population(state)}</span>
          <span className="v6-hud-chip">🛡️ 核心 {corePresent(state)}</span>
          <span className="v6-hud-chip">📅 DAY {state.day} / 30</span>
        </div>
        <div className="v6-hud-light-status">
          <span className={`v6-lamp-dot v6-lamp-dot--${stageInfo.status}`} />
          <strong>{stageInfo.label}</strong>
          <span className="v6-hud-desc">· {stageInfo.desc}</span>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// INVENTORY BAR — RUGGED SURVIVAL MANIFEST
// ─────────────────────────────────────────────
function ManifestItem({
  label, value, icon, crit, warn, unit,
}: { label: string; value: number; icon: string; crit: number; warn: number; unit?: string }) {
  const tier = resTier(value, crit, warn);
  const tierText = tier === 'critical' ? '危急' : tier === 'warning' ? '偏低' : '充足';
  return (
    <div className={`v6-manifest-item v6-manifest-item--${tier}`} title={`${label}: ${value} ${unit ?? ''} (${tierText})`}>
      <div className="v6-manifest-head">
        <span className="v6-manifest-icon">{icon}</span>
        <span className="v6-manifest-label">{label}</span>
        <span className={`v6-manifest-stamp v6-manifest-stamp--${tier}`}>{tierText}</span>
      </div>
      <div className="v6-manifest-body">
        <span className="v6-manifest-val">{value}</span>
        {unit && <span className="v6-manifest-unit">{unit}</span>}
      </div>
    </div>
  );
}

function InventoryBar({ state }: { state: GameState }) {
  const inv = state.inventory;
  return (
    <section className="v6-inventory" aria-label="街区物资储备与生存指标">
      <div className="v6-inventory__title">
        <div className="v6-inventory__title-left">
          <span className="v6-inventory__stamp-icon">📋</span>
          <span>避难所物资清单与生存底线</span>
        </div>
        <small className="v6-inventory__note">
          救回的居民每日均需口粮 · 维持电力与建材才能熬过黑夜
        </small>
      </div>

      <div className="v6-manifest-groups">
        {/* Survival Lifeline */}
        <div className="v6-manifest-group v6-manifest-group--vital">
          <div className="v6-group-header">
            <span className="v6-group-tag">01 · 生存保障</span>
            <small>生命底线</small>
          </div>
          <div className="v6-group-grid">
            <ManifestItem label="口粮" icon="🍞" value={inv.ration} crit={4} warn={10} unit="份" />
            <ManifestItem label="药品" icon="💊" value={inv.medicine} crit={2} warn={5} unit="件" />
          </div>
        </div>

        {/* Engineering Resources */}
        <div className="v6-manifest-group v6-manifest-group--eng">
          <div className="v6-group-header">
            <span className="v6-group-tag">02 · 工程物资</span>
            <small>防御与设施</small>
          </div>
          <div className="v6-group-grid">
            <ManifestItem label="电力" icon="⚡" value={inv.power} crit={3} warn={10} unit="kw" />
            <ManifestItem label="材料" icon="🪵" value={inv.materials} crit={3} warn={8} unit="捆" />
            <ManifestItem label="零件" icon="🔩" value={inv.parts} crit={2} warn={5} unit="组" />
          </div>
        </div>

        {/* Street Morale & Defense */}
        <div className="v6-manifest-group v6-manifest-group--morale">
          <div className="v6-group-header">
            <span className="v6-group-tag">03 · 街区防务</span>
            <small>凝聚与防线</small>
          </div>
          <div className="v6-group-grid">
            <ManifestItem label="希望" icon="🔥" value={state.hope} crit={12} warn={25} />
            <ManifestItem label="防线" icon="🛡️" value={Math.round(state.defense)} crit={20} warn={40} />
            <ManifestItem label="居民" icon="👥" value={population(state)} crit={0} warn={1} unit="人" />
          </div>
        </div>
      </div>

      {!!state.storyItems.length && (
        <div className="v6-story-items">
          <strong className="v6-story-items-tag">📦 关键搜集品:</strong>
          {state.storyItems.map((item) => (
            <span className="v6-story-item-chip" key={item}>
              ✦ {item}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// MEMORIAL WALL — SOOT-STAINED MEMORY WALL
// ─────────────────────────────────────────────
function MemorialPanel({ state }: { state: GameState }) {
  if (!state.memorials.length) return null;
  return (
    <section className="v6-section v6-memorial-section" aria-label="逝者纪念墙">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">残墙刻痕</span>
          <h2>这里曾经有人</h2>
        </div>
        <small className="v6-memorial-count">{state.memorials.length} 处碑文</small>
      </div>
      <div className="v6-memorials-grid">
        {state.memorials.map((entry) => (
          <article className="v6-memorial-card" key={entry.survivorId}>
            <div className="v6-memorial-head">
              <h3>{entry.name}</h3>
              <span className="v6-memorial-date">DAY {entry.day} · {entry.cause}</span>
            </div>
            <p className="v6-memorial-epitaph">“{entry.epitaph}”</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// CAMPAIGN EVENT SCREEN — WARTIME FIXED EVENTS
// ─────────────────────────────────────────────
function CampaignEventScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const event = pendingCampaignEvent(state);
  if (!event) return null;
  const kind =
    event.kind === 'character' ? '人物事件' :
    event.kind === 'building' ? '建成事件' :
    event.kind === 'community' ? '社区事件' :
    '探索情报';
  const subtitle =
    event.kind === 'location'
      ? '新地点会在探索地图中解锁出现'
      : event.kind === 'building'
      ? '这座设施正式进入街区运转'
      : event.kind === 'community'
      ? '居民数量正在把避难点变成真正的社区'
      : '只有已经加入街区的人物才会出现自身专属事件';

  return (
    <main className="v6-shell v6-event-shell">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span className="v6-event-stamp">{kind} · DAY {state.day}</span>
        <h1>{event.title}</h1>
        <p className="v6-page-desc">{event.body}</p>
      </header>
      <InventoryBar state={state} />
      <section className="v6-section v6-event-box">
        <div className="v6-section__head">
          <div>
            <span className="v6-section__tag">{kind}</span>
            <h2>{subtitle}</h2>
          </div>
        </div>
        <div className="v6-event-body-text">
          <p>{event.body}</p>
        </div>
        <button className="v6-cta" onClick={() => commit(resolveCampaignEvent(state, event.id), setState)}>
          {event.actionLabel}
        </button>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────
// COMMUNITY PANEL — RESIDENT LABOR ALLOCATION
// ─────────────────────────────────────────────
function CommunityPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  return (
    <section className="v6-section v6-community-section" aria-label="社区居民劳动力协同">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">社区协力</span>
          <h2>{summary.activeResidents} 人已安置 · {summary.pendingResidents} 人处于安置期</h2>
        </div>
        <small className="v6-community-badge">
          {summary.unlocked ? `今日轮值模式：${summary.supportModeLabel}` : '安置达 5 人后解锁轮值'}
        </small>
      </div>

      <div className="v6-community-grid">
        <div className="v6-comm-slot">
          <span className="v6-comm-label">后勤协力</span>
          <strong>炊事 +{summary.cookingCapacity.toFixed(1)}</strong>
          <small>完善宿营屋，可大幅解放核心队伍的炊事负担</small>
        </div>
        <div className="v6-comm-slot">
          <span className="v6-comm-label">工程维护</span>
          <strong>防线 +{summary.repairDefense}</strong>
          <small>居民协助搬运沙袋、封堵缺口和加固外墙</small>
        </div>
        <div className="v6-comm-slot">
          <span className="v6-comm-label">夜巡协助</span>
          <strong>夜险 -{Math.round(summary.nightRiskReduction * 100)}%</strong>
          <small>守夜岗与居民哨位联动，降低突发袭击概率</small>
        </div>
        <div className="v6-comm-slot">
          <span className="v6-comm-label">医疗辅助</span>
          <strong>+{summary.medicalAssist} 护理</strong>
          <small>诊疗站升级后可协助照料轻伤员加速愈合</small>
        </div>
      </div>

      {summary.unlocked && (
        <div className="v6-mode-grid">
          {(['logistics', 'repair', 'defense'] as const).map((mode) => (
            <button
              key={mode}
              className={`v6-mode-btn ${summary.supportMode === mode ? 'active' : ''}`}
              disabled={state.dayState.assignmentsLocked}
              onClick={() => commit(selectCommunitySupportMode(state, mode), setState)}
            >
              {mode === 'logistics' ? '🛠️ 后勤轮值' : mode === 'repair' ? '🧱 维修轮值' : '🛡️ 守备轮值'}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// BUILDINGS PANEL — REBUILDING THE RUINS
// ─────────────────────────────────────────────
function BuildingsPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return (
    <section className="v6-section v6-buildings-section" aria-label="街区废墟设施修缮">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">废墟修缮</span>
          <h2>将搜集到的建材转化为生存设施</h2>
        </div>
        <small className="v6-build-hint">首次修成设施将触发特定建成事件</small>
      </div>

      <div className="v6-buildings">
        {BUILDING_IDS.map((id) => {
          const definition = V060_BUILDINGS[id];
          const level = state.buildings[id];
          const next = definition.levels[level] ?? null;
          const check = canUpgradeBuilding(state, id);
          const isMax = !next;
          const isRuin = level === 0;

          return (
            <article
              className={`v6-building-card ${isRuin ? 'v6-building-card--ruin' : ''} ${isMax ? 'v6-building-card--max' : ''}`}
              key={id}
            >
              <div className="v6-bldg-header">
                <div className="v6-bldg-title-wrap">
                  <span className="v6-bldg-icon">{isRuin ? '🏚️' : isMax ? '🏰' : '🔨'}</span>
                  <span className="v6-bldg-name">{definition.name}</span>
                </div>
                <span className={`v6-bldg-level-stamp ${isRuin ? 'is-ruin' : isMax ? 'is-max' : 'is-level'}`}>
                  {isRuin ? '废墟' : `Lv.${level}`}
                </span>
              </div>

              <h3 className="v6-bldg-status-title">
                {level ? definition.levels[level - 1].title : '破败废墟 · 亟待清理'}
              </h3>
              <p className="v6-bldg-desc">
                {level ? definition.levels[level - 1].unlock : '修复该设施将真正改变白天探索或黑夜防守的规则。'}
              </p>

              {next ? (
                <div className="v6-bldg-upgrade-block">
                  <div className="v6-upgrade-cost-tag">
                    <span>修缮消耗:</span>
                    <b>材料 {next.materials}</b>
                    <span>·</span>
                    <b>零件 {next.parts}</b>
                  </div>
                  <button
                    className="v6-btn-upgrade"
                    disabled={!check.allowed || state.dayState.assignmentsLocked}
                    onClick={() => commit(upgradeBuilding(state, id), setState)}
                    title={!check.allowed ? check.reason : undefined}
                  >
                    {state.dayState.assignmentsLocked
                      ? '今日调遣已锁定'
                      : check.allowed
                      ? `${level === 0 ? '清理修造' : '加固升级至'} Lv.${next.level}`
                      : check.reason}
                  </button>
                </div>
              ) : (
                <div className="v6-bldg-max-stamp">
                  <span>◆ 设施已满级运转</span>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// MISSING PERSONS PANEL — SEARCH & RESCUE DOSSIER
// ─────────────────────────────────────────────
function MissingPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const missing = state.survivors.filter((s) => s.condition === 'missing');
  if (!missing.length) return null;
  return (
    <section className="v6-section v6-missing-section" aria-label="失踪搜救档案">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag v6-section__tag--danger">失踪人员档案</span>
          <h2>是否在今日发起搜救？</h2>
        </div>
        <small className="v6-missing-warning">搜救失败将累积风险，二次搜救失利或将确认死亡</small>
      </div>

      <div className="v6-survivors">
        {missing.map((s) => {
          const attempted = state.storyFlags.includes(`missing_search:${s.id}:${state.day}`);
          const teamPreview = missingSearchPreview(state, s.id, 'team');
          const radioPreview = missingSearchPreview(state, s.id, 'radio');
          const teamUnavailable = teamPreview.tags.includes('人员不足');
          return (
            <article className="v6-survivor v6-survivor--missing" key={s.id}>
              <div className="v6-survivor__top">
                <div className="v6-survivor__profile">
                  <span className="v6-survivor__avatar-stamp">❓</span>
                  <div>
                    <h3>{s.name}</h3>
                    <div className="v6-survivor__trait">在黑夜或探索中失联 · 生死未卜</div>
                  </div>
                </div>
                <div className="v6-survivor__condition-stamp v6-condition-stamp--missing">
                  失踪
                </div>
              </div>

              <p className="v6-missing-memo">
                {attempted
                  ? '今日已组织过一次搜救，现场痕迹已断。'
                  : '权衡搜救代价：地面搜救需要占用两名健康队员，无线电搜救需消耗5点电力。'}
              </p>

              <div className="v6-missing-actions">
                <button
                  className="v6-action-dossier"
                  disabled={attempted || teamUnavailable}
                  onClick={() => commit(searchForMissing(state, s.id, 'team'), setState)}
                >
                  <div className="v6-action-title">
                    <strong>🥾 组织两人地面搜寻</strong>
                  </div>
                  <DecisionTags tags={teamPreview.tags} />
                  <small className="v6-action-summary">{teamPreview.summary}</small>
                </button>

                <button
                  className="v6-action-dossier"
                  disabled={attempted || state.buildings.radio <= 0 || state.inventory.power < 5}
                  onClick={() => commit(searchForMissing(state, s.id, 'radio'), setState)}
                >
                  <div className="v6-action-title">
                    <strong>📻 发射无线电定向呼叫</strong>
                  </div>
                  <DecisionTags tags={radioPreview.tags} />
                  <small className="v6-action-summary">{radioPreview.summary}</small>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// ASSIGNMENT PANEL — SURVIVOR SURVIVAL DOSSIERS
// ─────────────────────────────────────────────
function AssignmentPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const expeditionCount = Object.values(state.dayAssignments).filter((job) => job === 'expedition').length;
  return (
    <section className="v6-section v6-assignment-section" aria-label="幸存者今日调遣指令">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag">人员调遣</span>
          <h2>今日指令 · 每个人专注一项核心职责</h2>
        </div>
        <small className="v6-assignment-notice">黄昏锁岗后将不可重新调遣</small>
      </div>

      <div className="v6-survivors">
        {state.survivors
          .filter((s) => s.condition !== 'dead' && s.condition !== 'missing')
          .map((survivor) => {
            const condition = survivor.condition ?? 'healthy';
            const unavailable = condition === 'critical';
            const current = state.dayAssignments[survivor.id];
            const committed = state.dayState.committedSurvivorIds.includes(survivor.id);
            const mental = activeMentalState(state, survivor);

            const cardClass = [
              'v6-survivor',
              `v6-survivor--${condition}`,
              unavailable || committed ? 'is-unavailable' : '',
              committed ? 'is-committed' : '',
            ].filter(Boolean).join(' ');

            return (
              <article className={cardClass} key={survivor.id}>
                {/* Dossier Top Header */}
                <div className="v6-survivor__top">
                  <div className="v6-survivor__profile">
                    <div className={`v6-survivor__condition-dot v6-dot--${condition}`} />
                    <div>
                      <h3 className="v6-survivor__name">{survivor.name}</h3>
                      <div className="v6-survivor__trait">
                        {committed ? '今日行动已执行完毕' : survivor.trait ?? survivor.perk ?? '普通幸存者'}
                      </div>
                    </div>
                  </div>

                  {/* Energy Meter */}
                  <div className="v6-survivor__energy-gauge">
                    <div className="v6-energy-meta">
                      <span className="v6-energy-label">精力</span>
                      <span className="v6-energy-val">{survivor.energy}</span>
                    </div>
                    <div className="v6-energy-track">
                      <div
                        className={`v6-energy-bar-fill v6-energy--${
                          survivor.energy > 60 ? 'good' : survivor.energy > 30 ? 'mid' : 'low'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, survivor.energy))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Stamped Badges: Condition, Trust, Specialty, Mental, Active Job */}
                <div className="v6-survivor__status">
                  <span className={`v6-stamp-badge v6-stamp--condition v6-stamp--${condition}`}>
                    {CONDITION_LABEL[condition]}
                  </span>
                  <span className="v6-stamp-badge v6-stamp--trust">
                    信任 {survivor.trust ?? 0}
                  </span>
                  {survivor.specialty && (
                    <span className="v6-stamp-badge v6-stamp--specialty">
                      ★ {survivor.specialty}
                    </span>
                  )}
                  {mental !== 'steady' && (
                    <span className={`v6-stamp-badge v6-stamp--mental v6-stamp--mental-${mental}`}>
                      {mental === 'focused' ? '⚡ 心理 · 专注 (+1)' : '⚠️ 心理 · 动摇 (-1)'}
                    </span>
                  )}
                  {current && (
                    <span className="v6-stamp-badge v6-stamp--job-active">
                      当前指派: {JOBS.find((j) => j.id === current)?.icon} {JOBS.find((j) => j.id === current)?.label}
                    </span>
                  )}
                </div>

                {committed ? (
                  <div className="v6-committed-banner">
                    <span>✓ 今日任务已锁定执行，无法重新派遣</span>
                  </div>
                ) : (
                  /* 7-Job Tactical Grid */
                  <div className="v6-job-grid">
                    {JOBS.map((job) => {
                      const availability = canTakeDayAssignment(state, survivor.id, job.id);
                      const extraLimit = job.id === 'expedition' && current !== 'expedition' && expeditionCount >= 2;
                      const disabled = !availability.allowed || extraLimit;
                      const isActive = current === job.id;
                      const disabledReason = extraLimit
                        ? '探索队已达上限（最多 2 人）'
                        : availability.reason ?? job.note;

                      return (
                        <button
                          key={job.id}
                          className={`v6-job-btn ${isActive ? 'is-active' : ''}`}
                          disabled={disabled}
                          title={disabled ? disabledReason : job.note}
                          onClick={() =>
                            commit(
                              isActive
                                ? clearDayJob(state, survivor.id)
                                : assignDayJob(state, survivor.id, job.id),
                              setState,
                            )
                          }
                        >
                          <span className="v6-job-icon">{job.icon}</span>
                          <span className="v6-job-label">{job.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// EXPEDITION STATUS (MID-DAY FIELD STATUS)
// ─────────────────────────────────────────────
function ExpeditionStatus({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.expeditionState.departed) return null;
  const party = state.expeditionState.activePartyIds
    .map((id) => state.survivors.find((s) => s.id === id)?.name ?? id)
    .join('、');
  const location =
    EXPEDITION_LOCATIONS.find((item) => item.id === state.expeditionState.locationId)?.name ?? '未知废墟';
  const event = currentExpeditionEvent(state);

  return (
    <section className="v6-section v6-expedition-status-box" aria-label="外出探索队战况">
      <div className="v6-section__head">
        <div>
          <span className="v6-section__tag v6-section__tag--danger">探索队在外行动中</span>
          <h2>{party} · 前往 {location}</h2>
        </div>
        <small className="v6-expedition-locked-tag">今日调遣已锁定</small>
      </div>
      <p className="v6-expedition-msg">
        {event ? `收到前方消息：${event.title}` : '搜寻队伍正在废墟道路中摸索前进……'}
      </p>
      <button className="v6-cta" onClick={() => commit({ ...state, phase: 'expedition' }, setState)}>
        🧭 进入并处理探索决策
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────
// DAY SCREEN — MAIN SURVIVAL WORKBENCH
// ─────────────────────────────────────────────
function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [reviewingDispatch, setReviewingDispatch] = useState(false);
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
      !state.dayState.committedSurvivorIds.includes(s.id),
  ).length;

  const lock = () => {
    const locked = lockDayAssignments(state);
    const pendingExpeditions = Object.entries(locked.dayAssignments).filter(
      ([id, job]) => job === 'expedition' && !locked.dayState.committedSurvivorIds.includes(id),
    ).length;
    commit({ ...locked, phase: pendingExpeditions ? 'expedition' : 'dusk' }, setState);
  };

  return (
    <main className="v6-shell">
      <TopBar state={state} />
      <StreetVisual state={state} />
      <InventoryBar state={state} />
      <ExpeditionStatus state={state} setState={setState} />
      <CommunityPanel state={state} setState={setState} />
      <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} />

      {/* Default Daytime Workspace Panels */}
      {!state.dayState.assignmentsLocked && !reviewingDispatch && (
        <>
          <MissingPanel state={state} setState={setState} />
          <BuildingsPanel state={state} setState={setState} />
          <AssignmentPanel state={state} setState={setState} />
        </>
      )}

      {/* Two-Stage Dispatch Confirmation Dossier */}
      {!state.dayState.assignmentsLocked && reviewingDispatch && (
        <section className="v6-section v6-dispatch-confirm-box" aria-label="最终调遣确认单">
          <div className="v6-section__head">
            <div>
              <span className="v6-section__tag v6-section__tag--danger">战备复核</span>
              <h2>最终确认 · 锁定后今日调遣将不可更改</h2>
            </div>
            <small className="v6-confirm-tally">
              {dispatch.manuallyAssigned} 人手动派发 · {dispatch.autoResting} 人自动静养
            </small>
          </div>

          <div className="v6-survivors">
            {dispatch.entries.map((entry) => (
              <article
                className={`v6-survivor v6-survivor--confirm ${entry.unavailable || entry.committed ? 'is-unavailable' : ''}`}
                key={entry.survivorId}
              >
                <div className="v6-survivor__top">
                  <div className="v6-survivor__profile">
                    <span className="v6-survivor__avatar-stamp">
                      {entry.unavailable ? '⚠️' : entry.automatic ? '💤' : '✅'}
                    </span>
                    <div>
                      <h3 className="v6-survivor__name">{entry.name}</h3>
                      <div className="v6-survivor__trait">
                        {entry.automatic
                          ? '未指定具体岗位，将自动在避难所休息恢复'
                          : entry.committed
                          ? '今日已完成外出或突发行动'
                          : '确认执行指派岗位'}
                      </div>
                    </div>
                  </div>
                  <div className="v6-confirm-job-stamp">
                    <b className="v6-confirm-job-name">{entry.label}</b>
                    <small className="v6-confirm-job-tag">
                      {entry.unavailable ? '不可调遣' : entry.automatic ? '自动休息' : '已核准'}
                    </small>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="v6-preview v6-confirm-preview" style={{ marginTop: 16 }}>
            <div className="v6-preview-block">
              <span className="v6-preview-title">预计供餐补给</span>
              <strong>{mealLabel(meal.quality)}</strong>
              <small>
                炊事效能 {meal.cookingCapacity.toFixed(1)} / 总人口 {meal.residentCount} · 精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
              </small>
            </div>
            <div className="v6-preview-block">
              <span className="v6-preview-title">预计夜防备勤</span>
              <strong>{prep.defense}</strong>
              <small>
                探索 {dispatch.expeditionCount} 人 · 医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}
              </small>
            </div>
          </div>

          <p className="v6-confirm-warning">
            ⚠️ 锁定后，若有探索队将进入地点选择；若无探索人员则直接进入黄昏核对阶段。
          </p>

          <button className="v6-cta" onClick={lock}>
            🔒 确认并锁定今日人员调遣
          </button>
          <button className="v6-link-back" onClick={() => setReviewingDispatch(false)}>
            ← 返回重新调整人员岗位
          </button>
        </section>
      )}

      <MemorialPanel state={state} />

      {/* Previews under Normal View */}
      {!reviewingDispatch && (
        <div className="v6-preview">
          <div className="v6-preview-block">
            <span className="v6-preview-title">预计今晚供餐</span>
            <strong>{mealLabel(meal.quality)}</strong>
            <small>
              炊事效能 {meal.cookingCapacity.toFixed(1)} / 总人口 {meal.residentCount} · 精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
            </small>
          </div>
          <div className="v6-preview-block">
            <span className="v6-preview-title">预计夜间备勤</span>
            <strong>{prep.defense}</strong>
            <small>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</small>
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      {!state.expeditionState.departed && !reviewingDispatch && (
        state.dayState.assignmentsLocked ? (
          <button className="v6-cta" onClick={() => commit({ ...state, phase: 'dusk' }, setState)}>
            🌅 进入黄昏防备阶段
            <small>核对今晚防线、物资消耗与已知风险</small>
          </button>
        ) : (
          <button
            className="v6-cta"
            disabled={!available && !Object.keys(state.dayAssignments).length}
            onClick={() => setReviewingDispatch(true)}
          >
            📋 确认今日人员调遣
            <small>{assigned} 人已明确分工 · 其余队员自动在避难所静养</small>
          </button>
        )
      )}

      {state.lastMessage && <p className="v6-message">{state.lastMessage}</p>}
    </main>
  );
}

// ─────────────────────────────────────────────
// EXPEDITION SCREEN — THE PERILOUS OUTPOST MAP
// ─────────────────────────────────────────────
function ExpeditionScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const assignedIds = state.survivors
    .filter(
      (s) =>
        state.dayAssignments[s.id] === 'expedition' &&
        s.condition !== 'dead' &&
        s.condition !== 'missing' &&
        !state.dayState.committedSurvivorIds.includes(s.id),
    )
    .map((s) => s.id)
    .slice(0, 2);

  const availableLocations = EXPEDITION_LOCATIONS.filter((loc) => isLocationUnlocked(state, loc.id));
  const [party, setParty] = useState<string[]>(assignedIds);
  const [locationId, setLocationId] = useState(
    availableLocations[availableLocations.length - 1]?.id ?? 'convenience-store',
  );
  const event = currentExpeditionEvent(state);
  const risk = expeditionRiskLabel(expeditionRiskScore(state, party, locationId));
  const activeRisk = state.expeditionState.departed
    ? expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, state.expeditionState.locationId ?? locationId))
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
        lastMessage: `${party.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、')}已出发前往搜寻 · 岗位保持锁定`,
      },
      setState,
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
        campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered - 1 },
      };
    }
    commit(
      { ...next, phase: 'dusk', dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds } },
      setState,
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
      setState,
    );
  };

  if (!state.expeditionState.departed) {
    return (
      <main className="v6-shell v6-expedition-shell">
        <TopBar state={state} />
        <header className="v6-page-head">
          <span className="v6-event-stamp">战地外勤 · 探索任务简报</span>
          <h1>选择探索小队与搜寻目标</h1>
          <p className="v6-page-desc">
            废墟深处充满未知的崩塌与潜伏威胁。只有根据情报解锁的据点才允许探索。
          </p>
        </header>
        <InventoryBar state={state} />

        {/* Party Member Slots */}
        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span className="v6-section__tag">小队编组</span>
              <h2>出勤队员 (1–2 人)</h2>
            </div>
            <small>点击成员标签调整出勤人员</small>
          </div>
          <div className="v6-party-grid">
            {assignedIds.map((id) => {
              const survivor = state.survivors.find((item) => item.id === id)!;
              const active = party.includes(id);
              return (
                <button
                  className={`v6-party-card ${active ? 'is-selected' : ''}`}
                  key={id}
                  onClick={() =>
                    setParty((current) =>
                      active ? current.filter((x) => x !== id) : current.length < 2 ? [...current, id] : current,
                    )
                  }
                >
                  <div className="v6-party-card-head">
                    <strong>{survivor.name}</strong>
                    <span className="v6-party-check">{active ? '✓ 已入队' : '+ 待命'}</span>
                  </div>
                  <span className="v6-party-stat">
                    精力 {survivor.energy} · {CONDITION_LABEL[survivor.condition ?? 'healthy']}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Location Selection Map */}
        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span className="v6-section__tag">战术地图</span>
              <h2>已确认搜寻地点</h2>
            </div>
            <div className={`v6-risk-stamp v6-risk-stamp--${risk}`}>
              风险等级: {risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险 ⚠️' : '极险 ☠️'}
            </div>
          </div>

          <div className="v6-locations-grid">
            {availableLocations.map((location) => (
              <button
                className={`v6-location-card ${location.id === locationId ? 'is-active' : ''}`}
                key={location.id}
                onClick={() => setLocationId(location.id)}
              >
                <div className="v6-loc-top">
                  <strong className="v6-loc-name">{location.name}</strong>
                  <span className="v6-loc-danger">危险度 {location.danger}/5</span>
                </div>
                <p className="v6-loc-desc">{location.description}</p>
                <div className="v6-loc-foot">
                  <span>主要产出: <b>{location.primary}</b></span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <button
          className="v6-cta"
          disabled={!party.length || !availableLocations.length}
          onClick={begin}
        >
          🚶‍♂️ 探索小队出发 · 返回主界面
        </button>
        <button className="v6-link-back" onClick={() => commit(reopenDayAssignments(state), setState)}>
          ← 取消并返回调遣界面
        </button>
      </main>
    );
  }

  /* Mid-Expedition Choice Encounter */
  return (
    <main className="v6-shell v6-expedition-shell">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span className="v6-event-stamp">
          探索遭遇 · 风险评级: {activeRisk === 'safe' ? '安全' : activeRisk === 'cautious' ? '谨慎' : activeRisk === 'dangerous' ? '危险' : '极险'}
        </span>
        <h1>{event?.title ?? '小队进入废墟深处'}</h1>
        <p className="v6-page-desc">{event?.body ?? '四周一片死寂，唯有碎石滑落的微响。'}</p>
      </header>

      <section className="v6-expedition-decision-board">
        <button className="v6-decision-card v6-decision--push" onClick={() => finish('push')}>
          <div className="v6-decision-badge">A</div>
          <div className="v6-decision-main">
            <strong>深入搜寻 (Push Forward)</strong>
            <span>承受更高判定压力与风险，力争搜刮更多关键生存物资。</span>
            <div className="v6-decision-tags-wrap">
              <DecisionTags tags={pushPreview.tags} />
              <small className="v6-decision-summary">{pushPreview.summary}</small>
            </div>
          </div>
        </button>

        <button className="v6-decision-card v6-decision--careful" onClick={() => finish('careful')}>
          <div className="v6-decision-badge">B</div>
          <div className="v6-decision-main">
            <strong>谨慎周旋 (Cautious Route)</strong>
            <span>降低行动风险，不追求额外收益，优先保证队员人身安全。</span>
            <div className="v6-decision-tags-wrap">
              <DecisionTags tags={carefulPreview.tags} />
              <small className="v6-decision-summary">{carefulPreview.summary}</small>
            </div>
          </div>
        </button>

        <button className="v6-decision-card v6-decision--retreat" onClick={retreat}>
          <div className="v6-decision-badge">C</div>
          <div className="v6-decision-main">
            <strong>立刻撤离 (Retreat to Base)</strong>
            <span>放弃今日未到手的物资，全员立刻原路撤回避难所。</span>
            <div className="v6-decision-tags-wrap">
              <DecisionTags tags={retreatPreview.tags} />
              <small className="v6-decision-summary">{retreatPreview.summary}</small>
            </div>
          </div>
        </button>
      </section>

      {state.lastMessage && <p className="v6-message">{state.lastMessage}</p>}
    </main>
  );
}

// ─────────────────────────────────────────────
// DUSK SCREEN — OMINOUS TWILIGHT & RISK AUDIT
// ─────────────────────────────────────────────
function DuskScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const committed = hasCommittedDayAction(state);
  const causalSignals = nightCausalSignals(state);

  return (
    <main className="v6-shell v6-shell--dusk">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span className="v6-event-stamp v6-event-stamp--dusk">DUSK · 暮色将至 · DAY {state.day}</span>
        <h1>天黑以后，不再换岗。</h1>
        <p className="v6-page-desc">
          这是白昼向黑夜交接前的最后一次核对。今夜能否挺住，取决于留守人员、设施完备度与余存物资。
        </p>
      </header>
      <InventoryBar state={state} />

      <div className="v6-dusk-audit-grid">
        <article className="v6-dusk-card">
          <span className="v6-dusk-card-tag">今晚供餐状态</span>
          <h2>{mealLabel(meal.quality)}</h2>
          <p>总人口 {meal.residentCount} · 炊事能力 {meal.cookingCapacity.toFixed(1)} · 覆盖率 {Math.round(meal.coverage * 100)}%</p>
          <div className="v6-dusk-stat-pill">
            精力恢复 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
          </div>
        </article>

        <article className="v6-dusk-card">
          <span className="v6-dusk-card-tag">夜防就绪评估</span>
          <h2>防线评估: {prep.defense}</h2>
          <p>医疗待命 {prep.medical} · 设施维护 {prep.repair} · 广播值守 {prep.radio}</p>
          <div className="v6-dusk-stat-pill">
            守备人员与防御工事将显著影响夜间突发威胁判定
          </div>
        </article>
      </div>

      {!!causalSignals.length && (
        <section className="v6-section v6-causal-section">
          <div className="v6-section__head">
            <div>
              <span className="v6-section__tag v6-section__tag--danger">⚠️ 战地因果预警</span>
              <h2>今夜潜伏风险 · 今日决策引发的连锁影响</h2>
            </div>
          </div>
          <div className="v6-causal-list">
            {causalSignals.map((signal) => (
              <div className="v6-causal-bullet" key={signal}>
                <span className="v6-causal-warn-icon">⚠️</span>
                <p>{signal}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <button className="v6-cta v6-cta--night" onClick={() => commit(finalizeDay(state), setState)}>
        🌑 进入长夜防守
        <small>天黑以后所有岗位立即生效 · 夜间事件与威胁判定随即启动</small>
      </button>

      {!committed ? (
        <button className="v6-link-back" onClick={() => commit(reopenDayAssignments(state), setState)}>
          ← 返回日间重新调整人员调遣
        </button>
      ) : (
        <p className="v6-message">今日已执行过外出探索或搜救行动，调遣已锁定不可更改。</p>
      )}

      {state.lastMessage && <p className="v6-message">{state.lastMessage}</p>}
    </main>
  );
}

// ─────────────────────────────────────────────
// DAWN SCREEN — COLD MORNING ROLL CALL & DEBRIEF
// ─────────────────────────────────────────────
function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const brief = dawnBriefEntries(state);
  return (
    <main className="v6-shell v6-shell--dawn">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span className="v6-event-stamp v6-event-stamp--dawn">DAWN · 晨曦破晓 · DAY {state.day}</span>
        <h1>{state.day === 29 ? '最后的黑夜熬过去了。' : '又熬过了一夜，天亮了。'}</h1>
        <p className="v6-page-desc">
          {state.nightState.hordeActive
            ? '尸潮退去以后，街道重见轮廓。昨夜的创伤与代价一一显现。'
            : '发电机的轰鸣压过了远处的风声。废墟里的人还要继续撑下去。'}
        </p>
      </header>
      <InventoryBar state={state} />

      {/* Night Casualty & Progress Tally */}
      <div className="v6-dawn-stats-grid">
        <div className="v6-dawn-stat-card">
          <span>夜间事件处置</span>
          <b>{state.nightState.resolutions.length}</b>
        </div>
        <div className="v6-dawn-stat-card v6-stat-card--danger">
          <span>累计确认死亡</span>
          <b>{state.campaignStats.deaths}</b>
        </div>
        <div className="v6-dawn-stat-card v6-stat-card--warn">
          <span>当前下落不明</span>
          <b>{state.campaignStats.missing}</b>
        </div>
        <div className="v6-dawn-stat-card v6-stat-card--safe">
          <span>累计搜救收容</span>
          <b>{state.campaignStats.rescued}</b>
        </div>
      </div>

      <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} compact />

      {!!brief.length && (
        <section className="v6-section v6-brief-section">
          <div className="v6-section__head">
            <div>
              <span className="v6-section__tag">昨夜战报</span>
              <h2>昨夜决断与事件结果简报</h2>
            </div>
            <small>仅记录真实产生影响的变动</small>
          </div>
          <div className="v6-brief-list">
            {brief.map((entry, index) => (
              <div className="v6-brief-row" key={`${entry}-${index}`}>
                <span className="v6-brief-bullet">◆</span>
                <p>{entry}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <MemorialPanel state={state} />

      <button className="v6-cta" onClick={() => commit(advanceCampaignDay(state), setState)}>
        {state.day === 29 ? '进入 DAY 30 · 终局结算' : `开启 DAY ${state.day + 1} 幸存日志`}
      </button>
    </main>
  );
}

// ─────────────────────────────────────────────
// ENDING SCREEN — THE FINAL SURVIVAL CHRONICLE
// ─────────────────────────────────────────────
function EndingScreen({
  state,
  meta,
  onRestart,
}: {
  state: GameState;
  meta: MetaProgress;
  onRestart: () => void;
}) {
  const ending = state.ending;
  if (!ending) return null;

  return (
    <main className={`v6-shell v6-ending v6-ending--${ending.tier}`}>
      <div className="v6-ending-banner">
        <span className="v6-ending-stamp">DAY 30 · 极夜生存终局结案</span>
        <h1 className="v6-ending-main-title">天亮了。</h1>
      </div>

      <section className="v6-ending-ledger-box">
        <div className="v6-ledger-title">
          <span>过去 29 天街区生存总账</span>
        </div>
        <div className="v6-ledger-grid">
          <div className="v6-ledger-cell">
            <span>救回幸存者</span>
            <b>{state.campaignStats.rescued} 人</b>
          </div>
          <div className="v6-ledger-cell">
            <span>街区现存人口</span>
            <b>{population(state)} 人</b>
            <small>核心 {corePresent(state)} + 居民 {state.civilianResidents}</small>
          </div>
          <div className="v6-ledger-cell">
            <span>确认遇难人数</span>
            <b>{state.campaignStats.deaths} 人</b>
          </div>
          <div className="v6-ledger-cell">
            <span>外勤探索总次</span>
            <b>{state.campaignStats.expeditions} 次</b>
          </div>
          <div className="v6-ledger-cell">
            <span>发现未知据点</span>
            <b>{state.campaignStats.locationsDiscovered} 处</b>
          </div>
          <div className="v6-ledger-cell">
            <span>DAY 29 终战防守</span>
            <b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '未知'}</b>
          </div>
        </div>
      </section>

      <MemorialPanel state={state} />

      <section className="v6-ending-story-card">
        <span className="v6-story-tier-tag">
          {ending.tier === 'secret' ? '★ 隐藏生存结局' : '✦ 达成终局'}
        </span>
        <h2 className="v6-story-title">《{ending.title}》</h2>
        <p className="v6-story-summary">{ending.summary}</p>
      </section>

      {/* Ending Chronicle Gallery */}
      <section className="v6-section v6-gallery-section">
        <div className="v6-section__head">
          <div>
            <span className="v6-section__tag">结局图鉴档案</span>
            <h2>解锁记录 ({meta.endingsUnlocked.length} / {Object.keys(ENDINGS).length})</h2>
          </div>
        </div>
        <div className="v6-gallery-grid">
          {(Object.keys(ENDINGS) as EndingId[]).map((id) => {
            const def = ENDINGS[id];
            const unlocked = meta.endingsUnlocked.includes(id);
            return (
              <div className={`v6-gallery-card ${unlocked ? 'is-unlocked' : 'is-locked'}`} key={id}>
                <strong>{unlocked ? def.title : '？？？？'}</strong>
                <small>{unlocked ? def.tier : endingHint(id)}</small>
              </div>
            );
          })}
        </div>
      </section>

      <button className="v6-cta" onClick={onRestart}>
        🔄 重启新的 30 天极夜轮回
      </button>
    </main>
  );
}

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
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
    if (state.phase === 'street' || state.phase === 'assignment')
      return <DayScreen state={state} setState={setState} />;
    if (state.phase === 'expedition')
      return <ExpeditionScreen state={state} setState={setState} />;
    if (state.phase === 'dusk')
      return <DuskScreen state={state} setState={setState} />;
    if (state.phase === 'night' || state.phase === 'night-summary')
      return <V060NightScene state={state} setState={setState} />;
    if (state.phase === 'summary' || state.phase === 'dawn')
      return <DawnScreen state={state} setState={setState} />;
    if (state.phase === 'ending')
      return <EndingScreen state={state} meta={meta} onRestart={restart} />;
    return <DayScreen state={{ ...state, phase: 'street' }} setState={setState} />;
  }, [state, meta]);

  return <>{screen}</>;
}