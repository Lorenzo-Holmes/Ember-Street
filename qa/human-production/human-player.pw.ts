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

interface HumanStrategy {
  id: 'balanced' | 'explorer' | 'turtle';
  name: string;
  seed: number;
  defenseTarget: number;
  expeditionBias: number;
  dangerPenalty: number;
  principle: Record<7 | 14 | 21, StreetPrincipleId>;
  buildingBase: BuildingId[];
}

const STRATEGIES: HumanStrategy[] = [
  {
    id: 'balanced', name: '均衡求生者', seed: 999401, defenseTarget: 52, expeditionBias: 1.0, dangerPenalty: 1.15,
    principle: { 7: 'everyone-shares', 14: 'community-shares-risk', 21: 'prepare-evacuation' },
    buildingBase: ['workshop', 'clinic', 'watchPost', 'shelter', 'searchStation', 'radio'],
  },
  {
    id: 'explorer', name: '积极探索者', seed: 999401, defenseTarget: 42, expeditionBias: 1.8, dangerPenalty: 0.6,
    principle: { 7: 'outward-search', 14: 'core-leads', 21: 'prepare-evacuation' },
    buildingBase: ['searchStation', 'clinic', 'workshop', 'radio', 'shelter', 'watchPost'],
  },
  {
    id: 'turtle', name: '龟缩建设者', seed: 999401, defenseTarget: 66, expeditionBias: 0.35, dangerPenalty: 2.0,
    principle: { 7: 'triage-first', 14: 'preserve-strength', 21: 'hold-the-street' },
    buildingBase: ['watchPost', 'workshop', 'shelter', 'clinic', 'radio', 'searchStation'],
  },
];

interface DaySnapshot {
  day: number;
  present: number;
  civilians: number;
  total: number;
  ration: number;
  medicine: number;
  power: number;
  materials: number;
  parts: number;
  defense: number;
  hope: number;
  injured: number;
  missing: number;
  deaths: number;
  expeditions: number;
  rescued: number;
  buildingSum: number;
}

interface DecisionLog { day: number; type: string; detail: string; }
interface DayPlan { jobs: Record<string, DayAssignment>; routeId: string | null; partyIds: string[]; }

interface HumanReport {
  strategy: string;
  seed: number;
  snapshots: DaySnapshot[];
  decisions: DecisionLog[];
  final?: {
    endingId: string | null;
    endingTitle: string | null;
    tier: string | null;
    finalHordeResult: string | null;
    population: number;
    deaths: number;
    expeditions: number;
    rescued: number;
    visitedLocations: number;
    buildings: GameState['buildings'];
  };
  runtimeErrors: string[];
}

async function visible(locator: Locator): Promise<boolean> {
  return locator.isVisible().catch(() => false);
}

async function clickIfVisible(locator: Locator): Promise<boolean> {
  if (!await visible(locator)) return false;
  await locator.click();
  await locator.page().waitForTimeout(45);
  return true;
}

async function savedState(page: Page): Promise<GameState> {
  return page.evaluate((saveKey) => JSON.parse(localStorage.getItem(saveKey) ?? 'null'), SAVE_KEY);
}

async function installState(page: Page, state: GameState) {
  await page.goto('/');
  await page.evaluate(({ saveKey, activeKey, gameState }) => {
    localStorage.clear();
    localStorage.setItem(saveKey, JSON.stringify(gameState));
    localStorage.setItem(activeKey, String(Date.now()));
  }, { saveKey: SAVE_KEY, activeKey: ACTIVE_KEY, gameState: state });
  await page.reload();
  await continueSavedSessionFromTitle(page);
}

function presentCore(state: GameState): Survivor[] {
  return state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing');
}

function population(state: GameState): number {
  return presentCore(state).length + Math.max(0, state.civilianResidents);
}

function injuredCount(state: GameState): number {
  return presentCore(state).filter((s) => ['minor', 'serious', 'critical'].includes(s.condition ?? '')).length;
}

function snapshot(state: GameState): DaySnapshot {
  const present = presentCore(state).length;
  return {
    day: state.day,
    present,
    civilians: state.civilianResidents,
    total: present + state.civilianResidents,
    ration: state.inventory.ration,
    medicine: state.inventory.medicine,
    power: state.inventory.power,
    materials: state.inventory.materials,
    parts: state.inventory.parts,
    defense: Math.round(state.defense),
    hope: state.hope,
    injured: injuredCount(state),
    missing: state.survivors.filter((s) => s.condition === 'missing').length,
    deaths: state.campaignStats.deaths,
    expeditions: state.campaignStats.expeditions,
    rescued: state.campaignStats.rescued,
    buildingSum: Object.values(state.buildings).reduce((sum, value) => sum + value, 0),
  };
}

function logDecision(report: HumanReport, state: GameState, type: string, detail: string) {
  report.decisions.push({ day: state.day, type, detail });
  console.log(`[human:${report.strategy}] DAY ${state.day} ${type}: ${detail}`);
}

function buildingPriority(state: GameState, strategy: HumanStrategy): BuildingId[] {
  const dynamic: BuildingId[] = [];
  if (injuredCount(state) > 0 || state.inventory.medicine <= 2) dynamic.push('clinic');
  if (state.defense < strategy.defenseTarget) dynamic.push('workshop', 'watchPost');
  if (state.civilianResidents > 0) dynamic.push('shelter');
  if (strategy.id === 'explorer') dynamic.push('searchStation');
  if (state.day >= 10) dynamic.push('radio');
  return [...new Set([...dynamic, ...strategy.buildingBase])];
}

function resourceWeights(state: GameState): Record<'ration' | 'medicine' | 'materials' | 'parts', number> {
  const pop = Math.max(1, population(state));
  const injured = injuredCount(state);
  return {
    ration: state.inventory.ration < pop * 2 ? 8 : state.inventory.ration < pop * 4 ? 5 : 2,
    medicine: state.inventory.medicine <= Math.max(2, injured) ? 7 : 2,
    materials: state.inventory.materials < 8 ? 5 : 2,
    parts: state.inventory.parts < 5 ? 5 : 2,
  };
}

function expeditionCountFor(state: GameState, strategy: HumanStrategy, candidates: Survivor[]): number {
  if (!candidates.length || state.buildings.searchStation <= 0) return 0;
  const pop = Math.max(1, population(state));
  const foodCritical = state.inventory.ration < pop * 2;
  const medicineCritical = state.inventory.medicine <= 1 && injuredCount(state) > 0;
  const constructionCritical = state.inventory.materials < 5 || state.inventory.parts < 2;
  if (strategy.id === 'explorer') return Math.min(candidates.length, candidates.length >= 2 ? 2 : 1);
  if (strategy.id === 'turtle') return foodCritical || medicineCritical || (constructionCritical && state.defense < 45) ? 1 : 0;
  const needTrip = foodCritical || medicineCritical || constructionCritical || state.day % 2 === 0;
  if (!needTrip) return 0;
  return Math.min(candidates.length, foodCritical && candidates.length >= 3 ? 2 : 1);
}

function chooseRoute(state: GameState, partyIds: string[], strategy: HumanStrategy): string | null {
  const weights = resourceWeights(state);
  const candidates = availableExpeditionLocations(state);
  if (!candidates.length) return null;
  let best: { id: string; score: number } | null = null;
  for (const location of candidates) {
    const riskScore = expeditionRiskScore(state, partyIds, location.id);
    const risk = expeditionRiskLabel(riskScore);
    const visited = state.storyFlags.includes(`visited:${location.id}`);
    const resource = weights[location.primary] * 3
      + weights[location.secondary] * 1.4
      + (location.tertiary ? weights[location.tertiary] * 0.6 : 0);
    const discovery = visited ? 0 : strategy.id === 'explorer' ? 9 : strategy.id === 'balanced' ? 4 : 1;
    const danger = riskScore * strategy.dangerPenalty;
    const riskGate = strategy.id === 'turtle' && (risk === 'dangerous' || risk === 'extreme') ? 12 : 0;
    const score = resource * strategy.expeditionBias + discovery - danger - riskGate;
    if (!best || score > best.score) best = { id: location.id, score };
  }
  return best?.id ?? candidates[0].id;
}

function chooseExpeditionParty(state: GameState, strategy: HumanStrategy): Survivor[] {
  const candidates = state.survivors
    .filter(survivorAvailableForDay)
    .filter((s) => !['minor', 'serious', 'critical'].includes(s.condition ?? ''))
    .filter((s) => s.energy >= (strategy.id === 'explorer' ? 38 : 45))
    .sort((a, b) => {
      const specialtyA = a.specialty === 'search' ? 15 : a.specialty === 'watch' ? 7 : 0;
      const specialtyB = b.specialty === 'search' ? 15 : b.specialty === 'watch' ? 7 : 0;
      return (b.energy + specialtyB) - (a.energy + specialtyA);
    });
  const count = expeditionCountFor(state, strategy, candidates);
  return candidates.slice(0, count);
}

function planDay(state: GameState, strategy: HumanStrategy): DayPlan {
  const jobs: Record<string, DayAssignment> = {};
  const available = state.survivors.filter(survivorAvailableForDay);
  const party = chooseExpeditionParty(state, strategy);
  const partySet = new Set(party.map((s) => s.id));
  const routeId = party.length ? chooseRoute(state, party.map((s) => s.id), strategy) : null;
  for (const survivor of party) jobs[survivor.id] = 'expedition';

  const remaining = available.filter((s) => !partySet.has(s.id));
  const use = (job: DayAssignment, predicate: (s: Survivor) => boolean = () => true): boolean => {
    const survivor = remaining
      .filter((s) => !jobs[s.id] && predicate(s))
      .sort((a, b) => b.energy - a.energy)[0];
    if (!survivor) return false;
    if (!canTakeDayAssignment(state, survivor.id, job).allowed) return false;
    jobs[survivor.id] = job;
    return true;
  };

  const injured = injuredCount(state);
  if (injured > 0 && state.buildings.clinic > 0) use('medical', (s) => s.condition === 'healthy' && s.energy >= 35);
  if (state.defense < strategy.defenseTarget && state.buildings.watchPost > 0) use('watch', (s) => s.energy >= 35);
  if (state.defense < strategy.defenseTarget + 8 && state.buildings.workshop > 0) use('repair', (s) => s.energy >= 35);
  if (state.inventory.ration < Math.max(2, population(state) * 2)) use('cook', (s) => s.energy >= 28);
  if (state.buildings.radio > 0 && state.day % (strategy.id === 'explorer' ? 2 : 3) === 0) use('radio', (s) => s.energy >= 32);

  for (const survivor of remaining) {
    if (jobs[survivor.id]) continue;
    if (survivor.energy < 42 || survivor.condition === 'fatigued' || survivor.condition === 'serious') jobs[survivor.id] = 'rest';
    else if (strategy.id === 'turtle' && state.buildings.watchPost > 0 && canTakeDayAssignment(state, survivor.id, 'watch').allowed) jobs[survivor.id] = 'watch';
    else if (state.inventory.ration < population(state) * 3) jobs[survivor.id] = 'cook';
    else jobs[survivor.id] = 'rest';
  }
  return { jobs, routeId, partyIds: party.map((s) => s.id) };
}

async function maybeUpgradeBuilding(page: Page, state: GameState, strategy: HumanStrategy, report: HumanReport): Promise<boolean> {
  const chosen = buildingPriority(state, strategy).find((id) => canUpgradeBuilding(state, id).allowed);
  if (!chosen) return false;
  const nav = page.getByRole('button', { name: '建筑', exact: true });
  if (!await clickIfVisible(nav)) return false;
  const name = V060_BUILDINGS[chosen].name;
  const article = page.locator('.v1-building').filter({ hasText: name });
  const summary = article.locator('.v1-building__summary');
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
  const action = article.locator('.v1-primary-action:enabled');
  if (!await visible(action)) {
    await clickIfVisible(page.getByRole('button', { name: '据点', exact: true }));
    return false;
  }
  const before = state.buildings[chosen];
  await action.click();
  logDecision(report, state, '建筑', `${name} ${before}→${before + 1}`);
  await page.waitForTimeout(60);
  return true;
}

async function maybeSetCommunityMode(page: Page, state: GameState, strategy: HumanStrategy, report: HumanReport): Promise<boolean> {
  if (!await visible(page.locator('.v1-community__choices'))) return false;
  let label = '后勤';
  if (strategy.id === 'turtle') label = state.defense < strategy.defenseTarget ? '守备' : '维修';
  else if (strategy.id === 'balanced') label = state.inventory.ration < population(state) * 2 ? '后勤' : state.defense < 45 ? '守备' : '维修';
  else label = state.inventory.ration < population(state) * 2 ? '后勤' : '维修';
  const button = page.locator('.v1-community__choices button').filter({ hasText: label });
  if (!await visible(button) || await button.isDisabled()) return false;
  await button.click();
  logDecision(report, state, '居民轮值', label);
  await page.waitForTimeout(45);
  return true;
}

async function assignOnePlannedJob(page: Page, state: GameState, plan: DayPlan, report: HumanReport): Promise<boolean> {
  const survivor = state.survivors.find((s) => survivorAvailableForDay(s) && plan.jobs[s.id] && !state.dayAssignments[s.id]);
  if (!survivor) return false;
  const planned = plan.jobs[survivor.id];
  const card = page.locator('.v1s-list article').filter({ hasText: survivor.name });
  const open = card.locator('button:enabled');
  if (!await visible(open)) return false;
  await open.click();
  const jobButton = page.locator('.v1s-jobs button').filter({ hasText: JOB_LABEL[planned] }).first();
  let actual = planned;
  if (!await visible(jobButton) || await jobButton.isDisabled()) actual = 'rest';
  const actualButton = page.locator('.v1s-jobs button').filter({ hasText: JOB_LABEL[actual] }).first();
  await expect(actualButton).toBeEnabled();
  await actualButton.click();
  await page.waitForTimeout(45);

  if (actual === 'expedition') {
    const preferred = plan.routeId ? locationForId(plan.routeId)?.name : null;
    let locationButton = preferred ? page.locator('.v1e-location').filter({ hasText: preferred }) : page.locator('.v1e-location:enabled').first();
    if (!await visible(locationButton) || await locationButton.isDisabled()) locationButton = page.locator('.v1e-location:enabled').first();
    await expect(locationButton).toBeVisible();
    const routeName = (await locationButton.locator('strong').first().textContent())?.trim() ?? preferred ?? '未知地点';
    await locationButton.click();
    await page.locator('.v1e-primary:enabled').click();
    logDecision(report, state, '人员', `${survivor.name}→探索→${routeName}`);
  } else {
    logDecision(report, state, '人员', `${survivor.name}→${JOB_LABEL[actual]}`);
  }
  await page.waitForTimeout(45);
  return true;
}

function expeditionDecision(state: GameState, strategy: HumanStrategy): 'push' | 'careful' | 'retreat' {
  const locationId = state.expeditionState.locationId;
  if (!locationId) return 'retreat';
  const risk = expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, locationId));
  if (strategy.id === 'explorer') {
    if (risk === 'safe' || risk === 'cautious') return 'push';
    if (risk === 'dangerous' && state.expeditionState.activePartyIds.length >= 2 && state.day < 20) return 'careful';
    return 'retreat';
  }
  if (strategy.id === 'turtle') return risk === 'safe' ? 'careful' : 'retreat';
  if (risk === 'safe') return 'push';
  if (risk === 'cautious' || risk === 'dangerous') return 'careful';
  return 'retreat';
}

function chooseNightChoiceId(state: GameState, strategy: HumanStrategy): string | null {
  const event = currentNightEvent(state);
  if (!event) return null;
  const pop = Math.max(1, population(state));
  const choices = event.choices.filter((choice) => canAffordNightChoice(state, choice));
  if (!choices.length) return null;
  let best: { id: string; score: number; detail: string } | null = null;
  for (const choice of choices) {
    const preview = nightChoicePreview(state, event, choice);
    const tags = preview.tags.join('；');
    const text = `${choice.label} ${choice.detail} ${tags}`;
    const toneScore = strategy.id === 'explorer'
      ? { safe: 2, stable: 3, risky: 5, severe: -3 }[preview.tone]
      : strategy.id === 'turtle'
        ? { safe: 7, stable: 6, risky: -2, severe: -12 }[preview.tone]
        : { safe: 5, stable: 7, risky: 1, severe: -9 }[preview.tone];
    let score = toneScore;
    if (text.includes('一定会有人死')) score -= 30;
    if (text.includes('可能会有人死')) score -= strategy.id === 'explorer' ? 5 : 12;
    if (text.includes('更有把握')) score += 4;
    if (text.includes('把握很低')) score -= 5;
    if (text.includes('可能受伤')) score -= strategy.id === 'explorer' ? 1 : 4;
    if (text.includes('门墙可能受损') && state.defense < strategy.defenseTarget) score -= 8;
    if (text.includes('人心可能再往下掉') && state.hope < 20) score -= 8;
    if (text.includes('要用口粮') && state.inventory.ration <= pop * 2) score -= 7;
    if (text.includes('要用药品') && state.inventory.medicine <= Math.max(1, injuredCount(state))) score -= 8;
    if (text.includes('要用电力') && state.inventory.power <= 18) score -= 7;
    if (strategy.id === 'turtle' && /关|守|封|退|稳|等/.test(text)) score += 3;
    if (strategy.id === 'explorer' && /找|冲|抢|救|进去|追/.test(text)) score += 2;
    if (strategy.id === 'balanced' && /救|稳|一起|留下|守/.test(text)) score += 2;
    if (!best || score > best.score) best = { id: choice.id, score, detail: `${choice.label} [${preview.tone}] ${tags}` };
  }
  return best?.id ?? choices[0].id;
}

async function handleAttention(page: Page, state: GameState, strategy: HumanStrategy, report: HumanReport): Promise<boolean> {
  const missingAction = page.locator('.v6-missing-action:enabled').first();
  if (await visible(missingAction)) {
    const text = (await missingAction.textContent())?.trim().replace(/\s+/g, ' ') ?? '尝试搜救';
    await missingAction.click();
    logDecision(report, state, '失踪搜救', text.slice(0, 80));
    await page.waitForTimeout(50);
    return true;
  }
  const missingContinue = page.getByRole('button', { name: '今天先到这里，安排其他人', exact: true });
  if (await clickIfVisible(missingContinue)) {
    logDecision(report, state, '失踪搜救', '今天先继续其他安排');
    return true;
  }

  const principle = state.day >= 21 ? strategy.principle[21] : state.day >= 14 ? strategy.principle[14] : strategy.principle[7];
  const principleLabel: Record<StreetPrincipleId, string> = {
    'everyone-shares': '人人有份', 'triage-first': '先救伤得最重的', 'outward-search': '先顾出去找东西的人',
    'core-leads': '熟手带头', 'community-shares-risk': '大家一起扛', 'preserve-strength': '先把人留下',
    'hold-the-street': '守住这条街', 'prepare-evacuation': '准备离开', 'await-aid': '继续等声音',
  };
  const principleButton = page.locator('.v6-principle-choice').filter({ hasText: principleLabel[principle] });
  if (await visible(principleButton)) {
    await principleButton.click();
    logDecision(report, state, '原则', principleLabel[principle]);
    await page.waitForTimeout(45);
    return true;
  }
  const anyPrinciple = page.locator('.v6-principle-choice').first();
  if (await visible(anyPrinciple)) {
    const text = (await anyPrinciple.locator('strong').textContent())?.trim() ?? '第一项';
    await anyPrinciple.click();
    logDecision(report, state, '原则', text);
    return true;
  }

  const request = pendingCommunityRequest(state);
  const accept = page.getByRole('button', { name: '答应下来', exact: true });
  const decline = page.getByRole('button', { name: '不答应', exact: true });
  if (await visible(accept) || await visible(decline)) {
    let shouldAccept = strategy.id === 'balanced';
    if (strategy.id === 'explorer') shouldAccept = Boolean(request && ['search-missing', 'restore-defense'].includes(request.kind));
    if (strategy.id === 'turtle') shouldAccept = Boolean(request && ['medical-care', 'hot-meal', 'restore-defense', 'shelter'].includes(request.kind));
    const button = shouldAccept && await visible(accept) ? accept : decline;
    await button.click();
    logDecision(report, state, '承诺', `${shouldAccept ? '答应' : '拒绝'}${request ? ` · ${request.title}` : ''}`);
    await page.waitForTimeout(45);
    return true;
  }
  return false;
}

async function handleCommunityDeparture(page: Page, state: GameState, strategy: HumanStrategy, report: HumanReport): Promise<boolean> {
  if (!await visible(page.locator('.notebook-page--community-event'))) return false;
  const keep = page.locator('.notebook-page--community-event button:enabled').filter({ hasText: /拿出.*口粮挽留/ }).first();
  const leave = page.getByRole('button', { name: /不再挽留/ });
  const pop = Math.max(1, population(state));
  const shouldKeep = strategy.id === 'balanced'
    ? state.inventory.ration >= pop * 2
    : strategy.id === 'turtle'
      ? state.inventory.ration >= pop * 3
      : false;
  if (shouldKeep && await visible(keep)) {
    await keep.click();
    logDecision(report, state, '居民离开', '拿出口粮挽留');
  } else {
    await leave.click();
    logDecision(report, state, '居民离开', '不再挽留');
  }
  await page.waitForTimeout(45);
  return true;
}

async function runHumanStrategy(page: Page, strategy: HumanStrategy): Promise<HumanReport> {
  const report: HumanReport = { strategy: strategy.name, seed: strategy.seed, snapshots: [], decisions: [], runtimeErrors: [] };
  page.on('pageerror', (error) => report.runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await installState(page, createV060InitialState(strategy.seed));

  const buildingHandled = new Set<number>();
  const communityHandled = new Set<number>();
  const plans = new Map<number, DayPlan>();
  let loggedDay = 0;

  for (let action = 0; action < 1600; action += 1) {
    const state = await savedState(page);
    if (state.day !== loggedDay) {
      loggedDay = state.day;
      const snap = snapshot(state);
      report.snapshots.push(snap);
      console.log(`[human:${strategy.name}] DAY ${snap.day} total=${snap.total} ration=${snap.ration} med=${snap.medicine} mat=${snap.materials} parts=${snap.parts} defense=${snap.defense} hope=${snap.hope} injured=${snap.injured}`);
    }

    if (await visible(page.locator('.notebook-page--ending-v1'))) {
      const final = await savedState(page);
      const finalPop = population(final);
      report.final = {
        endingId: final.ending?.id ?? null,
        endingTitle: final.ending?.title ?? null,
        tier: final.ending?.tier ?? null,
        finalHordeResult: final.finalHordeResult ?? null,
        population: finalPop,
        deaths: final.campaignStats.deaths,
        expeditions: final.campaignStats.expeditions,
        rescued: final.campaignStats.rescued,
        visitedLocations: final.storyFlags.filter((flag) => flag.startsWith('visited:')).length,
        buildings: final.buildings,
      };
      expect(final.day).toBe(30);
      expect(report.runtimeErrors).toEqual([]);
      mkdirSync('test-results/human-playtest', { recursive: true });
      writeFileSync(`test-results/human-playtest/${strategy.id}.json`, JSON.stringify(report, null, 2));
      console.log(`[human-summary:${strategy.name}] ending=${report.final.endingId}/${report.final.tier} pop=${finalPop} deaths=${report.final.deaths} expeditions=${report.final.expeditions} rescued=${report.final.rescued} visited=${report.final.visitedLocations} buildings=${Object.values(final.buildings).join(',')}`);
      return report;
    }

    if (await clickIfVisible(page.locator('.notebook-page--story-event .v1-phase-primary'))) continue;
    if (await handleCommunityDeparture(page, state, strategy, report)) continue;
    if (await handleAttention(page, state, strategy, report)) continue;

    if (await visible(page.locator('.v1-home-page'))) {
      if (!buildingHandled.has(state.day)) {
        buildingHandled.add(state.day);
        if (await maybeUpgradeBuilding(page, state, strategy, report)) continue;
      }
      if (!communityHandled.has(state.day)) {
        communityHandled.add(state.day);
        if (await maybeSetCommunityMode(page, state, strategy, report)) continue;
      }
      if (!plans.has(state.day)) {
        const plan = planDay(state, strategy);
        plans.set(state.day, plan);
        logDecision(report, state, '今日计划', `探索${plan.partyIds.length}人${plan.routeId ? `→${locationForId(plan.routeId)?.name}` : ''}`);
      }
      await page.locator('.v1-day-action').click();
      await page.waitForTimeout(45);
      continue;
    }

    if (await visible(page.locator('.notebook-page--buildings'))) {
      if (await clickIfVisible(page.getByRole('button', { name: '据点', exact: true }))) continue;
    }

    if (await visible(page.locator('.notebook-page--survivors'))) {
      const plan = plans.get(state.day) ?? planDay(state, strategy);
      plans.set(state.day, plan);
      if (await assignOnePlannedJob(page, state, plan, report)) continue;
      const done = page.locator('.v1s-done:enabled');
      if (await clickIfVisible(done)) {
        logDecision(report, state, '派工确认', '这张名单就这么定');
        continue;
      }
    }

    if (await visible(page.locator('.notebook-page--expedition-event'))) {
      const decision = expeditionDecision(state, strategy);
      const label = decision === 'push' ? '往里再走' : decision === 'careful' ? '贴着边找' : '马上回去';
      const button = page.locator('.v1e-decisions button').filter({ hasText: label });
      await expect(button).toBeVisible();
      await button.click();
      logDecision(report, state, '探索抉择', `${locationForId(state.expeditionState.locationId ?? '')?.name ?? '街外'} · ${label}`);
      await page.waitForTimeout(45);
      continue;
    }

    if (await clickIfVisible(page.getByRole('button', { name: '合上本子，等天黑', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: '关掉外面的灯', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: '试一次', exact: true }))) continue;

    const reroll = page.getByRole('button', { name: '有人愿意替你再试一次', exact: true });
    if (await visible(reroll) && state.pendingCheck?.dice) {
      const outcome = state.pendingCheck.outcome;
      const shouldReroll = strategy.id === 'explorer' ? outcome === 'failure' || outcome === 'partial' : outcome === 'failure';
      if (shouldReroll) {
        await reroll.click();
        logDecision(report, state, '信任重掷', `原结果 ${outcome}`);
        await page.waitForTimeout(45);
        continue;
      }
    }
    if (await clickIfVisible(page.getByRole('button', { name: '把结果记下', exact: true }))) continue;

    if (await visible(page.locator('.v1n-choices'))) {
      const choiceId = chooseNightChoiceId(state, strategy);
      const event = currentNightEvent(state);
      const choice = event?.choices.find((item) => item.id === choiceId);
      if (!choice) throw new Error(`Human player found no affordable night choice on DAY ${state.day}: ${event?.title ?? 'unknown event'}`);
      const button = page.locator('.v1n-choices button:enabled').filter({ hasText: choice.label });
      await expect(button).toBeVisible();
      await button.click();
      logDecision(report, state, '夜间抉择', `${event?.title ?? '夜里'} · ${choice.label}`);
      await page.waitForTimeout(45);
      continue;
    }

    if (await clickIfVisible(page.getByRole('button', { name: '等天亮再清点', exact: true }))) continue;
    if (await clickIfVisible(page.getByRole('button', { name: /翻到第 \d+ 天|翻到最后一页/ }))) continue;

    const buttons = await page.locator('button:visible').allTextContents();
    const headings = await page.locator('h1:visible,h2:visible,h3:visible').allTextContents();
    throw new Error(`Human player has no sensible progression action: ${JSON.stringify({ day: state.day, phase: state.phase, buttons: buttons.slice(0, 15), headings: headings.slice(0, 10) })}`);
  }
  throw new Error(`Human player exceeded action budget for ${strategy.name}`);
}

for (const strategy of STRATEGIES) {
  test(`${strategy.name} completes a real UI run`, async ({ page }) => {
    test.setTimeout(240_000);
    const report = await runHumanStrategy(page, strategy);
    expect(report.final).toBeTruthy();
    if (strategy.id === 'explorer') expect(report.final!.expeditions).toBeGreaterThan(5);
    if (strategy.id === 'turtle') expect(Object.values(report.final!.buildings).reduce((sum, value) => sum + value, 0)).toBeGreaterThan(3);
  });
}
