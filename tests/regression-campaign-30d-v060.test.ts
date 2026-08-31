import { describe, expect, it } from 'vitest';
import { rollPendingCheck } from '../src/game/dice';
import {
  advanceCampaignDay,
  createV060InitialState,
  finalizeDay,
} from '../src/game/v060/campaign';
import { upgradeBuilding } from '../src/game/v060/buildings';
import {
  pendingCampaignEvent,
  resolveCampaignEvent,
} from '../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../src/game/v060/dayManagement';
import { resolveEnding } from '../src/game/v060/endings';
import {
  drawExpeditionEvent,
  retreatExpedition,
  startExpedition,
} from '../src/game/v060/expedition';
import {
  acceptNightCheckResult,
  canAffordNightChoice,
  chooseNightOption,
  currentNightEvent,
  scheduleNight,
} from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function abundant(state: GameState): GameState {
  return {
    ...state,
    inventory: { ration: 999, medicine: 999, power: 100, materials: 999, parts: 999 },
    hope: Math.max(80, state.hope),
    defense: Math.max(85, state.defense),
  };
}

function drainFixedEvents(state: GameState, seen?: Set<string>): GameState {
  let next = state;
  let guard = 0;
  while (guard < 30) {
    const event = pendingCampaignEvent(next);
    if (!event) return next;
    seen?.add(event.id);
    next = resolveCampaignEvent(next, event.id);
    guard += 1;
  }
  throw new Error(`fixed event loop did not drain on DAY ${state.day}`);
}

function resolveNight(state: GameState): { state: GameState; hordeActive: boolean } {
  let next = scheduleNight(state);
  const hordeActive = next.nightState.hordeActive;
  let guard = 0;

  while (next.phase === 'night' && guard < 30) {
    const event = currentNightEvent(next);
    if (!event) throw new Error(`night has no current event on DAY ${next.day}`);
    const choice = event.choices.find((candidate) => candidate.strategy === 'resource' && canAffordNightChoice(next, candidate))
      ?? event.choices.find((candidate) => !candidate.check && canAffordNightChoice(next, candidate))
      ?? event.choices.find((candidate) => canAffordNightChoice(next, candidate));
    if (!choice) throw new Error(`no affordable choice for ${event.id}`);

    next = chooseNightOption(next, choice.id);
    if (next.pendingCheck) {
      next = rollPendingCheck(next);
      next = acceptNightCheckResult(next);
    }
    guard += 1;
  }

  if (guard >= 30) throw new Error(`night loop exceeded guard on DAY ${state.day}`);
  expect(next.phase).toBe('night-summary');
  expect(next.pendingCheck).toBeNull();
  return { state: next, hordeActive };
}

function finishOrdinaryDay(state: GameState): { state: GameState; hordeActive: boolean } {
  const prepared = abundant(drainFixedEvents(state));
  const nightReady = finalizeDay(prepared);
  expect(nightReady.phase).toBe('night');
  expect(nightReady.expeditionState.departed).toBe(false);
  return resolveNight(nightReady);
}

describe('v0.6 DAY 1 -> DAY 30 campaign regression', () => {
  it('walks a simple legal campaign through every night, DAY29 final horde, and DAY30 ending', () => {
    let state = createV060InitialState(606801);
    let sawFinalHorde = false;

    while (state.day < 30) {
      const day = state.day;
      const result = finishOrdinaryDay(state);
      if (day === 29) sawFinalHorde = result.hordeActive;
      state = advanceCampaignDay(result.state);
      if (day < 29) {
        expect(state.day).toBe(day + 1);
        expect(state.phase).toBe('street');
      }
    }

    expect(sawFinalHorde).toBe(true);
    expect(state.day).toBe(30);
    expect(state.phase).toBe('ending');
    expect(state.ending).not.toBeNull();
    expect(state.finalHordeResult).toBeDefined();
  });

  it('walks a 30-day path with a building event, character event, location unlock, expedition, and civilian rescue', () => {
    let state = abundant(createV060InitialState(606802));
    const fixedEvents = new Set<string>();
    let sawFinalHorde = false;

    while (state.day < 30) {
      const day = state.day;
      state = abundant(state);

      if (day === 1) {
        state = upgradeBuilding(state, 'radio');
        expect(state.buildings.radio).toBe(1);
        state = drainFixedEvents(state, fixedEvents);
        state = upgradeBuilding(state, 'radio');
        expect(state.buildings.radio).toBe(2);
        expect(state.storyFlags).not.toContain('building_event_pending:radio');
      }

      state = drainFixedEvents(state, fixedEvents);

      if (day <= 3) state = assignDayJob(state, 'zhou', 'radio');

      if (day === 2) {
        expect(state.storyFlags).toContain('location_unlocked:west-pharmacy');
        state = assignDayJob(state, 'lin-xia', 'expedition');
        state = lockDayAssignments(state);
        state = startExpedition(state, ['lin-xia'], 'west-pharmacy');
        expect(state.expeditionState.departed).toBe(true);
        state = drawExpeditionEvent(state);
        state = retreatExpedition(state);
        expect(state.dayState.returnedExpeditions).toBe(1);
        expect(state.dayState.committedSurvivorIds).toContain('lin-xia');
      }

      state = finalizeDay(abundant(state));
      expect(state.phase).toBe('night');
      const night = resolveNight(state);
      if (day === 29) sawFinalHorde = night.hordeActive;
      state = advanceCampaignDay(night.state);
    }

    expect(fixedEvents).toContain('building-radio');
    expect(fixedEvents).toContain('character-cheng');
    expect(fixedEvents).toContain('location-west-pharmacy');
    expect(state.campaignStats.expeditions).toBeGreaterThanOrEqual(1);
    expect(state.campaignStats.rescued).toBeGreaterThanOrEqual(1);
    expect(state.civilianResidents).toBeGreaterThanOrEqual(1);
    expect(sawFinalHorde).toBe(true);
    expect(state.day).toBe(30);
    expect(state.phase).toBe('ending');
    expect(state.ending).not.toBeNull();
  });

  it('counts civilians in DAY30 population while keeping them separate from core survivors', () => {
    const base = createV060InitialState(606803);
    const core = base.survivors.slice(0, 3).map((survivor) => ({ ...survivor, trust: 1 as const, condition: 'healthy' as const }));
    const common: GameState = {
      ...base,
      day: 30,
      phase: 'ending',
      survivors: core,
      civilianResidents: 0,
      buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 },
      hope: 65,
      defense: 70,
      inventory: { ...base.inventory, power: 60 },
      campaignStats: { ...base.campaignStats, rescued: 3, deaths: 0 },
      finalHordeResult: 'held',
      storyFlags: ['v060_started'],
    };

    expect(resolveEnding(common).id).toBe('E08');
    const withCivilians = { ...common, civilianResidents: 3 };
    expect(withCivilians.survivors).toHaveLength(3);
    expect(resolveEnding(withCivilians).id).toBe('E02');
  });
});
