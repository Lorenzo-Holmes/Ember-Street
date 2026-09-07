# Ember Street UIUX V2.1 — Next Session Continuous Execution Prompt

Use this document as the main instruction for the implementation session.

---

@DevSpace Local（固定域名）

You are continuing development of `Ember Street / 余烬长街`.

The only workspace is:

`D:\Ember-Street`

The current task is:

# `EMBER-STREET-UIUX-V2.1`

## Live visual regression correction after real production play

This is not a new visual redesign and not a gameplay redesign. Start from the real disk state and continuously execute audit -> implementation -> browser validation -> fix -> regression -> mini-tool package validation -> Git commit -> push.

Do not stop after every page or test. Continue until a stable green recovery point unless a genuine external permission/blocking condition occurs.

## Required reading before modification

Read these files first:

- `docs/UIUX_VISUAL_SYSTEM_V2.md`
- `docs/UIUX_V2_IMPLEMENTATION_REPORT.md`
- `docs/UIUX_V2_1_LIVE_PLAYER_AUDIT_2026-09-07.md`
- `docs/UIUX_V2_1_TECHNICAL_REMEDIATION_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/MINITOOL_RELEASE.md`

Then inspect:

- `src/notebook-theme.css`
- `src/ui/v2/uiux-v2.css`
- `src/ui/v2/UiV2.tsx`
- `src/V1Entry.tsx`
- `src/ui/v1/BuildingsV1.tsx`
- `src/ui/v1/NightEventV1.tsx`
- `src/ui/v1/StoryPhasesV1.tsx`
- `src/ui/v1/SurvivorsV1.tsx`
- `src/ui/v1/TutorialGuide.tsx`
- `src/ui/v1/TitleScreen.tsx`

## Recovery audit

Before changing any file:

1. `git status`
2. current branch
3. `git remote -v`
4. current SHA
5. recent 15 commits
6. `git diff`
7. confirm no unknown uncommitted work exists

Do not discard unrelated user work.

## P0 implementation order

### 1. Fix theme ownership first

The main defect is cross-theme CSS leakage.

Legacy notebook rules currently force paper-ink colors into StoryShell/night content. Do not fix this by adding a large pile of final `!important` overrides.

Refactor ownership so:

- SceneShell owns scene text tokens;
- BoardShell/BookShell own paper ink;
- StoryShell owns night/crisis light text;
- broad `.notebook-page` rules no longer force dark ink into StoryShell.

Pay special attention to selectors in `src/notebook-theme.css` that target:

- `.v1n-dice p`
- `.v1n-choices span`
- `.v1n-primary`
- `.v1n-dice__total`
- night headers

### 2. Repair night dice/check/result contrast

The real production audit reproduced the user's unreadable screenshot.

Required:

- header readable;
- check title readable;
- explanatory text readable;
- dice/result summary readable;
- result status readable;
- primary action clearly visible;
- reduced-motion mode unchanged functionally.

### 3. Repair building scene contrast

Normal/unselected building labels must be readable. Selected state should be stronger, not uniquely readable.

Unavailable state may reduce thumbnail saturation/opacity but may not hide the building name.

### 4. Repair building detail visual language

Keep it as a SceneShell dark scene panel. Use scene text tokens. Do not let paper-ink text sit on the dark translucent panel.

## P1 implementation order

### 5. Compress secondary building navigation

Retain both mandatory navigation paths:

- scene hotspots;
- secondary building index.

But change the secondary row from large duplicate cards to a compact index strip. It must still show:

- thumbnail;
- name;
- Lv.;
- status;
- selected state.

Both paths still update the same `selectedBuilding` and selection must persist after leaving/returning.

### 6. Raise the main daytime action

`今天谁去哪里` must appear before the player scrolls through the entire selected-building detail.

Recommended order:

status -> shelter scene -> compact building index -> daily action -> building detail -> community rotation.

Do not remove building details.

### 7. Fix tutorial/menu collision

During the expanded tutorial note, the menu cannot occupy the same top-right rectangle.

Use the lowest-risk solution that preserves menu access without visual overlap.

### 8. Fix survivor-detail scroll reset

Opening a survivor detail must show the header/back action at the top immediately. Avoid arbitrary timeout hacks.

### 9. Eliminate page-level horizontal overflow

Audit at:

- 320 x 568
- 360 x 800
- 390 x 844
- 430 x 932

Known live affected phases:

- dusk;
- night summary;
- dawn.

Local horizontal strips are allowed only where intentional. Page-level `documentElement.scrollWidth` must fit.

### 10. Fix sub-44px touch targets

Known live candidates:

- resource drawer toggle;
- survivor filters;
- route back action;
- dawn reveal-skip action.

Increase hit area, not unnecessary typography.

## P2 only after P0/P1 are green

- tighten dusk information hierarchy through progressive disclosure;
- reduce unnecessary route-card vertical density;
- reduce tutorial obstruction during FIRST_NIGHT so choices are easier to compare.

Do not reduce consequence readability to make the screen shorter.

## Frozen gameplay boundary

Do not change unless fixing a proven bug:

- DAY structure;
- building costs/levels;
- survivor stats;
- assignment formulas;
- expedition rewards/risks;
- night probabilities;
- seeded RNG;
- endings;
- tutorial completion rules;
- resident population rules.

## Required browser validation

Run the full existing UI suite plus new V2.1 regressions.

At minimum verify real flows:

### Flow A

Title -> new game -> building hub -> switch buildings -> building detail.

### Flow B

Survivors -> detail opens at top -> assignment -> return.

### Flow C

Explore/route -> choose route -> dispatch -> expedition event.

### Flow D

Dusk -> night event -> dice before roll -> dice result -> remaining night -> summary.

### Flow E

Dawn -> next day -> journal.

Add computed-style assertions that prevent paper-ink leakage into StoryShell.

## Required release gates

Run:

```text
npm run typecheck
npm test
npx playwright test qa/ui-overhaul
npm run build
npm run audit:audio
npm run audit:assets:strict
npm run build:minitool
node scripts/audit-minitool.mjs <final-app>
node scripts/package-minitool.mjs <final-app>
npm run cf:dry-run
```

Do not invent a lint command if `package.json` still has none.

## Mini-tool constraints

Do not reintroduce:

- `.mp3` into the mini-tool package;
- full Chinese WOFF/WOFF2 files;
- source maps;
- runtime network audio;
- heavy animation dependencies.

Keep Base64 JS + Web Audio compatibility intact.

## Git

After all tests are green:

1. inspect `git status`;
2. inspect `git diff --stat`;
3. inspect `git diff`;
4. ensure no screenshots/test reports/debug dumps are staged;
5. commit with a clear message, recommended:

`fix: resolve UIUX V2 visual regressions`

6. push the correct current branch to origin.

If push is blocked by real external permission/network failure, retain the local commit and report the SHA/reason.

## Completion definition

Do not call V2.1 complete until all are true:

- dice/check page is clearly readable on live-like dark night context;
- normal building labels are readable;
- building detail has coherent contrast;
- two building navigation methods no longer look like duplicate card sets;
- daily action is not buried below the entire building detail;
- tutorial note and menu do not overlap;
- survivor detail opens at top;
- no page-level horizontal overflow at all required mobile sizes;
- core touch targets are >=44px;
- full browser suite is green;
- mini-tool build/audit/package is green;
- gameplay formulas remain unchanged;
- Git commit and push are complete or push has a documented external block.

Final report only once at the end.
