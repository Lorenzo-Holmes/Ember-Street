import { expect, test, type Page } from '@playwright/test';
import { SURVIVOR_ROSTER } from '../../src/game/progression';
import type { GameState } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { CAMPAIGN_FIXED_EVENTS } from '../../src/game/v060/campaignEvents';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';

const P0_SCENES = [
  ['gate-knocking', '围栏外有人敲门', 'night_door_visitor'],
  ['fever-resident', '一个居民开始高烧', 'night_medical'],
  ['horde-clinic', '伤员一下子多了起来', 'night_return_injured'],
  ['argument-rations', '有人因为配给争吵', 'night_conflict'],
  ['east-footsteps', '东街传来连续脚步声', 'night_external_threat'],
] as const;

function stagedNight(eventId: string, seed = 992001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 12,
    phase: 'night',
    survivors: SURVIVOR_ROSTER.map((survivor) => ({ ...survivor })),
    buildings: { searchStation: 2, workshop: 2, clinic: 2, watchPost: 2, shelter: 2, radio: 2 },
    inventory: { ration: 18, medicine: 8, power: 76, materials: 14, parts: 8 },
    storyFlags: [...base.storyFlags, ...CAMPAIGN_FIXED_EVENTS.map((event) => `fixed_event_seen:${event.id}`)],
    socialState: { ...base.socialState!, principles: ['everyone-shares'] },
    nightState: {
      ...base.nightState,
      eventIndex: 0,
      eventTotal: 1,
      scheduledEventIds: [eventId],
      emergencyEventIds: [],
      currentEventId: eventId,
      hordeActive: eventId.startsWith('horde-'),
      hordeStage: eventId.startsWith('horde-') ? 'impact' : null,
    },
  };
}

async function installState(page: Page, state: GameState, width = 390, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

test('the five P0 night categories render five distinct approved scenes through visualKey', async ({ page }) => {
  const rendered = new Set<string>();
  for (const [eventId, title, visualKey] of P0_SCENES) {
    await installState(page, stagedNight(eventId));
    await expect(page.locator('.v1n-event-copy h1')).toHaveText(title);
    const art = page.locator('.v1n-art');
    await expect(art).toHaveAttribute('data-night-visual-key', visualKey);
    await expect(art).toHaveAttribute('data-art-state', 'ready');
    await expect(page.locator('.v1n-choices button')).toHaveCount(3);
    const image = page.locator('.v1n-art__image');
    const signature = await image.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundImage}|${style.backgroundPosition}`;
    });
    expect(signature).toContain('canonical');
    rendered.add(signature);
    expect(await page.locator('body').innerText()).not.toMatch(/\bA\d{2}\b/);
  }
  expect(rendered.size).toBe(P0_SCENES.length);
});

test('refresh keeps the current event and illustration stable without resolving or redrawing it', async ({ page }) => {
  await installState(page, stagedNight('gate-knocking', 992002));
  const art = page.locator('.v1n-art');
  await expect(art).toHaveAttribute('data-art-state', 'ready');
  const beforeKey = await art.getAttribute('data-night-visual-key');
  const beforeStyle = await page.locator('.v1n-art__image').getAttribute('style');
  const beforeSave = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);

  await page.reload();
  await continueSavedSessionFromTitle(page);
  await expect(page.locator('.v1n-art')).toHaveAttribute('data-art-state', 'ready');
  expect(await page.locator('.v1n-art').getAttribute('data-night-visual-key')).toBe(beforeKey);
  expect(await page.locator('.v1n-art__image').getAttribute('style')).toBe(beforeStyle);
  const afterSave = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(afterSave.nightState).toEqual(beforeSave.nightState);
  expect(afterSave.rngState).toBe(beforeSave.rngState);
  expect(afterSave.campaignStats).toEqual(beforeSave.campaignStats);
});

test('a missing sprite sheet shows the deliberate dark fallback instead of a broken or wrong scene', async ({ page }) => {
  await page.route('**/assets/canonical/events-a.webp', (route) => route.abort());
  await installState(page, stagedNight('gate-knocking', 992003));
  const art = page.locator('.v1n-art');
  await expect(art).toHaveAttribute('data-art-state', 'error');
  await expect(page.locator('.v1n-art__fallback')).toBeVisible();
  await expect(page.locator('.v1n-art__fallback')).toContainText('门外有人');
  await expect(page.locator('.v1n-choices button')).toHaveCount(3);
});

for (const [width, height] of [[320, 568], [360, 800], [390, 844], [430, 932]] as const) {
  test(`night illustration and long choices remain usable at ${width}x${height}`, async ({ page }) => {
    await installState(page, stagedNight('argument-rations', 992100 + width), width, height);
    await expect(page.locator('.v1n-art')).toHaveAttribute('data-art-state', 'ready');
    const geometry = await page.evaluate(() => {
      const art = document.querySelector('.v1n-art')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.v1n-choices button')].map((button) => button.getBoundingClientRect());
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        artLeft: art.left,
        artRight: art.right,
        artRatio: art.width / art.height,
        buttonHeights: buttons.map((button) => button.height),
      };
    });
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.artLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.artRight).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.artRatio).toBeGreaterThan(1.55);
    expect(geometry.artRatio).toBeLessThan(1.65);
    expect(geometry.buttonHeights.every((value) => value >= 48)).toBe(true);
    await page.locator('.v1n-choices button').last().scrollIntoViewIfNeeded();
    await expect(page.locator('.v1n-choices button').last()).toBeVisible();
  });
}
