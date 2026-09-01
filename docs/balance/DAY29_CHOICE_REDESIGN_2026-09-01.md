# DAY29 Choice Redesign — 2026-09-01

## Problem

Audit V2 confirmed that the six-stage finale was converging to the same structure: the character check was usually dominant, the resource option was an expensive but weak insurance policy, and the third option was effectively a failure button. In the original fixed state, several third choices had strongly negative scalar value (for example -16.10 at the north gate, -17.35 on the reroute stage and -35.10 on the last line).

That gives the player three buttons visually but often only one reasonable decision.

## Design target

Each stage now represents three different forms of commitment:

1. **People / risk** — spend no or little stock, but put a survivor and their accumulated preparation into a 2D6 check.
2. **Reserve / certainty** — spend scarce stock for a reliable result. Earlier scavenging, principles or caches can lower several of these costs.
3. **Concession / trade** — deliberately give up one thing to protect another: space for morale, light for power, morale for defense, outer streets for people. These are not intended to beat a well-prepared character check on a single scalar score; they are meant to remain playable when the player values a different state variable or cannot afford the reserve plan.

## Fixed-state EV before → after

Using the same well-prepared DAY29 state and the same Audit V2 scoring model:

| Stage | Original person / resource / concession | Redesigned person / resource / concession |
| --- | --- | --- |
| North gate | 13.53 / 0.95 / -16.10 | 11.10 / 8.70 / 1.10 |
| Power grid | 8.19 / 0.06 / -7.69 | 6.92 / 5.94 / -1.06 |
| Clinic | 8.56 / 0.40 / -6.50 | 8.61 / 4.70 / 0.85 |
| Community | 13.69 / 3.00 / -8.85 | 11.28 / 6.00 / 4.60 |
| Reroute | 16.44 / 1.80 / -17.35 | 13.71 / 6.30 / 1.65 |
| Last line | 24.57 / 10.80 / -35.10 | 20.63 / 16.15 / -4.45 |

The fixed state intentionally favors character checks: six healthy, trusted specialists, Lv3 facilities, eight residents, low pressure, fulfilled promises and strong late-game story flags are present. The goal therefore is **not** to force all three numbers to equality. The important change is that reserve plans are now competitive and concessions are no longer catastrophic pseudo-choices.

## Legacy now matters to reserve plans too

The finale previously concentrated most long-term preparation into character modifiers. The redesign spreads that memory into the reliable route as well:

- North-warehouse protection reduces the north-gate reinforcement bill.
- Generator / vehicle parts reduce the grid replacement bill.
- Medical doctrine and caches reduce emergency medicine use.
- The subway maintenance map reduces the side-street barricade bill.
- North-warehouse protection continues to reduce the final stockpile bill.

This makes exploration and preparation useful even when the player refuses the final dice gamble.

## What remains intentionally unequal

The power-grid concession and last-line retreat remain negative under the scalar EV model. That is acceptable for this pass because both preserve something the scalar score only partially values: future power budget in one case, exposure of core survivors in the other. They should be checked in actual UI playtests rather than buffed only to make a spreadsheet symmetrical.

## Validation gate

- Unit / type / build CI must remain green.
- Full Playtest Audit must remain green.
- DAY29 still has exactly six fixed stages and no random emergency insertion.
- Resource-only play must still be able to advance through all six stages.
- The third option in every stage must stay within the bounded-concession guard instead of returning to catastrophic penalties.

No changes to the general DAY1–28 night scheduler or food economy belong in this branch.
