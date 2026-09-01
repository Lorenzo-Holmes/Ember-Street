# Night Cadence V2 Findings — 2026-09-01

## Why this pass exists

Audit V1 showed that several ordinary night cards were appearing so often that the player could effectively memorize them. A cooldown-only experiment improved the numbers but did not solve the structural cause: every night still demanded too many ordinary decisions, and the scheduler forced threat / infrastructure / survivor coverage even when the eligible pool was small.

Night Cadence V2 therefore changes structure rather than only weights:

- DAY 1–5: 2 ordinary night decisions.
- DAY 6–23: 3 ordinary night decisions.
- DAY 24–28: 4 ordinary night decisions.
- Horde nights add their horde slots on top of that pressure curve.
- DAY 29 remains the fixed six-stage finale.
- Ordinary category anchors rotate instead of forcing all three major categories every night.
- Recent-event cooldown remains in place.

## 600-run result

Using the corrected Audit V2 policies across 600 full DAY1→30 runs:

- Highest repeated normal event per run: average 11.47, P90 13, max 18.
- `generator-drop`: 10.72/run, down from 19.46 in Audit V1.
- `argument-rations`: 9.06/run.
- `gate-knocking`: 8.88/run, down from 15.67.
- `east-footsteps`: 8.38/run, down from 14.53.
- Average deaths: 2.33.
- Average hot-meal days: 7.72 / 29.
- Hold + Perfect: 9.8%.

The earlier cooldown-only experiment still had an average maximum repeat of 16.81 with P90 19. Cadence V2 therefore produces a much larger diversity improvement than weighting alone while not increasing average deaths.

## Decision

Cadence V2 is accepted as the new scheduler baseline for further testing. The cooldown-only PR should not be merged independently because Cadence V2 supersedes it and already contains the useful cooldown behavior.

This does **not** mean night repetition is solved forever. `generator-drop`, ration arguments and the two early threat cards still appear too often for a 30-day narrative game. The next content pass should expand early/mid threat, infrastructure and survivor scenes, but it should do so on top of this lower event budget rather than restoring five ordinary decisions every night.

## Guardrails

Do not compensate for the lower event count by silently increasing per-card damage or emergency frequency. Difficulty should continue to be measured through deaths, food pressure, final-horde results and resource curves. Quiet space is part of the intended pacing, not missing content.
