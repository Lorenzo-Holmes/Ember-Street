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

## P1 — High-frequency dashboard language still visible

### Community contribution panel

Current player-facing examples still read like a calculation panel:

- `炊事 +2.8`
- `防线 +1`
- `夜间风险 -11%`
- `医疗辅助 +1`

The underlying values are useful, but the presentation should describe **what the extra hands can actually do**. The next copy pass should preserve decision clarity while changing the surface language toward concrete consequences, for example “饭馆能多顾到几个人”“今晚能多补牢一段”“街口轮得开夜里的岗”“诊所能多照看一个轻伤的人”.

Do not hide a cost or irreversible risk merely for atmosphere; this item is about replacing formula labels, not removing useful information.

### Building cards

The day screen still exposes `Lv1 / Lv2 / Lv3`, including upgrade buttons with `· LvN`. This makes repaired civilian spaces read like an RTS tech tree even though the building content itself has already been rewritten as route desk / workshop / clinic / watch post / shelter / radio spaces.

Next pass should replace visible level numbers with condition language such as “刚能用 / 收拾得像样 / 已经很稳”, while keeping material and part costs explicit.

### Survivor specialty enum leak

Assignment cards still render the raw specialty value (`search`, `repair`, `cook`, etc.). These are implementation enums and should never be visible to the player.

Replace them with lived labels such as “熟路 / 维修熟手 / 懂医 / 守夜熟手 / 会做饭 / 懂广播”. The mechanical specialty remains unchanged internally.

## P1 — Decision information is correct but too compressed

The pre-dispatch preview currently compresses several values into one line, e.g. cooking coverage, population, next-morning energy and hope delta. These values are decision-critical, so they should **not** be deleted. The problem is hierarchy: the player has to parse a formula-like sentence to understand whether tonight's meal is good enough.

Next pass should keep the numbers but split them into a human first sentence and a smaller hard-info line. Example structure:

- first: “今晚这锅能顾到大多数人。”
- second layer: `约 6.9 人份 / 街里 8 人 · 明早精力 +8 · 希望 -1`

The same rule should apply to night preparation.

## P1 — Mobile action distance

The 390×844 DAY1 capture has no horizontal clipping, but the main day screen is long. Before the final “安排好了” commitment, the player can pass through inventory, community, social state, missing people, buildings, assignments, previews and memorial content.

The next audit should measure **action distance**, not simply page height:

- how many screens of vertical scroll from top to first meaningful assignment control;
- how many screens from the last edited assignment to “安排好了”;
- whether non-urgent panels can collapse after the player has already read them once that day;
- whether urgent information (missing people, critical wounds, unresolved promise) stays above routine building management.

Do not solve this by hiding high-stakes information.

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

## Audit gates for the next implementation pass

A player-facing change should be accepted only if:

- no raw internal enum is visible;
- no routine building card uses `LvN` as its primary progression language;
- community support is understandable without interpreting a percentage formula;
- hard costs / death / missing / irreversible outcomes remain explicit;
- DAY7 / DAY14 / DAY21 principle continuity still survives reload;
- DAY29 stage 6 still displays all three commitments and the effective discounted cost;
- desktop and 390×844 layouts remain horizontally safe;
- the change does not alter the frozen balance values.

## Recommended implementation order

1. Remove internal enum and `LvN` leaks.
2. Rewrite the community contribution summary into concrete consequences.
3. Split meal/night-preparation previews into story sentence + hard-info layer.
4. Measure mobile action distance and only then decide whether routine panels need collapse/reordering.
5. Integrate canonical street/location illustrations once approved assets are available.

This order deliberately avoids another broad redesign. Each step can be browser-audited against the same DAY1 / DAY7 / DAY14 / DAY21 / DAY29 states before moving to the next one.
