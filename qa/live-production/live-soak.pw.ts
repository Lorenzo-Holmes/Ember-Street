import { expect, test, type Locator, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import type { GameState } from '../../src/game/types';
import { continueSavedSessionFromTitle } from '../ui-overhaul/session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

type NightChoiceOrder = 'first' | 'last';

async function installState(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function clickIfVisible(locator: Locator): Promise<boolean> {
  if (!await visible(locator)) return false;
  await locator.click();
  await locator.page().waitForTimeout(35);
  return true;
}

async function savedState(page: Page): Promise<GameState> {
  return page.evaluate((saveKey) => JSON.parse(localStorage.getItem(saveKey) ?? 'null'), SAVE_KEY);
}

async function describeStuckPage(page: Page): Promise<string> {
  const state = await savedState(page);
  const buttons = await page.locator('button:visible').allTextContents();
  const headings = await page.locator('h1:visible, h2:visible, h3:visible').allTextContents();
  const present = state?.survivors?.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length ?? 0;
  return JSON.stringify({
    day: state?.day,
    phase: state?.phase,
    present,
    civilians: state?.civilianResidents,
    totalPopulation: present + (state?.civilianResidents ?? 0),
    ration: state?.inventory?.ration,
    power: state?.inventory?.power,
    defense: state?.defense,
    buttons: buttons.slice(0, 12),
    headings: headings.slice(0, 8),
  });
}

async function runLiveSoak(page: Page, seed: number, nightChoiceOrder: NightChoiceOrder) {
  await page.setViewportSize({ width: 390, height: 844 });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));

  await installState(page, createV060InitialState(seed));
  let lastLoggedDay = 0;

  for (let action = 0; action < 900; action += 1) {
    const state = await savedState(page);
    if (state.day !== lastLoggedDay) {
      lastLoggedDay = state.day;
      const present = state.survivors.filter((survivor) => survivor.condition !== 'dead' && survivor.condition !== 'missing').length;
      const total = present + state.civilianResidents;
      console.log(`[live-soak seed=${seed}] DAY ${state.day} phase=${state.phase} present=${present} civilians=${state.civilianResidents} total=${total} ration=${state.inventory.ration} power=${state.inventory.power} defense=${Math.round(state.defense)} hope=${state.hope}`);
    }

    if (await visible(page.locator('.notebook-page--ending-v1'))) {
      expect(state.day).toBe(30);
      expect(state.phase).toBe('ending');
      expect(runtimeErrors).toEqual([]);
      return state;
    }

    if (await clickIfVisible(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;

    if (await visible(page.locator('.notebook-page--community-event'))) {
      const leave = page.getByRole('button', { name: /不再挽留/ });
      if (await clickIfVisible(leave)) continue;
      const fallback = page.locator('.notebook-page--community-event button:enabled').last();
      if (await clickIfVisible(fallback)) continue;
    }

    if (await clickIfVisible(page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true }))) continue;
    if (await clickIfVisible(page.locator('.v6-principle-choice').first())) continue;
    if (await clickIfVisible(page.locator('.v6-request-card button:enabled').last())) continue;

    if (await clickIfVisible(page.locator('.v1-home-page .v1-day-action'))) continue;

    if (await visible(page.locator('.notebook-page--survivors'))) {
      const done = page.locator('.v1s-done:enabled');
      if (await clickIfVisible(done)) continue;
    }

    if (await clickIfVisible(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: '试一次', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const choices = page.locator('.v1n-choices button:enabled');
      const count = await choices.count();
      expect(count, `Night event lost every enabled choice: ${await describeStuckPage(page)}`).toBeGreaterThan(0);
      await (nightChoiceOrder === 'first' ? choices.first() : choices.last()).click();
      await page.waitForTimeout(35);
      continue;
    }

    if (await clickIfVisible(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;

    const nextDay = page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ });
    if (await clickIfVisible(nextDay)) continue;

    throw new Error(`Live soak has no progression action: ${await describeStuckPage(page)}`);
  }

  throw new Error(`Live soak exceeded action budget: ${await describeStuckPage(page)}`);
}

for (const [seed, order] of [[998001, 'last'], [998002, 'first'], [998003, 'last']] as const) {
  test(`live conservative player seed ${seed} reaches the ending`, async ({ page }) => {
    test.setTimeout(180_000);
    await runLiveSoak(page, seed, order);
  });
}
