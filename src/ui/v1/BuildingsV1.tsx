import { useState, type CSSProperties } from 'react';
import type { BuildingId, GameState } from '../../game/types';
import { communitySupportSummary, selectCommunitySupportMode } from '../../game/v060/community';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from '../../game/v060/buildings';
import { buildingVisual, visualAssetStyle } from '../visualAssets';
import { PaperPanel, PinnedNote, SceneShell, TopStatusBar } from '../v2/UiV2';
import './home-base.css';

interface BuildingsV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
  selectedBuilding?: BuildingId;
  onSelectBuilding?: (id: BuildingId) => void;
  onOpenSurvivors?: () => void;
}

const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];
const HOTSPOT_POSITION: Record<BuildingId, [number, number]> = {
  searchStation: [17, 24],
  workshop: [49, 18],
  clinic: [77, 29],
  watchPost: [18, 65],
  shelter: [49, 61],
  radio: [78, 69],
};

const statusLabel = (level: number) => level <= 0 ? '未修' : level >= 3 ? '修稳' : '可用';
const levelLabel = (level: number) => level <= 0 ? 'Lv.0' : `Lv.${level}`;

function CommunityDuty({ state, onCommit }: Pick<BuildingsV1Props, 'state' | 'onCommit'>) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  const modes = [
    ['logistics', '后勤', '多顾几个人的晚饭'],
    ['repair', '维修', '再补一轮门墙'],
    ['defense', '守备', '替街口的人换班'],
  ] as const;
  return <PaperPanel className="v2-community-duty v1-community">
    <header><div><span>今日轮值</span><h2>街里还有 {state.civilianResidents} 名普通居民</h2></div><small>{summary.activeResidents} 人今天能搭手</small></header>
    {!summary.unlocked ? <p>人手还不够排固定轮值。等住下来的人再多些。</p> : <div className="v2-community-duty__choices v1-community__choices">
      {modes.map(([mode, label, note]) => <button
        key={mode}
        className={summary.supportMode === mode ? 'is-selected active' : ''}
        disabled={state.dayState.assignmentsLocked}
        onClick={() => onCommit(selectCommunitySupportMode(state, mode))}
      ><strong>{label}</strong><span>{note}</span></button>)}
    </div>}
  </PaperPanel>;
}

export default function BuildingsV1({ state, onCommit, selectedBuilding: controlledBuilding, onSelectBuilding, onOpenSurvivors }: BuildingsV1Props) {
  const [localBuilding, setLocalBuilding] = useState<BuildingId>('shelter');
  const selectedBuilding = controlledBuilding ?? localBuilding;
  const selectBuilding = (id: BuildingId) => {
    if (controlledBuilding === undefined) setLocalBuilding(id);
    onSelectBuilding?.(id);
  };
  const definition = V060_BUILDINGS[selectedBuilding];
  const level = state.buildings[selectedBuilding];
  const next = definition.levels[level] ?? null;
  const check = canUpgradeBuilding(state, selectedBuilding);
  const detailAsset = buildingVisual(selectedBuilding, Math.max(1, level));
  const sceneAsset = buildingVisual('shelter', Math.max(1, state.buildings.shelter));
  const readyCount = BUILDING_IDS.filter((id) => canUpgradeBuilding(state, id).allowed).length;

  return <SceneShell className="v1-mobile-page v1-home-page v1-buildings-page notebook-page notebook-page--buildings" label="避难所建筑">
    <div data-tutorial="resources"><TopStatusBar state={state} detail={state.day === 29 ? '最后的白天 · 天黑前把安排定下来' : state.forecast.title}/></div>

    <section className="v2-shelter-scene" aria-label="避难所主场景">
      <div className="v2-shelter-scene__art" style={visualAssetStyle(sceneAsset)}/>
      <div className="v2-shelter-scene__shade" aria-hidden="true"/>
      <header><span>余烬长街 · 避难所</span><strong>{state.dayState.assignmentsLocked ? '今日安排已锁定' : '天黑前还能调整'}</strong></header>
      {BUILDING_IDS.map((id) => {
        const building = V060_BUILDINGS[id];
        const buildingLevel = state.buildings[id];
        const [x, y] = HOTSPOT_POSITION[id];
        return <button
          key={id}
          className={`v2-building-hotspot ${selectedBuilding === id ? 'is-selected' : ''} ${buildingLevel <= 0 ? 'is-unavailable' : ''}`}
          style={{ '--hotspot-x': `${x}%`, '--hotspot-y': `${y}%` } as CSSProperties}
          onClick={() => selectBuilding(id)}
          aria-pressed={selectedBuilding === id}
        >
          <i style={visualAssetStyle(buildingVisual(id, Math.max(1, buildingLevel)))}/>
          <span>{building.name}</span>
          <small>{levelLabel(buildingLevel)}</small>
        </button>;
      })}
    </section>

    <nav className="v1-building-list v2-building-nav" aria-label="建筑导航">
      {BUILDING_IDS.map((id) => {
        const building = V060_BUILDINGS[id];
        const buildingLevel = state.buildings[id];
        const asset = buildingVisual(id, Math.max(1, buildingLevel));
        return <article className={`v1-building ${selectedBuilding === id ? 'is-open is-selected' : ''}`} key={id}>
          <button className="v1-building__summary" aria-pressed={selectedBuilding === id} onClick={() => selectBuilding(id)}>
            <span className="v1-building__art" style={visualAssetStyle(asset)} aria-hidden="true"/>
            <strong>{building.name}</strong>
            <small>{levelLabel(buildingLevel)} · {statusLabel(buildingLevel)}</small>
          </button>
        </article>;
      })}
    </nav>

    <button className="v1-day-action v2-day-roster-action" data-tutorial="day-action" onClick={onOpenSurvivors ?? (() => undefined)}>
      <strong>今天谁去哪里</strong><span>翻开今日安排，给幸存者写下工作、休息或探索路线。</span>
    </button>

    <section className="v2-building-detail" aria-live="polite">
      <div className="v2-building-detail__art" style={visualAssetStyle(detailAsset)} aria-label={`${definition.name} ${levelLabel(level)}`}/>
      <div className="v2-building-detail__copy">
        <header><div><span>建筑档案</span><h1>{definition.name} <small>{levelLabel(level)}</small></h1></div><b>{statusLabel(level)}</b></header>
        <p>{level > 0 ? definition.levels[level - 1].unlock : definition.inactiveDescription}</p>
        {next ? <div className="v2-building-upgrade">
          <div><span>下一步</span><strong>{next.title}</strong><small>{next.unlock}</small></div>
          <dl>
            <div className={state.inventory.materials < next.materials ? 'is-short' : ''}><dt>材料</dt><dd>{state.inventory.materials} / {next.materials}</dd></div>
            <div className={state.inventory.parts < next.parts ? 'is-short' : ''}><dt>零件</dt><dd>{state.inventory.parts} / {next.parts}</dd></div>
          </dl>
          <button className="v2-primary-action" disabled={!check.allowed || state.dayState.assignmentsLocked} onClick={() => onCommit(upgradeBuilding(state, selectedBuilding))}>
            {state.dayState.assignmentsLocked ? '今天的人已经派出去了' : check.allowed ? (level === 0 ? '动手抢修' : '继续修整') : check.reason}
          </button>
        </div> : <p className="v2-building-complete">这里已经修稳，不需要继续投入材料。</p>}
      </div>
    </section>

    {readyCount > 0 && !state.dayState.assignmentsLocked ? <PinnedNote tone="new">有 {readyCount} 处建筑的材料已经凑齐。便签只提醒，不替你决定先修哪里。</PinnedNote> : null}
    <CommunityDuty state={state} onCommit={onCommit}/>
    <div className="v1-bottom-nav-spacer"/>
  </SceneShell>;
}
