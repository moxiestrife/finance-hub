# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Code-review remediation on the AI Chat branch: correct web-search detection, stop failed API calls consuming the daily quota, make both chat-initiated writes atomic, refuse to fabricate months, and normalise receipt photos to JPEG in the browser. Chat CSS moved onto shared tokens and the chat pane now sizes off a measured sticky-header height.

**Second pass (after Rose run 2 returned FAIL):** stop creating pay periods, preserve object-shaped lists on write, move all server date arithmetic onto the household's Sydney clock, and close a set of smaller gaps Rose surfaced (quota refunds on database failure, verified-email requirement, truncated-response handling, payables context growth, pay period shown on the confirm card).

## Work type

[ ] NAB platform — Intelligence Hub / Context Library / Lifecycle / Brain  
[ ] NAB product — ADG / VoC / Generation pilot  
[ ] Portfolio case study (KB-derived)  
[x] Personal app — hostess / finance-hub  
[ ] Cursor meta — agents / skills / rules  
[ ] Other: ___

## QA tier

**Tier:** 2 — new feature (AI Chat), multi-file change spanning UI and Cloud Functions API

## User intent (verbatim)

"Finishing a code-review remediation pass … `chatFinances` — read-only … `executeProposedAction` — the ONLY code that writes to the database." Items raised: `usedSearch` "can silently never fire and the '🔎 searched the web' badge would never appear"; "failed API calls burn the daily quota"; payables "can drop an entry"; "do not fabricate months … permanently wrong numbers in a finance app, with no error shown"; "iPhones shoot HEIC … Photographing a receipt is the headline feature of this tab, so this must work"; "`.chat-wrap { height: calc(100vh - 140px) }` is exactly what the layout rule prohibits."

## Acceptance criteria

- [x] AC-1: `usedSearch` is driven by `response.usage.server_tool_use.web_search_requests`, with the top-level content scan kept only as a fallback, so nested (code-execution) search still sets the badge.
- [x] AC-2: A failed `anthropic.messages.create` refunds the pre-claimed rate-limit count, logs the real error server-side, and surfaces a generic `internal` error with no upstream text.
- [x] AC-3: Payables entries are added with a transaction rather than a read-modify-write, so the *function's own* append cannot drop an entry; a non-committed transaction throws `aborted` with a friendly message. This does **not** make concurrent loss impossible — see the Known limitations section.
- [x] AC-4: A bill/savings goal targeting a month that does not exist throws `failed-precondition` naming the month in human form ("September 2026 …"); no month is ever created by the function.
- [x] AC-5: The month line-item write is a transaction scoped to the bill/savings list rather than a whole-month rewrite, so it cannot clobber a concurrent edit elsewhere in the month; `buildDefaultMonth` and `defaultDates` are gone from `functions/index.js`. Same caveat as AC-3 about whole-tree writes from the browser.
- [x] AC-6: Any selected photo is re-encoded to JPEG ≤1600px longest edge with EXIF rotation applied; an undecodable format gets a specific "convert to JPEG" toast, and encoding steps down until the base64 fits the 5,000,000 cap.
- [x] AC-7: Every *colour* in the chat CSS block references a `:root` token — no raw hex or palette values remain. Radii, spacing and the one `rgba()` shadow are still literals, matching the rest of the stylesheet; tokenising those is deferred.
- [x] AC-8: `.chat-wrap` sizes off `100dvh`, `--sticky-header-height` (measured by `ResizeObserver`) and `--main-padding-y`; no hardcoded header offset remains.
- [x] AC-9 (found during verification): `functions/index.js` runs against the pinned `firebase-admin` 14, which no longer has `admin.database()`.
- [x] AC-10 (found during verification): the chat input row stays inside the viewport at 1280/820/390/320px wide, with and without a sticky banner showing.

### Second pass — from Rose run 2

- [x] AC-11 (H2): the function never creates a pay period either. Firebase stores an empty array as nothing, so a padded period arrived with no `bills` key and the ~17 unguarded `period.bills` reads in the Monthly, Summary, Insights and Compare views would throw — a blank tab that reads as "the chat ate my month". A missing period now throws `failed-precondition` naming which period to add.
- [x] AC-12 (H1): both write transactions preserve an object-shaped list via `toList` instead of coercing it to `[]`. Firebase returns an object once a numeric-keyed list is sparse; the old code would have atomically replaced the entire list with a single entry and still reported `ok: true`.
- [x] AC-13 (M2): every server-derived date runs through `householdCalendar`, which resolves the Sydney date. Cloud Functions run on UTC, so `currentMonthKey` pointed at the previous month for the first 10–11 hours of each local month, payables logged in the evening got yesterday's label, and the daily cap reset mid-morning.
- [x] AC-14 (M1, L1–L3): the quota is refunded on any failure between claiming it and returning — database reads included — and when the cap is hit, so the counter no longer climbs unbounded. A rate-limit transaction that doesn't commit now fails closed, and a failing refund logs instead of replacing the caller's error.
- [x] AC-15 (M5, L6): `requireAuthorisedUser` requires `email_verified === true` and does an own-property lookup on the allowlist.
- [x] AC-16 (M6): `stop_reason === 'max_tokens'` returns the partial text and withholds any proposal, since a truncated turn can end mid `tool_use` with half-written params.
- [x] AC-17 (M7): only the `MAX_PAYABLES_IN_CONTEXT` most recent payables go into the prompt, with a count of what was omitted. The whole tree was being sent on every message and grows forever.
- [x] AC-18 (M3): the confirm card names the pay period it will write to, applying the same clamp as the server, and shows the month as "August 2026" rather than `2026-08`.

## Functional requirements

- Rate-limit counter is still claimed *before* the API call (race-bypass protection) and only refunded on failure.
- `executeProposedAction` remains the only writer; `chatFinances` stays read-only; the confirm-before-write flow is unchanged.
- The existing `validateLineItemParams` clamping (Eric max period 0, Elly max period 1) is unchanged. Period *padding* was removed in the second pass — the function now refuses instead.
- `pendingChatImage` keeps its `{ mediaType, data }` shape with base64 and no `data:` prefix; `mediaType` is now always `image/jpeg`.
- `CHAT_IMAGE_MAX_BASE64_LEN` in `index.html` mirrors `MAX_IMAGE_BASE64_LEN` in `functions/index.js` — change both together.

## Experience / UX expectations

- Ask a question needing current rates → "🔎 searched the web" badge appears again.
- Chat errors out (offline, upstream failure) → the user keeps that message in their 30/day.
- Ask to add a bill to a month that hasn't been created → the assistant says to create it in the Monthly tab first, instead of silently poisoning the carry-over.
- Attach an iPhone photo from the phone picker → preview shows the rotated-correctly, downscaled JPEG that is actually sent. A HEIC on desktop Chrome → clear "convert it to JPEG" toast.
- Chat pane fills the viewport on desktop and mobile, including when the tab bar wraps to two rows and when mobile browser chrome hides/shows.

## Architecture / governance notes

Single-file app (`index.html`) plus `functions/index.js`. No auth, rules, or schema change: `AUTHORISED_USERS`, the auth model and `database.rules.json` were left untouched. Function dependencies are pinned and `functions/package-lock.json` is now committed so a deploy installs the reviewed versions.

## Human review context

**Upcoming human review?** [x] Engineer/architect [ ] Governance [ ] Executive [ ] None  
**Date / audience:** Reviewer who landed `ab29122` on this branch  
**What must be credible:** No path can create a month or a pay period behind the user's back, and nothing the chat writes can silently destroy existing records. Concurrent loss is *reduced*, not eliminated — see Known limitations, and don't let the summary claim otherwise.

## Files and areas touched

- `functions/index.js` — modular `firebase-admin` imports, `requireAuthorisedUser` (verified email, own-property lookup), `chatFinances` (search detection, Sydney calendar, quota claim/refund around the whole body, truncation handling, trimmed payables context), `executeProposedAction` (both write branches, missing-period refusal), new `householdCalendar` / `monthLabel` / `monthMissingMessage` / `periodMissingMessage` / `hasPeriod` / `toList` / `refundMessage` / `recentPayables`, removed `buildDefaultMonth` / `defaultDates` / `formatDateLabel` / `monthKey` / `nextMonthKeyFrom` / `countPeriods`
- `index.html` — `:root` tokens, `.main` padding, `/* Chat tab */` block, `trackStickyHeaderHeight`, `init`, `onChatImageSelected` and new `decodeImageFile` / `decodeImageFileViaElement` / `encodeChatImageToJpeg` / `drawImageToJpegDataUrl`, `describeProposedAction` plus new `proposedMonthLabel` / `proposedPeriodLabel`
- `SETUP.md` — Step 2f note on browser-side JPEG conversion
- `.gitignore` (new), `functions/package-lock.json` (new)
- `.cursor/qa/session-traceability.md` — this file

## Regression risks

- New `:root` tokens are additive, but `--main-padding-y` now feeds `.main`; a wrong value shifts every tab, not just chat.
- `--sticky-header-height` is only set once `init()` runs; before that the `96px` fallback applies. It sums the two sticky banners plus `.sticky-header`, so anything new pinned to the top of `#app` must be added to `STICKY_TOP_SELECTOR`.
- An RTDB transaction's update function is always handed the local cache first, which is `null`, and returning `undefined` there aborts before the server is ever consulted — so nothing may abort on null. Existence is decided by the preceding `get()` instead. Residual: if the month is deleted in the milliseconds between that read and the append, the append recreates a bare period rather than failing.
- `onChatImageSelected` is now async — the file input is cleared before the first await so the same file can be re-picked.
- Canvas re-encoding drops EXIF and flattens transparency onto white; fine for receipts, lossy for anything else.
- Removing `buildDefaultMonth` means a previously "working" flow (adding a bill to a future month) now errors by design. Removing period padding extends that to a missing pay period.
- `householdCalendar` hardcodes `Australia/Sydney`. It relies on Node 22's full ICU data being present in the Cloud Functions runtime; if the household ever moves, this is the single place to change.
- The quota is now claimed before a `try` that wraps the whole body, so any new early return added inside that block must still leave the refund path correct.
- `toList` silently repairs an object-shaped list into an array on write. That is the same normalisation the client already does on read, but it does mean a malformed list is rewritten rather than rejected.

## Known limitations (accepted, not fixed)

- **Concurrent loss is reduced, not eliminated.** The function's writes are atomic, but the browser is still the dominant writer and `pushPayablesToFirebase` / `pushBudgetToFirebase` `set()` the entire subtree from in-memory state. So: listener delivers a snapshot → user edits a row → the server transaction commits a chat entry → the user's save writes their whole stale list and drops it, with no error anywhere. Fixing this properly means moving the app's own writes to targeted `update()` calls, which is a refactor of pre-existing behaviour well outside this feature. This branch is strictly better than before and introduces no regression here.
- **`split: 'mine'` is Elly-relative and accepted from either user.** The server validates the enum without reference to who is asking, while the app's own form never offers `mine` to Eric. If Claude picks `mine` for one of Eric's solo expenses it becomes Elly's debt, and Eric can't see it. The confirm card labelling it "Elly's solo" is the only guard.
- **Chat ignores impersonation.** While the "Viewing as Eric" banner is up, the function still derives the budget path from Elly's verified email, so the chat answers as Elly and writes to Elly's budget. The server behaviour is the safe one; the card just doesn't say so.

## Deferred / out of scope

- Sweeping token refactor of the pre-existing CSS outside the chat block.
- A shared hidden/utility class: the file's convention is inline `style="display:none"` toggled by JS, so `#chatImagePreview` keeps it.
- Client-side HEIC decoding (a wasm decoder) for desktop browsers.
- `--radius` is unused in the chat block — none of its radii are 12px.

## Follow-up

- Confirm the search badge against a live deploy: the `usage.server_tool_use.web_search_requests` shape was exercised against a stubbed response, not a real one from Claude.
- Nothing in this repo pins the client's `CHAT_IMAGE_MAX_BASE64_LEN` to the server's `MAX_IMAGE_BASE64_LEN`; they are matched by comment only.
- **Treat the first deploy as a test session, not a release.** Nothing has run against the real Anthropic API, and the request body is the risk: Anthropic rejects unknown parameters, so one misplaced field means every message fails with the same friendly "couldn't reach the assistant" — every integration failure looks identical from the chat. First run should be a rate-sensitive question (confirms the search badge), then one bill confirmed into a month that already exists.
- Confirm in the Firebase console whether email/password sign-up is enabled. `email_verified` is now required in the function, but `database.rules.json` still authorises on email alone, and the rules grant both accounts write access to the whole tree.

## Test evidence

- `npm install` in `functions/` — clean, no peer conflicts: `@anthropic-ai/sdk@0.115.0`, `firebase-admin@14.2.0`, `firebase-functions@7.3.2`. Lockfile committed.
- `node --check functions/index.js`, plus both inline `<script>` blocks extracted from `index.html` and checked.
- `executeProposedAction` driven through `.run()` against the Realtime Database emulator — 20 checks: append order, concurrent writes (8 payables, 6 line items) all surviving, missing-month refusal with no month created, period padding, Eric's period clamp and budget isolation, validation and auth rejections.
- `chatFinances` driven against a local stub of the Anthropic API — 15 checks: search badge from the usage counter alone, from the legacy top-level block, and correctly absent; proposals returned without any write; upstream failure returning `internal` with the quota refunded and the real error logged server-side; daily cap; message and image validation.
- Image pipeline exercised in headless Chrome against the real code extracted from `index.html`: 3000×2000 JPEG → 1600×1067 JPEG under cap, PNG → JPEG, undecodable file → the convert-to-JPEG toast, oversized file guard, cap step-down picking the first fitting step, and the give-up path leaving no preview.
- Layout probed in headless Chrome at 1280/820/390/320px wide, with and without the sticky banner: the measured property tracks the header (104 → 131 → 167px) and the input row stays inside the viewport in every case.

## Not verified here

No Firebase project credentials and no Anthropic API key in this environment, and nothing was deployed. Untested for real: the live Claude response shape, Cloud Functions cold start against the pinned deps, and iOS Safari's `createImageBitmap` / HEIC decode path (only Chrome was available).

## Agent QA status

| Agent | Run | Verdict | Notes |
|-------|-----|---------|-------|
| Rose | 1 | PASS WITH NOTES | Emulator + stub-API + headless-browser checks all pass. Two extra defects found and fixed during verification: `admin.database()` gone in firebase-admin 14, and the sticky banner pushing the chat input off-screen |
| Rose | 2 | FAIL | Static review only — no shell in that environment, so run 1's execution evidence is unreproduced. 3 High: object-shaped lists silently discarded on write (H1), padded periods missing their `bills` key and breaking three tabs (H2), atomicity claim overstated (H3). Plus 9 Medium, incl. UTC vs Sydney dates and no `email_verified` check |
| Rose | 3 | pending | H1, H2, M1–M3, M5–M7 fixed; H3 and M4/M8 restated as known limitations |
| Senior Reviewer | n/a | | Tier 2 |
| Judge | | | |
