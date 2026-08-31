import { createInitialState } from '../engine';
import { createDefaultDayState, createDefaultExpeditionState, createDefaultMealState, createDefaultNightState, normalizeV3Survivor } from '../foundation';
import { SURVIVOR_ROSTER, forecastFor } from '../progression';
import { nextRandom } from '../rng';
import type { CheckOutcome, FinalHordeResult, GameState, Survivor, SurvivorCondition } from '../types';
import { lockDayAssignments, unlockNextDayAssignments } from './dayManagement';
import { currentExpeditionEvent, expeditionRiskLabel, expeditionRiskScore, locationForId, resolveExpeditionOutcome, retreatExpedition } from './expedition';
import { resolveMeal } from './food';
import { resolveEnding } from './endings';

const STARTERS = ['lin-xia', 'zhou', 'ahe'];
const JOIN_DAYS: Record<number, string> = { 6: 'cheng', 12: 'aliang', 18: 'xiaoman' };
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

function rosterMember(id: string): Survivor | null {
  const source = SURVIVOR_ROSTER.find((item) => item.id === id);
  return source ? normalizeV3Survivor({ ...source, trust: source.trust ?? 1, condition: 'healthy' }) : null;
}

function withStarterRoster(state: GameState): GameState {
  if (state.survivors.length) return state;
  const survivors = STARTERS.map(rosterMember).filter((item): item is Survivor => Boolean(item));
  return { ...state, survivors };
}

export function createV060InitialState(seed = Date.now()): GameState {
  const legacy = createInitialState(seed);
  const base = withStarterRoster(legacy);
  return {
    ...base,
    phase: 'street',
    day: 1,
    inventory: { ration: 12, medicine: 3, power: 62, materials: 12, parts: 5 },
    supplies: 12,
    medicine: 3,
    power: 62,
    parts: 5,
    hope: 20,
    defense: 55,
    buildings: { searchStation: 1, workshop: 0, clinic: 0, watchPost: 0, shelter: 1, radio: 0 },
    searchStationRepaired: true,
    mainLightStage: 1,
    firstLightLevel: 2,
    forecast: forecastFor(1),
    dayAssignments: {},
    assignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    mealState: createDefaultMealState(),
    nightState: createDefaultNightState(),
    storyFlags: [...new Set([...(base.storyFlags ?? []), 'v060_started'])],
    pendingCheck: null,
    chapterComplete: false,
    finalHordeResult: undefined,
    ending: null,
    lastMessage: 'DAY 1 · 白天决定风险，晚上承担风险。',
  };
}

export function upgradeSaveToV060(input: GameState): GameState {
  if ((input.storyFlags ?? []).includes('v060_started')) return input;
  const base = withStarterRoster(input);
  const inventory = {
    ration: Math.max(base.inventory?.ration ?? 0, base.supplies ?? 0, 6),
    medicine: Math.max(base.inventory?.medicine ?? 0, base.medicine ?? 0, 2),
    power: Math.max(base.inventory?.power ?? 0, base.power ?? 0, 45),
    materials: Math.max(base.inventory?.materials ?? 0, Math.floor((base.parts ?? 0) / 2), 6),
    parts: Math.max(base.inventory?.parts ?? 0, base.parts ?? 0, 3),
  };
  const buildings = {
    ...base.buildings,
    searchStation: Math.max(1, Math.min(3, base.buildings.searchStation ?? 0)),
    shelter: Math.max(1, Math.min(3, base.buildings.shelter ?? 0)),
    workshop: Math.min(3, base.buildings.workshop ?? 0),
    clinic: Math.min(3, base.buildings.clinic ?? 0),
    watchPost: Math.min(3, base.buildings.watchPost ?? 0),
    radio: Math.min(3, base.buildings.radio ?? 0),
  };
  return {
    ...base,
    phase: base.day >= 30 ? 'ending' : 'street',
    inventory,
    supplies: inventory.ration,
    medicine: inventory.medicine,
    power: inventory.power,
    parts: inventory.parts,
    buildings,
    searchStationRepaired: true,
    dayAssignments: {},
    assignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    mealState: base.mealState ?? createDefaultMealState(),
    nightState: createDefaultNightState(),
    pendingCheck: null,
    storyFlags: [...new Set([...(base.storyFlags ?? []), 'v060_started'])],
    lastMessage: '存档已迁移到 v0.6 · 七格物资已并入街区库存。',
  };
}

function spendEnergyForJobs(state: GameState): GameState {
  const cost: Record<string, number> = { expedition: 0, repair: 9, medical: 7, watch: 9, radio: 7, cook: 8, rest: -24 };
  const survivors = state.survivors.map((survivor) => {
    if (survivor.condition === 'dead' || survivor.condition === 'missing') return survivor;
    const job = state.dayAssignments[survivor.id] ?? 'rest';
    const delta = cost[job] ?? 0;
    const energy = clamp(survivor.energy - delta);
    let condition = survivor.condition;
    if (job === 'rest' && condition === 'fatigued' && energy >= 55) condition = 'healthy';
    if (job !== 'rest' && energy < 25 && condition === 'healthy') condition = 'fatigued';
    return { ...survivor, energy, condition };
  });
  return { ...state, survivors };
}

function medicalStep(condition: SurvivorCondition | undefined): SurvivorCondition {
  if (condition === 'critical') return 'serious';
  if (condition === 'serious') return 'minor';
  if (condition === 'minor' || condition === 'fatigued') return 'healthy';
  return condition ?? 'healthy';
}

function resolveMedicalWork(state: GameState): GameState {
  const workers = state.survivors.filter((s) => state.dayAssignments[s.id] === 'medical' && s.condition !== 'dead' && s.condition !== 'missing').length;
  if (!workers || state.buildings.clinic <= 0) return state;
  const severity: Record<string, number> = { critical: 4, serious: 3, minor: 2, fatigued: 1, healthy: 0 };
  const candidates = state.survivors
    .filter((s) => s.condition !== 'dead' && s.condition !== 'missing' && (severity[s.condition ?? 'healthy'] ?? 0) > 0)
    .sort((a, b) => (severity[b.condition ?? 'healthy'] ?? 0) - (severity[a.condition ?? 'healthy'] ?? 0));
  if (!candidates.length) return state;
  let medicine = state.inventory.medicine;
  const treated = new Set<string>();
  const maxTreat = Math.min(workers, state.buildings.clinic >= 3 ? 2 : 1);
  for (const survivor of candidates.slice(0, maxTreat)) {
    if (medicine <= 0 && (survivor.condition === 'serious' || survivor.condition === 'critical')) continue;
    if (survivor.condition === 'serious' || survivor.condition === 'critical') medicine -= 1;
    treated.add(survivor.id);
  }
  if (!treated.size) return state;
  return {
    ...state,
    inventory: { ...state.inventory, medicine },
    medicine,
    survivors: state.survivors.map((s) => treated.has(s.id) ? { ...s, condition: medicalStep(s.condition) } : s),
  };
}

function resolveRadioWork(state: GameState): GameState {
  const staffed = state.survivors.some((s) => state.dayAssignments[s.id] === 'radio' && s.condition !== 'dead' && s.condition !== 'missing');
  if (!staffed || state.buildings.radio <= 0) return state;
  const flags = new Set(state.storyFlags ?? []);
  flags.add(`radio_contact_day:${state.day}`);
  const radioDays = [...flags].filter((value) => value.startsWith('radio_contact_day:')).length;
  let rescued = state.campaignStats.rescued;
  if (state.buildings.radio >= 2 && radioDays >= 2) flags.add('external_contact');
  if (state.buildings.radio >= 3 && radioDays >= 4) flags.add('military_contact');
  if (state.buildings.radio >= 2 && radioDays % 3 === 0 && !flags.has(`radio_rescue:${state.day}`)) {
    flags.add(`radio_rescue:${state.day}`);
    rescued += 1;
  }
  return { ...state, storyFlags: [...flags], campaignStats: { ...state.campaignStats, rescued }, hope: clamp(state.hope + 1) };
}

export function finalizeDay(state: GameState): GameState {
  if (state.expeditionState.departed) return { ...state, lastMessage: '搜索队还没有回来。' };
  let next = state.dayState.assignmentsLocked ? state : lockDayAssignments(state);
  next = spendEnergyForJobs(next);
  const watch = Object.values(next.dayAssignments).filter((job) => job === 'watch').length;
  const repair = Object.values(next.dayAssignments).filter((job) => job === 'repair').length;
  next = { ...next, defense: clamp((next.defense ?? 50) + watch * 4 + repair * 2) };
  next = resolveMedicalWork(next);
  next = resolveRadioWork(next);
  next = resolveMeal(next);
  return {
    ...next,
    phase: 'night',
    nightState: createDefaultNightState(next.day >= 20 ? 6 : 5),
    pendingCheck: null,
    lastMessage: `NIGHT ${next.day} · 今日岗位已经锁定。`,
  };
}

function addBonusLoot(state: GameState, amount: number): GameState {
  const location = state.expeditionState.locationId ? locationForId(state.expeditionState.locationId) : undefined;
  if (!location || amount <= 0) return state;
  const inventory = { ...state.inventory, [location.primary]: state.inventory[location.primary] + amount };
  return { ...state, inventory, supplies: inventory.ration, medicine: inventory.medicine, parts: inventory.parts };
}

export type ExpeditionStance = 'push' | 'careful';

export function resolveExpeditionStance(state: GameState, stance: ExpeditionStance): GameState {
  if (!state.expeditionState.departed) return state;
  let rngState = state.rngState;
  const [a, nextA] = nextRandom(rngState); rngState = nextA;
  const [b, nextB] = nextRandom(rngState); rngState = nextB;
  const dice = [Math.floor(a * 6) + 1, Math.floor(b * 6) + 1];
  const risk = expeditionRiskLabel(expeditionRiskScore(state, state.expeditionState.activePartyIds, state.expeditionState.locationId ?? ''));
  const riskModifier = risk === 'safe' ? 2 : risk === 'cautious' ? 1 : risk === 'dangerous' ? 0 : -1;
  const mealModifier = state.mealState.wellFed ? 1 : 0;
  const stanceModifier = stance === 'careful' ? 1 : -1;
  const total = dice[0] + dice[1] + riskModifier + mealModifier + stanceModifier;
  const twist = dice[0] === 6 && dice[1] === 6 ? 'double-six' : dice[0] === 1 && dice[1] === 1 ? 'double-one' : undefined;
  const outcome: CheckOutcome = twist === 'double-one' ? 'failure' : twist === 'double-six' ? 'critical' : total <= 6 ? 'failure' : total <= 9 ? 'partial' : total <= 11 ? 'success' : 'critical';
  const event = currentExpeditionEvent(state);
  let next = resolveExpeditionOutcome({ ...state, rngState }, outcome, twist);
  if (stance === 'push' && (outcome === 'success' || outcome === 'critical')) next = addBonusLoot(next, 2);
  if (event?.tags.includes('rescue') && outcome !== 'failure') {
    const rescueFlag = `expedition_rescue:${state.day}:${event.id}`;
    const already = (next.storyFlags ?? []).includes(rescueFlag);
    next = {
      ...next,
      storyFlags: [...new Set([...(next.storyFlags ?? []), rescueFlag])],
      campaignStats: { ...next.campaignStats, rescued: next.campaignStats.rescued + (already ? 0 : 1) },
    };
  }
  if (state.expeditionState.locationId === 'subway' && outcome !== 'failure') next = { ...next, storyFlags: [...new Set([...(next.storyFlags ?? []), 'subway_exit_known', 'evacuation_route_known'])] };
  if (state.expeditionState.locationId === 'bus-station' && outcome !== 'failure') next = { ...next, storyFlags: [...new Set([...(next.storyFlags ?? []), 'evacuation_route_known'])] };
  return { ...next, lastMessage: `${next.lastMessage} · 2D6 ${dice.join('+')} ${total >= 0 ? '=' : ''}${total}` };
}

export function retreatCurrentExpedition(state: GameState): GameState { return retreatExpedition(state); }

export function finalHordeResultFor(state: GameState): FinalHordeResult {
  const alive = state.survivors.filter((s) => s.condition !== 'dead' && s.condition !== 'missing').length;
  const severe = state.survivors.filter((s) => s.condition === 'critical' || s.condition === 'serious').length;
  const defense = state.defense ?? 0;
  if (defense >= 78 && state.hope >= 55 && severe === 0 && alive >= 4) return 'perfect';
  if (defense >= 52 && state.hope >= 30 && alive >= 3) return 'held';
  if (defense >= 24 && alive >= 2) return 'damaged';
  return 'breached';
}

function recruitForDay(state: GameState, day: number): GameState {
  const id = JOIN_DAYS[day];
  if (!id || state.survivors.some((s) => s.id === id)) return state;
  const member = rosterMember(id);
  if (!member) return state;
  return { ...state, survivors: [...state.survivors, member], hope: clamp(state.hope + 3), lastMessage: `${member.name}加入了余烬长街。` };
}

export function advanceCampaignDay(state: GameState): GameState {
  if (state.day >= 29) {
    const finalHordeResult = finalHordeResultFor(state);
    const endingState = { ...state, day: 30, finalHordeResult, phase: 'ending' as const, chapterComplete: true };
    const ending = resolveEnding(endingState);
    return { ...endingState, ending, lastMessage: `DAY 30 · ${ending.title}` };
  }
  const day = state.day + 1;
  let next: GameState = {
    ...state,
    day,
    phase: 'street',
    forecast: forecastFor(day),
    dayAssignments: {},
    assignments: {},
    dayState: createDefaultDayState(),
    expeditionState: createDefaultExpeditionState(),
    nightState: createDefaultNightState(day >= 20 ? 6 : 5),
    pendingCheck: null,
    catFedToday: false,
    lastMessage: `DAY ${day} · 新的一天开始了。`,
  };
  next = unlockNextDayAssignments(next);
  next = recruitForDay(next, day);
  return next;
}
