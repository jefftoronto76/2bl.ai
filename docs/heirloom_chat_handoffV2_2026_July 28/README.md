# Heirloom chat — handoff index

Three packages, checked against `jefftoronto76/2bl.ai@main` on 2026-07-28.

| # | Package | Status |
|---|---|---|
| 1 | `design_handoff_message_states_feedback` | **Shipped.** Delivery states · stop + regenerate · thumbs and feedback. Open items only. |
| 2 | `design_handoff_visitor_message_actions` | **Shipped.** Edit · copy · send again. Open items only. |
| 3 | `design_handoff_memories` | **Not started.** Full specification. |

Supporting: `spec_visitor_bubble.md` (corrected) · `diff_memory_card_action_spine.md` ·
`audit_main_vs_handoff.md` (the read of main behind this index).

## Scope

**Front-end user experience.** What the visitor sees, what they can do, what state the interface
must hold.

**Out of scope:** storage, model routing, auth, media pipelines, cost, infrastructure. Where a
server or architecture decision changes the experience we've drawn, it appears as an *unknown* —
stated as one, not guessed at.

## Packages 1 and 2 are as-built notes, not specs

Both are implemented, and in several places the implementation is better than the spec was. The
reference `.tsx` files have been **deleted** — the shipped components supersede them, and keeping
mine invited someone to "restore" a worse variant.

What survives in those two packages is the part still worth an engineer's time: **the open items.**
Across both, four things are unresolved —

1. **Touch targets are 24×24**, acknowledged in-code as short of 48px. Recommendation: take the
   `gap` increase. Adding the memory bookmark makes the visitor row four targets, which is probably
   the forcing function.
2. **Feedback is keyed by `messageIndex`, not message id** — fragile alongside edit-truncation.
   Needs an engineering answer.
3. **`@media (hover: none)` is missing from the assistant row.** Harmless today, a bug the moment
   that row goes to `opacity-0`.
4. **Edit-truncation has no undo and no warning**, and is untested on mobile where the discarded
   content is off-screen.

Plus two smaller ones: no error state for a failed feedback submission, and `Edited` is shown
without any way to see the original.

## Package 3 is the one that needs building

Read its **§1 Known knowns / §2 Known unknowns** first. §2 is honest — where we don't have an
answer, it says so. The load-bearing ones:

- **Where a memory card lives in the transcript.** The prototype uses a tool message in a
  client-side array; production has no such array. Third message role, or parallel collection? We
  have no recommendation — the design only requires that the card sits in conversation order and
  disappears when truncated. **Decide before implementation, not during.**
- **Real tool-call latency.** The `running` state is designed for 1–3 seconds. 10+ makes it the
  wrong pattern entirely.
- **Tool-call failure.** No error state is designed, because we don't know whether failures are
  retryable, rate-limited, or silent.
- **Media handling.** Every media block on a typed card is a placeholder. Formats, limits,
  transcodes, thumbnails, transcription — unknown. "Check the transcription" assumes OCR exists.
- **The read-only bet.** A passage in the visitor's voice they cannot directly edit is the feature's
  biggest untested assumption.

## Three rules that cost us a live demo

1. **Never nag — but never go dead either.** A decline disarms the *offer* only. The manual bookmark
   is suppressed solely while streaming or while the newest card is open.
2. **Reconcile async state on load** — `running`, `draft`, `streaming`, `sending`. An unreconciled
   draft persists forever and takes all three creation paths with it.
3. **Nothing important is hover-only.**

## The prototype is ahead of these docs

`chat-widget.jsx` in the design project has a Tweaks panel (`chat-tweaks.jsx`) that switches a live
memory card between all five source types and three states. Use it to review the variants — it is
more current than any static description, including this one.
