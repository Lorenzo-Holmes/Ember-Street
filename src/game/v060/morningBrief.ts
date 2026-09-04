import type { GameState, SurvivorCondition } from '../types';
import { pressureLabel, socialStateOf } from './socialPressure';
import { defenseNumber, recordDefenseChange, signedDefense } from './defenseFeedback';

const CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康', fatigued: '疲劳', minor: '轻伤', serious: '重伤', critical: '危重', missing: '失踪', dead: '死亡',
};

function changed(label: string, value: number): string {
  return value > 0 ? `${label}添了 ${value}` : `${label}少了 ${Math.abs(value)}`;
}

export function appendDawnBrief(before: GameState, after: GameState, title: string): GameState {
  const parts: string[] = [];
  const hope = after.hope - before.hope;
  const defense = after.defense - before.defense;
  const power = after.inventory.power - before.inventory.power;
  const ration = after.inventory.ration - before.inventory.ration;
  const medicine = after.inventory.medicine - before.inventory.medicine;
  const civilians = after.civilianResidents - before.civilianResidents;
  const deaths = after.campaignStats.deaths - before.campaignStats.deaths;
  const missing = after.campaignStats.missing - before.campaignStats.missing;
  const departures = after.campaignStats.civilianDepartures - before.campaignStats.civilianDepartures;
  const pressure = socialStateOf(after).pressure - socialStateOf(before).pressure;

  if (hope) parts.push(`大家${hope > 0 ? '又肯盼一盼明天了' : '更不愿提明天了'}`);
  if (pressure) parts.push(`街里${pressure > 0 ? '更不安了' : '总算安静了一些'}，${pressureLabel(after)}`);
  if (defense) parts.push(`防线${defense < 0 ? '受损' : '增强'}（${signedDefense(defense)}），现为 ${defenseNumber(after.defense)}/100`);
  if (power) parts.push(changed('电', power));
  if (ration) parts.push(changed('口粮', ration));
  if (medicine) parts.push(changed('药', medicine));
  if (civilians) parts.push(changed('街里的人', civilians));
  if (deaths > 0) parts.push(`${deaths} 人没能活下来`);
  if (missing > 0) parts.push(`${missing} 人没有回来`);
  if (departures > 0) parts.push(`${departures} 人离开了长街`);

  for (const survivor of after.survivors) {
    const previous = before.survivors.find((item) => item.id === survivor.id);
    if (!previous) continue;
    const from = previous.condition ?? 'healthy';
    const to = survivor.condition ?? 'healthy';
    if (from !== to) parts.push(`${survivor.name}的情况变了——${CONDITION_LABEL[from]}到了${CONDITION_LABEL[to]}`);
  }

  const recorded = recordDefenseChange(before, after);
  if (!parts.length) return recorded;
  const entry = `${title}。${parts.join('；')}。`;
  return { ...recorded, dawnBrief: [...(before.dawnBrief ?? []), entry].slice(-8) };
}

export function dawnBriefEntries(state: GameState): string[] {
  return (state.dawnBrief ?? []).map((entry) => entry.replace(/门墙(少了|添了)\s*(\d+(?:\.\d+)?)/g, (_, action: string, amount: string) => `防线${action === '少了' ? '受损' : '增强'}（${action === '少了' ? '−' : '+'}${amount}）`));
}
