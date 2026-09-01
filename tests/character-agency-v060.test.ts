import { describe, expect, it } from 'vitest';
import { createPendingCheck } from '../src/game/dice';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import type { GameState } from '../src/game/types';
import { createV060InitialState, upgradeSaveToV060 } from '../src/game/v060/campaign';
import { pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { activeMentalState, mentalCheckModifier, setMentalState } from '../src/game/v060/characterPsychology';
import { recordDeath } from '../src/game/v060/memorial';
import { adjustPressure, socialStateOf } from '../src/game/v060/socialPressure';

function atDay(day: number, seed = 860000 + day): GameState {
  return { ...createV060InitialState(seed), day, phase: 'street' };
}

describe('v0.6 lightweight character psychology', () => {
  it('normalizes old survivors to a steady mental state', () => {
    const old = createV060InitialState(861001);
    old.survivors = old.survivors.map((survivor) => {
      const copy = { ...survivor };
      delete copy.mentalState;
      delete copy.mentalUntilDay;
      return copy;
    });
    const upgraded = upgradeSaveToV060(old);
    expect(upgraded.survivors.every((survivor) => survivor.mentalState === 'steady')).toBe(true);
  });

  it('adds focused and shaken modifiers to actor-based 2D6 checks', () => {
    const base = atDay(8, 861002);
    const focused = setMentalState(base, 'lin-xia', 'focused', 9);
    const focusedCheck = createPendingCheck(focused, {
      source: 'night', eventId: 'test', choiceId: 'focus', label: 'test', actorId: 'lin-xia', mode: 'normal', modifiers: [],
    });
    expect(focusedCheck.pendingCheck?.modifiers).toContainEqual({ label: '心理 · 专注', value: 1 });

    const shaken = setMentalState(base, 'lin-xia', 'shaken', 9);
    const shakenCheck = createPendingCheck(shaken, {
      source: 'night', eventId: 'test', choiceId: 'shake', label: 'test', actorId: 'lin-xia', mode: 'normal', modifiers: [],
    });
    expect(shakenCheck.pendingCheck?.modifiers).toContainEqual({ label: '心理 · 动摇', value: -1 });
  });

  it('lets temporary mental states expire without creating a new stress meter', () => {
    const state = setMentalState(atDay(8, 861003), 'lin-xia', 'focused', 9);
    const survivor = state.survivors.find((item) => item.id === 'lin-xia')!;
    expect(activeMentalState(state, survivor)).toBe('focused');
    expect(mentalCheckModifier({ ...state, day: 10 }, survivor)).toBeNull();
  });

  it('shakes the other living core characters after a core death', () => {
    const dead = recordDeath(atDay(9, 861004), 'lin-xia', '测试事故');
    expect(dead.survivors.find((item) => item.id === 'zhou')?.mentalState).toBe('shaken');
    expect(dead.survivors.find((item) => item.id === 'ahe')?.mentalState).toBe('shaken');
    expect(socialStateOf(dead).pressure).toBe(2);
  });
});

describe('v0.6 core character initiative', () => {
  it('lets Lin Xia proactively scout a route and become focused', () => {
    const state = atDay(3, 862001);
    const event = pendingCampaignEvent(state);
    expect(event?.id).toBe('initiative-linxia-route');
    const beforeEnergy = state.survivors.find((item) => item.id === 'lin-xia')!.energy;
    const resolved = resolveCampaignEvent(state, event!.id);
    expect(resolved.storyFlags).toContain('scouted:convenience-store');
    expect(resolved.survivors.find((item) => item.id === 'lin-xia')?.energy).toBe(beforeEnergy - 5);
    expect(resolved.survivors.find((item) => item.id === 'lin-xia')?.mentalState).toBe('focused');
  });

  it('allows only one initiative event on the same day', () => {
    let state = atDay(5, 862002);
    state = { ...state, defense: 50, storyFlags: [...state.storyFlags, 'fixed_event_seen:initiative-linxia-route'] };
    const first = pendingCampaignEvent(state);
    expect(first?.id).toBe('initiative-zhou-fence');
    const resolved = resolveCampaignEvent(state, first!.id);
    const second = pendingCampaignEvent(resolved);
    expect(second?.id?.startsWith('initiative-')).not.toBe(true);
  });

  it('does not let a critical character fire an initiative event', () => {
    const state = {
      ...atDay(3, 862003),
      survivors: atDay(3, 862003).survivors.map((survivor) => survivor.id === 'lin-xia' ? { ...survivor, condition: 'critical' as const } : survivor),
    };
    expect(pendingCampaignEvent(state)?.id).not.toBe('initiative-linxia-route');
  });

  it('lets Ahe trade a ration for hope and lower pressure when the street is strained', () => {
    let state = atDay(5, 862004);
    state = {
      ...state,
      storyFlags: [...state.storyFlags, 'fixed_event_seen:initiative-linxia-route', 'fixed_event_seen:initiative-zhou-fence'],
      mealState: { ...state.mealState, consecutiveShortageDays: 1 },
    };
    state = adjustPressure(state, 2, 'test');
    const event = pendingCampaignEvent(state);
    expect(event?.id).toBe('initiative-ahe-pot');
    const rationBefore = state.inventory.ration;
    const hopeBefore = state.hope;
    const resolved = resolveCampaignEvent(state, event!.id);
    expect(resolved.inventory.ration).toBe(rationBefore - 1);
    expect(resolved.hope).toBe(hopeBefore + 2);
    expect(socialStateOf(resolved).pressure).toBe(1);
  });

  it('only offers Cheng initiative after she is present and the clinic has an injured patient', () => {
    const cheng = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'cheng')!;
    let state = atDay(8, 862005);
    state = {
      ...state,
      buildings: { ...state.buildings, clinic: 1 },
      storyFlags: [
        ...state.storyFlags,
        'fixed_event_seen:character-cheng',
        'fixed_event_seen:initiative-linxia-route',
        'fixed_event_seen:initiative-zhou-fence',
        'fixed_event_seen:initiative-ahe-pot',
      ],
      survivors: [...state.survivors.map((survivor) => survivor.id === 'zhou' ? { ...survivor, condition: 'serious' as const, untreatedDays: 2 } : survivor), { ...cheng }],
    };
    const event = pendingCampaignEvent(state);
    expect(event?.id).toBe('initiative-cheng-triage');
    const resolved = resolveCampaignEvent(state, event!.id);
    expect(resolved.survivors.find((survivor) => survivor.id === 'zhou')?.untreatedDays).toBe(1);
    expect(resolved.survivors.find((survivor) => survivor.id === 'cheng')?.mentalState).toBe('focused');
  });
});
