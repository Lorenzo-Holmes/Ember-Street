# Ember Street — Canonical Visual Asset Runtime Contract

A01–A46 are the current local visual registry for the mobile UI. A01–A29 remain the previously approved baseline; A30–A46 add level-specific building visuals while A06 continues to serve as the authoritative Shelter Lv1 master.

## Release rules

1. Player UI never renders A-series identifiers. A-numbers exist only in production metadata and asset governance.
2. Runtime visuals are entirely local under `public/assets/canonical/`. No CDN or runtime network dependency is permitted.
3. Locked assets must have matching local WebP pixels before they enter `CANONICAL_VISUAL_ASSETS`.
4. Runtime uses small WebP sprite sheets for reliable offline rendering in the Xiaohongshu embedded WebView/package pipeline.
5. Release validation must run:
   - `npm run audit:assets:strict`
   - `npm run build`
   - `npm run audit:xhs`
   - `npm run test:ui-smoke`
6. The strict asset audit verifies file existence, RIFF/WebP headers, declared-vs-actual byte length, registry continuity, and sprite coverage.
7. Final visual QA uses real-image browser screenshots at 390×844 and checks crop, focal point, level readability, first-screen CTA visibility, and absence of player-visible production IDs.

## Canonical mapping

| ID | Runtime meaning | Gameplay mapping |
|---|---|---|
| A01 | 林夏 | `lin-xia` |
| A02 | 老周 | `zhou` |
| A03 | 便利店 | `convenience-store` |
| A04 | 西街药店 | `west-pharmacy` |
| A05 | 半开的卷帘门 | `convenience-half-shutter` |
| A06 | 宿营屋 · Lv1 | `shelter` |
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

## Building visual contract

The building system has six facilities with Lv0–3 runtime state. Lv0 is the closed/unrepaired state and deliberately reuses Lv1 art with the closed-state UI treatment, so the art set contains 18 level slots rather than 24 unique images.

- Lv1, Lv2 and Lv3 for one building depict the same functional place and preserve the same overall room identity.
- Upgrade feedback comes from repair, restored utilities, additional functional equipment and long-term use; it must not read as a wealth/technology upgrade.
- Lv3 remains a civilian disaster-survival space, not a military base, command center, professional hospital, industrial workshop or modern broadcast station.
- A06 remains the authoritative Shelter Lv1 master. A45/A46 preserve its room language and only extend cooking, storage and long-term use.
- Runtime selection is `buildingVisual(buildingId, level)`. Lv0 is clamped to Lv1.

## Building asset build procedure

Approved masters use canonical file names `A30.png` through `A46.png` in a staging directory. Run:

`npm run build:building-assets -- <staging-directory>`

The script normalizes each tile to 480×320 and writes two compressed WebP sheets:

- `public/assets/canonical/buildings-a.webp` — A30–A38
- `public/assets/canonical/buildings-b.webp` — A39–A46

The build script refuses missing IDs instead of silently creating incomplete sheets.

## Runtime files

The locked runtime package now contains nine verified WebP sheets:

- `public/assets/canonical/characters-a.webp` — A01, A02, A07
- `public/assets/canonical/characters-b.webp` — A08, A09, A10
- `public/assets/canonical/places-a.webp` — A03, A04, A06, A11, A12, A13
- `public/assets/canonical/places-b.webp` — A14, A15, A16, A17, A18
- `public/assets/canonical/events-a.webp` — A05, A19, A20, A21, A22, A23
- `public/assets/canonical/events-b1.webp` — A24, A25, A26
- `public/assets/canonical/events-b2.webp` — A27, A28, A29
- `public/assets/canonical/buildings-a.webp` — A30–A38
- `public/assets/canonical/buildings-b.webp` — A39–A46

The production mapping lives in `src/ui/visualAssets.ts`. React renders the local sheets directly through CSS background positioning.

## Source packages

The authoritative source uploads for the A01–A29 baseline were:

- `a01-a21(2).zip`
- `a22-a29 (2)(1).zip`

The A30–A46 building expansion was reviewed as a separate level-specific set before sprite import. The source/staging pack remains the provenance record; runtime uses only the compressed WebP sheets.
