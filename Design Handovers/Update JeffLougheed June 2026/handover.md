# Handover — Operator/Coach mode + SectionProcess copy

This package ports today's prototype work into your Next.js app
(`app/(jefflougheed)/`). Everything matches your existing conventions:
Tailwind utility classes, CSS-variable tokens (`--color-*`), the
`font-display / font-body / font-mono` + `bg-surface / bg-accent / text-bg /
text-accent` utilities, and `lucide-react` icons. No new dependencies.

---

## TL;DR — what to copy

Copy these **4 files** into `app/(jefflougheed)/components/`, replacing the
existing ones (and adding the new `useMode.ts`):

| File | Action | Why |
|---|---|---|
| `useMode.ts` | **add (new)** | Shared Operator/Coach store — keeps every toggle in sync, persists to `localStorage`. |
| `SectionOutcomes.tsx` | **replace** | Mode-aware rebuild: toggle + per-mode cards + call-out coda. |
| `SectionWhy.tsx` | **replace** | Mode-aware rebuild (twin of Outcomes). |
| `SectionProcess.tsx` | **replace** | Copy edit (two subhead lines removed) + chips now driven by the shared mode. |

**Do not copy** `SectionCareer.tsx` or `globals.css` from this package — see
the two notes at the bottom. No `globals.css` change is required.

`page.tsx` needs **no change** — the component imports/usage are unchanged.

---

## What changed, mapped to today's work

1. **Coaching/Operator buttons on "Outcomes I focus on" and "How I work."**
   Each section now renders a `ModeToggle` (Operator · Coach) above its grid.

2. **One click syncs every toggle across sections.**
   New `useMode.ts` is a tiny external store (`useSyncExternalStore`) — no
   context/provider needed. Outcomes, Why, and Process all read/write the same
   value, so flipping one flips all of them. The choice persists across reloads
   via `localStorage` (key `jl-mode`).

3. **Icon cards split into two mode-specific sets, one shown at a time.**
   Each section holds an `operator` set and a `coach` set and renders only the
   active mode's cards — fewer, larger editorial statements instead of the old
   static 6-card grid. The grid auto-switches between 3-up (operator) and 2-up
   (coach) layouts.

4. **Reworked coda — show/hide + quote.**
   - **Operator mode:** the original italic coda line (unchanged copy).
   - **Coach mode:** a quiet borrowed call-out — quote + attribution with an
     avatar. This is the fixed **"Quiet line"** treatment you chose (no
     Tweaks-style Off/Aside switch in production).

5. **SectionProcess copy.** Removed the two subhead lines:
   - Coaching: *"Structured thinking work, not just conversations."*
   - Operator: *"For organizations that want to grow without the drama."*
   The `subhead` type was relaxed from the 2-tuple `[string, string]` to
   `string[]` so a single line is valid.

---

## Notes & decisions baked in

**SectionProcess now follows the shared mode.**
Its track chips no longer use local `useState`. The cross-section mode speaks
`'operator' | 'coach'`; this section's tracks are `'operator' | 'coaching'`, so
it maps `coach ⇄ coaching`. Selecting **Coach** on Outcomes now also flips
How-it-works to the Coaching track, and vice-versa — as requested.
The `defaultTrack` prop is kept for API compatibility but is now a no-op
(marked `@deprecated`); change the starting mode in `useMode.ts` instead
(`let currentMode: Mode = 'operator'`).

**Call-out content & avatar.**
Quotes live at the top of each section file in the `CALLOUT` object
(`SectionOutcomes.tsx` → Iara Rios / Keyhole; `SectionWhy.tsx` → Brittany
Dallman / BDR). The avatar shows initials by default; if you want a photo,
add an `image` field and swap the `<span>` initials for an `<img>` (mirrors
the pattern used in `SectionTestimonials`).

**Animation safety.**
Entrance uses a transform-only `jlRise` keyframe (no `opacity:0`), so content
is never invisible if the animation timeline is frozen (background tab, print,
PDF). A `prefers-reduced-motion: reduce` rule disables it. Keyframes are scoped
inside each component via a `<style>` block — same pattern as your
`SectionProcess`'s `SectionKeyframes`.

**SSR / hydration.**
`useMode` returns `'operator'` for the server snapshot and the first client
render, then reads the persisted value on first subscribe (post-hydration) and
re-renders if it differs — so there's no hydration mismatch warning.

---

## ⚠️ SectionCareer — needs your call (not included)

The "layout adjustments" we made in the prototype are based on an **older,
simpler** Career layout (slice to 6 + a "Show all" button, uniform card heights
via `grid-auto-rows`). Your **live repo `SectionCareer.tsx` is already further
ahead** — it uses a peek/scroll grid (`max-h-[60vh] overflow-y-auto`), a
gradient fade mask, mobile-vs-desktop peek limits, and `h-full` cards.

Overwriting it with the prototype version would be a regression, so I left it
untouched. Tell me the specific layout change you want and I'll apply it as a
**targeted patch** to your current file rather than a wholesale replace.

---

## Quick test checklist

- [ ] Toggle Coach on **Outcomes** → **Why** and **How it works** flip too.
- [ ] Reload the page → the last-selected mode is remembered.
- [ ] Coach mode shows the quote call-out in the coda; Operator shows the
      italic line.
- [ ] No hydration warning in the console on first load.
- [ ] `npm run build` / `tsc` passes (no `lucide-react` import is new to the
      project; all icons used already exist in the package).
