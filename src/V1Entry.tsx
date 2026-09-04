import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MissingPanel } from './V060AppHotfix';
import SocialStatusPanel from './components/v060/SocialStatusPanel';
import { GAME_SAVE_EVENT, loadGame, saveGame } from './game/storage';
import type { GameState } from './game/types';
import {
  resolveExpeditionStance,
  retreatCurrentExpedition,
} from './game/v060/campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from './game/v060/campaignEvents';
import {
  pendingCommunityDeparture,
  resolveCommunityDeparture,
  type CommunityDepartureResolution,
} from './game/v060/communityDeparture';
import { pendingCommunityRequest } from './game/v060/communityPromises';
import { acknowledgeMissingAttention, dayAttentionSummary } from './game/v060/dayAttention';
import { assignExpeditionRoute, incompleteExpeditionSurvivorIds, lockDayAssignmentsAndRoute } from './game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from './game/v060/expedition';
import { loadMetaProgress, recordEnding, type MetaProgress } from './game/v060/endings';
import { pendingPrincipleDecision } from './game/v060/principles';
import HomeBaseView from './ui/v1/HomeBaseView';
import BuildingsV1 from './ui/v1/BuildingsV1';
import ExploreV1, { type ExploreDecision } from './ui/v1/ExploreV1';
import ExploreRouteV1 from './ui/v1/ExploreRouteV1';
import NightEventV1 from './ui/v1/NightEventV1';
import RecordsV1 from './ui/v1/RecordsV1';
import SurvivorsV1 from './ui/v1/SurvivorsV1';
import V1BottomNav, { type V1NavTarget } from './ui/v1/V1BottomNav';
import { createPreviewState, DevSceneNav, previewSceneFromLocation } from './ui/v1/DevScenePreview';
import { CampaignEventV1, DawnV1, DuskV1, EndingV1, NightSummaryV1 } from './ui/v1/StoryPhasesV1';
import TitleScreen, { PlayerMenu } from './ui/v1/TitleScreen';

function CommunityDepartureScreen({ state, onResolved }: { state: GameState; onResolved: (next: GameState) => void }) {
  const departure = pendingCommunityDeparture(state);
  if (!departure) return null;
  const canOfferRations = state.inventory.ration >= departure.rationCost;
  const remainingIfTheyLeave = Math.max(0, state.civilianResidents - departure.count);

  const resolve = (choice: CommunityDepartureResolution) => {
    const next = resolveCommunityDeparture(state, choice);
    onResolved(next);
  };

  return (
    <main className="v6-shell notebook-page notebook-page--community-event">
      <header className="v6-page-head">
          <span>清晨 · 第 {state.day} 天</span>
        <h1>{departure.title}</h1>
        <p>{departure.body}</p>
      </header>

        <section className="v6-preview" aria-label="有人准备离开长街">
        <div>
          <span>街区居民</span>
          <strong>{state.civilianResidents} 人</strong>
            <small>这些人还在帮着取水、搬运和守夜。</small>
        </div>
        <div>
          <span>准备离开</span>
          <strong>{departure.count} 人</strong>
            <small>他们已经收好随身的东西。人走以后，街里还剩 {remainingIfTheyLeave} 名居民。</small>
        </div>
      </section>

      <section className="v6-section">
        <div className="v6-section__head">
          <div><span>他们在等一句话</span><h2>要不要拿出口粮把人留下</h2></div>
          <small>人一走，今天干活的手就更少。</small>
        </div>

        <div className="v6-expedition-choices">
          <button disabled={!canOfferRations} onClick={() => resolve('ration')}>
            <b>A</b>
            <strong>拿出 {departure.rationCost} 份口粮挽留</strong>
              <span>先让他们留下。仓房里的口粮会少掉这些。</span>
            <div style={{ gridColumn: 2 }}>
            <small>要拿出 {departure.rationCost} 份口粮{!canOfferRations ? '，仓房里已经不够' : ''}。</small>
            </div>
          </button>

          <button onClick={() => resolve('leave')}>
            <b>B</b>
            <strong>不再挽留</strong>
              <span>不再拦着。他们会带上东西离开长街。</span>
            <div style={{ gridColumn: 2 }}>
            <small>今天会少掉 {departure.count} 个人。</small>
            </div>
          </button>
        </div>
      </section>
    </main>
  );
}

function DayAttentionScreen({ state, onCommit, kind }: { state: GameState; onCommit: (next: GameState) => void; kind: 'social' | 'missing' }) {
  const isMissing = kind === 'missing';
  return (
    <main className="v1-mobile-page notebook-page notebook-page--attention">
      <header className="v1-page-title">
          <span>{isMissing ? '有人没回来' : '门口有人等着'}</span>
          <h1>{isMissing ? '天亮了，床还是空的' : '这件事得先给个答复'}</h1>
          <p>{isMissing ? '脚印和广播都还能找，不能再拖。' : '处理完，再把今天的人手写下来。'}</p>
      </header>
      {isMissing
        ? <>
          <MissingPanel state={state} setState={onCommit}/>
          <section className="v6-section v6-missing-continue">
            <p className="v6-message">搜救一天只能做一次；眼下做不了，也得先让街里的人继续干活。明天还会再提醒。</p>
            <button className="v6-cta" onClick={() => onCommit(acknowledgeMissingAttention(state))}>今天先到这里，安排其他人</button>
          </section>
        </>
        : <SocialStatusPanel state={state} onCommit={onCommit}/>}
    </main>
  );
}

function beginNextPlannedExpedition(state: GameState): GameState {
  const [plan, ...remaining] = state.dayState.expeditionQueue ?? [];
  if (!plan) return { ...state, phase: 'dusk', lastMessage: state.lastMessage.replace(/ · 进入黄昏$/, '') };
  const prepared: GameState = {
    ...state,
    phase: 'expedition',
    dayState: { ...state.dayState, expeditionQueue: remaining },
  };
  let next = startExpedition(prepared, plan.partyIds, plan.locationId, true);
  if (!next.expeditionState.departed) return { ...next, phase: 'dusk' };
  next = drawExpeditionEvent(next);
  return { ...next, phase: 'expedition' };
}

export default function V1Entry() {
  const previewScene = previewSceneFromLocation();
  const [session, setSession] = useState<GameState | null>(null);
  const [titlePanel, setTitlePanel] = useState<'main' | 'restart'>('main');
  const returnToTitle = (panel: 'main' | 'restart' = 'main') => {
    setTitlePanel(panel);
    setSession(null);
  };
  if (!previewScene && !session) return <TitleScreen onEnter={setSession} initialPanel={titlePanel}/>;
  return <GameSession initialState={session} onReturnToTitle={returnToTitle}/>;
}

function GameSession({ initialState, onReturnToTitle }: {
  initialState: GameState | null; onReturnToTitle: (panel?: 'main' | 'restart') => void;
}) {
  const previewScene = previewSceneFromLocation();
  const [snapshot, setSnapshot] = useState<GameState>(() => previewScene ? createPreviewState(previewScene) : initialState!);
  const [meta, setMeta] = useState<MetaProgress>(() => loadMetaProgress());
  const [nav, setNav] = useState<V1NavTarget>('home');
  const [routeSurvivorId, setRouteSurvivorId] = useState<string | null>(null);
  const recordedEnding = useRef<string | null>(null);

  const page = (content: ReactNode) => <>{content}{previewScene
    ? <DevSceneNav active={previewScene}/>
    : <PlayerMenu state={snapshot} onReturnToTitle={() => onReturnToTitle()}/>}</>;

  useEffect(() => {
    if (typeof window === 'undefined' || previewScene) return undefined;
    const sync = () => {
      const loaded = loadGame();
      if (loaded) setSnapshot(loaded);
    };
    window.addEventListener(GAME_SAVE_EVENT, sync);
    return () => window.removeEventListener(GAME_SAVE_EVENT, sync);
  }, [previewScene]);

  useEffect(() => {
    if (previewScene || snapshot.phase !== 'ending' || !snapshot.ending || !snapshot.finalHordeResult) return;
    const key = `${snapshot.seed}:${snapshot.ending.id}`;
    if (recordedEnding.current === key) return;
    recordedEnding.current = key;
    setMeta((current) => recordEnding(current, snapshot.ending!, snapshot.finalHordeResult!));
  }, [previewScene, snapshot.phase, snapshot.ending, snapshot.finalHordeResult, snapshot.seed]);

  useEffect(() => {
    setNav('home');
    setRouteSurvivorId(null);
  }, [snapshot.day]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [nav, routeSurvivorId]);

  const commit = (next: GameState) => {
    if (!previewScene) saveGame(next, true);
    setSnapshot(next);
  };

  const restart = () => {
    if (previewScene && typeof window !== 'undefined') {
      window.location.href = window.location.pathname;
      return;
    }
    onReturnToTitle('restart');
  };

  if (pendingCommunityDeparture(snapshot)) {
    return page(<CommunityDepartureScreen state={snapshot} onResolved={commit}/>);
  }

  if (snapshot.phase === 'night') {
    return page(<NightEventV1 state={snapshot} onCommit={commit}/>);
  }

  if (snapshot.phase === 'expedition') {
    const onDecision = (decision: ExploreDecision) => {
      const partyIds = [...snapshot.expeditionState.activePartyIds];
      if (decision === 'retreat') {
        const retreated = retreatCurrentExpedition(snapshot);
        const settled: GameState = {
          ...retreated,
          phase: 'dusk',
          dayState: {
            ...retreated.dayState,
            assignmentsLocked: true,
            committedSurvivorIds: [...new Set([...retreated.dayState.committedSurvivorIds, ...partyIds])],
          },
        };
        return commit(beginNextPlannedExpedition(settled));
      }
      const wasFirstVisit = snapshot.expeditionState.locationId
        ? !snapshot.storyFlags.includes(`visited:${snapshot.expeditionState.locationId}`)
        : false;
      let next = resolveExpeditionStance(snapshot, decision);
      if (wasFirstVisit && next.campaignStats.locationsDiscovered > 0) {
        next = { ...next, campaignStats: { ...next.campaignStats, locationsDiscovered: next.campaignStats.locationsDiscovered - 1 } };
      }
      const settled: GameState = {
        ...next,
        phase: 'dusk',
        dayState: {
          ...next.dayState,
          assignmentsLocked: true,
          committedSurvivorIds: [...new Set([...next.dayState.committedSurvivorIds, ...partyIds])],
        },
      };
      return commit(beginNextPlannedExpedition(settled));
    };
    return page(<ExploreV1 state={snapshot} onBack={() => undefined} onStart={() => undefined} onDecision={onDecision}/>);
  }

  if (snapshot.phase === 'dusk') return page(<DuskV1 state={snapshot} onCommit={commit}/>);
  if (snapshot.phase === 'night-summary') return page(<NightSummaryV1 state={snapshot} onCommit={commit}/>);
  if (snapshot.phase === 'summary' || snapshot.phase === 'dawn') return page(<DawnV1 state={snapshot} onCommit={commit}/>);
  if (snapshot.phase === 'ending') {
    const endingMeta = previewScene && snapshot.ending
      ? { ...meta, endingsUnlocked: [...new Set([...meta.endingsUnlocked, snapshot.ending.id])] }
      : meta;
    return page(<EndingV1 state={snapshot} meta={endingMeta} onRestart={restart}/>);
  }

  const attention = dayAttentionSummary(snapshot);
  const fixedEvent = !snapshot.expeditionState.departed ? pendingCampaignEvent(snapshot) : null;
  const urgentSocialChoice = Boolean(pendingPrincipleDecision(snapshot) || pendingCommunityRequest(snapshot));
  if (fixedEvent) {
    return page(<CampaignEventV1 state={snapshot} event={fixedEvent} onCommit={(current, eventId) => commit(resolveCampaignEvent(current, eventId))}/>);
  }
  if (attention.missingCount > 0) {
    return page(<DayAttentionScreen state={snapshot} onCommit={commit} kind="missing"/>);
  }
  if (urgentSocialChoice) {
    return page(<DayAttentionScreen state={snapshot} onCommit={commit} kind="social"/>);
  }

  const navigate = (target: V1NavTarget) => setNav(target);
  const finishAssignments = () => {
    const locked = lockDayAssignmentsAndRoute(snapshot);
    const next = locked.phase === 'expedition' ? beginNextPlannedExpedition(locked) : locked;
    commit(next);
  };

  if (routeSurvivorId) {
    return page(<><ExploreRouteV1 state={snapshot} survivorId={routeSurvivorId} onBack={() => setRouteSurvivorId(null)} onConfirm={(locationId) => {
      commit(assignExpeditionRoute(snapshot, routeSurvivorId, locationId));
      setRouteSurvivorId(null);
      setNav('survivors');
    }}/><V1BottomNav active="survivors" onNavigate={(target) => { setRouteSurvivorId(null); navigate(target); }}/></>);
  }
  if (nav === 'survivors') {
    const incomplete = incompleteExpeditionSurvivorIds(snapshot);
    return page(<><SurvivorsV1 state={snapshot} onCommit={commit} onDone={finishAssignments} onChooseRoute={setRouteSurvivorId} doneDisabled={incomplete.length > 0} doneHint="还有人的路没定下来"/><V1BottomNav active="survivors" onNavigate={navigate}/></>);
  }
  if (nav === 'buildings') {
    return page(<><BuildingsV1 state={snapshot} onCommit={commit}/><V1BottomNav active="buildings" onNavigate={navigate}/></>);
  }
  if (nav === 'records') {
    return page(<><RecordsV1 state={snapshot}/><V1BottomNav active="records" onNavigate={navigate}/></>);
  }
  return page(<HomeBaseView state={snapshot} onCommit={commit} onNavigate={navigate}/>);
}
