import { describe, expect, it } from 'vitest';
import { createV060InitialState, resolveExpeditionStance } from '../src/game/v060/campaign';
import { locationUnlockFlag, pendingCampaignEvent, resolveCampaignEvent } from '../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../src/game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from '../src/game/v060/expedition';
import { scheduleNight } from '../src/game/v060/nightScheduler';
import type { GameState } from '../src/game/types';

function expeditionState(seed: number): GameState {
  let state = createV060InitialState(seed);
  state = assignDayJob(state, 'lin-xia', 'expedition');
  state = lockDayAssignments(state);
  state = startExpedition(state, ['lin-xia'], 'convenience-store');
  return drawExpeditionEvent(state);
}

describe('v0.6 deterministic regression', () => {
  it('keeps fixed-event selection deterministic and does not consume RNG while gating or resolving', () => {
    const base = { ...createV060InitialState(606701), day: 2, phase: 'street' as const };
    const rng = base.rngState;
    const a = pendingCampaignEvent(base);
    const b = pendingCampaignEvent(JSON.parse(JSON.stringify(base)) as GameState);
    expect(a?.id).toBe('location-west-pharmacy');
    expect(b?.id).toBe(a?.id);
    expect(base.rngState).toBe(rng);

    const resolved = resolveCampaignEvent(base, a!.id);
    expect(resolved.rngState).toBe(rng);
    expect(resolved.storyFlags).toContain(locationUnlockFlag('west-pharmacy'));
  });

  it('keeps expedition event draw and expedition 2D6 resolution identical for the same seed', () => {
    const a = expeditionState(606702);
    const b = expeditionState(606702);
    expect(a.expeditionState.eventId).toBe(b.expeditionState.eventId);
    expect(a.rngState).toBe(b.rngState);

    const resolvedA = resolveExpeditionStance(a, 'careful');
    const resolvedB = resolveExpeditionStance(b, 'careful');
    expect(resolvedA.rngState).toBe(resolvedB.rngState);
    expect(resolvedA.inventory).toEqual(resolvedB.inventory);
    expect(resolvedA.survivors).toEqual(resolvedB.survivors);
    expect(resolvedA.dayState).toEqual(resolvedB.dayState);
    expect(resolvedA.lastMessage).toBe(resolvedB.lastMessage);
  });

  it('does not let fixed-event gating perturb the later night schedule for the same seed', () => {
    const base = {
      ...createV060InitialState(606703),
      day: 6,
      phase: 'night' as const,
      storyFlags: [
        'v060_started',
        locationUnlockFlag('west-pharmacy'),
        locationUnlockFlag('apartment-402'),
        locationUnlockFlag('auto-repair'),
      ],
    };
    const direct = scheduleNight(base);
    const inspected = pendingCampaignEvent({ ...base, phase: 'street' as const });
    expect(inspected?.kind === 'location').toBe(false);
    const afterInspection = scheduleNight(base);
    expect(afterInspection.nightState.scheduledEventIds).toEqual(direct.nightState.scheduledEventIds);
    expect(afterInspection.nightState.emergencyEventIds).toEqual(direct.nightState.emergencyEventIds);
    expect(afterInspection.rngState).toBe(direct.rngState);
  });
});
