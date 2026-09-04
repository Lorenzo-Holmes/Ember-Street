import { HORDE_MILESTONE_DAYS } from '../config';
import type { DefenseNightRecord, GameState } from '../types';
import type { NightPreparationPreview } from './dayManagement';

export const defenseNumber = (value: number) => Number(value.toFixed(1));
export const signedDefense = (value: number) => `${value < 0 ? '−' : '+'}${defenseNumber(Math.abs(value))}`;

export function defenseCondition(value: number): string {
  if (value <= 0) return '防线耗尽';
  if (value < 40) return '防线薄弱';
  if (value < 55) return '需要加固';
  return '防线尚稳';
}

export function guardCoverageLabel(prep: NightPreparationPreview): string {
  if (prep.defenseSource === '无人') return '未安排守岗';
  if (prep.defenseSource === '居民轮值') return '居民轮流守岗';
  return prep.defense === '良好' ? '守岗人手较充足' : '已安排守岗，力量有限';
}

export function defenseRiskNotes(state: GameState): string[] {
  const notes: string[] = [];
  const fixedHorde = HORDE_MILESTONE_DAYS.includes(state.day as (typeof HORDE_MILESTONE_DAYS)[number]);
  if (state.day === 29) notes.push('最后一夜：防线将与人员、士气及此前的准备一同计入守城结果。');
  else {
    if (state.defense < 55 && !fixedHorde) notes.push('防线低于55，尸群来袭的风险增加。');
    if (state.defense < 50 && state.day !== 10 && state.day !== 20) notes.push('防线低于50，夜间突发险情的风险增加。');
    if (fixedHorde) notes.push('今晚已有尸潮来袭，防线较高也不能避开。');
  }
  if (state.defense < 35) notes.push('每日结算时若仍低于35，会增加居民压力；安抚和后勤效果可抵消。');
  if (state.defense < 30 && state.civilianResidents > 0 && state.day >= 6) notes.push('防线低于30，会加重居民离开的风险，尤其在缺粮或情绪恶化时。');
  return notes.length ? notes : ['当前防线未增加普通夜间风险；守岗、伤情和物资状况仍会影响这一夜。'];
}

export function beginDefenseNight(state: GameState): GameState {
  return { ...state, defenseNight: { day: state.day, start: state.defense, end: state.defense, reinforced: 0, damaged: 0, complete: true } };
}

export function recordDefenseChange(before: GameState, after: GameState): GameState {
  const delta = after.defense - before.defense;
  if (!delta) return after;
  const previous = before.defenseNight?.day === before.day ? before.defenseNight : undefined;
  const record = previous ?? { day: before.day, start: before.defense, end: before.defense, reinforced: 0, damaged: 0, complete: false };
  return { ...after, defenseNight: { ...record, end: after.defense, reinforced: record.reinforced + Math.max(0, delta), damaged: record.damaged + Math.max(0, -delta) } };
}

export function normalizeDefenseNight(value: unknown, day: number): DefenseNightRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const fields = ['day', 'start', 'end', 'reinforced', 'damaged'] as const;
  if (fields.some((key) => typeof item[key] !== 'number' || !Number.isFinite(item[key]))) return undefined;
  const { day: recordedDay, start, end, reinforced, damaged } = item as unknown as DefenseNightRecord;
  if (!Number.isInteger(recordedDay) || recordedDay < 1 || recordedDay > day || start < 0 || start > 100 || end < 0 || end > 100 || reinforced < 0 || damaged < 0) return undefined;
  if (Math.abs(start + reinforced - damaged - end) > 0.000001) return undefined;
  return { day: recordedDay, start, end, reinforced, damaged, complete: item.complete === true };
}
