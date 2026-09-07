# Ember Street UI/UX Visual System V2

Status: implemented baseline for `EMBER-STREET-UIUX-V2`
Runtime: React + TypeScript + Vite, v0.6 campaign state remains authoritative.

## 1. Visual identity

UIUX V2 uses three related but deliberately different visual languages.

### Shelter scene

Used by the normal daytime building hub. The player should read this as a physical shelter, not a dashboard. Canonical building art, low-saturation brown/grey surfaces, weak warm light, small state labels and direct building hotspots carry the hierarchy.

The building hub has two synchronized selection methods:

1. scene hotspots;
2. the permanently available horizontal building navigator.

Both select the same `selectedBuilding` state. `selectedBuilding` lives in the game-session UI layer so leaving the page and returning does not reset the selection.

### Dossier / map desk

Used by survivors and exploration. The visual grammar is paper files, photographs, route marks and old-map surfaces on a dirty desk. Paper is structural only where a physical document makes sense. Small notes are reserved for warnings and temporary information.

### Night crisis

Used by night events and night checks. It removes normal primary navigation, suppresses paper decoration, shifts to cold blue-black, promotes the event image, and renders choices as narrative rows rather than generic card buttons.

## 2. Shells

Shared shells are defined in `src/ui/v2/UiV2.tsx`.

| Shell | Responsibility |
| --- | --- |
| `AppShell` | session-level presentation host for audio/tutorial/menu overlays |
| `SceneShell` | physical daytime shelter views |
| `BoardShell` | dossier / route-board management views |
| `StoryShell` | immersive night/crisis presentation |
| `BookShell` | journal/document presentation |

Legacy campaign state and rule functions stay outside these shells.

## 3. Theme tokens

The canonical V2 tokens live in `src/ui/v2/uiux-v2.css`.

```css
--scene-bg
--scene-surface
--paper-bg
--paper-deep

--text-main
--text-muted
--text-faint
--ink-main
--ink-muted

--accent-warm
--accent-danger
--accent-hope

--border-soft
--border-paper
--shadow-paper
--shadow-scene

--motion-fast
--motion-normal
--motion-story
```

Theme is derived from game context rather than written into `GameState`:

- day / street -> scene shell;
- dossier and explore -> board shell;
- dusk -> warm dark story treatment;
- night -> cold crisis treatment;
- dawn / ending / records -> book treatment.

This keeps persistence and game formulas untouched.

## 4. Typography

Production V2 does not ship the former full Chinese web-font payload. The previous normal web build contained roughly 13 MiB of Chinese WOFF2 files. V2 uses platform font stacks instead:

- Display: Songti / STSong / SimSun with body fallback;
- H1/H2: display role where narrative emphasis is required;
- Body: PingFang SC / Microsoft YaHei UI / Noto Sans CJK SC fallback;
- Numeric: system monospace with tabular numerals;
- Handwriting accent: Kaiti / STKaiti / KaiTi, only for journal notes and annotations.

No large new Chinese font is introduced by UIUX V2.

Reference hierarchy:

- Display: approximately 28–36 px where space allows;
- H1: approximately 22–26 px;
- H2: approximately 18–20 px;
- body: approximately 15–17 px in narrative-heavy screens;
- compact management body/captions may scale down when a narrow-screen layout requires it;
- numeric: 18–30 px for primary time/day/state values.

## 5. Motion

The three runtime motion tokens correspond to the requested four-level model:

- Motion 0: no animation (`prefers-reduced-motion`);
- Motion 1: `--motion-fast` = 120 ms for selection/press;
- Motion 2: `--motion-normal` = 240 ms for navigation/detail transitions;
- Motion 3: `--motion-story` = 720 ms budget for story moments.

Implementation rules:

- transform/opacity are preferred;
- no infinite breathing animation;
- no particle system;
- no animation dependency was added;
- `prefers-reduced-motion: reduce` removes transitions and reveal animations while preserving all controls.

The dawn journal reveal is intentionally short and sequential. `直接看完这一页` switches immediately to the complete state.

## 6. Navigation

Normal daytime primary navigation is fixed to:

`建筑 / 幸存者 / 探索 / 日志`

It stays at the bottom and uses the existing page-turn cue when switching pages.

Immersive phases do not render the bottom bar:

- expedition after departure;
- dusk/night/night-summary;
- dawn settlement;
- ending;
- blocking campaign events.

### Building secondary navigation

All six real v0.6 buildings are represented from `V060_BUILDINGS`; no building was invented for V2.

The secondary navigator is horizontally scrollable on narrow devices. That local overflow is intentional; page-level horizontal overflow is forbidden.

Selected building treatment:

- slight upward displacement;
- weak warm border;
- stronger name contrast;
- no neon/glow/breathing loop.

## 7. Building hub

The building page is the daytime visual anchor.

Order:

1. day/phase status + optional resource drawer;
2. canonical shelter scene;
3. six direct scene hotspots;
4. six building thumbnails in the secondary navigator;
5. selected canonical building illustration;
6. current function/state copy;
7. upgrade requirements and existing upgrade action;
8. community rotation, when unlocked;
9. today-assignment entry.

Upgrade still calls the existing `canUpgradeBuilding` and `upgradeBuilding` rules. Material/part costs, maximum level, assignment locks and unlock effects are unchanged.

## 8. Survivor dossier

The overview is a dossier wall rather than a uniform card grid. Existing character artwork is reused as paper-mounted photographs.

Filters are presentation-only:

- all;
- idle;
- work;
- outside;
- abnormal.

They do not change assignments or survivor values.

Survivor detail now separates:

- current status;
- unlocked background story;
- today assignment.

Background story only reads existing `CAMPAIGN_FIXED_EVENTS` whose `fixed_event_seen:*` flag is already present.

## 9. Exploration board

The top-level exploration page is a schematic route board, not a real geographic map. The UI explicitly states that marker position is not map scale.

It reuses:

- `EXPEDITION_LOCATIONS`;
- `isLocationUnlocked`;
- existing location sprites;
- existing visit/depletion memory;
- existing risk calculation;
- existing route limit;
- existing `assignExpeditionRoute` / `clearDayJob` / dispatch flow.

Location selection and party selection use the low-volume `pen_circle` interaction cue. No map library was added.

## 10. Night event specification

Night uses a cold crisis layout:

- no bottom navigation;
- event illustration is a primary visual area;
- event copy has generous vertical spacing;
- each choice is a `NarrativeChoice`-style row with consequence tags/cost below it;
- only event-relevant resources remain visible;
- existing semantic night SFX remains tied to event `audioKey`.

Rapid option input is guarded by an in-component synchronous ref lock and a disabled pending state. This prevents duplicate choice processing before React has completed the next render.

The legacy notebook binding pseudo-elements are explicitly disabled on night pages so the crisis view does not visually become a diary page and does not cause narrow-screen horizontal overflow.

## 11. Daily settlement and journal

### Dawn settlement

Dawn is the main journal moment. It surfaces real current-day `state.journal` entries followed by the existing dawn brief. Entries appear progressively and can be revealed immediately.

The next-day action has a synchronous ref lock in addition to disabled feedback. Campaign day progression still uses the existing `advanceCampaignDay` implementation.

### Journal

The journal uses `BookShell` and the already approved notebook paper/table/binding assets. It preserves real existing sections:

- day entries;
- discovered locations;
- survivor profiles and unlocked stories;
- memorials.

It does not restore the old ending-gallery concept.

## 12. Title, tutorial, ending and settings

Title is scene-first: canonical shelter art fills the background, with the game name and start/continue/settings actions over a dark lower field. It is not a marketing landing page.

Tutorial remains the existing gameplay tutorial. Presentation is now a small world-space note and no longer advertises progress as `x/7`.

Ending remains the existing quiet DAY30 journal/last-page flow. No victory particles or arcade result treatment is introduced.

The current game architecture has no separate `Game Over` state/page; failure outcomes resolve through the same existing ending system. UIUX V2 does not invent a second terminal rule path.

Settings continue to use the existing player-menu dialog and independent audio preferences; V2 changes only its paper/dialog treatment.

## 13. Audio interaction rules

Existing audio architecture is preserved:

- web: local MP3 via `HTMLAudioElement`;
- mini-tool: MP3 source is converted during build to Base64 JS payload and decoded with Web Audio;
- audio unlock is still tied to user interaction;
- mute / ambience / SFX / volume preferences remain independent of game save data;
- night event semantic SFX and ambience switching remain handled by `AudioDirector`.

V2 adds only low-intensity interaction cues where they improve feedback:

- primary page navigation: existing `page_turn`;
- building selection: `pen_circle`;
- exploration location / party selection: `pen_circle`.

Ordinary buttons intentionally remain silent.

## 14. Responsive constraints

Required validated viewport set:

- 320 x 568;
- 360 x 800;
- 390 x 844;
- 430 x 932.

Rules:

- no document-level horizontal scrolling;
- building navigation may scroll locally;
- survivor filter strip and journal tabs may scroll locally;
- bottom nav is safe-area aware;
- narrative rows wrap rather than truncate;
- main controls remain at least approximately 40–48 px high;
- no hover-only interaction.

## 15. Asset policy

UIUX V2 reuses existing approved assets:

- A01–A47 canonical runtime sprite registry;
- building sprite sheets;
- survivor sprite sheets;
- place and event sprite sheets;
- approved notebook paper/table/binding assets;
- existing audio masters.

No approved illustration was regenerated, deleted or replaced by a placeholder.
