# Ember Street v0.6.0 — Day Shift & Long Night

## Release scope

v0.6.0 replaces the player-facing seven-slot night loop with a day-management / event-driven survival loop.

### Campaign

- DAY 1–28: assignment, exploration, inventory, building upgrades, meal coverage, event-driven nights.
- DAY 10: guaranteed first horde.
- DAY 20: guaranteed second horde.
- DAY 29: final playable day and guaranteed final horde.
- DAY 30: no player actions; ending resolver only.

### Day management

- One main assignment per available survivor: expedition / repair / medical / watch / radio / cook / rest.
- Assignments lock at dusk.
- Exploration supports 1–2 survivors and deterministic 2D6 outcomes.
- DAY 1–5 blocks permanent death; DAY 6+ can produce missing survivors; DAY 11+ can produce permanent death under extreme stacked risk.

### Food

- Cooking capacity scales with survivor count.
- Normal survivor: 2.5 base servings.
- Ahe / cook specialist: 3.5 base servings.
- Shelter levels modify cooking efficiency from 0.8× to 1.5×.
- Meal quality affects energy, hope and well-fed state.

### Street construction

Six buildings now support Lv0–3: search station, workshop, clinic, watch post, shelter / kitchen and radio.

### Night

- 5 main events on normal nights.
- 6 main events on horde nights.
- Emergency events are inserted separately and do not consume main slots.
- Every decision event exposes exactly three player choices.
- DAY 10 / 20 / 29 guarantee horde scheduling.
- No real-time reading countdown in the v0.6 player path.

### Endings

12 normal endings + 1 secret ending (`DAY 31`). Ending resolution uses survivor state, rescued count, hope, buildings, radio/contact flags, evacuation routes, main-light flags and the DAY 29 final-horde grade.

Ending unlocks are stored separately from the run save in `ember-street-meta-v1`.

## Save compatibility

- Run schema remains v3.
- Legacy v2/v3 resources are promoted into the v0.6 inventory.
- Existing saves are moved onto the v0.6 daytime path when first opened.

## Release gates

- TypeScript typecheck
- Vitest
- deterministic night scheduler tests
- meal coverage tests
- exploration risk/death tests
- all 13 endings reachable by automated fixtures
- Production build
- Cloudflare Wrangler dry-run
