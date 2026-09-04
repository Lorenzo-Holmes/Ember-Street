import { saveGame } from '../../game/storage';
import type { GameState } from '../../game/types';
import { searchForMissing } from '../../game/v060/campaign';
import { missingSearchPreview } from '../../game/v060/decisionReadability';

function commit(next: GameState, setState: (state: GameState) => void) {
  saveGame(next, true);
  setState(next);
}

function DecisionTags({ tags }: { tags: string[] }) {
  return <div className="v6-survivor__status" style={{ margin: '7px 0 2px' }}>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>;
}

export function MissingPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const missing = state.survivors.filter((s) => s.condition === 'missing');
  if (!missing.length) return null;
  return (
    <section className="v6-section v6-missing-ledger">
      <div className="v6-section__head"><div><span>没回来的人</span><h2>还有人没回来</h2></div><small>再拖一天，留下的痕迹只会更少</small></div>
      <div className="v6-survivors">{missing.map((s) => {
        const attempted = state.storyFlags.includes(`missing_search:${s.id}:${state.day}`);
        const teamPreview = missingSearchPreview(state, s.id, 'team');
        const radioPreview = missingSearchPreview(state, s.id, 'radio');
        return (
          <article className="v6-survivor v6-missing-person" key={s.id}>
            <div className="v6-survivor__top"><div><h3>{s.name}</h3><span>昨晚以前，还能在这条街上看见这个人。</span></div><div className="v6-missing-person__mark"><b>未归</b><small>到现在没消息</small></div></div>
            <p>{attempted ? '今天已经出去找过一次了。' : '地上还能找脚印，广播也还能喊名字。只是两条路都要付代价。'}</p>
            <div className="v6-missing-actions">
              <button className="v6-link v6-missing-action" disabled={!teamPreview.available} onClick={() => commit(searchForMissing(state, s.id, 'team'), setState)}>
                <strong>派两个人沿路找</strong><DecisionTags tags={teamPreview.tags}/><small>{teamPreview.summary}</small>
              </button>
              <button className="v6-link v6-missing-action" disabled={!radioPreview.available} onClick={() => commit(searchForMissing(state, s.id, 'radio'), setState)}>
                <strong>在广播里喊名字</strong><DecisionTags tags={radioPreview.tags}/><small>{radioPreview.summary}</small>
              </button>
            </div>
          </article>
        );
      })}</div>
    </section>
  );
}
