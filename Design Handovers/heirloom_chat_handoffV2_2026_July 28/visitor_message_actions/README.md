# Visitor message actions — Edit · Copy · Send again

## STATUS: SHIPPED — this is no longer a spec

Implemented on `jefftoronto76/2bl.ai@main`:
`components/chat/UserMessageActions.tsx` · `components/chat/EditableUserBubble.tsx`
Wired in `components/shells/membership/MessageList.tsx` (`MessageBubble`, `makeRenderUserMessage`).

Everything specced landed: hover-gated at `opacity-0` with `focus-within`, always visible under
`@media (hover: none)`, `Edited` label leading the row, bubble swapped in place for editing, never
rendered alongside `DeliveryStatus`, and truncate-and-regenerate on save via `truncateAfter`.

The reference `.tsx` files have been **removed** — the shipped components are better. This document
records only what is still open.

---

## Ahead of the spec: `showEdit` / `showResend`

A per-surface reduction letting a shell ship **Copy-only**. Used by the widget shell because
truncating history there could silently discard an already-offered booking card or an
already-captured NAME/EMAIL/PHONE, with no undo. Both surfaces have the full row again now that
`conversion_events` tracks that discard instead of losing it.

Real product reasoning the design spec had no way to anticipate. **Keep the escape hatch.**

---

## The visitor bubble spec was superseded, correctly

`spec_visitor_bubble.md` said `max-width: 76%`. Production is **`w-fit max-w-[90%]`**, widened
2026-07-28 because 76% read as cramped beside the assistant's much wider reply. **The code is right;
the doc was wrong and has been corrected.**

Three findings from that implementation, recorded because they are expensive to find and easy to
regress:

1. **A percentage `max-width` on a block *descendant* of an `align-items:flex-end` flex item hits an
   indeterminate sizing case in Chrome.** With the shake animation on a wrapping div, "Hello"
   computed to ~72px and wrapped to two lines. Fixed by putting the animation class directly on the
   bubble so it *is* the flex item. Measured with Playwright against the real dev server:
   71.7×76.2 → 79.7×51.1.
2. **`flex-col items-end`, not a single-column grid.** A grid stretches items to a shared track
   sized to the widest row — usually the action row — so the bubble's percentage resolved against
   the wrong width and the right edges didn't align.
3. **The assistant action row aligns at `ml-[60px]`** — avatar 32 + gap 12 + bubble `px-4` — not the
   naive 44, or it sits under the avatar instead of under the text.

---

## Open items

**1. Touch targets are 24×24.** Same issue and same recommendation as the assistant row — see the
sibling package. The visitor row is the more urgent of the two: it is fully hidden at rest, so on
touch it appears all at once with three small targets and no hover to disambiguate.

**2. Editing silently discards everything after the message, with no undo.** This is correct
behaviour — editing rewrites history forward — but the visitor gets no warning that a reply, or a
memory card, is about to disappear. Acceptable on desktop where the transcript is visible.
**Untested on mobile**, where the discarded content is usually off-screen and mis-taps are likelier.

Design view: don't add a confirm dialog by default — it would tax the common case. A better answer
is probably a brief undo affordance, but we have not designed one and have no data on how often this
happens. **Open.**

**3. The row grows to four actions once the memory bookmark lands.** Four 24px targets in a
right-aligned cluster, fully hidden at rest. At 375px that needs checking, and is probably the
forcing function for the gap increase in open item 1.

**4. `Edited` is shown but there is no way to see the original.** We tell the visitor a message
changed without offering the prior text — unlike assistant messages, which have a full version
carousel. Whether visitor messages need version history is **undecided**; flagged because the
asymmetry is currently invisible to the visitor.
