import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  assignDayJob,
  canTakeDayAssignment,
  clearDayJob,
  hasCommittedDayAction,
  lockDayAssignments,
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

// ─────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────
const JOBS: Array<{ id: DayAssignment; label: string; icon: string; note: string }> = [
  { id: 'expedition', label: '探索', icon: '⬡', note: '外出搜集物资，可能受伤、失踪或死亡。' },
  { id: 'repair',     label: '维修', icon: '⚙', note: '加固防线，并让工坊在夜里发挥作用。' },
  { id: 'medical',    label: '医疗', icon: '✚', note: '优先处理街区里最严重的伤员。' },
  { id: 'watch',      label: '守备', icon: '◉', note: '降低夜间紧急事件和尸潮风险。' },
  { id: 'radio',      label: '广播', icon: '◎', note: '积累外界联系，寻找幸存者与军方信号。' },
  { id: 'cook',       label: '炊事', icon: '◈', note: '按当前人口提高供餐覆盖率和次日恢复。' },
  { id: 'rest',       label: '休息', icon: '◌', note: '恢复个人精力。' },
];

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤',
  critical: '危重', missing: '失踪', dead: '死亡',
};

// Narrative hope descriptions — no raw number shown
function hopeNarrative(hope: number): string {
  if (hope >= 75) return '街里的人开始互相搭把手。';
  if (hope >= 55) return '没人说什么，但至少今晚还有人坐在一起。';
  if (hope >= 35) return '最近大家吃饭的时候都很安静。';
  if (hope >= 15) return '有人开始问，留下来是不是还有意义。';
  return '没有人说话。连孩子也不哭了。';
}

// Narrative defense descriptions
function defenseNarrative(defense: number): string {
  if (defense >= 80) return '已经加固，今晚有人看着。';
  if (defense >= 55) return '还算稳，但补的地方不少。';
  if (defense >= 35) return '勉强能守，有人在缝隙里塞了布。';
  if (defense >= 15) return '太薄了，风都吹得进来。';
  return '几乎没有防线。';
}

// Narrative condition descriptions
function conditionNarrative(s: GameState['survivors'][0]): string {
  switch (s.condition) {
    case 'critical': return '今晚恐怕起不来了。';
    case 'serious':  return '需要休息，不宜出门。';
    case 'minor':    return '受了点伤，还能动。';
    case 'fatigued': return '昨晚没怎么睡。';
    case 'missing':  return '下落不明。';
    case 'dead':     return '已不在了。';
    default:         return '今天还能出去。';
  }
}

// Condition risk color class
function condColorClass(cond?: SurvivorCondition): string {
  if (cond === 'critical' || cond === 'serious') return '--rust';
  if (cond === 'dead' || cond === 'missing') return '';
  return '';
}

const RESULT_LABEL = {
  perfect: '完美守住', held: '守住', damaged: '严重受损', breached: '街区失守',
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

/** Resource status tier for display-only styling */
function resStatus(value: number, critThreshold: number, warnThreshold: number): 'critical' | 'warning' | 'ok' {
  if (value <= critThreshold) return 'critical';
  if (value <= warnThreshold) return 'warning';
  return 'ok';
}

// Building hotspot narrative descriptions (world-internal)
const BUILDING_HOTSPOT_DESC: Partial<Record<BuildingId, string[]>> = {
  clinic:       ['屋里又加了一张床。', '总有药味散不掉。', '林曼还在里面。'],
  searchStation:['里面一直有人敲东西。', '工具摆得很整齐。', '昨天有人在这里磨刀。'],
  workshop:     ['烟囱今天终了冒烟。', '有人把桌子擦干净了。', '炉子开了。'],
  radio:        ['天线又被风吹歪了一点。', '昨晚收到了一段信号。', '有人整夜守着那个频率。'],
  watchPost:    ['昨晚门又补了一层铁皮。', '门口比昨天稳了一点。', '站岗的人换了。'],
  shelter:      ['里面住了更多人。', '地上铺着借来的毯子。', '孩子的声音少了。'],
};

// Get building hotspot hint based on level
function buildingHint(id: BuildingId, level: number): string {
  if (level === 0) return '还没修复。';
  const hints = BUILDING_HOTSPOT_DESC[id];
  if (!hints?.length) return '有人在这里工作。';
  return hints[level % hints.length];
}

// ─────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────
function TopBar({ state }: { state: GameState }) {
  const phase = state.phase;
  const phaseLabel = phase === 'dusk' ? '黄昏'
    : (phase === 'night' || phase === 'night-summary') ? '夜晚'
    : (phase === 'summary' || phase === 'dawn') ? '黎明'
    : '白天';
  const phaseClass = phase === 'dusk' ? 'dusk'
    : (phase === 'night' || phase === 'night-summary') ? 'night'
    : (phase === 'summary' || phase === 'dawn') ? 'dawn'
    : 'day';

  const pop = population(state);

  return (
    <header className="v6-topbar">
      {/* Left: game title + day */}
      <div className="v6-topbar__brand">
        <span className="v6-game-title">余烬长街</span>
        <div className="v6-day-display">
          <span className="v6-day-label">DAY</span>
          <span className="v6-day-number">{String(state.day).padStart(2, '0')}</span>
          <span className="v6-day-total">/ 30</span>
        </div>
      </div>

      {/* Center: minimal status — no chips, just text */}
      <div className="v6-topbar__status">
        <span className="v6-status-chip">
          <span className="chip-icon">◉</span>
          <span>街区</span>
          <span className="chip-value">{pop} 人</span>
        </span>
        <span className={`v6-status-chip${state.hope <= 15 ? ' v6-status-chip--danger' : ''}`}>
          <span className="chip-icon">◆</span>
          <span className="chip-value">{hopeNarrative(state.hope)}</span>
        </span>
      </div>

      {/* Right: phase + forecast */}
      <div className="v6-topbar__phase">
        <span className={`v6-phase-badge v6-phase-badge--${phaseClass}`}>{phaseLabel}</span>
        <span className="v6-topbar__forecast">
          {state.day === 29 ? '最后的白天' : state.forecast.title}
        </span>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
// STREET VISUAL + HOTSPOTS
// ─────────────────────────────────────────────
function StreetVisual({
  state,
  onBuildingClick,
}: {
  state: GameState;
  onBuildingClick?: (id: BuildingId) => void;
}) {
  const stage = state.mainLightStage;

  // Map building IDs to hotspot positions
  const hotspots: Array<{ id: BuildingId; name: string; cls: string }> = [
    { id: 'clinic',       name: '诊所',  cls: 'clinic' },
    { id: 'workshop',     name: '饭馆',  cls: 'diner' },
    { id: 'searchStation',name: '工坊',  cls: 'main' },
    { id: 'radio',        name: '广播站',cls: 'workshop' },
    { id: 'watchPost',    name: '街口',  cls: 'radio' },
  ];

  const lightDesc = [
    '主灯熄灭',
    '一盏灯还亮着',
    '街区有了光',
    '灯光延伸到街边',
    '整条街还活着',
    '余烬未灭',
  ][Math.min(stage, 5)] ?? '主灯状态未知';

  return (
    <section className={`v6-street v6-street--stage-${stage}`} aria-label="余烬长街">
      <div className="v6-street__sky" />

      {/* Building silhouettes */}
      <div className="v6-bldg v6-bldg--far-l" />
      <div className="v6-bldg v6-bldg--left" />
      <div className="v6-bldg v6-bldg--center" />
      <div className="v6-bldg v6-bldg--right" />
      <div className="v6-bldg v6-bldg--far-r" />

      {/* Wire */}
      <div className="v6-street__wire" />

      {/* Main light pole */}
      <div className="v6-main-light">
        <div className="v6-main-light__pole">
          <div className="v6-main-light__arm" />
          <div className="v6-main-light__head" />
          <div className="v6-main-light__cone" />
        </div>
        <span className="v6-main-light__label">{lightDesc}</span>
      </div>

      <div className="v6-street__road" />

      {/* Meta strip: day / weather */}
      <div className="v6-street__meta">
        <span>DAY {state.day}</span>
        <span>{state.day === 29 ? '最终日' : state.forecast.title}</span>
        <span>居民 {population(state)}</span>
      </div>

      {/* Building hotspots */}
      {onBuildingClick && (
        <div className="v6-street__hotspots" role="group" aria-label="街区建筑">
          {hotspots.map(({ id, name, cls }) => {
            const level = state.buildings[id];
            const hint = buildingHint(id, level);
            return (
              <button
                key={id}
                className={`v6-hotspot v6-hotspot--${cls}`}
                onClick={() => onBuildingClick(id)}
                aria-label={`${name}（Lv${level}）`}
                title={name}
              >
                <div className="v6-hotspot__area" />
                <span className="v6-hotspot__label">{name}</span>
                <span className="v6-hotspot__desc">{hint}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// SURVIVOR STRIP (horizontal photo row)
// ─────────────────────────────────────────────
function SurvivorStrip({ state }: { state: GameState }) {
  const living = state.survivors.filter(
    (s) => s.condition !== 'dead'
  );

  return (
    <div className="v6-survivor-strip" role="list" aria-label="街区人员">
      {living.map((s) => {
        const cond = s.condition ?? 'healthy';
        const initials = s.name.slice(0, 1);
        const colorCls = condColorClass(cond);
        const isMissing = cond === 'missing';
        const isDead = cond === 'dead';
        const committed = state.dayState.committedSurvivorIds.includes(s.id);
        const thumbClass = [
          'v6-survivor-thumb',
          isDead ? 'v6-survivor-thumb--dead' : '',
          isMissing ? 'v6-survivor-thumb--missing' : '',
          committed ? 'is-committed' : '',
        ].filter(Boolean).join(' ');

        const condBarClass = colorCls
          ? `v6-survivor-thumb__cond v6-survivor-thumb__cond${colorCls}`
          : 'v6-survivor-thumb__cond';

        return (
          <div key={s.id} className={thumbClass} role="listitem">
            <div
              className="v6-survivor-thumb__portrait"
              data-initials={initials}
            >
              <div className={condBarClass} />
            </div>
            <span className="v6-survivor-thumb__name">{s.name}</span>
            <span className={`v6-survivor-thumb__status${colorCls ? ' v6-survivor-thumb__status--rust' : ''}`}>
              {conditionNarrative(s)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// INVENTORY BAR — paper ledger style
// ─────────────────────────────────────────────
function ResItem({
  label, value, critAt, warnAt,
}: { label: string; value: number; critAt: number; warnAt: number }) {
  const status = resStatus(value, critAt, warnAt);
  return (
    <div className={`v6-res v6-res--${status}`}>
      <span className="v6-res__label">{label}</span>
      <span className="v6-res__value">{value}</span>
    </div>
  );
}

function InventoryBar({ state }: { state: GameState }) {
  const inv = state.inventory;

  // Build crisis sentence if needed
  const crises: string[] = [];
  if (inv.ration <= 4)  crises.push('口粮快见底了');
  if (inv.medicine <= 2) crises.push('药不够用');
  if (state.defense < 20) crises.push(defenseNarrative(state.defense));

  return (
    <section className="v6-inventory" aria-label="仓房物资">
      <div className="v6-inventory__title">
        <span>仓房</span>
        <small>今天还剩</small>
      </div>
      <div className="v6-resource-groups">
        <ResItem label="口粮" value={inv.ration}    critAt={4}  warnAt={12} />
        <ResItem label="药品" value={inv.medicine}  critAt={2}  warnAt={6}  />
        <ResItem label="电力" value={inv.power}     critAt={3}  warnAt={10} />
        <ResItem label="材料" value={inv.materials} critAt={3}  warnAt={8}  />
        <ResItem label="零件" value={inv.parts}     critAt={2}  warnAt={5}  />
      </div>
      {crises.length > 0 && (
        <p className="v6-crisis-note">
          {crises.join('。') + '。'}
        </p>
      )}
      {state.storyItems.length > 0 && (
        <div className="v6-story-items">
          {state.storyItems.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// COMMUNITY BAR — hope / defense / residents as narrative
// ─────────────────────────────────────────────
function CommunityBar({ state }: { state: GameState }) {
  const pop = population(state);
  return (
    <div className="v6-community-bar">
      <div className="v6-community-bar__item">
        <span className="v6-community-bar__label">街里</span>
        <span className="v6-community-bar__value">{pop} 人</span>
      </div>
      <div className="v6-community-bar__item">
        <span className="v6-community-bar__label">街口</span>
        <span className="v6-community-bar__value">{defenseNarrative(state.defense)}</span>
      </div>
      <span className="v6-community-bar__narrative">
        {hopeNarrative(state.hope)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────
// MEMORIAL PANEL
// ─────────────────────────────────────────────
function MemorialPanel({ state }: { state: GameState }) {
  if (!state.memorials.length) return null;
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>纪念墙</span>
          <h2>这里曾经有人</h2>
        </div>
        <small>{state.memorials.length} 个名字</small>
      </div>
      <div className="v6-survivors">
        {state.memorials.map((entry) => (
          <article className="v6-memorial-card" key={entry.survivorId}>
            <h3>{entry.name}</h3>
            <div className="v6-memorial-meta">DAY {entry.day} · {entry.cause}</div>
            <p>{entry.epitaph}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// CAMPAIGN EVENT SCREEN
// ─────────────────────────────────────────────
function CampaignEventScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const event = pendingCampaignEvent(state);
  if (!event) return null;
  const kind = event.kind === 'character' ? '人物事件'
    : event.kind === 'building' ? '建成事件'
    : event.kind === 'community' ? '社区事件'
    : '探索情报';

  return (
    <main className="v6-shell">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span>{kind} · DAY {state.day}</span>
        <h1>{event.title}</h1>
        <p>{event.body}</p>
      </header>
      <InventoryBar state={state} />
      <section className="v6-section">
        <div className="v6-event-screen-body">
          <p style={{ color: 'var(--ash-pencil)', lineHeight: 1.7 }}>{event.body}</p>
        </div>
        <button className="v6-cta" onClick={() => commit(resolveCampaignEvent(state, event.id), setState)}>
          {event.actionLabel}
        </button>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────
// COMMUNITY PANEL
// ─────────────────────────────────────────────
function CommunityPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>社区协作</span>
          <h2>{summary.activeResidents} 人已安置 · {summary.pendingResidents} 人在安置期</h2>
        </div>
        <small>{summary.unlocked ? `今日轮值：${summary.supportModeLabel}` : '需要 5 名已安置居民'}</small>
      </div>

      <div className="v6-community-grid">
        <div>
          <span>后勤</span>
          <strong>炊事 +{summary.cookingCapacity.toFixed(1)}</strong>
          <small>宿营屋越完善，居民越能解放核心人物</small>
        </div>
        <div>
          <span>维修</span>
          <strong>防线 +{summary.repairDefense}</strong>
          <small>居民处理搬运、封堵和轻度维护</small>
        </div>
        <div>
          <span>守备</span>
          <strong>夜间风险 -{Math.round(summary.nightRiskReduction * 100)}%</strong>
          <small>守夜岗会放大居民守备协作</small>
        </div>
        <div>
          <span>医疗辅助</span>
          <strong>+{summary.medicalAssist}</strong>
          <small>诊疗站 Lv2+ 后可协助照顾轻伤员</small>
        </div>
      </div>

      {summary.unlocked && (
        <div className="v6-mode-grid">
          {(['logistics', 'repair', 'defense'] as const).map((mode) => (
            <button
              key={mode}
              className={summary.supportMode === mode ? 'active' : ''}
              disabled={state.dayState.assignmentsLocked}
              onClick={() => commit(selectCommunitySupportMode(state, mode), setState)}
            >
              {mode === 'logistics' ? '后勤轮值' : mode === 'repair' ? '维修轮值' : '守备轮值'}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────
// BUILDINGS PANEL
// ─────────────────────────────────────────────
function BuildingsPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>街区建设</span>
          <h2>把物资变成能救命的设施</h2>
        </div>
        <small>首次建成会触发固定事件</small>
      </div>
      <div className="v6-buildings">
        {BUILDING_IDS.map((id) => {
          const definition = V060_BUILDINGS[id];
          const level = state.buildings[id];
          const next = definition.levels[level] ?? null;
          const check = canUpgradeBuilding(state, id);
          const isMax = !next;
          const cardClass = `v6-building-card${level === 0 ? ' v6-building-card--lv0' : isMax ? ' v6-building-card--max' : ''}`;

          return (
            <article className={cardClass} key={id}>
              <div className="v6-bldg-header">
                <span className="v6-bldg-name">{definition.name}</span>
                <span className="v6-bldg-level">Lv{level}</span>
              </div>
              <h3>{level ? definition.levels[level - 1].title : '废墟 · 未恢复'}</h3>
              <p>{level ? definition.levels[level - 1].unlock : '这里还没收拾到能用的程度。'}</p>
              {next ? (
                <>
                  <div className="v6-upgrade-cost">
                    还缺：材料 {next.materials}、零件 {next.parts}
                  </div>
                  <button
                    disabled={!check.allowed || state.dayState.assignmentsLocked}
                    onClick={() => commit(upgradeBuilding(state, id), setState)}
                    title={!check.allowed ? check.reason : undefined}
                  >
                    {state.dayState.assignmentsLocked
                      ? '今日派遣已锁定'
                      : check.allowed
                      ? `${level === 0 ? '开始修复' : '继续建设'}`
                      : check.reason}
                  </button>
                </>
              ) : (
                <span className="v6-max">已完成</span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────
// MISSING PERSONS PANEL
// ─────────────────────────────────────────────
function MissingPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const missing = state.survivors.filter((s) => s.condition === 'missing');
  if (!missing.length) return null;
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>失踪者</span>
          <h2>今天要不要去找他们？</h2>
        </div>
        <small>连续两次搜救失败可能确认死亡</small>
      </div>
      <div className="v6-survivors">
        {missing.map((s) => {
          const attempted = state.storyFlags.includes(`missing_search:${s.id}:${state.day}`);
          return (
            <article className="v6-survivor v6-survivor--missing" key={s.id}>
              <div className="v6-survivor__top">
                <div>
                  <h3>{s.name}</h3>
                  <div className="v6-survivor__trait">昨晚以前，他/她还在这条街上。</div>
                </div>
                <div className="v6-survivor__energy">
                  <span className="v6-survivor__energy-val">?</span>
                  <span className="v6-survivor__energy-label">状态</span>
                </div>
              </div>
              <div className="v6-survivor__status">
                <span className="v6-badge--condition v6-badge--missing">失踪</span>
              </div>
              <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ash-muted)', marginBottom: '10px', paddingLeft: '10px', fontStyle: 'italic' }}>
                {attempted ? '今天已经寻找过一次。' : '派两人去找，或者用广播搜救（消耗 5 点电力）。'}
              </p>
              <div className="v6-job-grid">
                <button
                  disabled={attempted}
                  onClick={() => commit(searchForMissing(state, s.id, 'team'), setState)}
                  style={{ gridColumn: '1 / 3' }}
                >
                  {attempted ? '已寻找' : '派两人找'}
                </button>
                <button
                  disabled={attempted || state.buildings.radio <= 0 || state.inventory.power < 5}
                  onClick={() => commit(searchForMissing(state, s.id, 'radio'), setState)}
                  title={state.buildings.radio <= 0 ? '需要广播站' : state.inventory.power < 5 ? '电力不足 5' : '消耗 5 电力'}
                  style={{ gridColumn: '3 / 5' }}
                >
                  广播搜救
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
// ASSIGNMENT PANEL
// ─────────────────────────────────────────────
function AssignmentPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const expeditionCount = Object.values(state.dayAssignments).filter((job) => job === 'expedition').length;
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>今日派遣</span>
          <h2>一个人，一天只做一件主要的事</h2>
        </div>
        <small>黄昏后不可改岗</small>
      </div>
      <div className="v6-survivors">
        {state.survivors
          .filter((s) => s.condition !== 'dead' && s.condition !== 'missing')
          .map((survivor) => {
            const condition = survivor.condition ?? 'healthy';
            const unavailable = condition === 'critical';
            const current = state.dayAssignments[survivor.id];
            const committed = state.dayState.committedSurvivorIds.includes(survivor.id);

            const cardClass = [
              'v6-survivor',
              `v6-survivor--${condition}`,
              unavailable ? 'is-unavailable' : '',
              committed ? 'is-committed' : '',
            ].filter(Boolean).join(' ');

            const conditionBadgeClass = `v6-badge--condition v6-badge--${condition}`;

            return (
              <article className={cardClass} key={survivor.id}>
                <div className="v6-survivor__top">
                  <div>
                    <h3>{survivor.name}</h3>
                    <div className="v6-survivor__trait">
                      {survivor.trait ?? survivor.perk ?? '—'}
                    </div>
                  </div>
                  <div className="v6-survivor__energy">
                    <span className="v6-survivor__energy-val">{survivor.energy}</span>
                    <span className="v6-survivor__energy-label">精力</span>
                  </div>
                </div>

                <div className="v6-survivor__status">
                  <span className={conditionBadgeClass}>{CONDITION_LABEL[condition]}</span>
                  <span className="v6-badge--trust">信任 {survivor.trust ?? 0}</span>
                  {survivor.specialty && (
                    <span className="v6-badge--specialty">{survivor.specialty}</span>
                  )}
                </div>

                {committed && (
                  <p className="v6-survivor__committed-msg">今日行动已完成，无法重新派遣。</p>
                )}

                {!committed && (
                  <div className="v6-job-grid">
                    {JOBS.map((job) => {
                      const availability = canTakeDayAssignment(state, survivor.id, job.id);
                      const extraLimit = job.id === 'expedition' && current !== 'expedition' && expeditionCount >= 2;
                      const disabled = !availability.allowed || extraLimit;
                      const isActive = current === job.id;
                      const disabledReason = extraLimit
                        ? '探索队已满（最多 2 人）'
                        : availability.reason ?? job.note;
                      return (
                        <button
                          key={job.id}
                          className={isActive ? 'active' : ''}
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
                          <span className="job-icon">{job.icon}</span>
                          <span className="job-label">{job.label}</span>
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
// EXPEDITION STATUS
// ─────────────────────────────────────────────
function ExpeditionStatus({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.expeditionState.departed) return null;
  const party = state.expeditionState.activePartyIds
    .map((id) => state.survivors.find((s) => s.id === id)?.name ?? id)
    .join('、');
  const location =
    EXPEDITION_LOCATIONS.find((item) => item.id === state.expeditionState.locationId)?.name ?? '未知地点';
  const event = currentExpeditionEvent(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head">
        <div>
          <span>搜索队外出中</span>
          <h2>{party} · {location}</h2>
        </div>
        <small>今日派遣已锁定</small>
      </div>
      <p style={{ color: 'var(--ash-muted)', fontSize: 'var(--fs-sm)', marginBottom: '12px', fontStyle: 'italic' }}>
        {event ? `途中传来消息：${event.title}` : '搜索队还在路上。'}
      </p>
      <button className="v6-cta" onClick={() => commit({ ...state, phase: 'expedition' }, setState)}>
        处理探索事件
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────
// DAY SCREEN — Main Street home
// ─────────────────────────────────────────────
function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const fixedEvent = !state.expeditionState.departed ? pendingCampaignEvent(state) : null;
  if (fixedEvent) return <CampaignEventScreen state={state} setState={setState} />;

  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
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

      {/* SCENE — the street is the interface */}
      <StreetVisual state={state} onBuildingClick={() => {/* future: open building modal */}} />

      {/* PEOPLE STRIP */}
      <SurvivorStrip state={state} />

      {/* COMMUNITY SUMMARY */}
      <CommunityBar state={state} />

      {/* PHYSICAL INVENTORY */}
      <InventoryBar state={state} />

      {/* ACTIVE GAME SECTIONS */}
      <ExpeditionStatus state={state} setState={setState} />
      <CommunityPanel state={state} setState={setState} />

      {!state.dayState.assignmentsLocked && (
        <>
          <MissingPanel state={state} setState={setState} />
          <BuildingsPanel state={state} setState={setState} />
          <AssignmentPanel state={state} setState={setState} />
        </>
      )}

      <MemorialPanel state={state} />

      {/* Preview */}
      <div className="v6-preview">
        <div>
          <span>预计供餐</span>
          <strong>{mealLabel(meal.quality)}</strong>
          <small>
            炊事 {meal.cookingCapacity.toFixed(1)} / 人口 {meal.residentCount} ·
            精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
          </small>
        </div>
        <div>
          <span>预计夜间准备</span>
          <strong>{prep.defense}</strong>
          <small>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</small>
        </div>
      </div>

      {/* Primary actions */}
      {!state.expeditionState.departed && (
        state.dayState.assignmentsLocked ? (
          <button className="v6-cta" onClick={() => commit({ ...state, phase: 'dusk' }, setState)}>
            进入黄昏
          </button>
        ) : (
          <button
            className="v6-cta"
            disabled={!available && !Object.keys(state.dayAssignments).length}
            onClick={lock}
          >
            确认今日派遣
            <small>{assigned} 已手动安排 · 未安排者自动休息</small>
          </button>
        )
      )}

      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

// ─────────────────────────────────────────────
// EXPEDITION SCREEN
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
  const riskKey = expeditionRiskLabel(expeditionRiskScore(state, party, locationId));

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

  // Narrative risk labels
  const riskNarrative: Record<string, string> = {
    safe:      '最近那里没什么动静。',
    cautious:  '有人在附近见过脚印。',
    dangerous: '昨晚那里响过枪。',
    extreme:   '进去的人没全回来。',
  };

  if (!state.expeditionState.departed) {
    return (
      <main className="v6-shell">
        <TopBar state={state} />
        <header className="v6-page-head">
          <span>白天 · 去哪</span>
          <h1>选择搜索队和已解锁地点</h1>
          <p>新地点不会因为天数自动出现。只有街区事件提供情报以后，它才会进入探索地图。</p>
        </header>
        <InventoryBar state={state} />

        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>谁出去</span>
              <h2>1–2 人出发</h2>
            </div>
            <small>点击成员切换参与状态</small>
          </div>
          <div className="v6-party">
            {assignedIds.map((id) => {
              const survivor = state.survivors.find((item) => item.id === id)!;
              const active = party.includes(id);
              return (
                <button
                  className={active ? 'active' : ''}
                  key={id}
                  onClick={() =>
                    setParty((current) =>
                      active ? current.filter((x) => x !== id) : current.length < 2 ? [...current, id] : current,
                    )
                  }
                >
                  <strong>{survivor.name}</strong>
                  <span>精力 {survivor.energy} · {CONDITION_LABEL[survivor.condition ?? 'healthy']}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>去哪</span>
              <h2>已发现地点</h2>
            </div>
            <span className={`v6-risk v6-risk--${riskKey}`}>
              {riskNarrative[riskKey] ?? riskKey}
            </span>
          </div>
          <div className="v6-locations">
            {availableLocations.map((location) => (
              <button
                className={location.id === locationId ? 'active' : ''}
                key={location.id}
                onClick={() => setLocationId(location.id)}
              >
                <strong>{location.name}</strong>
                <span>{location.description}</span>
                <small>{location.primary} · 危险度 {location.danger}/5</small>
              </button>
            ))}
          </div>
        </section>

        <button
          className="v6-cta"
          disabled={!party.length || !availableLocations.length}
          onClick={begin}
        >
          搜索队出发
        </button>
        <button className="v6-link" onClick={() => commit(reopenDayAssignments(state), setState)}>
          ← 返回派遣
        </button>
      </main>
    );
  }

  // Expedition in progress
  return (
    <main className="v6-shell">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span>探索途中</span>
        <h1>{event?.title ?? '搜索队进入了建筑'}</h1>
        <p>{event?.body ?? '前面没有声音，但没人知道拐角后面有什么。'}</p>
      </header>
      <section className="v6-expedition-choices">
        <button onClick={() => finish('push')}>
          <b>A</b>
          <strong>继续深入</strong>
          <span>更高风险；成功时额外带回主要物资。</span>
        </button>
        <button onClick={() => finish('careful')}>
          <b>B</b>
          <strong>谨慎绕行</strong>
          <span>2D6 获得 +1，但不追求额外收益。</span>
        </button>
        <button onClick={retreat}>
          <b>C</b>
          <strong>立刻撤回</strong>
          <span>今天什么都拿不到，但人会回来。</span>
        </button>
      </section>
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

// ─────────────────────────────────────────────
// DUSK SCREEN
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
        <span>黄昏 · DAY {state.day}</span>
        <h1>天黑以后，不再换岗。</h1>
        <p>这是白天最后一次确认。今晚发生什么，取决于现在留下了谁、修好了什么、物资还剩多少。</p>
      </header>
      <InventoryBar state={state} />

      <div className="v6-dusk-grid">
        <article>
          <span>供餐</span>
          <h2>{mealLabel(meal.quality)}</h2>
          <p>人口 {meal.residentCount} · 炊事 {meal.cookingCapacity.toFixed(1)} · 覆盖 {Math.round(meal.coverage * 100)}%</p>
          <strong>精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}</strong>
        </article>
        <article>
          <span>夜间准备</span>
          <h2>{prep.defense}</h2>
          <p>医疗 {prep.medical} · 维修 {prep.repair} · 广播 {prep.radio}</p>
          <strong>守备和设施会改变随机事件风险</strong>
        </article>
      </div>

      {!!causalSignals.length && (
        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>今晚的因果</span>
              <h2>这些不是固定剧本，而是今天留下的风险</h2>
            </div>
          </div>
          <div className="v6-causal-signals">
            {causalSignals.map((signal) => (
              <p key={signal}>{signal}</p>
            ))}
          </div>
        </section>
      )}

      <button className="v6-cta" onClick={() => commit(finalizeDay(state), setState)}>
        进入夜晚
      </button>
      {!committed ? (
        <button className="v6-link" onClick={() => commit(reopenDayAssignments(state), setState)}>
          ← 返回调整派遣
        </button>
      ) : (
        <p className="v6-message">今日已经执行过探索或搜救，派遣不可再调整。</p>
      )}
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

// ─────────────────────────────────────────────
// DAWN SCREEN
// ─────────────────────────────────────────────
function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const brief = dawnBriefEntries(state);
  return (
    <main className="v6-shell v6-shell--dawn">
      <TopBar state={state} />
      <header className="v6-page-head">
        <span>黎明 · DAY {state.day}</span>
        <h1>{state.day === 29 ? '最后的夜结束了。' : '天亮了。'}</h1>
        <p>
          {state.nightState.hordeActive
            ? '尸潮退去以后，街道重新有了颜色。现在才看得清昨夜留下的损失。'
            : '发电机的声音重新盖过远处的脚步。今天仍然有事要做。'}
        </p>
      </header>
      <InventoryBar state={state} />

      <div className="v6-stats">
        <div>
          <span>夜间事件</span>
          <b>{state.nightState.resolutions.length}</b>
        </div>
        <div>
          <span>死亡</span>
          <b>{state.campaignStats.deaths}</b>
        </div>
        <div>
          <span>失踪</span>
          <b>{state.campaignStats.missing}</b>
        </div>
        <div>
          <span>救回</span>
          <b>{state.campaignStats.rescued}</b>
        </div>
      </div>

      {!!brief.length && (
        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>昨夜简报</span>
              <h2>昨天的选择留下了什么</h2>
            </div>
            <small>只记录真正发生的变化</small>
          </div>
          <div className="v6-brief">
            {brief.map((entry, index) => (
              <p key={`${entry}-${index}`}>{entry}</p>
            ))}
          </div>
        </section>
      )}

      <MemorialPanel state={state} />
      <button className="v6-cta" onClick={() => commit(advanceCampaignDay(state), setState)}>
        {state.day === 29 ? '进入 DAY 30 · 结算' : `开始 DAY ${state.day + 1}`}
      </button>
    </main>
  );
}

// ─────────────────────────────────────────────
// ENDING SCREEN
// ─────────────────────────────────────────────
function EndingScreen({
  state,
  meta,
  onRestart,
}: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending;
  if (!ending) return null;
  return (
    <main className={`v6-ending v6-ending--${ending.tier}`}>
      <div className="v6-ending__day">DAY 30</div>
      <p>天亮了。</p>

      <section className="v6-ending__ledger">
        <div><b>{state.campaignStats.rescued}</b><small>救回的人</small></div>
        <div><b>{population(state)}</b><small>仍在街区</small></div>
        <div><b>{state.campaignStats.deaths}</b><small>确认死亡</small></div>
        <div><b>{state.campaignStats.expeditions}</b><small>探索次数</small></div>
        <div><b>{state.campaignStats.locationsDiscovered}</b><small>发现地点</small></div>
        <div>
          <b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '未知'}</b>
          <small>DAY 29 最终结局</small>
        </div>
      </section>

      <MemorialPanel state={state} />

      <section className="v6-ending__story">
        <span>{ending.tier === 'secret' ? '隐藏结局' : '结局'}</span>
        <h1>《{ending.title}》</h1>
        <p>{ending.summary}</p>
      </section>

      <section className="v6-ending-gallery">
        <div>
          <span>结局记录</span>
          <strong>{meta.endingsUnlocked.length}/13</strong>
        </div>
        <div className="v6-ending-grid">
          {(Object.keys(ENDINGS) as EndingId[]).map((id) => (
            <div className={meta.endingsUnlocked.includes(id) ? 'unlocked' : ''} key={id}>
              <b>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].title : '？？？？'}</b>
              <small>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].tier : endingHint(id)}</small>
            </div>
          ))}
        </div>
      </section>

      <button className="v6-cta" onClick={onRestart}>开始新的 30 天</button>
    </main>
  );
}

// ─────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────
export default function V060AppHotfix() {
  const [state, setState] = useState<GameState>(() => initialRun());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const recorded = useRef<string | null>(null);

  useEffect(() => { saveGame(state); }, [state]);

  useEffect(() => {
    if (
      state.phase !== 'ending' ||
      !state.ending ||
      !state.finalHordeResult ||
      recorded.current === `${state.seed}:${state.ending.id}`
    ) return;
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