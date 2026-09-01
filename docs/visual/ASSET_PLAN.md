# Ember Street — Illustration Asset Plan

## Phase 1 — Anchor Set

Expected production files:

```text
public/assets/illustrations/
  anchors/
    A01-lin-xia-master.webp
    A02-zhou-master.webp
    A03-convenience-store-master.webp
    A04-west-pharmacy-master.webp
    A05-convenience-half-shutter-master.webp
    A06-shelter-lv1-master.webp
```

Keep lossless/high-resolution masters outside the runtime bundle if desired. Runtime WebP/AVIF derivatives should prioritize small-file readability.

## Phase 2 — First Production Batch

### Characters — 6

1. lin-xia — 林夏 — search
2. zhou — 老周 — repair
3. ahe — 阿禾 — cook
4. cheng — 程医生 — medical
5. aliang — 阿梁 — watch
6. xiaoman — 小满 — radio

Recommended runtime structure:

```text
characters/<id>/portrait.webp
characters/<id>/avatar.webp
characters/<id>/fatigued.webp      # optional later
characters/<id>/injured.webp       # optional later
```

### Locations — 10

1. convenience-store — 便利店
2. west-pharmacy — 西街药店
3. apartment-402 — 废弃居民楼
4. auto-repair — 汽车修理店
5. school — 旧学校
6. subway — 地铁入口
7. gas-station — 加油站
8. hospital — 医院
9. bus-station — 公交总站
10. warehouse — 北仓库

Recommended runtime structure:

```text
locations/<id>/image.webp
locations/<id>/thumbnail.webp
locations/<id>/night.webp          # optional later
locations/<id>/visited.webp        # optional later
```

### Events — first 12

Do not illustrate events evenly. Favor emotional and high-pressure anchors.

Initial candidates:

- convenience-half-shutter
- survivor-call
- blood-trail
- apartment-door-402
- stray-horde
- medical crisis / shortage event
- fire / structural failure event
- missing-person crisis
- final-horde-north-gate
- final-horde-power-grid
- final-horde-community
- final-horde-last-line

Recommended event data contract:

```ts
illustration?: string
illustrationMode?: 'event' | 'character' | 'location' | 'none'
```

Fallback priority:

```text
specific event art
  -> associated character portrait
  -> associated location art
  -> no image
```

Never show a generic unrelated apocalypse image just to avoid an empty slot.

### Buildings

Current v0.6 game data exposes six actual building systems, not eight:

- searchStation — 搜索站
- workshop — 修理工坊
- clinic — 诊疗站
- watchPost — 守夜岗
- shelter — 宿营屋
- radio — 广播亭

Use actual game data as source of truth. If future UI adds storage/rest/cooking visual modules, treat them as shelter/community subspaces unless game mechanics define them as standalone buildings.

Recommended runtime structure:

```text
buildings/<id>/lv0.webp
buildings/<id>/lv1.webp
buildings/<id>/lv2.webp
buildings/<id>/lv3.webp
```

Do not require all levels at first. Fallback to nearest available lower-level illustration.

## Integration rule

Art metadata should stay outside `GameState` and save files. Illustration identity is presentation metadata, not campaign state.

This prevents visual revisions from requiring save migrations and allows production images to be replaced without changing gameplay logic.