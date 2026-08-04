# Heirloom Lander Update — July 2026 Implementation Plan (corrected)

## Context
The **Heirloom** product's marketing lander needs a visual refresh in four staged passes (specs: `pass-1-foundations.md` … `pass-4-book.md`). **"Legacy" is the front-end brand name only — the product is Heirloom and lives under `app/heirloom/`.** The previous chat-widget deploy landed with the wrong palette; Pass 1 must be signed off before structural work. One commit per pass, pushed independently.

Branch: `claude/legacy-lander-handoff-ypez8s`

> **Do not target `app/legacy/`.** That is a separate route-scoped storefront (`legacy.2bl.ai`) with its own `--lg-*` tokens and a standalone lander that does **not** mount the chat shell. All work here is in **`app/heirloom/`** + the shared **`components/shells/membership/`** chat shell (already mounted by `app/heirloom/HeirloomApp.tsx`).

---

## Root cause of the previous widget palette failure (corrected)
Two consumers still reference the old **`--hl-*`** names while the theme (`app/heirloom/globals.css`) has already migrated to the canonical **`--color-*`** names, so the classes resolve to **undefined** and fall back:

- **`tailwind.config.js`** maps `background / text-primary / text-muted / accent-hover / border` → `--hl-*` (and `bg` → `--color-bg`, which isn't defined either — should be `--color-background`). Only `surface`/`accent` (→ `--color-*`) resolve — which is why the widget came through half-styled / wrong-palette.
- **`app/heirloom/layout.tsx`** — when `use_db_branding` is on, injects `--hl-bg / --hl-text-primary / --hl-text-muted` (and omits the rest). `--hl-accent-hover` and `--hl-border` are defined **nowhere**, so `hover:bg-accent-hover` and `border-border` break regardless of that flag.

**Fix = repoint BOTH `tailwind.config.js` and `layout.tsx` to the canonical `--color-*` names.** It is NOT a missing alias in `app/legacy/globals.css`; do not add `--hl-*`/`--lg-*` anywhere. Authority: `css-token-unification-spec.md` (repo root). Note: the spec cites a `scripts/lint-tokens.ts` build gate, **but that file is not present in the repo on this branch** — nothing enforces this automatically today, so verify by hand.

---

## Pass 1 — Foundations (token wiring, fonts)
**Goal:** palette + type correct on the lander **and** the already-mounted chat widget. Ship/verify before Pass 2.

### Files to modify
**`tailwind.config.js`** — repoint the five mismatched Heirloom tokens to the `--color-*` names the theme defines, and add `surface-2`:
```js
// colors.extend — change these five from var(--hl-*) to the canonical --color-* names:
background:     'rgb(var(--color-background) / <alpha-value>)',
'text-primary': 'rgb(var(--color-text-primary) / <alpha-value>)',
'text-muted':   'var(--color-text-muted)',
'accent-hover': 'var(--color-accent-hover)',
border:         'var(--color-border)',
// add (chat sidebar):
'surface-2':    'rgb(var(--color-surface-2) / <alpha-value>)',
```

**`app/heirloom/globals.css`** — add the sidebar surface value inside `:root {}` (already terracotta otherwise; leave the rest):
```css
--color-surface-2: 244 239 229;   /* #F4EFE5 — chat sidebar / input fields */
```
The `hl-animate-*` / `hl-reveal` utilities already exist here — no change.

**`app/heirloom/layout.tsx`** — two changes:
1. **Migrate the DB-branding injection to canonical names** (per the spec): the `use_db_branding` block currently pushes `--hl-bg`, `--hl-text-primary`, `--hl-text-muted`. Rename to `--color-background`, `--color-text-primary`, `--color-text-muted`, and inject the full canonical set the spec lists (accent-hover, text-dim, border, border-hover, modal-*) so DB-branded tenants don't fall back. It already injects `--color-surface` / `--color-accent` correctly.
2. **Add Caveat** for Pass 2's handwritten note:
```ts
import { Caveat } from 'next/font/google'
const hand = Caveat({ subsets:['latin'], weight:['400','500','600'], variable:'--font-heirloom-hand' })
// add hand.variable to the wrapper div className
```
and in `app/heirloom/globals.css` under `[data-brand="heirloom"]`: `--font-hand: var(--font-heirloom-hand);`

### Do NOT
- Do **not** mount `ChatProvider` / `ChatDrawerV2` / `ChatHero` anywhere — already done in `app/heirloom/HeirloomApp.tsx`.
- Do **not** edit `app/legacy/*`.

### Verification
`tailwind.config.js` is shared — confirm the sbl/legacy routes still render. **There is no `scripts/lint-tokens.ts` in the repo on this branch**, so grep for any remaining `--hl-`/`--lg-` custom-property references by hand rather than relying on a lint gate. Then on the Heirloom route: color-pick surface/text/accent/border → matches `pass-1-foundations.md`. Chat drawer opens terracotta: cream sidebar `#F4EFE5`, white user bubbles + hairline, transparent assistant bubbles, `#C8542E` feather avatar, Cormorant "What's a story worth keeping?" empty state.

Commit: `fix(heirloom): align tailwind.config + layout.tsx tokens to --color-* + add surface-2 & Caveat`

---

## Pass 2 — Constellation hero + image handling
**Goal:** replace the current hero right-side visual with the `MemoryConstellation` — a `1080×840` fixed-coordinate canvas of 11 photos + chrome cards joined by a curved connector.

### Files to add/modify
**`app/heirloom/components/landing/MemoryConstellation.tsx`** — new (extracted for size):
- Wrapper `container-type: inline-size`; canvas `width:1080px; transform:scale(calc(100cqw/1080)); transform-origin:top left;` (no hydration pop).
- 11 `<Image>` slots from `public/heirloom/hero/` — each in a `rounded-[14px] overflow-hidden` wrapper with per-element rotation on the wrapper, `fill`, `object-fit:cover`. `mc-beach` `priority`; others lazy.
- Chrome cards (pure JSX/CSS, no images): audio player, voice memo, handwritten note (`font-hand`), message bubble, location pin, date chip, address label, heart doodle. `lucide-react` icons.
- SVG overlay (`viewBox="0 0 1080 840"`, `pointer-events:none`, z below cards): `buildConstellation()` — `M e1 Q ctrl e2` edge-to-edge segments between consecutive cards (perpendicular bow away from centre `(531,396)`, `bow=clamp(gap*0.36,20,72)`), 4.5px ring nodes at midpoints. Stroke `accent`@40%, 1.7px, round caps.
- Positions/rotations lifted verbatim from `Heirloom_Combined Lander v2.html` `MC_PHOTOS` + chrome blocks.

**`app/heirloom/components/landing/LandingPage.tsx`** (or the hero component it renders) — swap the current hero visual for `<MemoryConstellation />`; hero grid: left `minmax(340px,430px)`, right `1fr`, gap 40, max ~1340px; stacks below 920px (collage below copy).

**`public/heirloom/hero/`** — 11 stub images (transparent 1×1 placeholders): `hiker/swing/couple/dog/beach/apt/grad/birthday/mtn/van/video.jpg`. Real photography drops in later with no layout change.

### Verification
Collage right of copy, correct positions/rotations; photos via `next/image` (AVIF/WebP in Network); curved connector + ring nodes visible; note in Caveat; stacks below 920px. No `<image-slot>`, no upload code.

Commit: `feat(heirloom): add MemoryConstellation hero + next/image photo slots`

---

## Pass 3 — The page thread
**Goal:** page-spanning scroll-drawn dotted thread with photo/dot beads at section transitions.

### Files to add/modify
**`app/heirloom/components/landing/PageThread.tsx`** — new client component:
- Full-height `<svg>` overlay (`position:absolute`, doc scroll height, `pointer-events:none`, `z-index:3` — above section bgs, below nav).
- Path from `[data-screen-label]` sections: alternating left/right margins, Catmull-Rom→Bézier, rebuilt on resize.
- Two copies: faint track (`accent/16`, dash `2 9`, 2px) + vivid live copy (`accent`, dash `2 9`, 2.5px) clipped to `height = scrollY + innerHeight*0.6`, updated via `rAF`.
- Bead layer (HTML, `pointer-events:none`): photo beads (108×82 `next/image` + DM Mono caption) at even transitions, node dots (13px ring) at odd; `opacity:0/scale` → `lit` when `front >= bead.y`.
- Book convergence chips in the book section: scattered → gather on reveal via `--sx/--sy/--sr` → `--ex/--ey/--er`. *(With Pass 4's photo, retarget chips to the photo or drop them — stakeholder's call.)*
- `prefers-reduced-motion`: render final state statically.

**`app/heirloom/components/landing/LandingPage.tsx`** — add `data-screen-label` to each `<section>`; render `<PageThread />` inside the root scroll wrapper.

### Verification
Faint track on load; vivid line draws to ~60% viewport on scroll; hugs margins, crosses only in section gaps (never over text); beads fade/scale in; chips gather; reduced-motion static; nav stays above; no scroll jank.

Commit: `feat(heirloom): add PageThread scroll-draw overlay + section beads`

---

## Pass 4 — Book section photo
**Goal:** replace the CSS book cover in "It becomes a book" with the `book-keepsake.png` lifestyle photo.

### Files to modify
**`public/heirloom/book-keepsake.png`** — copy from this bundle.

**`app/heirloom/components/landing/LandingPage.tsx`** (the "It becomes a book" section):
- Remove the CSS book-cover element; render:
```tsx
<div className="w-full">
  <Image src="/heirloom/book-keepsake.png"
    alt="Finished Legacy books on a linen table — a road-trip memoir, a birthday keepsake, a kids' comic, a family recipe book, and an open photo spread."
    width={900} height={600}
    style={{ width:'100%', height:'auto' }} className="rounded-r-[24px]" />
</div>
```
- Right cell uses **natural aspect (`height:auto`), not `object-fit:cover`** (avoids clipping the book titles). Card grid `1.05fr` copy + `1.15fr` photo, `overflow:hidden`, `rounded-[24px]` (clips the photo's right corners). Stacks below 820px. **"Other ways to share it" cards untouched.**

### Verification
Photo full-width right, no title clipping, all titles readable; left copy unchanged; stacks below 820px; other format cards untouched; served via `next/image`, swappable for real photography.

Commit: `feat(heirloom): replace CSS book cover with book-keepsake.png photograph`

---

## Critical files (all under `app/heirloom/` + shared config)
- `tailwind.config.js` — **token name fix (Pass 1 root cause)**
- `app/heirloom/globals.css` — `--color-surface-2` + `--font-hand`
- `app/heirloom/layout.tsx` — Caveat font
- `app/heirloom/components/landing/LandingPage.tsx` — modified across Passes 2–4
- `app/heirloom/components/landing/MemoryConstellation.tsx` — new (Pass 2)
- `app/heirloom/components/landing/PageThread.tsx` — new (Pass 3)
- `public/heirloom/hero/*.jpg` — 11 placeholders (Pass 2)
- `public/heirloom/book-keepsake.png` — asset (Pass 4)
- **Not touched:** `app/legacy/*`, and `HeirloomApp.tsx`'s existing chat mount.
