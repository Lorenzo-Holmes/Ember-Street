import type { BuildingId } from '../game/types';

export type IllustrationMode = 'event' | 'character' | 'location' | 'none';

export interface CharacterIllustrationSpec {
  portrait: string;
  avatarCrop?: string;
  fatigued?: string;
  injured?: string;
}

export interface LocationIllustrationSpec {
  image: string;
  thumbnail?: string;
  visited?: string;
  night?: string;
}

export interface EventIllustrationSpec {
  illustration?: string;
  illustrationMode: IllustrationMode;
  characterId?: string;
  locationId?: string;
}

export interface BuildingIllustrationSpec {
  imageLv0?: string;
  imageLv1?: string;
  imageLv2?: string;
  imageLv3?: string;
}

export const ANCHOR_ASSET_PATHS = {
  linXia: '/assets/illustrations/anchors/A01-lin-xia-master.webp',
  zhou: '/assets/illustrations/anchors/A02-zhou-master.webp',
  convenienceStore: '/assets/illustrations/anchors/A03-convenience-store-master.webp',
  westPharmacy: '/assets/illustrations/anchors/A04-west-pharmacy-master.webp',
  convenienceHalfShutter: '/assets/illustrations/anchors/A05-convenience-half-shutter-master.webp',
  shelterLv1: '/assets/illustrations/anchors/A06-shelter-lv1-master.webp',
} as const;

export const CHARACTER_ART: Partial<Record<string, CharacterIllustrationSpec>> = {};
export const LOCATION_ART: Partial<Record<string, LocationIllustrationSpec>> = {};
export const EVENT_ART: Partial<Record<string, EventIllustrationSpec>> = {};
export const BUILDING_ART: Partial<Record<BuildingId, BuildingIllustrationSpec>> = {};

export function nearestBuildingIllustration(
  spec: BuildingIllustrationSpec | undefined,
  level: number,
): string | undefined {
  if (!spec) return undefined;
  const bounded = Math.max(0, Math.min(3, Math.floor(level)));
  for (let current = bounded; current >= 0; current -= 1) {
    const key = `imageLv${current}` as keyof BuildingIllustrationSpec;
    const value = spec[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export function resolveEventIllustration(spec: EventIllustrationSpec | undefined): EventIllustrationSpec {
  return spec ?? { illustrationMode: 'none' };
}
