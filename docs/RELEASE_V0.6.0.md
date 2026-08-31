# Ember Street v0.6.0 — Day Shift & Long Night

## Release summary

v0.6.0 is the core-play redesign of Ember Street. The former seven-slot / rack / order / combo night runtime has been removed from the player path and from `GameState`; legacy seven-slot fields exist only inside the v2→v3 migration boundary so old resources can be salvaged into the new inventory.

The new loop is: **day assignments → expedition / construction / food → dusk lock → 5–6 three-choice night events → emergencies / hordes → DAY29 final horde → DAY30 ending resolver**.

## Campaign

- DAY 1–28: management, expeditions, construction and event-driven nights.
- DAY 10: guaranteed first horde.
- DAY 20: guaranteed second horde.
- DAY 29: final playable day and guaranteed final horde.
- DAY 30: no player actions; automatic ending resolution only.

## Day management

Each available survivor receives at most one main assignment: expedition / repair / medical / watch / radio / cook / rest. Dusk locks jobs.

Expeditions use 1–2 survivors and deterministic 2D6. DAY1–5 blocks permanent death; DAY6+ can produce missing survivors; DAY11+ can produce permanent death only under stacked extreme risk. Retreat is always available.

Missing survivors can be searched for by committing two survivors or using radio + power. Confirmed deaths update campaign statistics and the memorial wall.

Rescued non-core residents are real population: they improve ending possibilities but also increase ration and cooking demand.

## Food and construction

Cooking capacity scales with current residents. Normal survivor base capacity is 2.5 servings; Ahe / cook specialist is 3.5. Shelter / kitchen levels scale efficiency. Final meal quality is capped by both ration availability and cooking coverage.

Six facilities support Lv0–3: search station, workshop, clinic, watch post, shelter / kitchen and radio. Upgrades unlock rule effects rather than infinite stat growth.

## Night

- 5 main events on normal nights.
- 6 main events on horde nights.
- Emergency events are inserted separately and do not consume main-event slots.
- Every player-facing decision event exposes exactly three choices.
- DAY10 / 20 / 29 force horde scheduling.
- No real-time reading countdown.
- Seeded scheduling and dice make the same state reproducible.

## Save integrity

Run schema: v3 (`ember-street-save-v3`).

Legacy v2 saves salvage old slots / rack stock into ration, medicine and power, then enter the pure v0.6 runtime.

A v3 save preserves active phase, night event queue, `pendingCheck` and `rngState`; refreshing during a night cannot reroll a completed throw or regenerate a different night.

Ending unlocks remain separate in `ember-street-meta-v1`.

## Endings

12 standard endings plus secret `DAY 31` are defined and automatically reachable by test fixtures:

黎明车队、灯火长街、第二个灯塔、带他们回家、我们留下、向南、最后一次广播、一条小街、灯灭了、空街、北门之后、最后的守灯人、DAY 31。

Ending resolution uses survivor state, civilian population, rescued count, hope, construction, radio/contact flags, evacuation routes, main-light state and the DAY29 grade (`perfect / held / damaged / breached`).

## Verification contract

Before `main` release:

- TypeScript typecheck
- Vitest suite
- v2→v3 migration and v3 refresh-safe resume
- day assignment / population-aware meal tests
- expedition risk, missing/death and memorial tests
- deterministic night scheduler tests
- DAY10/20/29 horde and DAY30 ending-only tests
- all 13 endings reachable by automated fixtures
- production build
- Cloudflare Wrangler dry-run
- final docs aligned with v0.6

After the clean release commit reaches `main`, the same CI must pass again before `dev` is synchronized.

> Wrangler dry-run validates deployment configuration only. It is not evidence of a live Cloudflare deployment.