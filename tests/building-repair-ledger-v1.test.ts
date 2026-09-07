import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BuildingId, GameState } from '../src/game/types';
import { canUpgradeBuilding, upgradeBuilding, V060_BUILDINGS } from '../src/game/v060/buildings';
import { createV060InitialState } from '../src/game/v060/campaign';
import BuildingsV1 from '../src/ui/v1/BuildingsV1';

function stateWithStock(materials: number, parts: number): GameState {
  const state = createV060InitialState(606060);
  return { ...state, inventory: { ...state.inventory, materials, parts } };
}

function ledger(state: GameState, selectedBuilding: BuildingId = 'searchStation'): string {
  return renderToStaticMarkup(createElement(BuildingsV1, {
    state,
    onCommit: () => {},
    selectedBuilding,
    onSelectBuilding: () => {},
    onOpenSurvivors: () => {},
  }));
}

describe('building repair costs', () => {
  it.each([
    [1, 0, '尚缺：材料 6 · 零件 3'],
    [1, 3, '尚缺：材料 6'],
    [7, 1, '尚缺：零件 2'],
    [20, 1, '尚缺：零件 2'],
  ])('reports all actual shortages with stock %i / %i', (materials, parts, reason) => {
    expect(canUpgradeBuilding(stateWithStock(materials, parts), 'searchStation')).toEqual({ allowed: false, reason });
  });

  it.each([[7, 3], [20, 10]])('allows the upgrade with sufficient stock %i / %i', (materials, parts) => {
    const check = canUpgradeBuilding(stateWithStock(materials, parts), 'searchStation');
    expect(check.allowed).toBe(true);
    expect(check.reason).toBeUndefined();
    expect(check.next).toEqual(V060_BUILDINGS.searchStation.levels[1]);
  });

  it('does not report a shortage for resources a repair does not need', () => {
    const state = stateWithStock(1, 0);
    state.buildings.shelter = 0;
    expect(canUpgradeBuilding(state, 'shelter').reason).toBe('尚缺：材料 3');
  });

  it('leaves stock and levels unchanged when a repair is blocked', () => {
    const state = stateWithStock(1, 0);
    const next = upgradeBuilding(state, 'searchStation');
    expect(next.inventory).toEqual(state.inventory);
    expect(next.buildings).toEqual(state.buildings);
    expect(next.lastMessage).toBe('尚缺：材料 6 · 零件 3');
  });

  it('still deducts the total cost, not the shortage, for a successful upgrade', () => {
    const next = upgradeBuilding(stateWithStock(9, 4), 'searchStation');
    expect(next.inventory.materials).toBe(2);
    expect(next.inventory.parts).toBe(1);
    expect(next.buildings.searchStation).toBe(2);
  });
});

describe('building repair ledger', () => {
  it('keeps exact selected-building requirements readable in the V2 detail', () => {
    const state = stateWithStock(1, 0);
    const markup = ledger(state);
    expect(markup).toContain('路线屋');
    expect(markup).toMatch(/<dt>材料<\/dt><dd>1 \/ 7<\/dd>/);
    expect(markup).toMatch(/<dt>零件<\/dt><dd>0 \/ 3<\/dd>/);
    expect(markup).toMatch(/class="v2-primary-action"[^>]*disabled=""[^>]*>尚缺：材料 6 · 零件 3<\/button>/);
  });

  it('shows ready stock without inventing a zero or negative shortage', () => {
    const markup = ledger(stateWithStock(20, 10));
    expect(markup).toMatch(/<dt>材料<\/dt><dd>20 \/ 7<\/dd>/);
    expect(markup).toMatch(/<dt>零件<\/dt><dd>10 \/ 3<\/dd>/);
    expect(markup).not.toContain('尚缺：');
    expect(markup).toMatch(/class="v2-primary-action"[^>]*>继续修整<\/button>/);
  });

  it('keeps dispatched repairs disabled even when the stock is ready', () => {
    const state = stateWithStock(20, 10);
    state.dayState.assignmentsLocked = true;
    const markup = ledger(state);
    expect(markup).toMatch(/class="v2-primary-action"[^>]*disabled=""[^>]*>今天的人已经派出去了<\/button>/);
  });

  it('does not show costs or an upgrade action for fully repaired buildings', () => {
    const state = stateWithStock(1, 0);
    for (const id of Object.keys(V060_BUILDINGS) as BuildingId[]) state.buildings[id] = 3;
    const markup = ledger(state);
    expect(markup.match(/Lv\.3 · 修稳/g)).toHaveLength(6);
    expect(markup).toContain('这里已经修稳，不需要继续投入材料。');
    expect(markup).not.toMatch(/尚缺：|class="v2-primary-action"/);
  });

  it('renders the same controlled selection in the scene hotspot and building navigation', () => {
    const markup = ledger(stateWithStock(20, 10), 'workshop');
    expect(markup).toContain('修车铺 <small>Lv.0</small>');
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(2);
  });
});
