import type { BuildingId, GameState } from '../types';
import { evaluatePromiseProgress } from './communityPromises';

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
    { level: 1, materials: 4, parts: 1, title: '路线桌', unlock: '墙上终于挂起一张能看的地图，外出的人不用再只靠猜。' },
    { level: 2, materials: 7, parts: 3, title: '路线室', unlock: '几条能走的路被重新标了出来，回来的人会把哪里有什么写在墙上。' },
    { level: 3, materials: 10, parts: 5, title: '情报墙', unlock: '走过的地方被一遍遍补记，两个人出去时也更容易互相照应。' },
  ] },
  workshop: { id: 'workshop', name: '修理工坊', levels: [
    { level: 1, materials: 5, parts: 2, title: '修理角', unlock: '修车铺的工具重新归了位，门板和铁皮终于有人能认真修。' },
    { level: 2, materials: 8, parts: 4, title: '完整工坊', unlock: '焊机和旧电瓶重新能用，夜里坏东西时不再只能拿现成物资硬顶。' },
    { level: 3, materials: 12, parts: 6, title: '街区工坊', unlock: '常用工具都挂在伸手能拿到的地方，突发损坏时能更快处理。' },
  ] },
  clinic: { id: 'clinic', name: '诊疗站', levels: [
    { level: 1, materials: 4, parts: 2, title: '诊疗角', unlock: '诊疗床重新铺好，轻伤终于不用只靠自己熬。' },
    { level: 2, materials: 7, parts: 4, title: '诊疗站', unlock: '水、照明和基础器械都能用了，重伤的人也有地方躺下。' },
    { level: 3, materials: 10, parts: 6, title: '急救间', unlock: '第二张床也收拾出来了，一天能照看更多伤员。' },
  ] },
  watchPost: { id: 'watchPost', name: '守夜岗', levels: [
    { level: 1, materials: 5, parts: 1, title: '门卫室', unlock: '旧门卫室重新有人坐着。街口有动静时，总算能早一点看见。' },
    { level: 2, materials: 8, parts: 3, title: '守夜岗', unlock: '屋顶加了一层观察架，守夜的人能看见更远的路口。' },
    { level: 3, materials: 11, parts: 5, title: '高处哨位', unlock: '警铃、灯和观察位都固定下来，夜里出事时不再全靠一声喊。' },
  ] },
  shelter: { id: 'shelter', name: '宿营屋', levels: [
    { level: 1, materials: 4, parts: 0, title: '能住人的屋子', unlock: '漏风的窗先堵上了。至少晚上有地方真正躺下来。' },
    { level: 2, materials: 7, parts: 2, title: '公共厨房', unlock: '小饭馆重新归了灶台和桌子，一锅饭能更稳地顾到更多人。' },
    { level: 3, materials: 10, parts: 4, title: '居民后勤间', unlock: '储物、做饭和轮值都有人接手，熟手终于能从杂事里腾出一点时间。' },
  ] },
  radio: { id: 'radio', name: '广播亭', levels: [
    { level: 1, materials: 4, parts: 3, title: '收音台', unlock: '收音机、车载电台和电瓶接到了一起，噪音里偶尔能听见完整的人声。' },
    { level: 2, materials: 7, parts: 5, title: '广播亭', unlock: '天线终于能把声音送出去。城里如果还有人在听，他们可能会回答。' },
    { level: 3, materials: 9, parts: 7, title: '远距电台', unlock: '更远的频段开始有回应。有人说自己来自临时救援队，也有人只报了一个坐标。' },
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
  if (!next) return { allowed: false, reason: '这里已经没有更多能收拾的了' };
  if (state.inventory.materials < next.materials) return { allowed: false, reason: `还差材料 · 需要 ${next.materials}` };
  if (state.inventory.parts < next.parts) return { allowed: false, reason: `还差零件 · 需要 ${next.parts}` };
  return { allowed: true, next };
}

export function upgradeBuilding(state: GameState, id: BuildingId): GameState {
  const check = canUpgradeBuilding(state, id);
  if (!check.allowed || !check.next) return { ...state, lastMessage: check.reason ?? '今天动不了这里' };
  const next = check.next;
  const inventory = { ...state.inventory, materials: state.inventory.materials - next.materials, parts: state.inventory.parts - next.parts };
  const buildings = { ...state.buildings, [id]: next.level };
  const sum = Object.values(buildings).reduce((total, value) => total + value, 0);
  const mainLightStage = Math.max(1, Math.min(5, Math.ceil((sum + 1) / 4))) as 1 | 2 | 3 | 4 | 5;
  const storyFlags = next.level === 1
    ? [...new Set([...state.storyFlags, `building_event_pending:${id}`])]
    : state.storyFlags;
  const upgraded: GameState = {
    ...state,
    inventory,
    buildings,
    storyFlags,
    mainLightStage,
    hope: Math.min(100, state.hope + (next.level === 1 ? 2 : 1)),
    lastMessage: next.level === 1
      ? `${V060_BUILDINGS[id].name}重新收拾出来了。今晚开始，这里终于能派上用场。`
      : `${V060_BUILDINGS[id].name}又往前收拾了一步。${next.unlock}`,
  };
  return evaluatePromiseProgress(upgraded);
}