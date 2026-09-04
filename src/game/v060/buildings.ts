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
  inactiveTitle: string;
  inactiveDescription: string;
  levels: [BuildingLevelDefinition, BuildingLevelDefinition, BuildingLevelDefinition];
}

export const V060_BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  searchStation: { id: 'searchStation', name: '路线屋', inactiveTitle: '地图全没了', inactiveDescription: '墙上空着。出去的人只能凭记忆认路。', levels: [
    { level: 1, materials: 4, parts: 1, title: '先铺一张地图', unlock: '地图钉上墙了。走过的路先标出来，免得再有人绕远。' },
    { level: 2, materials: 7, parts: 3, title: '路线已经记清', unlock: '能走的几条路都留下了记号。回来的人会把新情况补上。' },
    { level: 3, materials: 10, parts: 5, title: '整面墙都记满了', unlock: '远近几条路已经分开标清。几队人同时出去，也不容易走乱。' },
  ] },
  workshop: { id: 'workshop', name: '修车铺', inactiveTitle: '工作台塌了', inactiveDescription: '工具散在地上，线路也断着。门板和铁皮坏了只能先顶住。', levels: [
    { level: 1, materials: 5, parts: 2, title: '先把工具归拢', unlock: '扳手、锤子和钳子能找齐了。小处损坏可以当晚补上。' },
    { level: 2, materials: 8, parts: 4, title: '电重新接上了', unlock: '焊机和旧电瓶能用了。围栏和发电机坏了，不必再拆别处来补。' },
    { level: 3, materials: 12, parts: 6, title: '常用工具都齐了', unlock: '材料和工具都放在顺手的位置。夜里出问题，能更快修好。' },
  ] },
  clinic: { id: 'clinic', name: '诊疗室', inactiveTitle: '伤员没地方躺', inactiveDescription: '床架散了，灯也不亮。今晚还不能把伤员安置在这里。', levels: [
    { level: 1, materials: 4, parts: 2, title: '先铺好一张床', unlock: '床铺和药箱已经清出来。轻伤的人终于能及时处理。' },
    { level: 2, materials: 7, parts: 4, title: '水和灯都接上了', unlock: '照明、清水和器械能用了。重伤的人也能留在这里照看。' },
    { level: 3, materials: 10, parts: 6, title: '第二张床也能用了', unlock: '两张床都已经安好。一天能多照看几个伤员。' },
  ] },
  watchPost: { id: 'watchPost', name: '街口岗', inactiveTitle: '看不清路口', inactiveDescription: '窗户碎了，屋顶的观察位也塌着。夜里有人靠近，很难提前发现。', levels: [
    { level: 1, materials: 5, parts: 1, title: '门卫室能守人了', unlock: '窗框先封住了。街口有动静，总算能早一点看见。' },
    { level: 2, materials: 8, parts: 3, title: '屋顶能上人了', unlock: '观察架重新搭好。守夜的人能看清更远的路口。' },
    { level: 3, materials: 11, parts: 5, title: '警铃也接好了', unlock: '灯、警铃和观察位都固定下来。真有东西靠近，不必只靠人喊。' },
  ] },
  shelter: { id: 'shelter', name: '宿营屋', inactiveTitle: '今晚还住不了人', inactiveDescription: '窗户漏风，地面返潮。人只能继续挤在别处。', levels: [
    { level: 1, materials: 4, parts: 0, title: '先腾出睡觉的地方', unlock: '漏风的窗堵上了。今晚终于有人能真正躺下。' },
    { level: 2, materials: 7, parts: 2, title: '灶台重新点起来', unlock: '饭馆的灶和桌子能用了。一锅饭能顾到更多人。' },
    { level: 3, materials: 10, parts: 4, title: '住处有了轮值', unlock: '储物、做饭和夜间轮值都有人接手。熟手能腾出时间做别的事。' },
  ] },
  radio: { id: 'radio', name: '广播间', inactiveTitle: '一点声音也收不到', inactiveDescription: '电台没有电，天线的线缆也断了。外面的声音进不来。', levels: [
    { level: 1, materials: 4, parts: 3, title: '杂音里有了人声', unlock: '收音机、车载电台和电瓶接到一起。偶尔能听清几句话。' },
    { level: 2, materials: 7, parts: 5, title: '声音能送出去了', unlock: '天线已经接稳。城里还有人在听的话，可能会回话。' },
    { level: 3, materials: 9, parts: 7, title: '更远的频段也通了', unlock: '远处开始有回应。有人报了队伍的名字，也有人只留下坐标。' },
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
  if (!next) return { allowed: false, reason: '这处已经修好了' };
  const missingMaterials = Math.max(0, next.materials - state.inventory.materials);
  const missingParts = Math.max(0, next.parts - state.inventory.parts);
  const shortages = [missingMaterials > 0 ? `材料 ${missingMaterials}` : '', missingParts > 0 ? `零件 ${missingParts}` : ''].filter(Boolean);
  if (shortages.length) return { allowed: false, reason: `尚缺：${shortages.join(' · ')}` };
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
    lastMessage: `${V060_BUILDINGS[id].name}：${next.title}。${next.unlock}`,
  };
  return evaluatePromiseProgress(upgraded);
}
