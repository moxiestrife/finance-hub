# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Mobile/compact fortnightly Monthly chrome: period date on top, paid progress scoped to focused fortnight, month switcher underneath. Eric / single-period / desktop multi-column keep month-first + month totals.

## Work type

[x] Personal app — hostess / finance-hub

## QA tier

**Tier:** 2 — Monthly navigation / progress scoping

## User intent (verbatim)

"for mobile, monthly, you seem to have 2 date items there. Is it possible to swap the August 2026 with the 12 August one, and add the 0/15 under but only scoped to that period? this is just for mobile views only or when the monthly views are forced to just the one 1 table view. Eric's view is easy still per month and the 0/xx for him is just for the month. This use case is specifically for someone who is on fortnightly."

## Acceptance criteria

- [x] AC-1: Compact + multi-period (Elly fortnightly): order = period date → 0/xx paid → month
- [x] AC-2: 0/xx counts bills in the focused period only (not whole month)
- [x] AC-3: Eric / single-period / desktop: month first; 0/xx is month total; period chevrons hidden on desktop
- [x] AC-4: Flipping period chevrons updates focused card + period-scoped progress

## Files touched

- `index.html` — `monthlyUsesPeriodPrimaryNav`, `syncMonthlyPeriodChrome`, render hook, resize sync
- `design-system/home.css` — `.is-period-primary` flex order + month divider

## Regression risks

- Resize desktop↔compact without full render (chrome sync on resize)
- Eric impersonation / period-count edge cases
- Progress bar after mark paid / render

## Status

Rose: **PASS WITH NOTES** ([Rose](15b0c9ca-8985-44a9-9b34-a2b385bfef66)). Follow-up: DOM reorder in `syncMonthlyPeriodChrome` so focus order matches period → progress → month.
