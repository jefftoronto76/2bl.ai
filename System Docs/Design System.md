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

### Breakpoints

`tailwind.config.js` defines **no custom `screens` key**, so Tailwind's
defaults are the breakpoints for the whole app: `sm` 640px, `md` 768px, `lg`
1024px, `xl` 1280px, `2xl` 1536px. Tailwind breakpoints are `min-width`, so
`md:hidden` hides **at and above** 768px and `hidden md:inline` shows **at and
above** 768px. **`md` (768px) is the mobile/desktop line** for the membership
chat shell — it is where the sidebar switches between docked and overlay and
where the chat header changes shape.

**Two ways of asking "is this mobile" coexist, and they are not equivalent.**
CSS-side is Tailwind's `md:` prefix. JS-side is
`useMediaQuery('(max-width: 768px)')` (`@mantine/hooks`), used by
`ChatHero.tsx` and `ChatInput.tsx` where a decision can't be expressed as a
class — conditional *rendering* rather than conditional styling, e.g. not
mounting a component at all, or passing a handler as `undefined`.

Prefer the CSS form when either would work: it needs no JS media query, has no
post-hydration flash, and is server-renderable. Reach for the JS form only
when the component tree itself must differ.

⚠️ **`max-width: 768px` and `min-width: 768px` both match at exactly 768px**,
so the two mechanisms disagree on that single pixel — and that disagreement is
a live bug today, not a theoretical one. See the breakpoint entry in
`System Docs/Known Gaps.md` for what breaks and how to fix it. Until it is
fixed, **don't mix the two mechanisms to gate the same element**, and if you
must, know that 768px exactly will take the JS branch's rendering with the CSS
branch's styling.

**Heirloom lander breakpoints (added 2026-09-07, PR #468).** The rebuilt lander
in `app/heirloom/components/landing/` does **not** use Tailwind `screens` for its
layout collapses. Each section carries raw `@media (max-width: …)` rules in a
component-scoped `<style>` block: **920px** (`HeroSection.tsx` — hero grid to a
single column; also `BuyerPersonasSection`, `HowItWorksSection`), **768px**
(`HeroSection.tsx` — desktop constellation swapped for the vertical
`MobileStoryThread`, headline centred and pinned to `20vh`; also
`WhatIsHeirloomSection`), and per-section extras at 820/760/560/460px
(`HowItWorksSection`, `Footer`). Because these are `max-width` queries, the
768px one collides with Tailwind's `min-width: 768px` `md:` at exactly 768px —
the same one-pixel disagreement described above, now on a third surface (see
the breakpoint entry in `Known Gaps.md`). The 768px rule was added on top of
the pre-existing 920px collapse deliberately, so the 769–920px range keeps the
single-column desktop hero.

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
| `app/heirloom/globals.css` | Canonical `--color-*` tokens (`background`, `surface`, `surface-2`, `accent`, `accent-hover`, `text-primary`, `text-muted`, `text-dim`, `border`, `border-hover`) plus `--color-modal-*` tokens, promoted to `:root`; the `--font-*` remaps **stay scoped to `[data-brand="heirloom"]`** (next/font defines `--font-heirloom-*` on that wrapper, not on `:root`, so the remaps must resolve there); the `.bg-*-glow` utilities (kept `[data-brand="heirloom"]`-scoped — `.bg-pattern-dots` is no longer defined in this file; since the PR #468 lander rebuild their only consumer is `app/heirloom/coming-soon/page.tsx`); the Clerk `.cl-*` text overrides; the modal/sheet animation keyframes and utilities (`hl-fade-in`, `hl-modal-in`, `hl-sheet-up`, `hl-sheet-left`, `hl-sheet-left-out`); **two coexisting scroll-reveal utilities** — the transition-based `.hl-reveal`/`.hl-visible` (pre-redesign, now unreferenced) and the lander's `.reveal`/`.reveal.in` + `@keyframes hl-rise` (see "Heirloom landing animation + asset conventions" below); `.hl-thumb-fade`; and one shared `prefers-reduced-motion` override block covering all of them. | `app/heirloom/layout.tsx` |

The token table below is the **jefflougheed.ca + admin palette** (the default
`:root` tokens in `app/(jefflougheed)/globals.css`), consumed via Tailwind
CSS-var utilities. **This is a separate mechanism from Mantine's own admin
theme** (`components/admin/theme/mantine-theme.ts`'s `buildAdminTheme`,
which builds a distinct per-tenant Mantine `createTheme()` object — three
hardcoded `TENANT_FALLBACKS` palettes, none matching the values below — for
Mantine-component-internal styling specifically). See `System Docs/Admin
Overview.md`'s "Theme" section for that system; don't assume this table's
values apply inside Mantine components.

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
(no `--hl-*`-prefixed tokens), promoted to `:root`: `--color-background`, `--color-surface`,
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
nor admin (see `System Docs/App Structure and Routing.md`).

> **The no-tenant-prefix rule is convention only — nothing enforces it.**
> `Backlog/css-token-unification-spec.md` specifies a `scripts/lint-tokens.ts`
> build gate (`tsx scripts/lint-tokens.ts && next build`) that would fail the
> build on `--hl-*`/`--lg-*` tokens, and this doc previously described that
> gate as live. It is not: `scripts/` contains only `sync-branding.ts`, and
> `package.json`'s build script is `tsx scripts/sync-branding.ts && next
> build`. The spec is a proposal that was never implemented. Until it is,
> a stray tenant-prefixed token ships silently — grep for `--hl-`/`--lg-`
> by hand when touching token files. (The July 2026 lander handovers already
> carry this warning; System Docs had not caught up.)

The background-image helpers
(`.bg-hero-glow`, `.bg-contributor-glow`, `.bg-pricing-glow`, `.bg-cta-glow`)
and the `--font-*` remaps **remain scoped to `[data-brand="heirloom"]`** in
that file — the wrapper `<div>` is where next/font defines
`--font-heirloom-serif` / `--font-heirloom-sans` / `--font-heirloom-mono` /
`--font-heirloom-hand`, so the remaps must resolve there rather than at
`:root`. Per the redesign, the four `.bg-*-glow` utilities collapse to the
flat `--color-background` (no radial glow, no grain); `.bg-pattern-dots` is
no longer defined in this file at all — the redesigned landing doesn't use it.
After the PR #468 rebuild no landing section applies any of the four
`.bg-*-glow` classes either (sections use plain `bg-background` / `bg-surface`
or their own scoped CSS); the last consumer is `app/heirloom/coming-soon/
page.tsx`, so the block can go when that page does.

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
`font-display` and `font-body` resolve correctly on Heirloom routes. Only
`--font-display`, `--font-body` and `--font-mono` have Tailwind utilities
(`tailwind.config.js` `fontFamily`: `display`, `body`, `mono`, plus `serif`/
`sans`); **`--font-hand` and `--font-accent` have none** — Caveat reaches the
page only through the `.hl-mc-hand` class defined inline in
`app/heirloom/components/landing/HeroSection.tsx`, which also hardcodes its
ink colour (`#5c4a36`, the one lander colour not expressed as a `--color-*`
token). Adding `hand` to `fontFamily` is part of the lander Tailwind
conversion tracked in `Known Gaps.md` (Heirloom Lander, entry 15). Note too
that `app/heirloom/layout.tsx`'s DB-branding injection overrides
`--font-display` / `--font-body` / `--font-mono` but never `--font-hand`, so
a tenant font switch leaves the hand-lettered accents on Caveat.

### Heirloom landing animation + asset conventions

Added with the 2026-09 lander rebuild (PR #468); the lander itself is
documented in `System Docs/Public Site.md` ("Heirloom lander").

- **Scroll-reveal.** `app/heirloom/globals.css` defines `@keyframes hl-rise`
  (18px rise + fade, 0.8s, `cubic-bezier(0.22,1,0.36,1)`), `.reveal { opacity:
  0 }` and `.reveal.in { animation: hl-rise … forwards }`, guarded by the file's
  shared `prefers-reduced-motion` block. It is driven by
  `app/heirloom/components/landing/useReveal.ts` — an IntersectionObserver
  reveal-once hook (threshold 0.12, disconnects on first intersection) with a
  1300ms fallback timer and an in-viewport-on-mount check, returning
  `[ref, seen]`; sections toggle `'reveal' + (seen ? ' in' : '')` and stagger
  children with an inline `animationDelay`. New lander sections should use this
  pair. The older `.hl-reveal`/`.hl-visible` transition utility in the same file
  is the pre-redesign mechanism and is no longer referenced by anything.
- **Scoped component CSS.** `HeroSection.tsx` (`.hl-mc-*`), `PageThread.tsx`
  (`.hl-thread-*`) and `Footer.tsx` (`.hl-foot*`) each ship their own
  `<style>` block rather than Tailwind utilities — see the styling tech-debt
  entry in `Known Gaps.md` (Heirloom Lander, entry 15).
- **Lander imagery** lives in `public/heirloom/landerimages/`, all WebP (19
  files), referenced as `/heirloom/landerimages/<name>.webp` from plain `<img>`
  tags with explicit `width`/`height`. Two components derive filenames from
  content strings at runtime — `PageThread.tsx`'s `TH_CAPS` captions
  (`Family`, `Pets`, `Friendships`, `A day` — note the space) and the hero's
  `ph` slot labels (`Hero-0..9`, `Video`) — so renaming a caption renames the
  file it needs. `mobile-thread-{beach,mammoth,wedding}.webp` are deliberate
  byte-identical copies of `Hero-0`/`Video`/`Hero-6` for the ≤768px story
  thread.

---
