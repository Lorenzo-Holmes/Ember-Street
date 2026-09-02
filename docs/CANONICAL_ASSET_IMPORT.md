# Ember Street — Canonical Visual Asset Import Checklist

This file is the handoff contract for importing approved A-series masters into the offline Xiaohongshu mini-tool package.

## Release rules

1. Player UI never renders A-series identifiers. A-numbers exist only in the asset registry and source-file workflow.
2. All release images live under `public/assets/canonical/` and are bundled locally. No CDN or runtime network dependency is permitted.
3. Locked masters may be imported without redesign. `needs-correction` masters are blocked from release even if a file with that A-number exists.
4. Unknown A-numbers are never inferred from neighboring assets. A19 remains unresolved until source evidence is supplied.
5. After import, run:
   - `npm run audit:assets`
   - `npm run audit:assets:strict`
   - `npm run build`
   - `npm run audit:xhs`
   - `npm run test:ui-smoke`
6. Final visual QA must use browser screenshots at 390×844 with the real images, especially checking character crop, location focal point, event text contrast, and first-screen CTA visibility.

## Locked masters expected for the current release

| ID | Player meaning | Required package path |
|---|---|---|
| A01 | 林夏 | `public/assets/canonical/a01-lin-xia.webp` |
| A02 | 老周 | `public/assets/canonical/a02-lao-zhou.webp` |
| A03 | 便利店 | `public/assets/canonical/a03-convenience-store.webp` |
| A04 | 西街药店 | `public/assets/canonical/a04-west-pharmacy.webp` |
| A05 | 半开的卷帘门 | `public/assets/canonical/a05-half-open-shutter.webp` |
| A06 | 宿营屋 · 初级状态 | `public/assets/canonical/a06-shelter-lv1.webp` |
| A07 | 阿禾 | `public/assets/canonical/a07-a-he.webp` |
| A08 | 程医生 | `public/assets/canonical/a08-doctor-cheng.webp` |
| A09 | 阿梁 | `public/assets/canonical/a09-a-liang.webp` |
| A10 | 小满 | `public/assets/canonical/a10-xiaoman.webp` |
| A11 | 废弃居民楼 | `public/assets/canonical/a11-abandoned-apartment.webp` |
| A12 | 汽车修理店 | `public/assets/canonical/a12-auto-repair-shop.webp` |
| A13 | 旧学校体育馆 | `public/assets/canonical/a13-old-school-gym.webp` |
| A14 | 地铁入口 | `public/assets/canonical/a14-subway-entrance.webp` |
| A15 | 加油站 | `public/assets/canonical/a15-gas-station.webp` |
| A16 | 医院 | `public/assets/canonical/a16-hospital.webp` |
| A17 | 公交总站 | `public/assets/canonical/a17-bus-terminal.webp` |
| A18 | 北仓库 | `public/assets/canonical/a18-north-warehouse.webp` |
| A20 | 门后有人 | `public/assets/canonical/a20-behind-apartment-door.webp` |
| A21 | 千斤顶下的工具箱 | `public/assets/canonical/a21-tool-crate-under-car.webp` |
| A22 | 体育馆名单 | `public/assets/canonical/a22-gym-roster.webp` |
| A23 | 隧道里的风 | `public/assets/canonical/a23-subway-wind.webp` |
| A24 | 地下油罐还有压力 | `public/assets/canonical/a24-gas-tank-pressure.webp` |
| A25 | 急诊楼还有灯 | `public/assets/canonical/a25-hospital-er-light.webp` |
| A26 | 最后一张发车表 | `public/assets/canonical/a26-last-timetable.webp` |
| A28 | 医院隔离病房 | `public/assets/canonical/a28-hospital-isolation-ward.webp` |

## Blocked assets

- **A27** — “卷帘门后全是货架”, associated with the North Warehouse (`warehouse-full-racks`). Current status: `needs-correction`. Do not ship as canonical until the corrected master is approved.
- **A29** — warehouse fortification-materials crate (`warehouse-protection-crate`). Current status: `needs-correction`. Expected content is civilian shelter reinforcement material, not weapons, ammunition, tactical gear, or PPE-focused loot.

## Unresolved

- **A19** — no sufficiently reliable source mapping is currently available. Keep unresolved; do not invent a title, scene, or gameplay ID.

## Accepted source upload format

For handoff, source images may be PNG, JPG/JPEG, or WebP. The easiest package is one ZIP where each filename contains the canonical identifier, e.g. `A01.png`, `A02_final.jpg`, `A22-approved.webp`.

The import pass will:
1. identify files by A-number;
2. reject duplicates or ambiguous IDs;
3. exclude A27/A29 unless a corrected master has explicitly been approved;
4. leave A19 untouched unless its identity is supplied with source evidence;
5. convert release copies to WebP while retaining the source master outside the runtime package;
6. write the exact package filenames listed above;
7. run strict asset, package, build and mobile screenshot validation.
