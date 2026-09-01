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
    body: `${target.name}还没有回来。没人敢让你保证一定把人带回来，只是有人站在门口问：我们会不会真的出去找一次？`,
    promiseText: `最迟明天，至少出去找 ${target.name} 一次。`,
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
    body: `${target.name}的伤已经不是睡一晚就能熬过去的。大家没要求奇迹，只是不想明晚还看着同一块绷带继续往外渗。`,
    promiseText: '最迟明天，让诊所真正腾出一个人处理伤员。',
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
    body: '连续几天都是冷的。饭馆里越来越安静，连孩子都不再问今天吃什么。大家只想再看见一次锅盖下面真正冒出来的热气。',
    promiseText: '两天之内，至少让大家吃上一顿热的。',
    deadlineDays: 2,
  };
}

function defenseRequest(state: GameState): CommunityRequest | null {
  if (state.defense >= 45) return null;
  return {
    id: 'request-restore-defense',
    kind: 'restore-defense',
    title: '今晚真的安全吗？',
    body: '围栏上的缺口越来越明显。有人睡前已经会起两三次去摸门闩。大家想听一句准话：这两天，会不会把街口重新补到能让人闭眼的程度？',
    promiseText: '两天之内，把防线重新补到 60。',
    deadlineDays: 2,
    targetValue: 60,
  };
}

function shelterRequest(state: GameState): CommunityRequest | null {
  if (state.civilianResidents < 4 || state.buildings.shelter >= 2) return null;
  return {
    id: 'request-shelter',
    kind: 'shelter',
    title: '人已经比能睡的地方多了',
    body: '宿营屋里开始有人轮着靠墙睡。新来的人把包当枕头，早上醒了还得先给别人让路。这里已经不能再当临时落脚点凑合。',
    promiseText: '三天之内，把宿营屋和饭馆再收拾一层，至少让大家有地方睡、有地方吃。',
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
    socialState: { ...social, activePromise: promise, lastRequestDay: state.day, lastOutcome: `这件事答应下来了：${request.promiseText}` },
    storyFlags: [...new Set([...state.storyFlags, `promise_accepted:${promise.id}`])],
    lastMessage: `你把话说出口了：《${request.title}》——${request.promiseText}`,
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
    socialState: { ...nextSocial, lastRequestDay: state.day, lastOutcome: `你没有答应《${request.title}》。散开的人比来时更安静。` },
    storyFlags: [...new Set([...pressured.storyFlags, `promise_refused:${request.kind}:${state.day}`])],
    lastMessage: `这次你没有把话应下来。希望 -1 · 压力上升`,
  };
}

function fulfillActivePromise(state: GameState, detail: string): GameState {
  const social = socialStateOf(state);
  const promise = social.activePromise;
  if (!promise) return state;
  const pressured = adjustPressure({ ...state, socialState: social }, -1, `promise-fulfilled-${promise.kind}`);
  const nextSocial = socialStateOf(pressured);
  const entry = `✓ 《${promise.title}》没有白答应：${detail} · 希望 +2 · 压力下降`;
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
  const entry = `✕ 《${promise.title}》最后还是没做到。以后再答应什么，会有人先想起这一次。 · 希望 -3 · 压力明显上升`;
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
  return fulfillActivePromise(state, `DAY ${state.day}，饭馆的锅终于重新冒了热气`);
}

export function fulfillPromiseForSearch(state: GameState, survivorId: string): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise || promise.kind !== 'search-missing' || promise.targetId !== survivorId) return state;
  return fulfillActivePromise(state, '人真的出去找过了。有没有找到，是另一回事');
}

export function fulfillPromiseForMedicalAssignment(state: GameState): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise || promise.kind !== 'medical-care') return state;
  const assigned = Object.values(state.dayAssignments).some((assignment) => assignment === 'medical');
  if (!assigned) return state;
  return fulfillActivePromise(state, '今天诊所里一直有人守着伤员');
}

export function evaluatePromiseProgress(state: GameState): GameState {
  const promise = socialStateOf(state).activePromise;
  if (!promise) return state;
  if (promise.kind === 'restore-defense' && state.defense >= (promise.targetValue ?? 60)) {
    return fulfillActivePromise(state, `街口重新补到了 ${Math.round(state.defense)}，晚上终于有人敢把鞋脱了再睡`);
  }
  if (promise.kind === 'shelter' && state.buildings.shelter >= (promise.targetValue ?? 2)) {
    return fulfillActivePromise(state, '宿营屋和饭馆重新腾出了位置，夜里不用再轮着靠墙睡');
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
  let detail = `最迟到 DAY ${promise.deadlineDay}，这句话得有个交代。`;
  if (promise.kind === 'hot-meal') detail = '至少让大家吃上一顿真正冒热气的饭。';
  if (promise.kind === 'search-missing') detail = '至少真的出去找一次。找不找得到，不拿结果来算食言。';
  if (promise.kind === 'restore-defense') detail = `把街口重新补到 ${promise.targetValue ?? 60}。`;
  if (promise.kind === 'medical-care') detail = '至少让诊所真正腾出一个人照看伤员。';
  if (promise.kind === 'shelter') detail = '把宿营屋和饭馆再收拾一层，让更多人能睡下、吃上。';
  return { title: promise.title, detail, remainingDays };
}