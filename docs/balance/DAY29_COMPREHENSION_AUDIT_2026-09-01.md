# DAY29 Comprehension Audit — 2026-09-01

## Scope

This pass does **not** change the validated DAY29 balance values. It checks whether the player can understand the three promises behind each final-horde choice and whether the UI shows the same resource cost that the engine actually charges.

## Player-facing contract

For DAY29 final-horde choices, the three routes are now presented as distinct commitments rather than three mechanically vague buttons:

- **Person route** — save the stockpile and put the outcome in people's hands. Skills, injuries, facilities and earlier preparation affect the check; failure can land on people directly.
- **Resource route** — spend the currently displayed stock and remove the dice roll from that stage. If earlier preparation reduces the cost, the UI shows the discounted amount and explains that the old preparation saved material.
- **Concession route** — do not roll and do not spend a guarantee stockpile, but consciously give something up: outer ground, lighting, medical priority, order, or the last outer line.

The final-stage retreat is therefore framed as an intentional survival commitment: pull people into the inner street, stop gambling over the last few metres, and accept that the outer layer will not be held.

## Cost consistency fix

`effectiveFinalHordeChoice` was already used by affordability checks and resource deduction, but the night card footer previously formatted the raw `choice.cost`. A prepared street could therefore see one price and pay another.

The UI now derives the visible cost from the same effective choice used by the engine. Example: with `final_horde_supplies`, `final-last-stockpile` is shown as:

`材料 -3 · 零件 -1`

instead of the undiscounted `材料 -6 · 零件 -3`.

Regression tests lock both the visible footer cost and decision tags to the discounted amount.

## Save continuity issue found during visual audit

The milestone screenshot audit exposed a separate real bug. Every v3 reload passes through `promoteV2ToV3`, but the migration reconstructed the save without `socialState`. As a result, a reload could silently forget:

- selected street principles;
- an active community promise;
- social pressure;
- fulfilled / broken promise counts;
- last request / social outcome metadata.

This was why a synthetic DAY14/DAY21 reload kept reopening the DAY7 principle decision.

The migration now normalizes and restores `legacy.socialState`. A save-resume regression test verifies principles, an active promise, pressure and promise history survive JSON reload.

## Browser audit

Representative states were rendered through the real save/load path and checked at browser level.

- DAY7 shows `下一口先给谁？`.
- DAY14 retains the DAY7 principle and shows `下一次出事，谁站前面？`.
- DAY21 retains the first two principles and shows `这条街还要守多久？`.
- DAY29 stage 6 shows all three commitments at once: `省下库存 / 结果交给人`, `用库存换确定`, and `先保住人 / 主动放弃外层`.
- The prepared stockpile path visibly shows `材料 -3 · 零件 -1`.
- The audited screens remain free of horizontal clipping at the tested viewport.

## Validation

Functional head `bb30944c2e74b89888c54b94f5dfc24c6f49a0af`:

- Typecheck ✅
- Unit tests ✅
- Production build ✅
- Cloudflare validation ✅
- UI Smoke ✅

Visual milestone validation was also confirmed on the preceding migration-fix head, where the same UI code passed the full browser suite and produced the DAY7 / DAY14 / DAY21 / DAY29 screenshots.

## Frozen after this pass

Do not tune the DAY29 numeric effects simply to make the three routes look equal under a linear score. The ending-grade audit already established that the concession route has nonlinear value as a deterministic survival option. Future work should focus on full-play experience, copy density, visual hierarchy and representative player-path testing rather than reopening DAY29 balance without new evidence.
