import { useState } from 'react';
import type { BuildingId, GameState } from '../../game/types';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from '../../game/v060/buildings';
import { buildingVisual, visualAssetStyle } from '../visualAssets';
import './home-base.css';

interface BuildingsV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
}

const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];
const BUILDING_CONDITION = ['封着', '勉强能用', '已经能用', '修稳了'] as const;
const conditionLabel = (level: number) => BUILDING_CONDITION[Math.max(0, Math.min(3, level))];

export default function BuildingsV1({ state, onCommit }: BuildingsV1Props) {
  const firstUnfinished = BUILDING_IDS.find((id) => state.buildings[id] < V060_BUILDINGS[id].levels.length) ?? BUILDING_IDS[0];
  const [openId, setOpenId] = useState<BuildingId | null>(firstUnfinished);

  return (
    <main className="v1-mobile-page v1-buildings-page notebook-page notebook-page--buildings">
      <header className="v1-page-title">
        <span>维修记录</span>
        <h1>天黑前，先把要紧的地方修起来</h1>
        <p>坏在哪里、还缺多少，都记在下面。</p>
      </header>
      <div className="v1-building-list">
        {BUILDING_IDS.map((id) => {
          const definition = V060_BUILDINGS[id];
          const level = state.buildings[id];
          const next = definition.levels[level] ?? null;
          const check = canUpgradeBuilding(state, id);
          const asset = buildingVisual(id, level);
          const isOpen = openId === id;
          return (
            <article className={`v1-building ${asset ? '' : 'v1-building--text'} ${isOpen ? 'is-open' : ''}`} key={id}>
              <button className="v1-building__summary" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : id)}>
                <span>{definition.name}</span>
                <strong>{level ? definition.levels[level - 1].title : definition.inactiveTitle}</strong>
                <b>{conditionLabel(level)}</b>
                <small className="v1-building__cost" id={`building-cost-${id}`}>
                  {next ? <>
                    <span>需用：材料 {next.materials} · 零件 {next.parts}</span>
                    <em className={check.allowed ? 'is-ready' : 'is-short'}>{check.allowed ? '用料已齐' : check.reason}</em>
                  </> : '这处已经修稳'}
                </small>
                <i>{isOpen ? '合上' : '翻开看'}</i>
              </button>
              {isOpen ? <>
                {asset ? <div className="v1-art-frame v1-building__art" aria-label={definition.name} style={visualAssetStyle(asset)}/> : null}
                <div className="v1-building__body">
                  <p>{level ? definition.levels[level - 1].unlock : definition.inactiveDescription}</p>
                  {next ? <button className="v1-primary-action" aria-describedby={`building-cost-${id}`} disabled={!check.allowed || state.dayState.assignmentsLocked} onClick={() => onCommit(upgradeBuilding(state, id))}>{state.dayState.assignmentsLocked ? '人已经派出去了' : level === 0 ? '动手抢修' : '接着修'}</button> : <strong className="v1-finished">这里已经修完</strong>}
                </div>
              </> : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}
