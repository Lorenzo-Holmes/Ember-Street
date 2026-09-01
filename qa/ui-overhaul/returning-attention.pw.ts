import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState, StreetPrincipleId } from '../../src/game/types';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const SCREENSHOT_DIR = 'qa/ui-overhaul/screenshots';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

function settledPrinciples(day: number): StreetPrincipleId[] {
  if (day >= 21) return ['everyone-shares', 'community-shares-risk', 'hold-the-street'];
  if (day >= 14) return ['everyone-shares', 'community-shares-risk'];
  if (day >= 7) return ['everyone-shares'];
  return [];
}

function returningState(day: number, seed: number): GameState {
  const base = createV060InitialState(seed);
  const principles = settledPrinciples(day);
  return {
    ...base,
    day,
    phase: 'street',
    inventory: { ration: 24, medicine: 8, power: 70, materials: 30, parts: 20 },
    buildings: { searchStation: 2, workshop: 1, clinic: 1, watchPost: 1, shelter: 2, radio: 1 },
    civilianResidents: 6,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: 'logistics', lastSupportDay: day },
    socialState: {
      pressure: 1,
      activePromise: null,
      fulfilledPromises: 2,
      brokenPromises: 0,
      principles,
      lastRequestDay: day,
    },
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
      'community_rotation_unlocked',
      ...principles.map((principle) => `principle:${principle}`),
    ],
  };
}

async function renderState(page: Page, state: GameState) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(80);
}

async function yOf(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  return box!.y;
}

test('routine DAY27 quiets already-settled community and social panels', async ({ page }) => {
  await renderState(page, returningState(27, 972027));
  const assignment = page.locator('.v6-section').filter({ hasText: '今日派遣' }).first();
  const community = page.locator('.v6-section').filter({ hasText: '街里的人手' }).first();
  const social = page.locator('.v6-social-panel').first();
  const building = page.locator('.v6-section').filter({ hasText: '街区建设' }).first();
  const commit = page.getByRole('button', { name: /安排好了/ });

  await expect(assignment).toBeVisible();
  await expect(community).toBeVisible();
  await expect(social).toBeVisible();
  await expect(building).toBeVisible();
  await expect(commit).toContainText(/还有 \d+ 处能收拾/);

  const assignmentY = await yOf(assignment);
  const commitY = await yOf(commit);
  expect(assignmentY).toBeLessThan(commitY);
  expect(commitY).toBeLessThan(await yOf(building));
  expect(commitY).toBeLessThan(await yOf(community));
  expect(commitY).toBeLessThan(await yOf(social));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/returning-day27-routine-1440x900.png`, fullPage: true });
});

test('an unresolved promise stays above assignment on DAY20', async ({ page }) => {
  const base = returningState(20, 972020);
  const state: GameState = {
    ...base,
    socialState: {
      ...base.socialState!,
      activePromise: {
        id: 'promise:hot-meal:street:19',
        kind: 'hot-meal',
        title: '至少让孩子吃顿热的',
        createdDay: 19,
        deadlineDay: 21,
        status: 'active',
      },
    },
  };
  await renderState(page, state);
  const promise = page.locator('.v6-social-panel').filter({ hasText: '我们答应过的' }).first();
  const assignment = page.locator('.v6-section').filter({ hasText: '今日派遣' }).first();
  await expect(promise).toBeVisible();
  expect(await yOf(promise)).toBeLessThan(await yOf(assignment));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/returning-day20-promise-1440x900.png`, fullPage: true });
});

test('a missing person stays ahead of routine assignment', async ({ page }) => {
  const base = returningState(18, 972018);
  const state: GameState = {
    ...base,
    survivors: base.survivors.map((survivor, index) => index === 0 ? { ...survivor, condition: 'missing' as const } : survivor),
  };
  await renderState(page, state);
  const missing = page.locator('.v6-section').filter({ hasText: '还有人没回来' }).first();
  const assignment = page.locator('.v6-section').filter({ hasText: '今日派遣' }).first();
  await expect(missing).toBeVisible();
  expect(await yOf(missing)).toBeLessThan(await yOf(assignment));
});

test('an unselected resident rotation stays actionable before assignment', async ({ page }) => {
  const base = returningState(18, 972118);
  const state: GameState = {
    ...base,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: null },
  };
  await renderState(page, state);
  const community = page.locator('.v6-section').filter({ hasText: '街里的人手' }).first();
  const assignment = page.locator('.v6-section').filter({ hasText: '今日派遣' }).first();
  await expect(page.getByRole('button', { name: '去饭馆搭手' })).toBeVisible();
  expect(await yOf(community)).toBeLessThan(await yOf(assignment));
});

test('critical wounds and build opportunities remain explicit before locking the day', async ({ page }) => {
  const base = returningState(18, 972218);
  const state: GameState = {
    ...base,
    survivors: base.survivors.map((survivor, index) => index === 0 ? { ...survivor, condition: 'critical' as const } : survivor),
  };
  await renderState(page, state);
  await expect(page.getByText(/1 人伤得太重，今天动不了/)).toBeVisible();
  const commit = page.getByRole('button', { name: /安排好了/ });
  await expect(commit).toContainText(/还有 \d+ 处能收拾/);
  await commit.click();
  await expect(page.getByText(/街里还有 \d+ 处地方今天能继续收拾/)).toBeVisible();
  await expect(page.getByRole('button', { name: '← 再改一遍' })).toBeVisible();
});
