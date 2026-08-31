import { makeOrder, NIGHT_DURATION_MS, RACK_COUNT, SLOT_COUNT } from './config';
import { BUILDING_META, forecastFor, survivorUnlockFor } from './progression';
import { nextRandom, normalizeSeed } from './rng';
import type { BuildingId, GameState, Order, Role, SupplyItem, SupplyKind, Survivor } from './types';

const KINDS: SupplyKind[] = ['ration', 'medical', 'battery'];
const ROLE_BUILDING: Partial<Record<Role, BuildingId>> = {
  search: 'searchStation', repair: 'workshop', medical: 'clinic', watch: 'watchPost', radio: 'radio', rest: 'shelter',
};

function nextKind(rngState: number): [SupplyKind, number] {
  const [value, next] = nextRandom(rngState);
  return [KINDS[Math.floor(value * KINDS.length) % KINDS.length], next];
}

function createFairQueue(rngState: number, groups = 12): [SupplyKind[], number] {
  const queue: SupplyKind[] = [];
  let state = rngState;
  for (let i = 0; i < groups; i += 1) {
    const [kind, next] = nextKind(state);
    state = next;
    queue.push(kind, kind, kind);
  }
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const [value, next] = nextRandom(state);
    state = next;
    const j = Math.floor(value * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  return [queue, state];
}

function countRole(state: GameState, role: Role): number {
  return Object.values(state.assignments).filter((item) => item === role).length;
}

function prepareOrder(state: GameState, index: number, kind: SupplyKind, orderKind?: 'survivor' | 'defense'): Order {
  const base = makeOrder(index, kind, orderKind);
  const cookBonus = countRole(state, 'cook') * 1_500;
  const dayPenalty = Math.max(0, state.forecast.intensity - 1) * 700;
  const patience = Math.max(9_000, base.patienceMs + cookBonus - dayPenalty);
  return { ...base, patienceMs: patience, maxPatienceMs: patience };
}

function emptyBuildings() {
  return { searchStation: 0, workshop: 0, clinic: 0, watchPost: 0, shelter: 0, radio: 0 };
}

export function createInitialState(seed = Date.now()): GameState {
  const normalized = normalizeSeed(seed);
  const [queue, rngState] = createFairQueue(normalized);
  const base: GameState = {
    version: 2,
    seed: normalized,
    rngState,
    phase: 'night',
    day: 1,
    nightRemainingMs: NIGHT_DURATION_MS,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
    racks: ['ration', 'ration', 'ration', 'battery'].slice(0, RACK_COUNT) as SupplyKind[],
    queue,
    currentOrder: makeOrder(0, 'ration', 'survivor'),
    orderIndex: 0,
    hordePressure: 12,
    hope: 8,
    parts: 0,
    supplies: 0,
    medicine: 0,
    firstLightLevel: 1,
    searchStationRepaired: false,
    survivorJoined: false,
    survivors: [],
    assignments: {},
    buildings: emptyBuildings(),
    forecast: forecastFor(1),
    chapterComplete: false,
    catStage: 0,
    catFedToday: false,
    combo: 0,
    bestCombo: 0,
    comboRemainingMs: 0,
    clearances: 0,
    extremeServes: 0,
    stats: { served: 0, missed: 0, merges: 0, peakPressure: 12, startedAt: Date.now() },
    lastMessage: 'NIGHT 1 · 最后一盏灯还亮着',
  };
  return { ...base, currentOrder: prepareOrder(base, 0, 'ration', 'survivor') };
}

function pullFromQueue(state: GameState): [SupplyKind, GameState] {
  let queue = [...state.queue];
  let rngState = state.rngState;
  if (queue.length === 0) [queue, rngState] = createFairQueue(rngState);
  const kind = queue.shift()!;
  return [kind, { ...state, queue, rngState }];
}

function newItem(kind: SupplyKind, tier: 1 | 2 | 3, serial: string): SupplyItem {
  return { id: `${kind}-${tier}-${serial}`, kind, tier };
}

function mergeSlots(input: GameState): GameState {
  let state = input;
  const slots = [...state.slots];
  let changed = true;
  let mergeCount = 0;
  while (changed) {
    changed = false;
    outer: for (const kind of KINDS) {
      for (const tier of [1, 2] as const) {
        const indices = slots.map((item, index) => (item?.kind === kind && item.tier === tier ? index : -1)).filter((index) => index >= 0);
        if (indices.length >= 3) {
          const selected = indices.slice(0, 3);
          selected.forEach((index) => { slots[index] = null; });
          slots[selected[0]] = newItem(kind, (tier + 1) as 2 | 3, `${state.stats.merges + mergeCount + 1}`);
          mergeCount += 1;
          changed = true;
          break outer;
        }
      }
    }
  }
  if (mergeCount > 0) state = { ...state, slots, stats: { ...state.stats, merges: state.stats.merges + mergeCount }, lastMessage: '三合完成 · 物资升级' };
  return state;
}

function serveOrderIfPossible(input: GameState): GameState {
  const matchIndex = input.slots.findIndex((item) => item?.kind === input.currentOrder.targetKind && item.tier === input.currentOrder.targetTier);
  if (matchIndex < 0) return input;
  const slots = [...input.slots];
  slots[matchIndex] = null;
  const order = input.currentOrder;
  const nextIndex = input.orderIndex + 1;
  const nextTarget = input.forecast.bonusKind && nextIndex % 4 === 0 ? input.forecast.bonusKind : KINDS[nextIndex % KINDS.length];
  const pressure = Math.max(0, input.hordePressure - order.pressureRelief);
  return {
    ...input,
    slots,
    orderIndex: nextIndex,
    currentOrder: prepareOrder(input, nextIndex, nextTarget),
    hope: input.hope + order.rewardHope + (input.buildings.clinic > 0 && order.targetKind === 'medical' ? 1 : 0),
    parts: input.parts + order.rewardParts,
    supplies: input.supplies + (order.kind === 'survivor' ? 1 : 0),
    hordePressure: pressure,
    stats: { ...input.stats, served: input.stats.served + 1, peakPressure: Math.max(input.stats.peakPressure, pressure) },
    lastMessage: order.kind === 'defense' ? '防线续上了！' : '又一位幸存者撑过今晚',
  };
}

export function takeRack(state: GameState, rackIndex: number): GameState {
  if (state.phase !== 'night' || rackIndex < 0 || rackIndex >= state.racks.length) return state;
  const emptyIndex = state.slots.findIndex((slot) => slot === null);
  if (emptyIndex < 0) return { ...state, lastMessage: '七格满了 · 先合成或紧急清台' };
  const kind = state.racks[rackIndex];
  const [replacement, queuedState] = pullFromQueue(state);
  const racks = [...queuedState.racks];
  racks[rackIndex] = replacement;
  const slots = [...queuedState.slots];
  slots[emptyIndex] = newItem(kind, 1, `${queuedState.orderIndex}-${emptyIndex}-${queuedState.nightRemainingMs}`);
  return serveOrderIfPossible(mergeSlots({ ...queuedState, racks, slots, lastMessage: `拿取：${kind}` }));
}

export function tick(state: GameState, elapsedMs: number): GameState {
  if (state.phase !== 'night') return state;
  const remaining = Math.max(0, state.nightRemainingMs - elapsedMs);
  const watchReduction = Math.min(0.45, countRole(state, 'watch') * 0.13 + state.buildings.watchPost * 0.04);
  const intensity = 0.82 + state.forecast.intensity * 0.18;
  const pressureGain = elapsedMs * (0.00032 + state.orderIndex * 0.000008) * intensity * (1 - watchReduction);
  const hordePressure = Math.min(100, state.hordePressure + pressureGain);
  let currentOrder = { ...state.currentOrder, patienceMs: Math.max(0, state.currentOrder.patienceMs - elapsedMs) };
  let missed = state.stats.missed;
  let lastMessage = state.lastMessage;
  let orderIndex = state.orderIndex;
  if (currentOrder.patienceMs <= 0) {
    missed += 1;
    orderIndex += 1;
    const target = state.forecast.bonusKind && orderIndex % 3 === 0 ? state.forecast.bonusKind : KINDS[orderIndex % KINDS.length];
    currentOrder = prepareOrder(state, orderIndex, target);
    lastMessage = '来客没等到物资 · 还能追回来';
  }
  const next: GameState = {
    ...state,
    nightRemainingMs: remaining,
    hordePressure,
    currentOrder,
    orderIndex,
    stats: { ...state.stats, missed, peakPressure: Math.max(state.stats.peakPressure, hordePressure) },
    lastMessage,
  };
  if (remaining <= 0 || hordePressure >= 100) {
    const chapterComplete = state.day === 7 && hordePressure < 100;
    return { ...next, phase: 'summary', chapterComplete, lastMessage: hordePressure >= 100 ? '防线失守前，大家撤回了街内' : state.day === 7 ? '尸潮退了 · 第一街段还亮着' : `天亮了 · NIGHT ${state.day} 结束` };
  }
  return next;
}

function addSurvivor(state: GameState, survivor: Survivor | null): GameState {
  if (!survivor || state.survivors.some((item) => item.id === survivor.id)) return state;
  return {
    ...state,
    survivors: [...state.survivors, survivor],
    assignments: { ...state.assignments, [survivor.id]: survivor.specialty === 'cook' ? 'cook' : 'rest' },
    survivorJoined: true,
    lastMessage: `${survivor.name}决定留在余烬长街 · 擅长${survivor.specialty}`,
  };
}

export function revealStreet(state: GameState): GameState {
  if (state.phase !== 'summary') return state;
  let next: GameState = { ...state, phase: 'street', lastMessage: state.chapterComplete ? '第一街段守住了。晨光正在穿过废墟。' : '白天只有几十秒，但每个安排都会改变今晚。' };
  if (state.day >= 2) next = addSurvivor(next, survivorUnlockFor(state.day));
  if (state.chapterComplete) next = { ...next, firstLightLevel: Math.max(next.firstLightLevel, 7), hope: next.hope + 12 };
  return next;
}

export function repairBuilding(state: GameState, buildingId: BuildingId): GameState {
  if (state.phase !== 'street') return state;
  const meta = BUILDING_META[buildingId];
  if (state.day < meta.unlockDay || state.buildings[buildingId] > 0 || state.parts < meta.cost) return state;
  let next: GameState = {
    ...state,
    parts: state.parts - meta.cost,
    buildings: { ...state.buildings, [buildingId]: 1 },
    searchStationRepaired: buildingId === 'searchStation' ? true : state.searchStationRepaired,
    firstLightLevel: Math.min(7, state.firstLightLevel + 1),
    hope: state.hope + 2,
    lastMessage: `${meta.name}重新亮灯 · 街区又完整了一点`,
  };
  if (buildingId === 'searchStation') next = addSurvivor(next, survivorUnlockFor(1));
  return next;
}

export function repairSearchStation(state: GameState): GameState {
  return repairBuilding(state, 'searchStation');
}

function roleAvailable(state: GameState, role: Role): boolean {
  if (role === 'cook' || role === 'rest') return true;
  const building = ROLE_BUILDING[role];
  return building ? state.buildings[building] > 0 : false;
}

export function assignSurvivor(state: GameState, survivorId: string, role: Role): GameState {
  if (state.phase !== 'street' || !state.survivors.some((item) => item.id === survivorId) || !roleAvailable(state, role)) return state;
  return { ...state, assignments: { ...state.assignments, [survivorId]: role }, lastMessage: `${state.survivors.find((item) => item.id === survivorId)?.name ?? '幸存者'}调整到${role}岗位` };
}

function productionFor(state: GameState) {
  let supplies = 0;
  let parts = 0;
  let medicine = 0;
  let hope = 0;
  for (const survivor of state.survivors) {
    const role = state.assignments[survivor.id] ?? 'rest';
    const specialty = role === survivor.specialty ? 1 : 0;
    if (role === 'search' && state.buildings.searchStation > 0) supplies += 2 + state.buildings.searchStation + specialty;
    if (role === 'repair' && state.buildings.workshop > 0) parts += 1 + state.buildings.workshop + specialty;
    if (role === 'medical' && state.buildings.clinic > 0) medicine += 1 + state.buildings.clinic + specialty;
    if (role === 'radio' && state.buildings.radio > 0) hope += 1 + specialty;
  }
  return { supplies, parts, medicine, hope };
}

export function startNextNight(state: GameState): GameState {
  if (state.phase !== 'street' || !state.searchStationRepaired || state.day >= 7 && state.chapterComplete) return state;
  const nextDay = state.day + 1;
  const produced = productionFor(state);
  const seed = state.seed ^ Math.imul(nextDay, 0x9e3779b9);
  const refreshed = createInitialState(seed);
  const watchCount = countRole(state, 'watch');
  const startingPressure = Math.max(8, 10 + forecastFor(nextDay).intensity * 4 - watchCount * 4);
  const duration = nextDay === 7 ? 90_000 : NIGHT_DURATION_MS;
  const survivors = state.survivors.map((survivor) => {
    const role = state.assignments[survivor.id] ?? 'rest';
    const energy = role === 'rest' ? Math.min(100, survivor.energy + 12) : Math.max(35, survivor.energy - 5);
    return { ...survivor, energy };
  });
  const forecast = forecastFor(nextDay);
  const orderContext: GameState = {
    ...refreshed,
    day: nextDay,
    survivors,
    assignments: state.assignments,
    buildings: state.buildings,
    forecast,
  };
  const next: GameState = {
    ...refreshed,
    day: nextDay,
    nightRemainingMs: duration,
    hope: state.hope + produced.hope,
    parts: state.parts + produced.parts,
    supplies: state.supplies + produced.supplies,
    medicine: state.medicine + produced.medicine,
    firstLightLevel: state.firstLightLevel,
    searchStationRepaired: state.searchStationRepaired,
    survivorJoined: state.survivorJoined,
    survivors,
    assignments: state.assignments,
    buildings: state.buildings,
    forecast,
    hordePressure: startingPressure,
    stats: { ...refreshed.stats, peakPressure: startingPressure },
    currentOrder: prepareOrder(orderContext, 0, forecast.bonusKind ?? 'ration', 'survivor'),
    lastMessage: `NIGHT ${nextDay} · ${forecast.title}`,
  };
  return next;
}

export function startSecondNight(state: GameState): GameState {
  return startNextNight(state);
}
