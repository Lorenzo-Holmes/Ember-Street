# Ember Street — Canonical Visual Asset Runtime Contract

A01–A29 have been explicitly confirmed by the user as approved Ember Street project visuals. They are the authoritative visual basis for the current mobile UI.

## Release rules

1. Player UI never renders A-series identifiers. A-numbers exist only in production metadata and asset governance.
2. Runtime visuals are entirely local under `public/assets/canonical/`. No CDN or runtime network dependency is permitted.
3. All A01–A29 are `locked` for this release. Do not independently reclassify an approved image as needing correction based on an earlier draft discussion.
4. Runtime uses seven small WebP sprite sheets. The split keeps every binary below the repository connector's truncation threshold and is safer for the Xiaohongshu embedded WebView/package pipeline than the former three large sheets.
5. Release validation must run:
   - `npm run audit:assets:strict`
   - `npm run build`
   - `npm run audit:xhs`
   - `npm run test:ui-smoke`
6. The strict asset audit verifies not only file existence but also RIFF/WebP headers and declared-vs-actual byte length. A truncated WebP therefore fails CI.
7. Final visual QA uses real-image browser screenshots at 390×844, checking character crop, location focal point, event text contrast, first-screen CTA visibility, and absence of player-visible production IDs.

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

## Building level expansion

The building system has six facilities with Lv0–3 runtime state. Lv0 is the closed/unrepaired state and reuses the Lv1 art with UI treatment; the canonical art expansion therefore contains 18 level slots, not 24 unique images.

A06 already occupies the Shelter Lv1 slot, so only 17 new canonical masters are required. Reserve A30–A46 as follows; do not mark these IDs `locked` in `visualAssets.ts` until the corresponding WebP pixels have passed visual QA and are present in the repository.

| ID | Building | Level | Gameplay mapping | Import status |
|---|---|---:|---|---|
| A30 | 路线屋 | 1 | `searchStation` | pending import |
| A31 | 路线屋 | 2 | `searchStation` | pending import |
| A32 | 路线屋 | 3 | `searchStation` | pending import |
| A33 | 修车铺 | 1 | `workshop` | pending import |
| A34 | 修车铺 | 2 | `workshop` | pending import |
| A35 | 修车铺 | 3 | `workshop` | pending import |
| A36 | 诊疗室 | 1 | `clinic` | pending import |
| A37 | 诊疗室 | 2 | `clinic` | pending import |
| A38 | 诊疗室 | 3 | `clinic` | pending import |
| A39 | 街口岗 | 1 | `watchPost` | pending import |
| A40 | 街口岗 | 2 | `watchPost` | pending import |
| A41 | 街口岗 | 3 | `watchPost` | pending import |
| A42 | 广播间 | 1 | `radio` | pending import |
| A43 | 广播间 | 2 | `radio` | pending import |
| A44 | 广播间 | 3 | `radio` | pending import |
| A06 | 宿营屋 | 1 | `shelter` | locked existing master |
| A45 | 宿营屋 | 2 | `shelter` | pending import |
| A46 | 宿营屋 | 3 | `shelter` | pending import |

Building visual continuity rules:

- Lv1, Lv2 and Lv3 for one building must depict the same place from effectively the same camera position.
- Upgrade feedback comes from repair, restored utilities, additional functional equipment and long-term use; it must not read as a new building or a wealth/technology upgrade.
- Lv3 remains a civilian disaster-survival space, not a military base, command center, professional hospital, industrial workshop or modern broadcast station.
- A06 remains the authoritative Shelter Lv1 master. Shelter Lv2/Lv3 must be derived from its room language rather than replacing it with a separate shelter design.
- Level-specific runtime selection is handled through `buildingVisual(buildingId, level)`. Until a level asset is imported, the function must fall back safely rather than rendering a missing image.

### Building import procedure

1. Put the 17 approved new masters in a local staging directory using their reserved IDs as file names: `A30.png` through `A46.png` (PNG/JPG/JPEG/WebP are accepted).
2. Run `npm run build:building-assets -- <staging-directory>`. The script normalizes each tile to 480×320 and writes two mobile-sized WebP sheets:
   - `public/assets/canonical/buildings-a.webp` — A30–A38
   - `public/assets/canonical/buildings-b.webp` — A39–A46
3. Add A30–A46 to `CANONICAL_VISUAL_ASSETS` with `kind: 'building'`, the reserved `gameplayId`, `level: 1 | 2 | 3`, and `status: 'locked'` only after the pixel masters are approved.
4. Run `npm test`, `npm run audit:assets:strict`, `npm run build`, `npm run audit:xhs`, and `npm run test:ui-smoke`.
5. Perform real-device/mobile-width QA of Lv0→Lv1→Lv2→Lv3 transitions. Lv0 deliberately requests Lv1 art and relies on the closed-state UI treatment.

The build script refuses missing IDs instead of silently creating incomplete sheets. The strict asset audit remains A01–A29-compatible until new registry IDs are present; once A30+ are registered, it automatically requires the corresponding building sprite sheets and contiguous canonical coverage.

## Runtime files

The current locked release package contains seven verified WebP sheets:

- `public/assets/canonical/characters-a.webp` — A01, A02, A07
- `public/assets/canonical/characters-b.webp` — A08, A09, A10
- `public/assets/canonical/places-a.webp` — A03, A04, A06, A11, A12, A13
- `public/assets/canonical/places-b.webp` — A14, A15, A16, A17, A18
- `public/assets/canonical/events-a.webp` — A05, A19, A20, A21, A22, A23
- `public/assets/canonical/events-b1.webp` — A24, A25, A26
- `public/assets/canonical/events-b2.webp` — A27, A28, A29

The building expansion reserves two additional sheets but they are not part of the locked runtime package until their approved pixels are imported. The production mapping lives in `src/ui/visualAssets.ts`. React renders the local sheets directly through CSS background positioning. Obsolete one-file-per-A SVG wrappers and the former truncated large sprites are intentionally excluded from the runtime package.

## Source packages

The authoritative source uploads for the A01–A29 import were:

- `a01-a21(2).zip`
- `a22-a29 (2)(1).zip`

Both packages were explicitly confirmed by the user as containing previously reviewed, compliant project imagery. Where a package contained early/reference and later clean variants, the runtime package uses the selected final master while the source package remains the provenance record.
