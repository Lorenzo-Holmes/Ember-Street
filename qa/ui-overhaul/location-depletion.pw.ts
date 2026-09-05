import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

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

test('depleted locations warn the player before committing an expedition route', async ({ page }) => {
  const base = createV060InitialState(990606);
  const state: GameState = {
    ...base,
    day: 6,
    phase: 'street',
    civilianResidents: 0,
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
      'visited:convenience-store',
      'looted_visit:convenience-store:1',
      'looted_visit:convenience-store:2',
      'looted_visit:convenience-store:3',
      'depleted:convenience-store',
    ],
  };

  await installState(page, state);
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await page.locator('.v1-day-action').click();
  await expect(page.locator('.notebook-page--survivors')).toBeVisible();
  await page.locator('.v1s-list article button:enabled').first().click();
  await page.locator('.v1s-jobs button').filter({ hasText: '探索' }).click();

  await expect(page.locator('.notebook-page--route')).toBeVisible();
  const convenience = page.locator('.v1e-location').filter({ hasText: '便利店' });
  await expect(convenience).toContainText('物资快空');
  await expect(convenience).toContainText('已经带回过 3 次');
  await expect(convenience).toContainText('主要物资只剩零散一些');
});
