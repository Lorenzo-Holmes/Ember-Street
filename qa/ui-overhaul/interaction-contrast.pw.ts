import { expect, test } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

test('assignment controls remain visually discoverable', async ({ page }) => {
  const base = createV060InitialState(963001);
  const state = {
    ...base,
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
    ],
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(({ gameState, saveKey, activeKey }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { gameState: state, saveKey: SAVE_KEY, activeKey: ACTIVE_KEY });
  await page.reload();

  const firstJob = page.locator('.v6-job-grid > button:enabled').first();
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
  expect(visual.height).toBeGreaterThanOrEqual(39);
});
