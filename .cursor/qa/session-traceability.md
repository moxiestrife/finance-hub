# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Fix Payables mobile/compact row layout so open payables are usable (full names, no overlapping chips, no duplicate account tag).

## Work type

[x] Personal app — hostess / finance-hub

## QA tier

**Tier:** 2 — Payables mobile interaction / layout

## User intent (verbatim)

"right. okay let's fix payables. I'll switch you to cloud so I can sleep. Look at mobile, it's actually not usable."

## Acceptance criteria

- [x] AC-1: Compact payable row shows full expense name (not truncated to 3 letters).
- [x] AC-2: Amount input is capped and sits on row 1 with check / more — does not starve the name column.
- [x] AC-3: No duplicate account chip inside each row on mobile (account stays on CB BILLS section header).
- [x] AC-4: Shared/Solo + Allocate/linked period chips sit on a clean second row without overlapping.
- [x] AC-5: Desktop multi-column Payables layout unchanged (pay-to + alloc columns still visible).

## Files touched

- `index.html` — `pRenderRow` meta spans + mobile alloc nest
- `design-system/components.css` — compact 2-row named grid
- `design-system/app.css` — shell `!important` compact override aligned
- `design-system/payables.css` — hide pay-to + amount cap under `#tab-payables`

## UX notes

```
[✓] Limey careers market                    ⋯
    27 June 2026 · total $140.00
    [70.00]
    [Shared] [Aug · P1]
```

Name gets a full-width row on compact; amount + chips stack below so long titles never clip to "Lim"/"depo".

## Regression risks

- Desktop still needs `.payable-alloc-cell` visible and `.payable-alloc-mobile` hidden
- Two alloc button nodes in DOM (only one visible per breakpoint) — both call same handler
- Number input min-width on iOS Safari

## Status

Rose agent unavailable in this environment — verified with mobile-width fixture + computerUse (all AC checks pass). Draft PR #3.
