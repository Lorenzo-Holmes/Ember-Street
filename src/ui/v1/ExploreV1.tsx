import { useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { EXPEDITION_LOCATIONS, currentExpeditionEvent, expeditionRiskLabel, expeditionRiskScore } from '../../game/v060/expedition';
import { isLocationUnlocked } from '../../game/v060/campaignEvents';
import { expeditionDecisionPreview } from '../../game/v060/decisionReadability';
import { eventVisual, locationVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import { resourceListLabel } from './labels';
import { energyLabel } from '../../game/v060/trust';
import './explore-night.css';
import './explore-safe-area.css';

export type ExploreDecision = 'push' | 'careful' | 'retreat';

function riskNote(risk: ReturnType<typeof expeditionRiskLabel>): string {
  if (risk === 'safe') return '没见动静';
  if (risk === 'cautious') return '进去得小心';
  if (risk === 'dangerous') return '容易出事';
  return '不该轻易进去';
}

interface ExploreV1Props {
  state: GameState;
  onBack: () => void;
  onStart: (partyIds: string[], locationId: string) => void;
  onDecision: (decision: ExploreDecision) => void;
}

function Art({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1e-art" aria-label={label} style={visualAssetStyle(asset)}>{!asset ? <div><strong>{label}</strong><small>没人看清这里的样子</small></div> : null}</div>;
}

export default function ExploreV1({ state, onBack, onStart, onDecision }: ExploreV1Props) {
  const eligibleParty = useMemo(() => state.survivors.filter((survivor) => state.dayAssignments[survivor.id] === 'expedition' && survivor.condition !== 'dead' && survivor.condition !== 'missing' && survivor.condition !== 'critical' && survivor.condition !== 'serious'), [state]);
  const locations = useMemo(() => EXPEDITION_LOCATIONS.filter((location) => isLocationUnlocked(state, location.id)), [state]);
  const [party, setParty] = useState<string[]>(eligibleParty.slice(0, 2).map((survivor) => survivor.id));
  const [locationId, setLocationId] = useState(locations.at(-1)?.id ?? locations[0]?.id ?? 'convenience-store');
  const [choosingParty, setChoosingParty] = useState(false);

  if (state.expeditionState.departed) {
    const event = currentExpeditionEvent(state);
    const activeLocationId = state.expeditionState.locationId ?? locationId;
    const location = EXPEDITION_LOCATIONS.find((item) => item.id === activeLocationId);
    const risk = expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, activeLocationId));
    const art = event ? eventVisual(event.id) : locationVisual(activeLocationId);
    const decisions: Array<[ExploreDecision, string, string]> = [
      ['push', '往里再走', '里面还有东西，也还有声音。'],
      ['careful', '贴着边找', '绕开动静大的地方，不贪最后一点。'],
      ['retreat', '马上回去', '空手回去，也比少一个人强。'],
    ];
    return (
      <main className="v1e-page notebook-page notebook-page--explore notebook-page--expedition-event">
        <header className="v1e-head"><span>人已经在街外</span><span>{location?.name ?? '街外'} · {riskNote(risk)}</span></header>
        <Art asset={art} label={event?.title ?? location?.name ?? '探索事件'} />
        <section className="v1e-event-copy"><span>他们走到这里</span><h1>{event?.title ?? '前面没有声音'}</h1><p>{event?.body ?? '没人知道拐角后面有什么。'}</p></section>
        <div className="v1e-decisions">
          {decisions.map(([id, label, detail]) => {
            const preview = expeditionDecisionPreview(state, id, risk);
            return <button key={id} onClick={() => onDecision(id)}><strong>{label}</strong><span>{detail}</span><div>{preview.tags.map((tag) => <em key={tag}>{tag}</em>)}</div></button>;
          })}
        </div>
      </main>
    );
  }

  if (choosingParty) {
    return (
      <main className="v1e-page notebook-page notebook-page--explore notebook-page--party">
        <header className="v1e-head"><button onClick={() => setChoosingParty(false)}>← 选择路线</button><span>同行的人 · 最多两个</span></header>
        <section className="v1e-party-list">
          {eligibleParty.map((survivor) => {
            const active = party.includes(survivor.id);
            return <button key={survivor.id} className={active ? 'active' : ''} onClick={() => setParty((current) => active ? current.filter((id) => id !== survivor.id) : current.length < 2 ? [...current, survivor.id] : current)}><strong>{survivor.name}</strong><span>{energyLabel(survivor.energy)} · {survivor.trait ?? survivor.perk}</span><small>{active ? '今天一起出去' : '带上'}</small></button>;
          })}
        </section>
        <button className="v1e-primary" disabled={!party.length} onClick={() => setChoosingParty(false)}>名单就这样 · {party.length}/2</button>
      </main>
    );
  }

  const partyNames = party.map((id) => state.survivors.find((survivor) => survivor.id === id)?.name).filter(Boolean).join('、');
  return (
    <main className="v1e-page notebook-page notebook-page--explore notebook-page--route">
      <header className="v1e-head"><button onClick={onBack}>← 重新安排</button><span>白天 · 探索</span></header>
      <section className="v1e-party-summary"><div><span>谁去街外</span><strong>{partyNames || '还没有人'}</strong><small>最多两个人。名单得先在据点里记好。</small></div><button onClick={() => setChoosingParty(true)}>换人 ›</button></section>
      <section className="v1e-route-title"><span>今天去哪？</span><h1>先看清这条路，再决定要不要去。</h1></section>
      <div className="v1e-location-list">
        {locations.map((location) => {
          const active = location.id === locationId;
          const risk = expeditionRiskLabel(expeditionRiskScore(state, party, location.id));
          const art = locationVisual(location.id);
          return <button className={`v1e-location ${active ? 'active' : ''}`} key={location.id} onClick={() => setLocationId(location.id)}><Art asset={art} label={location.name}/><div className="v1e-location__copy"><div><strong>{location.name}</strong><em>{riskNote(risk)}</em></div><p>{location.description}</p><small>能翻到：{resourceListLabel(location.primary, location.secondary, location.tertiary)}</small></div></button>;
        })}
      </div>
      <button className="v1e-primary" disabled={!party.length || !locations.length} onClick={() => onStart(party, locationId)}>沿这条路出去</button>
    </main>
  );
}
