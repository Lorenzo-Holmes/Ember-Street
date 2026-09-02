export type VisualAssetKind = 'character' | 'location' | 'building' | 'event';
export type VisualAssetStatus = 'locked' | 'needs-correction' | 'unresolved';

export interface VisualAsset {
  canonicalId: `A${number}`;
  kind: VisualAssetKind;
  title: string;
  path: string;
  status: VisualAssetStatus;
  gameplayId?: string;
  continuityId?: string;
}

const canonicalPath = (id: string, slug: string) => `/assets/canonical/${id.toLowerCase()}-${slug}.svg`;

/**
 * Canonical art registry for Ember Street.
 *
 * A-numbers are production identifiers only; player-facing UI uses world/gameplay copy.
 * All A01-A29 runtime masters in this registry were explicitly confirmed by the user.
 * Runtime SVG wrappers crop local WebP sprite sheets; no external resource is used.
 */
export const CANONICAL_VISUAL_ASSETS: readonly VisualAsset[] = [
  { canonicalId: 'A01', kind: 'character', title: '林夏', gameplayId: 'lin-xia', path: canonicalPath('A01', 'lin-xia'), status: 'locked' },
  { canonicalId: 'A02', kind: 'character', title: '老周', gameplayId: 'zhou', path: canonicalPath('A02', 'lao-zhou'), status: 'locked' },
  { canonicalId: 'A03', kind: 'location', title: '便利店', gameplayId: 'convenience-store', path: canonicalPath('A03', 'convenience-store'), status: 'locked' },
  { canonicalId: 'A04', kind: 'location', title: '西街药店', gameplayId: 'west-pharmacy', path: canonicalPath('A04', 'west-pharmacy'), status: 'locked' },
  { canonicalId: 'A05', kind: 'event', title: '半开的卷帘门', gameplayId: 'convenience-half-shutter', continuityId: 'convenience-store', path: canonicalPath('A05', 'half-open-shutter'), status: 'locked' },
  { canonicalId: 'A06', kind: 'building', title: '宿营屋 · 初级状态', gameplayId: 'shelter', path: canonicalPath('A06', 'shelter-lv1'), status: 'locked' },
  { canonicalId: 'A07', kind: 'character', title: '阿禾', gameplayId: 'ahe', path: canonicalPath('A07', 'a-he'), status: 'locked' },
  { canonicalId: 'A08', kind: 'character', title: '程医生', gameplayId: 'cheng', path: canonicalPath('A08', 'doctor-cheng'), status: 'locked' },
  { canonicalId: 'A09', kind: 'character', title: '阿梁', gameplayId: 'aliang', path: canonicalPath('A09', 'a-liang'), status: 'locked' },
  { canonicalId: 'A10', kind: 'character', title: '小满', gameplayId: 'xiaoman', path: canonicalPath('A10', 'xiaoman'), status: 'locked' },
  { canonicalId: 'A11', kind: 'location', title: '废弃居民楼', gameplayId: 'apartment-402', path: canonicalPath('A11', 'abandoned-apartment'), status: 'locked' },
  { canonicalId: 'A12', kind: 'location', title: '汽车修理店', gameplayId: 'auto-repair', path: canonicalPath('A12', 'auto-repair-shop'), status: 'locked' },
  { canonicalId: 'A13', kind: 'location', title: '旧学校体育馆', gameplayId: 'school', path: canonicalPath('A13', 'old-school-gym'), status: 'locked' },
  { canonicalId: 'A14', kind: 'location', title: '地铁入口', gameplayId: 'subway', path: canonicalPath('A14', 'subway-entrance'), status: 'locked' },
  { canonicalId: 'A15', kind: 'location', title: '加油站', gameplayId: 'gas-station', path: canonicalPath('A15', 'gas-station'), status: 'locked' },
  { canonicalId: 'A16', kind: 'location', title: '医院', gameplayId: 'hospital', path: canonicalPath('A16', 'hospital'), status: 'locked' },
  { canonicalId: 'A17', kind: 'location', title: '公交总站', gameplayId: 'bus-station', path: canonicalPath('A17', 'bus-terminal'), status: 'locked' },
  { canonicalId: 'A18', kind: 'location', title: '北仓库', gameplayId: 'warehouse', path: canonicalPath('A18', 'north-warehouse'), status: 'locked' },
  { canonicalId: 'A19', kind: 'event', title: '地下室的冷藏柜', gameplayId: 'pharmacy-cold-storage', continuityId: 'west-pharmacy', path: canonicalPath('A19', 'pharmacy-cold-storage'), status: 'locked' },
  { canonicalId: 'A20', kind: 'event', title: '402 的门后', gameplayId: 'apartment-door-402', continuityId: 'apartment-402', path: canonicalPath('A20', 'behind-apartment-door'), status: 'locked' },
  { canonicalId: 'A21', kind: 'event', title: '千斤顶下的工具箱', gameplayId: 'repair-jack-crate', continuityId: 'auto-repair', path: canonicalPath('A21', 'tool-crate-under-car'), status: 'locked' },
  { canonicalId: 'A22', kind: 'event', title: '体育馆名单', gameplayId: 'school-gym-roster', continuityId: 'school', path: canonicalPath('A22', 'gym-roster'), status: 'locked' },
  { canonicalId: 'A23', kind: 'event', title: '隧道里的风', gameplayId: 'subway-wind', continuityId: 'subway', path: canonicalPath('A23', 'subway-wind'), status: 'locked' },
  { canonicalId: 'A24', kind: 'event', title: '地下油罐还有压力', gameplayId: 'gas-tank-pressure', continuityId: 'gas-station', path: canonicalPath('A24', 'gas-tank-pressure'), status: 'locked' },
  { canonicalId: 'A25', kind: 'event', title: '急诊楼还有灯', gameplayId: 'hospital-er-light', continuityId: 'hospital', path: canonicalPath('A25', 'hospital-er-light'), status: 'locked' },
  { canonicalId: 'A26', kind: 'event', title: '最后一张发车表', gameplayId: 'bus-last-timetable', continuityId: 'bus-station', path: canonicalPath('A26', 'last-timetable'), status: 'locked' },
  { canonicalId: 'A27', kind: 'event', title: '卷帘门后全是货架', gameplayId: 'warehouse-full-racks', continuityId: 'warehouse', path: canonicalPath('A27', 'shelves-behind-shutter'), status: 'locked' },
  { canonicalId: 'A28', kind: 'event', title: '医院隔离病房', gameplayId: 'hospital-isolation-ward', continuityId: 'hospital', path: canonicalPath('A28', 'hospital-isolation-ward'), status: 'locked' },
  { canonicalId: 'A29', kind: 'event', title: '避难所加固材料箱', gameplayId: 'warehouse-protection-crate', continuityId: 'warehouse', path: canonicalPath('A29', 'fortification-materials-crate'), status: 'locked' },
] as const;

export const UNRESOLVED_CANONICAL_IDS = [] as const;

function byGameplayId(kind: VisualAssetKind, gameplayId: string): VisualAsset | undefined {
  return CANONICAL_VISUAL_ASSETS.find((asset) => asset.kind === kind && asset.gameplayId === gameplayId && asset.status === 'locked');
}

export const characterVisual = (survivorId: string) => byGameplayId('character', survivorId);
export const locationVisual = (locationId: string) => byGameplayId('location', locationId);
export const eventVisual = (eventId: string) => byGameplayId('event', eventId);
export const buildingVisual = (buildingId: string) => byGameplayId('building', buildingId);
