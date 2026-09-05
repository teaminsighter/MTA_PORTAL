# UI debt

Each item is a discrete fix. Tick `[x]` when the fix lands and reference the
commit. Keep the line so we can trace when and why it cleared.

## Cleared in workspace v2 (this commit)

- [x] **1. Lead header state chip → 5-step stepper.** The single chip
  ("Ready to review") was too coarse to tell "we're mid-flight" from "done".
  Replaced with a horizontal Received / Enriched / Review / Sent / Responses
  stepper driven by `lead.state`. Mobile collapses to a compact progress bar
  under the address.
- [x] **2. Property column has no hierarchy.** Eight equal-weight fact tiles
  buried CV and Estimate. New hero band puts CV and Estimate side by side
  with a semantic-coloured delta between them, and one compact spec line for
  land, floor, beds, built, last sold.
- [x] **3. Comparison strip jammed inside the property column.** Property
  content below the hero now lives in three tabs — Snapshot (headline comp
  metrics), Nearby sales (full-width table, one-line addresses), History
  (compact activity trail).
- [x] **4. Shortlist cards eat too much vertical room.** Cards collapse to a
  single line (name, agency, chips, tick) and expand on click / focus with
  an animated height transition. Target: 5 rows visible without scrolling at
  1440.
- [x] **5. Picked agents drift + no distinction for candidates.** Picked
  agents sort to the top so the send preview matches reading order. Unsigned
  candidates get a dashed border and a full-width Call button, visually
  separating them from signed agents.
- [x] **6. Right rail is always fully expanded.** Rail is collapsible; vendor
  card unchanged; timeline compressed with a "view all" affordance.
- [x] **7. Grid + typography inconsistency.** Standardised on a twelve-col
  4/5/3 split with 24px gutters and 40px section spacing. `--text-muted` and
  `--text-subtle` darkened to pass 4.5:1 on `--surface` (#E9EDF2):
  `#56606D → #454C58` (7.1:1) and `#8892A0 → #626A76` (4.65:1).
- [x] **8. No motion vocabulary.** Added staggered card entrance (200ms),
  spring on the tick, Send bar that slides in on the first pick with a
  count-roll, and skeletons that match the final layout. All motion is
  gated by `prefers-reduced-motion`.

## Open

- [ ] **9. Shell has no max-width; Compare button and right rail clip at the
  viewport edge on ultrawide displays.** Content spills to whichever monitor
  width is running rather than settling at a comfortable reading measure.
  Add a `max-w-[1440px] mx-auto` (or similar) to the shell's main container
  and keep the sidebar / topbar full-bleed.
- [ ] **10. Δ chip between CV and Estimate is unlabelled.** A user reading
  the hero band sees "+9%" without knowing which value is being compared to
  which. Add a small "estimate vs CV" caption underneath (or above) the
  chip, hidden only from decorative screen-reader duplication.
