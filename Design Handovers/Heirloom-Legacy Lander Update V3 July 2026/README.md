# Handoff: Legacy Lander + Story Chat — visual refresh

## Overview
This package hands off four design updates for the **Heirloom** product's marketing lander and its **Story chat** widget.

> **Product naming (read first):** the product is **Heirloom**, and lives under **`app/heirloom/`** in `jefftoronto76/2bl.ai`. **“Legacy” is a front-end brand rename only** — same product, presented as “Legacy” on this marketing surface. So: implement in **`app/heirloom/`** (lander components in `app/heirloom/components/landing/`, mounted via `app/heirloom/HeirloomApp.tsx`), and the shared chat drawer in **`components/shells/membership/`**. Wherever this doc says “Legacy,” read it as the Heirloom front-end brand, not a separate `app/legacy/` build.

The four updates:

1. **Foundations** — colours, fonts, borders (lander **and** chat widget)
2. **New hero** — the scattered “memory constellation” with a connecting thread
3. **The thread** — a page-spanning, scroll-drawn guide line
4. **The Book section** — the finished-books photograph as the centrepiece visual

It is deliberately split into **four passes with independent, verifiable milestones** so nothing gets lost in one big drop (see *Why staged* below).

## About the design files
The files in this bundle are **design references built in HTML/React (inline Babel)** — prototypes that show the intended *look*, not production code to paste in. Your job is to **recreate them in the existing Next.js 15 / React 19 / Tailwind / Mantine app**, using its established patterns (semantic Tailwind tokens, `lucide-react` via `IconButton`, `next/font`, `next/image`, the `components/shells/membership/` chat shell). Do **not** ship the HTML directly.

**Source of truth:** `Heirloom_Combined Lander v2.html` in this folder. It has a version switcher (bottom-centre) with three modes — **Format Fan / Constellation / Threaded Story**. *Constellation* + *Threaded Story* are the target design. `chat-widget.jsx` is the visual reference for the Story chat drawer.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, and motion are final. Recreate pixel-close using the codebase's own components and tokens.

## Why staged (please read)
The last handoff of the chat widget **did not land** — the deployed preview (`?preview=heirloom`) came through with the wrong palette and type (see the two screenshots the stakeholder attached: eggshell/gold instead of the terracotta Legacy palette, wrong empty-state treatment). The widget is **visually sensitive**, so:

- **Pass 1 is colours/fonts/borders only** and must be signed off **before** any structural work. Get the tokens right and the widget inherits them.
- For the chat widget specifically, **you only need the colours/type/borders** — behaviour already exists in the app. Do not rebuild chat behaviour; just make it *look* right under the Legacy palette.
- Each later pass is independently checkable, so we catch drift early.

## The four passes

| Pass | Scope | Doc | Milestone (how you verify) |
|---|---|---|---|
| 1 | Colours, fonts, borders — lander + chat widget | `pass-1-foundations.md` | Sample any surface/text/accent/border with a colour picker → matches the hex table. Chat drawer opens in Legacy terracotta, Cormorant empty state. |
| 2 | New constellation hero + **image handling** | `pass-2-hero.md` | Hero shows the photo/chrome collage with the curved connector; the 11 image slots are wired to real assets via `next/image`; nothing clipped. |
| 3 | The page thread | `pass-3-thread.md` | A dotted line draws down the page on scroll, hugging margins, waking beads at section transitions; static under reduced-motion. |
| 4 | The Book section photo | `pass-4-book.md` | Centrepiece card shows the finished-books photo full-bleed on the right, copy intact on the left; no crop of the book titles. |

Do them **in order**. Ship/verify Pass 1 first.

## Files in this bundle
- `Heirloom_Combined Lander v2.html` — **source of truth** (switch to *Constellation* / *Threaded Story*).
- `chat-widget.jsx` — Story chat drawer visual reference (colours/type/borders to match).
- `book-keepsake.png` — the finished-books photograph for Pass 4 (placeholder-grade AI render; swap for real photography when available).
- `pass-1-foundations.md` … `pass-4-book.md` — the specs (each opens with a **target-look screenshot**).
- `screenshots/` — target-look renders per pass (`pass-1-chat-widget.png`, `pass-2-hero.png`, `pass-3-thread.png`, `pass-4-book.png`).

## Global design tokens (canonical hex)
Full table + Tailwind mapping is in `pass-1-foundations.md`. In short: flat egg-shell base `#FAF6EE`, white cards, **terracotta accent `#C8542E`**, near-black text `#1A150F`, warm hairline `#E6DCC8`; **Cormorant Garamond** (display), **DM Sans** (body), **DM Mono** (mono/eyebrows), **Caveat** (handwritten notes in the hero only).
