import type { GameState, SurvivorCondition } from '../types';

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡',
};

function signed(value: number): string { return value > 0 ? `+${value}` : `${value}`; }

export function appendDawnBrief(before: GameState, after: GameState, title: string): GameState {
  const parts: string[] = [];
  const hope = after.hope - before.hope;
  const defense = Math.round(after.defense - before.defense);
  const power = after.inventory.power - before.inventory.power;
  const ration = after.inventory.ration - before.inventory.ration;
  const medicine = after.inventory.medicine - before.inventory.medicine;
  const civilians = after.civilianResidents - before.civilianResidents;
  const deaths = after.campaignStats.deaths - before.campaignStats.deaths;
  const missing = after.campaignStats.missing - before.campaignStats.missing;

  if (hope) parts.push(`希望 ${signed(hope)}`);
  if (defense) parts.push(`防线 ${signed(defense)}`);
  if (power) parts.push(`电力 ${signed(power)}`);
  if (ration) parts.push(`口粮 ${signed(ration)}`);
  if (medicine) parts.push(`药品 ${signed(medicine)}`);
  if (civilians) parts.push(`居民 ${signed(civilians)}`);
  if (deaths > 0) parts.push(`确认死亡 +${deaths}`);
  if (missing > 0) parts.push(`失踪 +${missing}`);

  for (const survivor of after.survivors) {
    const previous = before.survivors.find((item) => item.id === survivor.id);
    if (!previous) continue;
    const from = previous.condition ?? 'healthy';
    const to = survivor.condition ?? 'healthy';
    if (from !== to) parts.push(`${survivor.name}：${CONDITION_LABEL[from]}→${CONDITION_LABEL[to]}`);
  }

  if (!parts.length) return after;
  const entry = `${title}：${parts.join(' · ')}`;
  return { ...after, dawnBrief: [...(before.dawnBrief ?? []), entry].slice(-8) };
}

export function dawnBriefEntries(state: GameState): string[] {
  return state.dawnBrief ?? [];
}
