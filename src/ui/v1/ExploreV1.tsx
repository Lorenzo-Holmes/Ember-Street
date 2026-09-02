import { useMemo, useState } from 'react';
import type { GameState } from '../../game/types';
import { EXPEDITION_LOCATIONS, currentExpeditionEvent, expeditionRiskLabel, expeditionRiskScore } from '../../game/v060/expedition';
import { isLocationUnlocked } from '../../game/v060/campaignEvents';
import { expeditionDecisionPreview } from '../../game/v060/decisionReadability';
import { eventVisual, locationVisual, visualAssetStyle, type VisualAsset } from '../visualAssets';
import { resourceLabel } from './labels';
import './explore-night.css';

export type ExploreDecision = 'push' | 'careful' | 'retreat';

interface ExploreV1Props {
  state: GameState;
  onBack: () => void;
  onStart: (partyIds: string[], locationId: string) => void;
  onDecision: (decision: ExploreDecision) => void;
}

function Art({ asset, label }: { asset?: VisualAsset; label: string }) {
  return <div className="v1e-art" style={visualAssetStyle(asset)}>{!asset ? <div><strong>{label}</strong><small>插画暂缺</small></div> : null}</div>;
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
      ['push', '继续深入', '再往里面走，也许还能带回更多。'],
      ['careful', '谨慎搜索', '绕开动静最大的地方，不贪最后一点。'],
      ['retreat', '现在撤回', '今天空手也可以，人回来更重要。'],
    ];
    return (
      <main className="v1e-page">
        <header className="v1e-head"><span>探索中 · 已经离开据点</span><span>{location?.name ?? '街外'} · {risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险' : '极险'}</span></header>
        <Art asset={art} label={event?.title ?? location?.name ?? '探索事件'} />
        <section className="v1e-event-copy"><span>街外传回来的消息</span><h1>{event?.title ?? '前面没有声音'}</h1><p>{event?.body ?? '没人知道拐角后面有什么。'}</p></section>
        <div className="v1e-decisions">
          {decisions.map(([id, label, detail]) => {
            const preview = expeditionDecisionPreview(state, id, risk);
            return <button key={id} onClick={() => onDecision(id)}><strong>{label}</strong><span>{detail}</span><div>{preview.tags.map((tag) => <em key={tag}>{tag}</em>)}</div><small>{preview.summary}</small></button>;
          })}
        </div>
      </main>
    );
  }

  if (choosingParty) {
    return (
      <main className="v1e-page">
        <header className="v1e-head"><button onClick={() => setChoosingParty(false)}>← 选择路线</button><span>探索队 · 最多两人</span></header>
        <section className="v1e-party-list">
          {eligibleParty.map((survivor) => {
            const active = party.includes(survivor.id);
            return <button key={survivor.id} className={active ? 'active' : ''} onClick={() => setParty((current) => active ? current.filter((id) => id !== survivor.id) : current.length < 2 ? [...current, survivor.id] : current)}><strong>{survivor.name}</strong><span>精力 {survivor.energy} · {survivor.trait ?? survivor.perk}</span><small>{active ? '已选入探索队' : '点这里加入'}</small></button>;
          })}
        </section>
        <button className="v1e-primary" disabled={!party.length} onClick={() => setChoosingParty(false)}>确定 · {party.length}/2 人</button>
      </main>
    );
  }

  const partyNames = party.map((id) => state.survivors.find((survivor) => survivor.id === id)?.name).filter(Boolean).join('、');
  return (
    <main className="v1e-page">
      <header className="v1e-head"><button onClick={onBack}>← 重新安排</button><span>白天 · 探索</span></header>
      <section className="v1e-party-summary"><div><span>今天谁出去</span><strong>{partyNames || '还没有人'}</strong><small>最多两人。人物必须已经被安排为探索岗位。</small></div><button onClick={() => setChoosingParty(true)}>重新选择 ›</button></section>
      <section className="v1e-route-title"><span>今天去哪？</span><h1>只看一条路，也要先知道为什么值得去</h1></section>
      <div className="v1e-location-list">
        {locations.map((location) => {
          const active = location.id === locationId;
          const risk = expeditionRiskLabel(expeditionRiskScore(state, party, location.id));
          const art = locationVisual(location.id);
          return <button className={`v1e-location ${active ? 'active' : ''}`} key={location.id} onClick={() => setLocationId(location.id)}><Art asset={art} label={location.name}/><div className="v1e-location__copy"><div><strong>{location.name}</strong><em>{risk === 'safe' ? '安全' : risk === 'cautious' ? '谨慎' : risk === 'dangerous' ? '危险' : '极险'}</em></div><p>{location.description}</p><small>可能找到：{resourceLabel(location.primary)} / {resourceLabel(location.secondary)}</small></div></button>;
        })}
      </div>
      <button className="v1e-primary" disabled={!party.length || !locations.length} onClick={() => onStart(party, locationId)}>确定路线 · 出发</button>
    </main>
  );
}
