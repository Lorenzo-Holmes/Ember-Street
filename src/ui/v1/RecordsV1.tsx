import { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { EXPEDITION_LOCATIONS } from '../../game/v060/expedition';
import { CAMPAIGN_FIXED_EVENTS, isLocationUnlocked } from '../../game/v060/campaignEvents';
import { energyLabel, trustLabel } from '../../game/v060/trust';
import { dawnBriefEntries } from '../../game/v060/morningBrief';
import { characterVisual, locationVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import { resourceListLabel } from './labels';
import './survivors-records.css';

interface RecordsV1Props { state: GameState; onLogOpened?: () => void; }
type RecordsTab = 'log' | 'places' | 'profiles' | 'memorial';

function MiniArt({ asset, label }: { asset?: VisualAsset; label: string }) {
  const ratioClass = asset?.kind === 'character' ? 'portrait' : 'scene';
  return <div className={`v1r-mini-art ${ratioClass}`}>{asset ? <div className="v1r-mini-art__image" style={visualAssetStyle(asset)} /> : null}<span>{label.slice(0, 1)}</span></div>;
}

function placeWarning(danger: number): string {
  if (danger <= 1) return '暂时没听见动静';
  if (danger === 2) return '门后可能有东西';
  if (danger === 3) return '进去容易出事';
  return '没有足够人手别进去';
}

const CONDITION_NOTE: Record<string, string> = {
  healthy: '身上没有新伤',
  fatigued: '累得已经抬不起脚',
  minor: '伤口还不算深',
  serious: '伤得不轻',
  critical: '还没脱离危险',
  missing: '到现在还没回来',
  dead: '没能活下来',
};

function profileNote(condition: string | undefined, energy: number, trust: number | undefined): string {
  return `${CONDITION_NOTE[condition ?? 'healthy']}，${energyLabel(energy)}。${trustLabel(trust)}。`;
}

export default function RecordsV1({ state, onLogOpened }: RecordsV1Props) {
  const [tab, setTab] = useState<RecordsTab>('log');
  const [journalPage, setJournalPage] = useState(0);
  useEffect(() => { if (tab === 'log') onLogOpened?.(); }, [tab, onLogOpened]);
  const briefs = dawnBriefEntries(state);
  const departureFlags = state.storyFlags.filter((flag) => flag.startsWith('civilian_departure:')).map((flag) => {
    const [, day, reason, count] = flag.split(':');
    const reasonLabel = reason === 'food' ? '锅里已经连续几天不够分' : reason === 'hope' ? '他们不再相信这里能撑下去' : reason === 'pressure' ? '街里的争吵一直没有停' : '门墙已经挡不住夜里的东西';
    return `第 ${day} 天。${count} 个人走了——${reasonLabel}。`;
  });
  const journal = [...departureFlags, ...briefs].slice(-12).reverse();
  const recorded = [...(state.journal ?? [])].reverse();
  const pageCount = Math.max(1, Math.ceil(recorded.length / 20));
  const currentPage = Math.min(journalPage, pageCount - 1);
  const visibleEntries = recorded.slice(currentPage * 20, currentPage * 20 + 20);
  const discovered = EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id));
  const presentIds = new Set(state.survivors.map((survivor) => survivor.id));
  const profiles = state.survivors.filter((survivor) => presentIds.has(survivor.id));
  const seenCharacterStories = useMemo(() => CAMPAIGN_FIXED_EVENTS.filter((event) => event.kind === 'character' && event.survivorId && state.storyFlags.includes(`fixed_event_seen:${event.id}`)), [state.storyFlags]);

  return (
    <main className="v1r-page notebook-page notebook-page--records">
      <header className="v1r-head"><span>写在纸上的</span><h1>不能忘的事</h1></header>
      <nav className="v1r-tabs" aria-label="记录分类">
        {([['log','这几天'],['places','走过的路'],['profiles','还在的人'],['memorial','没回来的人']] as const).map(([id,label]) => <button className={tab===id?'active':''} key={id} onClick={()=>setTab(id)}>{label}</button>)}
      </nav>

      {tab === 'log' && <section className="v1r-log" data-tutorial="journal">
        <header><span>长街日志</span><small>记下做过的事，不替明天写答案</small></header>
        {visibleEntries.map((entry) => <article className="v1r-journal-entry" key={entry.id}>
          <small>第 {entry.day} 天 · {entry.kind === 'night' ? '夜里' : entry.kind === 'expedition' ? '街外' : '白天'}</small>
          <h2 className="v1r-journal-title">{entry.title}</h2><p>{entry.body}</p>
        </article>)}
        {pageCount > 1 && <nav className="v1r-journal-pages" aria-label="日志翻页">
          <button disabled={currentPage === 0} onClick={() => setJournalPage(currentPage - 1)}>较新的记录</button>
          <span>第 {currentPage + 1}/{pageCount} 页</span>
          <button disabled={currentPage === pageCount - 1} onClick={() => setJournalPage(currentPage + 1)}>更早的记录</button>
        </nav>}
        {currentPage === 0 && journal.map((entry,index)=><article key={`${entry}-${index}`}><i/><p>{entry}</p></article>)}
        {!journal.length && !recorded.length && <p className="v1r-empty">还没写下什么。能一直这样最好。</p>}
      </section>}

      {tab === 'places' && <section className="v1r-grid"><header><span>走过的路</span><small>记下了 {discovered.length} 处能再去的地方</small></header>{discovered.map((location)=>{const art=locationVisual(location.id);return <article key={location.id} className="v1r-place"><MiniArt asset={art} label={location.name}/><div><h2>{location.name}</h2><p>{location.description}</p><small>{placeWarning(location.danger)}。能翻到：{resourceListLabel(location.primary, location.secondary, location.tertiary)}</small></div></article>})}</section>}

      {tab === 'profiles' && <section className="v1r-profiles"><header><span>还在这里的人</span><small>伤势和脾气都不能记错</small></header>{profiles.map((survivor)=>{const art=characterVisual(survivor.id);const stories=seenCharacterStories.filter((event)=>event.survivorId===survivor.id);return <article key={survivor.id}><div className="v1r-profile-head"><MiniArt asset={art} label={survivor.name}/><div><h2>{survivor.name}</h2><span>{survivor.trait ?? survivor.perk}</span><small>{profileNote(survivor.condition, survivor.energy, survivor.trust)}</small></div></div>{stories.length ? <div className="v1r-profile-stories">{stories.map((story)=><section key={story.id}><strong>{story.title}</strong><p>{story.body}</p></section>)}</div> : <p className="v1r-empty">关于这个人，眼下只知道这些。</p>}</article>})}</section>}

      {tab === 'memorial' && <section className="v1r-memorial"><header><span>没回来的人</span><small>纸上留下了 {state.memorials.length} 个名字</small></header>{state.memorials.length ? state.memorials.map((entry)=><article key={`${entry.survivorId}-${entry.day}`}><h2>{entry.name}</h2><span>第 {entry.day} 天。{entry.cause}</span><p>{entry.epitaph}</p></article>) : <p className="v1r-empty">这一页还是空的。别急着在上面写名字。</p>}<div className="v1r-civilian-note"><strong>街里少掉的人</strong><p>有些人没留下姓名。谁离开了，谁没能熬过夜，只能记在前面的日子里。</p><small>走了 {state.campaignStats.civilianDepartures} 人 · 死了 {state.campaignStats.deaths} 人</small></div></section>}
    </main>
  );
}
