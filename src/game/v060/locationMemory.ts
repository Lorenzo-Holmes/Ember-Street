import type { GameState } from '../types';

export interface LocationMemory {
  visited: boolean;
  scouted: boolean;
  disturbed: boolean;
  cleared: boolean;
  rescued: boolean;
  depleted: boolean;
}

export function locationMemory(state: GameState, locationId: string): LocationMemory {
  const flags = new Set(state.storyFlags);
  return {
    visited: flags.has(`visited:${locationId}`),
    scouted: flags.has(`scouted:${locationId}`) || flags.has(`route_known:${locationId}`),
    disturbed: flags.has(`danger:${locationId}`) || flags.has(`disturbed:${locationId}`),
    cleared: flags.has(`cleared:${locationId}`),
    rescued: flags.has(`rescued:${locationId}`),
    depleted: flags.has(`depleted:${locationId}`),
  };
}

export function locationMemoryRiskModifier(state: GameState, locationId: string): number {
  const memory = locationMemory(state, locationId);
  let modifier = 0;
  if (memory.scouted) modifier -= 2;
  if (memory.cleared) modifier -= 1;
  if (memory.disturbed) modifier += 2;
  return modifier;
}

export function rememberLocation(state: GameState, locationId: string, memory: keyof Omit<LocationMemory, 'visited'>): GameState {
  const prefix = memory === 'disturbed' ? 'disturbed' : memory;
  return { ...state, storyFlags: [...new Set([...state.storyFlags, `${prefix}:${locationId}`])] };
}

export function locationMemorySummary(state: GameState, locationId: string): string[] {
  const memory = locationMemory(state, locationId);
  const notes: string[] = [];
  if (!memory.visited) notes.push('首次进入：会触发地点招牌事件');
  if (memory.scouted) notes.push('已侦察：后续风险降低');
  if (memory.cleared) notes.push('已清理：部分危险已经排除');
  if (memory.disturbed) notes.push('已惊动：下次进入风险上升');
  if (memory.rescued) notes.push('这里的人已经被带走');
  if (memory.depleted) notes.push('主要物资已经所剩不多');
  return notes;
}
