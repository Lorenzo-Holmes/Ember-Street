# Balance Integration Audit — 2026-09-01

## Purpose

Three changes were first validated in isolation:

- Night Cadence V2: lower ordinary-event budget + rotating category anchors + recent-event cooldown.
- Food Sustainability: a staffed kitchen can stretch one ration-equivalent portion, or two in a mature large shelter.
- DAY29 Choice Redesign: person / reserve / concession routes are all intentional strategic choices rather than one correct button plus two penalties.

This branch combines all three without changing the frozen subway rewards, resident rotation coefficients or principle values, then repeats the high-sample audit to look for interaction effects.

## Verification

Combined CI passed typecheck, unit tests, production build and Cloudflare deployment validation.

The full audit also passed with:

- 240 corrected V2 runs per policy.
- 80 controlled runs per resident/policy cell.
- 600 night-diversity runs.
- 360 DAY29 generic-policy convergence runs.
- Fixed-state DAY29 2D6 expected-value enumeration.

## Combined corrected-policy result

| Policy | Hold + Perfect | Hot meals / 29 | First shortage | Route known |
| --- | ---: | ---: | ---: | ---: |
| cautious-v2 | 20.0% | 8.7 | DAY 9.5 | 99.2% |
| balanced-v2 | 14.6% | 8.9 | DAY 9.8 | 97.5% |
| aggressive-v2 | 4.6% | 7.1 | DAY 8.1 | 50.0% |
| rescue-v2 | 35.0% | 13.8 | DAY 11.9 | 98.3% |

The combination is materially more survivable than the original finale while preserving a large policy spread. Aggressive play remains fragile; rescue/community play gains the most from buying food time and having viable non-catastrophic finale choices.

Food remains scarce. Even with the kitchen efficiency pass, normal policies reach first shortage around DAY8–10 rather than carrying comfortable reserves into the late game.

## Night diversity under the full combination

600 full runs:

- Highest repeated normal event/run: avg **11.34**, P90 **13**, max **16**.
- `generator-drop`: 10.65/run.
- `gate-knocking`: 8.94/run.
- `argument-rations`: 8.62/run.
- `east-footsteps`: 8.39/run.
- Average deaths: 2.29.
- Average hot-meal days: 9.65.
- Hold + Perfect: 18.8%.

This preserves the large diversity improvement from Night Cadence V2 after food and finale changes are added. There is no evidence that the other two passes reintroduced the old high-density night problem.

## DAY29 after integration

Fixed-state EV remains the redesigned set:

- North gate: 11.10 / 8.70 / 1.10.
- Power grid: 6.92 / 5.94 / -1.06.
- Clinic: 8.61 / 4.70 / 0.85.
- Community: 11.28 / 6.00 / 4.60.
- Reroute: 13.71 / 6.30 / 1.65.
- Last line: 20.63 / 16.15 / -4.45.

The generic policy model now uses multiple choices on most stages: north gate 70.6% person / 16.1% reserve / 13.3% concession; grid 67.5 / 25.3 / 7.2; clinic 45.6% person / 54.4% reserve; community 61.9% person / 38.1% concession. Route still leans 89.7% toward the informed person check and the last line remains 100% person under the generic policy model.

That final 100% is **not** enough evidence to buff the stockpile again: the fixed prepared state already puts the stockpile EV at 16.15 versus 20.63 for the person check, and the generic policy model overvalues healthy specialists. A later scenario matrix should explicitly test injured/missing watch actors and depleted inventories before another numerical change.

## Residents after integration

High population remains a tradeoff rather than free power. At DAY14 controlled injection:

- balanced-v2: 0 / 5 / 8 / 10 residents → success 6.3 / 18.8 / 17.5 / 26.3%, deaths 1.48 / 4.45 / 4.14 / 3.83.
- rescue-v2: 0 / 5 / 8 / 10 residents → success 46.3 / 13.8 / 20.0 / 15.0%, deaths 3.27 / 5.79 / 5.60 / 5.42.

Residents can help a balanced street survive the finale, but the mortality and food burden remains large. This still does not support lowering or raising the resident-rotation coefficient by itself.

## Decision

The three isolated passes are compatible enough to continue as one candidate integration baseline. Do not merge additional numerical changes into this branch yet.

Next evidence work:

1. Add a DAY29 scenario matrix for wounded/missing specialists, low stock and high/low community states.
2. Expand the early/mid night-event pool on top of the accepted lower cadence; do not increase event count again.
3. Run human/key-day UI playtests for DAY1 / 7 / 14 / 21 / 29, because the automated model can measure pressure and convergence but cannot judge whether the new choices feel emotionally legible.
