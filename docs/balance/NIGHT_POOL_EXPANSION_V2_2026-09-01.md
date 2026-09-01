# Night Pool Expansion V2 — 2026-09-01

## Goal

Night Cadence V2 successfully reduced the number of ordinary decisions per night, but the early and mid-game `threat / infrastructure / survivor` pools were still small enough that the same situations repeated too often across a 29-night run.

This pass tests a content-side fix instead of restoring higher nightly density:

- keep the existing DAY1–5 / DAY6–23 / DAY24–28 ordinary-event budgets;
- keep cross-night cooldown;
- add twelve grounded ordinary events;
- preserve overall survival pressure rather than buying variety by making the game easier.

## Added scenes

### Threat

- `awning-metal-tap` — 南口雨棚一直在敲铁皮
- `bicycle-alarm` — 街外有辆电动车反复报警
- `roof-shadow` — 对面楼顶有影子停了很久
- `dragging-cart` — 巷子里传来拖车轮子的声音

### Infrastructure

- `shelter-window-loose` — 宿营屋有扇窗一直撞墙
- `battery-acid-smell` — 修车铺里有一股电瓶液的酸味
- `kitchen-gas-hiss` — 饭馆后厨传来很轻的漏气声
- `water-barrel-crack` — 接雨水的桶裂了一道缝

### Survivor

- `blanket-dispute` — 有人为两床厚毯子僵住了
- `night-watch-swap` — 有人说自己今晚实在守不住了
- `hidden-can` — 床底下找到了一只藏起来的罐头
- `doorway-sleeper` — 有人抱着包睡在门边

All twelve follow the narrative-UI rule: the player sees a concrete thing happening in the street rather than a system description of a random event.

## Registration and regression protection

The expansion is registered into the ordinary night pool before scheduling. Regression coverage verifies that:

- all twelve IDs are unique;
- every event has exactly three choices;
- all events belong to `threat`, `infrastructure`, or `survivor`;
- `nightEventById` can resolve them;
- seeded scheduling actually draws expansion events rather than leaving them as dead content.

## Why reward calibration was necessary

The first content expansion solved repetition immediately but changed the overall difficulty too much.

### Initial expansion

- max ordinary repeat/run: ~7.76
- `generator-drop`: ~6.19/run
- average deaths: ~2.30
- Hold+Perfect: **35.3%**

The problem was not event count. The new cards granted too much positive hope/defense/power when resolved successfully, so adding variety also became an unintended source of long-term strength.

### Global positive cap

Capping successful new-event rewards still left Hold+Perfect around **28.7%**. This remained too generous.

### Maintenance-only calibration

Making all new ordinary scenes mostly prevent deterioration pushed Hold+Perfect down to roughly **11%**. Restoring only +1 defense did not materially fix that. This showed that hope accumulation, not tiny defense gains, was the important long-run lever.

## Accepted reward philosophy

The accepted V2 calibration is thematic rather than purely numerical:

- **Threat scenes:** handling the problem prevents things getting worse. They do not make the whole street more hopeful merely because an alarm was silenced or an odd sound was checked.
- **Infrastructure scenes:** repairing a window, hose, barrel, or battery mostly preserves the current state. Positive power is tightly bounded.
- **Survivor scenes:** handling a human problem well may leave up to **+1 hope**, because people noticing how the street treats one another is a credible source of morale.
- Critical checked outcomes may still leave a small extra morale beat.

This keeps hope attached to human moments rather than turning maintenance chores into a morale farm.

## Accepted high-sample result

### Cross-night diversity — 600 runs

| Metric | Integration baseline | Expansion V2 |
| --- | ---: | ---: |
| Max ordinary repeat/run · average | 11.34 | **7.79** |
| P90 | 13 | **9** |
| Max observed | 16 | **13** |
| `generator-drop` | 10.65/run | **6.21/run** |
| `gate-knocking` | 8.94/run | **5.90/run** |
| `argument-rations` | 8.62/run | **6.47/run** |
| `east-footsteps` | 8.39/run | **5.49/run** |
| Average deaths | 2.29 | **2.29** |
| Hold+Perfect | 18.8% | **17.5%** |

The central acceptance condition is satisfied: repetition falls sharply while deaths and overall final-horde success stay close to the integration baseline.

### Corrected V2 policies — 240 runs each

| Policy | Integration baseline | Expansion V2 |
| --- | ---: | ---: |
| cautious-v2 | 20.0% | **24.2%** |
| balanced-v2 | 14.6% | **18.8%** |
| aggressive-v2 | 4.6% | **2.5%** |
| rescue-v2 | 35.0% | **36.7%** |

The policies remain meaningfully different. Rescue remains strongest, aggressive remains fragile, and the expansion does not collapse the game into one universally dominant policy.

Food pressure also remains mid-game pressure rather than disappearing:

- cautious first shortage ~DAY9.7
- balanced ~DAY10.2
- aggressive ~DAY8.5
- rescue ~DAY12.9

## What remains intentionally unchanged

This pass does **not** change:

- nightly event budgets;
- horde cadence;
- DAY29 numbers or six-stage structure;
- food/ration-stretch rules;
- subway rewards or danger;
- community rotation coefficients;
- principle values;
- ending thresholds.

## Decision

Accept the current Night Pool Expansion V2 as the content-diversity candidate.

Do not continue global numerical tuning merely to make the policy percentages exactly match the previous baseline. The aggregate 600-run pressure is already almost neutral, and further adjustment risks fitting the automated policy model rather than improving human play.

The next validation should be qualitative/player-facing:

1. verify that DAY29 choice copy communicates risk / stockpile / concession clearly without exposing ending-tier meta language;
2. inspect representative DAY1 / DAY7 / DAY14 / DAY21 / DAY29 screens;
3. perform human or human-like full-run comprehension testing before any further balance changes.
