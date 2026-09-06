# Ember Street — Canonical Visual Asset Runtime Contract

A01–A47 are the current locked visual registry for the mobile UI. A01–A29 remain the previously approved baseline; A30–A47 add level-specific building visuals. A47 is the dedicated Shelter Lv1 repair-page master, while A06 remains the general shelter overview used outside level-specific selection.

## Release rules

1. Player UI never renders A-series identifiers. A-numbers exist only in production metadata and asset governance.
2. Runtime visuals are entirely local under `public/assets/canonical/`. No CDN or runtime network dependency is permitted.
3. Locked assets must have matching local WebP pixels before they enter `CANONICAL_VISUAL_ASSETS`.
4. Runtime uses nine local WebP sprite sheets. No runtime network fetch is required.
5. Release validation must run:
   - `npm run audit:assets:strict`
   - `npm run build`
   - `npm run audit:xhs`
   - `npm run test:ui-smoke`
6. The strict asset audit verifies file existence, RIFF/WebP headers, declared-vs-actual byte length, registry continuity, sprite coverage, and the frozen SHA-256 values for the A30–A47 building sheets. A truncated, substituted, or accidentally re-encoded building sheet therefore fails CI.
7. Final visual QA uses real-image browser screenshots at 390×844, checking crop, focal point, building-level readability, first-screen CTA visibility, and absence of player-visible production IDs.

## Canonical mapping

| ID | Runtime meaning | Gameplay mapping |
|---|---|---|
| A01 | 林夏 | `lin-xia` |
| A02 | 老周 | `zhou` |
| A03 | 便利店 | `convenience-store` |
| A04 | 西街药店 | `west-pharmacy` |
| A05 | 半开的卷帘门 | `convenience-half-shutter` |
| A06 | 宿营屋 · 据点总览 | `shelter` |
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
| A30 | 路线屋 · Lv1 | `searchStation` |
| A31 | 路线屋 · Lv2 | `searchStation` |
| A32 | 路线屋 · Lv3 | `searchStation` |
| A33 | 修车铺 · Lv1 | `workshop` |
| A34 | 修车铺 · Lv2 | `workshop` |
| A35 | 修车铺 · Lv3 | `workshop` |
| A36 | 诊疗室 · Lv1 | `clinic` |
| A37 | 诊疗室 · Lv2 | `clinic` |
| A38 | 诊疗室 · Lv3 | `clinic` |
| A39 | 街口岗 · Lv1 | `watchPost` |
| A40 | 街口岗 · Lv2 | `watchPost` |
| A41 | 街口岗 · Lv3 | `watchPost` |
| A42 | 广播间 · Lv1 | `radio` |
| A43 | 广播间 · Lv2 | `radio` |
| A44 | 广播间 · Lv3 | `radio` |
| A45 | 宿营屋 · Lv2 | `shelter` |
| A46 | 宿营屋 · Lv3 | `shelter` |
| A47 | 宿营屋 · Lv1 | `shelter` |

## Building visual contract

The six facilities have Lv0–3 runtime state. Lv0 deliberately reuses the Lv1 art under the closed/unrepaired UI treatment, so the visual set contains 18 level slots rather than 24 unique images.

- Lv1, Lv2 and Lv3 for one building depict the same functional place and preserve the same overall room identity.
- Upgrade feedback comes from repair, restored utilities, additional functional equipment and long-term use; it must not read as a wealth or technology upgrade.
- Lv3 remains a civilian disaster-survival space, not a military base, command center, professional hospital, industrial workshop or modern broadcast station.
- A47 is the authoritative Shelter Lv1 building-card master. A45/A46 continue the progression into cooking, storage and long-term use. A06 remains the general shelter overview for non-level-specific contexts.
- Runtime selection is `buildingVisual(buildingId, level)`. Lv0 is clamped to Lv1.

## Building asset build procedure

Approved masters use canonical file names `A30.png` through `A47.png` (PNG/JPG/JPEG/WebP are accepted) in a staging directory. Run:

`npm run build:building-assets -- <staging-directory>`

The script normalizes each tile to 480×320 and writes two 1440×960 WebP sheets at quality 82:

- `public/assets/canonical/buildings-a.webp` — A30–A38
- `public/assets/canonical/buildings-b.webp` — A39–A47

The script refuses missing masters rather than silently producing an incomplete runtime sheet. The approved release binaries are frozen by hash; after rebuilding, `npm run audit:assets:strict` is the authority for whether the result is byte-identical to the locked release artifact.

Frozen release hashes:

- `buildings-a.webp` — `2cf279da70a23a56e5032d6263450da5bec1c6fd7095ea5ec2ca28a181f31df0`
- `buildings-b.webp` — `50c046ce115b9c09d24a5a502800f699f6f6b1be68f7b74d1a7619377f9f4648`

## Runtime files

The local release package contains nine verified WebP sheets:

- `public/assets/canonical/characters-a.webp` — A01, A02, A07
- `public/assets/canonical/characters-b.webp` — A08, A09, A10
- `public/assets/canonical/places-a.webp` — A03, A04, A06, A11, A12, A13
- `public/assets/canonical/places-b.webp` — A14, A15, A16, A17, A18
- `public/assets/canonical/events-a.webp` — A05, A19, A20, A21, A22, A23
- `public/assets/canonical/events-b1.webp` — A24, A25, A26
- `public/assets/canonical/events-b2.webp` — A27, A28, A29
- `public/assets/canonical/buildings-a.webp` — A30–A38
- `public/assets/canonical/buildings-b.webp` — A39–A47

The production mapping lives in `src/ui/visualAssets.ts`. React renders the local sheets directly through CSS background positioning. Obsolete one-file-per-A SVG wrappers and truncated sprite files are intentionally excluded from the runtime package.

## Source packages

The authoritative source uploads for this import were:

- `a01-a21(2).zip`
- `a22-a29 (2)(1).zip`

Both packages were explicitly confirmed by the user as containing previously reviewed, compliant project imagery. Where a package contained early/reference and later clean variants, the runtime package uses the selected final master while the source package remains the provenance record.

The A30–A47 building expansion was reviewed separately as a level-specific set. A47 was added specifically to stop Shelter Lv1 from reusing the old A06 overview. Final selected masters are normalized into the two building sprite sheets above; staging/source files are not required at runtime.
