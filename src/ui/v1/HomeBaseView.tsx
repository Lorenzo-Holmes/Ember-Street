import { useMemo } from 'react';
import type { GameState } from '../../game/types';
import { communitySupportSummary, selectCommunitySupportMode } from '../../game/v060/community';
import { buildingVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import V1BottomNav, { type V1NavTarget } from './V1BottomNav';
import ResourceIcon from './ResourceIcon';
import DefensePanel from './DefensePanel';
import './home-base.css';
import './resource-icons.css';

interface HomeBaseViewProps {
  state: GameState;
  onCommit: (next: GameState) => void;
  onNavigate: (target: V1NavTarget) => void;
}

const corePresent = (state: GameState) => state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;

function ArtFrame({ asset, label, className = '' }: { asset?: VisualAsset; label: string; className?: string }) {
  return (
    <div className={`v1-art-frame ${className}`} aria-label={label} style={visualAssetStyle(asset)}>
      {!asset ? <div className="v1-art-frame__fallback"><span>{label}</span><small>这张图还没画下来</small></div> : null}
    </div>
  );
}

function CommunityRotation({ state, onCommit }: Pick<HomeBaseViewProps, 'state' | 'onCommit'>) {
  if (state.civilianResidents <= 0) return null;
  const summary = communitySupportSummary(state);
  const modes = [
    ['logistics', '后勤', '让锅里的东西，尽量够每个人一口。'],
    ['repair', '维修', '搬铁皮、递工具，把门墙再撑一晚。'],
    ['defense', '守备', '去街口轮值，别让动静摸进来。'],
  ] as const;

  return (
    <section className="v1-community">
      <header>
        <div><span>街区居民</span><h2>{state.civilianResidents} 人住在这里</h2></div>
        <small>{summary.activeResidents} 人今天能搭把手{summary.pendingResidents ? ` · ${summary.pendingResidents} 人明天再说` : ''}</small>
      </header>
      {!summary.unlocked ? (
        <p className="v1-muted">人手还不够排固定轮值。等住下来的人多些，再把后勤、修补和街口分开安排。</p>
      ) : (
        <div className="v1-community__choices">
          {modes.map(([mode, label, detail]) => {
            const preview = communitySupportSummary(selectCommunitySupportMode(state, mode));
            return (
              <button
                key={mode}
                className={summary.supportMode === mode ? 'active' : ''}
                disabled={state.dayState.assignmentsLocked}
                onClick={() => onCommit(selectCommunitySupportMode(state, mode))}
              >
                <strong>{label}</strong>
                <span>{detail}</span>
                <small>{mode === 'logistics' ? `今晚能多顾到约 ${preview.cookingCapacity.toFixed(1)} 人份` : mode === 'repair' ? '门墙能再补一遍' : '夜里有人替换守岗'}</small>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function HomeBaseView({ state, onCommit, onNavigate }: HomeBaseViewProps) {
  const present = corePresent(state);
  const total = present + state.civilianResidents;
  const shelterAsset = buildingVisual('shelter');
  const todayNotes = useMemo(() => {
    const notes: string[] = [];
    const tired = state.survivors.filter((s) => s.condition === 'fatigued' || s.energy < 35).map((s) => s.name);
    if (tired.length) notes.push(`${tired.slice(0, 2).join('、')}已经很累`);
    if (state.inventory.medicine <= 2) notes.push('药品已经见底');
    if (state.civilianResidents > 0) notes.push(`街区另外住着 ${state.civilianResidents} 名普通居民`);
    if (!notes.length) notes.push('天亮到现在，还没添新的坏消息。');
    return notes.slice(0, 3);
  }, [state]);

  return (
    <main className="v1-mobile-page v1-home-page notebook-page notebook-page--home">
      <header className="v1-status-strip">
        <div><span>DAY</span><strong>{state.day}<small>/30</small></strong></div>
        <div className="v1-status-strip__weather"><b>{state.forecast.title}</b><small>{state.day === 29 ? '最后的白天' : state.forecast.detail}</small></div>
      </header>

      <section className="v1-resource-strip" aria-label="核心资源">
        <span><ResourceIcon kind="ration"/><i>口粮</i><b>{state.inventory.ration}</b></span>
        <span><ResourceIcon kind="medicine"/><i>药品</i><b>{state.inventory.medicine}</b></span>
        <span><ResourceIcon kind="materials"/><i>材料</i><b>{state.inventory.materials}</b></span>
        <span><ResourceIcon kind="parts"/><i>零件</i><b>{state.inventory.parts}</b></span>
        <span><ResourceIcon kind="hope"/><i>希望</i><b>{state.hope}</b></span>
      </section>

      <DefensePanel state={state}/>

      <section className="v1-home-hero">
        <ArtFrame asset={shelterAsset} label="余烬长街据点" className="v1-home-hero__art" />
        <div className="v1-home-hero__copy">
          <span>余烬长街</span>
          <h1>{state.day === 29 ? '天黑前，把该做的都做完。' : `这条街今天还有 ${total} 个人。`}</h1>
          <p>{state.day < 29 ? `距离最后的白天还有 ${29 - state.day} 天。` : '北边从昨晚起就没安静过。'}</p>
        </div>
      </section>

      <section className="v1-today-summary">
        <header><span>今天先看这几件事</span></header>
        {todayNotes.map((note) => <p key={note}>{note}</p>)}
      </section>

      <button className="v1-day-action" onClick={() => onNavigate('survivors')}>
          <strong>今天谁去哪里</strong>
          <span>天黑前，把每个人的去处记下来。</span>
      </button>

      <CommunityRotation state={state} onCommit={onCommit} />

      <div className="v1-bottom-nav-spacer" />
      <V1BottomNav active="home" onNavigate={onNavigate} />
    </main>
  );
}
