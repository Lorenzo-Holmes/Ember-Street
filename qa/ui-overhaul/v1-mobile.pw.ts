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
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { tag: element.tagName, className: element.className, left: rect.left, right: rect.right, width: rect.width, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth };
      })
      .filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1 || rect.scrollWidth > rect.clientWidth + 1)
      .slice(0, 12),
  }));
  expect(metrics.documentWidth, JSON.stringify(metrics.offenders)).toBeLessThanOrEqual(metrics.viewport + 1);
}

test('UIUX V2 opens on the scene-first building hub with the fixed four-entry navigation', async ({ page }) => {
  await installState(page, routineV1State());
  await expect(page.locator('.v1-buildings-page')).toBeVisible();
  await expect(page.locator('.v2-shelter-scene')).toBeVisible();
  await expect(page.locator('.v2-building-hotspot')).toHaveCount(6);
  await expect(page.locator('.v2-building-nav .v1-building')).toHaveCount(6);

  const nav = page.locator('nav[aria-label="主导航"]');
  await expect(nav.getByRole('button')).toHaveCount(4);
  await expect(nav.getByRole('button', { name: '建筑', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '幸存者', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '探索', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '日志', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v2-buildings-hub-390x844.png`, fullPage: true });
});

test('building page keeps six facilities and canonical shelter art', async ({ page }) => {
  await installState(page, routineV1State(971008));
  await expect(page.locator('.v1-building')).toHaveCount(6);
  await expect(page.locator('.v2-building-nav').getByText('路线屋', { exact: true })).toBeVisible();
  await expect(page.locator('.v2-building-nav').getByText('广播间', { exact: true })).toBeVisible();
  const shelter = page.locator('.v1-building').filter({ hasText: '宿营屋' }).first();
  await shelter.locator('.v1-building__summary').click();
  await expect(shelter.locator('.v1-building__art')).toBeVisible();
  await expect(shelter).toHaveClass(/is-selected/);
  await expect(page.locator('.v2-building-hotspot').filter({ hasText: '宿营屋' })).toHaveClass(/is-selected/);
  const workshop = page.locator('.v1-building').filter({ hasText: '修车铺' }).first();
  await workshop.locator('.v1-building__summary').click();
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '建筑', exact: true }).click();
  await expect(page.locator('.v1-building').filter({ hasText: '修车铺' }).first()).toHaveClass(/is-selected/);
  await expect(page.locator('.v2-building-hotspot').filter({ hasText: '修车铺' })).toHaveClass(/is-selected/);
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

test('journal uses logs, places, character stories and memorial instead of ending collection', async ({ page }) => {
  await installState(page, routineV1State(971003));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '日志', exact: true }).click();
  await expect(page.locator('.v1r-page')).toBeVisible();
  const tabs = page.locator('.v1r-tabs button');
  await expect(tabs).toHaveCount(4);
  expect(await tabs.allTextContents()).toEqual(['这几天', '走过的路', '还在的人', '没回来的人']);
  await expect(page.getByText('结局图鉴')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-390x844.png`, fullPage: true });

  await tabs.nth(2).click();
  await expect(page.locator('.v1r-profiles')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/v1-records-profiles-390x844.png`, fullPage: true });
});

test('top-level exploration is a map-and-intel board and never exposes A-series production ids', async ({ page }) => {
  await installState(page, routineV1State(971004));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '探索', exact: true }).click();
  await expect(page.locator('.v2-map-board')).toBeVisible();
  await expect(page.locator('.v2-deploy-board')).toBeVisible();
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

  const firstChoice = await page.locator('.v1n-choices button:enabled').first().elementHandle();
  expect(firstChoice).toBeTruthy();
  await firstChoice!.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const savedNight = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as GameState | null, SAVE_KEY);
  expect(savedNight).toBeTruthy();
  expect(savedNight!.nightState.eventIndex).toBeLessThanOrEqual(1);
  expect(savedNight!.nightState.resolutions.length).toBeLessThanOrEqual(1);
});

test('dawn journal can reveal immediately and rapid next-day clicks advance only once', async ({ page }) => {
  const base = routineV1State(971009);
  const dawn: GameState = {
    ...base,
    phase: 'dawn',
    journal: [
      ...(base.journal ?? []),
      { id: 'uiux-dawn-work', day: base.day, kind: 'work', title: '仓房点过了', body: '今天的消耗已经记进本子。' },
      { id: 'uiux-dawn-expedition', day: base.day, kind: 'expedition', title: '街外有人回来', body: '带回来的东西和伤口都写在这里。' },
      { id: 'uiux-dawn-night', day: base.day, kind: 'night', title: '夜里没有忘记', body: '门外的选择留下了结果。' },
    ],
  };
  await installState(page, dawn);
  await expect(page.locator('.v2-dawn-journal')).toBeVisible();
  const reveal = page.getByRole('button', { name: '直接看完这一页', exact: true });
  await expect(reveal).toBeVisible();
  await reveal.click();
  await expect(page.locator('.notebook-page--dawn-v1')).toHaveClass(/is-revealed/);

  const nextDay = await page.getByRole('button', { name: `翻到第 ${base.day + 1} 天`, exact: true }).elementHandle();
  expect(nextDay).toBeTruthy();
  await nextDay!.evaluate((element) => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as GameState | null, SAVE_KEY);
  expect(saved?.day).toBe(base.day + 1);
});
