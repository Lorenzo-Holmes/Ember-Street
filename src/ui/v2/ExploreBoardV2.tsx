import { useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { assignExpeditionRoute, canTakeDayAssignment, clearDayJob, expeditionRouteLimit } from '../../game/v060/dayManagement';
import { EXPEDITION_LOCATIONS, expeditionRiskLabel, expeditionRiskScore } from '../../game/v060/expedition';
import { isLocationUnlocked } from '../../game/v060/campaignEvents';
import { locationLootVisitCount, locationMemory } from '../../game/v060/locationMemory';
import { characterVisual, locationVisual, visualAssetStyle } from '../visualAssets';
import { resourceListLabel } from '../v1/labels';
import { gameAudio } from '../../audio/audioRuntime';
import { BoardShell, PaperPanel, PinnedNote, TopStatusBar } from './UiV2';

interface ExploreBoardV2Props {
  state: GameState;
  onCommit: (next: GameState) => void;
  onDone: () => void;
  doneDisabled?: boolean;
  doneHint?: string;
  onOpenSurvivors: () => void;
}

const riskCopy = (risk: ReturnType<typeof expeditionRiskLabel>) => risk === 'safe'
  ? '相对安静'
  : risk === 'cautious'
    ? '需要谨慎'
    : risk === 'dangerous'
      ? '危险'
      : '极险';

const conditionCopy = (condition?: string) => condition === 'healthy' ? '状态尚可'
  : condition === 'fatigued' ? '已经疲劳'
    : condition === 'minor' ? '有轻伤'
      : condition === 'serious' ? '伤势较重'
        : condition === 'critical' ? '无法外出'
          : condition === 'missing' ? '尚未归队'
            : condition === 'dead' ? '已故' : '状态未知';

export default function ExploreBoardV2({ state, onCommit, onDone, doneDisabled, doneHint, onOpenSurvivors }: ExploreBoardV2Props) {
  const locations = useMemo(() => EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id)), [state]);
  const routes = state.dayState.expeditionRoutes ?? {};
  const initial = Object.values(routes)[0] ?? locations[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(initial);
  const selected = locations.find((location) => location.id === selectedId) ?? locations[0];
  const selectedLocationId = selected?.id ?? '';
  const routeLimit = expeditionRouteLimit(state);
  const distinctRoutes = new Set(Object.entries(routes)
    .filter(([survivorId]) => state.dayAssignments[survivorId] === 'expedition')
    .map(([, locationId]) => locationId));
  const party = state.survivors.filter((survivor) => state.dayAssignments[survivor.id] === 'expedition' && routes[survivor.id] === selectedLocationId);
  const risk = selected ? riskCopy(expeditionRiskLabel(expeditionRiskScore(state, party.map((survivor) => survivor.id), selected.id))) : '';
  const selectedIsNewRoute = Boolean(selected && !distinctRoutes.has(selected.id));
  const routeBlocked = selectedIsNewRoute && distinctRoutes.size >= routeLimit;
  const depleted = selected ? locationMemory(state, selected.id).depleted : false;
  const visits = selected ? locationLootVisitCount(state, selected.id) : 0;

  const toggleParty = (survivorId: string) => {
    if (!selected) return;
    const active = state.dayAssignments[survivorId] === 'expedition' && routes[survivorId] === selected.id;
    gameAudio.playUiCue('pen_circle');
    onCommit(active ? clearDayJob(state, survivorId) : assignExpeditionRoute(state, survivorId, selected.id));
  };

  const selectLocation = (locationId: string) => {
    if (locationId === selected?.id) return;
    gameAudio.playUiCue('pen_circle');
    setSelectedId(locationId);
  };

  return <BoardShell className="v2-explore-page notebook-page notebook-page--explore" label="探索地图与情报">
    <TopStatusBar state={state} detail={`路线屋 Lv.${state.buildings.searchStation} · 最多 ${routeLimit} 条路线`}/>

    <section className="v2-board-title">
      <span>街外情报</span>
      <h1>把今天要走的路圈出来</h1>
      <p>位置只是路线板上的记号，不代表真实比例。先看风险，再决定谁出去。</p>
    </section>

    <section className="v2-map-board" aria-label="已发现地点示意图">
      <div className="v2-map-board__grid" aria-hidden="true"/>
      {locations.map((location, index) => {
        const active = location.id === selected?.id;
        const assigned = Object.entries(routes).filter(([survivorId, locationId]) => state.dayAssignments[survivorId] === 'expedition' && locationId === location.id).length;
        return <button
          key={location.id}
          className={`v2-map-marker ${active ? 'is-selected' : ''}`}
          style={{ '--marker-x': `${16 + ((index * 29) % 67)}%`, '--marker-y': `${18 + ((index * 23) % 62)}%` } as React.CSSProperties}
          onClick={() => selectLocation(location.id)}
          aria-pressed={active}
        >
          <i/>
          <span>{location.name}</span>
          {assigned ? <b>{assigned} 人</b> : null}
        </button>;
      })}
      {!locations.length ? <p className="v2-map-board__empty">路线屋里还没有能走的地方。</p> : null}
    </section>

    {selected ? <PaperPanel className="v2-location-intel">
      <div className="v2-location-intel__art" style={visualAssetStyle(locationVisual(selected.id))}/>
      <div className="v2-location-intel__copy">
        <span>地点档案 · {risk}</span>
        <h2>{selected.name}</h2>
        <p>{selected.description}</p>
        <dl>
          <div><dt>可能找到</dt><dd>{resourceListLabel(selected.primary, selected.secondary, selected.tertiary)}</dd></div>
          <div><dt>搜过次数</dt><dd>{visits || '还没进去过'}</dd></div>
          <div><dt>当前情况</dt><dd>{depleted ? '主要物资已经见底' : '仍有可搜寻区域'}</dd></div>
        </dl>
      </div>
    </PaperPanel> : null}

    {routeBlocked ? <PinnedNote tone="warning">路线屋今天已经记满 {routeLimit} 条不同路线。可以先撤下一条，或让人加入已有路线。</PinnedNote> : null}

    <section className="v2-deploy-board">
      <header>
        <div><span>探索队</span><h2>{selected ? `去 ${selected.name}` : '还没有选地点'}</h2></div>
        <small>{party.length}/2 人 · {party.length ? risk : '先选人再估风险'}</small>
      </header>
      <div className="v2-deploy-board__people">
        {state.survivors.map((survivor) => {
          const active = state.dayAssignments[survivor.id] === 'expedition' && routes[survivor.id] === selectedLocationId;
          const check = canTakeDayAssignment(state, survivor.id, 'expedition');
          const atOtherRoute = state.dayAssignments[survivor.id] === 'expedition' && routes[survivor.id] && routes[survivor.id] !== selectedLocationId;
          const disabled = !active && (!selected || !check.allowed || routeBlocked || party.length >= 2 || state.dayState.assignmentsLocked);
          return <button key={survivor.id} className={active ? 'is-selected' : ''} disabled={disabled} onClick={() => toggleParty(survivor.id)}>
            <span className="v2-deploy-board__portrait" style={visualAssetStyle(characterVisual(survivor.id))}/>
            <strong>{survivor.name}</strong>
            <small>{active ? '已写在这条路上' : atOtherRoute ? '已安排其他路线' : state.dayAssignments[survivor.id] ? '今天已有安排' : conditionCopy(survivor.condition)}</small>
            <em>{active ? '撤下' : disabled ? (check.reason ?? '暂时不能加入') : '加入'}</em>
          </button>;
        })}
      </div>
      <button className="v2-text-link" onClick={onOpenSurvivors}>去人物档案调整其他岗位 →</button>
    </section>

    <button className="v2-primary-action" data-tutorial="dispatch" disabled={doneDisabled} onClick={onDone}>
      {doneDisabled ? doneHint ?? '还有安排没写完' : party.length ? '确认今日安排，按路线出发' : '确认今日安排，留在街里'}
    </button>
    <div className="v1-bottom-nav-spacer"/>
  </BoardShell>;
}
