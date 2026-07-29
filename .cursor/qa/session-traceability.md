# QA Session Traceability

> Living document — update during implementation, not only at the end.

## Task summary

Code-review remediation on the AI Chat branch: correct web-search detection, stop failed API calls consuming the daily quota, make both chat-initiated writes atomic, refuse to fabricate months, and normalise receipt photos to JPEG in the browser. Chat CSS moved onto shared tokens and the chat pane now sizes off a measured sticky-header height.

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
- [x] AC-3: Payables entries are added with a transaction; a non-committed transaction throws `aborted` with a friendly message.
- [x] AC-4: A bill/savings goal targeting a month that does not exist throws `failed-precondition` naming the month in human form ("September 2026 …"); no month is ever created by the function.
- [x] AC-5: The month line-item write is a transaction on the bill/savings list; `buildDefaultMonth` and `defaultDates` are gone from `functions/index.js`.
- [x] AC-6: Any selected photo is re-encoded to JPEG ≤1600px longest edge with EXIF rotation applied; an undecodable format gets a specific "convert to JPEG" toast, and encoding steps down until the base64 fits the 5,000,000 cap.
- [x] AC-7: The chat CSS block references `:root` tokens only; new tokens live in that same block.
- [x] AC-8: `.chat-wrap` sizes off `100dvh`, `--sticky-header-height` (measured by `ResizeObserver`) and `--main-padding-y`; no hardcoded header offset remains.
- [x] AC-9 (found during verification): `functions/index.js` runs against the pinned `firebase-admin` 14, which no longer has `admin.database()`.
- [x] AC-10 (found during verification): the chat input row stays inside the viewport at 1280/820/390/320px wide, with and without a sticky banner showing.

## Functional requirements

- Rate-limit counter is still claimed *before* the API call (race-bypass protection) and only refunded on failure.
- `executeProposedAction` remains the only writer; `chatFinances` stays read-only; the confirm-before-write flow is unchanged.
- Period padding and the existing `validateLineItemParams` clamping (Eric max period 0, Elly max period 1) are unchanged.
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
**What must be credible:** No path can create a month behind the user's back; concurrent payable edits cannot lose an entry.

## Files and areas touched

- `functions/index.js` — modular `firebase-admin` imports, `chatFinances` (search detection, rate-limit refund, logger), `executeProposedAction` (both write branches), new `monthLabel` / `monthMissingMessage` / `countPeriods`, removed `buildDefaultMonth` / `defaultDates`
- `index.html` — `:root` tokens, `.main` padding, `/* Chat tab */` block, `trackStickyHeaderHeight`, `init`, `onChatImageSelected` and new `decodeImageFile` / `decodeImageFileViaElement` / `encodeChatImageToJpeg` / `drawImageToJpegDataUrl`
- `SETUP.md` — Step 2f note on browser-side JPEG conversion
- `.gitignore` (new), `functions/package-lock.json` (new)
- `.cursor/qa/session-traceability.md` — this file

## Regression risks

- New `:root` tokens are additive, but `--main-padding-y` now feeds `.main`; a wrong value shifts every tab, not just chat.
- `--sticky-header-height` is only set once `init()` runs; before that the `96px` fallback applies. It sums the two sticky banners plus `.sticky-header`, so anything new pinned to the top of `#app` must be added to `STICKY_TOP_SELECTOR`.
- An RTDB transaction's update function is always handed the local cache first, which is `null`, and returning `undefined` there aborts before the server is ever consulted — so nothing may abort on null. Existence is decided by the preceding `get()` instead. Residual: if the month is deleted in the milliseconds between that read and the append, the append recreates a bare period rather than failing.
- `onChatImageSelected` is now async — the file input is cleared before the first await so the same file can be re-picked.
- Canvas re-encoding drops EXIF and flattens transparency onto white; fine for receipts, lossy for anything else.
- Removing `buildDefaultMonth` means a previously "working" flow (adding a bill to a future month) now errors by design.
- Period padding is a separate write from the append, so a month can briefly gain an empty period even if the append then fails.

## Deferred / out of scope

- Sweeping token refactor of the pre-existing CSS outside the chat block.
- A shared hidden/utility class: the file's convention is inline `style="display:none"` toggled by JS, so `#chatImagePreview` keeps it.
- Client-side HEIC decoding (a wasm decoder) for desktop browsers.
- `--radius` is unused in the chat block — none of its radii are 12px.

## Follow-up

- Confirm the search badge against a live deploy: the `usage.server_tool_use.web_search_requests` shape was exercised against a stubbed response, not a real one from Claude.
- Nothing in this repo pins the client's `CHAT_IMAGE_MAX_BASE64_LEN` to the server's `MAX_IMAGE_BASE64_LEN`; they are matched by comment only.

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
| Senior Reviewer | n/a | | Tier 2 |
| Judge | | | |
