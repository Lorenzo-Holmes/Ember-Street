# Food Sustainability Pass — 2026-09-01

## Problem

Audit V2 corrected the automation bug that used to assign exploration and repair before protecting meal preparation. Even after that correction, the first meaningful food shortage still arrived very early and most policies produced only a small number of hot-meal days.

The goal of this pass is **not** to remove scarcity or increase the starting pantry. It is to make assigning a cook matter economically as well as in meal quality.

## Change

A staffed kitchen can stretch scraps, broth and leftovers into a small number of extra portions:

- With at least one assigned cook, at least three people to feed and at least one ration in storage, the kitchen can stretch **one** ration-equivalent portion per night.
- At shelter Lv3 with at least eight people, organized batch cooking can stretch **two** portions.
- An empty pantry can never be stretched into food.
- The bonus is bounded; it does not scale linearly with population and therefore cannot turn a large community into free labor.

This changes consumption efficiency, not loot tables, starting inventory or population consumption rules.

## 240-run corrected-policy validation

Audit V2 was increased to 240 runs per policy and 80 runs per controlled resident cell before accepting the change.

| Policy | Hold+Perfect | Hot meals / 29 | First shortage | Route known |
| --- | ---: | ---: | ---: | ---: |
| cautious-v2 | 4.2% | 7.7 | DAY 8.5 | 97.9% |
| balanced-v2 | 2.1% | 8.1 | DAY 9.0 | 97.9% |
| aggressive-v2 | 0.8% | 6.3 | DAY 7.3 | 41.7% |
| rescue-v2 | 6.7% | 14.0 | DAY 10.9 | 98.8% |

The previous small-sample corrected baseline generally reached shortage around DAY6–9 with roughly 5–11 hot-meal days. The new mechanic moves the pressure point later, especially for a rescue/community-oriented policy, but ration stock still collapses during the midgame. This is the intended direction: **a cook buys time; a cook does not solve food.**

## Controlled residents

DAY14 resident injection remains costly even after the kitchen improvement. In the 80-run cells:

- 5 residents: balanced deaths 5.01 / rescue deaths 6.84.
- 8 residents: balanced deaths 4.85 / rescue deaths 6.33.
- 10 residents: balanced deaths 4.54 / rescue deaths 6.56.
- Hot-meal days at 10 injected residents remain only 8.0 (balanced) and 10.2 (rescue).

So the change does not produce evidence that residents became free late-game power. Large communities still consume the buffer rapidly and still carry mortality pressure.

## Guardrails

- Do not add starting rations in the same pass.
- Do not increase convenience-store loot in the same pass.
- Do not lower resident consumption in the same pass.
- Re-check food after Night Cadence and DAY29 changes are integrated, because fewer night decisions and a redesigned finale can alter downstream resource use.
- Human playtests should verify whether “one cook saves roughly one ration” is understandable through the meal preview without turning the UI into a formula sheet.

## Decision

Accept this as a small, bounded food-efficiency candidate. It is ready for stacked review, but should stay isolated from Night Cadence and DAY29 so its effect remains measurable.
