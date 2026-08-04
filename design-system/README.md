# Tabula Rasa

Design system for **Pensive** (Finance Hub). Built for consistency before App Store release: one type scale, one icon scale, palette sub-themes, reusable chrome/content recipes.

## Files

| File | Role |
|------|------|
| [`tokens.css`](tokens.css) | Tabula Rasa tokens — spacing, type, icons, layout, colour |
| [`foundation.css`](foundation.css) | Type role utilities (`.tr-text-*`) + icon utilities (`.tr-icon*`) |
| [`components.css`](components.css) | Reusable UI patterns (cards, heroes, charts, lists, nav, modals) |
| [`home.css`](home.css) | Home tab (`#tab-home`) |
| [`monthly.css`](monthly.css) | Monthly tab (`#tab-monthly`) |
| [`payables.css`](payables.css) | Payables tab (`#tab-payables`) |
| [`app.css`](app.css) | Production shell (side rail / bottom nav / app-bar slots) |

## Usage

```html
<html lang="en" data-theme="light" data-palette="azulejo">
<head>
  <link href="design-system/tokens.css" rel="stylesheet">
  <link href="design-system/foundation.css" rel="stylesheet">
  <link href="design-system/components.css" rel="stylesheet">
</head>
```

**Default palette:** `azulejo`.  
**Palettes:** `azulejo` · `ocean` · `graphite` · `slate` · `dusk`  
**Themes:** `light` · `dark`

## Sub-theming

| Layer | How it switches | Today | Later |
|-------|-----------------|-------|-------|
| Colour | `data-palette` × `data-theme` | Full token sets | — |
| Type family | `--font-family` on palette | Shared Google Sans | Per-palette fonts |
| Icons | `--icon-font-family` + variation axes | Material Symbols Outlined | Per-palette icon sets |

Do **not** hardcode hex, rem, or icon px in features. Change the token once.

---

## Type scale

### Primitives

| Token | Value | ≈ @16px |
|-------|-------|---------|
| `--text-2xs` | `0.65rem` | 10.4 |
| `--text-xs` | `0.68rem` | 10.9 |
| `--text-sm` | `0.72rem` | 11.5 |
| `--text-md` | `0.78rem` | 12.5 |
| `--text-base` | `0.88rem` | 14.1 |
| `--text-lg` | `0.92rem` | 14.7 |
| `--text-xl` | `1.05rem` | 16.8 |
| `--text-2xl` | `1.15rem` | 18.4 |
| `--text-hero` | `clamp(2.15rem, 9vw, 2.55rem)` | display |

### Semantic roles (prefer these)

| Token | Maps to | Use for |
|-------|---------|---------|
| `--text-caption` | `--text-2xs` | Overlines, micro meta |
| `--text-axis` | `--text-xs` | **Chart X & Y labels** |
| `--text-label` | `--text-sm` | Chips, secondary labels |
| `--text-ui` | `--text-md` | Panel titles, tabs, tips |
| `--text-body` | `--text-base` | Primary reading text |
| `--text-emphasis` | `--text-lg` | Strong body / amounts |
| `--text-title` | `--text-xl` | Section titles |
| `--text-display` | `--text-hero` | Hero metrics |

Weights: `--weight-medium|semibold|bold`  
Tracking: `--tracking-label`, `--tracking-hero-label`  
Leading: `--leading-tight|snug|normal`

### Utilities (`foundation.css`)

```html
<span class="tr-text-axis">$8,000</span>
<span class="tr-text-caption">AMOUNT ($)</span>
<p class="tr-text-body">…</p>
```

---

## Icon scale

| Token | Size | Typical use |
|-------|------|-------------|
| `--icon-xs` | 14px | Checks, dense rows |
| `--icon-sm` | 16px | Chips, inline actions |
| `--icon-md` | 20px | App bar, menus |
| `--icon-lg` | 22px | Default buttons / nav (`--icon-size`) |
| `--icon-xl` | 24px | Period chevrons |
| `--icon-2xl` | 36px | Empty states |

Variation axes: `--icon-fill`, `--icon-wght`, `--icon-grad`, `--icon-opsz`.

### Utilities

```html
<span class="material-symbols-outlined tr-icon--md" aria-hidden="true">settings</span>
<span class="tr-icon tr-icon--sm tr-icon--filled" aria-hidden="true">check</span>
```

Legacy class `.material-symbols-outlined` is wired to the same tokens.

---

## Component recipes

### Chrome
1. **Page shell** — `.app-bar` + `.page-body`
2. **Phone bottom nav** — `.bottom-nav` + `.nav-item`
3. **Desktop rail** — `.desktop-shell` + `.side-rail` + `.rail-item`
4. **Impersonation** — `.impersonation-banner` + `body.is-impersonating`

### Content
5. **Metrics** — `.hero` / `.hero-carousel` / `.hero-fan` + `.hero-metric`
6. **Cards** — `.card` + `.panel-card-head` / `.panel-card-title`
7. **Progress rows** — `.cat-card` + `.cat-bar-track` / `.cat-bar-fill`
8. **Lists** — `.bills-card` + `.bill-row`
9. **Filters** — `.chip-tabs` + `.chip-tab[aria-pressed]`
10. **Two-up grids** — `.fortnight-row`, `.recurring-row`, `.periods-row`, `.insights-split`
11. **Trends chart** — `.chart-wrap` → `.chart-plot` / `.chart-canvas` / `.chart-svg`  
    Axis labels: `.chart-tick` / `--y` / `--x` (HTML only — SVG `<text>` scales with viewBox)
12. **Month chrome** — `.month-nav`
13. **Ledger / Monthly** — `.period-card`, `.ledger-row`, `.action-dock`, `.ctx-menu`
14. **Payables** — `.owing-fan` / `.owing-hero`, `.payable-row`
15. **Settings** — `.settings-stack`, `.palette-option`, `.theme-segment`
16. **Chat** — `.chat-page`, `.chat-msg`, `.chat-composer-card`
17. **Modals** — `.mock-modal-backdrop` + `.mock-modal`
18. **Toast** — `.monthly-toast.is-visible`

### Rule of thumb
Before adding a one-off `font-size` / `width` / hex: search for an existing token or component. If missing, add a token — then use it.

## Live composition

[`../ui-facelift-mockup.html`](../ui-facelift-mockup.html)
