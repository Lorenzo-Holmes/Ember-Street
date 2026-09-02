# Ember Street — Canonical Visual Asset Runtime Contract

A01–A29 have been explicitly confirmed by the user as approved Ember Street project visuals. They are the authoritative visual basis for the current mobile UI.

## Release rules

1. Player UI never renders A-series identifiers. A-numbers exist only in production metadata and asset governance.
2. Runtime visuals are entirely local under `public/assets/canonical/`. No CDN or runtime network dependency is permitted.
3. All A01–A29 are `locked` for this release. Do not independently reclassify an approved image as needing correction based on an earlier draft discussion.
4. Runtime uses three compressed WebP sprite sheets for package efficiency. One-file-per-A SVG wrappers remain as canonical mapping/debug artifacts, while React renders the WebP sprites directly through CSS background positioning for embedded-WebView compatibility.
5. Release validation must run:
   - `npm run audit:assets:strict`
   - `npm run build`
   - `npm run audit:xhs`
   - `npm run test:ui-smoke`
6. Final visual QA uses real-image browser screenshots at 390×844, checking character crop, location focal point, event text contrast, first-screen CTA visibility, and absence of player-visible production IDs.

## Canonical mapping

| ID | Runtime meaning | Gameplay mapping |
|---|---|---|
| A01 | 林夏 | `lin-xia` |
| A02 | 老周 | `zhou` |
| A03 | 便利店 | `convenience-store` |
| A04 | 西街药店 | `west-pharmacy` |
| A05 | 半开的卷帘门 | `convenience-half-shutter` |
| A06 | 宿营屋 · 初级状态 | `shelter` |
| A07 | 阿禾 | `ahe` |
| A08 | 程医生 | `cheng` |
| A09 | 阿梁 | `aliang` |
| A10 | 小满 | `xiaoman` |
| A11 | 废弃居民楼 | `apartment-402` |
| A12 | 汽车修理店 | `auto-repair` |
| A13 | 旧学校体育馆 | `school` |
| A14 | 地铁入口 | `subway` |
| A15 | 加油站 | `gas-station` |
| A16 | 医院 | `hospital` |
| A17 | 公交总站 | `bus-station` |
| A18 | 北仓库 | `warehouse` |
| A19 | 地下室的冷藏柜 | `pharmacy-cold-storage` |
| A20 | 402 的门后 | `apartment-door-402` |
| A21 | 千斤顶下的工具箱 | `repair-jack-crate` |
| A22 | 体育馆名单 | `school-gym-roster` |
| A23 | 隧道里的风 | `subway-wind` |
| A24 | 地下油罐还有压力 | `gas-tank-pressure` |
| A25 | 急诊楼还有灯 | `hospital-er-light` |
| A26 | 最后一张发车表 | `bus-last-timetable` |
| A27 | 卷帘门后全是货架 | `warehouse-full-racks` |
| A28 | 医院隔离病房 | `hospital-isolation-ward` |
| A29 | 避难所加固材料箱 | `warehouse-protection-crate` |

## Runtime files

Compressed source sheets bundled into the mini-tool package:

- `public/assets/canonical/canonical-characters.webp`
- `public/assets/canonical/canonical-places.webp`
- `public/assets/canonical/canonical-events.webp`

Approximate runtime payload is about 0.6 MB for all 29 approved visual masters, rather than shipping every original PNG independently.

A01–A29 also each have a small local SVG crop wrapper under `public/assets/canonical/`. These wrappers preserve a human-readable one-to-one file mapping and are checked by the asset audit. The actual V1 UI uses `visualAssetStyle()` in `src/ui/visualAssets.ts` to crop the sprite sheets directly.

## Source packages

The authoritative source uploads for this import were:

- `a01-a21(2).zip`
- `a22-a29 (2)(1).zip`

Both packages were explicitly confirmed by the user as containing previously reviewed, compliant project imagery. Where a package contained early/reference and later clean variants, the runtime package uses one clean final master for that A-number while the source package remains the provenance record.
