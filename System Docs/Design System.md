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
| `app/globals.css` | Tailwind directives, shared base reset, scrollbars, and cross-brand component styles (the Sage chat overlay, chat-first hero stage, `nav-chat-*`, Calendly overrides, `.highlight-marker`/`.mark-highlight`). **No brand token blocks.** Token-consuming rules here resolve against whichever brand file loads on the route. | `app/layout.tsx` (root — loads on every route) |
| `app/(jefflougheed)/globals.css` | The inkwell `:root` tokens **and** the full `html[data-palette="inkwell"]` block (the jefflougheed.ca + admin/platform palette). | `app/(jefflougheed)/layout.tsx`, **and** `app/admin/layout.tsx` + `app/(platform)/layout.tsx` — admin/platform live outside the `(jefflougheed)` route group but share the inkwell palette, so they import this file explicitly. |
| `app/secondbrainlabs/globals.css` | SBL tokens promoted to `:root` + the `sb-pulse` / `sb-dot` keyframes. | `app/secondbrainlabs/layout.tsx` |
| `app/heirloom/globals.css` | Heirloom colour/`hl` tokens + `background`/`color` promoted to `:root`; the `--font-*` remaps **stay scoped to `[data-brand="heirloom"]`** (next/font defines `--font-heirloom-*` on that wrapper, not on `:root`, so the remaps must resolve there); the `.bg-*-glow` / `.bg-pattern-dots` utilities (kept `[data-brand="heirloom"]`-scoped). | `app/heirloom/layout.tsx` |

Note: the jefflougheed public-site component CSS (Sage overlay, hero stage,
`nav-chat-*`) intentionally stays in `app/globals.css` for now — it is coupled
to the `Chat`/`Nav`/`Hero` components that don't move until Phase 3.

The token table below is the **jefflougheed.ca + admin palette** (the default
`:root` / `html[data-palette="inkwell"]` tokens in
`app/(jefflougheed)/globals.css`):

| Token | Value |
|-------|-------|
| Background | `#f9f8f5` |
| Accent green | `#2d6a4f` |
| Text primary | `#1a1917` |
| Text muted | `rgba(26,25,23,0.55)` |
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
that does not load on SBL pages, and the root layout drops `data-palette="inkwell"`
whenever the request is SBL (see `System Docs/App Structure and Routing.md`) so the inkwell rules
never bleed in.

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
`/heirloom` layout, so they load only on Heirloom routes). The colour tokens are
promoted to `:root`: `--color-surface` and `--color-accent` are re-scoped there
so the existing `surface` / `accent` Tailwind tokens render Heirloom values on
these routes, and Heirloom-only tokens (`--hl-bg`, `--hl-text-primary`,
`--hl-text-muted`, `--hl-accent-hover`, `--hl-border`) are surfaced as Tailwind
utilities in `tailwind.config.js` (`background`, `text-primary`, `text-muted`,
`accent-hover`, `border`). Because the Heirloom token file only loads on
Heirloom routes, these tokens are inert everywhere else and do not conflict with
the other palettes — the root layout drops `data-palette="inkwell"` whenever the
request is Heirloom (see `System Docs/App Structure and Routing.md`). The background-image helpers
(`.bg-hero-glow`, `.bg-contributor-glow`, `.bg-pricing-glow`, `.bg-cta-glow`,
`.bg-pattern-dots`) and the `--font-*` remaps **remain scoped to
`[data-brand="heirloom"]`** in that file — the wrapper `<div>` is where
next/font defines `--font-heirloom-serif` / `--font-heirloom-sans`, so the
remaps must resolve there rather than at `:root`.

| Heirloom token | Value |
|----------------|-------|
| Background (`--hl-bg`) | `#1C0F06` |
| Surface (`--color-surface`) | `#2A1A0E` |
| Text primary / muted | `#F5EFE6` / `rgba(245,239,230,0.55)` |
| Accent (`--color-accent`) | `rgb(201 169 110)` (gold) |
| Accent hover | `#B8935A` |
| Border | `rgba(245,239,230,0.12)` |

**Fonts are scoped per brand.** Cormorant Garamond (serif/display), DM Sans
(body), and DM Mono (mono) are loaded via `next/font/google` in
`app/heirloom/layout.tsx` and exposed as `--font-heirloom-serif` /
`--font-heirloom-sans` / `--font-heirloom-mono`, which `app/heirloom/globals.css`
remaps onto `--font-display` / `--font-serif` / `--font-body` / `--font-mono`
**on the Heirloom layout wrapper only**, so Tailwind `font-display`, `font-body`,
and `font-mono` resolve correctly on Heirloom routes.

---
