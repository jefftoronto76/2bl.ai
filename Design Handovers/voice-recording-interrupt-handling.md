# Voice Recording Interrupted by Conversation Switch — Design Capture

**Status:** Proposed. Not scoped for implementation. No code written. Captured
here so it isn't lost — the simpler "implicit cancel" behavior ships instead
in the 2026-08-05 media-pipeline fix PR 3 (`ChatInput.tsx` session-switch
reset); this is the richer version to pick up deliberately later.

**Date:** 2026-08-05

---

## The scenario

Someone is recording a voice memo in Conversation A. Mid-recording, they
switch to Conversation B (via the sidebar) without stopping or sending.

## What ships tomorrow instead (PR 3, simpler default)

Treat the switch as an implicit cancel: stop the recording, discard it,
clear the composer. Safe, small, unblocks three other confirmed bugs
shipping in the same fix plan. Not the desired long-term behavior — a
placeholder until this design is built.

## The actual desired behavior (Jeff, 2026-08-05)

Don't discard. Instead:

1. **Send whatever was captured** — stop the recording and submit the
   partial audio as if the person had hit send, rather than throwing it away.
2. **The guide responds in Conversation A** (the thread being left), not
   wherever the person has switched to.
3. **Leave it there** — don't force resolution now. The person picks it back
   up whenever they return to A.
4. **If the recording seems cut off mid-sentence**, the guide should say so
   conversationally in that reply — flag it gently, then let the person
   decide what to do (discard, retry, or just leave it as-is) rather than
   the system deciding for them.

## Why this isn't a small addition to PR 3 — the real gaps found

**1. `injectAssistantMessage` (the existing mechanism for adding a guide
reply without a network round-trip, `chatStore.tsx`) only targets
`sessionIdRef.current` — the currently ACTIVE conversation.** It has no
mechanism to write into a conversation the person has already left. This
design requires exactly that: replying into A while the person is in B.
Confirmed via direct code read, not assumed.

**2. This isn't instant.** Transcription (Deepgram) + a full chat completion
round-trip to generate the guide's reply take real seconds (multi-second
latencies observed in `audit_events` during the 2026-08-04 media-items
investigation). Genuine open question: does A's reply need to be fully
resolved before the switch to B is allowed to complete (which contradicts
"let them leave immediately"), or does it arrive asynchronously while
they're already in B (which requires solving gap #1 properly — writing to a
background/inactive session)?

**3. "Seems cut off mid-sentence" is a prompt-level judgment, not a code
check.** The client can't determine this from audio length or metadata
alone — it requires the guide itself to have instructions for recognizing
and gently flagging an abrupt-sounding partial transcript, similar in
spirit to the existing `ATTACHMENT IN PROGRESS`/`ATTACHMENT FAILED`
instructions in Heirloom's system prompt, but for a new case this prompt
doesn't currently cover at all.

## Open design questions, not yet answered

- Does the reply need to block the conversation switch, or arrive
  asynchronously into a background session? (Depends on solving gap #1.)
- If asynchronous: does the person get any indication *while in B* that
  something happened in A (a badge, a notification), or do they only find
  out by manually returning to A later?
- Does "send whatever was captured" apply to a genuinely tiny/silent
  recording (e.g., someone opens the mic and immediately switches away
  before saying anything)? Is there a minimum-duration threshold below
  which this reverts to a plain discard, or does even a near-empty
  recording get sent and responded to?
- What does the guide's prompt instruction actually need to say for the
  "possibly cut off" case — new `<process>` block, or an extension of the
  existing `ATTACHMENT IN PROGRESS`/`FAILED` guidance?

## Not in scope for this document

No implementation plan, no file-by-file breakdown (unlike the 2026-08-05
media-pipeline fix plan) — the open questions above need answering first.
