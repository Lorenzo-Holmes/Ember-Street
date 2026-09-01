import type { CommunityPromise, CommunityPromiseKind, GameState } from '../types';
import { adjustPressure, socialStateOf } from './socialPressure';

export interface CommunityRequest {
  id: string;
  kind: CommunityPromiseKind;
  title: string;
  body: string;
  promiseText: string;
  deadlineDays: number;
  targetId?: string;
  targetValue?: number;
}

const clampHope = (value: number) => Math.max(0, Math.min(100, value));
const HOT_MEALS = new Set(['hot', 'full', 'well-fed']);

function appendBrief(state: GameState, entry: string): GameState {
  return { ...state, dawnBrief: [...(state.dawnBrief ?? []), entry].slice(-8) };
}

function cooldownReady(state: GameState): boolean {
  const social = socialStateOf(state);
  return social.lastRequestDay === undefined || state.day - social.lastRequestDay >= 3;
}

function missingRequest(state: GameState): CommunityRequest | null {
  const target = state.survivors.find((survivor) => survivor.condition === 'missing');
  if (!target) return null;
  return {
    id: `request-search-missing:${target.id}`,
    kind: 'search-missing',
    title: '你们会去找他的，对吧？',
    body: `${target.name}还没有回来。居民并不要求你保证把人找回来，只想知道街区会不会真的派人去找。`,
    promiseText: `在 DAY ${state.day + 1} 结束前至少进行一次对 ${target.name} 的搜救。`,
    deadlineDays: 1,
    targetId: target.id,
  };
}

function medicalRequest(state: GameState): CommunityRequest | null {
  const target = state.survivors
    .filter((survivor) => survivor.condition === 'serious' || survivor.condition === 'critical')
    .sort((a, b) => (a.condition === 'critical' ? -1 : 1) - (b.condition === 'critical' ? -1 : 1))[0];
  if (!target) return null;
  return {
    id: `request-medical:${target.id}`,
    kind: 'medical-care',
    title: '至少让人看看他的伤',
    body: `${target.name}的状态已经不是休息一晚能解决的。大家要求的不是奇迹，只是别再把伤势拖到下一夜。`,
    promiseText: `在 DAY ${state.day + 1} 结束前安排医疗岗位。`,
    deadlineDays: 1,
    targetId: target.id,
  };
}

function mealRequest(state: GameState): CommunityRequest | null {
  if (state.mealState.consecutiveShortageDays < 2) return null;
  return {
    id: 'request-hot-meal',
    kind: 'hot-meal',
    title: '至少让孩子吃顿热的',
    body: '连续几天的冷食和缺口已经让宿营屋越来越安静。居民没有要求更好的配给，只希望能看到一次真正冒热气的饭。',
    promiseText: `在 DAY ${state.day + 2} 结束前至少提供一次普通热食或更好的供餐。`,
    deadlineDays: 2,
  };
}

function defenseRequest(state: GameState): CommunityRequest | null {
  if (state.defense >= 45) return null;
  return {
    id: 'request-restore-defense',
    kind: 'restore-defense',
    title: '今晚真的安全吗？',
    body: '围栏上的缺口越来越明显。居民开始在睡前反复确认门闩，大家想知道你是否准备把防线重新修到能让人睡着的程度。',
    promiseText: `在 DAY ${state.day + 2} 结束前把防线恢复到 60。`,
    deadlineDays: 2,
    targetValue: 60,
  };
}

function shelterRequest(state: GameState): CommunityRequest | null {
  if (state.civilianResidents < 4 || state.buildings.shelter >= 2) return null;
  return {
    id: 'request-shelter',
    kind: 'shelter',
    title: '人已经比床位多了',
    body: '宿营屋里开始有人轮流睡靠墙的位置。救回更多人以后，原来的临时住处已经撑不住现在的街区。',
    promiseText: `在 DAY ${state.day + 3} 结束前把宿营屋升级到 Lv2 公共厨房。`,
    deadlineDays: 3,
    targetValue: 2,
  };
}

export function pendingCommunityRequest(state: GameState): CommunityRequest | null {
  const social = socialStateOf(state);
  if (social.activePromise || !cooldownReady(state) || state.day < 3 || state.day > 26) return null;
  if (state.dayState.assignmentsLocked || !['street', 'assignment'].includes(state.phase)) return null;

  return missingRequest(state)
    ?? medicalRequest(state)
    ?? mealRequest(state)
    ?? defenseRequest(state)
    ?? shelterRequest(state);
}

function requestById(state: GameState, requestId: string): CommunityRequest | null {
  const request = pendingCommunityRequest(state);
  return request?.id === requestId ? request : null;
}

export function acceptCommunityRequest(state: GameState, requestId: string): GameState {
  const request = requestById(state, requestId);
  if (!request) return state;
  const social = socialStateOf(state);
  const promise: CommunityPromise = {
    id: `promise:${request.kind}:${request.targetId ?? 'street'}:${state.day}`,
    kind: request.kind,
    title: request.title,
    createdDay: state.day,
    deadlineDay: state.day + request.deadlineDays,
    status: 'active',
    ...(request.targetId ? { targetId: request.targetId } : {}),
    ...(request.targetValue !== undefined ? { targetValue: request.targetValue } : {}),
  };
  return {
    ...state,
    socialState: { ...social, activePromise: promise, lastRequestDay: state.day, lastOutcome: `已承诺：${request.promiseText}` },
    storyFlags: [...new Set([...state.storyFlags, `promise_accepted:${promise.id}`])],
    lastMessage: `你答应了《${request.title}》 · ${request.promiseText}`,
  };
}

export function declineCommunityRequest(state: GameState, requestId: string): GameState {
  const request = requestById(state, requestId);
  if (!request) return state;
  const social = socialStateOf(state);
  const pressured = adjustPressure({ ...state, socialState: { ...social, lastRequestDay: state.day } }, 1, `promise-refused-${request.kind}`);
  const nextSocial = socialStateOf(pressured);
  return {
    ...pressured,
    hope: clampHope(pressured.hope - 1),
    socialState: { ...nextSocial, lastRequestDay: state.day, lastOutcome: `拒绝承诺：《${request.title}》 · 希望 -1 · 压力上升` },
    storyFlags: [...new Set([...pressured.storyFlags, `promise_refused:${request.kind}:${state.day}`])],
    lastMessage: `你没有作出承诺 · 《${request.title}》 · 希望 -1 · 压力上升`,
  };
}

function fulfillActivePromise(state: GameState, detail: string): GameState {
  const social = socialStateOf(state);
  const promise = social.activePromise;
  if (!promise) return state;
  const pressured = adjustPressure({ ...state, socialState: social }, -1, `promise-fulfilled-${promise.kind}`);
  const nextSocial = socialStateOf(pressured);
  const entry = `✓ 承诺《${promise.title}》已兑现：${detail} · 希望 +2 · 压力下降`;
  return appendBrief({
    ...pressured,
    hope: clampHope(pressured.hope + 2),
    socialState: {
      ...nextSocial,
      activePromise: null,
      fulfilledPromises: nextSocial.fulfilledPromises + 1,
      lastOutcome: entry,
    },
    storyFlags: [...new Set([...pressured.storyFlags, `promise_fulfilled:${promise.id}:${state.day}`])],
    lastMessage: entry,
  }, entry);
}

function breakActivePromise(state: GameState): GameState {
  const social = socialStateOf(state);
  const promise = social.activePromise;
  if (!promise) return state;
  const pressured = adjustPressure({ ...state, socialState: social }, 2, `promise-broken-${promise.kind}`);
  const nextSocial = socialStateOf(pressured);
  const entry = `✕ 承诺《${promise.title}》没有兑现 · 希望 -3 · 压力明显上升`;
  return appendBrief({
    ...pressured,
    hope: clampHope(pressured.hope - 3),
    socialState: {
      ...nextSocial,
      activePromise: null,
      brokenPromises: nextSocial.brokenPromises + 1,
      lastOutcome: entry,
    },
    storyFlags: [...new Set([...pressured.storyFlags, `promise_broken:${promise.id}:${state.day}`])],
    lastMessage: entry,
  }, entry);
}

export function fulfillPromiseForMeal(state: GameState): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise || promise.kind !== 'hot-meal' || !HOT_MEALS.has(state.mealState.quality)) return state;
  return fulfillActivePromise(state, `DAY ${state.day} 提供了${state.mealState.quality === 'hot' ? '普通热食' : '足量热食'}`);
}

export function fulfillPromiseForSearch(state: GameState, survivorId: string): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise || promise.kind !== 'search-missing' || promise.targetId !== survivorId) return state;
  return fulfillActivePromise(state, `街区按约定组织了对失踪者的搜救，不以投骰结果作为履约条件`);
}

export function fulfillPromiseForMedicalAssignment(state: GameState): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise || promise.kind !== 'medical-care') return state;
  const assigned = Object.values(state.dayAssignments).some((assignment) => assignment === 'medical');
  if (!assigned) return state;
  return fulfillActivePromise(state, '今天安排了医疗岗位处理街区伤员');
}

export function evaluatePromiseProgress(state: GameState): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise) return state;
  if (promise.kind === 'restore-defense' && state.defense >= (promise.targetValue ?? 60)) {
    return fulfillActivePromise(state, `防线已经恢复到 ${Math.round(state.defense)}`);
  }
  if (promise.kind === 'shelter' && state.buildings.shelter >= (promise.targetValue ?? 2)) {
    return fulfillActivePromise(state, '宿营屋已经升级为可以承载更多居民的公共厨房');
  }
  return state;
}

export function settlePromiseDeadline(state: GameState): GameState {
  const progressed = evaluatePromiseProgress(state);
  const promise = socialStateOf(progressed).activePromise;
  if (!promise || progressed.day < promise.deadlineDay) return progressed;
  return breakActivePromise(progressed);
}

export function activePromiseSummary(state: GameState): { title: string; detail: string; remainingDays: number } | null {
  const promise = socialStateOf(state).activePromise;
  if (!promise) return null;
  const remainingDays = Math.max(0, promise.deadlineDay - state.day);
  let detail = `在 DAY ${promise.deadlineDay} 结束前完成承诺。`;
  if (promise.kind === 'hot-meal') detail = `提供至少一次普通热食或更好的供餐。`;
  if (promise.kind === 'search-missing') detail = `至少组织一次失踪者搜救；不要求保证成功。`;
  if (promise.kind === 'restore-defense') detail = `把防线恢复到 ${promise.targetValue ?? 60}。`;
  if (promise.kind === 'medical-care') detail = `至少安排一次医疗岗位。`;
  if (promise.kind === 'shelter') detail = `把宿营屋升级到 Lv${promise.targetValue ?? 2}。`;
  return { title: promise.title, detail, remainingDays };
}
