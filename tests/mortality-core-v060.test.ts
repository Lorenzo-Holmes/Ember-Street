import { describe, expect, it } from 'vitest';
import { createV060InitialState } from '../src/game/v060/campaign';
import {
  advanceMortalityPressure,
  infectionStage,
  markInfectionSuspected,
  pendingMortalityCrises,
  resolveMortalityCrisis,
  setInfectionStage,
} from '../src/game/v060/mortality';

describe('v0.6 mortality crisis chain', () => {
  it('does not silently kill a serious survivor who goes untreated', () => {
    let state = createV060InitialState(601);
    state = { ...state, survivors: state.survivors.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'serious' as const } : s) };
    state = advanceMortalityPressure(state);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('serious');
    expect(state.memorials).toHaveLength(0);

    state = { ...state, day: state.day + 1 };
    state = advanceMortalityPressure(state);
    expect(pendingMortalityCrises(state).some((c) => c.survivorId === 'lin-xia' && c.kind === 'worsening')).toBe(true);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('serious');
  });

  it('turns explicit neglect of a worsening event into critical condition', () => {
    let state = createV060InitialState(602);
    state = { ...state, day: 8, survivors: state.survivors.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'serious' as const } : s), storyFlags: ['v060_started', 'untreated:lin-xia:6', 'untreated:lin-xia:7', 'mortality_pending:lin-xia:worsening'] };
    state = resolveMortalityCrisis(state, 'lin-xia', 'delay');
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('critical');
    expect(state.campaignStats.deaths).toBe(0);
  });

  it('only kills a critical survivor when the crisis is explicitly neglected', () => {
    let state = createV060InitialState(603);
    state = { ...state, day: 12, survivors: state.survivors.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'critical' as const } : s), storyFlags: ['v060_started', 'mortality_pending:lin-xia:critical'] };
    state = resolveMortalityCrisis(state, 'lin-xia', 'delay');
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('dead');
    expect(state.memorials.some((m) => m.survivorId === 'lin-xia')).toBe(true);
  });

  it('lets clinic treatment consume medicine and step critical back to serious', () => {
    let state = createV060InitialState(604);
    state = { ...state, buildings: { ...state.buildings, clinic: 1 }, inventory: { ...state.inventory, medicine: 2 }, survivors: state.survivors.map((s) => s.id === 'lin-xia' ? { ...s, condition: 'critical' as const } : s), storyFlags: ['v060_started', 'mortality_pending:lin-xia:critical'] };
    state = resolveMortalityCrisis(state, 'lin-xia', 'treat');
    expect(state.inventory.medicine).toBe(1);
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('serious');
  });

  it('progresses infection through visible stages instead of treating injury as infection', () => {
    let state = createV060InitialState(605);
    state = markInfectionSuspected(state, 'lin-xia', '污染伤口');
    expect(infectionStage(state, 'lin-xia')).toBe('suspected');
    state = advanceMortalityPressure(state);
    state = resolveMortalityCrisis(state, 'lin-xia', 'delay');
    expect(infectionStage(state, 'lin-xia')).toBe('infected');

    state = setInfectionStage(state, 'lin-xia', 'turning', '感染恶化');
    state = advanceMortalityPressure(state);
    expect(pendingMortalityCrises(state)[0]?.kind).toBe('turning');
    state = resolveMortalityCrisis(state, 'lin-xia', 'delay');
    expect(state.survivors.find((s) => s.id === 'lin-xia')?.condition).toBe('dead');
  });
});
