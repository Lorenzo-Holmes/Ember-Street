import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { nightChoicePreview } from '../../src/game/v060/decisionReadability';
import { canAffordNightChoice, currentNightEvent } from '../../src/game/v060/nightScheduler';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from '../ui-overhaul/session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

interface DayObservation {
  day: number;
  ration: number;
  mealQuality: string;
  shortageDays: number;
  hope: number;
  survivors: Array<{ name: string; energy: number; condition: string }>;
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.first().isVisible().catch(() => false);
}

async function click(locator: Locator): Promise<boolean> {
  const target = locator.first();
  if (!await visible(target)) return false;
  await target.click();
  await target.page().waitForTimeout(40);
  return true;
}

async function saved(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY);
}

function starvationState(): GameState {
  const base = createV060InitialState(994019);
  return {
    ...base,
    day: 19,
    phase: 'street',
    hope: 60,
    defense: 100,
    civilianResidents: 0,
    inventory: { ration: 0, medicine: 20, power: 100, materials: 30, parts: 30 },
    buildings: { searchStation: 3, workshop: 3, clinic: 3, watchPost: 3, shelter: 3, radio: 3 },
    mainLightStage: 4,
    survivors: base.survivors.map((survivor) => ({ ...survivor, energy: 60, condition: 'healthy' as const, trust: 3 })),
    mealState: {
      ...base.mealState,
      quality: 'cold',
      coverage: 0,
      cookingCapacity: 0,
      residentsFed: 0,
      rationCoverage: 0,
      consecutiveShortageDays: 3,
      wellFed: false,
      wellFedPlus: false,
    },
    socialState: {
      pressure: 0,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 0,
      principles: ['everyone-shares', 'core-leads', 'prepare-evacuation'],
      lastRequestDay: 19,
    },
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
      'principle:everyone-shares',
      'principle:core-leads',
      'principle:prepare-evacuation',
    ],
  };
}

async function installState(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.clear();
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

function chooseSafestNightOption(state: GameState): string | null {
  const event = currentNightEvent(state);
  if (!event) return null;
  let best: { id: string; score: number } | null = null;
  for (const option of event.choices.filter((choice) => canAffordNightChoice(state, choice))) {
    const preview = nightChoicePreview(state, event, option);
    const text = `${option.label} ${option.detail} ${preview.tags.join(' ')}`;
    let score = { safe: 10, stable: 8, risky: 1, severe: -20 }[preview.tone];
    if (/一定会有人死/.test(text)) score -= 50;
    if (/可能会有人死/.test(text)) score -= 20;
    if (/可能受伤/.test(text)) score -= 8;
    if (/门墙可能受损/.test(text)) score -= 4;
    if (/人心可能再往下掉/.test(text)) score -= 3;
    if (!best || score > best.score) best = { id: option.id, score };
  }
  return best?.id ?? null;
}

function observe(state: GameState): DayObservation {
  return {
    day: state.day,
    ration: state.inventory.ration,
    mealQuality: state.mealState.quality,
    shortageDays: state.mealState.consecutiveShortageDays,
    hope: state.hope,
    survivors: state.survivors
      .filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing')
      .map((survivor) => ({ name: survivor.name, energy: survivor.energy, condition: survivor.condition ?? 'healthy' })),
  };
}

test('连续无口粮时，真人只休息能撑成什么样', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installState(page, starvationState());

  const observations: DayObservation[] = [];
  let loggedDay = 0;

  for (let step = 0; step < 500; step += 1) {
    const state = await saved(page);
    if (state.day !== loggedDay) {
      loggedDay = state.day;
      const row = observe(state);
      observations.push(row);
      console.log(`[starvation] ${JSON.stringify(row)}`);
      if (state.day >= 26) {
        mkdirSync('test-results/human-playtest', { recursive: true });
        writeFileSync('test-results/human-playtest/starvation.json', JSON.stringify(observations, null, 2));
        expect(observations.length).toBeGreaterThanOrEqual(7);
        return;
      }
    }

    if (await click(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;

    const requestCard = page.locator('.v6-request-card').first();
    if (await visible(requestCard)) {
      await requestCard.locator('button').filter({ hasText: '不答应' }).first().click();
      await page.waitForTimeout(40);
      continue;
    }

    const principle = page.locator('.v6-principle-choice').first();
    if (await visible(principle)) {
      await principle.click();
      await page.waitForTimeout(40);
      continue;
    }

    if (await visible(page.locator('.v1-home-page'))) {
      await page.locator('.v1-day-action').click();
      await page.waitForTimeout(35);
      continue;
    }

    if (await visible(page.locator('.notebook-page--survivors'))) {
      const done = page.locator('.v1s-done:enabled');
      if (await click(done)) continue;
    }

    if (await click(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '试一次', exact: true }))) continue;

    const reroll = page.getByRole('button', { name: '有人愿意替你再试一次', exact: true }).first();
    if (await visible(reroll) && state.pendingCheck?.dice && state.pendingCheck.outcome === 'failure') {
      await reroll.click();
      await page.waitForTimeout(40);
      continue;
    }
    if (await click(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const choiceId = chooseSafestNightOption(state);
      const event = currentNightEvent(state);
      const option = event?.choices.find((choice) => choice.id === choiceId);
      if (!option) throw new Error(`DAY ${state.day}: no affordable safe night option`);
      await page.locator('.v1n-choices button:enabled').filter({ hasText: option.label }).first().click();
      await page.waitForTimeout(40);
      continue;
    }

    if (await click(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ }))) continue;

    const buttons = await page.locator('button:visible').allTextContents();
    throw new Error(`starvation scenario stalled: ${JSON.stringify({ day: state.day, phase: state.phase, buttons: buttons.slice(0, 12) })}`);
  }

  throw new Error('starvation scenario exceeded action budget');
});
