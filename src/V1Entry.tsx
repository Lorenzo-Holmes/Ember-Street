import { useEffect, useState } from 'react';
import V060AppHotfix from './V060AppHotfix';
import { GAME_SAVE_EVENT, loadGame, saveGame } from './game/storage';
import type { GameState } from './game/types';
import {
  pendingCommunityDeparture,
  resolveCommunityDeparture,
  type CommunityDepartureResolution,
} from './game/v060/communityDeparture';

function CommunityDepartureScreen({ state, onResolved }: { state: GameState; onResolved: (next: GameState) => void }) {
  const departure = pendingCommunityDeparture(state);
  if (!departure) return null;
  const canOfferRations = state.inventory.ration >= departure.rationCost;
  const remainingIfTheyLeave = Math.max(0, state.civilianResidents - departure.count);

  const resolve = (choice: CommunityDepartureResolution) => {
    const next = resolveCommunityDeparture(state, choice);
    saveGame(next, true);
    onResolved(next);
  };

  return (
    <main className="v6-shell">
      <header className="v6-page-head">
        <span>清晨 · DAY {state.day} · 街里的人</span>
        <h1>{departure.title}</h1>
        <p>{departure.body}</p>
      </header>

      <section className="v6-preview" aria-label="居民离开前的街区状态">
        <div>
          <span>街区居民</span>
          <strong>{state.civilianResidents} 人</strong>
          <small>他们不是核心幸存者角色，但同样吃饭、搬东西、守门，也会决定这条街还能不能运转。</small>
        </div>
        <div>
          <span>准备离开</span>
          <strong>{departure.count} 人</strong>
          <small>让他们走以后，街区还剩 {remainingIfTheyLeave} 名普通居民；这不计入死亡。</small>
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section__head">
          <div><span>现在得给一句话</span><h2>留下他们，还是让他们自己选路</h2></div>
          <small>这是人口流失，不是死亡事件</small>
        </div>

        <div className="v6-expedition-choices">
          <button disabled={!canOfferRations} onClick={() => resolve('ration')}>
            <b>A</b>
            <strong>拿出 {departure.rationCost} 份口粮，请他们再留下</strong>
            <span>先把眼前最直接的不安压下来。人还在，库存会更薄。</span>
            <div style={{ gridColumn: 2 }}>
              <small>口粮 -{departure.rationCost} · 居民不减少 · 希望 +1 · 压力下降{!canOfferRations ? ' · 口粮不够' : ''}</small>
            </div>
          </button>

          <button onClick={() => resolve('leave')}>
            <b>B</b>
            <strong>让他们走</strong>
            <span>他们没有死，也没有失踪。只是决定不再把明天押在这条街上。</span>
            <div style={{ gridColumn: 2 }}>
              <small>街区居民 -{departure.count} · 希望 -1 · 压力上升 · 不增加死亡统计</small>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}

export default function V1Entry() {
  const [snapshot, setSnapshot] = useState<GameState | null>(() => loadGame());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => setSnapshot(loadGame());
    window.addEventListener(GAME_SAVE_EVENT, sync);
    return () => window.removeEventListener(GAME_SAVE_EVENT, sync);
  }, []);

  if (snapshot && pendingCommunityDeparture(snapshot)) {
    return <CommunityDepartureScreen state={snapshot} onResolved={setSnapshot}/>;
  }

  return <V060AppHotfix/>;
}
