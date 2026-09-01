# DAY29 Stress & Ending Utility Audit — 2026-09-01

## Why this audit exists

The first DAY29 redesign audit used a strong, fully prepared state and a linear expected-value score. That was useful for detecting the original fake-choice structure, but it was not enough to answer two later questions:

1. Do resource choices remain viable when costs are paid across all six phases rather than evaluated one stage at a time?
2. Is the final retreat option actually a bad choice, or does the threshold-based ending grade give certainty value that a linear score misses?

This pass therefore adds scenario stress tests, sequential resource accounting, and final-grade probability analysis.

## Audit correctness fix

The first scenario-matrix implementation accidentally passed an already-discounted DAY29 choice into `canAffordNightChoice`, which applies `effectiveFinalHordeChoice` internally. That could apply legacy discounts twice when checking affordability.

The audit now uses:

- `effectiveFinalHordeChoice(state, rawChoice)` for EV/cost inspection;
- `canAffordNightChoice(state, rawChoice)` for affordability.

The corrected low-stock state now correctly marks several reserve options unavailable.

## Stress scenarios

The audit covers:

- `prepared`: six healthy high-trust specialists, Lv3 facilities, 8 active residents, strong stockpile, fulfilled promises, principles and major legacy preparation flags;
- `battered-roster`: the same strategic preparation but the entire core roster is wounded and low on energy;
- `battered-no-legacy`: wounded roster without the long-term exploration/principle preparation package;
- `low-stock-no-legacy`: healthy roster but very low materials, parts, medicine and power, with no legacy discounts.

## Sequential six-stage reserve route

The resource route must now pay every phase in order.

### Prepared

The full six-stage reserve route is affordable. After all six phases, the prepared state still has substantial stock remaining:

- materials 24 → 16
- parts 14 → 10
- medicine 12 → 11
- ration 30 → 26
- power 70 → 70

This confirms that long-term stockpiling and legacy preparation can support a genuine “do not gamble the finale on one last roll” route.

### Battered, no legacy

The same route is still affordable from a deliberately large starting stockpile, but costs are visibly higher without preparation discounts:

- materials 24 → 11
- parts 14 → 6
- medicine 12 → 10
- ration 30 → 26

This is intentional: preparation saves real stock but is not the only way a hoarding-heavy run can finish the night.

### Low stock, no legacy

The route breaks immediately and repeatedly:

- North-gate reinforcement: unavailable
- Grid replacement: unavailable
- Clinic emergency supply: unavailable
- Community rations: affordable, exhausting the remaining ration
- Reroute barricade: affordable, exhausting materials/parts
- Last-line stockpile: unavailable

This confirms that the reserve route is not a free universal fallback. It is a payoff for resources accumulated before DAY29.

## Final-line ending utility

The final grade is threshold-based (`perfect / held / damaged / breached`), so linear stat EV can mis-rank a safe choice. A separate audit enumerates the actual 2D6 outcomes for the person route and compares the resulting final grade against the two deterministic routes.

Utility used only for reporting:

- breached = 0
- damaged = 1
- held = 2
- perfect = 3

### Prepared state

- `final-last-hold`: utility 2.972 — 97.2% perfect, 2.8% held
- `final-last-stockpile`: utility 3.000 — 100% perfect
- `final-last-retreat`: utility 2.000 — 100% held

The resource route is therefore not inferior to the person route in the fully prepared state. The retreat route has a clearly different promise: it gives up the perfect outcome in exchange for certainty.

### Low stock, no legacy

- `final-last-hold`: utility 2.583 — 58.3% perfect, 41.7% held
- `final-last-stockpile`: unavailable
- `final-last-retreat`: utility 2.000 — 100% held

This is the intended three-way structure:

- gamble on people for a chance at perfect;
- spend preparation for certainty when the stockpile exists;
- give up the perfect result and guarantee the street survives when the stockpile is gone.

### Edge-of-held threshold

At defense 50 / hope 32 without legacy:

- person route: 97.2% held, 2.8% damaged;
- resource route: 100% held;
- retreat route: 100% damaged.

The retreat option is not supposed to be universally optimal. When the street is already close to the held threshold and stock remains, the other two routes should be better.

### Battered, no legacy

All three routes remain `damaged` in the deliberately poor state. This is also useful evidence: the last button cannot erase twenty-eight days of weak preparation by itself.

## Decision

Freeze the current DAY29 choice numbers for this pass.

The earlier linear EV report made `final-last-retreat` look like a fake button, but the ending-utility audit shows that it has a real role in a low-stock but otherwise viable state. Further numerical buffing would risk turning the deterministic concession route into the dominant route simply because the linear EV looks prettier.

Future DAY29 work should focus on player-facing clarity and human playtest comprehension, not another blind balance adjustment.
