import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

async function settleOpeningEvents(page: Page) {
  const home = page.locator('.v1-home-page');
  for (let index = 0; index < 10 && !(await home.isVisible().catch(() => false)); index += 1) {
    const action = page.locator('.notebook-page--story-event .v1-phase-primary');
    await expect(action).toBeVisible();
    await action.click();
  }
  await expect(home).toBeVisible();
}

async function finishNight(page: Page) {
  for (let index = 0; index < 20; index += 1) {
    if (await page.locator('.notebook-page--night-summary-v1').isVisible().catch(() => false)) return;

    const turnOffLights = page.getByRole('button', { name: '关掉外面的灯', exact: true });
    if (await turnOffLights.isVisible().catch(() => false)) {
      await turnOffLights.click();
      continue;
    }

    const roll = page.getByRole('button', { name: '试一次', exact: true });
    if (await roll.isVisible().catch(() => false)) {
      await roll.click();
      continue;
    }

    const accept = page.getByRole('button', { name: '把结果记下', exact: true });
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      continue;
    }

    const choices = page.locator('.v1n-choices button:enabled');
    await expect(choices.first()).toBeVisible();
    await choices.last().click();
  }
  throw new Error('Night did not reach the summary within the release-blocker action budget.');
}

async function installState(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

test('fresh player path reaches DAY2 through dusk and a complete night', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();

  await settleOpeningEvents(page);
  await page.locator('.v1-day-action').click();
  await expect(page.getByText('谁还能出门', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '这张名单就这么定', exact: true }).click();

  await expect(page.getByText('太阳快下去了。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合上本子，等天黑', exact: true }).click();
  await finishNight(page);

  await page.getByRole('button', { name: '等天亮再清点', exact: true }).click();
  await expect(page.getByText('天亮了。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '翻到第 2 天', exact: true }).click();

  const saved = await page.evaluate((saveKey) => JSON.parse(localStorage.getItem(saveKey) ?? 'null'), SAVE_KEY);
  expect(saved?.day).toBe(2);
  expect(['street', 'assignment']).toContain(saved?.phase);
});

test('failed missing search always exposes a way back to the day', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = createV060InitialState(989001);
  const missingId = base.survivors[0].id;
  const failed: GameState = {
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
    survivors: base.survivors.map((survivor) => survivor.id === missingId
      ? { ...survivor, condition: 'missing' as const }
      : survivor),
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
      `missing_search:${missingId}:6`,
      `missing_search_failed:${missingId}:6`,
    ],
  };

  await installState(page, failed);
  await expect(page.locator('.v6-missing-action:enabled')).toHaveCount(0);
  const continueButton = page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.locator('.v1-day-action')).toBeVisible();
});
