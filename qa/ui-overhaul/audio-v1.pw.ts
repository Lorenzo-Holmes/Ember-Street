import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { continueSavedSessionFromTitle } from './session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const AUDIO_KEY = 'ember-street-audio-v1';

function gateNight(seed = 994001): GameState {
  const base = createV060InitialState(seed);
  return {
    ...base,
    day: 6,
    phase: 'night',
    nightState: {
      ...base.nightState,
      eventIndex: 0,
      eventTotal: 1,
      scheduledEventIds: ['gate-knocking'],
      emergencyEventIds: [],
      currentEventId: 'gate-knocking',
      hordeActive: false,
      hordeStage: null,
    },
  };
}

async function install(page: Page, state: GameState, audio?: object) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, audioKey, gameState, audioPreferences }) => {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
    if (audioPreferences) localStorage.setItem(audioKey, JSON.stringify(audioPreferences));
    else localStorage.removeItem(audioKey);
    sessionStorage.clear();
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, audioKey: AUDIO_KEY, gameState: state, audioPreferences: audio });
  await page.reload();
}

test('continuing into a night event requests night ambience and the semantic knock cue', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (request) => { if (request.url().endsWith('.mp3')) requested.push(request.url()); });
  await install(page, gateNight());
  await continueSavedSessionFromTitle(page);
  await expect(page.locator('.v1n-event-copy h1')).toHaveText('围栏外有人敲门');
  await expect.poll(() => requested.some((url) => url.endsWith('/assets/audio/music/bgm_night_ambient.mp3'))).toBe(true);
  await expect.poll(() => requested.some((url) => url.endsWith('/assets/audio/sfx/sfx_door_knock.mp3'))).toBe(true);
});

test('sound settings persist separately from the save and survive reload', async ({ page }) => {
  const state = gateNight(994002);
  await install(page, state);
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  await page.getByRole('button', { name: /声音总开关/ }).click();
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), AUDIO_KEY);
  expect(stored.enabled).toBe(false);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
  expect(saved).toEqual(state);

  await page.reload();
  await page.getByRole('button', { name: '声音设置', exact: true }).click();
  await expect(page.getByRole('button', { name: /声音总开关/ })).toContainText('静音');
});

test('missing audio files fail silently and do not block the three night choices', async ({ page }) => {
  await page.route('**/*.mp3', (route) => route.abort());
  await install(page, gateNight(994003));
  await continueSavedSessionFromTitle(page);
  await expect(page.locator('.v1n-choices button')).toHaveCount(3);
  await page.getByRole('button', { name: /保持安静/ }).click();
  await expect(page.locator('.v1n-event-copy')).toHaveCount(0);
});
