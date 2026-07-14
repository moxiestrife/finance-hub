# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Auto-detect three-fortnight months for Elly; outlier P3 gets fortnight-only bills; next month from a 3-period month copies only P1–P2.

## Work type

[ ] NAB platform — Intelligence Hub / Context Library / Lifecycle / Brain  
[ ] NAB product — ADG / VoC / Generation pilot  
[ ] Portfolio case study (KB-derived)  
[x] Personal app — hostess / finance-hub  
[ ] Cursor meta — agents / skills / rules  
[ ] Other: ___

## QA tier

**Tier:** 2 — new budget-period creation behaviour (feature) in personal finance-hub app

## User intent (verbatim)

Fortnightly budgets for Elly profile. July can have 3 fortnights but view only had 2. Want automatic third period when creating from past month; P3 only gets fortnightly bills from Period 1: Elly Personal Loan, Solar Batteries, Home filtration, Groceries, Latitude. Everything else recurring in P1 is monthly. When copying August from July (3→2), only Period 1 and 2 are copied because Period 3 is an outlier.

## Acceptance criteria

- [x] AC-1: Creating a month from the previous month includes every +14-day pay date that still falls in the target calendar month (2 or 3 periods).
- [x] AC-2: When a 3rd (outlier) period is created, its bills are only the fortnightly set: Elly Personal Loan, Solar Batteries, Home filtration, Groceries, Latitude (sourced from P1, with P2 fallback for missing names e.g. Latitude).
- [x] AC-3: Outlier P3 does not copy monthly recurring P1 bills (Mortgage, Clip Studio, etc.) or full P2 bill sets.
- [x] AC-4: When previous month has 3 periods and next month only has 2 in-month dates, only P1 and P2 templates are copied; P3 is not used as a copy source.
- [x] AC-5: Date chaining still anchors from the chronologically last pay date of the previous month (including after a 3-period month).
- [x] AC-6: Eric monthly single-period path unchanged.

## Functional requirements

- Shared Elly month-build helper used by “create from last recurring” and “next month”.
- `nextDatesFromPrev` walks +14 from last prior pay date and keeps dates in the target month only.
- Regular periods (index 0–1) copy recurring bills/income/savings from prior periods 0–1 only (`slice(0,2)`).
- Outlier periods (index ≥2) get allowlisted fortnightly bills; default savings; no extra income lines.
- Salary still applies per period via existing `getPeriodIncome`.

## Experience / UX expectations

- Creating July from June with a mid-month cadence that lands a 3rd payday → three pay-period cards without manual add.
- Creating August from that July → two cards, bills matching July P1/P2 pattern, dates continue after July’s last payday.
- Toast/copy still makes sense when 2 or 3 periods are created.

## Architecture / governance notes

Single-file app (`index.html`); no auth/schema change. Budget JSON may gain a third period object in some months.

## Human review context

**Upcoming human review?** [ ] Engineer/architect [ ] Governance [ ] Executive [x] None  
**Date / audience:** ___  
**What must be credible:** Correct pay-period count and bill set on demo.

## Files and areas touched

- `index.html` — `nextDatesFromPrev`, Elly month build from previous, `createMonthFromLastRecurring`, `handleNextMonth`
- `.cursor/qa/session-traceability.md` — this file

## Regression risks

- Existing 2-period months already saved are unchanged until recreated.
- Compare / salary × period count may show ×3 in three-payday months (intended).
- Bill name matching must not drop renamed live bills; allowlist is prefix/normalised.
- Eric path must stay one period on the 16th.

## Deferred / out of scope

- Explicit “Add pay period” UI button.
- Changing Latitude’s normal P2 `recurring: false` elsewhere.

## Follow-up

- Auto-backfill: opening a saved Elly month with ≥2 periods appends any missing in-month +14 payday as outlier P3 (so existing July picks up the third period without recreate).

## Test ideas (during work)

- Simulate June ending mid/late → July gets 2 vs 3 dates.
- July with 3 periods → August gets 2; P3 not cloned.
- P3 bill names subset only.
- Eric next-month still single 16th.

## Agent QA status

| Agent | Run | Verdict | Notes |
|-------|-----|---------|-------|
| Rose | 1 | PASS WITH NOTES | AC-1–6 pass. Notes: chronological date anchor (fixed), Insights salary×2 (fixed), existing July recreate deferred |
| Senior Reviewer | n/a | | Tier 2 |
| Judge | | | |
