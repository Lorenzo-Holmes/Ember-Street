# Full Play Experience Audit — 2026-09-01

## Purpose

The project is now system-complete enough that the next gains should come from **how a player experiences DAY1→30**, not from adding another large mechanic.

This audit freezes the already-validated balance work and focuses on four questions:

1. Can the player tell what matters **now** without reading a dashboard?
2. Does the same information appear more than once before the player can act?
3. Are internal implementation terms leaking into the story-facing UI?
4. Can a player reach the day's primary commitment without excessive scrolling or repeated confirmation?

The reference screenshots are the existing Playwright states for DAY1, DAY7, DAY14, DAY21, ordinary night, DAY29 stage 1, DAY29 last line, and DAY30.

## Already closed before this baseline

The preceding DAY29 comprehension pass is considered finished and should not be reopened without new evidence:

- person / stockpile / concession routes now express three different commitments;
- final-horde discounted costs are the same in affordability, deduction, decision tags and visible footer copy;
- DAY29 numeric effects and ending thresholds remain frozen;
- v3 reload now preserves `socialState`, so principles, promises and social pressure no longer disappear after save/load;
- DAY7 / DAY14 / DAY21 milestone screens now survive a real reload and show the correct stage decision.

## Closed in the first full-play UX pass

### Community contribution panel — CLOSED

The first pass removed the dashboard-first presentation:

- `炊事 +2.8` is now led by “能多顾到约 X 人份”;
- repair support is led by “今晚能多补一轮薄弱处”;
- watch support is led by “夜里的岗能轮得更开”;
- medical support is led by “能多照看 X 个轻伤的人”.

Exact mechanical values such as defense gain or night-risk reduction remain available in the smaller hard-information line. The player therefore still has enough information to make a decision without the panel reading like an analytics dashboard.

### Building progression language — CLOSED

Routine building cards no longer expose `Lv1 / Lv2 / Lv3` as the player-facing progression language.

The visible states are now:

- 还没收拾
- 刚能用
- 收拾得像样
- 已经很稳

Material and part costs remain explicit. Upgrade buttons also describe the target physical state rather than `LvN`.

### Survivor specialty enum leak — CLOSED

Assignment cards no longer render raw implementation enums such as `search`, `repair`, or `cook`.

The player sees lived labels instead:

- 熟路
- 维修熟手
- 懂医
- 守夜熟手
- 会做饭
- 懂广播
- 能补位

The underlying specialty mechanics are unchanged.

### Meal / night-preparation hierarchy — CLOSED

The pre-dispatch and dusk previews now use two layers:

1. a human-first sentence such as “今晚这锅能顾到大多数人” or “门能撑，但夜里还得盯紧”;
2. the exact capacity / population / recovery / hope / preparation values underneath.

No decision-critical number was removed.

## Mobile action distance — first gate closed

The first 390×844 measurement showed:

- assignment section from top: **1.38 screens**;
- assignment section top → `安排好了`: **2.98 screens**.

The long second value was mostly caused by routine building management sitting between the primary assignment controls and the daily commitment.

The pass now orders the routine flow as:

`Missing / urgent search → 今日派遣 → meal/night preview → 安排好了 → 街区建设 → memorial / message`

The browser audit was then changed to measure the distance that actually matters during interaction: **last assignment control → `安排好了`**.

Final 390×844 result:

- assignment section from top: **1.38 screens**;
- last assignment control → `安排好了`: **0.21 screens**.

The test enforces a `< 1.5 screen` gate and also asserts that the daily commit button appears before routine building management.

The remaining 1.38-screen distance from the top to the start of assignment is now an observation, not a P1 failure. Much of that space is the street/world anchor, inventory and social state. Do not shorten it by simply deleting narrative context. Revisit only if real-play evidence shows that returning players repeatedly skip or resent the upper sections.

## Browser validation

Final code head for this pass: `2def6578161069b1e9856a5bdf5a1a842a8417e4`.

Validation:

- Typecheck ✅
- Unit tests ✅
- Production build ✅
- Cloudflare validation ✅
- CI run 673 ✅
- UI Smoke run 37 ✅
- Playwright: 5 / 5 ✅
- desktop and 390×844 horizontal clipping checks ✅
- DAY7 / DAY14 / DAY21 principle continuity screenshots ✅
- DAY29 stage 6 commitment + discounted-cost screenshot ✅

Representative screenshots were visually inspected after the automated checks. The first-pass changes did not introduce visible clipping or turn the player-facing screens back into a technical dashboard.

## P2 — Visual hierarchy / illustration gap

The street hero area currently reserves a large visual block but is still mostly an abstract/empty environment shell. That space is justified once the canonical location art is integrated, but before illustration integration it reads as empty vertical weight, especially on mobile.

This should be handled by the separate illustration pipeline rather than by shrinking the world back into a data dashboard. When location masters are ready, the hero should become the main atmospheric anchor for the day screen.

## P2 — Repetition to watch in real play

The simulation audit already measured event repetition. The remaining repetition risk is **interface repetition**:

- the same inventory values appear in multiple phases;
- meal/night preparation previews can appear before and during dispatch confirmation;
- repeated section introductions may become invisible to a returning player by DAY20+;
- principle/promise context can compete with the actual action that needs attention today.

Future changes should prefer progressive emphasis (urgent first, routine quieter) over adding more panels.

## P2 — Returning-player attention

The next useful UX experiment should not be another broad reordering. It should test whether a returning player on DAY14–28 still notices:

- an unresolved promise;
- a missing person or critical wound;
- the meal warning;
- the primary assignment controls;
- a genuinely new building opportunity.

If routine sections are becoming invisible, prefer conditional emphasis / compact summaries rather than hiding high-stakes information.

## Audit gates going forward

A player-facing change should be accepted only if:

- no raw internal enum is visible;
- no routine building card uses `LvN` as its primary progression language;
- community support is understandable without interpreting a percentage formula;
- hard costs / death / missing / irreversible outcomes remain explicit;
- DAY7 / DAY14 / DAY21 principle continuity still survives reload;
- DAY29 stage 6 still displays all three commitments and the effective discounted cost;
- desktop and 390×844 layouts remain horizontally safe;
- last assignment control → daily commitment stays below 1.5 mobile viewports;
- the change does not alter the frozen balance values.

## Next implementation order

1. Audit returning-player attention on representative DAY14 / DAY21 / DAY27 states.
2. Identify repeated panels that can become quieter after the player has already seen them that day, without hiding urgent state.
3. Keep illustration integration separate and replace the empty street hero with approved canonical art when available.
4. Only reopen balance if the playtest audit produces new evidence.

The first full-play P1 pass is complete. The next pass should be about **attention and repetition**, not another layer of systems or another DAY29 rebalance.
