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
import { dayAttentionSummary } from './game/v060/dayAttention';
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

const JOBS: Array<{ id: DayAssignment; label: string; note: string }> = [
  { id: 'expedition', label: '探索', note: '趁天亮去街外找吃的、药和还能用的东西。' },
  { id: 'repair', label: '维修', note: '把门、墙和线路再撑一晚。' },
  { id: 'medical', label: '医疗', note: '诊所里还有人等着处理伤口。' },
  { id: 'watch', label: '守备', note: '守着街口，盯住那些不该靠近的动静。' },
  { id: 'radio', label: '广播', note: '把天线架起来，听听这座城里还有谁。' },
  { id: 'cook', label: '炊事', note: '把现有的东西尽量做成一顿热的。' },
  { id: 'rest', label: '休息', note: '让人睡一会儿。今晚可能很长。' },
];

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡',
};
export const SPECIALTY_LABEL: Record<string, string> = {
  search: '熟路',
  repair: '维修熟手',
  medical: '懂医',
  watch: '守夜熟手',
  cook: '会做饭',
  radio: '懂广播',
  rest: '能补位',
};
const BUILDING_CONDITION = ['还没收拾', '刚能用', '收拾得像样', '已经很稳'] as const;
const RESULT_LABEL = { perfect: '完美守住', held: '守住', damaged: '严重受损', breached: '街区失守' } as const;
const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];
const corePresent = (state: GameState) => state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
const population = (state: GameState) => corePresent(state) + state.civilianResidents;
const mainLightLabel = (stage: number) => stage <= 0 ? '熄着' : stage === 1 ? '微亮' : stage === 2 ? '亮得很稳' : '照过街口';
export const buildingConditionLabel = (level: number) => BUILDING_CONDITION[Math.max(0, Math.min(3, level))];
export const mealCoverageLine = (coverage: number) => coverage >= 0.98
  ? '今晚这锅能顾到所有人。'
  : coverage >= 0.8
    ? '今晚这锅能顾到大多数人。'
    : coverage >= 0.6
      ? '今晚会有人得少吃一点。'
      : '今晚这锅明显不够分。';
export const nightPreparationLine = (defense: '薄弱' | '一般' | '良好') => defense === '良好'
  ? '街口今晚看着还算稳。'
  : defense === '一般'
    ? '门能撑，但夜里还得盯紧。'
    : '今晚的门口太薄了。';

function initialRun(): GameState {
  const loaded = loadGame();
  return loaded ? upgradeSaveToV060(loaded) : createV060InitialState();
}

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function DecisionTags({ tags }: { tags: string[] }) {
  return <div className="v6-survivor__status" style={{ margin: '7px 0 2px' }}>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

function hopeNarrative(hope: number): string {
  if (hope >= 75) return '街区还看得到希望';
  if (hope >= 50) return '人心还稳，但撑不了太久';
  if (hope >= 30) return '有人在小声商量离开';
  if (hope >= 15) return '夜里开始有人哭';
  return '几乎没有人说话了';
}

function defenseNarrative(defense: number): string {
  if (defense >= 80) return '已经加固，今晚有人看着';
  if (defense >= 55) return '还算稳，但补的地方不少';
  if (defense >= 35) return '勉强能守，有人在缝隙里塞了布';
  if (defense >= 15) return '太薄了，风都吹得进来';
  return '几乎没有防线';
}

function conditionNarrative(s: GameState['survivors'][0]): string {
  switch (s.condition) {
    case 'critical': return '今晚恐怕起不来了';
    case 'serious':  return '需要休息，不宜出门';
    case 'minor':    return '受了点伤，还能动';
    case 'fatigued': return '昨晚没怎么睡';
    case 'missing':  return '下落不明';
    case 'dead':     return '已不在了';
    default:         return '今天还能出去';
  }
}

function condColorClass(cond?: SurvivorCondition): string {
  if (cond === 'critical' || cond === 'serious') return '--rust';
  return '';
}

function resStatus(value: number, critThreshold: number, warnThreshold: number): 'critical' | 'warning' | 'ok' {
  if (value <= critThreshold) return 'critical';
  if (value <= warnThreshold) return 'warning';
  return 'ok';
}

const BUILDING_HOTSPOT_DESC: Partial<Record<BuildingId, string[]>> = {
  clinic:       ['屋里又加了一张床。', '总有药味散不掉。', '林曼还在里面。'],
  searchStation:['里面一直有人敲东西。', '工具摆得很整齐。', '昨天有人在这里磨刀。'],
  workshop:     ['烟囱今天终于冒烟。', '有人把桌子擦干净了。', '炉子开了。'],
  radio:        ['天线又被风吹歪了一点。', '昨晚收到了一段信号。', '有人整夜守着那个频率。'],
  watchPost:    ['昨晚门又补了一层铁皮。', '门口比昨天稳了一点。', '站岗的人换了。'],
  shelter:      ['里面住了更多人。', '地上铺着借来的毯子。', '孩子的声音少了。'],
};

function buildingHint(id: BuildingId, level: number): string {
  if (level === 0) return '还没收拾';
  const hints = BUILDING_HOTSPOT_DESC[id];
  if (!hints?.length) return '有人在这里工作。';
  return hints[(level - 1) % hints.length];
}

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
      <div className="v6-topbar__brand">
        <span className="v6-game-title">余烬长街</span>
        <div className="v6-day-display">
          <span className="v6-day-label">DAY</span>
          <span className="v6-day-number">{String(state.day).padStart(2, '0')}</span>
          <span className="v6-day-total">/ 30</span>
        </div>
      </div>

      <div className="v6-topbar__status">
        <span className="v6-status-chip">
          <span className="chip-icon">👥</span>
          <span>街区</span>
          <span className="chip-value">{pop} 人</span>
        </span>
        <span className={`v6-status-chip${state.hope <= 15 ? ' v6-status-chip--danger' : ''}`}>
          <span className="chip-icon">🕯</span>
          <span className="chip-value">{hopeNarrative(state.hope)}</span>
        </span>
      </div>

      <div className="v6-topbar__phase">
        <span className={`v6-phase-badge v6-phase-badge--${phaseClass}`}>{phaseLabel}</span>
        <span className="v6-topbar__forecast">
          {state.day === 29 ? '最后的白天' : state.forecast.title}
        </span>
      </div>
    </header>
  );
}

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
  const crises: string[] = [];
  if (inv.ration <= 4)  crises.push('口粮快见底了');
  if (inv.medicine <= 2) crises.push('药不够用');
  if (state.defense < 20) crises.push(defenseNarrative(state.defense));

  return (
    <section className="v6-inventory" aria-label="街区仓房">
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
          {crises.join(' · ') + '。'}
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

function SurvivorStrip({ state }: { state: GameState }) {
  const living = state.survivors.filter((s) => s.condition !== 'dead');

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
            <div className="v6-survivor-thumb__portrait" data-initials={initials}>
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

function CommunityBar({ state }: { state: GameState }) {
  const pop = population(state);
  return (
    <div className="v6-community-bar">
      <div className="v6-community-bar__item">
        <span className="v6-community-bar__label">街里</span>
        <span className="v6-community-bar__val">{pop} 人</span>
        <span className="v6-community-bar__sub">（熟面孔 {corePresent(state)} · 居民 {state.civilianResidents}）</span>
      </div>
      <div className="v6-community-bar__item">
        <span className="v6-community-bar__label">希望</span>
        <span className="v6-community-bar__val">{state.hope}</span>
        <span className="v6-community-bar__sub">{hopeNarrative(state.hope)}</span>
      </div>
      <div className="v6-community-bar__item">
        <span className="v6-community-bar__label">防线</span>
        <span className="v6-community-bar__val">{Math.round(state.defense)}</span>
        <span className="v6-community-bar__sub">{defenseNarrative(state.defense)}</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STREET SCENE ART INTERFACE
// ─────────────────────────────────────────────
interface StreetSceneArtProps {
  stage: number; // 0–5 main light stage
}
function StreetSceneArt({ stage: _stage }: StreetSceneArtProps) {
  return (
    <>
      <div className="v6-bldg v6-bldg--far-l"  data-art-slot="bldg-far-l"  />
      <div className="v6-bldg v6-bldg--left"   data-art-slot="bldg-left"   />
      <div className="v6-bldg v6-bldg--center" data-art-slot="bldg-center" />
      <div className="v6-bldg v6-bldg--right"  data-art-slot="bldg-right"  />
      <div className="v6-bldg v6-bldg--far-r"  data-art-slot="bldg-far-r"  />
      <div className="v6-street__wire"          data-art-slot="wire"        />
      <div className="v6-main-light" data-art-slot="main-light">
        <div className="v6-main-light__pole">
          <div className="v6-main-light__arm" />
          <div className="v6-main-light__head" />
          <div className="v6-main-light__cone" />
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// BUILDING HOTSPOTS
// ─────────────────────────────────────────────
const BUILDING_HOTSPOTS: Array<{ id: BuildingId; name: string; cls: string }> = [
  { id: 'clinic',        name: '诊疗站',  cls: 'clinic'        },
  { id: 'workshop',      name: '修理工坊',cls: 'workshop-bldg' },
  { id: 'searchStation', name: '搜索站',  cls: 'search'        },
  { id: 'radio',         name: '广播亭',  cls: 'radio-bldg'    },
  { id: 'watchPost',     name: '守夜岗',  cls: 'watch'         },
  { id: 'shelter',       name: '宿营屋',  cls: 'shelter-bldg'  },
];

function StreetVisual({
  state,
  selectedBuilding,
  onBuildingClick,
}: {
  state: GameState;
  selectedBuilding?: BuildingId | null;
  onBuildingClick?: (id: BuildingId) => void;
}) {
  const stage = state.mainLightStage;
  const lightDesc = ['主灯熄灭','一盏灯还亮着','街区有了光','灯光延伸到街边','整条街还活着','余烬未灭'][Math.min(stage, 5)] ?? '主灯状态未知';

  return (
    <section className={`v6-street v6-street--stage-${stage}`} aria-label="余烬长街">
      <div className="v6-street__sky" />
      <StreetSceneArt stage={stage} />
      <div className="v6-street__road" />
      <span className="v6-main-light__label">{lightDesc}</span>
      <div className="v6-street__meta">
        <span>DAY {state.day}</span>
        <span>{state.day === 29 ? '最终日' : state.forecast.title}</span>
        <span>街里 {population(state)} 人</span>
      </div>
      {onBuildingClick && (
        <div className="v6-street__hotspots" role="group" aria-label="街区建筑">
          {BUILDING_HOTSPOTS.map(({ id, name, cls }) => {
            const level = state.buildings[id];
            const hint = buildingHint(id, level);
            const isActive = selectedBuilding === id;
            return (
              <button
                key={id}
                className={`v6-hotspot v6-hotspot--${cls}${isActive ? ' v6-hotspot--active' : ''}`}
                onClick={() => onBuildingClick(id)}
                aria-label={`${name}（Lv${level}）`}
                aria-pressed={isActive}
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

function BuildingFocusPanel({
  id,
  state,
  setState,
  onClose,
}: {
  id: BuildingId;
  state: GameState;
  setState: (s: GameState) => void;
  onClose: () => void;
}) {
  const definition = V060_BUILDINGS[id];
  const level = state.buildings[id] ?? 0;
  const next = definition.levels[level] ?? null;
  const check = canUpgradeBuilding(state, id);
  const hint = buildingHint(id, level);

  return (
    <section className="v6-building-focus">
      <div className="v6-building-focus__head">
        <div>
          <span className="v6-building-focus__tag">{definition.name}</span>
          <span className="v6-building-focus__lv">Lv{level} · {buildingConditionLabel(level)}</span>
        </div>
        <button className="v6-building-focus__close" onClick={onClose} aria-label="关闭">✕</button>
      </div>
      <p className="v6-building-focus__desc">
        {level ? definition.levels[level - 1].unlock : '现在只剩一副空架子。收拾出来，天黑前也许能派上用场。'}
      </p>
      <p className="v6-building-focus__hint">{hint}</p>
      {next ? (
        <>
          <div className="v6-building-focus__cost">
            下一阶段（{buildingConditionLabel(next.level)}）：材料 {next.materials} · 零件 {next.parts}
          </div>
          <button
            className="v6-cta v6-cta--sm"
            disabled={!check.allowed || state.dayState.assignmentsLocked}
            onClick={() => commit(upgradeBuilding(state, id), setState)}
            title={!check.allowed ? check.reason : undefined}
          >
            {state.dayState.assignmentsLocked
              ? '今天的人手已经定了'
              : check.allowed
              ? `${level === 0 ? '把这里收拾出来' : '继续加固'} · ${buildingConditionLabel(next.level)}`
              : check.reason}
          </button>
        </>
      ) : (
        <strong className="v6-max">已经收拾到头了 ✓</strong>
      )}
    </section>
  );
}

function MemorialPanel({ state }: { state: GameState }) {
  if (!state.memorials.length) return null;
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>纪念墙</span><h2>这里曾经有人</h2></div><small>{state.memorials.length} 个名字</small></div>
      <div className="v6-survivors">{state.memorials.map((entry) => (
        <article className="v6-survivor" key={entry.survivorId}><div className="v6-survivor__top"><div><h3>{entry.name}</h3><span>DAY {entry.day} · {entry.cause}</span></div></div><p>{entry.epitaph}</p></article>
      ))}</div>
    </section>
  );
}

function CampaignEventScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const event = pendingCampaignEvent(state);
  if (!event) return null;
  const kind = event.kind === 'character' ? '有人找你' : event.kind === 'building' ? '街上有了新动静' : event.kind === 'community' ? '街里的人' : '带回来的消息';
  const subtitle = event.kind === 'location'
    ? '这条路，现在有人知道怎么走了'
    : event.kind === 'building'
      ? '今晚开始，这里终于能派上用场'
      : event.kind === 'community'
        ? '这里越来越不像临时落脚的地方'
        : '有些话，只有真正留下以后才会说';
  return (
    <main className="v6-shell">
      <header className="v6-page-head"><span>{kind} · DAY {state.day}</span><h1>{event.title}</h1><p>{event.body}</p></header>
      <InventoryBar state={state}/>
      <section className="v6-section">
        <div className="v6-section__head"><div><span>{kind}</span><h2>{subtitle}</h2></div></div>
        <button className="v6-cta" onClick={() => commit(resolveCampaignEvent(state, event.id), setState)}>{event.actionLabel}</button>
      </section>
    </main>
  );
}

function CommunityPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>街里的人手</span><h2>{summary.activeResidents} 人已经能搭把手 · {summary.pendingResidents} 人还没缓过来</h2></div><small>{summary.unlocked ? `今天大家在帮：${summary.supportModeLabel}` : '等人手再多一点，才轮得开'}</small></div>
      <section className="v6-preview">
        <div><span>饭馆</span><strong>{summary.cookingCapacity > 0 ? `能多顾到约 ${summary.cookingCapacity.toFixed(1)} 人份` : '还腾不出额外人手'}</strong><small>有人帮着洗、切、分餐，锅里的东西更容易顾全。</small></div>
        <div><span>修补</span><strong>{summary.repairDefense > 0 ? '今晚能多补一轮薄弱处' : '今天还轮不开额外修补'}</strong><small>{summary.repairDefense > 0 ? `防线 +${summary.repairDefense} · ` : ''}搬铁皮、递工具、堵住松开的缝。</small></div>
        <div><span>街口</span><strong>{summary.nightRiskReduction > 0 ? '夜里的岗能轮得更开' : '今晚还是得靠原来的人盯着'}</strong><small>{summary.nightRiskReduction > 0 ? `夜间风险 -${Math.round(summary.nightRiskReduction * 100)}% · ` : ''}门口多一双眼睛，就少一点没人看见的空当。</small></div>
        <div><span>诊所</span><strong>{summary.medicalAssist > 0 ? `能多照看 ${summary.medicalAssist} 个轻伤的人` : '还腾不出额外照护人手'}</strong><small>有人递药、换水、看着轻伤，懂医的人才能把手留给更重的伤。</small></div>
      </section>
      {summary.unlocked && <div className="v6-job-grid">
        {(['logistics', 'repair', 'defense'] as const).map((mode) => <button key={mode} className={summary.supportMode === mode ? 'active' : ''} disabled={state.dayState.assignmentsLocked} onClick={() => commit(selectCommunitySupportMode(state, mode), setState)}>{mode === 'logistics' ? '去饭馆搭手' : mode === 'repair' ? '帮着修补' : '去街口轮值'}</button>)}
      </div>}
    </section>
  );
}

function BuildingsPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>街区建设</span><h2>能修起来的地方，就别让它继续烂着</h2></div><small>第一次重新开门，总会有人过来看</small></div>
      <div className="v6-buildings">{BUILDING_IDS.map((id) => {
        const definition = V060_BUILDINGS[id];
        const level = state.buildings[id];
        const next = definition.levels[level] ?? null;
        const check = canUpgradeBuilding(state, id);
        return (
          <article className="v6-building-card" key={id}>
            <div><span>{definition.name}</span><b>{buildingConditionLabel(level)}</b></div>
            <h3>{level ? definition.levels[level - 1].title : '还没收拾'}</h3>
            <p>{level ? definition.levels[level - 1].unlock : '现在只剩一副空架子。收拾出来，天黑前也许能派上用场。'}</p>
            {next ? <><small>还缺：材料 {next.materials} · 零件 {next.parts}</small><button disabled={!check.allowed || state.dayState.assignmentsLocked} onClick={() => commit(upgradeBuilding(state, id), setState)}>{state.dayState.assignmentsLocked ? '今天的人手已经定了' : check.allowed ? `${level === 0 ? '把这里收拾出来' : '继续加固'} · ${buildingConditionLabel(next.level)}` : check.reason}</button></> : <strong className="v6-max">已经收拾到头了</strong>}
          </article>
        );
      })}</div>
    </section>
  );
}

function MissingPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const missing = state.survivors.filter((s) => s.condition === 'missing');
  if (!missing.length) return null;
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>没回来的人</span><h2>还有人没回来</h2></div><small>再拖一天，留下的痕迹只会更少</small></div>
      <div className="v6-survivors">{missing.map((s) => {
        const attempted = state.storyFlags.includes(`missing_search:${s.id}:${state.day}`);
        const teamPreview = missingSearchPreview(state, s.id, 'team');
        const radioPreview = missingSearchPreview(state, s.id, 'radio');
        const teamUnavailable = teamPreview.tags.includes('人员不足');
        return (
          <article className="v6-survivor" key={s.id}>
            <div className="v6-survivor__top"><div><h3>{s.name}</h3><span>昨晚以前，还能在这条街上看见这个人。</span></div><div><b>?</b><small>没消息</small></div></div>
            <p>{attempted ? '今天已经出去找过一次了。' : '地上还能找脚印，广播也还能喊名字。只是两条路都要付代价。'}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <button className="v6-link" style={{ width: '100%', textAlign: 'left', margin: 0 }} disabled={attempted || teamUnavailable} onClick={() => commit(searchForMissing(state, s.id, 'team'), setState)}>
                <strong>派两个人沿路找</strong><DecisionTags tags={teamPreview.tags}/><small>{teamPreview.summary}</small>
              </button>
              <button className="v6-link" style={{ width: '100%', textAlign: 'left', margin: 0 }} disabled={attempted || state.buildings.radio <= 0 || state.inventory.power < 5} onClick={() => commit(searchForMissing(state, s.id, 'radio'), setState)}>
                <strong>在广播里喊名字</strong><DecisionTags tags={radioPreview.tags}/><small>{radioPreview.summary}</small>
              </button>
            </div>
          </article>
        );
      })}</div>
    </section>
  );
}

function AssignmentPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const expeditionCount = Object.values(state.dayAssignments).filter((job) => job === 'expedition').length;
  const criticalCount = state.survivors.filter((survivor) => survivor.condition === 'critical').length;
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>今日派遣</span><h2>天黑以前，每个人都得有个去处</h2></div><small>{criticalCount ? `${criticalCount} 人伤得太重，今天动不了 · ` : ''}太阳落下以后，就没人能换班了</small></div>
      <div className="v6-survivors">{state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').map((survivor) => {
        const condition = survivor.condition ?? 'healthy';
        const unavailable = condition === 'critical';
        const current = state.dayAssignments[survivor.id];
        const committed = state.dayState.committedSurvivorIds.includes(survivor.id);
        return (
          <article className={`v6-survivor ${unavailable || committed ? 'is-unavailable' : ''}`} key={survivor.id}>
            <div className="v6-survivor__top"><div><h3>{survivor.name}</h3><span>{committed ? '今天已经忙过一趟了' : survivor.trait ?? survivor.perk}</span></div><div><b>{survivor.energy}</b><small>精力</small></div></div>
            <div className="v6-survivor__status"><span>{CONDITION_LABEL[condition]}</span><span>信任 {survivor.trust ?? 0}</span><span>{SPECIALTY_LABEL[survivor.specialty] ?? '能搭把手'}</span></div>
            <div className="v6-job-grid">{JOBS.map((job) => {
              const availability = canTakeDayAssignment(state, survivor.id, job.id);
              const extraLimit = job.id === 'expedition' && current !== 'expedition' && expeditionCount >= 2;
              const disabled = !availability.allowed || extraLimit;
              return <button key={job.id} className={current === job.id ? 'active' : ''} disabled={disabled} title={extraLimit ? '一趟最多两个人出去' : availability.reason ?? job.note} onClick={() => commit(current === job.id ? clearDayJob(state, survivor.id) : assignDayJob(state, survivor.id, job.id), setState)}>{job.label}</button>;
            })}</div>
          </article>
        );
      })}</div>
    </section>
  );
}

function ExpeditionStatus({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  if (!state.expeditionState.departed) return null;
  const party = state.expeditionState.activePartyIds.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、');
  const location = EXPEDITION_LOCATIONS.find((item) => item.id === state.expeditionState.locationId)?.name ?? '未知地点';
  const event = currentExpeditionEvent(state);
  return (
    <section className="v6-section">
      <div className="v6-section__head"><div><span>外出的人还没回来</span><h2>{party} · {location}</h2></div><small>今天的人手已经定了</small></div>
      <p>{event ? `途中传来消息：${event.title}` : '他们还在路上。'}</p>
      <button className="v6-cta" onClick={() => commit({ ...state, phase: 'expedition' }, setState)}>去看他们传回来的消息</button>
    </section>
  );
}

function DayScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingId | null>(null);
  const [showAssignments, setShowAssignments] = useState(false);
  const [reviewingDispatch, setReviewingDispatch] = useState(false);
  const fixedEvent = !state.expeditionState.departed ? pendingCampaignEvent(state) : null;
  if (fixedEvent) return <CampaignEventScreen state={state} setState={setState}/>;

  const handleBuildingClick = (id: BuildingId) => {
    setSelectedBuilding((prev) => (prev === id ? null : id));
  };

  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const dispatch = previewDispatchConfirmation(state);
  const attention = dayAttentionSummary(state);
  const assigned = Object.keys(state.dayAssignments).length;
  const available = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing' && s.condition !== 'critical' && !state.dayState.committedSurvivorIds.includes(s.id)).length;
  const lock = () => {
    const locked = lockDayAssignments(state);
    const pendingExpeditions = Object.entries(locked.dayAssignments).filter(([id, job]) => job === 'expedition' && !locked.dayState.committedSurvivorIds.includes(id)).length;
    commit({ ...locked, phase: pendingExpeditions ? 'expedition' : 'dusk' }, setState);
  };

  return (
    <main className="v6-shell">
      <TopBar state={state} />

      {/* ── STREET SCENE: the street is the interface ── */}
      <StreetVisual
        state={state}
        selectedBuilding={selectedBuilding}
        onBuildingClick={handleBuildingClick}
      />

      {/* ── BUILDING FOCUS: contextual panel on hotspot click ── */}
      {selectedBuilding && (
        <BuildingFocusPanel
          id={selectedBuilding}
          state={state}
          setState={setState}
          onClose={() => setSelectedBuilding(null)}
        />
      )}

      {/* ── PEOPLE STRIP ── */}
      <SurvivorStrip state={state} />

      {/* ── COMMUNITY BAR ── */}
      <CommunityBar state={state} />

      {/* ── PHYSICAL INVENTORY ── */}
      <InventoryBar state={state} />

      {/* ── EXPEDITION IN PROGRESS ── */}
      <ExpeditionStatus state={state} setState={setState}/>

      {/* ── CONTEXTUAL: MISSING PERSONS ── */}
      {!state.dayState.assignmentsLocked && !reviewingDispatch && attention.missingCount > 0 && (
        <MissingPanel state={state} setState={setState}/>
      )}

      {/* ── CONTEXTUAL: SOCIAL ATTENTION ── */}
      {!reviewingDispatch && attention.socialNeedsAttention && (
        <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)}/>
      )}

      {/* ── CONTEXTUAL: COMMUNITY CHOICE ── */}
      {!state.dayState.assignmentsLocked && !reviewingDispatch && attention.communityNeedsChoice && (
        <CommunityPanel state={state} setState={setState}/>
      )}

      {/* ── ASSIGNMENT PANEL: collapsible ── */}
      {!state.dayState.assignmentsLocked && !reviewingDispatch && (
        <div className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>今日派遣</span>
              <h2>天黑以前，每个人都得有个去处</h2>
            </div>
            <button
              className="v6-section__toggle"
              onClick={() => setShowAssignments((v) => !v)}
            >
              {showAssignments ? '收起 ↑' : '展开派遣 ↓'}
            </button>
          </div>
          {showAssignments && <AssignmentPanel state={state} setState={setState}/>}
        </div>
      )}

      {/* ── REVIEWING DISPATCH (when confirming assignments) ── */}
      {!state.dayState.assignmentsLocked && reviewingDispatch && (
        <section className="v6-section">
          <div className="v6-section__head">
            <div>
              <span>天快黑了</span>
              <h2>最后再看一眼，今天每个人去了哪里</h2>
            </div>
            <small>
              {dispatch.manuallyAssigned} 人有安排 · {dispatch.autoResting} 人留下休息
              {attention.buildableCount ? ` · 还有 ${attention.buildableCount} 处地方今天能收拾` : ''}
            </small>
          </div>
          <div className="v6-survivors">
            {dispatch.entries.map((entry) => (
              <article
                className={`v6-survivor ${entry.unavailable || entry.committed ? 'is-unavailable' : ''}`}
                key={entry.survivorId}
              >
                <div className="v6-survivor__top">
                  <div>
                    <h3>{entry.name}</h3>
                    <span>
                      {entry.automatic
                        ? '今天没人叫他/她出门'
                        : entry.committed
                        ? '今天已经忙过一趟了'
                        : '今天就去这里'}
                    </span>
                  </div>
                  <div>
                    <b>{entry.label}</b>
                    <small>{entry.unavailable ? '去不了' : entry.automatic ? '留下' : '定了'}</small>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <section className="v6-preview">
            <div>
              <span>今晚锅里</span>
              <strong>{mealLabel(meal.quality)}</strong>
              <small>{mealCoverageLine(meal.coverage)}</small>
              <small>
                约 {meal.cookingCapacity.toFixed(1)} 人份 / 街里 {meal.residentCount} 人 · 明早精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}
              </small>
            </div>
            <div>
              <span>夜里靠什么</span>
              <strong>{nightPreparationLine(prep.defense)}</strong>
              <small>
                防线 {prep.defense} · 出门 {dispatch.expeditionCount} 人 · 诊所 {prep.medical} · 修补 {prep.repair} · 广播 {prep.radio}
              </small>
            </div>
          </section>
          <p className="v6-message">
            没人安排的，就留在屋里歇一歇。出去搜索的人会先去挑今天要走的路；没有人出门，就直接等天黑。
          </p>
          {attention.buildableCount > 0 && (
            <p className="v6-message">
              街里还有 {attention.buildableCount} 处地方今天能继续收拾。要先动它们，就现在回去。
            </p>
          )}
          <button className="v6-cta" onClick={lock}>
            就这么定了
          </button>
          <button className="v6-link" onClick={() => setReviewingDispatch(false)}>
            ← 再改一遍
          </button>
        </section>
      )}

      {/* ── FORECAST STRIP: condensed single line ── */}
      {!reviewingDispatch && (
        <div className="v6-forecast-strip">
          <span>今晚预计：{mealLabel(meal.quality)} · 防线 {prep.defense}</span>
          <span className="v6-forecast-strip__detail">
            {mealCoverageLine(meal.coverage)} · 明早精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta} · 诊所 {prep.medical} · 修补 {prep.repair} · 广播 {prep.radio}
          </span>
        </div>
      )}

      {/* ── PRIMARY ACTION ── */}
      {!state.expeditionState.departed && !reviewingDispatch && (
        state.dayState.assignmentsLocked ? (
          <button className="v6-cta" onClick={() => commit({ ...state, phase: 'dusk' }, setState)}>
            等天黑
          </button>
        ) : (
          <button
            className="v6-cta"
            disabled={!available && !Object.keys(state.dayAssignments).length}
            onClick={() => setReviewingDispatch(true)}
          >
            安排好了
            <small>
              {assigned} 人有安排 · 其余人休息{attention.buildableCount ? ` · 还有 ${attention.buildableCount} 处能收拾` : ''}
            </small>
          </button>
        )
      )}

      {/* ── SECONDARY PANELS ── */}
      {!reviewingDispatch && !attention.communityNeedsChoice && (
        <CommunityPanel state={state} setState={setState}/>
      )}
      {!reviewingDispatch && !attention.socialNeedsAttention && (
        <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} compact/>
      )}
      <MemorialPanel state={state}/>
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

function ExpeditionScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const assignedIds = state.survivors
    .filter((s) => state.dayAssignments[s.id] === 'expedition' && s.condition !== 'dead' && s.condition !== 'missing' && !state.dayState.committedSurvivorIds.includes(s.id))
    .map((s) => s.id)
    .slice(0, 2);
  const availableLocations = EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
  const [party, setParty] = useState<string[]>(assignedIds);
  const [locationId, setLocationId] = useState(availableLocations[availableLocations.length - 1]?.id ?? 'convenience-store');
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
    commit({ ...next, phase: 'street', lastMessage: `${party.map((id) => state.survivors.find((s) => s.id === id)?.name ?? id).join('、')}已经出发。今天剩下的人手不会再改。` }, setState);
  };

  const finish = (stance: 'push' | 'careful') => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const wasFirstVisit = state.expeditionState.locationId ? !state.storyFlags.includes(`visited:${state.expeditionState.locationId}`) : false;
    let next = resolveExpeditionStance(state, stance);
    const committedSurvivorIds = [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])];
    if (wasFirstVisit && next.campaignStats.locationsDiscovered > 0) next = { ...next, campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered - 1 } };
    commit({ ...next, phase: 'dusk', dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds } }, setState);
  };

  const retreat = () => {
    const partyIds = [...state.expeditionState.activePartyIds];
    const next = retreatCurrentExpedition(state);
    commit({ ...next, phase: 'dusk', dayState: { ...next.dayState, assignmentsLocked: true, committedSurvivorIds: [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])] } }, setState);
  };

  if (!state.expeditionState.departed) {
    return (
      <main className="v6-shell">
        <header className="v6-page-head"><span>白天 · 出门</span><h1>今天往哪边走</h1><p>地图上没有凭空多出来的路。每一个能去的地方，都来自有人见过、听过，或者活着回来过。</p></header>
        <InventoryBar state={state}/>
        <section className="v6-section"><div className="v6-section__head"><div><span>同行的人</span><h2>最多两人</h2></div></div><div className="v6-party">{assignedIds.map((id) => {
          const survivor = state.survivors.find((item) => item.id === id)!;
          const active = party.includes(id);
          return <button className={active ? 'active' : ''} key={id} onClick={() => setParty((current) => active ? current.filter((x) => x !== id) : current.length < 2 ? [...current, id] : current)}><strong>{survivor.name}</strong><span>精力 {survivor.energy} · {CONDITION_LABEL[survivor.condition ?? 'healthy']}</span></button>;
        })}</div></section>
        <section className="v6-section"><div className="v6-section__head"><div><span>手里的路线</span><h2>这些地方有人去过</h2></div><strong className={`v6-risk v6-risk--${risk}`}>{risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险' : '极险'}</strong></div><div className="v6-locations">{availableLocations.map((location) => <button className={location.id === locationId ? 'active' : ''} key={location.id} onClick={() => setLocationId(location.id)}><strong>{location.name}</strong><span>{location.description}</span><small>可能找到：{location.primary} · 风险 {location.danger}/5</small></button>)}</div></section>
        <button className="v6-cta" disabled={!party.length || !availableLocations.length} onClick={begin}>出发</button>
        <button className="v6-link" onClick={() => commit(reopenDayAssignments(state), setState)}>← 回去重新安排</button>
      </main>
    );
  }

  return (
    <main className="v6-shell">
      <header className="v6-page-head"><span>街外 · {activeRisk === 'safe' ? '安全' : activeRisk === 'cautious' ? '谨慎' : activeRisk === 'dangerous' ? '危险' : '极险'}</span><h1>{event?.title ?? '搜索队进入了建筑'}</h1><p>{event?.body ?? '前面没有声音，但没人知道拐角后面有什么。'}</p></header>
      <section className="v6-expedition-choices">
        <button onClick={() => finish('push')}><b>A</b><strong>继续深入</strong><span>再往里走，也许还能带回更多。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={pushPreview.tags}/><small>{pushPreview.summary}</small></div></button>
        <button onClick={() => finish('careful')}><b>B</b><strong>谨慎绕行</strong><span>绕开动静大的地方，不贪那一点。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={carefulPreview.tags}/><small>{carefulPreview.summary}</small></div></button>
        <button onClick={retreat}><b>C</b><strong>立刻撤回</strong><span>今天空手也行，人回来就行。</span><div style={{ gridColumn: 2 }}><DecisionTags tags={retreatPreview.tags}/><small>{retreatPreview.summary}</small></div></button>
      </section>
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

function DuskScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const meal = previewMeal(state);
  const prep = previewNightPreparation(state);
  const committed = hasCommittedDayAction(state);
  const causalSignals = nightCausalSignals(state);
  return (
    <main className="v6-shell v6-shell--dusk">
      <header className="v6-page-head"><span>DUSK · DAY {state.day}</span><h1>太阳快下去了。</h1><p>门已经开始上闩。谁还在街外、哪扇窗没钉死、锅里够不够——现在都看得清了。</p></header>
      <InventoryBar state={state}/>
      <section className="v6-dusk-grid"><article><span>今晚吃什么</span><h2>{mealLabel(meal.quality)}</h2><p>{mealCoverageLine(meal.coverage)}</p><small>约 {meal.cookingCapacity.toFixed(1)} 人份 / 街里 {meal.residentCount} 人 · 覆盖 {Math.round(meal.coverage * 100)}%</small><strong>明早精力 +{meal.energyRecovery} · 希望 {meal.hopeDelta >= 0 ? '+' : ''}{meal.hopeDelta}</strong></article><article><span>入夜前</span><h2>{nightPreparationLine(prep.defense)}</h2><p>防线 {prep.defense} · 诊所 {prep.medical} · 修补 {prep.repair} · 广播 {prep.radio}</p><strong>门口多一个人，屋里多一盏灯，夜里就少一个空当。</strong></article></section>
      {!!causalSignals.length && <section className="v6-section"><div className="v6-section__head"><div><span>入夜前的几句话</span><h2>有些麻烦，白天就已经露了头</h2></div></div>{causalSignals.map((signal) => <p key={signal}>• {signal}</p>)}</section>}
      <button className="v6-cta" onClick={() => commit(finalizeDay(state), setState)}>天黑了</button>
      {!committed ? <button className="v6-link" onClick={() => commit(reopenDayAssignments(state), setState)}>← 还有时间，重新安排</button> : <p className="v6-message">今天已经有人出过街，现在没法把这一天重新来过。</p>}
      <p className="v6-message">{state.lastMessage}</p>
    </main>
  );
}

function DawnScreen({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const brief = dawnBriefEntries(state);
  return (
    <main className="v6-shell v6-shell--dawn">
      <header className="v6-page-head"><span>DAWN · DAY {state.day}</span><h1>{state.day === 29 ? '最后的夜结束了。' : '天亮了。'}</h1><p>{state.nightState.hordeActive ? '尸潮退去以后，街道重新有了颜色。现在才看得清昨夜留下的损失。' : '发电机的声音重新盖过远处的脚步。今天仍然有事要做。'}</p></header>
      <InventoryBar state={state}/>
      <section className="v6-stats"><div><span>昨夜动静</span><b>{state.nightState.resolutions.length}</b></div><div><span>死亡</span><b>{state.campaignStats.deaths}</b></div><div><span>没回来</span><b>{state.campaignStats.missing}</b></div><div><span>带回来</span><b>{state.campaignStats.rescued}</b></div></section>
      <SocialStatusPanel state={state} onCommit={(next) => commit(next, setState)} compact/>
      {!!brief.length && <section className="v6-section"><div className="v6-section__head"><div><span>昨夜留下的</span><h2>天亮以后才看清的事</h2></div><small>只记真正发生过的</small></div>{brief.map((entry, index) => <p key={`${entry}-${index}`}>• {entry}</p>)}</section>}
      <MemorialPanel state={state}/>
      <button className="v6-cta" onClick={() => commit(advanceCampaignDay(state), setState)}>{state.day === 29 ? '去看看天亮以后' : `继续到 DAY ${state.day + 1}`}</button>
    </main>
  );
}

function EndingScreen({ state, meta, onRestart }: { state: GameState; meta: MetaProgress; onRestart: () => void }) {
  const ending = state.ending;
  if (!ending) return null;
  return (
    <main className={`v6-ending v6-ending--${ending.tier}`}>
      <div className="v6-ending__day">DAY 30</div><p>天亮了。</p>
      <section className="v6-ending__ledger"><span>过去 29 天</span><div><b>{state.campaignStats.rescued}</b><small>带回来的人</small></div><div><b>{population(state)}</b><small>还在这条街</small></div><div><b>{state.campaignStats.deaths}</b><small>确认死亡</small></div><div><b>{state.campaignStats.expeditions}</b><small>出街次数</small></div><div><b>{state.campaignStats.locationsDiscovered}</b><small>走通过的地方</small></div><div><b>{state.finalHordeResult ? RESULT_LABEL[state.finalHordeResult] : '未知'}</b><small>最后一夜</small></div></section>
      <MemorialPanel state={state}/>
      <section className="v6-ending__story"><span>{ending.tier === 'secret' ? '隐藏结局' : '结局'}</span><h1>《{ending.title}》</h1><p>{ending.summary}</p></section>
      <section className="v6-ending-gallery"><div><span>结局记录</span><strong>{meta.endingsUnlocked.length}/13</strong></div><div className="v6-ending-grid">{(Object.keys(ENDINGS) as EndingId[]).map((id) => <div className={meta.endingsUnlocked.includes(id) ? 'unlocked' : ''} key={id}><b>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].title : '？？？？'}</b><small>{meta.endingsUnlocked.includes(id) ? ENDINGS[id].tier : endingHint(id)}</small></div>)}</div></section>
      <button className="v6-cta" onClick={onRestart}>再守一次</button>
    </main>
  );
}

export default function V060AppHotfix() {
  const [state, setState] = useState<GameState>(() => initialRun());
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const recorded = useRef<string | null>(null);

  useEffect(() => { saveGame(state); }, [state]);
  useEffect(() => {
    if (state.phase !== 'ending' || !state.ending || !state.finalHordeResult || recorded.current === `${state.seed}:${state.ending.id}`) return;
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
    if (state.phase === 'street' || state.phase === 'assignment') return <DayScreen state={state} setState={setState}/>;
    if (state.phase === 'expedition') return <ExpeditionScreen state={state} setState={setState}/>;
    if (state.phase === 'dusk') return <DuskScreen state={state} setState={setState}/>;
    if (state.phase === 'night' || state.phase === 'night-summary') return <V060NightScene state={state} setState={setState}/>;
    if (state.phase === 'summary' || state.phase === 'dawn') return <DawnScreen state={state} setState={setState}/>;
    if (state.phase === 'ending') return <EndingScreen state={state} meta={meta} onRestart={restart}/>;
    return <DayScreen state={{ ...state, phase: 'street' }} setState={setState}/>;
  }, [state, meta]);

  return <>{screen}</>;
}
