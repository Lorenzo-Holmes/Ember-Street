import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/types';
import { createV060InitialState } from '../src/game/v060/campaign';
import { acknowledgeMissingAttention, dayAttentionSummary } from '../src/game/v060/dayAttention';

function missingState(day = 8): GameState {
  const base = createV060InitialState(980008);
  const missingId = base.survivors[0].id;
  return {
    ...base,
    day,
    phase: 'street',
    survivors: base.survivors.map((survivor) => survivor.id === missingId
      ? { ...survivor, condition: 'missing' as const }
      : survivor),
  };
}

describe('missing-person morning hardlock regression', () => {
  it('lets the player handle the missing-person warning without changing the survivor state', () => {
    const state = missingState();
    expect(dayAttentionSummary(state).missingCount).toBe(1);

    const handled = acknowledgeMissingAttention(state);
    expect(handled.survivors[0].condition).toBe('missing');
    expect(dayAttentionSummary(handled).missingCount).toBe(0);
    expect(handled.storyFlags).toContain(`missing_attention_ack:${state.day}`);
  });

  it('keeps the acknowledgement scoped to the current day', () => {
    const handled = acknowledgeMissingAttention(missingState(8));
    const tomorrow = { ...handled, day: 9 };
    expect(dayAttentionSummary(tomorrow).missingCount).toBe(1);
  });

  it('also unblocks a state where a search already failed today', () => {
    const state = missingState(12);
    const missingId = state.survivors[0].id;
    const failed: GameState = {
      ...state,
      storyFlags: [
        ...state.storyFlags,
        `missing_search:${missingId}:${state.day}`,
        `missing_search_failed:${missingId}:${state.day}`,
      ],
    };
    expect(dayAttentionSummary(failed).missingCount).toBe(1);
    expect(dayAttentionSummary(acknowledgeMissingAttention(failed)).missingCount).toBe(0);
  });
});
