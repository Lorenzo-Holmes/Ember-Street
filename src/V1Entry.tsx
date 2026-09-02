import { useEffect, useState } from 'react';
import V060AppHotfix from './V060AppHotfix';
import { GAME_SAVE_EVENT, loadGame, saveGame } from './game/storage';
import type { GameState } from './game/types';
import {
  createV060InitialState,
  resolveExpeditionStance,
  retreatCurrentExpedition,
} from './game/v060/campaign';
import { pendingCampaignEvent } from './game/v060/campaignEvents';
import {
  pendingCommunityDeparture,
  resolveCommunityDeparture,
  type CommunityDepartureResolution,
} from './game/v060/communityDeparture';
import { dayAttentionSummary } from './game/v060/dayAttention';
import { lockDayAssignments, lockDayAssignmentsAndRoute } from './game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from './game/v060/expedition';
import HomeBaseView, { type V1NavTarget } from './ui/v1/HomeBaseView';
import ExploreV1, { type ExploreDecision } from './ui/v1/ExploreV1';
import NightEventV1 from './ui/v1/NightEventV1';
import RecordsV1 from './ui/v1/RecordsV1';
import SurvivorsV1 from './ui/v1/SurvivorsV1';
import V1BottomNav from './ui/v1/V1BottomNav';

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

function initialSnapshot(): GameState {
  const loaded = loadGame();
  if (loaded) return loaded;
  const created = createV060InitialState();
  saveGame(created, true);
  return created;
}

export default function V1Entry() {
  const [snapshot, setSnapshot] = useState<GameState>(() => initialSnapshot());
  const [nav, setNav] = useState<V1NavTarget>('home');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const sync = () => {
      const loaded = loadGame();
      if (loaded) setSnapshot(loaded);
    };
    window.addEventListener(GAME_SAVE_EVENT, sync);
    return () => window.removeEventListener(GAME_SAVE_EVENT, sync);
  }, []);

  useEffect(() => {
    setNav('home');
  }, [snapshot.day]);

  const commit = (next: GameState) => {
    saveGame(next, true);
    setSnapshot(next);
  };

  if (pendingCommunityDeparture(snapshot)) {
    return <CommunityDepartureScreen state={snapshot} onResolved={setSnapshot}/>;
  }

  if (snapshot.phase === 'night') {
    return <NightEventV1 state={snapshot} onCommit={commit}/>;
  }

  if (snapshot.phase === 'expedition') {
    const onStart = (partyIds: string[], locationId: string) => {
      const prepared = snapshot.dayState.assignmentsLocked ? snapshot : lockDayAssignments(snapshot);
      let next = startExpedition(prepared, partyIds, locationId);
      if (!next.expeditionState.departed) return commit(next);
      next = drawExpeditionEvent(next);
      commit({ ...next, phase: 'expedition' });
    };
    const onDecision = (decision: ExploreDecision) => {
      const partyIds = [...snapshot.expeditionState.activePartyIds];
      if (decision === 'retreat') {
        const retreated = retreatCurrentExpedition(snapshot);
        return commit({
          ...retreated,
          phase: 'dusk',
          dayState: {
            ...retreated.dayState,
            assignmentsLocked: true,
            committedSurvivorIds: [...new Set([...retreated.dayState.committedSurvivorIds, ...partyIds])],
          },
        });
      }
      const wasFirstVisit = snapshot.expeditionState.locationId
        ? !snapshot.storyFlags.includes(`visited:${snapshot.expeditionState.locationId}`)
        : false;
      let next = resolveExpeditionStance(snapshot, decision);
      if (wasFirstVisit && next.campaignStats.locationsDiscovered > 0) {
        next = { ...next, campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered - 1 } };
      }
      return commit({
        ...next,
        phase: 'dusk',
        dayState: {
          ...next.dayState,
          assignmentsLocked: true,
          committedSurvivorIds: [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])],
        },
      });
    };
    return <ExploreV1 state={snapshot} onBack={() => setNav('home')} onStart={onStart} onDecision={onDecision}/>;
  }

  if (snapshot.phase !== 'street' && snapshot.phase !== 'assignment') {
    return <V060AppHotfix/>;
  }

  const attention = dayAttentionSummary(snapshot);
  const fixedEvent = !snapshot.expeditionState.departed ? pendingCampaignEvent(snapshot) : null;
  const needsLegacyAttention = Boolean(fixedEvent || attention.missingCount > 0 || attention.socialNeedsAttention);
  if (needsLegacyAttention) {
    return <V060AppHotfix/>;
  }

  const navigate = (target: V1NavTarget) => setNav(target);
  const onStart = (partyIds: string[], locationId: string) => {
    const prepared = snapshot.dayState.assignmentsLocked ? snapshot : lockDayAssignments(snapshot);
    let next = startExpedition(prepared, partyIds, locationId);
    if (!next.expeditionState.departed) return commit(next);
    next = drawExpeditionEvent(next);
    commit({ ...next, phase: 'expedition' });
  };
  const onExploreDecision = (decision: ExploreDecision) => {
    if (decision === 'retreat') {
      const next = retreatCurrentExpedition(snapshot);
      return commit({ ...next, phase: 'dusk' });
    }
    return commit({ ...resolveExpeditionStance(snapshot, decision), phase: 'dusk' });
  };
  const finishAssignments = () => {
    const next = lockDayAssignmentsAndRoute(snapshot);
    commit(next);
    if (next.phase === 'expedition') setNav('explore');
  };

  if (nav === 'explore') {
    return <><ExploreV1 state={snapshot} onBack={() => setNav('home')} onStart={onStart} onDecision={onExploreDecision}/><V1BottomNav active="explore" onNavigate={navigate}/></>;
  }
  if (nav === 'survivors') {
    return <><SurvivorsV1 state={snapshot} onCommit={commit} onBack={() => setNav('home')} onDone={finishAssignments}/><V1BottomNav active="survivors" onNavigate={navigate}/></>;
  }
  if (nav === 'records') {
    return <><RecordsV1 state={snapshot} onBack={() => setNav('home')}/><V1BottomNav active="records" onNavigate={navigate}/></>;
  }
  return <HomeBaseView state={snapshot} onCommit={commit} onNavigate={navigate}/>;
}
