import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/engine';
import { emergencyClear, takeRackWithFeel, tickWithFeel } from '../src/game/feel';
import type { SupplyItem } from '../src/game/types';

function fullBoard(): ReturnType<typeof createInitialState> {
  const base = createInitialState(21);
  const slots: SupplyItem[] = [
    { id: 'a', kind: 'ration', tier: 1 },
    { id: 'b', kind: 'medical', tier: 1 },
    { id: 'c', kind: 'battery', tier: 1 },
    { id: 'd', kind: 'ration', tier: 2 },
    { id: 'e', kind: 'medical', tier: 2 },
    { id: 'f', kind: 'battery', tier: 2 },
    { id: 'g', kind: 'ration', tier: 3 },
  ];
  return { ...base, slots };
}

describe('game feel safety valves', () => {
  it('emergency clear always frees three slots from a full board', () => {
    const state = emergencyClear(fullBoard());
    expect(state.slots.filter((slot) => slot === null)).toHaveLength(3);
    expect(state.clearances).toBe(1);
  });

  it('ends the night on the third emergency clear', () => {
    const state = emergencyClear({ ...fullBoard(), clearances: 2 });
    expect(state.phase).toBe('summary');
    expect(state.clearances).toBe(3);
  });

  it('expires an active combo window', () => {
    const state = { ...createInitialState(22), combo: 4, bestCombo: 4, comboRemainingMs: 500 };
    const next = tickWithFeel(state, 600);
    expect(next.combo).toBe(0);
    expect(next.bestCombo).toBe(4);
  });

  it('increments combo when another request is served inside the window', () => {
    let state = createInitialState(23);
    state = takeRackWithFeel(state, 0);
    state = takeRackWithFeel(state, 1);
    state = takeRackWithFeel(state, 2);
    expect(state.stats.served).toBe(1);
    expect(state.combo).toBe(1);
    expect(state.comboRemainingMs).toBeGreaterThan(0);
  });
});
