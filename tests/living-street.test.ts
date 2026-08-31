import { describe, expect, it } from 'vitest';
import { CHAPTER_FINAL_DAY } from '../src/game/config';
import { dailySituationContentCount, dailySituationForState } from '../src/game/dailySituations';
import { createPendingCheck, rollPendingCheck } from '../src/game/dice';
import { createInitialState } from '../src/game/engine';
import { nightStoryContentCount } from '../src/game/nightStory';
import { livingStreetContentCount } from '../src/game/story';
import type { GameState, RollMode } from '../src/game/types';

function pendingState(seed: number, mode: RollMode = 'normal'): GameState {
  const base = createInitialState(seed);
  return createPendingCheck(base, {
    source: 'story',
    eventId: 'test-event',
    choiceId: 'test-choice',
    label: '测试判定',
    mode,
    modifiers: [{ label: '测试修正', value: 1 }],
  });
}

describe('Living Street v0.5.0 guarantees', () => {
  it('covers every campaign day with a repeatable street situation', () => {
    const base = createInitialState(20260831);
    for (let day = 1; day <= CHAPTER_FINAL_DAY; day += 1) {
      const state: GameState = {
        ...base,
        phase: 'street',
        day,
        chapterComplete: false,
        storyFlags: [],
      };
      const situation = dailySituationForState(state);
      expect(situation, `DAY ${day} should have a street situation`).not.toBeNull();
      expect(situation?.id).toContain(`:day:${day}`);
    }
  });

  it('keeps at least ninety authored or systemic narrative content nodes', () => {
    const total = livingStreetContentCount() + dailySituationContentCount() + nightStoryContentCount();
    expect(total).toBeGreaterThanOrEqual(90);
  });

  it('produces identical 2D6 results for identical seeded states', () => {
    const a = rollPendingCheck(pendingState(424242));
    const b = rollPendingCheck(pendingState(424242));
    expect(a.pendingCheck?.dice).toEqual(b.pendingCheck?.dice);
    expect(a.pendingCheck?.keptDice).toEqual(b.pendingCheck?.keptDice);
    expect(a.pendingCheck?.total).toBe(b.pendingCheck?.total);
    expect(a.pendingCheck?.outcome).toBe(b.pendingCheck?.outcome);
    expect(a.rngState).toBe(b.rngState);
  });

  it('does not reroll an already committed check after a save/reload round trip', () => {
    const rolled = rollPendingCheck(pendingState(987654));
    const restored = JSON.parse(JSON.stringify(rolled)) as GameState;
    const attemptedAgain = rollPendingCheck(restored);
    expect(attemptedAgain.pendingCheck?.dice).toEqual(rolled.pendingCheck?.dice);
    expect(attemptedAgain.pendingCheck?.keptDice).toEqual(rolled.pendingCheck?.keptDice);
    expect(attemptedAgain.pendingCheck?.total).toBe(rolled.pendingCheck?.total);
    expect(attemptedAgain.rngState).toBe(rolled.rngState);
  });

  it('rolls three dice for advantage and disadvantage while keeping exactly two', () => {
    const advantage = rollPendingCheck(pendingState(13579, 'advantage'));
    const disadvantage = rollPendingCheck(pendingState(13579, 'disadvantage'));
    expect(advantage.pendingCheck?.dice).toHaveLength(3);
    expect(disadvantage.pendingCheck?.dice).toHaveLength(3);
    expect(advantage.pendingCheck?.keptDice).toHaveLength(2);
    expect(disadvantage.pendingCheck?.keptDice).toHaveLength(2);
    const dice = [...(advantage.pendingCheck?.dice ?? [])].sort((a, b) => a - b);
    expect(advantage.pendingCheck?.keptDice?.reduce((a, b) => a + b, 0)).toBe(dice.slice(-2).reduce((a, b) => a + b, 0));
    expect(disadvantage.pendingCheck?.keptDice?.reduce((a, b) => a + b, 0)).toBe(dice.slice(0, 2).reduce((a, b) => a + b, 0));
  });
});
