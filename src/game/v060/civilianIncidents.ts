import { nextRandom } from '../rng';
import type { GameState } from '../types';
import { communityDefenseSupport, normalizeCommunityState } from './community';

export type CivilianLossKind = 'death' | 'departure' | 'missing';
export type CivilianIncidentDecision = 'professional' | 'resource' | 'risk';
export type CivilianIncidentId = 'fever' | 'stampede' | 'hidden-bite' | 'kitchen-fire';

export interface CivilianIncident {
  id: CivilianIncidentId;
  title: string;
  body: string;
  minResidents: number;
}

export const CIVILIAN_INCIDENTS: CivilianIncident[] = [
  { id: 'fever', title: '宿营屋里的高烧', body: '一个刚安置不久的居民高烧不退。现在还不能确认是不是感染。', minResidents: 3 },
  { id: 'stampede', title: '北门踩踏', body: '外面的撞击突然变密。有人往宿营屋跑，有人坚持要去找家人，门口挤成了一团。', minResidents: 5 },
  { id: 'hidden-bite', title: '有人藏起了咬伤', body: '换绷带时发现了不该出现的齿痕。那个人一直说只是被铁丝划伤。', minResidents: 4 },
  { id: 'kitchen-fire', title: '火从厨房起来', body: '油烟和旧线路一起冒出了火。宿营屋里的人比灭火工具更多。', minResidents: 4 },
];

const pendingPrefix = 'civilian_incident_pending:';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function applyCivilianLoss(state: GameState, count: number, kind: CivilianLossKind, cause: string): GameState {
  const amount = Math.min(state.civilianResidents, Math.max(0, Math.floor(count)));
  if (!amount) return state;

  const community = normalizeCommunityState(state.communityState, state.civilianResidents);
  const fromActive = Math.min(community.activeResidents, amount);
  const remaining = amount - fromActive;
  const fromPending = Math.min(community.pendingResidents, remaining);
  const activeResidents = Math.max(0, community.activeResidents - fromActive);
  const pendingResidents = Math.max(0, community.pendingResidents - fromPending);
  const hopeLoss = kind === 'death' ? Math.min(6, amount * 2) : kind === 'missing' ? Math.min(4, amount) : Math.min(3, amount);

  return {
    ...state,
    civilianResidents: Math.max(0, state.civilianResidents - amount),
    communityState: { ...community, activeResidents, pendingResidents },
    hope: Math.max(0, state.hope - hopeLoss),
    storyFlags: [...state.storyFlags, `civilian_loss:${kind}:${state.day}:${amount}:${cause}`],
    lastMessage: kind === 'death'
      ? `${cause} · ${amount} 名居民没能活下来。`
      : kind === 'missing'
        ? `${cause} · ${amount} 名居民失踪。`
        : `${cause} · ${amount} 名居民离开了街区。`,
  };
}

function incidentEligible(state: GameState, incident: CivilianIncident): boolean {
  if (state.civilianResidents < incident.minResidents) return false;
  if (incident.id === 'fever') return state.buildings.clinic < 3 || state.inventory.medicine < 2;
  if (incident.id === 'stampede') return state.defense < 75 || state.hope < 45;
  if (incident.id === 'hidden-bite') return state.day >= 6;
  if (incident.id === 'kitchen-fire') return state.buildings.shelter > 0;
  return true;
}

export function scheduleCivilianIncident(state: GameState): GameState {
  if (state.storyFlags.some((flag) => flag.startsWith(pendingPrefix))) return state;
  const pool = CIVILIAN_INCIDENTS.filter((incident) => incidentEligible(state, incident));
  if (!pool.length) return state;

  const baseRisk = state.civilianResidents >= 10 ? 0.28 : state.civilianResidents >= 6 ? 0.2 : 0.12;
  const hopePressure = state.hope < 20 ? 0.12 : state.hope < 35 ? 0.06 : 0;
  const defenseProtection = communityDefenseSupport(state);
  const chance = clamp(baseRisk + hopePressure - defenseProtection, 0.04, 0.45);
  const [roll, afterRoll] = nextRandom(state.rngState);
  if (roll >= chance) return { ...state, rngState: afterRoll };
  const [pick, afterPick] = nextRandom(afterRoll);
  const incident = pool[Math.min(pool.length - 1, Math.floor(pick * pool.length))];
  return {
    ...state,
    rngState: afterPick,
    storyFlags: [...state.storyFlags, `${pendingPrefix}${incident.id}:${state.day}`],
    lastMessage: incident.title,
  };
}

export function pendingCivilianIncident(state: GameState): CivilianIncident | null {
  const raw = state.storyFlags.find((flag) => flag.startsWith(pendingPrefix));
  if (!raw) return null;
  const id = raw.split(':')[1] as CivilianIncidentId;
  return CIVILIAN_INCIDENTS.find((incident) => incident.id === id) ?? null;
}

function clearPending(state: GameState, id: CivilianIncidentId): GameState {
  return {
    ...state,
    storyFlags: state.storyFlags.filter((flag) => !flag.startsWith(`${pendingPrefix}${id}:`)),
  };
}

function resolveSafely(state: GameState, incident: CivilianIncident, note: string): GameState {
  const next = clearPending(state, incident.id);
  return {
    ...next,
    storyFlags: [...next.storyFlags, `civilian_incident_resolved:${incident.id}:${state.day}`],
    lastMessage: note,
  };
}

export function resolveCivilianIncident(state: GameState, decision: CivilianIncidentDecision): GameState {
  const incident = pendingCivilianIncident(state);
  if (!incident) return state;

  if (incident.id === 'fever') {
    if (decision === 'professional' && state.buildings.clinic > 0 && state.survivors.some((s) => state.dayAssignments[s.id] === 'medical' && s.condition !== 'dead' && s.condition !== 'missing')) {
      return resolveSafely(state, incident, '医疗岗位把高烧居民单独观察起来。今晚没有人死亡。');
    }
    if (decision === 'resource' && state.inventory.medicine > 0) {
      return resolveSafely({ ...state, inventory: { ...state.inventory, medicine: state.inventory.medicine - 1 } }, incident, '消耗药品后，居民的情况稳定下来。');
    }
    return applyCivilianLoss(clearPending(state, incident.id), 1, 'death', '高烧恶化');
  }

  if (incident.id === 'stampede') {
    if (decision === 'professional' && (communityDefenseSupport(state) >= 0.02 || state.survivors.some((s) => state.dayAssignments[s.id] === 'watch'))) {
      return resolveSafely(state, incident, '守备人员和居民轮值把人群分流开。北门没有发生伤亡。');
    }
    if (decision === 'resource' && state.inventory.materials >= 2) {
      return resolveSafely({ ...state, inventory: { ...state.inventory, materials: state.inventory.materials - 2 }, defense: Math.min(100, state.defense + 2) }, incident, '临时隔离栏把人流分开。');
    }
    const loss = state.hope < 15 ? 2 : 1;
    return applyCivilianLoss(clearPending(state, incident.id), loss, 'death', '北门踩踏');
  }

  if (incident.id === 'hidden-bite') {
    if (decision === 'professional' && state.buildings.clinic >= 2) {
      return resolveSafely(state, incident, '诊疗站完成筛查，疑似者被及时隔离。');
    }
    if (decision === 'resource' && state.inventory.medicine >= 2) {
      return resolveSafely({ ...state, inventory: { ...state.inventory, medicine: state.inventory.medicine - 2 }, hope: Math.max(0, state.hope - 1) }, incident, '全面检查让所有人都很紧张，但感染没有扩散。');
    }
    const loss = state.civilianResidents >= 8 ? 2 : 1;
    return applyCivilianLoss(clearPending(state, incident.id), loss, 'death', '感染扩散');
  }

  if (decision === 'professional' && state.survivors.some((s) => state.dayAssignments[s.id] === 'repair') && state.buildings.workshop > 0) {
    return resolveSafely(state, incident, '维修岗位切断线路并控制住厨房火势。');
  }
  if (decision === 'resource' && state.inventory.materials >= 2) {
    return resolveSafely({ ...state, inventory: { ...state.inventory, materials: state.inventory.materials - 2 }, defense: Math.max(0, state.defense - 1) }, incident, '用材料封住火路，宿营屋保住了。');
  }
  return applyCivilianLoss({ ...clearPending(state, incident.id), defense: Math.max(0, state.defense - 4) }, 1, 'death', '厨房火灾');
}

export function civilianLossHistory(state: GameState): string[] {
  return state.storyFlags.filter((flag) => flag.startsWith('civilian_loss:'));
}
