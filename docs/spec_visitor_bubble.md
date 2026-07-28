# Spec — the visitor (user) message bubble

Reference values from the prototype `Bubble` component in `chat-widget.jsx`.
Production at heirloom.2bl.ai does not currently match these — see **What's wrong** at the end.

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
| `max-width` (measure) | **76%** of the row | — |
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

## What's wrong in production

From the screenshot, four separate defects:

**1. The bubble isn't shrink-to-fit — the measure is far too small.**
"Hi how are you?" wraps after four words. That bubble is ~185px in a ~1040px column, about **18%**.
It should be `width: fit-content` with `max-width: 76%` — that sentence would then sit on one line.
This is the main defect and the one that makes the chat feel broken.

**2. No right gutter.** "Hello?" is flush against the panel edge. Guide rows get a 32px avatar rail
on the left; visitor rows need a matching **16px minimum** on the right.

**3. Radius and tail are wrong.** The production bubble reads as uniformly rounded at roughly 8px.
It should be **18px with a 5px bottom-right tail** — without the tail the bubble doesn't point at
its sender, and at 8px it reads as an input field rather than speech.

**4. Missing border, and the background is pure white.** Production looks like `#FFFFFF` with no
border. It should be `bg-surface` (`#FFFDF9`) with a **1px `border-border`** hairline. Pure white
on the cream canvas is too stark and is off-token.

Two smaller things worth checking while in there: the vertical gap above visitor bubbles looks
roughly double the gap above guide messages — it should be uniform at 20px — and the inset looks
bottom-heavy, which suggests padding is being set on a wrapper rather than the bubble itself.

---

## Sanity check

At the default drawer width, "Hi how are you?" at 15.5px DM Sans is ~112px of text. Plus 32px
inset = a **144px** bubble on **one line**. If that string wraps, the measure is wrong — nothing
else.
