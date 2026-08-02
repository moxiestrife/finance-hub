# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Pensive UI facelift mockup: extract a reusable design system (`design-system/tokens.css` + `components.css`), keep latest Home insights polish, and compose Monthly + Payables pages in `ui-facelift-mockup.html`. Production `index.html` untouched.

## Work type

[ ] NAB platform — Intelligence Hub / Context Library / Lifecycle / Brain  
[ ] NAB product — ADG / VoC / Generation pilot  
[ ] Portfolio case study (KB-derived)  
[x] Personal app — hostess / finance-hub  
[ ] Cursor meta — agents / skills / rules  
[ ] Other: ___

## QA tier

**Tier:** 2 — new mockup pages + multi-file design-system extract

## User intent (verbatim)

"just make sure it’s updated with the changes we last did on the mockup. Include also creating the new design system and tokens so those can be easily reused for new pages in the future."

## Acceptance criteria

- [x] AC-1: Latest Home polish preserved (fortnight hints, bills vs expenses split, charts above recurring lists, “this fortnight” hero chips).
- [x] AC-2: `design-system/tokens.css` exposes palette + structural tokens (spacing, radius, type, layout).
- [x] AC-3: `design-system/components.css` holds reusable app UI; mockup chrome stays in `ui-facelift-mockup.html`.
- [x] AC-4: Monthly page — month nav in app bar, paid status strip, two period cards with section bars + checkable bill rows (desktop 2-col / phone stack).
- [x] AC-5: Payables page — owing hero (desktop fan / phone single), Mine/Eric + All/Shared/Solo chips, open list + completed disclosure.
- [x] AC-6: Scope switch visible on Home only; month nav visible on Monthly only.
- [x] AC-7: Production `index.html` unchanged.
- [x] AC-8: Monthly capability surface — Money In/Out, groups, savings, select/ctx/calc/drag demos.

## Known limitations

- Chat page remains a stub.
- Mock data only — no Firebase binding.
- Eric “this month” copy not wired (no Eric persona shell in mockup yet).
- Rose QA MCP not available in this cloud environment (only `cursor-cloud` server); visual check via headless screenshots instead.

## Files touched

- `design-system/tokens.css` (new)
- `design-system/components.css` (new)
- `design-system/README.md` (new)
- `ui-facelift-mockup.html`
- `.cursor/qa/session-traceability.md`

## Verification

- JS syntax check via `new Function` on mockup script — pass.
- Headless Chrome screenshots: Home / Monthly / Payables at `/opt/cursor/artifacts/screenshots/pensive-*.png`.
- CSS assets return HTTP 200 from local static server.
