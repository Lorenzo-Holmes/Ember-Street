import { describe, expect, it } from 'vitest';
import { createPendingCheck } from '../src/game/dice';
import { createV060InitialState, finalHordeResultFor, finalizeDay } from '../src/game/v060/campaign';
import { nightEventWeight } from '../src/game/v060/causalNight';
import { communityCookingSupport, communityDefenseSupport, communityRepairSupport } from '../src/game/v060/community';
import { expeditionRiskScore } from '../src/game/v060/expedition';
import { locationMemory, locationMemoryRiskModifier, locationMemorySummary } from '../src/game/v060/locationMemory';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import { EMERGENCY_EVENTS, NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';
import { choosePrinciple, pendingPrincipleDecision } from '../src/game/v060/principles';
import { normalizeSocialState } from '../src/game/v060/socialPressure';
import type { GameState, StreetPrincipleId } from '../src/game/types';

function withPrinciples(state: GameState, principles: StreetPrincipleId[]): GameState {
  return { ...state, socialState: { ...normalizeSocialState(state.socialState), principles } };
}

function withResidents(state: GameState): GameState {
  return {
    ...state,
    civilianResidents: 8,
    communityState: { activeResidents: 8, pendingResidents: 0, supportMode: 'logistics', lastSupportDay: state.day },
    storyFlags: [...state.storyFlags, 'community_rotation_unlocked'],
  };
}

describe('v0.6 street principles', () => {
  it('normalizes old social saves with an empty principle list', () => {
    expect(normalizeSocialState({ pressure: 2, fulfilledPromises: 0, brokenPromises: 0, activePromise: null }).principles).toEqual([]);
  });

  it('offers one decision at day 7 and prevents choosing twice in the same stage', () => {
    const base: GameState = { ...createV060InitialState(99101), day: 7 };
    const decision = pendingPrincipleDecision(base);
    expect(decision?.day).toBe(7);
    const chosen = choosePrinciple(base, 'everyone-shares');
    expect(chosen.socialState?.principles).toContain('everyone-shares');
    expect(pendingPrincipleDecision(chosen)).toBeNull();
    expect(choosePrinciple(chosen, 'outward-search')).toEqual(chosen);
  });

  it('catches up overdue stages in order at day 21', () => {
    let state: GameState = { ...createV060InitialState(99102), day: 21 };
    expect(pendingPrincipleDecision(state)?.day).toBe(7);
    state = choosePrinciple(state, 'triage-first');
    expect(pendingPrincipleDecision(state)?.day).toBe(14);
    state = choosePrinciple(state, 'core-leads');
    expect(pendingPrincipleDecision(state)?.day).toBe(21);
  });

  it('everyone-shares increases visible resident cooking support', () => {
    const base = withResidents({ ...createV060InitialState(99103), day: 7 });
    const baseline = communityCookingSupport(base);
    const chosen = choosePrinciple(base, 'everyone-shares');
    expect(communityCookingSupport(chosen)).toBeGreaterThan(baseline);
  });

  it('community-shares-risk strengthens repair and defense labor', () => {
    let base: GameState = withResidents({ ...createV060InitialState(99104), day: 14 });
    base = withPrinciples(base, ['everyone-shares']);
    base = { ...base, communityState: { ...base.communityState, supportMode: 'repair', lastSupportDay: 14 } };
    const repairBefore = communityRepairSupport(base);
    const defenseBefore = communityDefenseSupport({ ...base, communityState: { ...base.communityState, supportMode: 'defense' } });
    const chosen = choosePrinciple(base, 'community-shares-risk');
    expect(communityRepairSupport(chosen)).toBeGreaterThan(repairBefore);
    expect(communityDefenseSupport({ ...chosen, communityState: { ...chosen.communityState, supportMode: 'defense' } })).toBeGreaterThan(defenseBefore);
  });

  it('outward-search raises expedition risk', () => {
    let base: GameState = { ...createV060InitialState(99105), day: 7 };
    base = { ...base, dayAssignments: { 'lin-xia': 'expedition' }, dayState: { ...base.dayState, assignmentsLocked: true } };
    const before = expeditionRiskScore(base, ['lin-xia'], 'convenience-store');
    const chosen = choosePrinciple(base, 'outward-search');
    expect(expeditionRiskScore(chosen, ['lin-xia'], 'convenience-store')).toBe(before + 1);
  });

  it('triage-first reduces a critical stable-treatment cost to one medicine', () => {
    let state: GameState = { ...createV060InitialState(99106), day: 7 };
    state = choosePrinciple(state, 'triage-first');
    state = {
      ...state,
      day: 8,
      survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'critical' as const, untreatedDays: 1 } : survivor),
      storyFlags: [...state.storyFlags, 'medical_crisis_pending:lin-xia'],
    };
    const event = mortalityEventById(state, 'mortality-medical:lin-xia');
    expect(event?.choices.find((choice) => choice.id === 'mortality-medicine')?.cost?.medicine).toBe(1);
  });

  it('core-leads stacks with the hardened mental modifier system', () => {
    let state: GameState = withPrinciples({ ...createV060InitialState(99107), day: 14 }, ['everyone-shares']);
    state = choosePrinciple(state, 'core-leads');
    state = { ...state, survivors: state.survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, mentalState: 'focused' as const, mentalUntilDay: 16 } : survivor) };
    const checked = createPendingCheck(state, { source: 'night', eventId: 'test', choiceId: 'act', label: '测试', actorId: 'lin-xia', mode: 'normal', modifiers: [] });
    expect(checked.pendingCheck?.modifiers).toEqual(expect.arrayContaining([
      { label: '原则·核心带头', value: 1 },
      { label: '心理 · 专注', value: 1 },
    ]));
  });

  it('preserve-strength adds six extra energy to a resting survivor', () => {
    const seed = { ...createV060InitialState(99108), day: 14, dayAssignments: { 'lin-xia': 'rest' as const } };
    const baseline = withPrinciples(seed, ['everyone-shares']);
    const protectedState = choosePrinciple(baseline, 'preserve-strength');
    const baseResolved = finalizeDay(baseline);
    const protectedResolved = finalizeDay(protectedState);
    const baseEnergy = baseResolved.survivors.find((survivor) => survivor.id === 'lin-xia')!.energy;
    const protectedEnergy = protectedResolved.survivors.find((survivor) => survivor.id === 'lin-xia')!.energy;
    expect(protectedEnergy).toBe(Math.min(100, baseEnergy + 6));
  });

  it('hold-the-street can turn a damaged DAY29 defense into a held result', () => {
    const base = withPrinciples({ ...createV060InitialState(99109), day: 29, defense: 46, hope: 35 }, ['everyone-shares', 'core-leads']);
    expect(finalHordeResultFor(base)).toBe('damaged');
    const committed = withPrinciples(base, ['everyone-shares', 'core-leads', 'hold-the-street']);
    expect(finalHordeResultFor(committed)).toBe('held');
  });

  it('prepare-evacuation only adds final value when an evacuation route is actually known', () => {
    const base = withPrinciples({ ...createV060InitialState(99110), day: 29, defense: 48, hope: 35 }, ['everyone-shares', 'core-leads', 'prepare-evacuation']);
    expect(finalHordeResultFor(base)).toBe('damaged');
    expect(finalHordeResultFor({ ...base, storyFlags: [...base.storyFlags, 'evacuation_route_known'] })).toBe('held');
  });

  it('await-aid rewards staffed radio only after outside contact exists', () => {
    const original = createV060InitialState(99111);
    const seed = { ...original, day: 22, hope: 50, buildings: { ...original.buildings, radio: 2 }, dayAssignments: { 'lin-xia': 'radio' as const } };
    const baseline = withPrinciples({ ...seed, storyFlags: [...seed.storyFlags, 'external_contact'] }, ['everyone-shares', 'core-leads']);
    const waiting = withPrinciples(baseline, ['everyone-shares', 'core-leads', 'await-aid']);
    const baselineResolved = finalizeDay(baseline);
    const waitingResolved = finalizeDay(waiting);
    expect(waitingResolved.hope).toBe(baselineResolved.hope + 1);
    expect(waitingResolved.dawnBrief).toContain('街区原则《等待外援》：广播仍与外界保持联系，希望 +1。');
  });
});

describe('v0.6 location memory and building ecology', () => {
  it('turns prior location actions into a stable memory summary and risk modifier', () => {
    const base = createV060InitialState(99201);
    const state: GameState = { ...base, storyFlags: [...base.storyFlags, 'visited:hospital', 'scouted:hospital', 'disturbed:hospital'] };
    expect(locationMemory(state, 'hospital')).toMatchObject({ visited: true, scouted: true, disturbed: true });
    expect(locationMemoryRiskModifier(state, 'hospital')).toBe(0);
    expect(locationMemorySummary(state, 'hospital')).toEqual(expect.arrayContaining(['已侦察：后续风险降低', '已惊动：下次进入风险上升']));
  });

  it('lets cleared locations become safer', () => {
    const base = createV060InitialState(99202);
    const cleared: GameState = { ...base, storyFlags: [...base.storyFlags, 'cleared:convenience-store'] };
    expect(expeditionRiskScore(cleared, ['lin-xia'], 'convenience-store')).toBeLessThan(expeditionRiskScore(base, ['lin-xia'], 'convenience-store'));
  });

  it('workshop level 2 suppresses infrastructure failures in the night event ecology', () => {
    const event = NORMAL_NIGHT_EVENTS.find((item) => item.id === 'generator-drop')!;
    const seed = createV060InitialState(99203);
    const base: GameState = { ...seed, mealState: { ...seed.mealState, quality: 'hot' }, dayAssignments: {} };
    const upgraded: GameState = { ...base, buildings: { ...base.buildings, workshop: 2 } };
    expect(nightEventWeight(upgraded, event)).toBeLessThan(nightEventWeight(base, event));
  });

  it('shelter level 2 suppresses panic-related events', () => {
    const event = EMERGENCY_EVENTS.find((item) => item.id === 'emergency-panic')!;
    const seed = createV060InitialState(99204);
    const base: GameState = { ...seed, civilianResidents: 5, socialState: { ...normalizeSocialState(seed.socialState), pressure: 4 }, buildings: { ...seed.buildings, shelter: 1 } };
    const upgraded: GameState = { ...base, buildings: { ...base.buildings, shelter: 2 } };
    expect(nightEventWeight(upgraded, event)).toBeLessThan(nightEventWeight(base, event));
  });
});
