import { useState } from 'react';
import type { DayAssignment, GameState, Survivor, SurvivorCondition } from '../../game/types';
import { assignDayJob, canTakeDayAssignment, clearDayJob } from '../../game/v060/dayManagement';
import { characterVisual, visualAssetStyle } from '../visualAssets';
import './survivors-records.css';

interface SurvivorsV1Props {
  state: GameState;
  onCommit: (next: GameState) => void;
  onBack: () => void;
  onDone?: () => void;
}

const CONDITION: Record<SurvivorCondition, string> = { healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡' };
const JOBS: Array<{ id: DayAssignment; label: string; note: string }> = [
  { id: 'expedition', label: '探索', note: '出去找食物、药、材料和路线。探索队最多两人。' },
  { id: 'repair', label: '维修', note: '把门、墙和线路再撑一晚。' },
  { id: 'medical', label: '医疗', note: '在诊疗站处理伤势。' },
  { id: 'watch', label: '守备', note: '守住街口，降低夜间风险。' },
  { id: 'radio', label: '广播', note: '听外界消息，也可能找到新的居民。' },
  { id: 'cook', label: '炊事', note: '把现有口粮尽量做成能顾到更多人的一顿饭。' },
  { id: 'rest', label: '休息', note: '恢复精力，避免疲劳继续恶化。' },
];

function Portrait({ survivor }: { survivor: Survivor }) {
  const asset = characterVisual(survivor.id);
  return <div className="v1s-portrait">{asset ? <div className="v1s-portrait__art" style={visualAssetStyle(asset)} /> : null}<span>{survivor.name.slice(0, 1)}</span></div>;
}

function SurvivorDetail({ state, survivor, onCommit, onClose }: { state: GameState; survivor: Survivor; onCommit: (next: GameState) => void; onClose: () => void }) {
  const current = state.dayAssignments[survivor.id];
  return (
    <main className="v1s-page">
      <header className="v1s-head"><button onClick={onClose}>← 幸存者</button><span>今日安排</span></header>
      <section className="v1s-detail-hero"><Portrait survivor={survivor}/><div><span>{CONDITION[survivor.condition ?? 'healthy']}</span><h1>{survivor.name}</h1><p>{survivor.trait ?? survivor.perk}</p></div></section>
      <section className="v1s-detail-stats"><div><span>精力</span><strong>{survivor.energy}</strong></div><div><span>信任</span><strong>{survivor.trust ?? 0}</strong></div><div><span>当前</span><strong>{current ? JOBS.find((job) => job.id === current)?.label : '休息'}</strong></div></section>
      <section className="v1s-jobs"><span>今天让他/她去哪里？</span>{JOBS.map((job) => {
        const check = canTakeDayAssignment(state, survivor.id, job.id);
        const active = current === job.id;
        const extraLimit = job.id === 'expedition' && !active && Object.values(state.dayAssignments).filter((value) => value === 'expedition').length >= 2;
        const disabled = !check.allowed || extraLimit || state.dayState.assignmentsLocked;
        return <button key={job.id} className={active ? 'active' : ''} disabled={disabled} onClick={() => onCommit(active ? clearDayJob(state, survivor.id) : assignDayJob(state, survivor.id, job.id))}><strong>{job.label}</strong><span>{job.note}</span><small>{active ? '今天暂定这里' : disabled ? (extraLimit ? '探索队已经有两人' : check.reason ?? '现在不能安排') : '选择'}</small></button>;
      })}</section>
    </main>
  );
}

export default function SurvivorsV1({ state, onCommit, onBack, onDone }: SurvivorsV1Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.survivors.find((survivor) => survivor.id === selectedId);
  if (selected) return <SurvivorDetail state={state} survivor={selected} onCommit={onCommit} onClose={() => setSelectedId(null)}/>;

  const living = state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing');
  const injured = living.filter((survivor) => ['minor', 'serious', 'critical'].includes(survivor.condition ?? '')).length;
  const fatigued = living.filter((survivor) => survivor.condition === 'fatigued' || survivor.energy < 35).length;
  const activeResidents = state.communityState?.activeResidents ?? state.civilianResidents;

  return (
    <main className="v1s-page">
      <header className="v1s-head"><button onClick={onBack}>← 据点</button><span>核心人物</span></header>
      <section className="v1s-summary"><div><span>幸存者</span><strong>{living.length}</strong><small>受伤 {injured} · 疲劳 {fatigued}</small></div><div><span>街区居民</span><strong>{state.civilianResidents}</strong><small>{activeResidents} 人目前能参加社区劳动</small></div></section>
      <p className="v1s-resident-note">下面只列可以单独操作、有姓名和个人状态的核心幸存者。街区居民是另一套群体人口，通过据点里的“后勤 / 维修 / 守备”轮值发挥作用。</p>
      <section className="v1s-list">
        {state.survivors.map((survivor) => {
          const unavailable = survivor.condition === 'dead' || survivor.condition === 'missing';
          const assignment = state.dayAssignments[survivor.id];
          return <article className={unavailable ? 'muted' : ''} key={survivor.id}><Portrait survivor={survivor}/><div className="v1s-card-copy"><span>{CONDITION[survivor.condition ?? 'healthy']} · {survivor.trait ?? survivor.perk}</span><h2>{survivor.name}</h2><p>精力 {survivor.energy} · 信任 {survivor.trust ?? 0}</p><small>{unavailable ? CONDITION[survivor.condition ?? 'dead'] : `今天：${assignment ? JOBS.find((job) => job.id === assignment)?.label : '尚未安排 / 默认休息'}`}</small></div><button disabled={unavailable} onClick={() => setSelectedId(survivor.id)}>{unavailable ? '不可安排' : '查看 / 安排 ›'}</button></article>;
        })}
      </section>
      {onDone ? <button className="v1s-done" onClick={onDone}>安排完成 · 看下一步</button> : null}
    </main>
  );
}
