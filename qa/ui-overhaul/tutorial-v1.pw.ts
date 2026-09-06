import { expect, test, type Page } from '@playwright/test';
import { createV060InitialState } from '../../src/game/v060/campaign';
import type { GameState } from '../../src/game/types';
import { choosePrinciple } from '../../src/game/v060/principles';
import { continueSavedSessionFromTitle } from './session-entry';

const KEY = 'ember-street-save-v3';
const save = (page: Page): Promise<GameState> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
const guide = (page: Page) => page.getByRole('complementary', { name: '新手引导', exact: true });

async function drainNotices(page: Page) {
  for (let i = 0; i < 12; i++) {
    const notice = page.locator('.notebook-page--story-event .v1-phase-primary');
    if (!(await notice.isVisible())) return;
    await notice.click();
  }
  throw new Error('Opening notices did not finish');
}

async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await drainNotices(page);
  await expect(guide(page)).toHaveAttribute('data-stage', 'INTRO');
}

async function reachAssignments(page: Page) {
  await guide(page).getByRole('button', { name: '先清点东西', exact: true }).click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'RESOURCE_OVERVIEW');
  await expect(page.locator('[data-tutorial="resources"]')).toBeVisible();
  await guide(page).getByRole('button', { name: '去安排人手', exact: true }).click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'ASSIGN_SURVIVOR');
}

async function workAndRoute(page: Page) {
  await page.locator('[data-tutorial-person="ahe"]').click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'ASSIGN_SURVIVOR');
  await page.locator('[data-tutorial-job="cook"]').click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'SEND_EXPEDITION');
  expect((await save(page)).dayAssignments.ahe).toBe('cook');
  await page.locator('[data-tutorial-person="lin-xia"]').click();
  await page.locator('[data-tutorial-job="expedition"]').click();
  await expect(page.locator('[data-tutorial="suggested-route"]')).toContainText('能翻到');
  await page.locator('[data-tutorial="suggested-route"] .v1e-art').evaluate(async (element) => {
    const background = getComputedStyle(element).backgroundImage;
    const match = background.match(/url\(["']?([^"')]+)["']?\)/);
    if (!match) throw new Error('Suggested route lost its canonical background image');
    const image = new Image();
    image.src = match[1];
    await image.decode();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.screenshot({ path: test.info().outputPath('route.png'), fullPage: true });
  await page.locator('[data-tutorial="suggested-route"]').click();
  await guide(page).getByRole('button', { name: '找到记路按钮 ↓', exact: true }).click();
  await page.locator('[data-tutorial="confirm-route"]').click();
  await expect(page.locator('[data-tutorial="dispatch"]')).toBeEnabled();
}

async function departAndEndDay(page: Page) {
  await page.locator('[data-tutorial="dispatch"]').click();
  await expect(page.locator('.notebook-page--expedition-event')).toBeVisible();
  expect((await save(page)).campaignStats.expeditions).toBe(1);
  await page.getByRole('button', { name: /贴着边找/ }).click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'END_DAY');
  await guide(page).getByRole('button', { name: '找到这一步 ↓', exact: true }).click();
  await page.locator('[data-tutorial="end-day"]').click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'FIRST_NIGHT');
  await page.getByRole('button', { name: '关掉外面的灯', exact: true }).click();
  await expect(page.locator('.v1n-event-copy h1')).toHaveText('围栏外有人敲门');
  await expect(page.locator('.v1n-art')).toHaveAttribute('data-night-visual-key', 'night_door_visitor');
  await expect(page.locator('.v1n-art')).toHaveAttribute('data-art-state', 'ready');
}

async function finishNight(page: Page) {
  for (let i = 0; i < 30; i++) {
    if (await page.locator('.notebook-page--night-summary-v1').isVisible()) return;
    const roll = page.getByRole('button', { name: '试一次', exact: true });
    const accept = page.getByRole('button', { name: '把结果记下', exact: true });
    if (await roll.isVisible()) await roll.click();
    else if (await accept.isVisible()) await accept.click();
    else await page.locator('.v1n-choices button:enabled').last().click();
  }
  throw new Error('Night could not reach summary');
}

async function refreshAndResume(page: Page) {
  const before = await save(page);
  await page.reload();
  await continueSavedSessionFromTitle(page);
  const after = await save(page);
  expect(after.day).toBe(before.day);
  expect(after.inventory).toEqual(before.inventory);
  expect(after.campaignStats).toEqual(before.campaignStats);
  expect(after.rngState).toBe(before.rngState);
  expect(after.pendingCheck).toEqual(before.pendingCheck);
  expect(after.nightState).toEqual(before.nightState);
  expect(after.tutorial).toEqual(before.tutorial);
}

async function layoutIsUsable(page: Page) {
  const layout = await page.evaluate(() => {
    const note = document.querySelector('.v1-tutorial-note')!.getBoundingClientRect();
    return { width: window.innerWidth, height: window.innerHeight, pageWidth: document.documentElement.scrollWidth,
      noteX: note.x, noteRight: note.right, noteHeight: note.height,
      buttons: [...document.querySelectorAll('.v1-tutorial-note button')].map((button) => button.getBoundingClientRect().height) };
  });
  expect(layout.pageWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.noteX).toBeGreaterThanOrEqual(0);
  expect(layout.noteRight).toBeLessThanOrEqual(layout.width);
  expect(layout.noteHeight).toBeLessThan(layout.height * .43);
  expect(layout.buttons.every((height) => height >= 44)).toBe(true);
}

for (const width of [320, 360, 390, 430]) {
  test(`new player completes the real DAY1 → NIGHT1 → DAY2 loop at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page);
    await layoutIsUsable(page);
    await page.screenshot({ path: testInfo.outputPath('intro.png'), fullPage: true });
    await reachAssignments(page);
    await expect(page.locator('[data-tutorial="dispatch"]')).toBeDisabled();
    await workAndRoute(page);
    await layoutIsUsable(page);
    await departAndEndDay(page);
    await page.screenshot({ path: testInfo.outputPath('first-night.png'), fullPage: true });
    await finishNight(page);
    await page.getByRole('button', { name: '等天亮再清点', exact: true }).click();
    await page.getByRole('button', { name: '翻到第 2 天', exact: true }).click();
    await expect(guide(page)).toHaveAttribute('data-stage', 'OPEN_LOG');
    await guide(page).getByRole('button', { name: '打开日志', exact: true }).click();
    await expect(page.locator('[data-tutorial="journal"]')).toBeVisible();
    await expect(page.locator('[data-tutorial="journal"]')).toContainText('阿禾：炊事');
    await expect(page.locator('[data-tutorial="journal"]')).toContainText('林夏去了');
    await expect(page.locator('[data-tutorial="journal"]')).toContainText('选择：保持安静');
    await expect(guide(page)).toHaveCount(0);
    const completed = await save(page);
    expect(completed.tutorial?.tutorialCompleted).toBe(true);
    expect(completed.day).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('day2-journal.png'), fullPage: true });
    await page.getByRole('button', { name: '收起便签', exact: true }).click();
    await page.locator('[data-tutorial-nav="survivors"]').click();
    await drainNotices(page);
    // The original unlock notice may route back home; normal navigation remains usable.
    if (!(await page.locator('.v1s-list').isVisible())) await page.locator('[data-tutorial-nav="survivors"]').click();
    await page.locator('[data-tutorial-person="ahe"]').click();
    await page.locator('[data-tutorial-job="rest"]').click();
    expect((await save(page)).dayAssignments.ahe).toBe('rest');
    await refreshAndResume(page);
    await expect(guide(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('refresh restores two instructional stages and a rolled live night decision', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await start(page);
  await reachAssignments(page);
  await refreshAndResume(page);
  await expect(guide(page)).toHaveAttribute('data-stage', 'ASSIGN_SURVIVOR');
  await guide(page).getByRole('button', { name: '找到这一步 ↓', exact: true }).click();
  await workAndRoute(page);
  await refreshAndResume(page);
  await expect(guide(page)).toHaveAttribute('data-stage', 'SEND_EXPEDITION');
  await guide(page).getByRole('button', { name: '找到这一步 ↓', exact: true }).click();
  await departAndEndDay(page);
  await page.getByRole('button', { name: /让守夜的人确认/ }).click();
  await page.getByRole('button', { name: '试一次', exact: true }).click();
  await refreshAndResume(page);
  await page.getByRole('button', { name: '把结果记下', exact: true }).click();
  const recorded = await save(page);
  expect(recorded.campaignStats.nightEventsResolved).toBe(1);
  await finishNight(page);
});

test('explicitly choosing the default rest job is a real first assignment', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  await reachAssignments(page);
  await page.locator('[data-tutorial-person="ahe"]').click();
  await page.locator('[data-tutorial-job="rest"]').click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'SEND_EXPEDITION');
  expect((await save(page)).dayAssignments.ahe).toBe('rest');
  await refreshAndResume(page);
  await expect(guide(page)).toHaveAttribute('data-stage', 'SEND_EXPEDITION');
  await guide(page).getByRole('button', { name: '找到这一步 ↓', exact: true }).click();
  await page.locator('[data-tutorial-person="lin-xia"]').click();
  await page.locator('[data-tutorial-job="expedition"]').click();
  await page.locator('[data-tutorial="confirm-route"]').click();
  await expect(page.locator('[data-tutorial="dispatch"]')).toBeEnabled();
});

for (const checkpoint of ['INTRO', 'SEND_EXPEDITION', 'FIRST_NIGHT'] as const) {
  test(`skip at ${checkpoint} immediately restores the game and survives refresh`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await start(page);
    if (checkpoint !== 'INTRO') { await reachAssignments(page); await workAndRoute(page); }
    if (checkpoint === 'FIRST_NIGHT') await departAndEndDay(page);
    const before = await save(page);
    await guide(page).getByRole('button', { name: '跳过引导', exact: true }).click();
    await expect(guide(page)).toHaveCount(0);
    await expect(page.locator('[data-tutorial-focus]')).toHaveCount(0);
    const after = await save(page);
    expect(after.day).toBe(before.day);
    expect(after.phase).toBe(before.phase);
    expect(after.inventory).toEqual(before.inventory);
    expect(after.nightState).toEqual(before.nightState);
    expect(after.tutorial?.tutorialSkipped).toBe(true);
    await refreshAndResume(page);
    await expect(page.locator('.v1-tutorial-note')).toHaveCount(0);
    if (checkpoint === 'FIRST_NIGHT') await finishNight(page);
    else {
      await page.locator('[data-tutorial-nav="survivors"]').click();
      await expect(page.locator('[data-tutorial="dispatch"]')).toBeEnabled();
      await page.locator('[data-tutorial="dispatch"]').click();
      await expect(page.locator('.notebook-page--dusk-v1, .notebook-page--expedition-event')).toBeVisible();
    }
  });
}

test('old DAY12 save stays DAY12 with no onboarding, and shelter Lv1 uses the locked sprite', async ({ page }) => {
  // A valid DAY12 fixture has already answered the DAY7 principle, not a jumped DAY1 run.
  const legacy = choosePrinciple({ ...createV060InitialState(912), day: 12 }, 'everyone-shares');
  await page.goto('/');
  await page.evaluate(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('ember-street-last-active-v1', String(Date.now()));
  }, { key: KEY, state: legacy });
  await page.reload();
  await continueSavedSessionFromTitle(page);
  expect((await save(page)).day).toBe(12);
  await expect(page.locator('.v1-tutorial-note')).toHaveCount(0);
  await drainNotices(page);
  const snapshot = await save(page);
  expect(snapshot.tutorial).toBeUndefined();
  await expect(page.locator('.v1-home-hero__art')).toHaveCSS('background-image', /buildings-b.webp/);
  await expect(page.locator('.v1-home-hero__art')).toHaveCSS('background-position', '100% 100%');
  await page.locator('[data-tutorial-nav="buildings"]').click();
  const shelter = page.locator('.v1-building').filter({ has: page.getByText('宿营屋', { exact: true }) });
  await shelter.locator('.v1-building__summary').click();
  await expect(shelter.locator('.v1-building__art')).toHaveCSS('background-image', /buildings-b.webp/);
  await expect(shelter.locator('.v1-building__art')).toHaveCSS('background-position', '100% 100%');
});

test('guide remains usable without ResizeObserver and scroll-margin support', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => { Object.defineProperty(window, 'ResizeObserver', { value: undefined }); });
  await start(page);
  await page.addStyleTag({ content: '* { scroll-margin-top: 0 !important; }' });
  await reachAssignments(page);
  await workAndRoute(page);
  await page.locator('[data-tutorial="dispatch"]').click();
  await page.getByRole('button', { name: /马上回去/ }).click();
  await guide(page).getByRole('button', { name: '找到这一步 ↓', exact: true }).click();
  const geometry = await page.evaluate(() => {
    const note = document.querySelector('.v1-tutorial-note')!.getBoundingClientRect();
    const action = document.querySelector('[data-tutorial="end-day"]')!.getBoundingClientRect();
    return { noteBottom: note.bottom, actionTop: action.top, actionBottom: action.bottom, height: window.innerHeight };
  });
  expect(geometry.actionTop).toBeGreaterThanOrEqual(geometry.noteBottom);
  expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.height);
  await page.locator('[data-tutorial="end-day"]').click();
  await expect(guide(page)).toHaveAttribute('data-stage', 'FIRST_NIGHT');
});

test('long journal renders twenty records at a time without losing older pages', async ({ page }) => {
  const state: GameState = { ...createV060InitialState(914), journal: Array.from({ length: 45 }, (_, index) => ({
    id: `entry-${index}`, day: 1, kind: 'work' as const, title: `记录 ${index}`, body: '口粮 -1。',
  })) };
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.evaluate(({ key, gameState }) => {
    localStorage.setItem(key, JSON.stringify(gameState));
    localStorage.setItem('ember-street-last-active-v1', String(Date.now()));
  }, { key: KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
  await drainNotices(page);
  await page.locator('[data-tutorial-nav="records"]').click();
  await expect(page.locator('.v1r-journal-entry')).toHaveCount(20);
  await expect(page.locator('.v1r-journal-title').first()).toHaveText('记录 44');
  await page.getByRole('button', { name: '更早的记录', exact: true }).click();
  await expect(page.locator('.v1r-journal-entry')).toHaveCount(20);
  await expect(page.locator('.v1r-journal-title').first()).toHaveText('记录 24');
  await page.getByRole('button', { name: '更早的记录', exact: true }).click();
  await expect(page.locator('.v1r-journal-entry')).toHaveCount(5);
  await expect(page.locator('.v1r-journal-title').last()).toHaveText('记录 0');
  await expect(page.getByRole('button', { name: '更早的记录', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '较新的记录', exact: true }).click();
  await expect(page.locator('.v1r-journal-entry')).toHaveCount(20);
  expect((await save(page)).journal).toHaveLength(45);
});
