import type { GameState, Inventory, JournalEntry } from '../types';

export const JOURNAL_LIMIT = 360;
const RESOURCE_NAMES: Record<keyof Inventory, string> = { ration: '口粮', medicine: '药品', power: '电力', materials: '材料', parts: '零件' };

export function journalChanges(before: GameState, after: GameState): string {
  const changes = (Object.keys(RESOURCE_NAMES) as (keyof Inventory)[]).flatMap((key) => {
    const delta = after.inventory[key] - before.inventory[key];
    return delta ? [`${RESOURCE_NAMES[key]} ${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))}`] : [];
  });
  for (const [key, name] of [['hope', '希望'], ['defense', '防线']] as const) {
    const delta = after[key] - before[key];
    if (delta) changes.push(`${name} ${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))}`);
  }
  return changes.length ? `${changes.join('，')}。` : '物资没有变化。';
}

export function appendJournal(state: GameState, entry: JournalEntry): GameState {
  if (state.journal?.some((item) => item.id === entry.id)) return state;
  return { ...state, journal: [...(state.journal ?? []), entry].slice(-JOURNAL_LIMIT) };
}

export function normalizeJournal(value: unknown): JournalEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  return value.slice(-JOURNAL_LIMIT).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as JournalEntry;
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || typeof entry.body !== 'string'
      || !Number.isInteger(entry.day) || entry.day < 1 || entry.day > 30
      || !['work', 'expedition', 'night'].includes(entry.kind) || seen.has(entry.id)) return [];
    seen.add(entry.id);
    return [{ id: entry.id.slice(0, 200), day: entry.day, kind: entry.kind, title: entry.title.slice(0, 200), body: entry.body.slice(0, 2000) }];
  });
}
