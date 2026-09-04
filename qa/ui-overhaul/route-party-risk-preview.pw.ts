import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS, locationUnlockFlag } from '../../src/game/v060/campaignEvents';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

function lateRouteState(): GameState {
  const base = createV060InitialState(995025);
  return {
    ...base,
    day: 25,
    phase: 'street',
    civilianResidents: 0,
    buildings: { ...base.buildings, searchStation: 2 },
    survivors: base.survivors.map((survivor) => ({ ...survivor, energy: 80, condition: 'healthy' as const })),
    socialState: {
      pressure: 0,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 0,
      principles: ['everyone-shares', 'core-leads', 'prepare-evacuation'],
      lastRequestDay: 25,
    },
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
      locationUnlockFlag('warehouse'),
      'principle:everyone-shares',
      'principle:core-leads',
      'principle:prepare-evacuation',
    ],
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

async function assignExplorer(page: Page, survivorName: string) {
  const card = page.locator('.v1s-list article').filter({ hasText: survivorName }).first();
  await card.getByRole('button', { name: /翻开/ }).click();
  await page.locator('.v1s-jobs button').filter({ hasText: '探索' }).first().click();
  await expect(page.getByText('今天去哪？', { exact: true })).toBeVisible();
}

test('first explorer sees how a later companion can lower a scary route risk', async ({ page }) => {
  await installState(page, lateRouteState());
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();

  await assignExplorer(page, '林夏');
  const soloWarehouse = page.locator('.v1e-location').filter({ hasText: '北仓库' }).first();
  await expect(soloWarehouse).toContainText('不该轻易进去');
  await expect(soloWarehouse).toContainText('一个人走，出事时没人照应');
  await expect(soloWarehouse.locator('.v1e-companion-hint')).toHaveText('再安排 1 人走同一路线，风险最低可到：容易出事');

  await soloWarehouse.click();
  await page.locator('.v1e-primary:enabled').click();
  await expect(page.getByText('谁还能出门', { exact: true })).toBeVisible();

  await assignExplorer(page, '老周');
  const pairedWarehouse = page.locator('.v1e-location').filter({ hasText: '北仓库' }).first();
  await expect(pairedWarehouse).toContainText('容易出事');
  await expect(pairedWarehouse).toContainText('两个人同行，路上能互相照应');
  await expect(pairedWarehouse.locator('.v1e-companion-hint')).toHaveCount(0);
});
