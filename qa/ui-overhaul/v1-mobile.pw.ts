import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../../src/game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from '../../src/game/v060/expedition';
import { scheduleNight } from '../../src/game/v060/nightScheduler';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const SCREENSHOT_DIR = 'qa/ui-overhaul/screenshots';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

function routineV1State(seed = 971001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 6,
    phase: 'street',
    civilianResidents: 6,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'logistics', lastSupportDay: 6 },
    buildings: { ...base.buildings, shelter: 2 },
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
      'community_rotation_unlocked',
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

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('V1 home is illustration-first and keeps the primary day action reachable on mobile', async ({ page }) => {
  await installState(page, routineV1State());
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.getByText('余烬长街', { exact: true })).toBeVisible();
  await expect(page.locator('.v1-day-action')).toContainText('今天谁去哪里');
  await expect(page.getByText('街区居民', { exact: true })).toBeVisible();

  const nav = page.locator('nav[aria-label="主导航"]');
  await expect(nav.getByRole('button')).toHaveCount(4);
  await expect(nav.getByRole('button', { name: '据点', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '建筑', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '幸存者', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '记录', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-home-390x844.png`, fullPage: true });
});

test('building page keeps six facilities and canonical art', async ({ page }) => {
  await installState(page, routineV1State(971008));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '建筑', exact: true }).click();
  await expect(page.locator('.v1-building')).toHaveCount(6);
  expect(await page.locator('.v1-building__art').count()).toBeGreaterThan(0);
  await expect(page.getByText('搜索站', { exact: true })).toBeVisible();
  await expect(page.getByText('广播亭', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-buildings-390x844.png`, fullPage: true });
});

test('survivors and street residents remain separate and seven jobs stay behind survivor detail', async ({ page }) => {
  await installState(page, routineV1State(971002));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  await expect(page.getByText('谁还能出门', { exact: true })).toBeVisible();
  await expect(page.getByText('街里其他人', { exact: true })).toBeVisible();
  await expect(page.locator('.v1s-jobs')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-survivors-390x844.png`, fullPage: true });

  const linxia = page.locator('.v1s-list article').filter({ hasText: '林夏' }).first();
  await linxia.getByRole('button', { name: /翻开/ }).click();
  await expect(page.getByText('林夏', { exact: true })).toBeVisible();
  await expect(page.locator('.v1s-jobs button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: /探索/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /休息/ }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('records use logs, places, character stories and memorial instead of ending collection', async ({ page }) => {
  await installState(page, routineV1State(971003));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '记录', exact: true }).click();
  await expect(page.getByRole('button', { name: '这几天', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '走过的路', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '还在的人', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '没回来的人', exact: true })).toBeVisible();
  await expect(page.getByText('结局图鉴')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-390x844.png`, fullPage: true });

  await page.getByRole('button', { name: '还在的人', exact: true }).click();
  await expect(page.locator('.v1r-profiles')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-profiles-390x844.png`, fullPage: true });
});

test('exploration route is chosen from survivor assignment and never exposes A-series production ids', async ({ page }) => {
  await installState(page, routineV1State(971004));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  const linxia = page.locator('.v1s-list article').filter({ hasText: '林夏' }).first();
  await linxia.getByRole('button', { name: /翻开/ }).click();
  await page.locator('.v1s-jobs button').filter({ hasText: '探索' }).first().click();
  await expect(page.getByText('今天去哪？', { exact: true })).toBeVisible();
  await expect(page.getByText('便利店', { exact: true }).first()).toBeVisible();
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/\bA\d{2}\b/);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-explore-route-390x844.png`, fullPage: true });
});

test('departed expedition exposes three decisions and cannot return to assignments', async ({ page }) => {
  let departed = routineV1State(971007);
  departed = assignDayJob(departed, 'lin-xia', 'expedition');
  departed = lockDayAssignments(departed);
  departed = startExpedition(departed, ['lin-xia'], 'convenience-store');
  departed = drawExpeditionEvent(departed);
  departed = { ...departed, phase: 'expedition' };
  await installState(page, departed);
  await expect(page.getByText('人已经在街外', { exact: true })).toBeVisible();
  await expect(page.locator('.v1e-decisions button')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '← 重新安排', exact: true })).toHaveCount(0);
});

test('night V1 keeps event art plus three real consequence-bearing choices', async ({ page }) => {
  const base = routineV1State(971005);
  const night = scheduleNight({ ...base, phase: 'night' });
  expect(night.nightState.scheduledEventIds.length).toBeGreaterThan(0);
  await installState(page, night);
  await expect(page.locator('.v1n-art')).toBeVisible();
  await expect(page.locator('.v1n-choices button')).toHaveCount(3);
  await expect(page.locator('.v1n-choices button span')).toHaveCount(3);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-night-390x844.png`, fullPage: true });
});