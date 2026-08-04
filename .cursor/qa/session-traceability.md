# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

1. Fix Payables mobile/compact row layout so open payables are usable.
2. Audit Home landing period wiring (trends + insights vs period chevrons).

## Work type

[x] Personal app — hostess / finance-hub

## QA tier

**Tier:** 2 — Payables mobile layout + Home period data binding

## User intent (verbatim)

"right. okay let's fix payables. I'll switch you to cloud so I can sleep. Look at mobile, it's actually not usable."

Follow-up: "can you also check the trends chart and everything else on the landing page if they are changing according to the selected period at the top?"

## Acceptance criteria

### Payables
- [x] AC-1: Compact payable row shows full expense name (not truncated to 3 letters).
- [x] AC-2: Amount input is capped and sits on row 1 with check / more — does not starve the name column.
- [x] AC-3: No duplicate account chip inside each row on mobile (account stays on CB BILLS section header).
- [x] AC-4: Shared/Solo + Allocate/linked period chips sit on a clean second row without overlapping.
- [x] AC-5: Desktop multi-column Payables layout unchanged (pay-to + alloc columns still visible).

### Home period
- [x] AC-6: Elly “Just me” heroes + Housing & bills follow selected fortnight (`homePeriodMetrics`).
- [x] AC-7: Category pie + recurring lists follow selected fortnight (via `homeInsightPeriods`).
- [x] AC-8: Trends uses month abbrev axis labels (not P1…P7) and highlights active month.
- [x] AC-9: Household / Eric insights remain month-wide; Payables card remains all-time open totals (by design).

## Files touched

- `index.html` — Payables `pRenderRow`; Home `homeInsightPeriods` / sparkline / pie / `renderHome`
- `design-system/components.css` — compact payables grid; chart active + `panel-card-meta`
- `design-system/app.css` — shell compact override (earlier)
- `design-system/payables.css` — hide pay-to + amount cap (earlier)

## Home period behaviour (verified in logic smoke)

| Surface | Elly me | Household / Eric |
|---|---|---|
| Heroes | Selected fortnight | Full month |
| Housing & bills | Selected fortnight | Full month |
| Categories / recurring | Selected fortnight | Full month |
| Trends | Last ~7 months; highlight selected month | Same (household merges) |
| Payables card | All-time open | All-time open |

Flipping fortnights inside the same month changes heroes/pie/recurring; Trends series values stay the same (month aggregates) while the active tick remains that month.

## Status

- Payables: computerUse mobile check passed earlier.
- Home period: Node smoke for category period switch passed; live UI blocked by Google auth in this environment.
- Draft PR #3 — https://github.com/moxiestrife/finance-hub/pull/3
