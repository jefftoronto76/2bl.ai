# Handover — Lander nav: rename + link restructure

Scope: **lander only** (`app/heirloom/components/landing/`). No chat/message changes.

Source: `Heirloom Lander - Summer 2026 - Story Canvas.html`, `Nav()`.
Production file: `LandingNav.tsx` (full replacement, included in this folder — drop in as-is).

## Changes

1. **Wordmark "Legacy" → "Heirloom"** (+ `aria-label`). This reverts the
   earlier branding-only rename from `design_handoff_landing_update` — the
   nav now shows the real product name again.
2. **Nav links → How It Works / What You Can Make / Pricing.** "About" is
   removed.
3. **"Sign Up" ghost button removed.** "Start Your Story" stays, `OPEN_CHAT`
   dispatch unchanged.

## Target-id mapping (read carefully — not 1:1 with old labels)

| New label | targetId | Section |
|---|---|---|
| How It Works | `what-is-heirloom` | `WhatIsHeirloomSection` (Capture / Shape / Publish) |
| What You Can Make | `how-it-works` | `HowItWorksSection` (the book centerpiece — this section's id was never renamed when it was repurposed from "how it works" to "it becomes a book") |
| Pricing | `pricing` | `PricingSection` |

The mismatch between the label "What You Can Make" and its target id
`how-it-works` is pre-existing production debt, not something this change
introduces — flagging so whoever wires this doesn't assume a typo. Renaming
that section's id to something like `book` would be a trivial follow-up but
touches a file outside this scope; not done here.

## Not touched

Everything else on the lander (hero copy/position, section body copy edited
earlier this session, footer, other sections) — those are separate, already
live in the prototype, not re-covered by this handover. Chat/message UI is
out of scope entirely.
