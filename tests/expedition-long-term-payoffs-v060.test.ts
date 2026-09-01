import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/game/types';
import { createV060InitialState } from '../src/game/v060/campaign';
import { nightCausalSignals, nightEventWeight } from '../src/game/v060/causalNight';
import { EXPEDITION_STORY_EVENTS } from '../src/game/v060/expeditionStories';
import { medicalCrisisFlag } from '../src/game/v060/mortality';
import { mortalityEventById } from '../src/game/v060/mortalityEvents';
import { NORMAL_NIGHT_EVENTS } from '../src/game/v060/nightEvents';

function criticalMedicalState(extraFlags: string[] = []): GameState {
  const base = createV060InitialState(920001);
  return {
    ...base,
    day: 14,
    survivors: base.survivors.map((survivor) => survivor.id === 'lin-xia'
      ? { ...survivor, condition: 'critical' as const, untreatedDays: 1 }
      : survivor),
    storyFlags: [...base.storyFlags, medicalCrisisFlag('lin-xia'), ...extraFlags],
  };
}

describe('v0.6 expedition long-term payoffs', () => {
  it('contains forty location-specific stories plus the shared generic pool', () => {
    const specific = EXPEDITION_STORY_EVENTS.filter((event) => event.kind !== 'generic');
    const generic = EXPEDITION_STORY_EVENTS.filter((event) => event.kind === 'generic');
    expect(specific).toHaveLength(40);
    expect(generic).toHaveLength(8);
  });

  it('makes recovered generator backup reduce low-power failure-event weight', () => {
    const generatorEvent = NORMAL_NIGHT_EVENTS.find((event) => event.id === 'generator-drop')!;
    const base: GameState = { ...createV060InitialState(920002), inventory: { ...createV060InitialState(920002).inventory, power: 20 } };
    const withBackup: GameState = { ...base, storyFlags: [...base.storyFlags, 'generator_backup'] };
    expect(nightEventWeight(withBackup, generatorEvent)).toBeLessThan(nightEventWeight(base, generatorEvent));
    expect(nightCausalSignals(withBackup).join(' ')).toContain('备用发电组件');
  });

  it('makes pharmacy antibiotic stock reduce critical emergency medicine cost', () => {
    const withoutStock = mortalityEventById(criticalMedicalState(), 'mortality-medical:lin-xia')!;
    const withStock = mortalityEventById(criticalMedicalState(['antibiotic_stock']), 'mortality-medical:lin-xia')!;
    const normalChoice = withoutStock.choices.find((choice) => choice.id === 'mortality-medicine')!;
    const stockedChoice = withStock.choices.find((choice) => choice.id === 'mortality-medicine')!;
    expect(normalChoice.cost?.medicine).toBe(2);
    expect(stockedChoice.cost?.medicine).toBe(1);
    expect(stockedChoice.detail).toContain('探索带回的医疗储备');
  });

  it('makes the hospital medical cache provide the same critical-care payoff', () => {
    const withCache = mortalityEventById(criticalMedicalState(['medical_cache']), 'mortality-medical:lin-xia')!;
    const choice = withCache.choices.find((item) => item.id === 'mortality-medicine')!;
    expect(choice.cost?.medicine).toBe(1);
  });
});
