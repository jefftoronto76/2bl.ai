# Design System

## Design System

- **Admin interface:** Mantine v7 — components in `/components/admin/`
- **Public site:** Tailwind — components in `app/(jefflougheed)/components/` and the shared shells under `components/shells/`
- **Shared design tokens:** `/components/admin/theme/mantine-theme.ts`
- **SBL storefront:** Tailwind — the Second Brain Labs storefront (`2bl.ai`,
  served from `/secondbrainlabs`) has its own isolated token + font set in
  `app/secondbrainlabs/globals.css`. See "Second Brain Labs storefront palette" below.
- **Rule:** No new admin screen is built before the relevant Mantine component
  foundation exists. Design system before screens — always.

### globals.css structure (split by product)

Brand design tokens are **split into per-product, route-scoped CSS files** so
each brand's tokens only load on its own routes. A CSS file imported in a
layout only loads for routes whose component tree includes that layout, which
is what gives the isolation:

| File | Holds | Imported by |
|------|-------|-------------|
| `app/globals.css` | Tailwind directives and the shared base reset only (`box-sizing`, `html`/`body` reset, `scroll-behavior`, font-smoothing) plus one cross-brand keyframe/utility (`.chat-bubble-shake`, used by `components/chat/DeliveryStatus.tsx`). **No brand token blocks, no per-product component CSS.** | `app/layout.tsx` (root — loads on every route) |
| `app/(jefflougheed)/globals.css` | The default `:root` tokens (the jefflougheed.ca + admin/platform palette), the `html[data-brand="jefflougheed"]` dark-mode landing override block (plus its light-section exceptions — `#outcomes`, `#how-it-works`, `#testimonials`, chat surfaces) — **and** all jefflougheed public-site component CSS: the Sage chat overlay, chat-first hero stage (`.stage`/`.hero`/`.composer`), `nav-chat-*`, Calendly overrides, scrollbars, `.highlight-marker`/`.mark-highlight`. (`data-brand="jefflougheed"` is set in `app/layout.tsx` on every route except SBL/Heirloom/Legacy/admin.) | `app/(jefflougheed)/layout.tsx`, **and** `app/admin/layout.tsx` + `app/(platform)/layout.tsx` — admin/platform live outside the `(jefflougheed)` route group but share the inkwell palette, so they import this file explicitly. |
| `app/secondbrainlabs/globals.css` | SBL tokens promoted to `:root` + the `sb-pulse` / `sb-dot` keyframes. | `app/secondbrainlabs/layout.tsx` |
| `app/heirloom/globals.css` | Canonical `--color-*` tokens (`background`, `surface`, `surface-2`, `accent`, `accent-hover`, `text-primary`, `text-muted`, `text-dim`, `border`, `border-hover`) plus `--color-modal-*` tokens, promoted to `:root`; the `--font-*` remaps **stay scoped to `[data-brand="heirloom"]`** (next/font defines `--font-heirloom-*` on that wrapper, not on `:root`, so the remaps must resolve there); the `.bg-*-glow` utilities (kept `[data-brand="heirloom"]`-scoped — `.bg-pattern-dots` is no longer defined in this file). | `app/heirloom/layout.tsx` |

The token table below is the **jefflougheed.ca + admin palette** (the default
`:root` tokens in `app/(jefflougheed)/globals.css`):

| Token | Value |
|-------|-------|
| Background | `#f9f8f5` |
| Accent green | `#2d6a4f` |
| Text primary | `#1a1917` |
| Text muted | `rgba(26,25,23,0.70)` |
| Font display | Playfair Display |
| Font body | DM Sans |
| Font mono | DM Mono |
| Min font size | 16px (labels/mono UI: 11px acceptable) |
| Spacing unit | 4px multiples |

### Second Brain Labs storefront palette

The SBL storefront (`2bl.ai`, served from `/secondbrainlabs`) ships its own
design tokens, **fully isolated** from the jefflougheed/inkwell palette. They
live at `:root` in `app/secondbrainlabs/globals.css` (imported only by the
`/secondbrainlabs` layout, so they load only on SBL routes) and are surfaced as
Tailwind utilities in `tailwind.config.js` (`paper`, `paper-2`, `paper-3`,
`line`, `line-2`, `ink`, `ink-2`, `muted`, `dim`, `accent` — terracotta,
reusing the alpha-aware `rgb(var(--color-accent) / <alpha-value>)` token —
`accent-deep`, `accent-soft`, `pos`). Because the SBL token file only loads on
SBL routes, the Tailwind tokens are inert everywhere else and **the two token
sets do not conflict**: the inkwell `:root` palette ships in a separate file
that does not load on SBL pages, and the root layout only sets
`data-brand="jefflougheed"` when the request is neither SBL, Heirloom, Legacy,
nor admin (see `System Docs/App Structure and Routing.md`), so the inkwell
rules never bleed in.

| SBL token | Value |
|-----------|-------|
| Paper (bg) | `#FAF6EE` / `#F2ECDF` / `#ECE3D2` |
| Line | `#E2D6BC` / `#D2C3A2` |
| Ink | `#1F1A14` / `#3B3328` |
| Muted / Dim | `#6B6256` / `#9A917F` |
| Accent (terracotta) | `rgb(200 84 46)` |
| Accent deep / soft | `#A93F1D` / `#F4D9CC` |
| Positive | `#4F7A4A` |

**Fonts are scoped per brand.** Newsreader (serif) and Manrope (sans) are loaded
via `next/font/google` in `app/secondbrainlabs/layout.tsx` and exposed as
`--font-serif` / `--font-sans` (Tailwind `font-serif` / `font-sans`) **on the
SBL layout wrapper only**. jefflougheed.ca keeps Playfair Display / DM Sans /
DM Mono (`--font-display` / `--font-body` / `--font-mono`), loaded via the
Google Fonts `<link>` in `app/(jefflougheed)/layout.tsx` and defined in `:root`.
Neither font set bleeds into the other.

### Heirloom storefront palette

The Heirloom storefront (`heirloom.2bl.ai`, served from `/heirloom`) ships its
own design tokens, **fully isolated** from the jefflougheed/inkwell and SBL
palettes. They live in `app/heirloom/globals.css` (imported only by the
`/heirloom` layout, so they load only on Heirloom routes). As of the landing
redesign, the file uses the **canonical `--color-*` token names directly**
(no `--hl-*`-prefixed tokens — `scripts/lint-tokens.ts` fails the build on
those), promoted to `:root`: `--color-background`, `--color-surface`,
`--color-surface-2`, `--color-accent`, `--color-accent-hover`,
`--color-text-primary`, `--color-text-muted`, `--color-text-dim`,
`--color-border`, `--color-border-hover`, plus a parallel set of
`--color-modal-*` tokens for surfaces that float above the page (modals,
Clerk forms). Because these are the same canonical names Tailwind already
maps (`background`, `surface`, `surface-2`, `accent`, `text-primary`,
`text-muted`, `accent-hover`, `border` in `tailwind.config.js`), the mapping
is direct — no per-brand remap table needed. Because the Heirloom token file
only loads on Heirloom routes, these tokens are inert everywhere else and do
not conflict with the other palettes — the root layout only sets
`data-brand="jefflougheed"` when the request is neither SBL, Heirloom, Legacy,
nor admin (see `System Docs/App Structure and Routing.md`). The background-image helpers
(`.bg-hero-glow`, `.bg-contributor-glow`, `.bg-pricing-glow`, `.bg-cta-glow`)
and the `--font-*` remaps **remain scoped to `[data-brand="heirloom"]`** in
that file — the wrapper `<div>` is where next/font defines
`--font-heirloom-serif` / `--font-heirloom-sans` / `--font-heirloom-mono` /
`--font-heirloom-hand`, so the remaps must resolve there rather than at
`:root`. Per the redesign, the four `.bg-*-glow` utilities collapse to the
flat `--color-background` (no radial glow, no grain); `.bg-pattern-dots` is
no longer defined in this file at all — the redesigned landing doesn't use it.

| Heirloom token | Value |
|----------------|-------|
| Background (`--color-background`) | `#FAF6EE` |
| Surface / Surface 2 (`--color-surface` / `--color-surface-2`) | `#FFFFFF` / `#F4EFE5` |
| Text primary / muted | `#1F1A14` / `rgba(46,36,23,0.62)` |
| Text dim (`--color-text-dim`) | `#9A917F` |
| Accent (`--color-accent`) | `#C8542E` (SBL terracotta) |
| Accent hover | `#A93F1D` |
| Border / border hover | `rgba(46,36,23,0.14)` / `#D6C9AC` |
| Modal background / surface | `#FFFCF7` / `#F4EFE5` |
| Modal text muted / border | `rgba(46,36,23,0.55)` / `rgba(46,36,23,0.14)` |

**Fonts are scoped per brand.** Cormorant Garamond (serif/display), DM Sans
(body), DM Mono (mono), **and Caveat (hand-lettered accent)** are loaded via
`next/font/google` in `app/heirloom/layout.tsx` and exposed as
`--font-heirloom-serif` / `--font-heirloom-sans` / `--font-heirloom-mono` /
`--font-heirloom-hand`, which `app/heirloom/globals.css` remaps onto
`--font-display` / `--font-accent` / `--font-body` / `--font-mono` /
`--font-hand` **on the Heirloom layout wrapper only**, so Tailwind
`font-display` and `font-body` resolve correctly on Heirloom routes.

---
