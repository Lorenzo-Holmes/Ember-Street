import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { advanceCampaignDay, createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { assignDayJob, lockDayAssignments } from '../../src/game/v060/dayManagement';
import { chooseNightOption, scheduleNight } from '../../src/game/v060/nightScheduler';
import { normalizeSocialState } from '../../src/game/v060/socialPressure';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from './session-entry';

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

function milestoneDayState(day: 7 | 14 | 21, seed: number): GameState {
  const base = quietState(seed);
  const level = day >= 21 ? 3 : day >= 14 ? 2 : 1;
  const residents = day >= 21 ? 8 : day >= 14 ? 5 : 2;
  const priorPrinciples = day >= 21
    ? ['everyone-shares', 'community-shares-risk'] as const
    : day >= 14
      ? ['everyone-shares'] as const
      : [] as const;
  return {
    ...base,
    day,
    phase: 'street',
    hope: day >= 21 ? 48 : day >= 14 ? 42 : 36,
    defense: day >= 21 ? 68 : day >= 14 ? 58 : 50,
    inventory: {
      ration: day >= 21 ? 25 : day >= 14 ? 18 : 12,
      medicine: day >= 21 ? 7 : day >= 14 ? 5 : 3,
      power: day >= 21 ? 62 : day >= 14 ? 52 : 46,
      materials: day >= 21 ? 18 : day >= 14 ? 12 : 8,
      parts: day >= 21 ? 10 : day >= 14 ? 7 : 4,
    },
    buildings: {
      searchStation: level,
      workshop: level,
      clinic: Math.max(1, level - 1),
      watchPost: level,
      shelter: level,
      radio: day >= 14 ? level : 1,
    },
    civilianResidents: residents,
    communityState: {
      pendingResidents: 0,
      activeResidents: residents,
      supportMode: day >= 14 ? 'logistics' : null,
      lastSupportDay: day,
    },
    socialState: {
      ...normalizeSocialState(base.socialState),
      principles: [...priorPrinciples],
    },
    storyFlags: [
      ...base.storyFlags,
      ...priorPrinciples.map((principle) => `principle:${principle}`),
      ...(day >= 14 ? ['community_rotation_unlocked', 'principle_day:7'] : []),
      ...(day >= 21 ? ['evacuation_route_known', 'working_vehicle_parts', 'principle_day:14'] : []),
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

function finalLastLineState(seed = 960005): GameState {
  let state = scheduleNight(finalReady(seed));
  for (const choiceId of [
    'final-gate-reinforce',
    'final-grid-parts',
    'final-clinic-supplies',
    'final-community-rations',
    'final-route-barricade',
  ]) {
    state = chooseNightOption(state, choiceId);
  }
  return state;
}

function endingState(seed = 960004): GameState {
  let state = finalLastLineState(seed);
  state = chooseNightOption(state, 'final-last-stockpile');
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
  await continueSavedSessionFromTitle(page);
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

test('DAY1 V1 shell remains usable at all target viewports', async ({ page }) => {
  for (const [name, viewport] of VIEWPORTS) {
    await renderState(page, quietState(961000 + viewport.width), viewport);
    await expect(page.locator('.v1-home-page')).toBeVisible();
    await expect(page.getByText('余烬长街', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /安排今天/ })).toBeVisible();
    await capture(page, `v1-day1-main-${name}`);
  }
});

test('mobile DAY1 keeps the primary action visible before optional management detail', async ({ page }) => {
  const viewport = { width: 390, height: 844 };
  await renderState(page, quietState(961390), viewport);
  const primary = page.getByRole('button', { name: /安排今天/ });
  await expect(primary).toBeVisible();
  await expect(page.getByRole('button', { name: /查看六座设施/ })).toBeVisible();
  await expect(page.locator('.v1-building-list')).toHaveCount(0);
  const box = await primary.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y).toBeLessThan(viewport.height);
  await capture(page, 'v1-day1-action-distance-390x844');
});

test('milestone DAY7 DAY14 DAY21 legacy attention screens stay readable while principles are not migrated', async ({ page }) => {
  const expectedQuestions = new Map<number, string>([
    [7, '下一口先给谁？'],
    [14, '下一次出事，谁站前面？'],
    [21, '这条街还要守多久？'],
  ]);
  for (const [day, seed] of [[7, 963007], [14, 963014], [21, 963021]] as const) {
    await renderState(page, milestoneDayState(day, seed));
    await expect(page.getByText(`DAY ${day}`, { exact: true })).toBeVisible();
    await expect(page.getByText(expectedQuestions.get(day)!, { exact: true })).toBeVisible();
    await capture(page, `narrative-audit-day${day}-1440x900`);
  }
});

test('major DAY1 -> DAY30 visual states render without horizontal clipping', async ({ page }) => {
  const day = quietState(962001);
  await renderState(page, day);
  await expect(page.locator('.v1-home-page')).toBeVisible();
  await capture(page, 'v1-home-1440x900');

  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  await expect(page.locator('.v1s-list')).toBeVisible();
  await page.locator('.v1s-list').screenshot({ path: `${SCREENSHOT_DIR}/v1-survivors-1440x900.png` });
  await page.getByRole('button', { name: '← 据点', exact: true }).click();
  await page.getByRole('button', { name: /查看六座设施/ }).click();
  await expect(page.locator('.v1-building-list')).toBeVisible();
  await page.locator('.v1-building-list').screenshot({ path: `${SCREENSHOT_DIR}/v1-building-panel-1440x900.png` });

  let expedition = quietState(962002);
  expedition = assignDayJob(expedition, 'lin-xia', 'expedition');
  expedition = lockDayAssignments(expedition);
  expedition = { ...expedition, phase: 'expedition' };
  await renderState(page, expedition);
  await expect(page.getByText('今天去哪？', { exact: true })).toBeVisible();
  await capture(page, 'v1-exploration-1440x900');

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
  await expect(page.locator('.v1n-art')).toBeVisible();
  await expect(page.locator('.v1n-choices button')).toHaveCount(3);
  await capture(page, 'v1-night-event-1440x900');

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
  await expect(page.getByText('街区近况', { exact: true })).toBeVisible();
  await capture(page, 'social-community-legacy-1440x900');

  const horde = scheduleNight(finalReady());
  expect(horde.nightState.eventTotal).toBe(6);
  await renderState(page, horde);
  await expect(page.getByText('尸潮正在靠近', { exact: false })).toBeVisible();
  await expect(page.locator('.v1n-art')).toBeVisible();
  await capture(page, 'v1-day29-final-horde-1440x900');

  const lastLine = finalLastLineState();
  await renderState(page, lastLine);
  await expect(page.getByRole('heading', { name: '第六阶段 · 最后一条线', exact: true })).toBeVisible();
  await expect(page.getByText('所有还能站的人一起守住', { exact: true })).toBeVisible();
  await expect(page.getByText('把最后的建材和零件全部用掉', { exact: true })).toBeVisible();
  await expect(page.getByText('退进内街，先把人保住', { exact: true })).toBeVisible();
  await expect(page.getByText('材料 -3 · 零件 -1', { exact: true })).toBeVisible();
  await capture(page, 'v1-day29-last-line-1440x900');

  const ending = endingState();
  expect(ending.day).toBe(30);
  expect(ending.phase).toBe('ending');
  await renderState(page, ending);
  await expect(page.getByText('DAY 30', { exact: true })).toBeVisible();
  await capture(page, 'ending-1440x900');
});
