import type { GameState, SocialState, StreetPrincipleId } from '../types';
import { normalizeCommunityState } from './community';

const clamp = (value: number, min = 0, max = 6) => Math.min(max, Math.max(min, Math.floor(value)));
const PRINCIPLES = new Set<StreetPrincipleId>([
  'everyone-shares', 'triage-first', 'outward-search',
  'core-leads', 'community-shares-risk', 'preserve-strength',
  'hold-the-street', 'prepare-evacuation', 'await-aid',
]);

export type PressureBand = 'calm' | 'tense' | 'near-breaking' | 'breaking';

export function createDefaultSocialState(): SocialState {
  return {
    pressure: 0,
    activePromise: null,
    fulfilledPromises: 0,
    brokenPromises: 0,
    principles: [],
  };
}

export function normalizeSocialState(value: unknown): SocialState {
  const source = value && typeof value === 'object' ? value as Partial<SocialState> : {};
  const active = source.activePromise && typeof source.activePromise === 'object'
    ? source.activePromise
    : null;
  const principles = Array.isArray(source.principles)
    ? [...new Set(source.principles.filter((item): item is StreetPrincipleId => PRINCIPLES.has(item as StreetPrincipleId)))]
    : [];
  return {
    pressure: clamp(Number(source.pressure) || 0),
    activePromise: active,
    fulfilledPromises: Math.max(0, Math.floor(Number(source.fulfilledPromises) || 0)),
    brokenPromises: Math.max(0, Math.floor(Number(source.brokenPromises) || 0)),
    principles,
    ...(Number.isFinite(Number(source.lastRequestDay)) ? { lastRequestDay: Math.max(0, Math.floor(Number(source.lastRequestDay))) } : {}),
    ...(typeof source.lastOutcome === 'string' && source.lastOutcome ? { lastOutcome: source.lastOutcome } : {}),
  };
}

export function socialStateOf(state: GameState): SocialState {
  return normalizeSocialState(state.socialState);
}

export function pressureBand(state: Pick<GameState, 'socialState'>): PressureBand {
  const pressure = normalizeSocialState(state.socialState).pressure;
  if (pressure <= 1) return 'calm';
  if (pressure <= 3) return 'tense';
  if (pressure <= 5) return 'near-breaking';
  return 'breaking';
}

export function pressureLabel(state: Pick<GameState, 'socialState'>): string {
  return {
    calm: '平静',
    tense: '紧张',
    'near-breaking': '濒临失控',
    breaking: '失控',
  }[pressureBand(state)];
}

export function adjustPressure(state: GameState, delta: number, reason?: string): GameState {
  if (!delta) return { ...state, socialState: socialStateOf(state) };
  const social = socialStateOf(state);
  const pressure = clamp(social.pressure + delta);
  if (pressure === social.pressure) return { ...state, socialState: social };
  const storyFlags = reason
    ? [...new Set([...state.storyFlags, `pressure:${state.day}:${reason}:${delta > 0 ? '+' : ''}${delta}`])]
    : state.storyFlags;
  return { ...state, socialState: { ...social, pressure }, storyFlags };
}

export function applyMealPressure(state: GameState): GameState {
  const quality = state.mealState.quality;
  if (quality === 'cold' || quality === 'struggling') return adjustPressure(state, 1, `meal-${quality}`);
  if (quality === 'full' || quality === 'well-fed') return adjustPressure(state, -1, `meal-${quality}`);
  return { ...state, socialState: socialStateOf(state) };
}

export function applyDailySocialPressure(input: GameState): GameState {
  const countedFlag = `social_pressure_daily:${input.day}`;
  if (input.storyFlags.includes(countedFlag)) return { ...input, socialState: socialStateOf(input) };

  let delta = 0;
  const notes: string[] = [];
  const severe = input.survivors.filter((survivor) => survivor.condition === 'serious' || survivor.condition === 'critical').length;
  const medicalAssigned = Object.values(input.dayAssignments).some((assignment) => assignment === 'medical');
  if (severe > 0 && !medicalAssigned) {
    delta += 1;
    notes.push('伤员无人医疗');
  }
  if (input.defense < 35) {
    delta += 1;
    notes.push('防线过低');
  }

  const community = normalizeCommunityState(input.communityState, input.civilianResidents);
  if (community.supportMode === 'logistics' && community.lastSupportDay === input.day && community.activeResidents >= 5) {
    delta -= 1;
    notes.push('居民后勤轮值');
  }

  delta = Math.max(-1, Math.min(2, delta));
  const withFlag: GameState = { ...input, storyFlags: [...input.storyFlags, countedFlag] };
  if (!delta) return { ...withFlag, socialState: socialStateOf(withFlag) };
  return adjustPressure(withFlag, delta, notes.join('+') || 'daily');
}
