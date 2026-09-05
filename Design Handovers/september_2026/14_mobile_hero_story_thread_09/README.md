# Handoff: Mobile Hero — Vertical Story Thread

## Overview
Replaces the desktop photo collage in the marketing hero with a mobile-only vertical "story thread": a stacked sequence of photo + journal-caption pairs, interleaved with a date/location card and an audio (voice memo) card. Desktop hero is unchanged. Scoped to the mobile hero only.

## About the Design Files
`mobile-hero-story-thread.html` in this folder is a **design reference built in HTML**, not production code — a prototype of intended look and behavior. Recreate it in the app's existing environment (Next.js 15 / React 19 / TypeScript / Tailwind / Mantine v7), following existing conventions: semantic Tailwind tokens (`bg-surface`, `text-text-primary`, `bg-accent`, `hover:bg-accent-hover`, `text-background`, `border-border`, `font-display`/`-body`/`-mono`), `lucide-react` icons via the `IconButton` wrapper. Do not ship the HTML/CSS directly.

## Fidelity
**High-fidelity.** Colors, spacing, typography and copy are final. Implement pixel-for-pixel, mapped onto the app's design tokens rather than hardcoded hex values.

## Screens / Views

### Mobile Hero (≤768px only)
**Purpose:** Same hero as desktop (headline, subhead, CTA) but the photo collage is replaced with a vertical thread that surfaces the variety of memory types Heirloom captures (not just photos) — no user interaction, this is a static display element.

**Layout:**
- Breakpoint: `max-width: 768px`.
- At this breakpoint the hero's headline/eyebrow/CTA column (`.hero-text-col`) switches from left-aligned to **centered** — both the column's `text-align` and its inner flex row's `justify-content`.
- The desktop collage canvas is hidden; the story thread wrapper is shown in its place, below the text column (hero stacks to a single column here).
- Thread wrapper: vertical flex column, centered, `max-width: 300px`, `margin: 0 auto`.
- A **1px dashed vertical guide line** runs down the center of the stack, `position: absolute`, inset `6px` from top and bottom, `background: repeating-linear-gradient(to bottom, accent 0 4px, transparent 4px 11px)`, `opacity: 0.4`, sits behind all items (`z-index: 0`; items are `z-index: 1`).
- 8 items stacked top to bottom (see Sequence below), each in its own row with a dot marker on the guide line except caption items.

**Exact CSS (reference values — port to Tailwind/CSS modules as appropriate):**
```css
.mc-thread-wrap { display: flex; position: relative; width: 100%; max-width: 300px; margin: 0 auto; flex-direction: column; align-items: center; }
.mc-thread-line { position: absolute; top: 6px; bottom: 6px; left: 50%; width: 1px; background: repeating-linear-gradient(to bottom, var(--hl-accent) 0 4px, transparent 4px 11px); opacity: 0.4; z-index: 0; }
.mc-thread-item { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; padding: 16px 0; }
.mc-thread-item.mc-caption { padding-top: 10px; } /* paired caption: tighter, no dot */
.mc-thread-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--hl-bg); border: 2px solid var(--hl-accent); margin-bottom: 14px; box-shadow: 0 0 0 5px var(--hl-bg); }
.mc-thread-item .mc-photo { border-radius: 16px; overflow: hidden; background: var(--hl-surface-2); box-shadow: 0 18px 34px -14px var(--hl-shadow), 0 2px 6px -2px rgba(26,21,15,0.18); }
.mc-thread-item .mc-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.mc-thread-item .mc-card { width: 240px; padding: 16px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; background: var(--hl-surface); border: 1px solid var(--hl-border); border-radius: 16px; box-shadow: 0 14px 30px -16px var(--hl-shadow), 0 1px 3px rgba(26,21,15,0.06); }
.mc-thread-item .mc-caption-text { width: 240px; text-align: center; }

@media (max-width: 768px) {
  .hero-text-col { text-align: center; }
  .hero-text-col > div { justify-content: center; }
  .mc-scaler { display: none; }        /* desktop collage */
  .mc-thread-wrap { display: flex; }   /* story thread */
}
```

**Components (in sequence order):**

| # | Type | Content |
|---|------|---------|
| 1 | Photo | "Journal photo 1" — beach/drone shot, 260×168 box |
| 2 | Caption (paired, no dot) | "In 2019, we bought a drone, which gave us a cool perspective of the beach. In this shot..." |
| 3 | Date/location card | "JUN" / "21"  ·  "Secret Places, BC, Canada"  ·  "Aug 12, 2017" |
| 4 | Photo | "Journal photo 2" — Mammoth Mountain, 230×150 box |
| 5 | Caption (paired, no dot) | "After the APTA conference in 2008 in Los Angeles, a few of us snuck up to Mammoth Mountain, CA, one of North America's greatest ski resorts..." |
| 6 | Audio card | "Dad's Wedding Speech" · waveform · 03:47 |
| 7 | Photo | "Journal photo 3" — beach wedding, portrait, 220×300 box |
| 8 | Caption (paired, no dot) | "September 15, 2012. It was a magical beach wedding just before late summer turned to fall, where we vowed to love each other forever..." |

The core pattern: **every photo is immediately followed by its own caption** (no dot marker, reduced top padding — this is what visually binds the pair). Date/location and audio cards break up the rhythm between pairs but never sit inside one.

**Component detail — Photo:**
- `border-radius: 16px`, `overflow: hidden`.
- Shadow: `0 18px 34px -14px rgba(26,21,15,0.30), 0 2px 6px -2px rgba(26,21,15,0.18)`.
- Image: `object-fit: cover`, fills box.
- Box sizes are per-photo, sized to each source image's crop — not a fixed aspect ratio:
  - Photo 1: 260×168 (landscape)
  - Photo 2: 230×150 (landscape)
  - Photo 3: 220×300 (portrait)

**Component detail — Caption:**
- No card/background — text sits directly on the page background.
- Width: 240px, centered.
- Typography: `font-family: 'Caveat', 'Cormorant Garamond', cursive` (handwriting), `font-size: 16px`, `line-height: 1.4`, `color: var(--hl-muted)` (#6B6256 — intentionally secondary/muted, not full-strength text color).
- Copy always ends in `...` (signals there's more in the full journal entry).

**Component detail — Date/location card:**
- Card shell: `background: #FFFFFF`, `border: 1px solid #E6DCC8`, `border-radius: 16px`, width 240px, padding 16px, `box-shadow: 0 14px 30px -16px rgba(26,21,15,0.30), 0 1px 3px rgba(26,21,15,0.06)`.
- Row layout, 14px gap, left-aligned text.
- Left block: month (mono, 10px, `letter-spacing: .14em`, uppercase, accent color `#C8542E`) stacked above day number (display serif, 22px, `line-height: 1`, primary text color).
- Right block: place name (14px, font-weight 600, primary text color `#1A150F`) then full date (mono, 11px, faint color `#9A917F`, `margin-top: 3px`).

**Component detail — Audio card:**
- Same card shell as date/location, but column layout, centered, 6px gap.
- Row: circular play button (30px diameter, 1.5px solid accent border, accent-colored play icon) + title (14px, font-weight 600, primary text color).
- Below: waveform bars, accent color.
- Below that: elapsed/duration readout (mono, 11px, faint color) — e.g. "03:47".

**Reference JSX (as prototyped — for exact structure/values, not literal code to ship):**
```jsx
const items = [
  { type: 'photo', id: 'mc-beach', w: 260, h: 168 },
  { type: 'caption', text: 'In 2019, we bought a drone, which gave us a cool perspective of the beach. In this shot...' },
  { type: 'datelocation', date: 'JUN 21', title: 'Secret Places, BC, Canada', sub: 'Aug 12, 2017' },
  { type: 'photo', id: 'mc-video', w: 230, h: 150 },
  { type: 'caption', text: "After the APTA conference in 2008 in Los Angeles, a few of us snuck up to Mammoth Mountain, CA, one of North America's greatest ski resorts..." },
  { type: 'audio', title: "Dad's Wedding Speech", time: '03:47' },
  { type: 'photo', id: 'mc-grad', w: 220, h: 300 },
  { type: 'caption', text: 'September 15, 2012. It was a magical beach wedding just before late summer turned to fall, where we vowed to love each other forever...' },
];
```
Note the `id`s (`mc-beach`, `mc-video`, `mc-grad`) intentionally match the desktop collage's photo slots — in the design tool this means one image upload fills both the desktop collage and the mobile thread. In the real app, back this with whatever single source of truth the desktop collage already uses for those three photos (same CMS/media field), not a separate mobile-only asset.

## Interactions & Behavior
None. This is a static display block — no click handlers, no animation beyond whatever page-load reveal treatment the rest of the hero already uses (fade/rise-in), no hover/loading/error states. If the hero's existing reveal-on-scroll animation wraps other hero elements, apply the same treatment to `.mc-thread-wrap` for consistency; nothing thread-specific is required.

## State Management
None required — content is static/authored, not user- or data-driven state.

## Design Tokens
- Background: `#FAF6EE` · Surface: `#FFFFFF` · Surface-2: `#F4EFE5`
- Accent (terracotta): `#C8542E` · Accent hover: `#A93F1D`
- Text: `#1A150F` · Muted: `#6B6256` · Faint: `#9A917F`
- Border: `#E6DCC8`
- Shadow color: `rgba(26,21,15,0.30)`
- Fonts: Display — Cormorant Garamond; Body — DM Sans; Mono — DM Mono; Hand — Caveat

Map to the app's existing semantic tokens rather than hardcoding hex.

## Assets
Three photos, shared with the desktop collage's existing image placements:
1. "Journal photo 1" (slot: `mc-beach`) — beach/drone shot, 2019. Landscape, ~260×168 crop.
2. "Journal photo 2" (slot: `mc-video`) — Mammoth Mountain ski trip, 2008. Landscape, ~230×150 crop.
3. "Journal photo 3" (slot: `mc-grad`) — beach wedding, Sept 15 2012. Portrait, ~220×300 crop (needed a taller box than the other two to avoid cropping the source image).

No new icons — reuses existing play-triangle and waveform elements from the hero's audio/voice-memo pattern.

## Where This Lives in the Codebase
Grounded against `app/heirloom/components/landing/HeroSection.tsx` on branch `claude/lander-hero-constellation-thread-8jf3oz` (the real, already-merged-to-branch hero — not a hypothetical).

- **File:** add the thread as a new component in the same file, `app/heirloom/components/landing/HeroSection.tsx`, rendered as a sibling to `MemoryConstellation` inside `.hl-mc-collage-col`, mobile-only.
- **Breakpoint mismatch to resolve:** the real `HeroSection.tsx` already collapses the hero grid to one column at `max-width: 920px` (`.hl-mc-hero-grid`) — it does NOT currently have a 768px breakpoint. This design was prototyped against 768px for the thread swap + headline centering. Before building: either reuse the existing 920px breakpoint for everything (simpler, one breakpoint) or confirm we're intentionally adding a second, narrower 768px breakpoint on top of it. Flagged in Open Items below.
- **CTA — use the real button verbatim**, don't reinvent a `PrimaryCta`:
  ```tsx
  <button type="button" onClick={() => dispatch({ type: 'OPEN_CHAT' })} className="bg-accent hover:bg-accent-hover text-background font-body text-base font-semibold px-7 rounded-[13px] transition-colors min-h-[52px] flex items-center">Start Your Story</button>
  ```
  `dispatch` comes from `useChatStore()` (`@/components/shells/membership/chatStore`), already imported in `HeroSection.tsx`. The second CTA instance under the thread should call the exact same dispatch — don't invent a new event.
- **Real design tokens** (not the `--hl-*` placeholder names used in the prototype file):
  - Colors: `rgb(var(--color-accent))`, `rgb(var(--color-background))`, `rgb(var(--color-surface))`, `rgb(var(--color-surface-2))`, `rgb(var(--color-text-primary))`, `rgb(var(--color-text-dim))`, `var(--color-border)`, `var(--color-text-muted)`.
  - Tailwind utility classes already in use here: `bg-accent`, `hover:bg-accent-hover`, `text-background`, `text-text-primary`, `border-border`, `font-display`, `font-body`, `font-mono`.
  - Handwriting font: `var(--font-hand)` (used via a `.hl-mc-hand` class, color `#5c4a36`) — reuse this exact class/pattern for captions rather than introducing a new one.
- **Image convention:** real photos live at `/heirloom/landerimages/<name>.webp`, referenced as plain `<img src="/heirloom/landerimages/Hero-0.webp" ... className="w-full h-full object-cover" />` — not the prototype's `<image-slot>` placeholder component, which doesn't exist in production. The desktop constellation's existing slots: `mc-beach` → `Hero-0.webp`, `mc-video` → `Video.webp`, `mc-grad` → `Hero-6.webp`.
  - ⚠️ Those three files currently hold generic/stock placeholder photos, not the specific personal memories described in the three captions (2019 drone/beach, 2008 Mammoth Mountain, 2012 beach wedding). Reusing the same filenames only makes sense if Jeff's real photos are meant to replace `Hero-0`/`Video`/`Hero-6` outright on desktop too. If the desktop constellation should keep its current photos, the mobile thread needs its **own** new image files instead — flagged as a decision in Open Items.
- **No existing mobile thread component to extend** — this is net-new; there's nothing today in `HeroSection.tsx` beyond hiding/showing the constellation column at 920px.

## Accessibility
- Each photo needs real `alt` text describing the image (not the placeholder label) — pending the actual images/captions from Jeff, write alt text from the caption content once available (e.g. "Aerial drone shot of the beach, 2019"), not a generic "photo" alt.
- Photo + caption pairs should be marked up as `<figure>` / `<figcaption>` (or the semantic equivalent) so assistive tech reads them as one unit — this matches the visual pairing (no dot, tight spacing).
- Audio card's play button needs an accessible label (e.g. "Play Dad's Wedding Speech") since the icon alone isn't descriptive.
- Tab order should follow visual order top-to-bottom, ending on the CTA — nothing in this block needs a non-default tabindex.

## Acceptance Criteria
- [ ] Desktop (>768px) hero and collage are pixel-identical to before this change — no regressions.
- [ ] At ≤768px: collage is replaced by the thread; headline/eyebrow/CTA column is centered.
- [ ] Thread renders exactly 8 items in the order specified, with the guide line and dots per spec (dots omitted only on caption items).
- [ ] Each photo is immediately followed by its paired caption with no dot and reduced top padding.
- [ ] CTA does NOT render in the top text block at ≤768px; it renders once, centered, below the final caption.
- [ ] All three caption copy strings match verbatim, including trailing "...".
- [ ] Photo boxes use the specified per-photo dimensions (not a single fixed aspect ratio) so source images aren't cropped oddly.

## Repo Reference
Grounded against branch `claude/lander-hero-constellation-thread-8jf3oz`:
- `app/heirloom/components/landing/HeroSection.tsx` — hero + desktop constellation (where this work lands)
- `app/heirloom/components/landing/PageThread.tsx` — the page-wide scroll thread (a different feature; naming inspiration only, not to be confused with this mobile hero thread)

## Files
- `mobile-hero-story-thread.html` — full working reference. Open in a browser and narrow the viewport to ≤768px to see the thread (desktop view above 768px is unchanged and out of scope for this handoff).

## Open Items

**Known-knowns**
- Full layout, spacing, typography, colors, and sequence are locked (see above).
- CTA ("Start Your Story", same `PrimaryCta` style used elsewhere on the page) is hidden in the top headline block on mobile and reappears once, centered, 28px below the last caption — i.e. the thread ends on the CTA, not on photo 3's caption.
- All three caption copy blocks are final.

**Known-unknowns**
- Actual file names / asset labels for the three journal photos — Jeff to provide. Until then, treat the placeholder labels ("Journal photo 1/2/3") as temporary; don't hardcode them as production asset names.
- Alt text for the three photos depends on those same final images/captions from Jeff — write it once the real photos land (see Accessibility section); don't ship generic "photo" alt text.
- **Breakpoint:** build against the real `920px` hero breakpoint, or add a second `768px` breakpoint on top of it? Needs a decision before implementation (see Where This Lives in the Codebase).
- **Image files:** do Jeff's three real photos replace the desktop constellation's existing `Hero-0.webp` / `Video.webp` / `Hero-6.webp` outright, or does the mobile thread need its own separate new files? Affects whether this is a content swap or a new-asset addition.

**Unknown-unknowns**
- None identified at this time — flag anything that surfaces once this is wired to real content/CMS fields.
