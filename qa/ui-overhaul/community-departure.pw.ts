import { expect, test } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { pendingCommunityDeparture, queueCommunityDeparture } from '../../src/game/v060/communityDeparture';
import type { GameState } from '../../src/game/types';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

function departureState(): GameState {
  const base = createV060InitialState(7);
  const stressed: GameState = {
    ...base,
    day: 9,
    phase: 'street',
    rngState: 7,
    hope: 8,
    defense: 24,
    civilianResidents: 6,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'defense', lastSupportDay: 9 },
    mealState: { ...base.mealState, quality: 'struggling', consecutiveShortageDays: 3 },
    socialState: { ...base.socialState!, pressure: 6 },
    inventory: { ...base.inventory, ration: 12 },
  };
  return queueCommunityDeparture(stressed);
}

async function installState(page: import('@playwright/test').Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
}

test('mobile dawn surfaces resident departure before normal day management', async ({ page }) => {
  const state = departureState();
  const pending = pendingCommunityDeparture(state);
  expect(pending).not.toBeNull();

  await page.setViewportSize({ width: 390, height: 844 });
  await installState(page, state);

  await expect(page.getByText(pending!.title, { exact: true })).toBeVisible();
  await expect(page.getByText('这是人口流失，不是死亡事件', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`拿出 ${pending!.rationCost} 份口粮`) })).toBeVisible();
  await expect(page.getByRole('button', { name: '让他们走' })).toBeVisible();

  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits).toBe(true);

  await page.getByRole('button', { name: new RegExp(`拿出 ${pending!.rationCost} 份口粮`) }).click();
  await expect(page.getByText(pending!.title, { exact: true })).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();

  const stored = await page.evaluate((saveKey) => JSON.parse(localStorage.getItem(saveKey) ?? '{}') as GameState, SAVE_KEY);
  expect(stored.civilianResidents).toBe(6);
  expect(stored.inventory.ration).toBe(12 - pending!.rationCost);
  expect(stored.campaignStats.civilianDepartures).toBe(0);
});