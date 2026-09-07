# Ember Street UIUX V2 Implementation Report

Task: `EMBER-STREET-UIUX-V2`
Baseline: `main` at `09c816064488ea8cbbdccbd93997bbf1f96dfae9`
Baseline worktree: clean and synchronized with `origin/main`.

## CURRENT_SCREEN_AUDIT

This list was built from the actual v0.6 React routes/state gates before implementation, not from a proposed sitemap.

| Page / function | Existed before V2 | Real entry before V2 | Previous implementation / problem | V2 result | New gameplay? |
| --- | --- | --- | --- | --- | --- |
| Title | yes | app root with no active session | notebook-cover menu; not scene-first | canonical shelter scene + restrained start menu | no |
| New game / continue | yes | title | stable session entry | retained unchanged | no |
| Tutorial | yes | in-flow sticky guide | correct gameplay, presentation exposed explicit step counter | retained behavior; world-space note presentation | no |
| Shelter | yes | old `据点` top nav | separate home/info page; duplicated building navigation concept | merged into new Building hub | no |
| Buildings | yes | old `建筑` top nav | vertical accordion/card list | promoted to default daytime scene | no |
| Building detail | yes | expand building card | detail lived inside card, weak illustration hierarchy | canonical large art + state + requirement block | no |
| Build / upgrade | yes | building detail | existing material/part button | same rule calls and costs, new visual hierarchy | no |
| Survivors | yes | top nav | compact management list | dossier wall + presentation filters | no |
| Survivor detail | yes | open survivor | status and jobs mixed together | status / unlocked story / today assignment separated | no |
| Day assignment | yes | survivor detail | seven jobs plus expedition route | retained; copy treated as daily roster | no |
| Exploration | partial top-level | only reachable through survivor route / departed phase | no primary nav entry | new top-level schematic map/intel view over existing data | display/navigation only |
| Location detail | yes | route selection | list-card detail | integrated location intel sheet | no |
| Team composition | yes | survivor assignment + route | spread across survivor/route flow | direct click-to-select on map desk; old route flow retained for compatibility | no |
| Expedition result | yes | departed expedition state | existing event/decision flow | retained, receives V2 global type/motion/audio treatment | no |
| Night event | yes | phase gate | art + ordinary bordered choice cards | cold crisis story shell + narrative choices | no |
| Daily settlement | yes | dawn/summary phase | compact tally / checklist, data-forward | journal page with actual current-day journal entries + reveal/skip | no |
| Journal | yes as `记录` | old top nav | notebook-like but mixed with record-panel visual | fixed `日志` nav; true book-page hierarchy | no |
| Character story | yes | journal profile tab / fixed events | correct existing unlocked data | also surfaced explicitly in survivor detail | no |
| Ending | yes | DAY30 phase | existing quiet ending | retained logic, stronger last-page book treatment | no |
| Game Over | no independent state | none | all terminal outcomes use ending resolver | not invented; documented as ending-system behavior | no |
| Settings | yes | title/player menu | functional dialog | retained + V2 paper-dialog visual | no |
| Resource info | yes | always-visible strips in multiple pages | could become dashboard-like | contextual values + optional top resource drawer | display only |
| Radio / broadcast | building/event support only | radio building + night radio events | no standalone radio mode | building remains real sixth building; no fake standalone feature added | no |

## Implementation summary

### Visual foundation

- Added shared V2 shell primitives in `src/ui/v2/UiV2.tsx`.
- Added centralized design/motion/theme tokens in `src/ui/v2/uiux-v2.css`.
- Added `prefers-reduced-motion` fallback.
- Removed runtime dependency on full Chinese webfont files from `src/typography.css`; platform fonts now provide display/body/handwriting roles.
- Kept game-state and persistence schemas unchanged.

### Primary navigation

Changed normal daytime navigation from:

`据点 / 建筑 / 幸存者 / 记录`

to the required fixed order:

`建筑 / 幸存者 / 探索 / 日志`

Navigation remains bottom-fixed and continues to use the existing page-turn feedback.

### Buildings / shelter

- Building becomes the default daytime page.
- Added canonical shelter scene.
- Added six scene hotspots from the real `V060_BUILDINGS` registry.
- Added permanent horizontal six-building thumbnail navigation.
- Both paths update one `selectedBuilding` state.
- `selectedBuilding` persists while moving among primary tabs.
- Selected building displays canonical art, current state and existing next upgrade requirement.
- Upgrade code remains `canUpgradeBuilding` + `upgradeBuilding`.
- Existing community support rotation is integrated as a paper roster section.
- Added low-volume `pen_circle` cue on real building selection changes.

### Survivors

- Overview restyled as dossier wall.
- Added presentation-only filters: all / idle / work / outside / abnormal.
- Detail now explicitly separates current status and unlocked background story.
- Character stories only come from already-unlocked fixed campaign events.
- Existing seven assignment actions and formulas remain unchanged.

### Exploration

- Added `ExploreBoardV2` as a real top-level primary navigation page.
- Uses existing unlocked locations, risk calculation, route limit, depletion memory and route assignments.
- Added schematic route-board markers without claiming geographic scale.
- Direct party click UI remains mobile-friendly; no drag requirement.
- Kept legacy per-survivor route selection path so tutorial/current interaction paths are not broken.
- Added `pen_circle` cue to location and party changes.

### Night

- Removed normal primary navigation from immersive night (existing phase behavior retained).
- Reworked night to cold blue-black crisis styling.
- Removed legacy notebook binding/grime pseudo-elements from night.
- Event illustration has higher visual weight.
- Choices are narrative rows instead of generic card buttons.
- Existing event `audioKey` mapping remains untouched.
- Added synchronous input lock and pending UI state so rapid repeated choice input cannot double-process an event.

### Dawn / journal

- Dawn now reads real same-day `state.journal` entries, then existing dawn brief entries.
- Added progressive reveal with an immediate `直接看完这一页` action.
- Added synchronous lock on next-day progression.
- Journal uses `BookShell` and existing approved notebook assets.
- Existing four record categories remain: recent entries, places, living profiles/stories, memorials.

### Title / tutorial / ending / settings

- Title uses canonical shelter art as the scene background; no feature-card landing layout.
- Tutorial stays within real gameplay but appears as a small note and no longer shows numeric `x/7` progression.
- Ending remains quiet and journal-like; terminal rules are unchanged.
- Existing settings/player menu remains the entry for audio controls, with paper styling only.

## Assets

Reused:

- all A01–A47 canonical registered visual masters;
- `buildings-a.webp` / `buildings-b.webp`;
- character/place/event sprite sheets;
- `notebook-paper-grimy.jpg`;
- `notebook-table-dirty.jpg`;
- `notebook-binding-transparent.png`;
- existing BGM/SFX masters.

No canonical illustration was regenerated or removed.

Strict asset audit after V2:

- registry: 47/47;
- locked canonical IDs: 47/47;
- runtime sprite sheets: 9/9 byte-valid;
- runtime canonical image payload: 699.5 KiB.

## Audio

Preserved architecture:

- standard Web build: MP3 + `HTMLAudioElement`;
- mini-tool build: Base64 JS + Web Audio;
- user-interaction unlock;
- independent mute/ambience/SFX/volume preferences;
- AudioDirector phase ambience and semantic night cues.

V2 interaction additions are intentionally sparse: building selection and exploration marks use `pen_circle`; main page changes keep `page_turn`. Ordinary buttons do not receive heavy click audio.

Audio asset audit after V2:

- 30 registered MP3 references;
- 2.64 MiB source audio payload;
- all registered files exist and are valid MP3-shaped local assets.

## Responsive / browser validation completed during implementation

`qa/ui-overhaul/ui-smoke.pw.ts` now includes:

- 320 x 568;
- 360 x 800;
- 390 x 844;
- 430 x 932;
- existing desktop sizes.

The smoke suite distinguishes page-level overflow from intentional local horizontal navigation. Document-level horizontal overflow remains blocked.

Targeted real-browser V2 flow suite currently validates:

- building hub and fixed four-entry navigation;
- scene hotspot + building navigator synchronization;
- building selection persistence across tabs;
- survivor overview/detail/jobs;
- journal and unlocked profile stories;
- top-level exploration map/intel/party view;
- departed expedition decisions;
- night art and three consequence choices;
- rapid night double-click de-duplication;
- dawn journal reveal/skip;
- rapid next-day double-click de-duplication.

Final browser gate:

- `npx playwright test qa/ui-overhaul`
- result: 49 / 49 passed;
- covers fresh game, continue game, audio preferences, missing-audio fallback, tutorial DAY1→NIGHT1→DAY2 at all four required mobile widths, DAY1→DAY30 visual smoke, night visual fallbacks, missing-person recovery, community departure/rotation, route risk, building selection persistence, top-level exploration, night choice de-duplication and dawn next-day de-duplication.

Final unit/build gates:

- `npm run typecheck` — passed;
- `npm test` — 45 test files passed, 6 audit-only files skipped; 336 tests passed, 6 skipped;
- `npm run build` — passed;
- `npm run audit:audio` — passed;
- `npm run audit:assets:strict` — passed;
- `npm run build:minitool` — passed;
- `npm run audit:minitool -- <final app>` — passed;
- `npm run package:minitool -- <final app>` — passed;
- `npm run cf:dry-run` — passed.

There is no `lint` script in the real `package.json`, so no imaginary lint command was added for this task.

## Production build / mini-tool validation

Normal production build after removing full runtime Chinese webfonts:

- CSS bundle: about 198.66 KiB before gzip;
- JS bundle: about 497.75 KiB before gzip;
- complete ordinary `dist`: 8,242,820 bytes (7.86 MiB), including the standard-Web MP3 backend;
- full-font WOFF2 files are no longer emitted by the normal V2 build.

Mini-tool artifact:

- release: `output/releases/ember-street-xhs-20260907T132353Z/app`;
- file count: 24;
- unpacked: 5,752,105 bytes (5.49 MiB);
- embedded audio: 30 entries / 2,770,271 bytes;
- largest Base64 entry: 560,526 bytes;
- audit result: passed;
- no `.mp3` is shipped in the mini-tool app directory.

Final mini-tool file-type inventory:

- HTML: 1;
- CSS: 1;
- JS: 7;
- JSON: 2;
- JPG: 2;
- WebP: 11;
- MP3: 0;
- source maps: 0;
- WOFF / WOFF2: 0.

ZIP:

- `output/releases/ember-street-xhs-20260907T132353Z/ember-street-xhs.zip`;
- 4,179,478 bytes (~3.99 MiB);
- SHA-256: `a1e1198d5697c4812a39753296cb71568d7822d09a434076798e66fde5ac8055`;
- official/local mini-tool artifact skill: PASS;
- advisory only: ZIP is above the skill's preferred 2 MiB target, but below the project/platform 10 MiB hard package limit documented for this competition entry.

Embedded BGM files individually exceed the audit's 100 KiB preference but remain below its 1 MiB per-entry hard limit. They are retained because they are the approved soundtrack masters and the complete package stays within the hard package budget.

## Known boundaries, not gameplay regressions

1. No independent `Game Over` route exists in current v0.6 state architecture; UIUX V2 intentionally leaves terminal rule resolution in the existing ending system.
2. Radio is a real building and event/audio source, but there is no standalone broadcast-management gameplay page. V2 does not invent one.
3. The exploration board is intentionally schematic; marker placement is presentation-only.
4. Mini-tool validation reports real-device testing as still required by the platform workflow. Local Chromium/Edge and static Chrome-61 syntax/fallback audits do not replace Xiaohongshu simulator/device acceptance.
