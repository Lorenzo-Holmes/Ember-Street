# Ember Street · Production Human Playtest Audit — 2026-09-05

## Status

Release-candidate baseline: `a4eb63786ba52fb0e64b17e936eed44fe7c881ba`

Production: `https://ember-street.1106314996.workers.dev/`

Current conclusion: no known progression blocker or major reproducible balance exploit remains from this audit. Stop broad balance churn unless a new production playtest produces concrete evidence.

## Scope

This pass used real Chromium against the deployed Cloudflare Workers build, not only deterministic model simulation. Coverage included:

- full DAY 1 → DAY 30 production runs with adaptive explorer and turtle play styles;
- a controlled prolonged-zero-ration scenario;
- production resume / mandatory attention / final-horde progression through the permanent live regression suite;
- depletion-aware route selection after scavenging exhaustion was introduced;
- a same-seed A/B audit of horde-night cadence: 600 complete 30-day runs for each of four policies on both baseline and experiment, 4,800 complete runs total.

## Findings resolved

### 1. E10 ending contradicted living population — fixed in PR #30

A production run reached DAY 30 with six living people and zero deaths but selected E10 because hope had collapsed. The old `空街` text implied nobody remained.

Resolution: E10 remains the low-hope/community-collapse ending but is now `街散了`; its copy describes a community that has stopped functioning even if people are physically alive.

Production verification: later turtle runs with six living people and very low hope now produce internally consistent E10 copy.

### 2. Route risk hid the benefit of a second explorer — fixed in PR #31

The first explorer had to choose a route before a second explorer could join it. The route screen therefore showed solo risk even when adding a companion would materially reduce the actual expedition risk.

Resolution: when one explorer is currently assigned and another eligible companion remains, the route UI previews the best risk achievable by adding one person to the same route. The underlying risk model was not changed.

### 3. Zero rations could coexist with full stamina recovery — fixed in PR #33

Controlled production reproduction before the fix:

- DAY 19 started at ration 0, all three survivors energy 60;
- repeated Rest plus the old cold-meal / offline recovery logic allowed energy to climb to 88 and then 100 despite continued zero rations.

Resolution:

- zero ration coverage gives zero meal-energy recovery;
- cold food with actual ration supply retains the existing small recovery;
- one fully unfed night sharply reduces Rest recovery;
- two or more consecutive fully unfed nights stop Rest from refilling energy;
- partial shortages scale recovery instead of deleting it;
- offline Rest follows the same hunger rule.

Production verification using the exact same controlled scenario after deployment: DAY 19 → DAY 26 remained at ration 0 and all three survivors stayed at energy 60 instead of recovering to 100.

Decision: do **not** add automatic starvation deaths at this stage. Existing mortality, departure, hope and defense-collapse systems already create failure consequences; current evidence supports constrained recovery, not a new direct-death mechanic.

### 4. Repeatedly farming one safe location was structurally optimal — fixed in PR #34

Human runs before depletion repeatedly selected only 2–4 locations across roughly 25–27 expeditions. The code already contained a `depleted` location-memory concept, but no successful scavenging path actually wrote it.

Resolution:

- successful loot-bearing visits are counted;
- the first three successful scavenges retain normal yield;
- after the third, the site is marked depleted;
- later base yield is reduced but never becomes zero;
- retreat/failure does not consume site stock;
- the route UI exposes successful scavenges and `物资快空` / depletion information.

Production verification with a player that reacts to these cues:

- adaptive explorer reached 7 distinct locations instead of the earlier 3-location loop;
- turtle play no longer collapsed into the former two-location convenience-store/pharmacy loop.

### 5. Ordinary night events could repeat too closely — fixed in PR #35

Resolution: ordinary events seen in the previous two nights are avoided when alternatives are available; fallback preserves the requested nightly budget when the pool cannot satisfy the cooldown.

This changes selection variety, not event effects or danger values.

### 6. Horde nights produced mobile click fatigue — fixed in PR #36

Human production evidence showed late dangerous nights reaching 7–9 separate decision screens. The old scheduler stacked two horde beats fully on top of the normal 2/3/4 ordinary-event budget, with emergency/mortality events added again afterward.

Resolution:

- non-horde nights keep the existing ordinary-event budget;
- horde nights keep both horde beats;
- those horde beats now replace up to two ordinary-event slots instead of stacking fully on top;
- emergency/mortality events remain additive;
- DAY 29 remains the fixed six-stage final horde.

A/B verification, 600 same-seed runs per policy on both variants:

| Policy | Night events / run | Success rate | Avg deaths |
| --- | ---: | ---: | ---: |
| Cautious | 110.40 → 101.21 | 52.0% → 56.3% | 2.553 → 2.465 |
| Balanced | 113.41 → 103.64 | 38.3% → 39.5% | 2.440 → 2.368 |
| Aggressive | 127.29 → 117.08 | 1.17% → 1.50% | 1.760 → 1.730 |
| Rescue | 116.25 → 106.52 | 29.0% → 34.2% | 3.678 → 3.652 |

Across policies, hot-meal days changed by at most 0.06 days and expedition counts by at most 0.41 trips. Horde/emergency counts remained effectively stable; almost all removed decisions were ordinary night events.

Production human verification after deployment:

- explorer late pre-final peak: 5 night decisions;
- turtle late pre-final peak: 6 night decisions;
- prior observed turtle DAY 28 peak: 9;
- DAY 29 remains six fixed final-horde stages by design.

## Latest production human outcomes

### Adaptive explorer

- ending: E05 `我们留下`;
- final horde: `held`;
- population: 6;
- deaths: 0;
- expeditions: 28;
- distinct locations visited: 7;
- final defense: 68;
- final hope: 54.

This is a materially different result from the earlier non-depletion-aware aggressive route loop: exploration remains frequent, but route diversity and defensive survival are both healthier.

### Adaptive turtle

- ending: E10 `街散了`;
- final horde: `damaged`;
- population: 6;
- deaths: 0;
- expeditions: 24;
- distinct locations visited: 3;
- final defense: 69;
- final hope: 6.

Interpretation: the defensive strategy can preserve the physical street while losing the community through prolonged scarcity and low hope. This is consistent with the intended civilian-survival theme and is not treated as a bug.

## Reviewed but intentionally not changed

### Similar expedition counts between explorer and turtle

Both strategies still need to leave the shelter for food and medicine. Expedition count alone is not the strategy identity. Their resource allocation, route risk tolerance, defense, hope and ending outcomes remain meaningfully different. No artificial expedition cap was added merely to make the two counts look farther apart.

### Zero deaths in some competent human runs

This does not indicate that mortality is disabled. Existing paths include critical untreated decline, failed medical crises, expedition death/missing states and civilian deaths from collapse/horde events. The adaptive players deliberately prioritize treatment and avoid explicitly lethal choices. No unconditional mortality increase was added.

### Long-term starvation while resting can maintain, rather than decay, energy

After two fully unfed nights Rest no longer refills energy, but it currently can maintain the current value. This is being treated as an observation rather than a blocker. Escalating this to automatic decline/death would materially change the survival model and is not justified by current production evidence.

## Remaining watch items

- Emergency-heavy late nights can still reach about 6 choices. This is the current watch ceiling, not a blocker.
- DAY 29 intentionally remains six fixed decisions and should not be reduced by normal-night cadence tuning.
- If future content increases the ordinary/emergency pools, re-run the human peak-decision audit rather than relying only on event-repeat simulation.
- Continue watching low-hope departure frequency after any future food or community changes; do not tune it independently without full-run evidence.

## Release gate for audited baseline

For `a4eb63786ba52fb0e64b17e936eed44fe7c881ba` on `main`:

- CI: success;
- UI Smoke: success;
- Xiaohongshu mini-tool build and validation: success;
- Cloudflare production deploy: success;
- post-deploy live production regression: success;
- depletion-aware production human playtests: success.

Current Xiaohongshu artifact:

- artifact: `ember-street-xhs-a4eb63786ba52fb0e64b17e936eed44fe7c881ba`;
- artifact id: `9962759446`;
- artifact archive size: `1,637,712` bytes;
- artifact digest: `sha256:7c4a01d219c41ca4989d9f0d9484b1e9430d3af7b3b4902d504615337aa6b148`.

## Release decision

The audit no longer recommends another broad balance pass before submission. From this point, prioritize only:

1. concrete production blockers or reproducible UI defects;
2. competition packaging / upload correctness;
3. final submission material and release verification.

New large systems or speculative balance changes should be deferred until after the competition build is frozen.
