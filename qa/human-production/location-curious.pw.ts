import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BuildingId, DayAssignment, GameState, StreetPrincipleId, Survivor } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { canUpgradeBuilding, V060_BUILDINGS } from '../../src/game/v060/buildings';
import { pendingCommunityRequest } from '../../src/game/v060/communityPromises';
import { canTakeDayAssignment, survivorAvailableForDay } from '../../src/game/v060/dayManagement';
import { nightChoicePreview } from '../../src/game/v060/decisionReadability';
import {
  availableExpeditionLocations,
  expeditionRiskLabel,
  expeditionRiskScore,
  locationForId,
} from '../../src/game/v060/expedition';
import { canAffordNightChoice, currentNightEvent } from '../../src/game/v060/nightScheduler';
import { continueSavedSessionFromTitle } from '../ui-overhaul/session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const JOB_LABEL: Record<DayAssignment, string> = {
  expedition: '探索', repair: '维修', medical: '医疗', watch: '守备', radio: '广播', cook: '炊事', rest: '休息',
};
const PRINCIPLE_LABEL: Record<StreetPrincipleId, string> = {
  'everyone-shares': '人人有份', 'triage-first': '先救伤得最重的', 'outward-search': '先顾出去找东西的人',
  'core-leads': '熟手带头', 'community-shares-risk': '大家一起扛', 'preserve-strength': '先把人留下',
  'hold-the-street': '守住这条街', 'prepare-evacuation': '准备离开', 'await-aid': '继续等声音',
};

interface RouteDecision {
  day: number;
  location: string;
  firstVisit: boolean;
  risk: string;
  partySize: number;
  stance?: string;
}
interface DayRow {
  day: number;
  population: number;
  ration: number;
  medicine: number;
  materials: number;
  parts: number;
  defense: number;
  hope: number;
  injured: number;
  deaths: number;
}
interface CuriousReport {
  days: DayRow[];
  routes: RouteDecision[];
  choices: Array<{ day: number; type: string; detail: string }>;
  runtimeErrors: string[];
  final?: Record<string, unknown>;
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.first().isVisible().catch(() => false);
}
async function click(locator: Locator): Promise<boolean> {
  const target = locator.first();
  if (!await visible(target)) return false;
  await target.click();
  await target.page().waitForTimeout(40);
  return true;
}
async function saved(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY);
}
async function install(page: Page, value: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, state }) => {
    localStorage.clear();
    localStorage.setItem(saveKey, JSON.stringify(state));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, state: value });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

const present = (state: GameState) => state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing');
const population = (state: GameState) => present(state).length + Math.max(0, state.civilianResidents);
const injured = (state: GameState) => present(state).filter((s) => ['minor', 'serious', 'critical'].includes(s.condition ?? '')).length;
const usable = (state: GameState, survivor: Survivor) => survivorAvailableForDay(survivor)
  && !state.dayState.committedSurvivorIds.includes(survivor.id)
  && !state.dayAssignments[survivor.id];

function note(report: CuriousReport, state: GameState, type: string, detail: string) {
  report.choices.push({ day: state.day, type, detail });
  console.log(`[curious] DAY ${state.day} ${type}: ${detail}`);
}

function desiredBuilding(state: GameState): BuildingId | null {
  const order: BuildingId[] = [];
  if (state.buildings.searchStation < 2) order.push('searchStation');
  if (state.buildings.clinic < 1 || injured(state) > 0) order.push('clinic');
  if (state.buildings.workshop < 1 || state.defense < 45) order.push('workshop');
  if (state.buildings.shelter < 1 && state.civilianResidents > 0) order.push('shelter');
  if (state.day >= 10 && state.buildings.radio < 1) order.push('radio');
  if (state.buildings.watchPost < 1 && state.day >= 12) order.push('watchPost');
  for (const id of order) if (canUpgradeBuilding(state, id).allowed) return id;
  return null;
}

async function upgradeOne(page: Page, state: GameState, report: CuriousReport): Promise<boolean> {
  const id = desiredBuilding(state);
  if (!id || !await click(page.getByRole('button', { name: '建筑', exact: true }))) return false;
  const article = page.locator('.v1-building').filter({ hasText: V060_BUILDINGS[id].name }).first();
  const summary = article.locator('.v1-building__summary');
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
  const action = article.locator('.v1-primary-action:enabled');
  if (!await visible(action)) {
    await click(page.getByRole('button', { name: '据点', exact: true }));
    return false;
  }
  await action.click();
  note(report, state, '建筑', `${V060_BUILDINGS[id].name} ${state.buildings[id]}→${state.buildings[id] + 1}`);
  await page.waitForTimeout(45);
  return true;
}

function expeditionAssigned(state: GameState): number {
  return Object.values(state.dayAssignments).filter((value) => value === 'expedition').length;
}

function chooseRoute(state: GameState, partyIds: string[]): string | null {
  const locations = availableExpeditionLocations(state);
  if (!locations.length) return null;
  const unvisited = locations.filter((location) => !state.storyFlags.includes(`visited:${location.id}`));
  const pool = unvisited.length ? unvisited : locations;
  const scored = pool.map((location) => {
    const risk = expeditionRiskScore(state, partyIds, location.id);
    const firstVisit = !state.storyFlags.includes(`visited:${location.id}`);
    const foodPressure = state.inventory.ration < Math.max(1, population(state)) * 3;
    const foodBonus = foodPressure && (location.primary === 'ration' || location.secondary === 'ration' || location.tertiary === 'ration') ? 6 : 0;
    const novelty = firstVisit ? 30 + location.unlockDay * 0.4 : 0;
    return { location, score: novelty + foodBonus - risk * 1.2 };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.location.id ?? null;
}

function nextJob(state: GameState): { survivor: Survivor; job: DayAssignment } | null {
  const pool = state.survivors.filter((s) => usable(state, s));
  if (!pool.length) return null;
  const count = (job: DayAssignment) => Object.values(state.dayAssignments).filter((value) => value === job).length;

  if (injured(state) > 0 && state.buildings.clinic > 0 && count('medical') < 1) {
    const medic = pool
      .filter((s) => s.condition === 'healthy' && s.energy >= 30)
      .sort((a, b) => (b.specialty === 'medical' ? 20 : 0) + b.energy - ((a.specialty === 'medical' ? 20 : 0) + a.energy))[0];
    if (medic && canTakeDayAssignment(state, medic.id, 'medical').allowed) return { survivor: medic, job: 'medical' };
  }

  const needCook = state.mealState.consecutiveShortageDays > 0 || state.inventory.ration < Math.max(1, population(state)) * 3;
  if (needCook && count('cook') < 1) {
    const cook = pool
      .sort((a, b) => (b.specialty === 'cook' ? 20 : 0) + b.energy - ((a.specialty === 'cook' ? 20 : 0) + a.energy))[0];
    if (cook && canTakeDayAssignment(state, cook.id, 'cook').allowed) return { survivor: cook, job: 'cook' };
  }

  const canExplore = expeditionAssigned(state) < 2;
  if (canExplore) {
    const explorer = pool
      .filter((s) => !['minor', 'serious', 'critical'].includes(s.condition ?? '') && s.energy >= 42)
      .sort((a, b) => (b.specialty === 'search' ? 20 : 0) + b.energy - ((a.specialty === 'search' ? 20 : 0) + a.energy))[0];
    if (explorer && canTakeDayAssignment(state, explorer.id, 'expedition').allowed) return { survivor: explorer, job: 'expedition' };
  }

  if (state.defense < 45 && state.buildings.workshop > 0) {
    const repairer = pool.find((s) => canTakeDayAssignment(state, s.id, 'repair').allowed);
    if (repairer) return { survivor: repairer, job: 'repair' };
  }

  const tired = pool.sort((a, b) => a.energy - b.energy)[0];
  if (tired && canTakeDayAssignment(state, tired.id, 'rest').allowed) return { survivor: tired, job: 'rest' };
  return null;
}

async function assignOne(page: Page, state: GameState, report: CuriousReport): Promise<boolean> {
  const plan = nextJob(state);
  if (!plan) return false;
  const card = page.locator('.v1s-list article').filter({ hasText: plan.survivor.name }).first();
  if (!await visible(card.locator('button:enabled'))) return false;
  await card.locator('button:enabled').first().click();
  let jobButton = page.locator('.v1s-jobs button:enabled').filter({ hasText: JOB_LABEL[plan.job] }).first();
  if (!await visible(jobButton)) jobButton = page.locator('.v1s-jobs button:enabled').first();
  if (!await visible(jobButton)) {
    await click(page.getByRole('button', { name: '返回名单', exact: true }));
    return false;
  }
  const actualJob = (await jobButton.locator('strong').textContent())?.trim() ?? JOB_LABEL[plan.job];
  await jobButton.click();
  await page.waitForTimeout(30);

  if (actualJob === '探索') {
    const afterAssignment = await saved(page);
    const currentParty = Object.entries(afterAssignment.dayAssignments)
      .filter(([, job]) => job === 'expedition')
      .map(([id]) => id);
    const existingRoute = Object.values(afterAssignment.dayState.expeditionRoutes ?? {})[0];
    const routeId = existingRoute ?? chooseRoute(afterAssignment, currentParty);
    const preferredName = routeId ? locationForId(routeId)?.name : null;
    let routeButton = preferredName
      ? page.locator('.v1e-location:enabled').filter({ hasText: preferredName }).first()
      : page.locator('.v1e-location:enabled').first();
    if (!await visible(routeButton)) routeButton = page.locator('.v1e-location:enabled').first();
    await expect(routeButton).toBeVisible();
    const locationName = (await routeButton.locator('strong').first().textContent())?.trim() ?? preferredName ?? '未知地点';
    await routeButton.click();
    await page.locator('.v1e-primary:enabled').click();
    note(report, state, '派工', `${plan.survivor.name}→探索→${locationName}`);
  } else {
    note(report, state, '派工', `${plan.survivor.name}→${actualJob}`);
  }
  await page.waitForTimeout(35);
  return true;
}

function stanceFor(state: GameState): { stance: 'push' | 'careful' | 'retreat'; risk: string } {
  const locationId = state.expeditionState.locationId;
  if (!locationId) return { stance: 'retreat', risk: 'unknown' };
  const risk = expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, locationId));
  if (risk === 'safe') return { stance: 'push', risk };
  if (risk === 'cautious' || risk === 'dangerous') return { stance: 'careful', risk };
  return { stance: 'retreat', risk };
}

function chooseNight(state: GameState): string | null {
  const event = currentNightEvent(state);
  if (!event) return null;
  const pop = Math.max(1, population(state));
  let best: { id: string; score: number } | null = null;
  for (const option of event.choices.filter((choice) => canAffordNightChoice(state, choice))) {
    const preview = nightChoicePreview(state, event, option);
    const text = `${option.label} ${option.detail} ${preview.tags.join(' ')}`;
    let score = { safe: 8, stable: 7, risky: 1, severe: -15 }[preview.tone];
    if (/一定会有人死/.test(text)) score -= 40;
    if (/可能会有人死/.test(text)) score -= 15;
    if (/主灯保持熄灭|接受黑暗|主灯彻底熄灭/.test(text) && state.inventory.power > 10) score -= 25;
    if (/门墙可能受损/.test(text) && state.defense < 45) score -= 10;
    if (/人心可能再往下掉/.test(text) && state.hope < 25) score -= 10;
    if (/要用口粮/.test(text) && state.inventory.ration <= pop * 2) score -= 8;
    if (/要用药品/.test(text) && state.inventory.medicine <= Math.max(1, injured(state))) score -= 9;
    if (/要用电力/.test(text) && state.inventory.power <= 18) score -= 8;
    if (!best || score > best.score) best = { id: option.id, score };
  }
  return best?.id ?? null;
}

async function handleAttention(page: Page, state: GameState, report: CuriousReport): Promise<boolean> {
  const missing = page.locator('.v6-missing-action:enabled').first();
  if (await visible(missing)) {
    const text = (await missing.textContent())?.trim().replace(/\s+/g, ' ') ?? '搜救';
    await missing.click();
    note(report, state, '搜救', text.slice(0, 70));
    return true;
  }
  if (await click(page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true }))) {
    note(report, state, '搜救', '今天先继续');
    return true;
  }

  const desired: StreetPrincipleId = state.day >= 21 ? 'prepare-evacuation' : state.day >= 14 ? 'core-leads' : 'everyone-shares';
  const principle = page.locator('.v6-principle-choice').filter({ hasText: PRINCIPLE_LABEL[desired] }).first();
  if (await visible(principle)) {
    await principle.click();
    note(report, state, '原则', PRINCIPLE_LABEL[desired]);
    return true;
  }
  const anyPrinciple = page.locator('.v6-principle-choice').first();
  if (await visible(anyPrinciple)) {
    const text = (await anyPrinciple.locator('strong').textContent())?.trim() ?? '原则';
    await anyPrinciple.click();
    note(report, state, '原则', text);
    return true;
  }

  const requestCard = page.locator('.v6-request-card').first();
  if (await visible(requestCard)) {
    const request = pendingCommunityRequest(state);
    const accept = Boolean(request && ['search-missing', 'medical-care', 'hot-meal', 'restore-defense'].includes(request.kind));
    await requestCard.locator('button').filter({ hasText: accept ? '答应下来' : '不答应' }).first().click();
    note(report, state, '承诺', `${accept ? '答应' : '拒绝'} · ${request?.title ?? ''}`);
    return true;
  }
  return false;
}

async function handleDeparture(page: Page, state: GameState, report: CuriousReport): Promise<boolean> {
  const panel = page.locator('.notebook-page--community-event').first();
  if (!await visible(panel)) return false;
  const keep = state.inventory.ration >= Math.max(1, population(state)) * 4;
  const keepButton = panel.locator('button:enabled').filter({ hasText: /口粮挽留/ }).first();
  if (keep && await visible(keepButton)) {
    await keepButton.click();
    note(report, state, '居民离开', '拿口粮挽留');
  } else {
    await panel.locator('button:enabled').filter({ hasText: '不再挽留' }).first().click();
    note(report, state, '居民离开', '不再挽留');
  }
  return true;
}

test('好奇但不莽的玩家会不会真正使用中后期探索地点', async ({ page }) => {
  test.setTimeout(240_000);
  const report: CuriousReport = { days: [], routes: [], choices: [], runtimeErrors: [] };
  page.on('pageerror', (error) => report.runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, createV060InitialState(999401));

  const upgradedDays = new Set<number>();
  let loggedDay = 0;
  for (let step = 0; step < 1800; step += 1) {
    const state = await saved(page);
    if (state.day !== loggedDay) {
      loggedDay = state.day;
      const row: DayRow = {
        day: state.day,
        population: population(state),
        ration: state.inventory.ration,
        medicine: state.inventory.medicine,
        materials: state.inventory.materials,
        parts: state.inventory.parts,
        defense: Math.round(state.defense),
        hope: state.hope,
        injured: injured(state),
        deaths: state.campaignStats.deaths,
      };
      report.days.push(row);
      console.log(`[curious-day] ${JSON.stringify(row)}`);
    }

    if (await visible(page.locator('.notebook-page--ending-v1'))) {
      const final = await saved(page);
      report.final = {
        ending: final.ending,
        finalHordeResult: final.finalHordeResult,
        population: population(final),
        deaths: final.campaignStats.deaths,
        expeditions: final.campaignStats.expeditions,
        rescued: final.campaignStats.rescued,
        visitedLocations: final.storyFlags.filter((flag) => flag.startsWith('visited:')).map((flag) => flag.slice('visited:'.length)),
        buildings: final.buildings,
        inventory: final.inventory,
        defense: final.defense,
        hope: final.hope,
      };
      mkdirSync('test-results/human-playtest', { recursive: true });
      writeFileSync('test-results/human-playtest/location-curious.json', JSON.stringify(report, null, 2));
      console.log(`[curious-summary] ${JSON.stringify(report.final)}`);
      expect(final.day).toBe(30);
      expect(report.runtimeErrors).toEqual([]);
      return;
    }

    if (await click(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;
    if (await handleDeparture(page, state, report)) continue;
    if (await handleAttention(page, state, report)) continue;

    if (await visible(page.locator('.v1-home-page'))) {
      if (!upgradedDays.has(state.day)) {
        upgradedDays.add(state.day);
        if (await upgradeOne(page, state, report)) continue;
      }
      await page.locator('.v1-day-action').click();
      await page.waitForTimeout(35);
      continue;
    }

    if (await visible(page.locator('.notebook-page--buildings')) && await click(page.getByRole('button', { name: '据点', exact: true }))) continue;

    if (await visible(page.locator('.notebook-page--survivors'))) {
      if (await assignOne(page, state, report)) continue;
      if (await click(page.locator('.v1s-done:enabled'))) {
        note(report, state, '派工确认', '名单确定');
        continue;
      }
      if (await page.locator('.v1s-jobs button:enabled').count() > 0) {
        await click(page.getByRole('button', { name: '返回名单', exact: true }));
        continue;
      }
    }

    if (await visible(page.locator('.notebook-page--expedition-event'))) {
      const locationId = state.expeditionState.locationId!;
      const location = locationForId(locationId)!;
      const { stance, risk } = stanceFor(state);
      const firstVisit = !state.storyFlags.includes(`visited:${locationId}`);
      const label = stance === 'push' ? '往里再走' : stance === 'careful' ? '贴着边找' : '马上回去';
      const entry: RouteDecision = { day: state.day, location: location.name, firstVisit, risk, partySize: state.expeditionState.activePartyIds.length, stance: label };
      report.routes.push(entry);
      console.log(`[curious-route] ${JSON.stringify(entry)}`);
      await page.locator('.v1e-decisions button').filter({ hasText: label }).first().click();
      continue;
    }

    if (await click(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '试一次', exact: true }))) continue;
    const reroll = page.getByRole('button', { name: '有人愿意替你再试一次', exact: true }).first();
    if (await visible(reroll) && state.pendingCheck?.dice && state.pendingCheck.outcome === 'failure') {
      await reroll.click();
      note(report, state, '信任重掷', '失败后重试');
      continue;
    }
    if (await click(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const id = chooseNight(state);
      const event = currentNightEvent(state);
      const option = event?.choices.find((choice) => choice.id === id);
      if (!option) throw new Error(`DAY ${state.day}: no affordable night choice`);
      await page.locator('.v1n-choices button:enabled').filter({ hasText: option.label }).first().click();
      note(report, state, '夜间抉择', `${event?.title ?? '夜里'} · ${option.label}`);
      continue;
    }

    if (await click(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ }))) continue;

    const buttons = await page.locator('button:visible').allTextContents();
    const headings = await page.locator('h1:visible,h2:visible,h3:visible').allTextContents();
    throw new Error(`Curious human has no progression action: ${JSON.stringify({ day: state.day, phase: state.phase, committed: state.dayState.committedSurvivorIds, buttons: buttons.slice(0, 15), headings: headings.slice(0, 10) })}`);
  }
  throw new Error('Curious human exceeded action budget');
});
