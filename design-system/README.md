# Pensive design system

Reusable tokens and UI components for the Finance Hub / Pensive facelift.

## Files

| File | Role |
|------|------|
| [`tokens.css`](tokens.css) | Structural scale + palette CSS variables (`data-palette` / `data-theme`) |
| [`components.css`](components.css) | App chrome + reusable patterns (cards, heroes, lists, tabs, period cards) |
| [`home.css`](home.css) | Home tab styles scoped under `#tab-home` (Phase 3B; safe alongside prod Monthly CSS) |
| [`monthly.css`](monthly.css) | Monthly tab styles scoped under `#tab-monthly` (Phase 3C; bridges prod ledger markup to facelift tokens) |

## Usage

```html
<html lang="en" data-theme="light" data-palette="graphite">
<head>
  <link href="design-system/tokens.css" rel="stylesheet">
  <link href="design-system/components.css" rel="stylesheet">
</head>
```

Default palette is **graphite**. Switch with `data-palette`: `ocean` | `azulejo` | `graphite` | `slate` | `dusk`. Theme: `light` | `dark`.

`:root` includes Graphite-light colour fallbacks so tokens are safe to link before `data-*` attributes are set. Production can bridge legacy vars (`--brand-col`, `--text-col`, …) to these tokens.

## Token groups

- **Colour** — `--primary`, `--surface*`, `--on-surface*`, `--hero-safe|in|out`, …
- **Spacing** — `--space-1` … `--space-7`
- **Radius** — `--radius-sm|md|lg|card|pill|nav`
- **Type** — `--font-family`, `--text-*`, `--weight-*`, `--tracking-*`
- **Layout** — `--page-pad-x-phone|desktop`, `--page-gap*`, `--safe-top|bottom`, `--bottom-nav-reserve`, `--z-*`
- **Atmosphere** — `--hero-glow` (transparent by default; no spotlight wash)

## Component recipes

### Chrome
1. **Page shell** — `.app-bar` + `.page-body` (desktop padding via `.desktop-main .page-body`)
2. **Phone bottom nav** — `.bottom-nav` + `.nav-item` (uses `--bottom-nav-offset` / safe-area)
3. **Desktop rail** — `.desktop-shell` + `.side-rail` + `.rail-item`
4. **Impersonation** — `.impersonation-banner` + `body.is-impersonating`

### Content
5. **Metrics** — `.hero` / `.hero-carousel` (phone) or `.hero-fan` + `.hero-metric` (desktop)
6. **Cards** — `.card` + `.panel-card-head` / `.panel-card-title`
7. **Progress rows** — `.cat-card` + `.cat-bar-track` / `.cat-bar-fill`
8. **Lists** — `.bills-card` + `.bill-row` (+ `.has-check` / `.is-paid`)
9. **Filters** — `.chip-tabs` + `.chip-tab[aria-pressed]`
10. **Two-up grids** — `.fortnight-row`, `.recurring-row`, `.periods-row`, `.insights-split`
11. **Month chrome** — `.month-nav` in the app-bar slot
12. **Ledger / Monthly** — `.period-card`, `.ledger-row`, `.action-dock`, `.ctx-menu`
13. **Payables** — `.owing-fan` / `.owing-hero`, `.payable-row`, `.payable-account-section`
14. **Settings** — `.settings-stack`, `.settings-card`, `.settings-nav-row`, `.palette-option`, `.theme-segment`
15. **Chat page** — `.chat-page`, `.chat-history-panel`, `.chat-msg`, `.chat-composer-card`, `.chat-action-card`
16. **Modals** — `.mock-modal-backdrop` (+ `.is-fixed`) + `.mock-modal`
17. **Toast** — `.monthly-toast.is-visible`

## Prod readiness notes

- **Phase 2**: safe-area reserves, contrast on muted text, modal/banner z-index tokens, no page haze.
- **Phase 3A**: production may link `tokens.css` only and bridge brand vars; keep `components.css` until chrome migration.
- **Phase 3B**: production links `home.css` for the Home overview; Household scope merges payables immediately and loads the partner budget on demand.
- **Phase 3C**: production links `monthly.css` for period cards / ledger rows under `#tab-monthly`; legacy `.money-in` / `.money-out` map to token hero colours without touching other tabs.
- Live composition / contract: [`../ui-facelift-mockup.html`](../ui-facelift-mockup.html).
