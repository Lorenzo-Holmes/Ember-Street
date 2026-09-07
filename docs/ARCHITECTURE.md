# Architecture — Ember Street v0.6.0

## Runtime

`src/main.tsx` mounts `V1Entry`. Its title screen enters `GameSession`, which renders the mobile notebook views over the v0.6 core. The former seven-slot App/engine runtime is not a player entry point.

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
- `src/game/v060/nightScheduler.ts`: deterministic date-tiered nights, emergencies and hordes.
- `src/game/v060/memorial.ts`: missing rescue, confirmed death and memorial ledger.
- `src/game/v060/campaign.ts`: DAY1→29 lifecycle and DAY30 transition.
- `src/game/v060/endings.ts`: 13 ending definitions, resolver and MetaSave.
- `src/game/v060/tutorial.ts`: opt-in tutorial state machine, legacy normalization and skip rules.
- `src/game/v060/journal.ts`: bounded, deduplicated records of real work, expedition and night results.
- `src/ui/v1/TutorialGuide.tsx`: one non-modal notebook note with semantic DOM anchors.
- `src/audio/AudioDirector.tsx`: phase ambience, event cue routing, background suspension and presentation-only audio lifecycle.
- `src/audio/audioRegistry.ts`: the single local-path mapping for ambience, night SFX and UI SFX.
- `src/audio/audioPreferences.ts`: independent `ember-street-audio-v1` preference storage.

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

Ordinary event budgets are 2 on DAY1–5, 3 on DAY6–23 and 4 on DAY24–28. Horde beats replace ordinary slots rather than stacking fully on top; emergencies are separate. DAY10 / 20 / 29 force hordes, with a dedicated DAY29 finale. Other nights retain seeded risk derived from campaign conditions.

All decision events expose exactly three choices. Checked choices create `PendingCheck`; deterministic dice resolve them. A v3 save preserves `phase`, `nightState`, `pendingCheck` and `rngState`, so reload cannot reroll an already determined result.

### Night Event Visual Upgrade v1

The night content layer owns `visualKey: NightVisualKey`. There are 51 static event IDs (31 ordinary, 6 random-horde, 8 emergency and 6 final-horde) plus two per-survivor dynamic templates for medical crisis and low-hope departure. Every definition declares one of 14 semantic keys; `NightEventV1` never branches on event IDs. `src/ui/visualAssets.ts` is the single translation boundary from `visualKey` to a locked canonical event/building asset.

When a night event resolves, the scheduler appends `night_visual_seen:<visualKey>:<day>` beside the existing `night_seen:<eventId>:<day>` flag. Candidate selection first seeks an illustration category that is both unused in the current schedule and absent from the previous two nights. It then falls back deterministically through unused, recent-safe and finally any legal candidate, so event budgets never shrink. Fixed finale order and urgent per-person mortality events retain narrative priority when no semantically correct alternative exists.

No new save-envelope field or schema version is required. Old v2/v3 saves simply have no visual-history flags and start building them after the next resolved event. The current event ID remains stored in `nightState`, while its art is a pure lookup from the event definition, so refresh cannot redraw a different scene. A missing local sprite sheet produces a deliberate dark textual fallback and leaves all three choices playable.

### Audio Atmosphere & Event SFX v1

Night content also owns `audioKey: NightAudioKey`. The 51 static definitions and both dynamic mortality templates map to 18 semantic event-audio categories. React does not branch on individual night IDs for playback; `AudioDirector` reads the currently resolved event and `audioRegistry.ts` translates its key into a local MP3. Five ambience layers cover day shelter, expedition, normal night, horde pressure and dawn/ending. Three UI cues cover dusk lock, dice and journal confirmation.

The audio runtime is deliberately outside `GameState`. Preferences live under `ember-street-audio-v1`; event de-duplication uses `sessionStorage` only so React remounts, menu navigation and same-tab refresh do not replay the same knock or crisis cue. No save migration or RNG draw is added. Audio unlock happens only after an explicit start/continue gesture. `visibilitychange` pauses ambience in the background, SFX temporarily ducks the ambience bus, and failed `HTMLAudioElement.play()` or missing MP3 files are swallowed as presentation failures rather than gameplay failures.

All runtime audio is local under `public/assets/audio/`. `scripts/audit-audio-assets.mjs` resolves every registry path, verifies MP3 signatures and enforces a 3.2 MiB aggregate budget. The current deterministic project-generated payload is about 1.01 MiB. The mini-tool build explicitly permits MP3 but still forbids network-loaded audio.

## Endings

`resolveEnding()` is a pure priority resolver over survivor state, civilian population, rescued count, hope, buildings, radio/contact flags, evacuation routes, main light and the DAY29 grade. Exactly 13 endings are defined. Unlock history is stored separately in `ember-street-meta-v1`.

## Storage

Run key: `ember-street-save-v3`.

Load order supports v3 first and legacy v2 fallback. v3 resume preserves active phase and deterministic state. v2 migration salvages legacy resources and moves the run onto the v0.6 model.

## Tutorial / New Player Experience v1

The save envelope and run key remain v3. Two optional fields are added:

```ts
tutorial?: {
  version: 1;
  tutorialStage: 'INTRO' | 'RESOURCE_OVERVIEW' | 'ASSIGN_SURVIVOR'
    | 'SEND_EXPEDITION' | 'END_DAY' | 'FIRST_NIGHT' | 'OPEN_LOG' | 'FREE_PLAY';
  tutorialCompleted: boolean;
  tutorialSkipped: boolean;
  freePlayNoticeSeen: boolean;
  hintsSeen: ('injury' | 'building' | 'population')[];
  initialPopulation: number;
};
journal?: { id: string; day: number; kind: 'work' | 'expedition' | 'night'; title: string; body: string }[];
```

Only `sessionEntry.startNewSession()` opts a newly created player save into teaching. `createV060InitialState()` remains a rules-only constructor, so existing simulations and fixtures do not silently acquire tutorial behavior. Missing, invalid or unknown-version tutorial data is treated as opt-out, including legacy DAY1 saves. The migration normalizes valid data and reconciles against the actual day/phase without changing resources, RNG or pending checks.

`GameSession.commit()` reconciles each accepted action before saving. Introduction/resource acknowledgements only advance explanatory stages; work requires a real non-expedition assignment, route confirmation requires the existing route API, and expedition completion is driven by the real return/dusk state. Editing a job before departure can move the guide back to the missing prerequisite. Retreat is valid. No guide button grants resources, chooses a night answer or advances a day.

The tutorial-only dispatch check prevents locking an entirely unpractised DAY1 list. `skipTutorial()` removes that check immediately and only updates tutorial metadata. It preserves the current day, phase, assignments, expedition, RNG and night queue. Completed/skipped saves do not re-enter mandatory teaching on refresh. Corrupt/stale active tutorial flags on DAY3+ fail open rather than trapping a late campaign.

Active first-night teaching prioritizes existing `gate-knocking` in one ordinary slot. The original RNG draws, total budget, horde probability and emergency queue are retained; costs, dice and penalties are unchanged. An already scheduled night is never redrawn. `finalizeDay()` rejects a repeated call after day settlement, preventing a second meal or work payout.

`RecordsV1` completes OPEN_LOG only after its log tab is actually mounted on DAY2. The first log has display priority over ordinary fixed DAY2 unlock notices; those notices remain pending and return when the player leaves the log. They are not falsely marked as seen.

Persistent journal entries are appended at real settlement boundaries with stable IDs: day/work, day/expedition-return-number, and day/night-event/choice-or-result. They record named assignments, destination, actual inventory/state deltas and the chosen action. Checked choices and their later dice result are separate entries. The existing dawn briefs, community departures, profiles and memorial remain in the same Records page. History is capped at 360 entries and rendered 20 entries per page; legacy history that never existed is not invented.

The guide is a single in-flow sticky note, not a pointer-blocking mask. It finds targets using semantic data attributes and existing view classes, and scrolls using measured note/target rectangles. CSS widths and focus controls have baseline implementations, ResizeObserver is optional, and loss of scroll-margin support does not hide the action. Optional injury/building/population notes are persisted individually after core completion. Scene-preview routes stay unassisted.

## Performance

- pure frontend; no backend/login dependency
- no frame-by-frame simulation loop
- no zombie pathfinding or 3D engine
- DOM/CSS UI and dice presentation
- localStorage state only
- local MP3 ambience/SFX only; no streaming, microphone or runtime audio generation
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
