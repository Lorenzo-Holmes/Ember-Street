# Ember Street · Facility Visual Pass V1

This pass fills the five base-facility images that are currently missing from the building page without changing the frozen A01-A29 canonical package.

## Shared production rules

- Master composition: 4:3 horizontal; runtime crop must remain readable at roughly 16:7 to 16:8 on a 390px mobile viewport.
- Same world as A01-A29: graphite, charcoal, rough ink, paper-like grain, restrained gray-brown-cold-blue palette.
- Ordinary Chinese neighborhood architecture only: aged plaster, concrete, old tile, oxidized metal, worn wood, old wiring, reused civilian furniture.
- Civilian improvisation before spectacle. No military bunker, survivor fortress, tactical command post, sci-fi equipment, neon, polished base-building fantasy, or heroic staging.
- No readable Chinese/English text, numbers, logos, labels, UI, borders, poster layout, infographic, or watermark inside the art.
- One environment illustration per facility. People may be absent or tiny incidental silhouettes; the room/place is the subject.
- Keep one calm low-detail region around the upper-left/upper-center so crops and overlays stay usable.
- Do not borrow expedition-location art. Base facilities must read as parts of the home shelter, not places the player is scavenging.
- The single master should look like an early usable / recently repaired state: damaged enough to remain credible at Lv0-Lv1, but not so ruined that Lv2-Lv3 descriptions become impossible.

## `search-station.webp` · 路线屋

A cramped former back room repurposed for route planning. A damaged plaster wall carries overlapping paper maps with only abstract unreadable graphite marks, thread, pins, simple route symbols and hand-added corrections. A scarred table holds pencils, folded paper, a flashlight and a few small scavenged objects. One old window or doorway gives weak cold daylight. The room should communicate memory, uncertainty and practical route planning, not a military operations room.

## `workshop.webp` · 修车铺

A small civilian repair corner inside/adjacent to the shelter: worn workbench, hand tools, vice, old car battery, wire, fasteners, metal offcuts and a few repairable components. Some power has been improvised back to one old lamp or welding point, but the room remains cramped and patched. No racing garage, giant industrial shop, weapon bench, armored vehicle or tactical equipment. This is where ordinary people keep broken things working.

## `clinic.webp` · 诊疗室

A modest improvised treatment room: one narrow bed or cot, faded gray-green metal cabinet, enamel basin, folded bandage/gauze, old first-aid bag, curtain or sheet divider and one restrained practical light. Surfaces are stained and repeatedly cleaned rather than pristine. No full hospital ward, modern monitors, dramatic operating room, bright red medical branding, or abundance of supplies. The image should communicate limited care under scarcity.

## `watch-post.webp` · 街口岗

A damaged street-corner guard room / former gate kiosk made usable again by civilians. Patched window frame, simple raised observation position or roof access, old chair/stool, flashlight, improvised bell/wire alarm and repaired boards/metal around the opening. The street outside should remain partially visible so the purpose is immediately clear. No sandbag fortress, gun emplacement, military checkpoint or armed hero. The core idea is earlier warning, not firepower.

## `radio-room.webp` · 广播间

A small shelter room centered on an old civilian analog radio setup: scratched radio set, reused car battery or power supply, patched antenna cable disappearing upward, simple wooden table, pencil and loosely stacked frequency-note papers whose markings are completely unreadable. One weak practical lamp and cold ambient daylight. No sci-fi control room, wall of screens, hacker aesthetic, tactical communications rack or modern studio. The image should feel like people patiently listening for another human voice.

## Integration contract

Runtime paths are defined in `src/ui/buildingVisuals.ts`:

- `/assets/buildings/search-station.webp`
- `/assets/buildings/workshop.webp`
- `/assets/buildings/clinic.webp`
- `/assets/buildings/watch-post.webp`
- A06 canonical shelter art
- `/assets/buildings/radio-room.webp`

When a new image is approved and committed, flip only that facility's `status` from `pending` to `ready`. The building UI must never render an unapproved file path.
