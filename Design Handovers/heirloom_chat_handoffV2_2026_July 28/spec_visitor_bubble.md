# Spec — the visitor (user) message bubble

> **CORRECTED 2026-07-28.** This spec has been implemented, and one value in it was changed
> deliberately during implementation: the measure is now **90%**, not the 76% originally specced —
> 76% read as cramped beside the assistant's much wider reply. **The code is right; this doc was
> wrong.** Values below reflect production
> (`components/shells/membership/MessageList.tsx` → `MessageBubble`).

Terminology and values for the visitor message bubble.

---

## Terminology

Naming the parts, since these get confused in conversation:

| Term | What it means |
|---|---|
| **Row** | The full-width horizontal band one message occupies. Holds the bubble and nothing else. Right-aligned for the visitor, left-aligned (with an avatar rail) for the guide. |
| **Rail** | The 32px avatar column on guide rows. Visitor rows have no rail — but they need an equivalent **right gutter** so the bubble isn't flush to the panel edge. |
| **Bubble** | The rounded container around the text. Also called the container or the pill. |
| **Inset** (or padding) | Space between the bubble's edge and its text. Written vertical-first: `12px 16px` = 12 top/bottom, 16 left/right. |
| **Measure** | The maximum line length. Set with `max-width` as a percentage of the row. This is the value that controls where text wraps. |
| **Shrink-to-fit** | `width: fit-content` — the bubble is only as wide as its text, up to the measure. Without this a bubble is either full-measure always, or collapses too narrow. |
| **Tail** | The one corner with a small radius (5px) instead of the full 18px. Bottom-right for the visitor, bottom-left for the guide. It's what makes the bubble point at its sender. |
| **Leading** | Line spacing — `line-height`. Unitless multiplier of the font size. |

---

## The values

### Bubble

| Property | Value | Token |
|---|---|---|
| `max-width` (measure) | **90%** of the row | — |
| `width` | **`fit-content`** | — |
| `padding` (inset) | **12px 16px** | — |
| `background` | `#FFFDF9` | `bg-surface` |
| `border` | **1px solid** `#E8E0D2` | `border-border` |
| `border-radius` | **18px**, except the tail | — |
| `border-bottom-right-radius` (tail) | **5px** | — |
| `box-shadow` | **none** | — |

### Text

| Property | Value | Token |
|---|---|---|
| `font-family` | DM Sans | `font-body` |
| `font-size` | **15.5px** | — |
| `line-height` | **1.62** (≈25px) | — |
| `font-weight` | 400 | — |
| `color` | `#2B2620` | `text-text-primary` |
| `white-space` | **`pre-wrap`** — preserves the visitor's own line breaks | — |
| `text-align` | **left** — never centre or right-align the text inside the bubble | — |

### Row

| Property | Value |
|---|---|
| `justify-content` | `flex-end` |
| Right gutter | **16px** minimum — match the panel's horizontal padding |
| Gap between messages | **20px** (same as guide rows — the rhythm must be uniform) |
| Gap bubble → action row | **6px** |

### States

| State | Change |
|---|---|
| `sending` | `opacity: 0.55` |
| `failed` | Background `danger @ 10%` over surface · border `danger @ 45%` · shake 320ms · whole bubble becomes the retry target |
| `editing` | Bubble becomes a textarea at the **same 15.5 / 1.62** ramp so text doesn't reflow on the swap. Border goes to `border-border-strong`, padding to 12px all round, `max-width` to 86%. |

---

## Layout traps — all four are fixed, all four are easy to regress

Recorded because they were expensive to find and none is obvious from the CSS.

**1. Percentage `max-width` on a descendant of an `align-items:flex-end` flex item.**
Chrome hits an indeterminate sizing case and resolves it far narrower than the content needs — with
the shake animation on a wrapping div, "Hello" computed to ~72px and wrapped to two lines. **The
bubble must BE the flex item**; put the animation class directly on it, no wrapper.
Measured: 71.7×76.2 (wrapped) → 79.7×51.1 (one line).

**2. `flex-col items-end`, never a single-column grid.** A grid stretches every item to a shared
track sized to the widest row's max-content — usually the action row, not the bubble — so the
bubble's percentage resolves against the wrong width and the right edges don't align.

**3. The bubble needs `w-fit`.** Without shrink-to-fit it either fills the measure always or
collapses. `w-fit` + `max-w-[90%]` is the pair.

**4. Assistant action rows align at `ml-[60px]`,** not 44 — avatar 32 + gap 12 + the bubble's own
`px-4`. At 44 the row sits under the avatar instead of under the text.

---

## Sanity check

"Hi how are you?" at 15.5px DM Sans is ~112px of text; plus 32px inset that's a **144px** bubble on
**one line**. If that string wraps, the measure or the flex-item structure is wrong — nothing else.
