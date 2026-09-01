# v0.6.0 Playtest Audit

This directory contains the non-UI, seeded DAY1 -> DAY30 stress-test harness for Ember Street v0.6.0.

## Measure-first contract

The simulator calls the existing game domain functions for assignments, buildings, expeditions, meals, night events, dice, principles, community support and endings. It does not drive the React UI and it does not contain a second copy of balance rules.

Policy RNG and game RNG are intentionally separate. For a fixed game version, seed and policy, the full run is deterministic.

## Policies

Five natural player models are always included:

- `random`
- `survival-greedy`
- `production-greedy`
- `exploration-greedy`
- `strong-heuristic`

Nine `principle-greedy:<principle>` policies reuse Strong Heuristic behavior while forcing one target principle when its stage is reached. They are counterfactual strength probes and are excluded from natural pick-rate / dominant-choice anomaly thresholds.

## Commands

```bash
npm run audit:playtest -- --runs 100 --day29 120
npm run audit:playtest -- --runs 1000 --day29 600
npm run audit:playtest:baseline
```

`--runs` is the total number of complete campaigns, not runs per policy. The scheduler cycles policies over paired seeds, so policies are compared on the same seed set whenever the requested run count permits it.

Baseline defaults:

```text
runs       10000
DAY29      3000 synthetic states
seed       606000
reports    reports/playtest/
docs       docs/playtest/
```

## Outputs

CSV / JSON:

- `principle_balance.csv`
- `community_curve.csv`
- `location_value.csv`
- `day29_choice_matrix.csv`
- `event_repetition.csv`
- `daily_pressure_curve.csv`
- `ending_distribution.csv`
- `failure_day_distribution.csv`
- `baseline-summary.json`
- `balance_anomalies.json`
- `run-config.json`

Markdown audit reports are written to `docs/playtest/`.

## DAY29 methodology

DAY29 is a six-stage final horde. The audit therefore forks each legal choice at every final-horde stage (`stageEventId x choiceId`). Each fork executes exactly one forced choice, then uses Strong Heuristic for the remaining stages. The source state is deep-cloned and mutation is treated as a test failure.

Synthetic state generation spans low/medium/high population, four food bands, core-survivor loss patterns, three building bands, three community bands (including >25 residents), all principle routes, exploration progress and ending-eligibility strength.

## Community methodology

Full-run observations are supplemented by a counterfactual 0 -> 30 resident sweep that directly calls the live community and meal domain functions. This ensures the 10/15/20/25+ scaling ranges are measured even if ordinary seeded campaigns rarely reach them.

## Baseline discipline

`v0.6.0-baseline-playtest` is measurement-only. Any balance changes discovered here should be made on a separate balance branch and compared against these generated files.
