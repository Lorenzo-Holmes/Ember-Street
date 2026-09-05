import { useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { canTakeDayAssignment, expeditionRouteFor, expeditionRouteLimit } from '../../game/v060/dayManagement';
import { EXPEDITION_LOCATIONS, expeditionRiskLabel, expeditionRiskScore } from '../../game/v060/expedition';
import { isLocationUnlocked } from '../../game/v060/campaignEvents';
import { LOCATION_DEPLETION_LOOT_VISITS, locationLootVisitCount, locationMemory } from '../../game/v060/locationMemory';
import { locationVisual, visualAssetStyle } from '../visualAssets';
import { resourceListLabel } from './labels';
import './explore-night.css';
import './explore-safe-area.css';

interface ExploreRouteV1Props {
  state: GameState;
  survivorId: string;
  onBack: () => void;
  onConfirm: (locationId: string) => void;
}

const riskLabel = (risk: ReturnType<typeof expeditionRiskLabel>) => risk === 'safe' ? '没见动静' : risk === 'cautious' ? '进去得小心' : risk === 'dangerous' ? '容易出事' : '不该轻易进去';

function companyNote(count: number): string {
  if (count <= 1) return '一个人走，出事时没人照应';
  if (count === 2) return '两个人同行，路上能互相照应';
  return `${count} 人同行，能分开找，也更容易把东西带回来`;
}

function bestAdditionalCompanionRisk(state: GameState, partyIds: string[], survivorId: string, locationId: string): number | null {
  if (partyIds.length !== 1) return null;
  const candidates = state.survivors.filter((candidate) => candidate.id !== survivorId
    && !state.dayAssignments[candidate.id]
    && canTakeDayAssignment(state, candidate.id, 'expedition').allowed);
  if (!candidates.length) return null;
  return Math.min(...candidates.map((candidate) => expeditionRiskScore(state, [...partyIds, candidate.id], locationId)));
}

function scavengingNote(state: GameState, locationId: string): string | null {
  const lootVisits = locationLootVisitCount(state, locationId);
  if (!lootVisits) return null;
  if (locationMemory(state, locationId).depleted) {
    return `物资快空 · 已经带回过 ${lootVisits} 次，主要物资只剩零散一些`;
  }
  const remaining = LOCATION_DEPLETION_LOOT_VISITS - lootVisits;
  if (remaining === 1) return `已经带回过 ${lootVisits} 次 · 再成功搜一次，这里就会开始见底`;
  return `已经带回过 ${lootVisits} 次 · 主要物资暂时还找得到`;
}

export default function ExploreRouteV1({ state, survivorId, onBack, onConfirm }: ExploreRouteV1Props) {
  const survivor = state.survivors.find((item) => item.id === survivorId);
  const locations = useMemo(() => EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id)), [state]);
  const currentRoute = expeditionRouteFor(state, survivorId);
  const [locationId, setLocationId] = useState(currentRoute ?? locations[0]?.id ?? '');
  const assignedRoutes = state.dayState.expeditionRoutes ?? {};
  const existingDistinct = new Set(Object.entries(assignedRoutes)
    .filter(([id]) => id !== survivorId && state.dayAssignments[id] === 'expedition')
    .map(([, route]) => route));
  const routeLimit = expeditionRouteLimit(state);
  const activePartyIds = Object.entries(assignedRoutes)
    .filter(([id, route]) => id !== survivorId && route === locationId && state.dayAssignments[id] === 'expedition')
    .map(([id]) => id);
  const partyIds = survivor ? [...activePartyIds, survivor.id] : activePartyIds;
  const selectedLocation = locations.find((location) => location.id === locationId);
  const selectedBlocked = Boolean(locationId && !existingDistinct.has(locationId) && existingDistinct.size >= routeLimit);

  return (
    <main className="v1e-page notebook-page notebook-page--explore notebook-page--route">
      <header className="v1e-head"><button onClick={onBack}>← 幸存者</button><span>{survivor?.name ?? '探索者'} · 选路</span></header>
      <section className="v1e-party-summary">
        <div><span>今天让谁走这条路</span><strong>{survivor?.name ?? '人不在这里'}</strong><small>路线屋今天最多能记清 {routeLimit} 条路。写在同一处的人会结伴出发。</small></div>
      </section>
      <section className="v1e-route-title"><span>今天去哪？</span><h1>先替他看清一条路。</h1></section>
      <div className="v1e-location-list">
        {locations.map((location) => {
          const active = location.id === locationId;
          const companions = Object.entries(assignedRoutes)
            .filter(([id, route]) => id !== survivorId && route === location.id && state.dayAssignments[id] === 'expedition')
            .map(([id]) => id);
          const prospectiveParty = survivor ? [...companions, survivor.id] : companions;
          const currentRiskScore = expeditionRiskScore(state, prospectiveParty, location.id);
          const risk = expeditionRiskLabel(currentRiskScore);
          const bestCompanionScore = bestAdditionalCompanionRisk(state, prospectiveParty, survivorId, location.id);
          const bestCompanionLabel = bestCompanionScore !== null && bestCompanionScore < currentRiskScore
            ? riskLabel(expeditionRiskLabel(bestCompanionScore))
            : null;
          const lootNote = scavengingNote(state, location.id);
          const blocked = !existingDistinct.has(location.id) && existingDistinct.size >= routeLimit;
          return (
            <button className={`v1e-location ${active ? 'active' : ''}`} disabled={blocked} key={location.id} onClick={() => setLocationId(location.id)}>
              <div className="v1e-art" aria-label={location.name} style={visualAssetStyle(locationVisual(location.id))}/>
              <div className="v1e-location__copy">
                <div><strong>{location.name}</strong><em>{blocked ? '今天记不了更多路' : riskLabel(risk)}</em></div>
                <p>{location.description}</p>
                <small>能翻到：{resourceListLabel(location.primary, location.secondary, location.tertiary)} · {companyNote(prospectiveParty.length)}</small>
                {lootNote && <small className="v1e-depletion-hint">{lootNote}</small>}
                {bestCompanionLabel && <small className="v1e-companion-hint">再安排 1 人走同一路线，风险最低可到：{bestCompanionLabel}</small>}
              </div>
            </button>
          );
        })}
      </div>
      <button className="v1e-primary" disabled={!selectedLocation || selectedBlocked} onClick={() => onConfirm(locationId)}>
        {selectedLocation ? `把${survivor?.name ?? '他'}记在${selectedLocation.name}这条路上` : '还没有能走的路'}
      </button>
    </main>
  );
}
