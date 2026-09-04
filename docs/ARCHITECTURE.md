# Architecture — Ember Street v0.6.0

## Runtime

`src/main.tsx` mounts `V1Entry` plus the consolidated notebook theme CSS (`v060.css`, `v060.integration.css`, `v060.main-compat.css`, `typography.css`, `dusk-notebook.css`, `notebook-theme.css`, `ui/v1/social-notebook.css`). The player path is fully v0.6; the former seven-slot App/engine runtime is removed.

UI layering:

- `src/V1Entry.tsx` — session lifecycle (title screen, save-game hydration, phase router).
- `src/ui/v1/*` — V1 mobile-first screens (home, survivors, buildings, records, explore, night events, story phases).
- `src/components/v060/MissingPanel.tsx` — rescue-missing panel extracted from the legacy `V060AppHotfix` (that file was removed; only `MissingPanel` was still referenced).
- `src/components/v060/copy.ts` — player-facing label helpers guarded by `tests/full-play-experience-v060.test.ts`.

Core files:

- `src/game/types.ts`: pure v3 `GameState` contract.
- `src/game/foundation.ts`: default day / expedition / meal / night state.
- `src/game/rng.ts`: seeded PRNG.
- `src/game/dice.ts`: deterministic 2D6 / advantage / disadvantage / trust reroll.
- `src/game/storage.ts`: v3 localStorage lifecycle.
- `src/game/storage/migrations.ts`: the only boundary allowed to understand legacy v2 seven-slot fields.
- `src/game/v060/dayManagement.ts`: one-job-per-person assignments and dusk lock.
- `src/game/v060/expedition.ts`: locations, risk, encounter outcomes and retreat.
- `src/game/v060/food.ts`: population-aware cooking coverage.
- `src/game/v060/buildings.ts`: six Lv0–3 facilities.
- `src/game/v060/nightEvents.ts`: three-choice night content.
- `src/game/v060/nightScheduler.ts`: deterministic 5/6-event nights, emergencies and hordes.
- `src/game/v060/memorial.ts`: missing rescue, confirmed death and memorial ledger.
- `src/game/v060/campaign.ts`: DAY1→29 lifecycle and DAY30 transition.
- `src/game/v060/endings.ts`: 13 ending definitions, resolver and MetaSave.

React components only render state and dispatch pure/core actions; core rules remain outside JSX wherever practical.

## GameState v3

The runtime no longer contains slots, racks, orders, combo, clearances or night countdown fields. Key state includes:

- `phase`: street / assignment / expedition / dusk / night / night-summary / dawn / ending
- `inventory`: ration / medicine / power / materials / parts
- `survivors`, `civilianResidents`, `memorials`
- `dayAssignments`, `dayState`, `expeditionState`, `mealState`, `nightState`
- six building levels and `mainLightStage`
- hope, defense, Story Flags / Story Items
- `pendingCheck`, `rngState`
- campaign statistics, final horde result and ending

Legacy seven-slot data is parsed only by `storage/migrations.ts`, where remaining slots/rack stock are salvaged into the new inventory before the legacy fields disappear.

## State flow

```text
street / assignment
→ optional expedition
→ dusk
→ night
→ night-summary / dawn
→ next street day

DAY 29 dawn
→ DAY 30 ending
```

DAY 30 never schedules a playable night.

## Day management

A living, available survivor can hold one main assignment. Committed rescue personnel cannot be reassigned that day. Serious/critical/dead/missing conditions restrict dangerous work. Unassigned survivors effectively rest.

Rescued non-core residents are stored as `civilianResidents`; they count toward meal population and ending population without becoming full character objects.

## Expedition and mortality

Expedition risk is derived from day, location danger, party size, survivor state, search-station support and route flags. Exploration uses seeded 2D6 and always offers retreat.

Mortality rules are centralized so exploration, night incidents and missing-rescue resolution update condition, campaign counters and memorials consistently.

## Food

Meal coverage is computed from total residents, assigned cooks, cook specialty and shelter/kitchen level. Ration availability caps the final meal quality. Meal resolution changes energy, hope, shortage streaks and well-fed state.

## Night scheduler

Normal nights contain 5 main events; horde nights contain 6. Emergency IDs are inserted separately and do not consume main slots. DAY 10 / 20 / 29 force hordes; other nights use seeded risk derived from campaign conditions.

All decision events expose exactly three choices. Checked choices create `PendingCheck`; deterministic dice resolve them. A v3 save preserves `phase`, `nightState`, `pendingCheck` and `rngState`, so reload cannot reroll an already determined result.

## Endings

`resolveEnding()` is a pure priority resolver over survivor state, civilian population, rescued count, hope, buildings, radio/contact flags, evacuation routes, main light and the DAY29 grade. Exactly 13 endings are defined. Unlock history is stored separately in `ember-street-meta-v1`.

## Storage

Run key: `ember-street-save-v3`.

Load order supports v3 first and legacy v2 fallback. v3 resume preserves active phase and deterministic state. v2 migration salvages legacy resources and moves the run onto the v0.6 model.

## Performance

- pure frontend; no backend/login dependency
- no frame-by-frame simulation loop
- no zombie pathfinding or 3D engine
- DOM/CSS UI and dice presentation
- localStorage state only
- Cloudflare Workers Static Assets compatible

## CI

`.github/workflows/ci.yml` runs on `main`, `dev`, `feat/**` and relevant PRs:

1. devcontainer validation
2. dependency install
3. TypeScript typecheck
4. Vitest
5. production build
6. Wrangler deploy dry-run

Release requires feature HEAD green and then a second green run on the clean `main` release commit.