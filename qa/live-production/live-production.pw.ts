import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import type { GameState, StreetPrincipleId } from '../../src/game/types';
import { continueSavedSessionFromTitle } from '../ui-overhaul/session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

async function resetProductionSave(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function installState(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

async function settleOpeningEvents(page: Page) {
  const home = page.locator('.v1-home-page');
  for (let index = 0; index < 12 && !(await home.isVisible().catch(() => false)); index += 1) {
    const action = page.locator('.notebook-page--story-event .v1-phase-primary');
    await expect(action).toBeVisible();
    await action.click();
  }
  await expect(home).toBeVisible();
}

async function finishNight(page: Page) {
  for (let index = 0; index < 24; index += 1) {
    if (await page.locator('.notebook-page--night-summary-v1').isVisible().catch(() => false)) return;

    const turnOffLights = page.getByRole('button', { name: '关掉外面的灯', exact: true });
    if (await turnOffLights.isVisible().catch(() => false)) {
      await turnOffLights.click();
      continue;
    }

    const roll = page.getByRole('button', { name: '试一次', exact: true });
    if (await roll.isVisible().catch(() => false)) {
      await roll.click();
      continue;
    }

    const accept = page.getByRole('button', { name: '把结果记下', exact: true });
    if (await accept.isVisible().catch(() => false)) {
      await accept.click();
      continue;
    }

    const choices = page.locator('.v1n-choices button:enabled');
    const count = await choices.count();
    expect(count, 'Every live night event must leave at least one affordable choice.').toBeGreaterThan(0);
    await choices.last().click();
  }
  throw new Error('Live night did not reach the summary within the action budget.');
}

function quietFlags(state: GameState): string[] {
  return [
    ...state.storyFlags,
    ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
  ];
}

function settledPrinciples(day: 7 | 14 | 21): StreetPrincipleId[] {
  if (day === 21) return ['everyone-shares', 'community-shares-risk'];
  if (day === 14) return ['everyone-shares'];
  return [];
}

function milestoneState(day: 7 | 14 | 21, seed: number): GameState {
  const base = createV060InitialState(seed);
  const principles = settledPrinciples(day);
  return {
    ...base,
    day,
    phase: 'street',
    civilianResidents: 0,
    socialState: {
      pressure: 0,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 0,
      principles,
      lastRequestDay: day,
    },
    storyFlags: [
      ...quietFlags(base),
      ...principles.map((principle) => `principle:${principle}`),
    ],
  };
}

test('live production fresh save reaches DAY2 and survives cover/resume', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetProductionSave(page);
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();

  await settleOpeningEvents(page);
  await page.locator('.v1-day-action').click();
  await expect(page.getByText('谁还能出门', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '这张名单就这么定', exact: true }).click();

  await expect(page.getByText('太阳快下去了。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合上本子，等天黑', exact: true }).click();
  await finishNight(page);
  await page.getByRole('button', { name: '等天亮再清点', exact: true }).click();
  await page.getByRole('button', { name: '翻到第 2 天', exact: true }).click();

  const saved = await page.evaluate((saveKey) => JSON.parse(localStorage.getItem(saveKey) ?? 'null'), SAVE_KEY);
  expect(saved?.day).toBe(2);

  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '返回封面', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续游戏', exact: true })).toBeVisible();
  await expect(page.getByText(/第 2 天/)).toBeVisible();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await expect(page.locator('.v1-title-screen')).toHaveCount(0);
});

test('live production resource-collapse night never loses every choice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = createV060InitialState(991818);
  const state: GameState = {
    ...base,
    day: 18,
    phase: 'dusk',
    hope: 8,
    defense: 8,
    inventory: { ration: 0, medicine: 0, power: 0, materials: 0, parts: 0 },
    civilianResidents: 0,
    socialState: {
      pressure: 2,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 1,
      principles: ['everyone-shares', 'community-shares-risk'],
      lastRequestDay: 18,
    },
    dayState: { ...base.dayState, assignmentsLocked: true },
    survivors: base.survivors.map((survivor, index) => index === 0
      ? { ...survivor, condition: 'healthy' as const, energy: 35 }
      : { ...survivor, condition: 'dead' as const }),
    storyFlags: [
      ...quietFlags(base),
      'principle:everyone-shares',
      'principle:community-shares-risk',
    ],
  };

  await installState(page, state);
  await expect(page.getByText('太阳快下去了。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '合上本子，等天黑', exact: true }).click();
  await finishNight(page);
  await expect(page.locator('.notebook-page--night-summary-v1')).toBeVisible();
});

test('live DAY7 DAY14 DAY21 mandatory principle decisions remain resolvable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const stages = [
    [7, 997007, '下一口先给谁？'],
    [14, 997014, '下一次出事，谁站前面？'],
    [21, 997021, '这条街还要守多久？'],
  ] as const;

  for (const [day, seed, question] of stages) {
    await installState(page, milestoneState(day, seed));
    await expect(page.getByText(question, { exact: true })).toBeVisible();
    const choices = page.locator('.v6-principle-choice');
    await expect(choices).toHaveCount(3);
    await choices.first().click();
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
    await expect(page.locator('main button:enabled').first()).toBeVisible();
  }
});

test('live failed missing search can continue today and remains handled after reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = createV060InitialState(996006);
  const missingId = base.survivors[0].id;
  const state: GameState = {
    ...base,
    day: 6,
    phase: 'street',
    socialState: {
      pressure: 0,
      activePromise: null,
      fulfilledPromises: 0,
      brokenPromises: 0,
      principles: [],
      lastRequestDay: 6,
    },
    survivors: base.survivors.map((survivor) => survivor.id === missingId
      ? { ...survivor, condition: 'missing' as const }
      : survivor),
    storyFlags: [
      ...quietFlags(base),
      `missing_search:${missingId}:6`,
      `missing_search_failed:${missingId}:6`,
    ],
  };

  await installState(page, state);
  await expect(page.locator('.v6-missing-action:enabled')).toHaveCount(0);
  await page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true }).click();
  await expect(page.locator('.v1-home-page')).toBeVisible();

  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('button', { name: '返回封面', exact: true }).click();
  await page.getByRole('button', { name: '继续游戏', exact: true }).click();
  await expect(page.getByText('天亮了，床还是空的', { exact: true })).toHaveCount(0);
  await expect(page.locator('.v1-home-page')).toBeVisible();
});

test('live core shell has no horizontal clipping on target phone and desktop widths', async ({ page }) => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const base = createV060InitialState(995000 + viewport.width);
    const state: GameState = {
      ...base,
      day: 6,
      phase: 'street',
      socialState: {
        pressure: 0,
        activePromise: null,
        fulfilledPromises: 0,
        brokenPromises: 0,
        principles: [],
        lastRequestDay: 6,
      },
      storyFlags: quietFlags(base),
    };
    await page.setViewportSize(viewport);
    await installState(page, state);
    await expect(page.locator('.v1-home-page')).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(fits).toBe(true);
  }
});
