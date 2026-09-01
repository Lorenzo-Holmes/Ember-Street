import type { GameState } from '../types';
import type { V060NightEvent } from './nightEvents';

export function buildingEventWeightModifier(state: GameState, event: V060NightEvent): number {
  let modifier = 0;

  if (state.buildings.workshop >= 2 && ['generator-drop', 'fence-rattle', 'emergency-building-collapse'].includes(event.id)) modifier -= 1;
  if (state.buildings.workshop >= 3 && ['generator-drop', 'emergency-building-collapse'].includes(event.id)) modifier -= 1;

  if (state.buildings.shelter >= 2 && ['argument-rations', 'nightmare-child', 'emergency-panic', 'emergency-missing-child'].includes(event.id)) modifier -= 1;
  if (state.buildings.shelter >= 3 && ['emergency-panic', 'emergency-missing-child'].includes(event.id)) modifier -= 1;

  if (state.buildings.clinic >= 2 && ['fever-resident', 'medicine-count', 'horde-clinic'].includes(event.id)) modifier -= 1;
  if (state.buildings.clinic >= 3 && ['fever-resident', 'horde-clinic'].includes(event.id)) modifier -= 1;

  if (state.buildings.watchPost >= 2 && ['gate-knocking', 'east-footsteps', 'stray-dogs', 'emergency-north-breach'].includes(event.id)) modifier -= 1;
  if (state.buildings.watchPost >= 3 && event.id === 'emergency-north-breach') modifier -= 1;

  if (state.buildings.radio >= 2 && event.category === 'world') modifier += 1;
  if (state.buildings.radio >= 3 && event.id === 'water-on-radio') modifier += 1;

  return modifier;
}
