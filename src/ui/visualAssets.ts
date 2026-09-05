import type { CSSProperties } from 'react';

export type VisualAssetKind = 'character' | 'location' | 'building' | 'event';
export type VisualAssetStatus = 'locked' | 'needs-correction' | 'unresolved';
export type BuildingVisualLevel = 1 | 2 | 3;

export interface VisualAsset {
  canonicalId: `A${number}`;
  kind: VisualAssetKind;
  title: string;
  status: VisualAssetStatus;
  gameplayId?: string;
  continuityId?: string;
  level?: BuildingVisualLevel;
}

interface SpriteGroup {
  path: string;
  columns: number;
  rows: number;
  ids: readonly VisualAsset['canonicalId'][];
}

const SPRITES: readonly SpriteGroup[] = [
  { path: '/assets/canonical/characters-a.webp', columns: 3, rows: 1, ids: ['A01', 'A02', 'A07'] },
  { path: '/assets/canonical/characters-b.webp', columns: 3, rows: 1, ids: ['A08', 'A09', 'A10'] },
  { path: '/assets/canonical/places-a.webp', columns: 3, rows: 2, ids: ['A03', 'A04', 'A06', 'A11', 'A12', 'A13'] },
  { path: '/assets/canonical/places-b.webp', columns: 3, rows: 2, ids: ['A14', 'A15', 'A16', 'A17', 'A18'] },
  { path: '/assets/canonical/events-a.webp', columns: 3, rows: 2, ids: ['A05', 'A19', 'A20', 'A21', 'A22', 'A23'] },
  { path: '/assets/canonical/events-b1.webp', columns: 3, rows: 1, ids: ['A24', 'A25', 'A26'] },
  { path: '/assets/canonical/events-b2.webp', columns: 3, rows: 1, ids: ['A27', 'A28', 'A29'] },
] as const;

/**
 * Canonical art registry for Ember Street.
 * A-numbers are production identifiers only; player-facing UI uses world/gameplay copy.
 * A01-A29 are all user-approved and locked. Runtime art is bundled in seven verified,
 * mobile-sized WebP sprite sheets for reliable offline rendering in the Xiaohongshu tool.
 */
export const CANONICAL_VISUAL_ASSETS: readonly VisualAsset[] = [
  { canonicalId: 'A01', kind: 'character', title: '林夏', gameplayId: 'lin-xia', status: 'locked' },
  { canonicalId: 'A02', kind: 'character', title: '老周', gameplayId: 'zhou', status: 'locked' },
  { canonicalId: 'A03', kind: 'location', title: '便利店', gameplayId: 'convenience-store', status: 'locked' },
  { canonicalId: 'A04', kind: 'location', title: '西街药店', gameplayId: 'west-pharmacy', status: 'locked' },
  { canonicalId: 'A05', kind: 'event', title: '半开的卷帘门', gameplayId: 'convenience-half-shutter', continuityId: 'convenience-store', status: 'locked' },
  { canonicalId: 'A06', kind: 'building', title: '宿营屋 · 初级状态', gameplayId: 'shelter', level: 1, status: 'locked' },
  { canonicalId: 'A07', kind: 'character', title: '阿禾', gameplayId: 'ahe', status: 'locked' },
  { canonicalId: 'A08', kind: 'character', title: '程医生', gameplayId: 'cheng', status: 'locked' },
  { canonicalId: 'A09', kind: 'character', title: '阿梁', gameplayId: 'aliang', status: 'locked' },
  { canonicalId: 'A10', kind: 'character', title: '小满', gameplayId: 'xiaoman', status: 'locked' },
  { canonicalId: 'A11', kind: 'location', title: '废弃居民楼', gameplayId: 'apartment-402', status: 'locked' },
  { canonicalId: 'A12', kind: 'location', title: '汽车修理店', gameplayId: 'auto-repair', status: 'locked' },
  { canonicalId: 'A13', kind: 'location', title: '旧学校体育馆', gameplayId: 'school', status: 'locked' },
  { canonicalId: 'A14', kind: 'location', title: '地铁入口', gameplayId: 'subway', status: 'locked' },
  { canonicalId: 'A15', kind: 'location', title: '加油站', gameplayId: 'gas-station', status: 'locked' },
  { canonicalId: 'A16', kind: 'location', title: '医院', gameplayId: 'hospital', status: 'locked' },
  { canonicalId: 'A17', kind: 'location', title: '公交总站', gameplayId: 'bus-station', status: 'locked' },
  { canonicalId: 'A18', kind: 'location', title: '北仓库', gameplayId: 'warehouse', status: 'locked' },
  { canonicalId: 'A19', kind: 'event', title: '地下室的冷藏柜', gameplayId: 'pharmacy-cold-storage', continuityId: 'west-pharmacy', status: 'locked' },
  { canonicalId: 'A20', kind: 'event', title: '402 的门后', gameplayId: 'apartment-door-402', continuityId: 'apartment-402', status: 'locked' },
  { canonicalId: 'A21', kind: 'event', title: '千斤顶下的工具箱', gameplayId: 'repair-jack-crate', continuityId: 'auto-repair', status: 'locked' },
  { canonicalId: 'A22', kind: 'event', title: '体育馆名单', gameplayId: 'school-gym-roster', continuityId: 'school', status: 'locked' },
  { canonicalId: 'A23', kind: 'event', title: '隧道里的风', gameplayId: 'subway-wind', continuityId: 'subway', status: 'locked' },
  { canonicalId: 'A24', kind: 'event', title: '地下油罐还有压力', gameplayId: 'gas-tank-pressure', continuityId: 'gas-station', status: 'locked' },
  { canonicalId: 'A25', kind: 'event', title: '急诊楼还有灯', gameplayId: 'hospital-er-light', continuityId: 'hospital', status: 'locked' },
  { canonicalId: 'A26', kind: 'event', title: '最后一张发车表', gameplayId: 'bus-last-timetable', continuityId: 'bus-station', status: 'locked' },
  { canonicalId: 'A27', kind: 'event', title: '卷帘门后全是货架', gameplayId: 'warehouse-full-racks', continuityId: 'warehouse', status: 'locked' },
  { canonicalId: 'A28', kind: 'event', title: '医院隔离病房', gameplayId: 'hospital-isolation-ward', continuityId: 'hospital', status: 'locked' },
  { canonicalId: 'A29', kind: 'event', title: '避难所加固材料箱', gameplayId: 'warehouse-protection-crate', continuityId: 'warehouse', status: 'locked' },
] as const;

export const UNRESOLVED_CANONICAL_IDS = [] as const;

function byGameplayId(kind: VisualAssetKind, gameplayId: string, level?: BuildingVisualLevel): VisualAsset | undefined {
  const matches = CANONICAL_VISUAL_ASSETS.filter((asset) => asset.kind === kind && asset.gameplayId === gameplayId && asset.status === 'locked');
  if (level !== undefined) {
    const exact = matches.find((asset) => asset.level === level);
    if (exact) return exact;
  }
  return matches.find((asset) => asset.level === undefined) ?? matches[0];
}

export function visualAssetStyle(asset?: VisualAsset): CSSProperties | undefined {
  if (!asset) return undefined;
  const group = SPRITES.find((item) => item.ids.includes(asset.canonicalId));
  if (!group) return undefined;
  const index = group.ids.indexOf(asset.canonicalId);
  const column = index % group.columns;
  const row = Math.floor(index / group.columns);
  const x = group.columns <= 1 ? 0 : (column / (group.columns - 1)) * 100;
  const y = group.rows <= 1 ? 0 : (row / (group.rows - 1)) * 100;
  return {
    backgroundImage: `url(${group.path})`,
    backgroundSize: `${group.columns * 100}% ${group.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export const characterVisual = (survivorId: string) => byGameplayId('character', survivorId);
export const locationVisual = (locationId: string) => byGameplayId('location', locationId);
export const eventVisual = (eventId: string) => byGameplayId('event', eventId);
export const buildingVisual = (buildingId: string, level?: number) => {
  const requestedLevel = level === undefined
    ? undefined
    : Math.max(1, Math.min(3, Math.floor(level))) as BuildingVisualLevel;
  return byGameplayId('building', buildingId, requestedLevel);
};
