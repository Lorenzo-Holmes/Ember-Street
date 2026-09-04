import type { GameState } from '../../game/types';
import { previewNightPreparation } from '../../game/v060/dayManagement';
import { defenseCondition, defenseNumber, defenseRiskNotes, guardCoverageLabel, signedDefense } from '../../game/v060/defenseFeedback';
import './defense-panel.css';

export default function DefensePanel({ state, context = 'home' }: { state: GameState; context?: 'home' | 'dusk' | 'dawn' }) {
  const record = state.defenseNight;
  const isDawn = context === 'dawn';
  const currentRecord = record && (isDawn ? record.day === state.day : record.day === state.day - 1);
  const notes = defenseRiskNotes(state);
  return <section className={`v1-defense-panel ${state.defense < 40 ? 'is-low' : ''}`} aria-label={isDawn ? '防线清点' : '街口防线'}>
    <header>
      <div><span>{isDawn ? '天亮清点' : '街口记录'}</span><h2>防线</h2></div>
      <div className="v1-defense-panel__value"><strong>{defenseNumber(state.defense)}</strong><small>/100</small><em>{defenseCondition(state.defense)}</em></div>
    </header>
    {isDawn ? currentRecord ? <>
      <dl className="v1-defense-panel__ledger">
        <div><dt>{record.complete ? '入夜时' : '补记起点'}</dt><dd>{defenseNumber(record.start)}</dd></div>
        <div><dt>受损</dt><dd>−{defenseNumber(record.damaged)}</dd></div>
        <div><dt>加固</dt><dd>+{defenseNumber(record.reinforced)}</dd></div>
        <div><dt>净变化</dt><dd>{signedDefense(record.end - record.start)}</dd></div>
      </dl>
      {!record.complete && <p>本夜中途开始补记，以上不是整夜合计。</p>}
    </> : <p>旧记录未保留完整的增减明细；这里只列当前防线，不推算昨夜损失。</p>
      : currentRecord ? <p className="v1-defense-panel__change">上一夜{record.complete ? '' : '已记部分'}：{signedDefense(record.end - record.start)}（{defenseNumber(record.start)} → {defenseNumber(record.end)}）</p> : null}
    {context === 'home' && <p className="v1-defense-panel__duty"><b>守岗安排</b>{guardCoverageLabel(previewNightPreparation(state))}</p>}
    {!isDawn && <p className="v1-defense-panel__risk">{notes[0]}</p>}
    {!isDawn && <details>
      <summary>查看风险与加固说明</summary>
      <ul>{notes.slice(1).map((note) => <li key={note}>{note}</li>)}</ul>
      <p>防线反映街口整体防御，守岗安排另记。守备、维修和居民维修轮值可在入夜时增加防线；当前数值尚未计入今天未结算的增益。</p>
      <p>风险增加不等于当晚必定发生损失。守岗和其他准备仍会影响结果。</p>
    </details>}
  </section>;
}
