import { useState } from 'react';
import type { DayAssignment, GameState, Survivor, SurvivorCondition } from '../../game/types';
import { assignDayJob, canTakeDayAssignment, expeditionRouteFor } from '../../game/v060/dayManagement';
import { locationForId } from '../../game/v060/expedition';
import { energyLabel } from '../../game/v060/trust';
import { characterVisual, visualAssetStyle } from '../visualAssets';
import './survivors-records.css';

interface SurvivorsV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
  onDone?: () => void;
  onChooseRoute?: (survivorId: string) => void;
  doneDisabled?: boolean;
  doneHint?: string;
}

const CONDITION: Record<SurvivorCondition, string> = { healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡' };
const CONDITION_NOTE: Record<SurvivorCondition, string> = {
  healthy: '身上没添新伤',
  fatigued: '走路已经发沉',
  minor: '伤口还没收好',
  serious: '伤得不轻，今天不能硬撑',
  critical: '还没脱离危险',
  missing: '昨晚以后没见回来',
  dead: '名字已经记到后页',
};
const JOBS: Array<{ id: DayAssignment; label: string; note: string }> = [
  { id: 'expedition', label: '探索', note: '街外还有东西，但未必还有路。' },
  { id: 'repair', label: '维修', note: '把门、墙和线路再撑一晚。' },
  { id: 'medical', label: '医疗', note: '去诊疗室守着，先照看伤得最重的人。' },
  { id: 'watch', label: '守备', note: '盯住街口，别让动静摸进来。' },
  { id: 'radio', label: '广播', note: '听听外面还有没有人在说话。' },
  { id: 'cook', label: '炊事', note: '让锅里的东西，尽量够每个人一口。' },
  { id: 'rest', label: '休息', note: '今天别出门了，先把力气养回来。' },
];

function Portrait({ survivor }: { survivor: Survivor }) {
  const asset = characterVisual(survivor.id);
  return <div className="v1s-portrait">{asset ? <div className="v1s-portrait__art" style={visualAssetStyle(asset)} /> : null}<span>{survivor.name.slice(0, 1)}</span></div>;
}

function strengthNote(energy: number): string {
  if (energy >= 75) return '还能走远路';
  if (energy >= 50) return '还能撑过今天';
  if (energy >= 30) return '脚下已经不稳';
  return '今天不能再硬撑';
}

function assignmentNote(state: GameState, survivorId: string): string {
  const assignment = state.dayAssignments[survivorId];
  if (assignment === 'expedition') {
    const route = expeditionRouteFor(state, survivorId);
    return route ? `今天去街外：${locationForId(route)?.name ?? '路还没定'}` : '今天要去街外，路还没定';
  }
  if (assignment === 'repair') return '今天去补门墙';
  if (assignment === 'medical') return '今天守诊疗室';
  if (assignment === 'watch') return '今天守街口';
  if (assignment === 'radio') return '今天守广播';
  if (assignment === 'cook') return '今天守锅';
  if (assignment === 'rest') return '今天留在屋里缓一缓';
  return '今天的去处还没写';
}

function SurvivorDetail({ state, survivor, onCommit, onClose, onChooseRoute }: { state: GameState; survivor: Survivor; onCommit: (next: GameState) => void; onClose: () => void; onChooseRoute?: (survivorId: string) => void }) {
  const current = state.dayAssignments[survivor.id];
  return (
    <main className="v1s-page notebook-page notebook-page--survivors notebook-page--survivor-detail">
      <header className="v1s-head"><button onClick={onClose}>← 幸存者</button><span>今天去哪里</span></header>
      <section className="v1s-detail-hero"><Portrait survivor={survivor}/><div><span>{CONDITION[survivor.condition ?? 'healthy']}</span><h1>{survivor.name}</h1><p>{survivor.trait ?? survivor.perk}</p></div></section>
        <section className="v1s-detail-stats"><div><span>身体</span><strong>{CONDITION[survivor.condition ?? 'healthy']}</strong></div><div><span>力气</span><strong>{energyLabel(survivor.energy)}</strong></div><div><span>今天</span><strong>{current ? JOBS.find((job) => job.id === current)?.label : '未安排'}</strong></div></section>
      <section className="v1s-jobs"><span>今天让{survivor.name}去哪儿？</span>{JOBS.map((job) => {
        const check = canTakeDayAssignment(state, survivor.id, job.id);
        const active = current === job.id;
        const disabled = !check.allowed || state.dayState.assignmentsLocked;
        return <button key={job.id} className={active ? 'active' : ''} disabled={disabled} onClick={() => {
          if (job.id === 'expedition' && onChooseRoute) return onChooseRoute(survivor.id);
          if (!active) onCommit(assignDayJob(state, survivor.id, job.id));
          onClose();
          }}><strong>{job.label}</strong><span>{job.note}</span><small>{active && job.id === 'expedition' ? '重新选路' : active ? '已经记下' : disabled ? (check.reason ?? '今天去不了') : job.id === 'expedition' ? '先把路定下' : '记在这里'}</small></button>;
      })}</section>
    </main>
  );
}

export default function SurvivorsV1({ state, onCommit, onDone, onChooseRoute, doneDisabled, doneHint }: SurvivorsV1Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.survivors.find((survivor) => survivor.id === selectedId);
  if (selected) return <SurvivorDetail state={state} survivor={selected} onCommit={onCommit} onClose={() => setSelectedId(null)} onChooseRoute={onChooseRoute}/>;

  const living = state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing');
  const injured = living.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const fatigued = living.filter((survivor) => survivor.condition === 'fatigued' || survivor.energy < 35).length;
  const activeResidents = state.communityState?.activeResidents ?? state.civilianResidents;

  return (
    <main className="v1s-page notebook-page notebook-page--survivors">
      <header className="v1s-head v1s-head--top"><span>今天的人手</span><h1>谁还能出门</h1></header>
      <section className="v1s-summary"><div><span>能点名的人</span><strong>{living.length}</strong><small>{injured} 人伤口未稳 · {fatigued} 人已经很累</small></div><div><span>街里其他人</span><strong>{state.civilianResidents}</strong><small>{activeResidents} 人今天还能搭手</small></div></section>
      <p className="v1s-resident-note">能出门的、必须留下的，先在这里写清。其余人照旧去取水、搬东西、守街口。</p>
      <section className="v1s-list">
        {state.survivors.map((survivor) => {
          const unavailable = survivor.condition === 'dead' || survivor.condition === 'missing';
          const condition = survivor.condition ?? 'healthy';
          return <article className={unavailable ? 'muted' : ''} key={survivor.id}><Portrait survivor={survivor}/><div className="v1s-card-copy"><span>{survivor.trait ?? survivor.perk}</span><h2>{survivor.name}</h2><p>{CONDITION_NOTE[condition]}。{strengthNote(survivor.energy)}。</p><small>{unavailable ? CONDITION_NOTE[condition] : assignmentNote(state, survivor.id)}</small></div><button disabled={unavailable} onClick={() => setSelectedId(survivor.id)}>{unavailable ? '不在这里' : '翻开 ›'}</button></article>;
        })}
      </section>
      {onDone ? <button className="v1s-done" disabled={doneDisabled} onClick={onDone}>{doneDisabled ? doneHint ?? '还有人的路没定' : '这张名单就这么定'}</button> : null}
    </main>
  );
}
