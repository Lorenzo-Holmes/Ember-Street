import { createInitialState } from './engine';
import { forecastFor } from './progression';
import type { GameState } from './types';

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dailySeed(dateKey = localDateKey()): number {
  return hashString(`EMBER-STREET:${dateKey}:DAILY:1`);
}

export function createDailyChallenge(dateKey = localDateKey()): GameState {
  const seed = dailySeed(dateKey);
  const base = createInitialState(seed);
  const forecast = { ...forecastFor(7), title: `今夜挑战 · ${dateKey}`, detail: '所有玩家面对同一套 Seed。60 秒，只看七格判断和手速。', intensity: 4 };
  return {
    ...base,
    day: 7,
    nightRemainingMs: 60_000,
    hordePressure: 22,
    hope: 10,
    forecast,
    stats: { ...base.stats, peakPressure: 22 },
    lastMessage: 'DAILY · 标准化配置，不消耗主线资源',
  };
}

export function challengeScore(state: GameState): number {
  return Math.max(0, state.stats.served * 120 + state.stats.merges * 35 + state.hope * 8 - state.stats.missed * 30 - Math.round(state.stats.peakPressure));
}

export function encodeChallenge(seed: number, score: number): string {
  const seedHex = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const scoreHex = Math.max(0, Math.min(0xFFFF, score)).toString(16).toUpperCase().padStart(4, '0');
  const checksum = hashString(`${seedHex}:${scoreHex}:ES1`).toString(16).toUpperCase().slice(-2).padStart(2, '0');
  return `ES1-${seedHex}-${scoreHex}-${checksum}`;
}

export function decodeChallenge(code: string): { seed: number; score: number } | null {
  const match = code.trim().toUpperCase().match(/^ES1-([0-9A-F]{8})-([0-9A-F]{4})-([0-9A-F]{2})$/);
  if (!match) return null;
  const [, seedHex, scoreHex, checksum] = match;
  const expected = hashString(`${seedHex}:${scoreHex}:ES1`).toString(16).toUpperCase().slice(-2).padStart(2, '0');
  if (checksum !== expected) return null;
  return { seed: Number.parseInt(seedHex, 16) >>> 0, score: Number.parseInt(scoreHex, 16) };
}
