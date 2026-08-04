# finance-hub (Pensive)

## Cursor Cloud specific instructions

### What this is
A single self-contained static web app — `index.html` (~7.7k lines of vanilla JS/HTML) plus the modular CSS in `design-system/*.css`. There is **no build step and no `dev` script** (the root `package.json` `test` script is a placeholder that exits 1). "Running in dev" just means serving the repo root as static files. `functions/` holds an optional Firebase Cloud Functions backend (AI chat). See `SETUP.md` for the original setup narrative (note: `SETUP.md` is partly stale — it describes an old PIN login, but the shipped app uses Google Sign-In).

### Running the app (dev)
Serve the repo root over HTTP and open `index.html`, e.g. `python3 -m http.server 8000` then open `http://localhost:8000/index.html`.
- Use `http://localhost` — **not** `127.0.0.1`. Google Sign-In treats `127.0.0.1` as an unauthorised domain and the app shows an explicit error telling you to switch to `localhost`.

### Auth gate + live production data (important)
The entire UI is gated behind Google Sign-In restricted to two hard-coded accounts (`AUTHORISED_USERS` in `index.html`), and the Realtime Database rules in `database.rules.json` enforce the same two emails. Consequences for agents:
- You **cannot reach the budgeting/payables UI without one of those two real Google accounts**. Serving the app only gets you to the login screen.
- Firebase config in `index.html` points at the **live production project** (`finance-hub-27fb1`). Budget/payables reads and writes hit production RTDB. Do not sign in and mutate data casually. (Running on `localhost` only disables *chat* cloud sync, not budget/payables sync.)
- A safe, no-auth way to demo the product UI is the redesign mockup at `ui-facelift-mockup.html` (fully client-side, interactive, no Firebase).

### Cloud Functions (`functions/`) — optional
Node 22, deps `firebase-admin` / `firebase-functions` / `@anthropic-ai/sdk`. `npm install` inside `functions/` (done by the update script). The two callables (`chatFinances`, `executeProposedAction`) only power the AI chat widget; the rest of the app works without them. To actually run them you need `ANTHROPIC_API_KEY` set as a Functions secret, the Firebase **Blaze** plan, and `firebase deploy --only functions` — there is **no emulator configured** in `firebase.json`. Quick load check: `cd functions && ANTHROPIC_API_KEY=dummy node -e "require('./index.js')"`.

### Lint / test / build
None are configured. There is no linter, no build, and no real test script. The one QA script, `qa-facelift-check.mjs`, uses Playwright against `http://127.0.0.1:8765/ui-facelift-mockup.html` but is **currently stale** — it references markup the redesigned mockup no longer has (`.stack`, `.cat-card`, `[data-theme-toggle]`) and times out. That is a pre-existing script/markup mismatch, not an environment problem. To run it you must first install Playwright + Chromium (`npm install playwright && npx playwright install chromium`), which are not tracked in any `package.json`.
