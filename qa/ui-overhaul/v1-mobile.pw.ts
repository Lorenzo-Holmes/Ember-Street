import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../../src/game/v060/dayManagement';
import { drawExpeditionEvent, startExpedition } from '../../src/game/v060/expedition';
import { scheduleNight } from '../../src/game/v060/nightScheduler';
import type { GameState } from '../../src/game/types';

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
  await expect(page.locator('main')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

async function expectCanonicalArt(locator: Locator) {
  await expect(locator).toBeVisible();
  const background = await locator.evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain('/assets/canonical/');
  expect(background).toContain('.webp');
}

test('V1 home is illustration-first and keeps the primary day action in the first mobile screen', async ({ page }) => {
  await installState(page, routineV1State());
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.getByText('余烬长街', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /安排今天/ })).toBeVisible();
  await expect(page.getByText('街区居民', { exact: true })).toBeVisible();
  await expectCanonicalArt(page.locator('.v1-home-hero__art'));

  const primary = await page.getByRole('button', { name: /安排今天/ }).boundingBox();
  expect(primary).toBeTruthy();
  expect(primary!.y).toBeLessThan(844);

  const nav = page.locator('nav[aria-label="主导航"]');
  await expect(nav.getByRole('button')).toHaveCount(4);
  await expect(nav.getByRole('button', { name: '据点', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '探索', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '幸存者', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '记录', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-home-390x844.png`, fullPage: true });
});

test('building page keeps six facilities without fake large-art placeholders', async ({ page }) => {
  await installState(page, routineV1State(971008));
  await page.getByRole('button', { name: /查看六座设施/ }).click();
  await expect(page.locator('.v1-building')).toHaveCount(6);
  await expect(page.locator('.v1-building__art')).toHaveCount(1);
  await expectCanonicalArt(page.locator('.v1-building__art'));
  await expect(page.getByText('插画暂缺')).toHaveCount(0);
  await expect(page.getByText('搜索站', { exact: true })).toBeVisible();
  await expect(page.getByText('广播亭', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-buildings-390x844.png`, fullPage: true });
});

test('survivors and street residents remain separate and seven jobs stay behind survivor detail', async ({ page }) => {
  await installState(page, routineV1State(971002));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  await expect(page.getByText('幸存者', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('街区居民', { exact: true })).toBeVisible();
  await expect(page.locator('.v1s-jobs')).toHaveCount(0);
  await expectCanonicalArt(page.locator('.v1s-portrait').first());
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-survivors-390x844.png`, fullPage: true });

  const linxia = page.locator('.v1s-list article').filter({ hasText: '林夏' }).first();
  await linxia.getByRole('button', { name: /查看/ }).click();
  await expect(page.getByText('林夏', { exact: true })).toBeVisible();
  await expect(page.locator('.v1s-jobs button')).toHaveCount(7);
  await expect(page.getByRole('button', { name: /探索/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /休息/ }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('records use logs, places, unlocked character stories and memorial instead of ending collection', async ({ page }) => {
  await installState(page, routineV1State(971003));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '记录', exact: true }).click();
  await expect(page.getByRole('button', { name: '街区日志' })).toBeVisible();
  await expect(page.getByRole('button', { name: '地点' })).toBeVisible();
  await expect(page.getByRole('button', { name: '角色档案' })).toBeVisible();
  await expect(page.getByRole('button', { name: '纪念墙' })).toBeVisible();
  await expect(page.getByText('结局图鉴')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-390x844.png`, fullPage: true });

  await page.getByRole('button', { name: '角色档案' }).click();
  await expect(page.locator('.v1r-profiles')).toBeVisible();
  await expectCanonicalArt(page.locator('.v1r-mini-art').first());
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-profiles-390x844.png`, fullPage: true });
});

test('exploration is location-first and never exposes A-series production ids', async ({ page }) => {
  await installState(page, routineV1State(971004));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '探索', exact: true }).click();
  await expect(page.getByText('今天去哪？', { exact: true })).toBeVisible();
  await expect(page.getByText('便利店', { exact: true }).first()).toBeVisible();
  await expectCanonicalArt(page.locator('.v1e-location .v1e-art').first());
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/\bA\d{2}\b/);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-explore-390x844.png`, fullPage: true });
});

test('expedition can reopen assignments before departure but not after the team leaves', async ({ page }) => {
  let prepared = routineV1State(971006);
  prepared = assignDayJob(prepared, 'lin-xia', 'expedition');
  prepared = { ...lockDayAssignments(prepared), phase: 'expedition' };
  await installState(page, prepared);
  const back = page.getByRole('button', { name: '← 重新安排', exact: true });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page.locator('.v1s-list')).toBeVisible();

  let departed = routineV1State(971007);
  departed = assignDayJob(departed, 'lin-xia', 'expedition');
  departed = lockDayAssignments(departed);
  departed = startExpedition(departed, ['lin-xia'], 'convenience-store');
  departed = drawExpeditionEvent(departed);
  departed = { ...departed, phase: 'expedition' };
  await installState(page, departed);
  await expect(page.getByText('探索中 · 已经离开据点', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '← 重新安排', exact: true })).toHaveCount(0);
});

test('night V1 keeps event art plus three real consequence-bearing choices', async ({ page }) => {
  const base = routineV1State(971005);
  const night = scheduleNight({ ...base, phase: 'night' });
  expect(night.nightState.scheduledEventIds.length).toBeGreaterThan(0);
  await installState(page, night);
  await expectCanonicalArt(page.locator('.v1n-art'));
  await expect(page.locator('.v1n-choices button')).toHaveCount(3);
  await expect(page.locator('.v1n-choices small').first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-night-390x844.png`, fullPage: true });
});
