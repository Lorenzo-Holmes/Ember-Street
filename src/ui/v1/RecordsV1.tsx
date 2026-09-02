import { useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { EXPEDITION_LOCATIONS } from '../../game/v060/expedition';
import { CAMPAIGN_FIXED_EVENTS, isLocationUnlocked } from '../../game/v060/campaignEvents';
import { dawnBriefEntries } from '../../game/v060/morningBrief';
import { characterVisual, locationVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import { resourceLabel, SURVIVOR_CONDITION_LABEL } from './labels';
import './survivors-records.css';

interface RecordsV1Props { state: GameState; onBack: () => void; }
type RecordsTab = 'log' | 'places' | 'profiles' | 'memorial';

function MiniArt({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1r-mini-art">{asset ? <div className="v1r-mini-art__image" style={visualAssetStyle(asset)} /> : null}<span>{label.slice(0, 1)}</span></div>;
}

export default function RecordsV1({ state, onBack }: RecordsV1Props) {
  const [tab, setTab] = useState<RecordsTab>('log');
  const briefs = dawnBriefEntries(state);
  const departureFlags = state.storyFlags.filter((flag) => flag.startsWith('civilian_departure:')).map((flag) => {
    const [, day, reason, count] = flag.split(':');
    const reasonLabel = reason === 'food' ? '连续缺粮' : reason === 'hope' ? '希望过低' : reason === 'pressure' ? '街区压力' : '防线恶化';
    return `DAY ${day} · ${count} 名街区居民因为${reasonLabel}离开。`;
  });
  const journal = [...departureFlags, ...briefs].slice(-12).reverse();
  const discovered = EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
  const presentIds = new Set(state.survivors.map((survivor) => survivor.id));
  const profiles = state.survivors.filter((survivor) => presentIds.has(survivor.id));
  const seenCharacterStories = useMemo(() => CAMPAIGN_FIXED_EVENTS.filter((event) => event.kind === 'character' && event.survivorId && state.storyFlags.includes(`fixed_event_seen:${event.id}`)), [state.storyFlags]);

  return (
    <main className="v1r-page">
      <header className="v1r-head"><button onClick={onBack}>← 据点</button><span>这条街留下来的东西</span><h1>记录</h1></header>
      <nav className="v1r-tabs" aria-label="记录分类">
        {([['log','街区日志'],['places','地点'],['profiles','角色档案'],['memorial','纪念墙']] as const).map(([id,label]) => <button className={tab===id?'active':''} key={id} onClick={()=>setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'log' && <section className="v1r-log"><header><span>街区日志</span><small>只记录真正改变这条街的事情</small></header>{journal.length ? journal.map((entry,index)=><article key={`${entry}-${index}`}><i/><p>{entry}</p></article>) : <p className="v1r-empty">今天以前还没有留下足够多的记录。</p>}</section>}

      {tab === 'places' && <section className="v1r-grid"><header><span>已发现地点</span><small>{discovered.length}/{EXPEDITION_LOCATIONS.length}</small></header>{discovered.map((location)=>{const art=locationVisual(location.id);return <article key={location.id} className="v1r-place"><MiniArt asset={art} label={location.name}/><div><h2>{location.name}</h2><p>{location.description}</p><small>危险 {location.danger}/5 · 主要资源：{resourceLabel(location.primary)}</small></div></article>})}</section>}

      {tab === 'profiles' && <section className="v1r-profiles"><header><span>角色档案</span><small>人物加入或相关事件发生后逐步展开</small></header>{profiles.map((survivor)=>{const art=characterVisual(survivor.id);const stories=seenCharacterStories.filter((event)=>event.survivorId===survivor.id);return <article key={survivor.id}><div className="v1r-profile-head"><MiniArt asset={art} label={survivor.name}/><div><h2>{survivor.name}</h2><span>{survivor.trait ?? survivor.perk}</span><small>当前状态：{SURVIVOR_CONDITION_LABEL[survivor.condition ?? 'healthy']} · 信任 {survivor.trust ?? 0}</small></div></div>{stories.length ? <div className="v1r-profile-stories">{stories.map((story)=><section key={story.id}><strong>{story.title}</strong><p>{story.body}</p></section>)}</div> : <p className="v1r-empty">关于这个人的更多故事还没有在本局发生。这里不提前泄露未解锁背景。</p>}</article>})}</section>}

      {tab === 'memorial' && <section className="v1r-memorial"><header><span>纪念墙</span><small>{state.memorials.length} 个名字</small></header>{state.memorials.length ? state.memorials.map((entry)=><article key={`${entry.survivorId}-${entry.day}`}><h2>{entry.name}</h2><span>DAY {entry.day} · {entry.cause}</span><p>{entry.epitaph}</p></article>) : <p className="v1r-empty">这里现在还是空的。</p>}<div className="v1r-civilian-note"><strong>街区居民的损失</strong><p>普通居民不会被伪装成几十张匿名人物卡。死亡、失踪和离开会进入街区日志与人口统计。</p><small>居民离开 {state.campaignStats.civilianDepartures} · 全局死亡统计 {state.campaignStats.deaths}</small></div></section>}
    </main>
  );
}
