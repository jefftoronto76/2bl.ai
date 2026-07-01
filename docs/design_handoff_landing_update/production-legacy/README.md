# Landing redesign — Heirloom repo integration handoff

**Target:** `heirloom.2bl.ai` → `app/heirloom/`  ·  **Repo:** `jefftoronto76/2bl.ai` (branch `main`)
**Reference prototype:** `../Heirloom_Combined Lander.html` (source of truth for look, copy, behaviour).

> The `.html` prototype is a **design reference**, not shippable code. These `.tsx` files
> are the production implementation — canonical Tailwind tokens, `next/font`, `lucide-react`,
> and the repo's per-section `IntersectionObserver` reveal idiom. They sit at their real repo
> paths and are drop-in replacements.

---

## Non-negotiables

1. **The chat / core system is untouched.** Nothing under `components/shells/membership/`
   (chat store, Clerk, auth) is modified. The landing files only **import and call** the
   existing production functions, so updating the storefront cannot overwrite or break chat
   activation.
2. **Nav = branding change only.** `LandingNav.tsx` is the live file **verbatim** except the
   wordmark "Heirloom" → "Legacy" (+ its `aria-label`). Links, targets, the Sign Up ghost
   button, Start Your Story, every className, the scroll behaviour, and the feather logo asset
   are byte-for-byte production. **Do not restructure the nav.**
3. **Chat activation wiring, unchanged everywhere it appears:**
   - Start Your Story (nav, hero, pricing, closing) → `dispatch({ type: 'OPEN_CHAT' })` (`useChatStore`)
   - Sign Up (nav) → `setOAuthInProgress(true); openSignUp({ appearance: heirloomClerkAppearance })`, guarded by `isLoaded && !isSignedIn`
4. **Accent flips the whole tenant to terracotta** `#C8542E` via `--color-accent` (already in
   `globals.css`). Chat is recoloured by the token only — its wiring is not touched. **Set the
   Heirloom DB branding row to matching values** or `use_db_branding` re-injects green (see below).
5. **Wordmark "Legacy" on the landing page only.** No route / anchor / storage-key / domain
   change — `app/heirloom/`, `#what-is-heirloom`, `hl.liveEditorVote`, `heirloom.2bl.ai` stay.

---

## File-by-file (all at their real repo paths)

| File | Action | New role | Chat? |
|---|---|---|---|
| `globals.css` | **Replace** | Canonical `:root` tokens, flat/terracotta values baked in. Glow utilities collapse to flat page colour; no grain. | — |
| `LandingNav.tsx` | **Replace** | **Branding-only** edit of the live nav (wordmark → "Legacy"). | `OPEN_CHAT` + Clerk (verbatim) |
| `LandingPage.tsx` | **Replace** | Composes the page + inline **Hero** (the one merged piece — keeps production `OPEN_CHAT`). | Hero `OPEN_CHAT` |
| `WhatIsHeirloomSection.tsx` | **Replace** | "Through conversation…" — Capture / Shape / Publish (`#what-is-heirloom`). | no |
| `HowItWorksSection.tsx` | **Replace** | Repurposed → "It becomes a book." + formats. Keeps `id="how-it-works"` so the untouched nav link resolves. | no |
| `ContributorModelSection.tsx` | **Replace** | "One story. Many voices." (`#contributors`). | no |
| `FeaturesSection.tsx` | **Replace** | "Built to make your stories shine" — lead card + 2×2 + security link + live-editor vote (`#best-parts`). | no |
| `BuyerPersonasSection.tsx` | **Replace** | "Every story deserves to be told." (`#personas`). | no |
| `PricingSection.tsx` | **Replace** | "Easy to get started." — Purchase Price / Annual toggle. | `OPEN_CHAT` (fresh) |
| `CtaSection.tsx` | **Replace** | Closing "All memories fade…". | `OPEN_CHAT` (fresh) |
| `Footer.tsx` | **Replace** | Second Brain Labs footer + "Every life deserves to be a book." lead line. | no |

### Left in place, NOT composed (open slots for future sections)
`AddOnsSection.tsx` · `TestimonialsSection.tsx` — no longer imported by `LandingPage.tsx`.
Safe to delete, or keep for a future section (per "we might create new sections in those places").

### Composition order (`LandingPage.tsx`)
`LandingNav → Hero → WhatIsHeirloomSection → HowItWorksSection → ContributorModelSection → FeaturesSection → BuyerPersonasSection → PricingSection → CtaSection → Footer`

---

## Section anchors ↔ nav links (unchanged nav)
| Nav link | Target id | Section |
|---|---|---|
| How It Works | `#how-it-works` | `HowItWorksSection` ("It becomes a book.") |
| Pricing | `#pricing` | `PricingSection` |
| About | `#what-is-heirloom` | `WhatIsHeirloomSection` |

---

## Visual system (flat)
- Page `#FAF6EE` (`bg-background`), cards `#FFFFFF` (`bg-surface`). No paper glow, no grain,
  no `bg-pattern-dots`, no drop shadows, no nav blur beyond the production nav's own
  `backdrop-blur-md`, flat book cover (no 3D).
- Accent terracotta `#C8542E` — CTAs, mono eyebrows, italic ledes, icon chips (`bg-accent/10`),
  hairlines (`border-accent/20…40`).
- Type: Cormorant Garamond (`font-display`) / DM Sans (`font-body`) / DM Mono (`font-mono`).
  Fonts already wired via `next/font` on `[data-brand="heirloom"]` — no change.

### Design values → canonical token (already in `globals.css`)
| Role | Value | Token |
|---|---|---|
| Page background | `#FAF6EE` | `--color-background` `250 246 238` |
| Surface / card | `#FFFFFF` | `--color-surface` `255 255 255` |
| Accent | `#C8542E` | `--color-accent` `200 84 46` |
| Accent hover | `#A93F1D` | `--color-accent-hover` `169 63 29` |
| Ink / primary | `#1F1A14` | `--color-text-primary` `31 26 20` |
| Muted | `#6B6256` | `--color-text-muted` `107 98 86` |
| Dim | `#9A917F` | `--color-text-dim` `154 145 127` |
| Border | `#E6DCC8` | `--color-border` `230 220 200` |

---

## Behaviour
- **Reveals:** each section uses the repo idiom — local `visible` state + `IntersectionObserver`
  (threshold 0.1) + `transition-all duration-700` opacity/translate, staggered with `delay-*`.
  Hero uses the `mounted` timeout pattern (visible almost immediately).
- **Pricing toggle:** Purchase Price ↔ Annual swaps price + "Save 25%" pill + "billed $899/year".
- **Live-editor vote:** one-way, persists `hl.liveEditorVote='1'`, 247→248.

## To finish in the codebase
1. **DB branding row (required to keep the flip):** set the Heirloom tenant to
   `background #FAF6EE`, `surface #FFFFFF`, `accent #C8542E`, `accent_hover #A93F1D`,
   `text_primary #1F1A14`, `text_muted #6B6256`, `text_dim #9A917F`, `border #E6DCC8`,
   `paper_effect = flat`. `layout.tsx` injects these onto the same `:root` tokens; the static
   `globals.css` values are only the fallback when `use_db_branding` is off. **If this row still
   holds forest green, runtime injection reverts the flip.**
2. **Clerk modal tokens:** if `clerkAppearance.ts` still references `--hl-modal-*`, repoint to
   `--color-modal-*` (already defined in this `globals.css`). Kept out of the landing change.
3. **Open questions:** "Secure & responsible" destination route (currently `#`); whether new
   sections fill the freed `AddOns` / `Testimonials` / former `HowItWorks` slots.

## Preserved identifiers (do NOT change)
`app/heirloom/` route · `#what-is-heirloom` anchor + nav target · `#how-it-works`, `#pricing`
nav targets · `hl.liveEditorVote` key · `heirloom.2bl.ai` domain · the nav feather logo asset
`/heirloom/favicons/icons/heirloom-feather-cream.svg` · `next/font` `[data-brand="heirloom"]` wrapper.
