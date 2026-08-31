import { assignSurvivor } from './engine';
import type { GameState, Role } from './types';

function roleAvailable(state: GameState, role: Role): boolean {
  if (role === 'cook') return true;
  if (role === 'rest') return true;
  if (role === 'search') return state.buildings.searchStation > 0;
  if (role === 'repair') return state.buildings.workshop > 0;
  if (role === 'medical') return state.buildings.clinic > 0;
  if (role === 'watch') return state.buildings.watchPost > 0;
  if (role === 'radio') return state.buildings.radio > 0;
  return false;
}

function safeAssign(state: GameState, survivorId: string, desired: Role): GameState {
  if (roleAvailable(state, desired)) return assignSurvivor(state, survivorId, desired);
  return assignSurvivor(state, survivorId, 'cook');
}

export function autoAssignBySpecialty(state: GameState): GameState {
  let next = state;
  for (const survivor of state.survivors) next = safeAssign(next, survivor.id, survivor.specialty);
  return { ...next, lastMessage: '已按专长排班 · 可以继续手动微调' };
}

export function autoAssignForHorde(state: GameState): GameState {
  let next = state;
  for (const survivor of state.survivors) {
    let target: Role = survivor.specialty;
    if (state.buildings.watchPost && survivor.specialty !== 'medical' && survivor.specialty !== 'repair') target = 'watch';
    if (survivor.specialty === 'repair' && state.buildings.workshop) target = 'repair';
    if (survivor.specialty === 'medical' && state.buildings.clinic) target = 'medical';
    next = safeAssign(next, survivor.id, target);
  }
  return { ...next, lastMessage: '尸潮班表已套用 · 守夜与维修优先' };
}
