# Chat Widget Handover — Inline Hero + Overlay (vs `main`)

Scope: `components/shells/widget/WidgetShell.tsx` (`WidgetShellHero` = inline
chat, `WidgetShellChat` = the `#chat` CTA + full-screen overlay) and
`app/(jefflougheed)/globals.css`. Also touches `SectionRail.tsx` (one small,
tightly-coupled behavior change). Grounded in `jefftoronto76/2bl.ai@main` as
read directly from GitHub this session — every diff below is a real, verified
delta, not a guess.

**Files in this folder:**
- `WidgetShell.patched.tsx` — full replacement for
  `components/shells/widget/WidgetShell.tsx`. Same imports, same capability
  wiring (`makeRenderAssistantMessage`/`makeRenderUserMessage`,
  `MessageActions`, `DeliveryStatus`, `useChatSessionContext`,
  `useWidgetShell`, `useMessageFeedback`, `useKeyboardViewport`) — **nothing
  removed** — only the visual/structural deltas below are applied.
- `globals.css.patch.css` — CSS to append to (or merge into) the real
  `app/(jefflougheed)/globals.css`. Additive + a few overridden rules; nothing
  in the base file needs deleting.
- `SectionRail.patched.tsx` — one-line behavior change (see below).

---

## What changed, and why

### 1. `.stage` idle padding
`92px clamp(20px,5vw,48px) 120px` (was `52px clamp(20px,5vw,48px) 0`) —
`min-height:100dvh` instead of a fixed `height`. More breathing room top and
bottom before the visitor engages.

### 2. Hero type scale
`h1`: `clamp(48px,8vw,96px)` (was `clamp(36px,4vw,56px)`) — much larger
headline. `margin-bottom` back to `16px` (was `32px`).
`.lede`: `clamp(20px,2.4vw,28px)` (was fixed `20px`).
`.sage-line`: `14px` (was `18px`).

### 3. Collapse (×) button — mounting + position
**Before (main):** `.close-x` is an always-mounted CSS-class button,
`position:absolute; top:0; right:0`, opacity animated in via
`.stage.engaged .hero .close-x{opacity:1}`.
**After (this patch):** conditionally rendered only when `isEngaged` (no
mount when idle), inline-styled, `position:absolute; bottom:0; right:0`.
Simpler, no idle DOM node, different corner.

### 4. Engaged layout mechanism
**Before (main):** `.stage.engaged .hero` becomes `position:sticky; top:60px`;
`.chat-surface{display:contents}` wraps conversation+composer with no
explicit grid.
**After:** `.stage.engaged{display:grid; grid-template-rows:auto 1fr auto}`
— hero/conversation/composer become explicit grid rows 1/2/3. Removes the
sticky-positioning approach entirely for desktop.

### 5. `.hero-conversation` — cream card treatment
**Before (main):** no visual chrome at all (`overflow-y:auto` only) — messages
float directly on the page background.
**After:** full card: `background:rgb(245 244 240); border:1px solid
rgb(24 32 41/.12); border-radius:18px; padding:20px 20px 22px;
box-shadow:0 8px 32px rgba(0,0,0,.05); gap:20px` (idle state too, not just
engaged). Locally re-scopes `--color-text-primary`/`--color-text-muted`/
`--color-border` back to dark ink inside this card (and `.chat-overlay-log`),
same trick `globals.css` already uses for `#outcomes`/`#how-it-works`/
`#testimonials` — needed because the page-level `data-brand="jefflougheed"`
token is light/cream, but this card's background is light too.

### 6. `.composer` shadow + accent
Shadow strengthened to `rgba(0,0,0,.18)` (was `.05`). Added a `sage-glow`
accent variant (`box-shadow: 0 0 0 1px rgb(var(--color-accent)/.25), 0 8px
32px rgb(var(--color-accent)/.18)`, brighter on `:focus-within`) and applied
it to the Hero composer by default.

### 7. Overlay composer — reuses the `.composer` component
**Before (main):** the overlay's bottom bar is a bespoke Tailwind-only
element (`textarea` + circular send button + a caption line), no AI badge, no
meta row, no new-conversation control inside the overlay footer itself.
**After:** overlay composer reuses the exact same `.composer`/`.meta`/
`.ai-badge`/`.new-convo-link`/`.send-hint` markup as the Hero composer, so
both surfaces look identical.

### 8. Overlay chrome — custom classes instead of Tailwind utilities
`#chat` CTA section and the whole `.chat-overlay-*` tree now use dedicated
CSS classes (`chat-cta`, `chat-cta-inner`, `chat-cta-btn`,
`chat-overlay-header`, `chat-overlay-log`, `chat-overlay-greeting`,
`chat-overlay-composer`, etc.) instead of inline styles / Tailwind utility
strings. Copy is unchanged; sizing/padding/colors follow the values in
`globals.css.patch.css`, which in a few places differ from the inline-style
values on `main` (e.g. `#chat` section padding `96px` vs `64px`,
`.chat-cta-btn` gets `border-radius:2px` where main's button had none).

### 9. `MessageActions` icon color inside the light cards
`text-text-primary` was resolving to the page-level cream token (see §5)
before that card-level re-scope existed. Added a small, deliberately
hardcoded escape hatch, `.msg-action-ink{color:rgb(24 32 41)!important}`,
applied to `MessageActions`' icon buttons — belt-and-suspenders on top of the
token re-scope in §5, in case another dark-mode-aware Tailwind class wins the
cascade first.

### 10. `MessageActions` at-rest visibility
Container opacity `0.9` at rest (was `0.6`), full on `.group:hover`. Icon
color is the same (`.msg-action-ink`) at rest and hover — no separate dimmed
state.

### 11. `SectionRail` — stays visible during engaged/expanded chat
**Before (main):** `if (isExpanded || heroEngaged) return null` — the rail
hides itself the moment the visitor engages Hero or opens the overlay.
**After:** that early return is removed; the rail is always rendered,
including while chat is open. `SectionRail.patched.tsx` is a one-line diff.

---

## Explicitly NOT changed
Everything else in `WidgetShell.tsx` is untouched: `useChatSessionContext`,
`useWidgetShell`, `useMessageFeedback`, `useKeyboardViewport`,
`makeRenderAssistantMessage`/`makeRenderUserMessage` (incl. `MessageActions`/
`DeliveryStatus`/booking-card extraction/regenerate/version-switch/feedback),
`ChatThread` wiring, mobile keyboard-viewport handling
(`chat-surface--kb`), escape-to-close, body-scroll-lock, mode-bridge for
`SectionProcess`'s `expand('question')`. Do not re-simplify any of this when
applying the patch.
