# Ember Street UIUX V2.1 Live Player Audit

Date: 2026-09-07
Task: `EMBER-STREET-UIUX-V2.1`
Audit target: `https://ember-street.1106314996.workers.dev/`
Reference source baseline for remediation: `905ac8ea8ee44ce54e138180b1fb856604dcc97d`
Primary viewport: `390 x 844`
Mode: fresh player, empty local save, real production URL

## 1. Purpose

This audit records what a first-time player actually sees while completing a real DAY1 -> NIGHT1 -> DAY2 loop on production. It exists to prevent the next UI pass from being judged only by static screenshots, unit tests or isolated components.

No gameplay values, event probabilities, survivor formulas or building costs are evaluated here unless they directly affect visual clarity or progression usability.

## 2. Actual player path executed

The live production path completed successfully:

1. title screen;
2. start new game;
3. DAY1 building/shelter hub;
4. tutorial resource acknowledgement;
5. survivor overview;
6. survivor detail;
7. assign Ah-He to cooking;
8. assign Lin Xia to expedition;
9. choose Convenience Store route;
10. dispatch roster;
11. resolve expedition with cautious search;
12. reach dusk;
13. end day;
14. enter first-night door-knocking event;
15. choose `让守夜的人确认`;
16. roll `3 / 6 / 6`, retained result total `7` under disadvantage;
17. record the partial-success outcome;
18. resolve remaining night content;
19. night summary;
20. dawn settlement;
21. advance to DAY2;
22. open journal.

Runtime result:

- no page JavaScript errors observed;
- no failed asset/network requests observed during the audited path;
- save progression reached DAY2 correctly.

Therefore the main issues below are presentation regressions, CSS inheritance conflicts, hierarchy problems and mobile UX defects rather than failed loading.

## 3. Measured live findings

### 3.1 Building hub

At DAY1 with the tutorial note visible:

- document height: about `1497 px`;
- shelter scene: about `370 x 278`;
- six scene hotspots are all present;
- six secondary building entries are also present;
- secondary navigator item size is about `96 x 106`;
- `今天谁去哪里` appears around `y = 1304`;
- bottom navigation remains fixed at the viewport bottom.

The selected shelter hotspot has readable light text. A normal unselected hotspot measured approximately:

- text color: `rgb(63, 56, 45)`;
- scene background: approximately `rgb(17, 19, 15)` plus art/overlay.

This is insufficient for quick recognition in a dark scene.

The building detail region measured approximately:

- text/inherited color: `rgb(41, 37, 29)`;
- background: `rgba(12, 14, 12, 0.44)` over a dark scene/page.

This confirms a semantic mismatch: paper/ink colors are entering a dark scene surface.

### 3.2 Duplicate building presentation

The live building hub presents the same six buildings twice in immediate sequence:

1. six physical scene hotspots;
2. six large thumbnail cards.

The requirement for two selection paths is correct. The visual execution is not: both paths currently have comparable visual weight, which makes the second row feel like duplicated content instead of a quick index.

### 3.3 Tutorial note versus menu

At `390 x 844`:

- tutorial note occupies roughly `x = 14..377`, `y = 7..170`;
- menu button occupies roughly `x = 311..378`, `y = 9..55`.

The menu therefore physically overlaps the tutorial-note area. The page remains technically clickable, but the composition reads as layered UI collision.

### 3.4 Survivor overview/detail

Survivor overview works structurally, but detail navigation exposed a scroll-state problem.

After opening Ah-He detail, the back control was measured around `y = -199`, meaning the new detail view inherited the previous scroll position instead of starting at the top.

Result for a real user:

- portrait/status/jobs appear without the expected page-header context;
- the return affordance can begin above the viewport;
- the user must scroll up before understanding the detail-page structure.

### 3.5 Route selection

The selected route card can grow very tall on mobile. In the audited DAY1 route view:

- the single location card was roughly `353 x 447`;
- the confirmation action started around `y = 993`;
- the local page height was roughly `1168`.

This remains usable but is information-dense. It is not a P0 defect, but long route descriptions and tutorial overlays should remain under regression coverage.

### 3.6 Dusk page

The dusk page reached roughly `1699 px` document height at `390 x 844`.

More importantly, document width was measured at about `397 px` for a `390 px` viewport.

The page contains:

- resource ledger;
- defense state;
- meal state;
- medical/repair/radio staffing;
- causal warnings;
- tutorial note;
- progression CTA.

This is both dense and slightly horizontally overflowing.

### 3.7 Night event

The main event screen is the strongest part of the V2 night direction.

The event narrative copy measured as high-contrast light text around `rgb(229, 229, 224)`. The three choices remain readable and the cold crisis visual language is clear.

However, the tutorial note still occupies the top ~162 px, increasing the distance between event art/copy and the choices.

The three first-night choice rows began around:

- choice 1: `y ~= 711`;
- choice 2: `y ~= 856`;
- choice 3: `y ~= 1009`.

The player must scroll to compare all three choices.

### 3.8 Dice / check page — P0 regression

This is the clearest visual failure.

Before rolling, computed styles included:

- night header/inherited text: approximately `rgb(33, 29, 23)`;
- dice panel inherited text: approximately `rgb(33, 29, 23)`;
- main CTA text: approximately `rgb(48, 42, 32)`;
- CTA background: very weak dark-brown translucent fill.

After rolling, dice-face numerals are visible because the dice themselves use a separate light treatment, but surrounding result text remains dark.

This reproduces the user's screenshot issue exactly: the event page is readable, then the check/result page regresses to paper-ink colors while still sitting inside a night context.

### 3.9 Night summary and dawn

Night summary and dawn both showed document width around `397 px` on a `390 px` viewport.

Dawn itself is readable and the journal content is useful, but the page is long:

- dawn document height: roughly `1481 px`;
- `直接看完这一页` appears near `y = 1320`;
- `翻到第 2 天` appears near `y = 1390`.

This is acceptable for a journal page, but horizontal overflow is not.

### 3.10 DAY2 journal

DAY2 journal content is structurally correct and readable. The book-page treatment is working better than the night-dice treatment.

The journal remains a useful reference implementation for paper-token ownership: dark ink on light paper works; it should not leak into `StoryShell`.

## 4. Priority classification

### P0 — must fix before further visual expansion

1. Night check/dice/result text contrast.
2. Building hotspot default-state text contrast.
3. Building detail dark-surface/paper-ink token conflict.
4. CSS ownership conflict between legacy notebook rules and V2 shell-specific rules.

### P1 — must fix in V2.1

1. Secondary building navigator feels like duplicate cards instead of a compact index.
2. Tutorial note overlaps menu.
3. Survivor detail does not reset scroll position.
4. Building primary day action is too deep in the page.
5. Dusk/night-summary/dawn page-level horizontal overflow.
6. Night tutorial layout pushes choice comparison too far below the fold.

### P2 — polish after P0/P1 are green

1. Some touch targets remain below 44 px.
2. Dusk page information density can be progressively disclosed.
3. Route-page long-text density can be tightened without changing data.

## 5. Non-goals

V2.1 is not permission to add:

- new resources;
- new building types;
- new survivor stats;
- new combat systems;
- new night probabilities;
- new ending logic;
- new map dependencies;
- a new design theme.

The target is regression correction and visual ownership cleanup inside the existing V2 identity.
