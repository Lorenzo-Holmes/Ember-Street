import { expect, test } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

test('assignment controls remain visually discoverable after opening a survivor', async ({ page }) => {
  const base = createV060InitialState(963001);
  const state = {
    ...base,
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
    ],
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(({ gameState, saveKey, activeKey }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { gameState: state, saveKey: SAVE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();
  await continueSavedSessionFromTitle(page);

  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  const linxia = page.locator('.v1s-list article').filter({ hasText: '林夏' }).first();
  await linxia.getByRole('button', { name: /翻开/ }).click();

  const firstJob = page.locator('.v1s-jobs > button:enabled').first();
  await expect(firstJob).toBeVisible();
  const visual = await firstJob.evaluate((button) => {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return {
      color: style.color,
      borderWidth: style.borderTopWidth,
      height: rect.height,
    };
  });

  expect(visual.color).not.toBe('rgb(0, 0, 0)');
  expect(visual.borderWidth).not.toBe('0px');
  expect(visual.height).toBeGreaterThanOrEqual(44);
});