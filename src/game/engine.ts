import { makeOrder, NIGHT_DURATION_MS, RACK_COUNT, SLOT_COUNT } from './config';
import { nextRandom, normalizeSeed } from './rng';
import type { GameState, SupplyItem, SupplyKind } from './types';

const KINDS: SupplyKind[] = ['ration', 'medical', 'battery'];

function nextKind(rngState: number): [SupplyKind, number] {
  const [value, next] = nextRandom(rngState);
  return [KINDS[Math.floor(value * KINDS.length) % KINDS.length], next];
}

function createFairQueue(rngState: number, groups = 9): [SupplyKind[], number] {
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

export function createInitialState(seed = Date.now()): GameState {
  const normalized = normalizeSeed(seed);
  const [queue, rngState] = createFairQueue(normalized);
  return {
    version: 1,
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
    firstLightLevel: 1,
    searchStationRepaired: false,
    survivorJoined: false,
    stats: { served: 0, missed: 0, merges: 0, peakPressure: 12, startedAt: Date.now() },
    lastMessage: 'NIGHT 1 · 最后一盏灯还亮着',
  };
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
  const nextTarget = KINDS[nextIndex % KINDS.length];
  const pressure = Math.max(0, input.hordePressure - order.pressureRelief);
  return {
    ...input,
    slots,
    orderIndex: nextIndex,
    currentOrder: makeOrder(nextIndex, nextTarget),
    hope: input.hope + order.rewardHope,
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
  if (emptyIndex < 0) return { ...state, lastMessage: '七格满了 · 先合成再拿' };
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
  const pressureGain = elapsedMs * (0.00032 + state.orderIndex * 0.000008);
  const hordePressure = Math.min(100, state.hordePressure + pressureGain);
  let currentOrder = { ...state.currentOrder, patienceMs: Math.max(0, state.currentOrder.patienceMs - elapsedMs) };
  let missed = state.stats.missed;
  let lastMessage = state.lastMessage;
  let orderIndex = state.orderIndex;
  if (currentOrder.patienceMs <= 0) {
    missed += 1;
    orderIndex += 1;
    currentOrder = makeOrder(orderIndex, KINDS[orderIndex % KINDS.length]);
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
  if (remaining <= 0 || hordePressure >= 100) return { ...next, phase: 'summary', lastMessage: hordePressure >= 100 ? '防线失守前，大家撤回了街内' : '天亮了 · NIGHT 1 结束' };
  return next;
}

export function revealStreet(state: GameState): GameState {
  if (state.phase !== 'summary') return state;
  return { ...state, phase: 'street', lastMessage: '原来，你守住的不只是一张配给台。' };
}

export function repairSearchStation(state: GameState): GameState {
  if (state.phase !== 'street' || state.searchStationRepaired || state.parts < 6) return state;
  return { ...state, parts: state.parts - 6, searchStationRepaired: true, survivorJoined: true, firstLightLevel: 2, lastMessage: '搜索站重新亮灯 · 林夏决定留下帮忙' };
}

export function startSecondNight(state: GameState): GameState {
  if (!state.searchStationRepaired) return state;
  const refreshed = createInitialState(state.seed ^ 0x9e3779b9);
  return { ...refreshed, day: 2, hope: state.hope, parts: state.parts, supplies: state.supplies + 3, firstLightLevel: state.firstLightLevel, searchStationRepaired: true, survivorJoined: true, lastMessage: 'NIGHT 2 · 白天的准备开始有用了' };
}
