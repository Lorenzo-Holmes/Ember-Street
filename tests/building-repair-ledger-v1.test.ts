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

function ledger(state: GameState): string {
  return renderToStaticMarkup(createElement(BuildingsV1, { state, onCommit: () => {} }));
}

function buildingEntry(markup: string, id: BuildingId): string {
  return markup.match(/<article\b[\s\S]*?<\/article>/g)?.find((entry) => entry.includes(`id="building-cost-${id}"`)) ?? '';
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
  it('keeps both cost lines in every summary and out of the expanded action', () => {
    const state = stateWithStock(1, 0);
    const markup = ledger(state);
    for (const id of Object.keys(V060_BUILDINGS) as BuildingId[]) {
      const entry = buildingEntry(markup, id);
      const next = V060_BUILDINGS[id].levels[state.buildings[id]];
      const summary = entry.match(/<button\b[\s\S]*?<\/button>/)?.[0] ?? '';
      expect(summary).toContain(`需用：材料 ${next.materials} · 零件 ${next.parts}`);
      expect(summary).toContain(canUpgradeBuilding(state, id).reason);
      expect(entry.match(/需用：/g)).toHaveLength(1);
      expect(entry.match(/尚缺：/g)).toHaveLength(1);
    }
    const open = buildingEntry(markup, 'searchStation');
    expect(open).toContain('aria-expanded="true"');
    expect(open).toMatch(/class="v1-primary-action"[^>]*disabled=""[^>]*>接着修<\/button>/);
    expect(open).toContain('aria-describedby="building-cost-searchStation"');
    expect(buildingEntry(markup, 'workshop')).toContain('aria-expanded="false"');
    expect(markup).not.toMatch(/还缺：|材料不够|零件不够|要用：/);
  });

  it('shows ready stock without inventing a zero or negative shortage', () => {
    const entry = buildingEntry(ledger(stateWithStock(20, 10)), 'searchStation');
    expect(entry).toContain('用料已齐');
    expect(entry).not.toContain('尚缺：');
    expect(entry).not.toContain('disabled=""');
  });

  it('keeps dispatched repairs disabled even when the stock is ready', () => {
    const state = stateWithStock(20, 10);
    state.dayState.assignmentsLocked = true;
    const entry = buildingEntry(ledger(state), 'searchStation');
    expect(entry).toContain('用料已齐');
    expect(entry).toMatch(/class="v1-primary-action"[^>]*disabled=""[^>]*>人已经派出去了<\/button>/);
  });

  it('does not show costs or an upgrade action for fully repaired buildings', () => {
    const state = stateWithStock(1, 0);
    for (const id of Object.keys(V060_BUILDINGS) as BuildingId[]) state.buildings[id] = 3;
    const markup = ledger(state);
    expect(markup.match(/这处已经修稳/g)).toHaveLength(6);
    expect(markup).not.toMatch(/需用：|尚缺：|v1-primary-action/);
  });
});
