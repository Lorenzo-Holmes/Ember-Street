import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState, StreetPrincipleId } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
  await page.waitForTimeout(80);
}

async function yOf(locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  return box!.y;
}

test('routine DAY27 keeps the primary action ahead of settled community detail', async ({ page }) => {
  await renderState(page, returningState(27, 972027));
  const primary = page.locator('.v1-day-action');
  const community = page.locator('.v1-community');

  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(primary).toContainText('今天谁去哪里');
  await expect(community).toBeVisible();
  await expect(page.locator('.v6-social-panel')).toHaveCount(0);
  expect(await yOf(primary)).toBeLessThan(await yOf(community));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/returning-day27-routine-v1-390x844.png`, fullPage: true });
});

test('an unresolved promise does not block routine day management', async ({ page }) => {
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
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await expect(page.locator('.v1-day-action')).toContainText('今天谁去哪里');
  await expect(page.locator('.v6-social-panel')).toHaveCount(0);
});

test('a missing person takes over the morning before routine assignment', async ({ page }) => {
  const base = returningState(18, 972018);
  const state: GameState = {
    ...base,
    survivors: base.survivors.map((survivor, index) => index === 0 ? { ...survivor, condition: 'missing' as const } : survivor),
  };
  await renderState(page, state);
  await expect(page.getByText('有人没回来', { exact: true })).toBeVisible();
  await expect(page.getByText('天亮了，床还是空的', { exact: true })).toBeVisible();
  await expect(page.locator('.v1-day-action')).toHaveCount(0);
  await expect(page.locator('nav[aria-label="主导航"]')).toHaveCount(0);
});

test('an unselected street-resident rotation remains actionable on the V1 home', async ({ page }) => {
  const base = returningState(18, 972118);
  const state: GameState = {
    ...base,
    communityState: { pendingResidents: 0, activeResidents: 6, supportMode: null },
  };
  await renderState(page, state);
  const community = page.locator('.v1-community');
  const logistics = community.locator('.v1-community__choices button').filter({ hasText: '后勤' }).first();
  await expect(community).toBeVisible();
  await expect(logistics).toBeEnabled();
  await logistics.click();
  await expect(logistics).toHaveClass(/active/);
});

test('critical wounds and building work remain explicit before the day is locked', async ({ page }) => {
  const base = returningState(18, 972218);
  const state: GameState = {
    ...base,
    survivors: base.survivors.map((survivor, index) => index === 0 ? { ...survivor, condition: 'critical' as const } : survivor),
  };
  await renderState(page, state);
  const nav = page.locator('nav[aria-label="主导航"]');
  await expect(nav.getByRole('button', { name: '建筑', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: '幸存者', exact: true }).click();
  const critical = page.locator('.v1s-list article').filter({ hasText: '还没脱离危险' }).first();
  await expect(critical).toBeVisible();
  await critical.getByRole('button', { name: /翻开/ }).click();
  await expect(page.getByText('危重', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.v1s-jobs button:enabled')).toHaveCount(0);
});