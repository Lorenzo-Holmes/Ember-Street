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

type StrategyId = 'balanced' | 'explorer' | 'turtle';
interface Strategy {
  id: StrategyId;
  name: string;
  seed: number;
  defenseTarget: number;
  buildings: BuildingId[];
  principles: Record<7 | 14 | 21, StreetPrincipleId>;
}

const STRATEGIES: Strategy[] = [
  { id: 'balanced', name: '均衡求生者', seed: 999401, defenseTarget: 52, buildings: ['workshop', 'clinic', 'watchPost', 'shelter', 'searchStation', 'radio'], principles: { 7: 'everyone-shares', 14: 'community-shares-risk', 21: 'prepare-evacuation' } },
  { id: 'explorer', name: '积极探索者', seed: 999401, defenseTarget: 42, buildings: ['searchStation', 'clinic', 'workshop', 'radio', 'shelter', 'watchPost'], principles: { 7: 'outward-search', 14: 'core-leads', 21: 'prepare-evacuation' } },
  { id: 'turtle', name: '龟缩建设者', seed: 999401, defenseTarget: 66, buildings: ['watchPost', 'workshop', 'shelter', 'clinic', 'radio', 'searchStation'], principles: { 7: 'triage-first', 14: 'preserve-strength', 21: 'hold-the-street' } },
];

interface Plan { jobs: Record<string, DayAssignment>; routeId: string | null; partyIds: string[]; }
interface DayLog { day: number; total: number; ration: number; medicine: number; materials: number; parts: number; defense: number; hope: number; injured: number; deaths: number; expeditions: number; }
interface Report { strategy: string; days: DayLog[]; decisions: Array<{ day: number; type: string; detail: string }>; runtimeErrors: string[]; final?: Record<string, unknown>; }

async function visible(locator: Locator): Promise<boolean> { return locator.first().isVisible().catch(() => false); }
async function click(locator: Locator): Promise<boolean> {
  const target = locator.first();
  if (!await visible(target)) return false;
  await target.click();
  await target.page().waitForTimeout(45);
  return true;
}
async function state(page: Page): Promise<GameState> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), SAVE_KEY); }
async function install(page: Page, gameState: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, value }) => {
    localStorage.clear();
    localStorage.setItem(saveKey, JSON.stringify(value));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, value: gameState });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

const present = (s: GameState) => s.survivors.filter((x) => x.condition !== 'dead' && x.condition !== 'missing');
const totalPopulation = (s: GameState) => present(s).length + Math.max(0, s.civilianResidents);
const injured = (s: GameState) => present(s).filter((x) => ['minor', 'serious', 'critical'].includes(x.condition ?? '')).length;
const log = (report: Report, s: GameState, type: string, detail: string) => {
  report.decisions.push({ day: s.day, type, detail });
  console.log(`[human:${report.strategy}] DAY ${s.day} ${type}: ${detail}`);
};

function buildingOrder(s: GameState, strategy: Strategy): BuildingId[] {
  const dynamic: BuildingId[] = [];
  if (injured(s) || s.inventory.medicine <= 2) dynamic.push('clinic');
  if (s.defense < strategy.defenseTarget) dynamic.push('workshop', 'watchPost');
  if (s.civilianResidents > 0) dynamic.push('shelter');
  if (strategy.id === 'explorer') dynamic.push('searchStation');
  if (s.day >= 10) dynamic.push('radio');
  return [...new Set([...dynamic, ...strategy.buildings])];
}

function expeditionCandidates(s: GameState, strategy: Strategy): Survivor[] {
  return s.survivors.filter(survivorAvailableForDay)
    .filter((x) => !['minor', 'serious', 'critical'].includes(x.condition ?? ''))
    .filter((x) => x.energy >= (strategy.id === 'explorer' ? 38 : 45))
    .sort((a, b) => (b.energy + (b.specialty === 'search' ? 15 : 0)) - (a.energy + (a.specialty === 'search' ? 15 : 0)));
}

function expeditionSize(s: GameState, strategy: Strategy, candidates: Survivor[]): number {
  if (!candidates.length || s.buildings.searchStation <= 0) return 0;
  const pop = Math.max(1, totalPopulation(s));
  const foodLow = s.inventory.ration < pop * 2;
  const medicineLow = s.inventory.medicine <= 1 && injured(s) > 0;
  const buildLow = s.inventory.materials < 5 || s.inventory.parts < 2;
  if (strategy.id === 'explorer') return Math.min(2, candidates.length);
  if (strategy.id === 'turtle') return foodLow || medicineLow || (buildLow && s.defense < 45) ? 1 : 0;
  return foodLow || medicineLow || buildLow || s.day % 2 === 0 ? Math.min(foodLow && candidates.length >= 3 ? 2 : 1, candidates.length) : 0;
}

function chooseRoute(s: GameState, partyIds: string[], strategy: Strategy): string | null {
  const pop = Math.max(1, totalPopulation(s));
  const weights = {
    ration: s.inventory.ration < pop * 2 ? 8 : s.inventory.ration < pop * 4 ? 5 : 2,
    medicine: s.inventory.medicine <= Math.max(2, injured(s)) ? 7 : 2,
    materials: s.inventory.materials < 8 ? 5 : 2,
    parts: s.inventory.parts < 5 ? 5 : 2,
  } as const;
  const locations = availableExpeditionLocations(s);
  let best: { id: string; score: number } | null = null;
  for (const location of locations) {
    const riskScore = expeditionRiskScore(s, partyIds, location.id);
    const resource = weights[location.primary] * 3 + weights[location.secondary] * 1.4 + (location.tertiary ? weights[location.tertiary] * 0.6 : 0);
    const discovery = s.storyFlags.includes(`visited:${location.id}`) ? 0 : strategy.id === 'explorer' ? 9 : strategy.id === 'balanced' ? 4 : 1;
    const penalty = riskScore * (strategy.id === 'explorer' ? 0.6 : strategy.id === 'turtle' ? 2 : 1.15);
    const score = resource * (strategy.id === 'explorer' ? 1.8 : strategy.id === 'turtle' ? 0.35 : 1) + discovery - penalty;
    if (!best || score > best.score) best = { id: location.id, score };
  }
  return best?.id ?? null;
}

function makePlan(s: GameState, strategy: Strategy): Plan {
  const jobs: Record<string, DayAssignment> = {};
  const candidates = expeditionCandidates(s, strategy);
  const party = candidates.slice(0, expeditionSize(s, strategy, candidates));
  const partySet = new Set(party.map((x) => x.id));
  const routeId = party.length ? chooseRoute(s, party.map((x) => x.id), strategy) : null;
  for (const x of party) jobs[x.id] = 'expedition';
  const remaining = s.survivors.filter(survivorAvailableForDay).filter((x) => !partySet.has(x.id));
  const use = (job: DayAssignment, predicate: (x: Survivor) => boolean = () => true) => {
    const candidate = remaining.filter((x) => !jobs[x.id] && predicate(x)).sort((a, b) => b.energy - a.energy)[0];
    if (candidate && canTakeDayAssignment(s, candidate.id, job).allowed) jobs[candidate.id] = job;
  };
  if (injured(s) && s.buildings.clinic > 0) use('medical', (x) => x.condition === 'healthy' && x.energy >= 35);
  if (s.defense < strategy.defenseTarget && s.buildings.watchPost > 0) use('watch', (x) => x.energy >= 35);
  if (s.defense < strategy.defenseTarget + 8 && s.buildings.workshop > 0) use('repair', (x) => x.energy >= 35);
  if (s.inventory.ration < Math.max(2, totalPopulation(s) * 2)) use('cook', (x) => x.energy >= 28);
  if (s.buildings.radio > 0 && s.day % (strategy.id === 'explorer' ? 2 : 3) === 0) use('radio', (x) => x.energy >= 32);
  for (const x of remaining) {
    if (jobs[x.id]) continue;
    if (x.energy < 42 || x.condition === 'fatigued' || x.condition === 'serious') jobs[x.id] = 'rest';
    else if (strategy.id === 'turtle' && s.buildings.watchPost > 0 && canTakeDayAssignment(s, x.id, 'watch').allowed) jobs[x.id] = 'watch';
    else if (s.inventory.ration < totalPopulation(s) * 3) jobs[x.id] = 'cook';
    else jobs[x.id] = 'rest';
  }
  return { jobs, routeId, partyIds: party.map((x) => x.id) };
}

async function upgradeOne(page: Page, s: GameState, strategy: Strategy, report: Report): Promise<boolean> {
  const id = buildingOrder(s, strategy).find((x) => canUpgradeBuilding(s, x).allowed);
  if (!id || !await click(page.getByRole('button', { name: '建筑', exact: true }))) return false;
  const article = page.locator('.v1-building').filter({ hasText: V060_BUILDINGS[id].name }).first();
  const summary = article.locator('.v1-building__summary');
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
  const action = article.locator('.v1-primary-action:enabled');
  if (!await visible(action)) { await click(page.getByRole('button', { name: '据点', exact: true })); return false; }
  await action.click();
  log(report, s, '建筑', `${V060_BUILDINGS[id].name} ${s.buildings[id]}→${s.buildings[id] + 1}`);
  await page.waitForTimeout(55);
  return true;
}

async function communityMode(page: Page, s: GameState, strategy: Strategy, report: Report): Promise<boolean> {
  if (!await visible(page.locator('.v1-community__choices'))) return false;
  const label = strategy.id === 'turtle'
    ? (s.defense < strategy.defenseTarget ? '守备' : '维修')
    : s.inventory.ration < totalPopulation(s) * 2 ? '后勤' : s.defense < 45 ? '守备' : '维修';
  const button = page.locator('.v1-community__choices button').filter({ hasText: label }).first();
  if (!await visible(button) || await button.isDisabled()) return false;
  await button.click();
  log(report, s, '居民轮值', label);
  await page.waitForTimeout(45);
  return true;
}

async function assignOne(page: Page, s: GameState, plan: Plan, report: Report): Promise<boolean> {
  const survivor = s.survivors.find((x) => survivorAvailableForDay(x) && plan.jobs[x.id] && !s.dayAssignments[x.id]);
  if (!survivor) return false;
  const card = page.locator('.v1s-list article').filter({ hasText: survivor.name }).first();
  await card.locator('button:enabled').click();
  let job = plan.jobs[survivor.id];
  let jobButton = page.locator('.v1s-jobs button').filter({ hasText: JOB_LABEL[job] }).first();
  if (!await visible(jobButton) || await jobButton.isDisabled()) { job = 'rest'; jobButton = page.locator('.v1s-jobs button').filter({ hasText: '休息' }).first(); }
  await expect(jobButton).toBeEnabled();
  await jobButton.click();
  await page.waitForTimeout(40);
  if (job === 'expedition') {
    const preferred = plan.routeId ? locationForId(plan.routeId)?.name : null;
    let locationButton = preferred ? page.locator('.v1e-location:enabled').filter({ hasText: preferred }).first() : page.locator('.v1e-location:enabled').first();
    if (!await visible(locationButton)) locationButton = page.locator('.v1e-location:enabled').first();
    const routeName = (await locationButton.locator('strong').first().textContent())?.trim() ?? '未知地点';
    await locationButton.click();
    await page.locator('.v1e-primary:enabled').click();
    log(report, s, '人员', `${survivor.name}→探索→${routeName}`);
  } else log(report, s, '人员', `${survivor.name}→${JOB_LABEL[job]}`);
  await page.waitForTimeout(45);
  return true;
}

function expeditionDecision(s: GameState, strategy: Strategy): 'push' | 'careful' | 'retreat' {
  const id = s.expeditionState.locationId;
  if (!id) return 'retreat';
  const risk = expeditionRiskLabel(expeditionRiskScore(s, s.expeditionState.activePartyIds, id));
  if (strategy.id === 'explorer') return risk === 'safe' || risk === 'cautious' ? 'push' : risk === 'dangerous' && s.expeditionState.activePartyIds.length >= 2 && s.day < 20 ? 'careful' : 'retreat';
  if (strategy.id === 'turtle') return risk === 'safe' ? 'careful' : 'retreat';
  return risk === 'safe' ? 'push' : risk === 'extreme' ? 'retreat' : 'careful';
}

function nightChoice(s: GameState, strategy: Strategy): string | null {
  const event = currentNightEvent(s);
  if (!event) return null;
  const pop = Math.max(1, totalPopulation(s));
  let best: { id: string; score: number } | null = null;
  for (const choice of event.choices.filter((x) => canAffordNightChoice(s, x))) {
    const preview = nightChoicePreview(s, event, choice);
    const text = `${choice.label} ${choice.detail} ${preview.tags.join(' ')}`;
    let score = strategy.id === 'explorer' ? ({ safe: 2, stable: 3, risky: 5, severe: -3 }[preview.tone]) : strategy.id === 'turtle' ? ({ safe: 7, stable: 6, risky: -2, severe: -12 }[preview.tone]) : ({ safe: 5, stable: 7, risky: 1, severe: -9 }[preview.tone]);
    if (text.includes('一定会有人死')) score -= 30;
    if (text.includes('可能会有人死')) score -= strategy.id === 'explorer' ? 5 : 12;
    if (text.includes('更有把握')) score += 4;
    if (text.includes('把握很低')) score -= 5;
    if (text.includes('门墙可能受损') && s.defense < strategy.defenseTarget) score -= 8;
    if (text.includes('人心可能再往下掉') && s.hope < 20) score -= 8;
    if (text.includes('要用口粮') && s.inventory.ration <= pop * 2) score -= 7;
    if (text.includes('要用药品') && s.inventory.medicine <= Math.max(1, injured(s))) score -= 8;
    if (text.includes('要用电力') && s.inventory.power <= 18) score -= 7;
    if (strategy.id === 'turtle' && /关|守|封|退|稳|等/.test(text)) score += 3;
    if (strategy.id === 'explorer' && /找|冲|抢|救|进去|追/.test(text)) score += 2;
    if (strategy.id === 'balanced' && /救|稳|一起|留下|守/.test(text)) score += 2;
    if (!best || score > best.score) best = { id: choice.id, score };
  }
  return best?.id ?? null;
}

const principleLabel: Record<StreetPrincipleId, string> = {
  'everyone-shares': '人人有份', 'triage-first': '先救伤得最重的', 'outward-search': '先顾出去找东西的人', 'core-leads': '熟手带头', 'community-shares-risk': '大家一起扛', 'preserve-strength': '先把人留下', 'hold-the-street': '守住这条街', 'prepare-evacuation': '准备离开', 'await-aid': '继续等声音',
};

async function attention(page: Page, s: GameState, strategy: Strategy, report: Report): Promise<boolean> {
  const search = page.locator('.v6-missing-action:enabled').first();
  if (await visible(search)) { const text = (await search.textContent())?.trim().replace(/\s+/g, ' ') ?? '搜救'; await search.click(); log(report, s, '失踪搜救', text.slice(0, 80)); await page.waitForTimeout(45); return true; }
  if (await click(page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true }).first())) { log(report, s, '失踪搜救', '今天先继续'); return true; }

  const stage: 7 | 14 | 21 = s.day >= 21 ? 21 : s.day >= 14 ? 14 : 7;
  const desired = page.locator('.v6-principle-choice').filter({ hasText: principleLabel[strategy.principles[stage]] }).first();
  if (await visible(desired)) { await desired.click(); log(report, s, '原则', principleLabel[strategy.principles[stage]]); await page.waitForTimeout(45); return true; }
  const anyPrinciple = page.locator('.v6-principle-choice').first();
  if (await visible(anyPrinciple)) { const text = (await anyPrinciple.locator('strong').textContent())?.trim() ?? '原则'; await anyPrinciple.click(); log(report, s, '原则', text); return true; }

  const requestCard = page.locator('.v6-request-card').first();
  if (await visible(requestCard)) {
    const request = pendingCommunityRequest(s);
    let accept = strategy.id === 'balanced';
    if (strategy.id === 'explorer') accept = Boolean(request && ['search-missing', 'restore-defense'].includes(request.kind));
    if (strategy.id === 'turtle') accept = Boolean(request && ['medical-care', 'hot-meal', 'restore-defense', 'shelter'].includes(request.kind));
    const button = requestCard.locator('button').filter({ hasText: accept ? '答应下来' : '不答应' }).first();
    await button.click();
    log(report, s, '承诺', `${accept ? '答应' : '拒绝'}${request ? ` · ${request.title}` : ''}`);
    await page.waitForTimeout(45);
    return true;
  }
  return false;
}

async function departure(page: Page, s: GameState, strategy: Strategy, report: Report): Promise<boolean> {
  const panel = page.locator('.notebook-page--community-event').first();
  if (!await visible(panel)) return false;
  const pop = Math.max(1, totalPopulation(s));
  const keep = strategy.id === 'balanced' ? s.inventory.ration >= pop * 2 : strategy.id === 'turtle' ? s.inventory.ration >= pop * 3 : false;
  const keepButton = panel.locator('button:enabled').filter({ hasText: /口粮挽留/ }).first();
  if (keep && await visible(keepButton)) { await keepButton.click(); log(report, s, '居民离开', '拿口粮挽留'); }
  else { await panel.locator('button:enabled').filter({ hasText: '不再挽留' }).first().click(); log(report, s, '居民离开', '不再挽留'); }
  await page.waitForTimeout(45);
  return true;
}

async function run(page: Page, strategy: Strategy): Promise<Report> {
  const report: Report = { strategy: strategy.name, days: [], decisions: [], runtimeErrors: [] };
  page.on('pageerror', (e) => report.runtimeErrors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await install(page, createV060InitialState(strategy.seed));
  const builtDays = new Set<number>();
  const communityDays = new Set<number>();
  const plans = new Map<number, Plan>();
  let loggedDay = 0;

  for (let action = 0; action < 1800; action += 1) {
    const s = await state(page);
    if (s.day !== loggedDay) {
      loggedDay = s.day;
      const entry: DayLog = { day: s.day, total: totalPopulation(s), ration: s.inventory.ration, medicine: s.inventory.medicine, materials: s.inventory.materials, parts: s.inventory.parts, defense: Math.round(s.defense), hope: s.hope, injured: injured(s), deaths: s.campaignStats.deaths, expeditions: s.campaignStats.expeditions };
      report.days.push(entry);
      console.log(`[human:${strategy.name}] DAY ${entry.day} total=${entry.total} ration=${entry.ration} med=${entry.medicine} mat=${entry.materials} parts=${entry.parts} defense=${entry.defense} hope=${entry.hope} injured=${entry.injured}`);
    }

    if (await visible(page.locator('.notebook-page--ending-v1'))) {
      const final = await state(page);
      report.final = { ending: final.ending, finalHordeResult: final.finalHordeResult, population: totalPopulation(final), deaths: final.campaignStats.deaths, expeditions: final.campaignStats.expeditions, rescued: final.campaignStats.rescued, visited: final.storyFlags.filter((f) => f.startsWith('visited:')).length, buildings: final.buildings, ration: final.inventory.ration, medicine: final.inventory.medicine, defense: final.defense, hope: final.hope };
      expect(final.day).toBe(30);
      expect(report.runtimeErrors).toEqual([]);
      mkdirSync('test-results/human-playtest', { recursive: true });
      writeFileSync(`test-results/human-playtest/${strategy.id}.json`, JSON.stringify(report, null, 2));
      console.log(`[human-summary:${strategy.name}] ${JSON.stringify(report.final)}`);
      return report;
    }

    if (await click(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;
    if (await departure(page, s, strategy, report)) continue;
    if (await attention(page, s, strategy, report)) continue;

    if (await visible(page.locator('.v1-home-page'))) {
      if (!builtDays.has(s.day)) { builtDays.add(s.day); if (await upgradeOne(page, s, strategy, report)) continue; }
      if (!communityDays.has(s.day)) { communityDays.add(s.day); if (await communityMode(page, s, strategy, report)) continue; }
      if (!plans.has(s.day)) { const plan = makePlan(s, strategy); plans.set(s.day, plan); log(report, s, '今日计划', `探索${plan.partyIds.length}人${plan.routeId ? `→${locationForId(plan.routeId)?.name}` : ''}`); }
      await page.locator('.v1-day-action').click();
      await page.waitForTimeout(45);
      continue;
    }

    if (await visible(page.locator('.notebook-page--buildings')) && await click(page.getByRole('button', { name: '据点', exact: true }))) continue;

    if (await visible(page.locator('.notebook-page--survivors'))) {
      const plan = plans.get(s.day) ?? makePlan(s, strategy); plans.set(s.day, plan);
      if (await assignOne(page, s, plan, report)) continue;
      if (await click(page.locator('.v1s-done:enabled'))) { log(report, s, '派工确认', '名单确定'); continue; }
    }

    if (await visible(page.locator('.notebook-page--expedition-event'))) {
      const decision = expeditionDecision(s, strategy);
      const label = decision === 'push' ? '往里再走' : decision === 'careful' ? '贴着边找' : '马上回去';
      await page.locator('.v1e-decisions button').filter({ hasText: label }).first().click();
      log(report, s, '探索抉择', `${locationForId(s.expeditionState.locationId ?? '')?.name ?? '街外'} · ${label}`);
      await page.waitForTimeout(45);
      continue;
    }

    if (await click(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: '试一次', exact: true }))) continue;

    const reroll = page.getByRole('button', { name: '有人愿意替你再试一次', exact: true }).first();
    if (await visible(reroll) && s.pendingCheck?.dice) {
      const outcome = s.pendingCheck.outcome;
      const should = strategy.id === 'explorer' ? outcome === 'failure' || outcome === 'partial' : outcome === 'failure';
      if (should) { await reroll.click(); log(report, s, '信任重掷', `原结果${outcome}`); await page.waitForTimeout(45); continue; }
    }
    if (await click(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const id = nightChoice(s, strategy);
      const event = currentNightEvent(s);
      const choice = event?.choices.find((x) => x.id === id);
      if (!choice) throw new Error(`DAY ${s.day} night has no affordable choice: ${event?.title ?? 'unknown'}`);
      await page.locator('.v1n-choices button:enabled').filter({ hasText: choice.label }).first().click();
      log(report, s, '夜间抉择', `${event?.title ?? '夜里'} · ${choice.label}`);
      await page.waitForTimeout(45);
      continue;
    }

    if (await click(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;
    if (await click(page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ }))) continue;

    const buttons = await page.locator('button:visible').allTextContents();
    const headings = await page.locator('h1:visible,h2:visible,h3:visible').allTextContents();
    throw new Error(`No human progression action: ${JSON.stringify({ day: s.day, phase: s.phase, buttons: buttons.slice(0, 15), headings: headings.slice(0, 10) })}`);
  }
  throw new Error(`${strategy.name} exceeded action budget`);
}

for (const strategy of STRATEGIES) {
  test(`${strategy.name} completes production as a human-like player`, async ({ page }) => {
    test.setTimeout(240_000);
    const report = await run(page, strategy);
    expect(report.final).toBeTruthy();
    if (strategy.id === 'explorer') expect(Number(report.final!.expeditions)).toBeGreaterThan(5);
    if (strategy.id === 'turtle') expect(Object.values(report.final!.buildings as Record<string, number>).reduce((a, b) => a + b, 0)).toBeGreaterThan(3);
  });
}
