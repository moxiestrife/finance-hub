# Pensive design system

Reusable tokens and UI components for the Finance Hub / Pensive facelift.

## Files

| File | Role |
|------|------|
| [`tokens.css`](tokens.css) | Structural scale + palette CSS variables (`data-palette` / `data-theme`) |
| [`components.css`](components.css) | App chrome + reusable patterns (cards, heroes, lists, tabs, period cards) |

## Usage

```html
<html lang="en" data-theme="light" data-palette="dusk">
<head>
  <link href="design-system/tokens.css" rel="stylesheet">
  <link href="design-system/components.css" rel="stylesheet">
</head>
```

Default palette in the mockup is **dusk**. Switch with `data-palette`: `ocean` | `graphite` | `slate` | `dusk`. Theme: `light` | `dark`.

## Token groups

- **Colour** — `--primary`, `--surface*`, `--on-surface*`, `--hero-safe|in|out`, …
- **Spacing** — `--space-1` … `--space-7`
- **Radius** — `--radius-sm|md|lg|card|pill|nav`
- **Type** — `--font-family`, `--text-*`, `--weight-*`, `--tracking-*`
- **Layout** — `--page-pad-x-phone|desktop`, `--page-gap*`, `--z-*`

## Component recipes for new pages

1. **Page shell** — `.app-bar` + `.page-body` (desktop padding via `.desktop-main .page-body`)
2. **Metrics** — `.hero` / `.hero-carousel` (phone) or `.hero-fan` + `.hero-metric` (desktop)
3. **Cards** — `.card` + `.panel-card-head` / `.panel-card-title`
4. **Progress rows** — `.cat-card` + `.cat-bar-track` / `.cat-bar-fill`
5. **Lists** — `.bills-card` + `.bill-row` (+ `.has-check` / `.is-paid` when needed)
6. **Filters** — `.chip-tabs` + `.chip-tab[aria-pressed]`
7. **Two-up grids** — `.fortnight-row`, `.recurring-row`, `.periods-row`, `.insights-split`
8. **Month chrome** — `.month-nav` in the app-bar slot (Monthly)

Live composition: [`../ui-facelift-mockup.html`](../ui-facelift-mockup.html).
