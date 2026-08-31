import { describe, expect, it } from 'vitest';
import { challengeScore, createDailyChallenge, dailySeed, decodeChallenge, encodeChallenge } from '../src/game/challenge';

describe('daily challenge', () => {
  it('uses the same seed for the same date', () => {
    expect(dailySeed('2026-08-31')).toBe(dailySeed('2026-08-31'));
    expect(dailySeed('2026-08-31')).not.toBe(dailySeed('2026-09-01'));
  });

  it('creates a standardized sixty second challenge', () => {
    const state = createDailyChallenge('2026-08-31');
    expect(state.nightRemainingMs).toBe(60_000);
    expect(state.forecast.intensity).toBe(4);
  });

  it('round-trips challenge codes with a checksum', () => {
    const state = createDailyChallenge('2026-08-31');
    const score = challengeScore(state);
    const code = encodeChallenge(state.seed, score);
    expect(decodeChallenge(code)).toEqual({ seed: state.seed, score });
    expect(decodeChallenge(`${code.slice(0, -1)}0`)).not.toEqual({ seed: state.seed, score });
  });
});
