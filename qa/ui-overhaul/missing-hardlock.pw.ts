import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

function quietMissingState(seed: number): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 6,
    phase: 'street',
    socialState: {
      pressure: 0,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 0,
      principles: [],
      lastRequestDay: 6,
    },
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
    ],
    survivors: base.survivors.map((survivor, index) => index === 0
      ? { ...survivor, condition: 'missing' as const }
      : survivor),
  };
}

async function installState(page: Page, state: GameState) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

async function continueToday(page: Page) {
  const continueButton = page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true });
  await expect(continueButton).toBeVisible();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.locator('.v1-day-action')).toContainText('今天谁去哪里');
  await expect(page.locator('nav[aria-label="主导航"]')).toBeVisible();
}

test('failed missing search cannot trap the player and stays recoverable after reload', async ({ page }) => {
  const base = quietMissingState(986001);
  const missingId = base.survivors[0].id;
  const failed: GameState = {
    ...base,
    storyFlags: [
      ...base.storyFlags,
      `missing_search:${missingId}:${base.day}`,
      `missing_search_failed:${missingId}:${base.day}`,
    ],
  };

  await installState(page, failed);
  await expect(page.getByText('天亮了，床还是空的', { exact: true })).toBeVisible();
  await expect(page.locator('.v6-missing-action:enabled')).toHaveCount(0);
  await continueToday(page);

  await page.reload();
  await continueSavedSessionFromTitle(page);
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.getByText('天亮了，床还是空的', { exact: true })).toHaveCount(0);
});

test('missing person with no available search method still has a progression action', async ({ page }) => {
  const base = quietMissingState(986002);
  const noSearch: GameState = {
    ...base,
    inventory: { ...base.inventory, power: 0 },
    buildings: { ...base.buildings, radio: 0 },
    survivors: base.survivors.map((survivor, index) => {
      if (index === 0) return survivor;
      if (index === 1) return { ...survivor, condition: 'healthy' as const };
      return { ...survivor, condition: 'dead' as const };
    }),
  };

  await installState(page, noSearch);
  await expect(page.getByText('天亮了，床还是空的', { exact: true })).toBeVisible();
  await expect(page.locator('.v6-missing-action:enabled')).toHaveCount(0);
  await continueToday(page);
});
