import { describe, expect, it } from 'vitest';
import { createV060InitialState, searchForMissing } from '../src/game/v060/campaign';
import { upgradeBuilding } from '../src/game/v060/buildings';
import {
  locationUnlockFlag,
  pendingCampaignEvent,
  resolveCampaignEvent,
} from '../src/game/v060/campaignEvents';
import {
  assignDayJob,
  canTakeDayAssignment,
  lockDayAssignments,
  reopenDayAssignments,
} from '../src/game/v060/dayManagement';
import {
  canStartExpedition,
  drawExpeditionEvent,
  resolveExpeditionOutcome,
  retreatExpedition,
  startExpedition,
} from '../src/game/v060/expedition';
import { SURVIVOR_ROSTER } from '../src/game/progression';
import type { GameState } from '../src/game/types';

const DISCOVERED_TO_DAY_6 = [
  locationUnlockFlag('west-pharmacy'),
  locationUnlockFlag('apartment-402'),
  locationUnlockFlag('auto-repair'),
];

function day6WithoutCharacter(): GameState {
  const state = createV060InitialState(606601);
  return { ...state, day: 6, phase: 'street', storyFlags: [...state.storyFlags, ...DISCOVERED_TO_DAY_6] };
}

function expeditionReady(seed = 606602): GameState {
  let state = createV060InitialState(seed);
  state = {
    ...state,
    phase: 'street',
    buildings: { ...state.buildings, workshop: 1 },
    inventory: { ...state.inventory, materials: 30, parts: 30 },
  };
  state = assignDayJob(state, 'lin-xia', 'expedition');
  return lockDayAssignments(state);
}

describe('v0.6 event gating regression', () => {
  it('does not make a required-survivor event eligible before the survivor is collected', () => {
    const state = day6WithoutCharacter();
    expect(pendingCampaignEvent(state)?.id).not.toBe('character-cheng');
  });

  it('makes the required-survivor event eligible after the survivor joins', () => {
    const base = day6WithoutCharacter();
    const cheng = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'cheng')!;
    const state = { ...base, survivors: [...base.survivors, { ...cheng, condition: 'healthy' as const }] };
    expect(pendingCampaignEvent(state)?.id).toBe('character-cheng');
  });

  it.each(['dead', 'missing'] as const)('does not trigger the character event when the survivor is %s', (condition) => {
    const base = day6WithoutCharacter();
    const cheng = SURVIVOR_ROSTER.find((survivor) => survivor.id === 'cheng')!;
    const state = { ...base, survivors: [...base.survivors, { ...cheng, condition }] };
    expect(pendingCampaignEvent(state)?.id).not.toBe('character-cheng');
  });

  it('queues a first-build event once, clears it on resolve, and does not repeat at Lv2', () => {
    const base = createV060InitialState(606603);
    const prepared = {
      ...base,
      buildings: { ...base.buildings, workshop: 0 },
      inventory: { ...base.inventory, materials: 50, parts: 50 },
    };
    const level1 = upgradeBuilding(prepared, 'workshop');
    expect(level1.buildings.workshop).toBe(1);
    expect(level1.storyFlags).toContain('building_event_pending:workshop');
    expect(pendingCampaignEvent(level1)?.id).toBe('building-workshop');

    const resolved = resolveCampaignEvent(level1, 'building-workshop');
    expect(resolved.storyFlags).toContain('fixed_event_seen:building-workshop');
    expect(resolved.storyFlags).not.toContain('building_event_pending:workshop');
    expect(pendingCampaignEvent(resolved)?.id).not.toBe('building-workshop');

    const level2 = upgradeBuilding(resolved, 'workshop');
    expect(level2.buildings.workshop).toBe(2);
    expect(level2.storyFlags).not.toContain('building_event_pending:workshop');
    expect(pendingCampaignEvent(level2)?.id).not.toBe('building-workshop');
  });

  it('keeps a minDay location locked until its fixed event resolves and enforces that in startExpedition', () => {
    let state = createV060InitialState(606604);
    state = { ...state, day: 2, phase: 'street' };
    state = assignDayJob(state, 'lin-xia', 'expedition');
    state = lockDayAssignments(state);

    expect(canStartExpedition(state, ['lin-xia'], 'west-pharmacy').allowed).toBe(false);
    const rejected = startExpedition(state, ['lin-xia'], 'west-pharmacy');
    expect(rejected.expeditionState.departed).toBe(false);
    expect(rejected.campaignStats.expeditions).toBe(0);

    const event = pendingCampaignEvent({ ...state, phase: 'street', dayState: { ...state.dayState, assignmentsLocked: false } });
    expect(event?.id).toBe('location-west-pharmacy');
    const unlocked = resolveCampaignEvent({ ...state, phase: 'street', dayState: { ...state.dayState, assignmentsLocked: false } }, event!.id);
    expect(unlocked.storyFlags).toContain(locationUnlockFlag('west-pharmacy'));

    const relocked = lockDayAssignments(unlocked);
    expect(canStartExpedition(relocked, ['lin-xia'], 'west-pharmacy').allowed).toBe(true);
    expect(startExpedition(relocked, ['lin-xia'], 'west-pharmacy').expeditionState.departed).toBe(true);
  });
});

describe('v0.6 expedition flow regression', () => {
  it('runs lock -> start -> street -> re-enter -> retreat and commits the explorer for the rest of the day', () => {
    const locked = expeditionReady(606605);
    let state = startExpedition(locked, ['lin-xia'], 'convenience-store');
    expect(state.expeditionState.departed).toBe(true);
    state = drawExpeditionEvent(state);
    state = { ...state, phase: 'street' };
    expect(state.expeditionState.departed).toBe(true);

    state = { ...state, phase: 'expedition' };
    state = retreatExpedition(state);
    expect(state.expeditionState.departed).toBe(false);
    expect(state.dayState.returnedExpeditions).toBe(1);
    expect(state.dayState.committedSurvivorIds).toContain('lin-xia');

    const reopened = reopenDayAssignments({ ...state, phase: 'dusk' });
    expect(reopened.phase).toBe('street');
    expect(canTakeDayAssignment(reopened, 'lin-xia', 'repair').allowed).toBe(false);
    expect(canTakeDayAssignment(reopened, 'zhou', 'repair').allowed).toBe(true);

    const relocked = lockDayAssignments(reopened);
    expect(canStartExpedition(relocked, ['lin-xia'], 'convenience-store').allowed).toBe(false);
    expect(startExpedition(relocked, ['lin-xia'], 'convenience-store').campaignStats.expeditions).toBe(1);
  });

  it('commits explorers after a resolved expedition, not only after retreat', () => {
    const locked = expeditionReady(606606);
    const started = startExpedition(locked, ['lin-xia'], 'convenience-store');
    const resolved = resolveExpeditionOutcome(started, 'success');
    expect(resolved.dayState.returnedExpeditions).toBe(1);
    expect(resolved.dayState.committedSurvivorIds).toContain('lin-xia');
    const reopened = reopenDayAssignments({ ...resolved, phase: 'dusk' });
    expect(canTakeDayAssignment(reopened, 'lin-xia', 'repair').allowed).toBe(false);
  });

  it('refuses to overwrite an expedition that is already in progress', () => {
    const locked = expeditionReady(606607);
    const started = startExpedition(locked, ['lin-xia'], 'convenience-store');
    expect(canStartExpedition(started, ['lin-xia'], 'convenience-store').allowed).toBe(false);
    const secondStart = startExpedition(started, ['lin-xia'], 'convenience-store');
    expect(secondStart.campaignStats.expeditions).toBe(1);
    expect(secondStart.expeditionState).toEqual(started.expeditionState);
  });

  it('keeps missing-person search helpers committed after returning from dusk', () => {
    const base = createV060InitialState(606608);
    const missing: GameState = {
      ...base,
      survivors: base.survivors.map((survivor) => survivor.id === 'ahe' ? { ...survivor, condition: 'missing' as const } : survivor),
    };
    const searched = searchForMissing(missing, 'ahe', 'team');
    expect(searched.dayState.committedSurvivorIds).toHaveLength(2);
    const reopened = reopenDayAssignments({ ...searched, phase: 'dusk', dayState: { ...searched.dayState, assignmentsLocked: true } });
    for (const id of searched.dayState.committedSurvivorIds) {
      expect(canTakeDayAssignment(reopened, id, 'rest').allowed).toBe(false);
    }
  });
});
