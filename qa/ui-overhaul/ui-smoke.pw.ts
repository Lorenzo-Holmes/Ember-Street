import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { advanceCampaignDay, createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../../src/game/v060/dayManagement';
import { chooseNightOption, scheduleNight } from '../../src/game/v060/nightScheduler';
import { normalizeSocialState } from '../../src/game/v060/socialPressure';
import type { GameState } from '../../src/game/types';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const SCREENSHOT_DIR = 'qa/ui-overhaul/screenshots';

mkdirSync(SCREENSHOT_DIR, { recursive: true });

const VIEWPORTS = [
  ['1920x1080', { width: 1920, height: 1080 }],
  ['1440x900', { width: 1440, height: 900 }],
  ['1366x768', { width: 1366, height: 768 }],
  ['1280x720', { width: 1280, height: 720 }],
  ['390x844', { width: 390, height: 844 }],
] as const;

function quietState(seed = 960001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
    ],
  };
}

function communityState(seed = 960002): GameState {
  const base = quietState(seed);
  return {
    ...base,
    day: 12,
    civilianResidents: 6,
    communityState: {
      pendingResidents: 0,
      activeResidents: 6,
      supportMode: 'logistics',
      lastSupportDay: 12,
    },
    storyFlags: [...base.storyFlags, 'community_rotation_unlocked'],
  };
}

function finalReady(seed = 960003): GameState {
  const base = quietState(seed);
  return {
    ...base,
    day: 29,
    phase: 'night',
    hope: 60,
    defense: 70,
    inventory: { ration: 100, medicine: 20, power: 90, materials: 100, parts: 100 },
    buildings: { searchStation: 3, workshop: 3, clinic: 3, watchPost: 3, shelter: 3, radio: 3 },
    civilianResidents: 9,
    communityState: { pendingResidents: 0, activeResidents: 9, supportMode: 'defense', lastSupportDay: 29 },
    socialState: {
      ...normalizeSocialState(base.socialState),
      pressure: 1,
      fulfilledPromises: 3,
      brokenPromises: 1,
      principles: ['everyone-shares', 'community-shares-risk', 'hold-the-street'],
    },
    storyFlags: [
      ...base.storyFlags,
      'community_rotation_unlocked',
      'final_horde_supplies',
      'medical_cache',
      'subway_maintenance_map',
      'evacuation_route_known',
      'working_vehicle_parts',
      'principle:hold-the-street',
    ],
  };
}

function endingState(seed = 960004): GameState {
  let state = scheduleNight(finalReady(seed));
  for (const choiceId of [
    'final-gate-reinforce',
    'final-grid-parts',
    'final-clinic-supplies',
    'final-community-rations',
    'final-route-barricade',
    'final-last-stockpile',
  ]) {
    state = chooseNightOption(state, choiceId);
  }
  return advanceCampaignDay(state);
}

async function renderState(
  page: Page,
  state: GameState,
  viewport: { width: number; height: number } = { width: 1440, height: 900 },
) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(80);
}

async function assertViewportFit(page: Page) {
  const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(documentFits).toBe(true);

  const offscreenButtons = await page.locator('button:visible').evaluateAll((elements) => elements.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left < -1 || rect.right > window.innerWidth + 1;
  }).length);
  expect(offscreenButtons).toBe(0);
}

async function capture(page: Page, name: string) {
  await assertViewportFit(page);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

test('DAY1 shell remains usable at all target viewports', async ({ page }) => {
  for (const [name, viewport] of VIEWPORTS) {
    await renderState(page, quietState(961000 + viewport.width), viewport);
    await expect(page.getByText('EMBER STREET', { exact: true })).toBeVisible();
    await expect(page.getByText('仓房', { exact: true })).toBeVisible();
    await capture(page, `day1-main-${name}`);
  }
});

test('major DAY1 -> DAY30 visual states render without horizontal clipping', async ({ page }) => {
  const day = quietState(962001);
  await renderState(page, day);
  const assignment = page.locator('.v6-section').filter({ hasText: '今日派遣' }).first();
  await expect(assignment).toBeVisible();
  await assertViewportFit(page);
  await assignment.screenshot({ path: `${SCREENSHOT_DIR}/survivor-assignment-1440x900.png` });

  const building = page.locator('.v6-section').filter({ hasText: '街区建设' }).first();
  await expect(building).toBeVisible();
  await building.screenshot({ path: `${SCREENSHOT_DIR}/building-panel-1440x900.png` });

  let expedition = quietState(962002);
  expedition = assignDayJob(expedition, 'lin-xia', 'expedition');
  expedition = lockDayAssignments(expedition);
  expedition = { ...expedition, phase: 'expedition' };
  await renderState(page, expedition);
  await expect(page.getByText('手里的路线', { exact: true })).toBeVisible();
  await capture(page, 'exploration-1440x900');

  const duskBase = quietState(962003);
  const dusk: GameState = {
    ...duskBase,
    phase: 'dusk',
    dayState: { ...duskBase.dayState, assignmentsLocked: true },
  };
  await renderState(page, dusk);
  await expect(page.getByText('天黑了', { exact: true })).toBeVisible();
  await expect(page.getByText('还有时间，重新安排', { exact: false })).toBeVisible();
  await capture(page, 'dusk-1440x900');

  const normalNightBase = { ...quietState(962004), day: 5, phase: 'night' as const };
  const normalNight = scheduleNight(normalNightBase);
  await renderState(page, normalNight);
  await expect(page.locator('.v060-event')).toBeVisible();
  await capture(page, 'night-event-1440x900');

  const nightResult: GameState = {
    ...normalNight,
    phase: 'night-summary',
    nightState: {
      ...normalNight.nightState,
      resolutions: [...normalNight.nightState.scheduledEventIds],
    },
  };
  await renderState(page, nightResult);
  await expect(page.getByText('天亮了。', { exact: true })).toBeVisible();
  await capture(page, 'night-result-1440x900');

  await renderState(page, communityState());
  await expect(page.getByText('街里的人手', { exact: true })).toBeVisible();
  await expect(page.getByText('街区近况', { exact: true })).toBeVisible();
  await capture(page, 'social-community-1440x900');

  const horde = scheduleNight(finalReady());
  expect(horde.nightState.eventTotal).toBe(6);
  await renderState(page, horde);
  await expect(page.getByText('尸潮正在靠近', { exact: false })).toBeVisible();
  await capture(page, 'day29-final-horde-1440x900');

  const ending = endingState();
  expect(ending.day).toBe(30);
  expect(ending.phase).toBe('ending');
  await renderState(page, ending);
  await expect(page.getByText('DAY 30', { exact: true })).toBeVisible();
  await capture(page, 'ending-1440x900');
});