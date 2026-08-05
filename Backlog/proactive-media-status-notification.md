# Proactive Media Status Notification — Design Capture

**Status:** Proposed. Not scoped for implementation. No code written. Item A
(the `deliveredTerminalIdsRef` reset-on-status-change bug) ships separately
as a small, contained fix — this document is Item B, the bigger piece.

**Date:** 2026-08-05

**Related:** `Backlog/voice-recording-interrupt-handling.md` — same
underlying architectural gap, different trigger. Worth designing together
rather than twice.

---

## The ask (Jeff, 2026-08-05)

Two related pieces:

1. **`MediaGallery.tsx`** — the screen where uploaded media is shown after
   upload, including retry for failed items. Currently disconnected from
   the live conversation entirely.
2. **`getMediaItems()` / the media pipeline generally** — when a
   `media_items` row's status changes to `ready` (whether from a first-time
   process or a retry), the system should actively tell the guide *right
   then* — "hey, this item's status has changed, it's now available to be
   discovered" — not wait passively for the next message in that
   conversation to stumble onto it.

This is a **push**, not a passive correction. Item A (shipping separately)
fixes the bookkeeping so a stale "already told the guide" flag doesn't block
a fresh update on the next message. This document is about not needing to
wait for a "next message" at all.

## Why this is "the same traffic cop" as the voice-recording design

Both problems have the identical shape: **something finishes asynchronously,
server-side, with no guarantee anyone is actively looking at the relevant
conversation when it happens** — and the system currently has no mechanism
to reach into that specific conversation and say something, regardless of
what the visitor is doing right now.

- Voice recording: the guide needs to reply into Conversation A after the
  person has already switched to Conversation B.
- Media status: the guide needs to reply into whatever conversation a
  `media_item` belongs to, whenever processing (or a retry) finishes —
  which could be seconds after upload, or much later if it went through a
  retry queue, regardless of what the visitor is doing at that moment.

Same missing piece in both cases: **a way to inject a message into a
specific conversation that isn't necessarily the one currently active in
the visitor's browser.**

## The confirmed gap, from the voice-recording investigation

`injectAssistantMessage` (`chatStore.tsx`) — the existing mechanism for
adding a guide reply without a network round-trip — only targets
`sessionIdRef.current`, the currently ACTIVE conversation. It cannot write
into a conversation the visitor isn't currently viewing. Confirmed via
direct code read on 2026-08-05, not assumed. This blocks both designs
identically.

## What's known to NOT work, already ruled out

- **Supabase Realtime** — confirmed non-functional for Heirloom specifically.
  Heirloom authenticates via Clerk, not Supabase Auth, so `auth.uid()` is
  always null and the Realtime `postgres_changes` subscription silently
  receives zero events. There's a documented client-side polling fallback in
  `chatStore.tsx`, but it only runs while the CURRENT conversation has
  something pending — it doesn't notice a status change in a different
  conversation, or one that finishes while the visitor isn't on the site at
  all.

## Open design questions, not yet answered

Same category of question as the voice-recording document, worth resolving
together rather than separately:

- Does "reach a specific, possibly-inactive conversation" need a genuinely
  new mechanism (server pushes into a message store directly, independent
  of any browser session being open), or can it build on/extend
  `injectAssistantMessage` if that function is generalized to accept an
  arbitrary session id instead of always using the current one?
- What happens if the visitor isn't on the site at all when a retry
  succeeds hours later? Does the message just wait in that conversation's
  history for whenever they return, or does this need an out-of-band
  notification too (push notification, email)? (Out-of-band notification is
  probably its own separate, larger scope — flag but don't assume it's
  included here.)
- For `MediaGallery.tsx` specifically: does retrying FROM the Gallery need
  to know which conversation the item originally belonged to (it should,
  via `media_items.chat_id`, already present) and route the resulting
  "hey, this is ready now" message there specifically?
- Should this apply to every status change, or only failure → ready (the
  case that actually matters — a first-time success already gets a live,
  synchronous reply as part of the normal chat turn; it's specifically the
  asynchronous, no-one's-watching case that's uncovered)?

## Not in scope for this document

No implementation plan. Both the mechanism gap (reaching an inactive
conversation) and the open questions above need answering — likely together
with the voice-recording design, since they'd probably share the same
underlying fix — before either is buildable.
