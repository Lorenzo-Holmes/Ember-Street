import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { BuildingId, DayAssignment, GameState, StreetPrincipleId, Survivor } from '../../src/game/types';
import { createV060InitialState } from '../../src/game/v060/campaign';
import { canUpgradeBuilding, V060_BUILDINGS } from '../../src/game/v060/buildings';
import { pendingCommunityRequest } from '../../src/game/v060/communityPromises';
import { canTakeDayAssignment, survivorAvailableForDay } from '../../src/game/v060/dayManagement';
import { nightChoicePreview } from '../../src/game/v060/decisionReadability';
import { availableExpeditionLocations, expeditionRiskLabel, expeditionRiskScore, locationForId } from '../../src/game/v060/expedition';
import { canAffordNightChoice, currentNightEvent } from '../../src/game/v060/nightScheduler';
import { continueSavedSessionFromTitle } from '../ui-overhaul/session-entry';

const SAVE_KEY = 'ember-street-save-v3';
const ACTIVE_KEY = 'ember-street-last-active-v1';
const JOB_LABEL: Record<DayAssignment, string> = { expedition: '探索', repair: '维修', medical: '医疗', watch: '守备', radio: '广播', cook: '炊事', rest: '休息' };

type StrategyId = 'explorer' | 'turtle';
interface Strategy {
  id: StrategyId;
  name: string;
  seed: number;
  defenseTarget: number;
  buildingOrder: BuildingId[];
  principles: Record<7 | 14 | 21, StreetPrincipleId>;
}

const STRATEGIES: Strategy[] = [
  { id: 'explorer', name: '自适应积极探索者', seed: 999401, defenseTarget: 45, buildingOrder: ['searchStation', 'clinic', 'workshop', 'radio', 'shelter', 'watchPost'], principles: { 7: 'outward-search', 14: 'core-leads', 21: 'prepare-evacuation' } },
  { id: 'turtle', name: '自适应龟缩建设者', seed: 999401, defenseTarget: 72, buildingOrder: ['watchPost', 'workshop', 'clinic', 'shelter', 'radio', 'searchStation'], principles: { 7: 'triage-first', 14: 'preserve-strength', 21: 'hold-the-street' } },
];

interface DayRow { day: number; total: number; ration: number; medicine: number; materials: number; parts: number; defense: number; hope: number; injured: number; missing: number; deaths: number; expeditions: number; }
interface Report { strategy: string; days: DayRow[]; decisions: Array<{ day: number; type: string; detail: string }>; runtimeErrors: string[]; final?: Record<string, unknown>; }

async function visible(locator: Locator): Promise<boolean> { return locator.first().isVisible().catch(() => false); }
async function click(locator: Locator): Promise<boolean> { const x = locator.first(); if (!await visible(x)) return false; await x.click(); await x.page().waitForTimeout(40); return true; }
async function saved(page: Page): Promise<GameState> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY); }
async function install(page: Page, value: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, state }) => { localStorage.clear(); localStorage.setItem(saveKey, JSON.stringify(state)); localStorage.setItem(activeKey, String(Date.now())); }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, state: value });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

const present = (s: GameState) => s.survivors.filter((x) => x.condition !== 'dead' && x.condition !== 'missing');
const total = (s: GameState) => present(s).length + Math.max(0, s.civilianResidents);
const injured = (s: GameState) => present(s).filter((x) => ['minor', 'serious', 'critical'].includes(x.condition ?? '')).length;
const log = (r: Report, s: GameState, type: string, detail: string) => { r.decisions.push({ day: s.day, type, detail }); console.log(`[adaptive:${r.strategy}] DAY ${s.day} ${type}: ${detail}`); };

function usableToday(s: GameState, x: Survivor): boolean {
  return survivorAvailableForDay(x) && !s.dayState.committedSurvivorIds.includes(x.id) && !s.dayAssignments[x.id];
}

function buildingPriority(s: GameState, strategy: Strategy): BuildingId[] {
  const dynamic: BuildingId[] = [];
  if (injured(s) > 0 || s.inventory.medicine <= 2) dynamic.push('clinic');
  if (s.defense < strategy.defenseTarget) dynamic.push('workshop', 'watchPost');
  if (strategy.id === 'explorer') dynamic.push('searchStation');
  if (s.civilianResidents > 0) dynamic.push('shelter');
  if (s.day >= 10) dynamic.push('radio');
  return [...new Set([...dynamic, ...strategy.buildingOrder])];
}

async function upgradeOne(page: Page, s: GameState, strategy: Strategy, r: Report): Promise<boolean> {
  const id = buildingPriority(s, strategy).find((x) => canUpgradeBuilding(s, x).allowed);
  if (!id || !await click(page.getByRole('button', { name: '建筑', exact: true }))) return false;
  const article = page.locator('.v1-building').filter({ hasText: V060_BUILDINGS[id].name }).first();
  const summary = article.locator('.v1-building__summary');
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
  const action = article.locator('.v1-primary-action:enabled');
  if (!await visible(action)) { await click(page.getByRole('button', { name: '据点', exact: true })); return false; }
  await action.click();
  log(r, s, '建筑', `${V060_BUILDINGS[id].name} ${s.buildings[id]}→${s.buildings[id] + 1}`);
  await page.waitForTimeout(50);
  return true;
}

function routeScore(s: GameState, partyIds: string[], locationId: string, strategy: Strategy): number {
  const location = locationForId(locationId)!;
  const p = Math.max(1, total(s));
  const weights = {
    ration: s.inventory.ration < p * 2 ? 14 : s.inventory.ration < p * 4 ? 8 : 3,
    medicine: s.inventory.medicine <= Math.max(2, injured(s)) ? 12 : 3,
    materials: s.inventory.materials < 5 ? 9 : 3,
    parts: s.inventory.parts < 3 ? 10 : 3,
  } as const;
  const resource = weights[location.primary] * 3 + weights[location.secondary] * 1.5 + (location.tertiary ? weights[location.tertiary] : 0);
  const firstVisit = s.storyFlags.includes(`visited:${location.id}`) ? 0 : strategy.id === 'explorer' ? 12 : 4;
  const risk = expeditionRiskScore(s, partyIds, location.id);
  return resource + firstVisit - risk * (strategy.id === 'explorer' ? 1.0 : 2.0);
}

function chooseRoute(s: GameState, partyIds: string[], strategy: Strategy): string | null {
  const locations = availableExpeditionLocations(s);
  return locations.sort((a, b) => routeScore(s, partyIds, b.id, strategy) - routeScore(s, partyIds, a.id, strategy))[0]?.id ?? null;
}

function expeditionTarget(s: GameState, strategy: Strategy): number {
  if (s.dayState.returnedExpeditions > 0 || s.buildings.searchStation <= 0) return 0;
  const p = Math.max(1, total(s));
  const resourceEmergency = s.inventory.ration < p * 3 || s.inventory.medicine <= 1 || s.inventory.materials < 4 || s.inventory.parts < 2;
  const injuryRatio = injured(s) / Math.max(1, present(s).length);
  if (strategy.id === 'explorer') {
    if (injuryRatio >= 0.6) return resourceEmergency ? 1 : 0;
    return resourceEmergency || s.day % 2 === 0 ? 2 : 1;
  }
  return resourceEmergency ? 1 : 0;
}

function targetCooks(s: GameState): number {
  const p = Math.max(1, total(s));
  if (s.mealState.consecutiveShortageDays > 0) return p >= 6 ? 2 : 1;
  if (s.inventory.ration < p * 3) return 1;
  return 0;
}

function chooseNextAssignment(s: GameState, strategy: Strategy): { survivor: Survivor; job: DayAssignment } | null {
  const pool = s.survivors.filter((x) => usableToday(s, x));
  if (!pool.length) return null;
  const assigned = Object.values(s.dayAssignments);
  const count = (job: DayAssignment) => assigned.filter((x) => x === job).length;

  if (injured(s) > 0 && s.buildings.clinic > 0 && count('medical') < 1) {
    const medic = pool.filter((x) => x.condition === 'healthy' && x.energy >= 30).sort((a, b) => (b.specialty === 'medical' ? 20 : 0) + b.energy - ((a.specialty === 'medical' ? 20 : 0) + a.energy))[0];
    if (medic && canTakeDayAssignment(s, medic.id, 'medical').allowed) return { survivor: medic, job: 'medical' };
  }

  if (count('cook') < targetCooks(s)) {
    const cook = pool.sort((a, b) => (b.specialty === 'cook' ? 20 : 0) + b.energy - ((a.specialty === 'cook' ? 20 : 0) + a.energy))[0];
    if (cook && canTakeDayAssignment(s, cook.id, 'cook').allowed) return { survivor: cook, job: 'cook' };
  }

  const expTarget = expeditionTarget(s, strategy);
  if (count('expedition') < expTarget) {
    const explorer = pool.filter((x) => !['minor', 'serious', 'critical'].includes(x.condition ?? '') && x.energy >= 40)
      .sort((a, b) => (b.specialty === 'search' ? 20 : 0) + b.energy - ((a.specialty === 'search' ? 20 : 0) + a.energy))[0];
    if (explorer && canTakeDayAssignment(s, explorer.id, 'expedition').allowed) return { survivor: explorer, job: 'expedition' };
  }

  if (strategy.id === 'turtle' && s.defense < strategy.defenseTarget) {
    const watch = pool.find((x) => s.buildings.watchPost > 0 && canTakeDayAssignment(s, x.id, 'watch').allowed);
    if (watch) return { survivor: watch, job: 'watch' };
    const repair = pool.find((x) => s.buildings.workshop > 0 && canTakeDayAssignment(s, x.id, 'repair').allowed);
    if (repair) return { survivor: repair, job: 'repair' };
  }

  if (strategy.id === 'explorer' && s.defense < strategy.defenseTarget) {
    const repair = pool.find((x) => s.buildings.workshop > 0 && canTakeDayAssignment(s, x.id, 'repair').allowed);
    if (repair) return { survivor: repair, job: 'repair' };
  }

  const tired = pool.filter((x) => x.energy < 50 || x.condition === 'fatigued' || x.condition === 'minor' || x.condition === 'serious').sort((a, b) => a.energy - b.energy)[0];
  if (tired && canTakeDayAssignment(s, tired.id, 'rest').allowed) return { survivor: tired, job: 'rest' };

  const fallback = pool[0];
  for (const job of ['cook', 'rest', 'repair', 'watch', 'radio'] as DayAssignment[]) {
    if (canTakeDayAssignment(s, fallback.id, job).allowed) return { survivor: fallback, job };
  }
  return null;
}

async function assignNext(page: Page, s: GameState, strategy: Strategy, r: Report): Promise<boolean> {
  const choice = chooseNextAssignment(s, strategy);
  if (!choice) return false;
  const { survivor, job } = choice;
  const card = page.locator('.v1s-list article').filter({ hasText: survivor.name }).first();
  await card.locator('button:enabled').first().click();
  let button = page.locator('.v1s-jobs button:enabled').filter({ hasText: JOB_LABEL[job] }).first();
  if (!await visible(button)) button = page.locator('.v1s-jobs button:enabled').first();
  if (!await visible(button)) { await page.getByRole('button', { name: '返回名单', exact: true }).click(); return false; }
  const actualLabel = (await button.locator('strong').textContent())?.trim() ?? JOB_LABEL[job];
  await button.click();
  await page.waitForTimeout(35);
  if (actualLabel === '探索') {
    const after = await saved(page);
    const alreadyRoutes = after.dayState.expeditionRoutes ?? {};
    const currentParty = Object.entries(after.dayAssignments).filter(([, value]) => value === 'expedition').map(([id]) => id);
    const routeId = chooseRoute(after, currentParty, strategy);
    const preferred = routeId ? locationForId(routeId)?.name : null;
    let routeButton = preferred ? page.locator('.v1e-location:enabled').filter({ hasText: preferred }).first() : page.locator('.v1e-location:enabled').first();
    if (!await visible(routeButton)) routeButton = page.locator('.v1e-location:enabled').first();
    const routeName = (await routeButton.locator('strong').first().textContent())?.trim() ?? preferred ?? '未知地点';
    await routeButton.click();
    await page.locator('.v1e-primary:enabled').click();
    log(r, s, '人员', `${survivor.name}→探索→${routeName}${alreadyRoutes[survivor.id] ? '（改线）' : ''}`);
  } else log(r, s, '人员', `${survivor.name}→${actualLabel}`);
  await page.waitForTimeout(40);
  return true;
}

function expeditionDecision(s: GameState, strategy: Strategy): 'push' | 'careful' | 'retreat' {
  const id = s.expeditionState.locationId;
  if (!id) return 'retreat';
  const risk = expeditionRiskLabel(expeditionRiskScore(s, s.expeditionState.activePartyIds, id));
  if (strategy.id === 'explorer') return risk === 'safe' ? 'push' : risk === 'cautious' ? 'careful' : 'retreat';
  return risk === 'safe' ? 'careful' : 'retreat';
}

function nightChoiceId(s: GameState, strategy: Strategy): string | null {
  const event = currentNightEvent(s);
  if (!event) return null;
  const p = Math.max(1, total(s));
  let best: { id: string; score: number } | null = null;
  for (const option of event.choices.filter((x) => canAffordNightChoice(s, x))) {
    const preview = nightChoicePreview(s, event, option);
    const text = `${option.label} ${option.detail} ${preview.tags.join(' ')}`;
    let score = strategy.id === 'explorer' ? ({ safe: 3, stable: 5, risky: 2, severe: -10 }[preview.tone]) : ({ safe: 8, stable: 6, risky: -3, severe: -14 }[preview.tone]);
    if (/一定会有人死/.test(text)) score -= 40;
    if (/可能会有人死/.test(text)) score -= 15;
    if (/主灯保持熄灭|接受黑暗|主灯彻底熄灭/.test(text) && s.inventory.power > 10) score -= 25;
    if (/门墙可能受损/.test(text) && s.defense < strategy.defenseTarget) score -= 10;
    if (/人心可能再往下掉/.test(text) && s.hope < 25) score -= 10;
    if (/要用口粮/.test(text) && s.inventory.ration <= p * 2) score -= 9;
    if (/要用药品/.test(text) && s.inventory.medicine <= Math.max(1, injured(s))) score -= 10;
    if (/要用电力/.test(text) && s.inventory.power <= 18) score -= 8;
    if (strategy.id === 'explorer' && /救|找|确认|进去/.test(text)) score += 2;
    if (strategy.id === 'turtle' && /关|守|封|退|安静|等待/.test(text)) score += 3;
    if (!best || score > best.score) best = { id: option.id, score };
  }
  return best?.id ?? null;
}

const principleLabel: Record<StreetPrincipleId, string> = {
  'everyone-shares': '人人有份', 'triage-first': '先救伤得最重的', 'outward-search': '先顾出去找东西的人', 'core-leads': '熟手带头', 'community-shares-risk': '大家一起扛', 'preserve-strength': '先把人留下', 'hold-the-street': '守住这条街', 'prepare-evacuation': '准备离开', 'await-aid': '继续等声音',
};

async function handleAttention(page: Page, s: GameState, strategy: Strategy, r: Report): Promise<boolean> {
  const search = page.locator('.v6-missing-action:enabled').first();
  if (await visible(search)) { const text = (await search.textContent())?.trim().replace(/\s+/g, ' ') ?? '搜救'; await search.click(); log(r, s, '失踪搜救', text.slice(0, 70)); await page.waitForTimeout(40); return true; }
  if (await click(page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true }))) { log(r, s, '失踪搜救', '今天先继续'); return true; }

  const stage: 7 | 14 | 21 = s.day >= 21 ? 21 : s.day >= 14 ? 14 : 7;
  const principle = page.locator('.v6-principle-choice').filter({ hasText: principleLabel[strategy.principles[stage]] }).first();
  if (await visible(principle)) { await principle.click(); log(r, s, '原则', principleLabel[strategy.principles[stage]]); return true; }
  const anyPrinciple = page.locator('.v6-principle-choice').first();
  if (await visible(anyPrinciple)) { const text = (await anyPrinciple.locator('strong').textContent())?.trim() ?? '原则'; await anyPrinciple.click(); log(r, s, '原则', text); return true; }

  const card = page.locator('.v6-request-card').first();
  if (await visible(card)) {
    const request = pendingCommunityRequest(s);
    const accept = strategy.id === 'explorer' ? Boolean(request && ['search-missing', 'restore-defense', 'medical-care'].includes(request.kind)) : Boolean(request && ['medical-care', 'hot-meal', 'restore-defense', 'shelter'].includes(request.kind));
    await card.locator('button').filter({ hasText: accept ? '答应下来' : '不答应' }).first().click();
    log(r, s, '承诺', `${accept ? '答应' : '拒绝'} · ${request?.title ?? ''}`);
    return true;
  }
  return false;
}

async function handleDeparture(page: Page, s: GameState, strategy: Strategy, r: Report): Promise<boolean> {
  const panel = page.locator('.notebook-page--community-event').first();
  if (!await visible(panel)) return false;
  const p = Math.max(1, total(s));
  const keep = strategy.id === 'turtle' && s.inventory.ration >= p * 3;
  const keepButton = panel.locator('button:enabled').filter({ hasText: /口粮挽留/ }).first();
  if (keep && await visible(keepButton)) { await keepButton.click(); log(r, s, '居民离开', '拿口粮挽留'); }
  else { await panel.locator('button:enabled').filter({ hasText: '不再挽留' }).first().click(); log(r, s, '居民离开', '不再挽留'); }
  return true;
}

async function run(page: Page, strategy: Strategy): Promise<Report> {
  const r: Report = { strategy: strategy.name, days: [], decisions: [], runtimeErrors: [] };
  page.on('pageerror', (e) => r.runtimeErrors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, createV060InitialState(strategy.seed));
  const built = new Set<number>();
  let loggedDay = 0;

  for (let step = 0; step < 1800; step += 1) {
    const s = await saved(page);
    if (s.day !== loggedDay) {
      loggedDay = s.day;
      const row: DayRow = { day: s.day, total: total(s), ration: s.inventory.ration, medicine: s.inventory.medicine, materials: s.inventory.materials, parts: s.inventory.parts, defense: Math.round(s.defense), hope: s.hope, injured: injured(s), missing: s.survivors.filter((x) => x.condition === 'missing').length, deaths: s.campaignStats.deaths, expeditions: s.campaignStats.expeditions };
      r.days.push(row);
      console.log(`[adaptive:${strategy.name}] DAY ${row.day} total=${row.total} ration=${row.ration} med=${row.medicine} mat=${row.materials} parts=${row.parts} defense=${row.defense} hope=${row.hope} injured=${row.injured}`);
    }

    if (await visible(page.locator('.notebook-page--ending-v1'))) {
      const final = await saved(page);
      r.final = { ending: final.ending, finalHordeResult: final.finalHordeResult, population: total(final), deaths: final.campaignStats.deaths, expeditions: final.campaignStats.expeditions, rescued: final.campaignStats.rescued, visited: final.storyFlags.filter((x) => x.startsWith('visited:')).length, buildings: final.buildings, ration: final.inventory.ration, medicine: final.inventory.medicine, materials: final.inventory.materials, parts: final.inventory.parts, defense: final.defense, hope: final.hope };
      mkdirSync('test-results/human-playtest', { recursive: true });
      writeFileSync(`test-results/human-playtest/${strategy.id}-adaptive.json`, JSON.stringify(r, null, 2));
      console.log(`[adaptive-summary:${strategy.name}] ${JSON.stringify(r.final)}`);
      expect(final.day).toBe(30);
      expect(r.runtimeErrors).toEqual([]);
      return r;
    }

    if (await click(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;
    if (await handleDeparture(page, s, strategy, r)) continue;
    if (await handleAttention(page, s, strategy, r)) continue;

    if (await visible(page.locator('.v1-home-page'))) {
      if (!built.has(s.day)) { built.add(s.day); if (await upgradeOne(page, s, strategy, r)) continue; }
      await page.locator('.v1-day-action').click();
      await page.waitForTimeout(35);
      continue;
    }

    if (await visible(page.locator('.notebook-page--buildings')) && await click(page.getByRole('button', { name: '据点', exact: true }))) continue;

    if (await visible(page.locator('.notebook-page--survivors'))) {
      if (await assignNext(page, s, strategy, r)) continue;
      if (await click(page.locator('.v1s-done:enabled'))) { log(r, s, '派工确认', '名单确定'); continue; }
      const enabledJobCount = await page.locator('.v1s-jobs button:enabled').count();
      if (enabledJobCount > 0) { await click(page.getByRole('button', { name: '返回名单', exact: true })); continue; }
    }

    if (await visible(page.locator('.notebook-page--expedition-event'))) {
      const decision = expeditionDecision(s, strategy);
      const label = decision === 'push' ? '往里再走' : decision === 'careful' ? '贴着边找' : '马上回去';
      await page.locator('.v1e-decisions button').filter({ hasText: label }).first().click();
      log(r, s, '探索抉择', `${locationForId(s.expeditionState.locationId ?? '')?.name ?? '街外'} · ${label}`);
      continue;
    }

    if (await click(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '试一次', exact: true }))) continue;
    const reroll = page.getByRole('button', { name: '有人愿意替你再试一次', exact: true }).first();
    if (await visible(reroll) && s.pendingCheck?.dice && s.pendingCheck.outcome === 'failure') { await reroll.click(); log(r, s, '信任重掷', '失败后重试'); continue; }
    if (await click(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const id = nightChoiceId(s, strategy);
      const event = currentNightEvent(s);
      const option = event?.choices.find((x) => x.id === id);
      if (!option) throw new Error(`DAY ${s.day}: no affordable night option`);
      await page.locator('.v1n-choices button:enabled').filter({ hasText: option.label }).first().click();
      log(r, s, '夜间抉择', `${event?.title ?? '夜里'} · ${option.label}`);
      continue;
    }

    if (await click(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ }))) continue;

    const buttons = await page.locator('button:visible').allTextContents();
    const headings = await page.locator('h1:visible,h2:visible,h3:visible').allTextContents();
    throw new Error(`Adaptive human no progression action: ${JSON.stringify({ day: s.day, phase: s.phase, committed: s.dayState.committedSurvivorIds, buttons: buttons.slice(0, 15), headings: headings.slice(0, 10) })}`);
  }
  throw new Error(`${strategy.name} exceeded action budget`);
}

for (const strategy of STRATEGIES) {
  test(`${strategy.name} adapts through a full production run`, async ({ page }) => {
    test.setTimeout(240_000);
    const r = await run(page, strategy);
    expect(r.final).toBeTruthy();
  });
}
