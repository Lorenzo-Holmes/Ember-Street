# Ember Street UIUX V2.1 Technical Remediation Plan

Task: `EMBER-STREET-UIUX-V2.1`
Depends on: `docs/UIUX_VISUAL_SYSTEM_V2.md`
Evidence: `docs/UIUX_V2_1_LIVE_PLAYER_AUDIT_2026-09-07.md`
Source baseline: `905ac8ea8ee44ce54e138180b1fb856604dcc97d`

## 1. Objective

V2.1 is a visual-regression correction release. It must preserve the V2 identity and existing gameplay while removing cross-theme CSS leakage, duplicate visual hierarchy, mobile scroll-state defects and narrow-screen overflow discovered through real production play.

Success is not "all pages got more CSS". Success means:

- dark scenes own light-text tokens;
- paper pages own ink-text tokens;
- `StoryShell` cannot inherit notebook ink rules;
- the building page still has two navigation mechanisms without looking duplicated;
- important actions remain discoverable before excessive scrolling;
- mobile page-level width never exceeds the viewport;
- transitions between list/detail/story states reset or preserve scroll intentionally.

## 2. Root-cause model

### 2.1 Theme ownership is currently selector-based, not shell-owned

`src/notebook-theme.css` still contains broad selectors such as:

```css
.notebook-page :is(.v1n-event-copy p, .v1n-opening p, .v1n-dice p, .v1e-event-copy p) {
  color: #3b342a !important;
}

.notebook-page :is(.v1n-choices, .v1e-decisions) span {
  color: #3d352b !important;
}
```

Those selectors encode "notebook page = dark ink" regardless of the active V2 shell.

V2 night intentionally uses:

```css
.v1n-page { color: #e5e5e0; background: ...dark...; }
```

The result is mixed ownership: the outer shell is night, but descendant content can still be forced to paper-ink values.

### 2.2 The same legacy class names are shared by multiple visual systems

Examples:

- `.notebook-page`
- `.v1n-primary`
- `.v1n-dice`
- `.v1n-choices`
- `.v1-building`
- `.v1s-*`

Reusing DOM classes is acceptable for compatibility, but visual rules must be scoped by shell role.

### 2.3 Generic notebook CTA rules still style night controls

Legacy rules group daytime and night controls together, for example:

```css
.notebook-page :is(.v1-day-action, .v1-primary-action, .v1s-done, .v1e-primary, .v1n-primary, .v6-cta) { ... }
```

V2.1 should stop treating `.v1n-primary` as a notebook-tape action when it is inside `StoryShell`.

## 3. Required architecture correction

### 3.1 Add explicit shell-owned color tokens

Extend V2 tokens with role-specific text variables instead of relying on one generic `--text-main`:

```css
--scene-text-main
--scene-text-muted
--scene-text-faint

--paper-ink-main
--paper-ink-muted
--paper-ink-faint

--story-text-main
--story-text-muted
--story-text-faint
--story-text-danger
--story-surface
--story-surface-strong
```

Recommended ownership:

- `SceneShell`: scene tokens;
- `BoardShell`: paper/map tokens;
- `BookShell`: paper ink tokens;
- `StoryShell`: story/night tokens.

### 3.2 Scope legacy notebook rules away from StoryShell

Preferred correction order:

1. replace broad `.notebook-page ...` rules with `.v2-shell--book ...` or `.v2-shell--board ...` where they are genuinely paper-specific;
2. if compatibility requires legacy selectors, add an explicit exclusion for StoryShell rather than compensating with dozens of later `!important` declarations;
3. remove `!important` from inherited text-color rules where V2 shell ownership should win;
4. keep only truly global accessibility/geometry rules at `.notebook-page` scope.

Do not solve the problem by adding another 50 night-specific `!important` rules at the end of `uiux-v2.css`. That would hide the architecture defect and create future regressions.

### 3.3 Introduce a CSS ownership test

Create a browser assertion that checks computed colors on representative pages:

- BookShell paragraph: dark ink on light paper;
- StoryShell event paragraph: light text on dark background;
- StoryShell dice heading/body/result: light text on dark background;
- SceneShell hotspot label: readable light text on scene overlay.

The test should fail when a legacy paper token leaks into StoryShell.

## 4. Phase A — P0 contrast repair

### 4.1 Night check/dice/result

Target components:

- `src/ui/v1/NightEventV1.tsx`
- `src/ui/v2/uiux-v2.css`
- conflicting rules in `src/notebook-theme.css`

Required visual contract:

- `.v1n-night-head` main text: light/cool;
- `.v1n-dice > span`: muted cool light;
- `.v1n-dice h1`: high-contrast primary;
- `.v1n-dice p`: readable muted light;
- `.v1n-dice__total span`: muted light;
- `.v1n-dice__total strong`: primary result number;
- `.v1n-dice__total em`: outcome color that remains readable against night;
- `.v1n-primary`: clearly visible CTA with at least one of:
  - solid dark-blue/grey surface + bright text;
  - restrained warm emergency accent + dark text;
  but never dark ink on transparent black.

Acceptance:

- no critical dice/result text may compute to the paper-ink range used by BookShell;
- CTA is identifiable within two seconds in a screenshot with no hover state;
- reduced motion does not alter readability.

### 4.2 Building hotspots

Target: `.v2-building-hotspot`.

Normal state must remain readable. Use state differentiation through opacity/border/image saturation, not by making the label near-black.

Contract:

- normal building name: light neutral;
- normal Lv/status: muted but readable;
- selected: stronger contrast + warm border + slight elevation;
- unavailable: reduce image saturation/opacity, but keep building name readable;
- no selected-only readability.

### 4.3 Building detail

Current detail uses a dark translucent surface but can inherit dark ink. Choose one system and own it explicitly.

Recommended V2.1 direction:

- keep building detail inside `SceneShell` as a dark scene panel;
- keep canonical building art as the visual anchor;
- use scene-text tokens for title/body/cost labels;
- reserve paper for small notices only.

Do not turn the entire building page into paper; this would weaken the shelter-space identity.

## 5. Phase B — remove visual duplication from building navigation

Both selection methods remain mandatory:

1. scene hotspots;
2. permanent building secondary navigation.

The secondary navigation must change role from "second set of building cards" to "compact building index".

### 5.1 Recommended compact index

Current approximate item:

- `96 x 106`;
- image height ~58 px.

V2.1 target:

- height: roughly `64–76 px`;
- width: roughly `78–92 px`, responsive;
- thumbnail height: roughly `30–40 px`;
- one-line building name;
- compact `Lv.X · status` line;
- selected indicator via border/top marker/elevation;
- horizontal scroll remains local.

The index must not repeat long descriptions or upgrade data.

### 5.2 Building page content order

Recommended order:

1. top status;
2. shelter scene + hotspots;
3. compact building index;
4. primary daily action `今天谁去哪里`;
5. selected-building detail;
6. community rotation;
7. optional notes.

Reason: the current DAY1 action appears around `y = 1304`; the core day decision should not require reading the full selected-building upgrade panel first.

The exact position can vary by viewport, but on `390 x 844` the player should encounter the daily-action entry before scrolling through the complete building detail.

## 6. Phase C — overlay and scroll-state correction

### 6.1 Tutorial note/menu collision

During active tutorial, do not allow the fixed menu to occupy the tutorial-note rectangle.

Allowed solutions:

- hide the standalone menu while the core tutorial note is expanded and expose menu access inside the note;
- move menu below the note;
- collapse menu to a small icon in a non-overlapping safe zone.

Preferred: hide/relocate only while the core tutorial note is expanded. Do not permanently remove menu access in free play.

### 6.2 Survivor detail scroll reset

Opening a survivor detail is a new document view and must start at the top.

Implement one of:

- `useLayoutEffect` keyed by `selectedId` to `window.scrollTo({ top: 0 })`;
- move detail to a route/view state where the parent already resets scroll.

Do not use delayed arbitrary timers.

Acceptance:

- immediately after opening detail, the back header is fully visible;
- return to survivor overview may preserve or restore prior list position if intentionally implemented, but must not be accidental.

### 6.3 Route view

Keep current route interaction. Only tune spacing after P0/P1 are green.

Do not introduce drag-and-drop or a real map dependency.

## 7. Phase D — horizontal overflow elimination

Observed affected immersive/document phases at `390 px`:

- dusk;
- night summary;
- dawn.

Measured document width: about `397 px`.

Required debug method:

1. instrument `document.documentElement.scrollWidth`;
2. collect descendants where:
   - `rect.left < -1`, or
   - `rect.right > innerWidth + 1`, or
   - `scrollWidth > clientWidth + 1`;
3. inspect pseudo-elements separately where necessary;
4. identify whether the extra width comes from:
   - notebook page width;
   - negative margin;
   - transform/rotation;
   - pseudo-element binding;
   - box-shadow is not sufficient by itself to increase layout width, so do not misdiagnose shadows;
   - fixed-width content/min-width.

Acceptance:

```js
document.documentElement.scrollWidth <= window.innerWidth + 1
```

must be true at:

- `320 x 568`;
- `360 x 800`;
- `390 x 844`;
- `430 x 932`.

Local horizontal scroll remains allowed only in explicitly designated navigation strips.

## 8. Phase E — mobile touch target cleanup

Audit all visible interactive controls. Target minimum: `44 x 44 px` unless the full row/button provides a larger hit area.

Known live exceptions/near misses include:

- resource drawer toggle ~40 px high;
- survivor filters ~41 px high;
- route back control ~24 px high;
- dawn `直接看完这一页` ~42 px high.

Do not increase all typography; increase hit area with padding/min-height while preserving visual density.

## 9. Phase F — night choice comparison

Do not shrink night text below readable size simply to fit all three choices.

Preferred fixes:

1. during FIRST_NIGHT tutorial, collapse the tutorial note after the player reaches the event or reduce it to a one-line hint;
2. keep event image visually important but allow modest height reduction on short viewports;
3. reduce redundant choice tag spacing;
4. preserve full consequence text.

Goal: on `390 x 844`, the player should be able to see the first two choices without a large scroll and reach the third with a short scroll. All three must remain readable.

## 10. Dusk density refinement

Dusk is information-heavy by design, but its hierarchy can improve without hiding rules.

Recommended order:

1. top warning summary: only the 2–3 most important night risks;
2. primary end-day CTA;
3. compact meal/defense summary;
4. expandable resource/staffing details.

Do not remove hard consequence information. Use progressive disclosure rather than deletion.

## 11. Test plan

### 11.1 Unit/type

Run existing:

```text
npm run typecheck
npm test
```

Do not alter game-rule assertions to make visual work pass.

### 11.2 Browser visual regression

Extend `qa/ui-overhaul` with V2.1-specific checks:

#### Contrast ownership

- StoryShell dice text is not paper ink;
- BookShell journal text is paper ink;
- normal building hotspot label is visible;
- selected and unavailable state still differ.

#### Geometry

- detail opens at scroll top;
- tutorial note and menu do not overlap;
- document width fits all required viewports;
- compact building index remains horizontally usable;
- daily action appears before full building detail on mobile.

#### Interaction

- building hotspot/index still synchronize to one `selectedBuilding`;
- bottom navigation order stays `建筑 / 幸存者 / 探索 / 日志`;
- night rapid click de-duplication remains intact;
- dawn next-day de-duplication remains intact;
- audio behavior remains unchanged.

### 11.3 Real-player flow

Re-run a fresh production-like flow:

`Title -> DAY1 Building -> Survivor -> Route -> Expedition -> Dusk -> Night -> Dice -> Dawn -> DAY2 Journal`

Collect screenshots or computed-style evidence at minimum for:

1. building hub;
2. survivor detail top;
3. dusk;
4. night event;
5. dice before roll;
6. dice result;
7. dawn;
8. DAY2 journal.

## 12. Release gates

Before commit/push:

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

The final mini-tool package must continue to contain:

- no `.mp3`;
- no source maps;
- no full WOFF/WOFF2 payload;
- embedded audio references fully resolved.

## 13. Git strategy

Recommended single logical commit if the work remains tightly coupled:

`fix: resolve UIUX V2 visual regressions`

If implementation becomes large, split only by coherent boundary:

1. `fix: isolate scene and story theme ownership`
2. `fix: tighten building and tutorial mobile hierarchy`
3. `fix: close responsive UI regressions`

Do not mix gameplay balancing into these commits.

## 14. Definition of done

V2.1 is complete only when all are true:

- night event and dice/check pages are both readable;
- no paper-ink token leaks into StoryShell;
- all building hotspot labels are readable in normal state;
- building detail has one coherent visual language;
- two building navigation methods remain but no longer look duplicated;
- tutorial note does not overlap menu;
- survivor detail opens at top;
- no page-level horizontal overflow at all four required phone sizes;
- core touch targets are >= 44 px;
- gameplay/state formulas are unchanged;
- full browser suite is green;
- mini-tool build/audit/package remains green.
