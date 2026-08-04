# Delivery states · Stop + regenerate · Thumbs and feedback

## STATUS: SHIPPED — this is no longer a spec

Implemented on `jefftoronto76/2bl.ai@main` in **`components/chat/`**, shared between the Heirloom
membership shell and the jefflougheed widget shell:

`DeliveryStatus.tsx` · `MessageActions.tsx` · `FeedbackPopover.tsx` · `ActionIconButton.tsx`
Wired in `components/shells/membership/MessageList.tsx`.

**The code is the source of truth. This document records only what is still open.**

The reference `.tsx` files that used to sit in this folder have been **removed** — the shipped
components are better, and keeping mine invited someone to "restore" a worse variant. Two places
the implementation beat the original spec, for the record:

- **Feedback is server-persisted** (`useMessageFeedback(sessionId)` → `/api/sessions/[id]/feedback`),
  and the route guards that a regenerated reply can never silently inherit the previous reply's
  rating. The spec treated rating as local UI state.
- **Copy is internal to each component** — own `copied` state, icon swaps to `Check` for 2s. The
  spec used an `onCopy` prop plus a global toast. No toast dependency is better.

`ActionIconButton` is deliberately **not** the membership `IconButton` — reusing that would cross
the widget/membership shell isolation boundary. Regenerate is passed only for the latest assistant
message. Stop generation is done.

---

## Open items

**1. Touch targets are 24×24.** Hit area is expanded invisibly
(`before:-inset-x-[1px] before:top-[-4px] before:bottom-[-12px]`), and the code itself comments that
this falls short of the 48px target and cannot close without a visible `gap` increase.

Design view: **take the gap increase.** These rows are sparse, a little more air costs nothing
visually, and 24px is genuinely hard to hit on a phone. `gap-0.5` → `gap-1.5` buys enough shared
space for the hit zones to reach ~44px without the icons themselves growing. Worth doing before
mobile ships, and cheaper now than after a bug report.

**2. Feedback is keyed by `messageIndex`, not message id.** `useMessageFeedback` and
`/api/sessions/[id]/feedback` both address a rating by the message's position in the array. Edit
truncation and regeneration both mutate that array on this same surface, so an index-keyed rating
can drift onto a message the visitor never rated.

The API route already reasons about one version of this problem — a regenerated reply must not
inherit the old rating — which suggests it is at least partly handled server-side. **We cannot tell
from the client whether truncation is covered too. Needs an engineering answer**, and if it isn't
covered, keying by message id is the fix.

**3. `@media (hover: none)` is on `UserMessageActions` but not `MessageActions`.** Harmless today:
the assistant row rests at `opacity-60`, so it is visible on touch. It becomes a real bug the
moment that row is ever changed to `opacity-0` to match the visitor row. Add the carve-out now,
cheaply, rather than rediscovering it later.

**4. No error state is designed for a failed feedback submission.** The popover closes optimistically
on Send. If the request fails the visitor is told nothing. Low stakes — but it is a silent failure,
and we have not decided whether that is acceptable.

**5. `FeedbackPopover` reason chips have not been checked at 375px.** Specified to wrap; unverified
on a device. Chip height should also go to 44px on touch, same as the story chips on the memory
card.

---

## Design intent worth preserving

- The assistant row rests at reduced opacity rather than hidden, because it holds the thumbs and a
  rating must be visible without hovering. The visitor row hides fully. **That asymmetry is
  deliberate** — don't "fix" it into consistency.
- `DeliveryStatus` renders nothing for `sent`. A persistent "sent" chip is noise once delivery
  succeeds.
- Thumb colours are fixed hex, not brand tokens — rating colour is a product convention, not
  something a tenant theme should recolour.
