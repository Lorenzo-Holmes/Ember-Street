import type { CSSProperties } from 'react';
import type { BuildingId } from '../game/types';
import { buildingVisual, visualAssetStyle } from './visualAssets';

export type BuildingVisualStatus = 'ready' | 'pending';

export interface BuildingVisualSpec {
  id: BuildingId;
  title: string;
  status: BuildingVisualStatus;
  path?: string;
  backgroundPosition?: string;
}

/**
 * Facility art is intentionally kept outside the canonical A01-A29 registry.
 * The canonical package is frozen for release auditing; shelter reuses A06 while
 * the other five facilities receive dedicated environment art in /assets/buildings.
 * This prevents exploration-location art from being reused as misleading base art.
 */
export const BUILDING_VISUALS: Record<BuildingId, BuildingVisualSpec> = {
  searchStation: {
    id: 'searchStation',
    title: '路线屋',
    status: 'pending',
    path: '/assets/buildings/search-station.webp',
  },
  workshop: {
    id: 'workshop',
    title: '修车铺',
    status: 'pending',
    path: '/assets/buildings/workshop.webp',
  },
  clinic: {
    id: 'clinic',
    title: '诊疗室',
    status: 'pending',
    path: '/assets/buildings/clinic.webp',
  },
  watchPost: {
    id: 'watchPost',
    title: '街口岗',
    status: 'pending',
    path: '/assets/buildings/watch-post.webp',
  },
  shelter: {
    id: 'shelter',
    title: '宿营屋',
    status: 'ready',
  },
  radio: {
    id: 'radio',
    title: '广播间',
    status: 'pending',
    path: '/assets/buildings/radio-room.webp',
  },
};

export const PENDING_BUILDING_VISUAL_IDS = (Object.keys(BUILDING_VISUALS) as BuildingId[])
  .filter((id) => BUILDING_VISUALS[id].status !== 'ready');

export function buildingSceneStatus(id: BuildingId): BuildingVisualStatus {
  return BUILDING_VISUALS[id].status;
}

export function buildingSceneStyle(id: BuildingId): CSSProperties | undefined {
  if (id === 'shelter') return visualAssetStyle(buildingVisual('shelter'));
  const spec = BUILDING_VISUALS[id];
  if (spec.status !== 'ready' || !spec.path) return undefined;
  return {
    backgroundImage: `url(${spec.path})`,
    backgroundSize: 'cover',
    backgroundPosition: spec.backgroundPosition ?? 'center',
    backgroundRepeat: 'no-repeat',
  };
}
