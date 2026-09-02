import { useMemo, useState } from 'react';
import type { BuildingId, GameState } from '../../game/types';
import { V060_BUILDINGS, canUpgradeBuilding, upgradeBuilding } from '../../game/v060/buildings';
import { communitySupportSummary, selectCommunitySupportMode } from '../../game/v060/community';
import { buildingVisual } from '../visualAssets';
import './home-base.css';

export type V1NavTarget = 'home' | 'explore' | 'survivors' | 'records';

interface HomeBaseViewProps {
  state: GameState;
  onCommit: (next: GameState) => void;
  onNavigate: (target: V1NavTarget) => void;
}

const BUILDING_IDS = Object.keys(V060_BUILDINGS) as BuildingId[];
const BUILDING_CONDITION = ['还没收拾', '刚能用', '收拾得像样', '已经很稳'] as const;
const conditionLabel = (level: number) => BUILDING_CONDITION[Math.max(0, Math.min(3, level))];
const corePresent = (state: GameState) => state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;

function ArtFrame({ src, label, className = '' }: { src?: string; label: string; className?: string }) {
  return (
    <div className={`v1-art-frame ${className}`} aria-label={label}>
      {src ? <img src={src} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : null}
      <div className="v1-art-frame__fallback"><span>{label}</span><small>正式插画资产位</small></div>
    </div>
  );
}

function BottomNav({ active, onNavigate }: { active: V1NavTarget; onNavigate: (target: V1NavTarget) => void }) {
  const items: Array<[V1NavTarget, string]> = [['home', '据点'], ['explore', '探索'], ['survivors', '幸存者'], ['records', '记录']];
  return (
    <nav className="v1-bottom-nav" aria-label="主导航">
      {items.map(([id, label]) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onNavigate(id)}>{label}</button>)}
    </nav>
  );
}

function CommunityRotation({ state, onCommit }: Pick<HomeBaseViewProps, 'state' | 'onCommit'>) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  const modes = [
    ['logistics', '后勤', '去饭馆洗、切、分饭，让有限的口粮更容易顾到所有人。'],
    ['repair', '维修', '搬铁皮、递工具、堵住松开的缝，把核心幸存者的手留给更难的工作。'],
    ['defense', '守备', '去街口轮值，多一双眼睛就少一个没人看见的空当。'],
  ] as const;

  return (
    <section className="v1-community">
      <header>
        <div><span>街区居民</span><h2>{state.civilianResidents} 人住在这里</h2></div>
        <small>{summary.activeResidents} 人已能搭把手{summary.pendingResidents ? ` · ${summary.pendingResidents} 人明天才能参与劳动` : ''}</small>
      </header>
      {!summary.unlocked ? (
        <p className="v1-muted">居民还没有形成稳定轮值。完成社区事件《值班表》以后，5 名以上活跃居民可以每天集中支援一个方向。</p>
      ) : (
        <div className="v1-community__choices">
          {modes.map(([mode, label, detail]) => (
            <button
              key={mode}
              className={summary.supportMode === mode ? 'active' : ''}
              disabled={state.dayState.assignmentsLocked}
              onClick={() => onCommit(selectCommunitySupportMode(state, mode))}
            >
              <strong>{label}</strong>
              <span>{detail}</span>
              <small>{mode === 'logistics' ? `额外供餐约 ${summary.cookingCapacity.toFixed(1)} 人份` : mode === 'repair' ? `当前可提供防线 +${summary.repairDefense}` : `当前夜间风险约 -${Math.round(summary.nightRiskReduction * 100)}%`}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function BuildingList({ state, onCommit, onBack }: Pick<HomeBaseViewProps, 'state' | 'onCommit'> & { onBack: () => void }) {
  return (
    <main className="v1-mobile-page v1-buildings-page">
      <header className="v1-page-title">
        <button className="v1-back" onClick={onBack}>← 据点</button>
        <span>街区建设</span>
        <h1>把还能用的地方，一点点收拾回来</h1>
        <p>六座设施仍然是完整的 Lv0–3 系统。这里不压成六个小 KPI，一次只让玩家看清一两处真正发生了什么。</p>
      </header>

      <div className="v1-building-list">
        {BUILDING_IDS.map((id) => {
          const definition = V060_BUILDINGS[id];
          const level = state.buildings[id];
          const next = definition.levels[level] ?? null;
          const check = canUpgradeBuilding(state, id);
          const asset = buildingVisual(id);
          return (
            <article className="v1-building" key={id}>
              <ArtFrame src={asset?.path} label={definition.name} className="v1-building__art" />
              <div className="v1-building__body">
                <div className="v1-building__headline"><div><span>{definition.name}</span><h2>{level ? definition.levels[level - 1].title : '还没收拾'}</h2></div><b>{conditionLabel(level)}</b></div>
                <p>{level ? definition.levels[level - 1].unlock : '现在只剩一副空架子。把这里重新收拾出来，夜里才多一种能依靠的东西。'}</p>
                {next ? (
                  <>
                    <small>下一步：材料 {next.materials} · 零件 {next.parts}</small>
                    <button className="v1-primary-action" disabled={!check.allowed || state.dayState.assignmentsLocked} onClick={() => onCommit(upgradeBuilding(state, id))}>
                      {state.dayState.assignmentsLocked ? '今天的人手已经定了' : check.allowed ? (level === 0 ? '把这里收拾出来' : '继续收拾') : check.reason}
                    </button>
                  </>
                ) : <strong className="v1-finished">这里已经收拾到头了</strong>}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

export default function HomeBaseView({ state, onCommit, onNavigate }: HomeBaseViewProps) {
  const [showBuildings, setShowBuildings] = useState(false);
  const present = corePresent(state);
  const total = present + state.civilianResidents;
  const shelterAsset = buildingVisual('shelter');
  const todayNotes = useMemo(() => {
    const notes: string[] = [];
    const tired = state.survivors.filter((s) => s.condition === 'fatigued' || s.energy < 35).map((s) => s.name);
    if (tired.length) notes.push(`${tired.slice(0, 2).join('、')}已经很累`);
    if (state.inventory.medicine <= 2) notes.push('药品已经见底');
    if (state.defense < 40) notes.push('街口的防线太薄');
    if (state.civilianResidents > 0) notes.push(`街区另外住着 ${state.civilianResidents} 名普通居民`);
    if (!notes.length) notes.push('今天暂时没有新的坏消息');
    return notes.slice(0, 3);
  }, [state]);

  if (showBuildings) return <BuildingList state={state} onCommit={onCommit} onBack={() => setShowBuildings(false)} />;

  return (
    <main className="v1-mobile-page v1-home-page">
      <header className="v1-status-strip">
        <div><span>DAY</span><strong>{state.day}<small>/30</small></strong></div>
        <div className="v1-status-strip__weather"><b>{state.forecast.title}</b><small>{state.day === 29 ? '最后的白天' : state.forecast.detail}</small></div>
      </header>

      <section className="v1-resource-strip" aria-label="核心资源">
        <span>口粮 <b>{state.inventory.ration}</b></span>
        <span>药品 <b>{state.inventory.medicine}</b></span>
        <span>材料 <b>{state.inventory.materials}</b></span>
        <span>希望 <b>{state.hope}</b></span>
      </section>

      <section className="v1-home-hero">
        <ArtFrame src={shelterAsset?.path} label="余烬长街据点" className="v1-home-hero__art" />
        <div className="v1-home-hero__copy">
          <span>余烬长街</span>
          <h1>{state.day === 29 ? '天黑前，把该做的都做完。' : `这条街今天还有 ${total} 个人。`}</h1>
          <p>{state.day < 29 ? `距离最后的白天还有 ${29 - state.day} 天。` : '北边从昨晚起就没安静过。'}</p>
        </div>
      </section>

      <section className="v1-today-summary">
        <header><span>今天先看这几件事</span><button onClick={() => setShowBuildings(true)}>查看六座设施 ›</button></header>
        {todayNotes.map((note) => <p key={note}>{note}</p>)}
      </section>

      <button className="v1-day-action" onClick={() => onNavigate('survivors')}>
        <strong>安排今天</strong>
        <span>先决定核心幸存者各自去哪里，再让时间往前走。</span>
      </button>

      <CommunityRotation state={state} onCommit={onCommit} />

      <div className="v1-bottom-nav-spacer" />
      <BottomNav active="home" onNavigate={onNavigate} />
    </main>
  );
}
