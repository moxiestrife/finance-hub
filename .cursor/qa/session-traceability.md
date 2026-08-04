# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Monthly ledger multi-select: Excel-style modifiers on web; long-press multi mode on mobile.

## Work type

[x] Personal app — hostess / finance-hub

## QA tier

**Tier:** 2 — Monthly ledger interaction

## User intent (verbatim)

"web multi select pattern is holding shift to add to the selection. releasing shift will return the next mouseclick as a normal selection, not multi select. Not shift to go into multi select... user has to hold it shift to continue multiselecting and shift+ select to a far row with in betweens will select all in between. Click releases multi select. Ctrl+ Click adds a separate 1 row item to the selection without selecting the rows in between. Just like how Excel selection works. Again, this is for web. Mobile should have its own multi select pattern"

## Acceptance criteria

- [x] AC-1: Plain click focuses one row only and releases any multi selection (web).
- [x] AC-2: Shift+click selects contiguous range from selection anchor to clicked row (in-betweens included); does **not** latch a multi-select mode.
- [x] AC-3: Further Shift+clicks re-range from the same anchor while Shift is used; releasing Shift + plain click = single select.
- [x] AC-4: Ctrl/Cmd+click toggles one row into/out of selection without selecting in-between.
- [x] AC-5: Mobile — long-press still enters `ledgerMultiMode` with Cancel / Select all; taps toggle; pick indicators.
- [x] AC-6: Dock hint (fine pointer): “Shift+click range · Ctrl+click to add · Double-click to edit”

## Files touched

- `index.html` — Excel-style `handleRowClick` + `ledgerSelectAnchor`; mobile mode unchanged entry via long-press

## UX notes

- Web: modifiers only (no Cancel/Select-all latch from Shift).
- Mobile: long-press mode with Cancel | Select all.
- Anchor set by plain click / Ctrl+click / ⋯; Shift does not move the anchor.

## Regression risks

- Anchor stale after `render()` rehydrate
- Cmd vs Ctrl on macOS (`metaKey`)
- Mobile plain tap must still toggle when `ledgerMultiMode` (not take web plain-click path)

## Status

Rose: **PASS WITH NOTES** ([Rose](ee51a601-3027-4394-81a4-6c2d53d7bd3d)). H-1 fixed (Ctrl always updates Shift anchor).
