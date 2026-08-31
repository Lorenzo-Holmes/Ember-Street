import type { BuildingId, GameState } from '../types';

export interface BuildingLevelDefinition {
  level: 1 | 2 | 3;
  materials: number;
  parts: number;
  title: string;
  unlock: string;
}

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  levels: [BuildingLevelDefinition, BuildingLevelDefinition, BuildingLevelDefinition];
}

export const V060_BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  searchStation: { id: 'searchStation', name: '搜索站', levels: [
    { level: 1, materials: 4, parts: 1, title: '基础搜索站', unlock: '允许派出探索队。' },
    { level: 2, materials: 7, parts: 3, title: '路线室', unlock: '探索前显示主要资源并降低风险。' },
    { level: 3, materials: 10, parts: 5, title: '情报搜索站', unlock: '已侦察地点进一步降低风险，双人路线更稳定。' },
  ] },
  workshop: { id: 'workshop', name: '修理工坊', levels: [
    { level: 1, materials: 5, parts: 2, title: '修理角', unlock: '维修岗位可以稳定防线。' },
    { level: 2, materials: 8, parts: 4, title: '完整工坊', unlock: '夜间建筑事故的资源选项更容易承担。' },
    { level: 3, materials: 12, parts: 6, title: '街区工坊', unlock: '第一次建筑事故的判定获得更高设施修正。' },
  ] },
  clinic: { id: 'clinic', name: '诊疗站', levels: [
    { level: 1, materials: 4, parts: 2, title: '诊疗角', unlock: '医疗岗位可以稳定轻伤。' },
    { level: 2, materials: 7, parts: 4, title: '诊疗站', unlock: '允许治疗重伤。' },
    { level: 3, materials: 10, parts: 6, title: '急救中心', unlock: '每天最多处理两名伤员。' },
  ] },
  watchPost: { id: 'watchPost', name: '守夜岗', levels: [
    { level: 1, materials: 5, parts: 1, title: '简易瞭望台', unlock: '守备岗位降低紧急事件风险。' },
    { level: 2, materials: 8, parts: 3, title: '守夜岗', unlock: '守备对尸潮概率的压制更强。' },
    { level: 3, materials: 11, parts: 5, title: '警戒塔', unlock: '守夜判定获得最高设施修正。' },
  ] },
  shelter: { id: 'shelter', name: '宿营屋', levels: [
    { level: 1, materials: 4, parts: 0, title: '宿营屋', unlock: '提供基础休息和 1.0× 炊事效率。' },
    { level: 2, materials: 7, parts: 2, title: '公共厨房', unlock: '炊事效率提升到 1.25×。' },
    { level: 3, materials: 10, parts: 4, title: '居民后勤站', unlock: '炊事效率提升到 1.5×，后勤解放更多劳动力。' },
  ] },
  radio: { id: 'radio', name: '广播亭', levels: [
    { level: 1, materials: 4, parts: 3, title: '收音台', unlock: '允许广播岗位接收外界信息。' },
    { level: 2, materials: 7, parts: 5, title: '广播亭', unlock: '持续值守可以建立外部联络并救回居民。' },
    { level: 3, materials: 9, parts: 7, title: '远距电台', unlock: '开启军方联络路线并降低尸潮风险。' },
  ] },
};

export function buildingLevel(state: GameState, id: BuildingId): number {
  return Math.max(0, Math.min(3, state.buildings[id] ?? 0));
}

export function nextBuildingLevel(state: GameState, id: BuildingId): BuildingLevelDefinition | null {
  const current = buildingLevel(state, id);
  return current >= 3 ? null : V060_BUILDINGS[id].levels[current];
}

export function canUpgradeBuilding(state: GameState, id: BuildingId): { allowed: boolean; reason?: string; next?: BuildingLevelDefinition } {
  const next = nextBuildingLevel(state, id);
  if (!next) return { allowed: false, reason: '已经是最高等级' };
  if (state.inventory.materials < next.materials) return { allowed: false, reason: `材料不足 · 需要 ${next.materials}` };
  if (state.inventory.parts < next.parts) return { allowed: false, reason: `零件不足 · 需要 ${next.parts}` };
  return { allowed: true, next };
}

export function upgradeBuilding(state: GameState, id: BuildingId): GameState {
  const check = canUpgradeBuilding(state, id);
  if (!check.allowed || !check.next) return { ...state, lastMessage: check.reason ?? '无法升级' };
  const next = check.next;
  const inventory = { ...state.inventory, materials: state.inventory.materials - next.materials, parts: state.inventory.parts - next.parts };
  const buildings = { ...state.buildings, [id]: next.level };
  const sum = Object.values(buildings).reduce((total, value) => total + value, 0);
  const mainLightStage = Math.max(1, Math.min(5, Math.ceil((sum + 1) / 4))) as 1 | 2 | 3 | 4 | 5;
  return {
    ...state,
    inventory,
    buildings,
    mainLightStage,
    hope: Math.min(100, state.hope + (next.level === 1 ? 2 : 1)),
    lastMessage: `${V060_BUILDINGS[id].name}升级到 Lv${next.level} · ${next.unlock}`,
  };
}
