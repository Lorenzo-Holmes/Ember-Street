import { expect, test, type Locator, type Page } from '@playwright/test';
import type { GameState, TutorialState } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { scheduleNight } from '../../src/game/v060/nightScheduler';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

function quietState(seed = 971001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    storyFlags: [
      ...base.storyFlags,
      ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`),
    ],
  };
}

function tutorialState(base: GameState, stage: TutorialState['tutorialStage']): GameState {
  const initialPopulation = base.civilianResidents
    + base.survivors.filter((survivor) => !['dead', 'missing'].includes(survivor.condition ?? '')).length;
  return {
    ...base,
    tutorial: {
      version: 1,
      tutorialStage: stage,
      tutorialCompleted: false,
      tutorialSkipped: false,
      freePlayNoticeSeen: false,
      hintsSeen: [],
      initialPopulation,
    },
  };
}

function dawnState(seed = 971020): GameState {
  const base = quietState(seed);
  return {
    ...base,
    phase: 'dawn',
    journal: [
      { id: 'qa-work', day: base.day, kind: 'work', title: '白天的人手', body: '有人留在屋里做完了今天的事。' },
      { id: 'qa-expedition', day: base.day, kind: 'expedition', title: '街外的路', body: '出去的人按原路回来了。' },
      { id: 'qa-night', day: base.day, kind: 'night', title: '夜里的选择', body: '门外的动静暂时过去了。' },
    ],
  };
}

async function renderState(page: Page, state: GameState, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

function lightness(cssColor: string): number {
  const channels = cssColor.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (channels.length !== 3) throw new Error(`Unsupported computed color: ${cssColor}`);
  return (channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722) / 255;
}

async function computedColor(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

async function assertDocumentFits(page: Page) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

test('shell-owned colors keep scene, story and book text in the correct contrast family', async ({ page }) => {
  await renderState(page, quietState());

  const normalHotspot = page.locator('.v2-building-hotspot:not(.is-selected)').first();
  const unavailableHotspot = page.locator('.v2-building-hotspot.is-unavailable:not(.is-selected)').first();
  const detailCopy = page.locator('.v2-building-detail__copy > p').first();
  expect(lightness(await computedColor(normalHotspot.locator('span')))).toBeGreaterThan(.62);
  expect(lightness(await computedColor(unavailableHotspot.locator('span')))).toBeGreaterThan(.62);
  expect(lightness(await computedColor(detailCopy))).toBeGreaterThan(.56);

  const selectedBorder = await page.locator('.v2-building-hotspot.is-selected').evaluate((element) => getComputedStyle(element).borderColor);
  const unavailableBorder = await unavailableHotspot.evaluate((element) => getComputedStyle(element).borderColor);
  expect(selectedBorder).not.toBe(unavailableBorder);

  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '日志', exact: true }).click();
  const bookInk = await computedColor(page.locator('.v1r-head h1'));
  expect(lightness(bookInk)).toBeLessThan(.38);

  const night = scheduleNight({ ...quietState(971002), day: 5, phase: 'night' });
  await renderState(page, night);
  const storyBody = await computedColor(page.locator('.v1n-event-copy p'));
  const storyChoice = await computedColor(page.locator('.v1n-choices button span').first());
  expect(lightness(storyBody)).toBeGreaterThan(.56);
  expect(lightness(storyChoice)).toBeGreaterThan(.50);
  expect(storyBody).not.toBe(bookInk);
});

test('night dice before and after rolling never inherit paper ink', async ({ page }) => {
  const base = quietState(971010);
  const before: GameState = {
    ...base,
    phase: 'night',
    pendingCheck: {
      id: 'qa-night-check',
      source: 'night',
      eventId: 'gate-knocking',
      choiceId: 'qa-guard-check',
      label: '守夜的人确认',
      mode: 'disadvantage',
      modifiers: [],
    },
  };
  await renderState(page, before);

  for (const selector of ['.v1n-night-head strong', '.v1n-dice > span', '.v1n-dice h1', '.v1n-dice p', '.v1n-primary']) {
    expect(lightness(await computedColor(page.locator(selector).first())), selector).toBeGreaterThan(.55);
  }

  const after: GameState = {
    ...before,
    pendingCheck: {
      ...before.pendingCheck!,
      dice: [3, 6, 6],
      keptDice: [3, 6],
      total: 9,
      outcome: 'partial',
    },
  };
  await renderState(page, after);
  expect(lightness(await computedColor(page.locator('.v1n-dice__total span')))).toBeGreaterThan(.50);
  expect(lightness(await computedColor(page.locator('.v1n-dice__total strong')))).toBeGreaterThan(.68);
  expect(lightness(await computedColor(page.locator('.v1n-dice__total em')))).toBeGreaterThan(.42);
  expect(lightness(await computedColor(page.locator('.v1n-primary')))).toBeGreaterThan(.68);
});

test('building hierarchy is compact and exposes the daily action before full detail', async ({ page }) => {
  await renderState(page, quietState(971030));
  const nav = page.locator('.v2-building-nav');
  await expect(nav.locator('.v1-building')).toHaveCount(6);
  const summaryBox = await nav.locator('.v1-building__summary').first().boundingBox();
  expect(summaryBox?.height ?? 999).toBeLessThanOrEqual(80);
  expect(summaryBox?.width ?? 999).toBeLessThanOrEqual(92);
  await expect(nav.locator('.v1-building__summary small').first()).toContainText(/Lv\./);

  const geometry = await page.evaluate(() => {
    const action = document.querySelector<HTMLElement>('.v2-day-roster-action')!.getBoundingClientRect();
    const detail = document.querySelector<HTMLElement>('.v2-building-detail')!.getBoundingClientRect();
    const localNav = document.querySelector<HTMLElement>('.v2-building-nav')!;
    return {
      actionTop: action.top,
      detailTop: detail.top,
      localScrollWidth: localNav.scrollWidth,
      localClientWidth: localNav.clientWidth,
    };
  });
  expect(geometry.actionTop).toBeLessThan(geometry.detailTop);
  expect(geometry.localScrollWidth).toBeGreaterThan(geometry.localClientWidth);
  await assertDocumentFits(page);

  const resourceHeight = await page.locator('.v2-resource-drawer__toggle').evaluate((element) => element.getBoundingClientRect().height);
  expect(resourceHeight).toBeGreaterThanOrEqual(44);
});

test('survivor detail opens at the top and returns to the intentional list position', async ({ page }) => {
  await renderState(page, quietState(971040));
  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  const openButton = page.locator('.v1s-list article > button:enabled').last();
  await openButton.scrollIntoViewIfNeeded();
  const listScroll = await page.evaluate(() => window.scrollY);
  expect(listScroll).toBeGreaterThan(0);
  await openButton.click();

  const detailBack = page.locator('.notebook-page--survivor-detail .v1s-head > button');
  await expect(detailBack).toBeVisible();
  const detailPosition = await detailBack.evaluate((element) => ({ top: element.getBoundingClientRect().top, scrollY: window.scrollY }));
  expect(detailPosition.top).toBeGreaterThanOrEqual(0);
  expect(detailPosition.scrollY).toBeLessThanOrEqual(1);

  await detailBack.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const returnedScroll = await page.evaluate(() => window.scrollY);
  expect(Math.abs(returnedScroll - listScroll)).toBeLessThan(40);
});

test('tutorial note and menu never occupy the same rectangle', async ({ page }) => {
  const state = tutorialState(quietState(971050), 'RESOURCE_OVERVIEW');
  await renderState(page, state);
  const note = page.locator('.v1-tutorial-note');
  const menu = page.locator('.v1-player-menu');
  await expect(note).toBeVisible();
  await expect(menu).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const noteRect = document.querySelector<HTMLElement>('.v1-tutorial-note')!.getBoundingClientRect();
    const menuRect = document.querySelector<HTMLElement>('.v1-player-menu')!.getBoundingClientRect();
    const overlaps = noteRect.left < menuRect.right && noteRect.right > menuRect.left
      && noteRect.top < menuRect.bottom && noteRect.bottom > menuRect.top;
    return overlaps;
  })).toBe(false);
});

test('FIRST_NIGHT tutorial stays compact while the crisis choices remain readable', async ({ page }) => {
  const prepared = tutorialState({ ...quietState(971060), phase: 'night' }, 'FIRST_NIGHT');
  const state = scheduleNight(prepared);
  await renderState(page, state);
  const note = page.locator('.v1-tutorial-note[data-stage="FIRST_NIGHT"][data-context="night"]');
  await expect(note).toBeVisible();
  const noteHeight = await note.evaluate((element) => element.getBoundingClientRect().height);
  expect(noteHeight).toBeLessThanOrEqual(135);
  expect(lightness(await computedColor(page.locator('.v1n-choices button span').first()))).toBeGreaterThan(.50);
});

test('dusk, night summary and dawn fit all required phone widths', async ({ page }) => {
  const duskBase = quietState(971070);
  const dusk: GameState = {
    ...duskBase,
    phase: 'dusk',
    dayState: { ...duskBase.dayState, assignmentsLocked: true },
  };
  const nightSummary: GameState = { ...quietState(971071), phase: 'night-summary' };
  const dawn = dawnState(971072);

  for (const viewport of PHONE_VIEWPORTS) {
    for (const state of [dusk, nightSummary, dawn]) {
      await renderState(page, state, viewport);
      await assertDocumentFits(page);
    }
  }
});

test('dusk keeps the decision first while preserving full details behind disclosure', async ({ page }) => {
  const base = quietState(971075);
  const dusk: GameState = {
    ...base,
    phase: 'dusk',
    dayState: { ...base.dayState, assignmentsLocked: true },
  };
  await renderState(page, dusk);

  const leadRisks = page.locator('.v2-dusk-risk-summary li');
  expect(await leadRisks.count()).toBeLessThanOrEqual(3);
  await expect(leadRisks.first()).toBeVisible();
  const order = await page.evaluate(() => ({
    action: document.querySelector<HTMLElement>('[data-tutorial="end-day"]')!.getBoundingClientRect().top,
    quick: document.querySelector<HTMLElement>('.v2-dusk-quick')!.getBoundingClientRect().top,
    details: document.querySelector<HTMLElement>('.v2-dusk-details')!.getBoundingClientRect().top,
  }));
  expect(order.action).toBeLessThan(order.quick);
  expect(order.action).toBeLessThan(order.details);

  const details = page.locator('.v2-dusk-details');
  await expect(details).not.toHaveAttribute('open', '');
  await page.locator('.v2-dusk-details > summary').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.v1-phase-ledger')).toBeVisible();
  await expect(details.locator('.v1-phase-columns')).toBeVisible();
  await expect(details.locator('.v1-phase-checklist')).toBeVisible();
});

test('core mobile interaction targets are at least 44px high', async ({ page }) => {
  await renderState(page, quietState(971080));
  expect(await page.locator('.v2-resource-drawer__toggle').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

  await page.locator('nav[aria-label="主导航"]').getByRole('button', { name: '幸存者', exact: true }).click();
  const filterHeights = await page.locator('.v2-survivor-filters button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  expect(Math.min(...filterHeights)).toBeGreaterThanOrEqual(44);

  const survivor = page.locator('.v1s-list article > button:enabled').first();
  await survivor.click();
  await page.locator('[data-tutorial-job="expedition"]:not(:disabled)').click();
  const routeBackHeight = await page.locator('.v1e-head > button').evaluate((element) => element.getBoundingClientRect().height);
  expect(routeBackHeight).toBeGreaterThanOrEqual(44);
  const routeCardHeight = await page.locator('.notebook-page--route .v1e-location').first().evaluate((element) => element.getBoundingClientRect().height);
  expect(routeCardHeight).toBeLessThanOrEqual(240);
  await assertDocumentFits(page);

  await renderState(page, dawnState(971081));
  const dawnSkip = page.locator('.v2-dawn-skip');
  await expect(dawnSkip).toBeVisible();
  expect(await dawnSkip.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});
