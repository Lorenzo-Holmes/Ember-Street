import type { SurvivorCondition } from '../../game/types';
import type { ExpeditionResource } from '../../game/v060/expedition';

export const RESOURCE_LABEL: Record<ExpeditionResource, string> = {
  ration: '口粮',
  medicine: '药品',
  materials: '材料',
  parts: '零件',
};

export const SURVIVOR_CONDITION_LABEL: Record<SurvivorCondition, string> = {
  healthy: '健康',
  fatigued: '疲劳',
  minor: '轻伤',
  serious: '重伤',
  critical: '危重',
  missing: '失踪',
  dead: '死亡',
};

export function resourceLabel(resource: ExpeditionResource): string {
  return RESOURCE_LABEL[resource] ?? resource;
}

export function resourceListLabel(...resources: Array<ExpeditionResource | undefined>): string {
  return [...new Set(resources.filter((resource): resource is ExpeditionResource => Boolean(resource)))]
    .map(resourceLabel)
    .join('、');
}
