# Audit — what's already on `main`

Read of `jefftoronto76/2bl.ai@main`, 2026-07-28. Checked against the three handoff packages
before rewriting them.

**Verdict:** packages 1 and 2 are **implemented and in production**, and in several places ahead of
what I specced. Package 3 (memories) is **not started**. Two of my documents are now
factually wrong and need correcting rather than reissuing.

---

## 1. `message_states_feedback` — implemented

Lives in **`components/chat/`**, not membership-local — shared between the Heirloom membership
shell and the jefflougheed widget shell.

| Spec item | Status | Notes |
|---|---|---|
| `DeliveryStatus.tsx` | ✅ | Renders nothing for `sent`. Failed row is a button with an expanded hit area (`before:-inset-y-4`). |
| Sending opacity 0.55 | ✅ | On the bubble, per the component's own doc comment. |
| Failed shake | ✅ | Shared `.chat-bubble-shake` in `app/globals.css`. |
| `MessageActions.tsx` | ✅ | Copy · Regenerate · version carousel · divider · thumbs. |
| Version carousel | ✅ | `versionIdx + 1/versionCount`, arrows disabled at bounds. |
| `Stopped` label | ✅ | In the row, as specced. |
| Thumbs, mutually exclusive, toggle off | ✅ | |
| `FeedbackPopover` | ✅ | |
| Suppress actions on the streaming message | ✅ | `isActive = isStreaming && isLast`. |

### Ahead of my spec — adopt these, don't revert them

- **Feedback is server-persisted.** `useMessageFeedback(sessionId)` + `/api/sessions/[id]/feedback`.
  My handoff treated rating as local UI state. The route also guards that *a regenerated reply can
  never silently inherit a rating that belonged to the previous one* — a correctness case I
  didn't specify.
- **Regenerate is scoped to the latest assistant message only.** `onRegenerate` is passed only when
  `isLast`. Sensible; my spec was silent on it.
- **Copy is internal to the components.** Each owns its own `copied` state and swaps the icon to
  `Check` for 2s. My reference components took an `onCopy` prop and relied on a global toast.
  **The implementation is better** — no toast dependency, feedback is local to the button.
- **`ActionIconButton`** is the real wrapper, deliberately *not* the membership `IconButton`, to
  avoid crossing shell isolation. My README named `IconButton` — wrong.

### Genuine gaps

- **Touch targets.** Buttons are **24×24** with an invisible hit-area expansion, and the code
  comments that this falls **short of the 48px target** and can't close without a visible gap
  increase. My spec said 34×34 on coarse pointers. Unresolved, and honestly documented in-code.
- **`@media (hover: none)` is absent from `MessageActions`.** The assistant row rests at
  `opacity-60`, so it's visible on touch — but `UserMessageActions` has the carve-out and this
  doesn't. Fine today; will matter if the assistant row ever goes to `opacity-0`.
- **Feedback is keyed by `messageIndex`, not message id.** With edit-truncation and regeneration in
  the same surface, an index-keyed rating can drift onto the wrong message. Worth a look — I can't
  tell from the client alone whether the server reconciles this.

### Couldn't verify
**Stop generation.** `stop` exists on `useChatSession` and `MessageActions` consumes a `stopped`
flag, so the state plumbing is there — but the Stop *control* isn't in the action row. It's
presumably in `ChatInput.tsx` (27KB, not read). Not a defect; just unconfirmed.

---

## 2. `visitor_message_actions` — implemented, and my spec is now out of date

| Spec item | Status | Notes |
|---|---|---|
| `UserMessageActions.tsx` | ✅ | Edit · Copy · Send again, right-aligned, `justify-end`. |
| Hover-gated, `opacity-0` at rest | ✅ | Plus `focus-within`. |
| `@media (hover: none)` always visible | ✅ | With a comment explaining it as the carve-out to the hover rule, not a violation. |
| `Edited` mono label, leading the row | ✅ | |
| `EditableUserBubble.tsx` | ✅ | Swapped in place; never renders alongside `DeliveryStatus`. |
| Mount only when `sent` and not editing | ✅ | Enforced by the caller, as specced. |
| Truncate-and-regenerate on edit | ✅ | `truncateAfter` added to `ChatEngineAccessors` 2026-07-27. |

### My visitor-bubble spec has been superseded

`spec_visitor_bubble.md` says `max-width: 76%`. Production is **`w-fit max-w-[90%]`**, widened
deliberately on 2026-07-28 because 76% *"read as cramped next to the assistant's much wider reply."*
**That call is correct — the doc is wrong, not the code.** I'll fix the doc.

Everything else in that spec landed: `w-fit`, `rounded-[18px]`, `rounded-br-[5px]`, `15.5/1.62`,
`bg-surface`/`border-border`, no shadow.

There's also a Chromium layout bug fixed there that no design doc would have caught: a percentage
`max-width` on a block descendant of an `align-items:flex-end` flex item resolves against an
indeterminate width, so "Hello" computed to ~72px and wrapped. Fixed by making the bubble the
direct flex item. Measured with Playwright against the real dev server. Two related notes worth
preserving: `flex-col items-end` (not a single-column grid, which stretches items to the widest
row's track), and the action row aligns at `ml-[60px]` — avatar 32 + gap 12 + bubble `px-4` — not
the naive 44.

### Ahead of my spec
**`showEdit` / `showResend` props.** A per-surface reduction so a shell can ship Copy-only. Was
used by the widget shell because truncating history there could silently discard a captured
NAME/EMAIL/PHONE or an offered booking card with no undo. Both surfaces have the full row again now
that `conversion_events` tracks the discard. Kept as a live escape hatch — this is real product
reasoning my handoff had no way to anticipate.

---

## 3. `memories` — not started

No `Bookmark` in any action row, no memory card, no `create_memory`, no sidebar counts. The only
`Bookmark` icon on main is in `SaveChatCTA` (save-conversation prompt — unrelated).

This is the package that still needs a full handoff. It should now be written **against the real
components**, which changes several things:

- The bookmark goes into the existing `MessageActions` and `UserMessageActions` in
  `components/chat/`, using `ActionIconButton` — not a new row.
- It must respect the shell-isolation boundary: shared components can't import membership-only
  code. A memory card is Heirloom-only, so the *card* belongs in the membership shell while the
  *bookmark* goes in the shared row — the shared row therefore needs an optional `onKeep` prop
  that the widget shell simply doesn't pass.
- The `keepDisabled`/suppression logic I specced assumed a client-side transcript array. Here the
  transcript is `useChatSession`, and memory cards would need to live as message-list entries or a
  parallel collection — **an architecture question I can't answer from the client code alone.**

---

## What I'll change in the handoff

1. **Rewrite packages 1 and 2 as "as-built + delta"** rather than proposals. Their value now is the
   three genuine open items (touch targets, index-keyed feedback, `hover:none` on the assistant
   row), not re-specifying what's shipped.
2. **Correct `spec_visitor_bubble.md`** to 90% and fold in the Chromium and alignment findings.
3. **Rewrite package 3 against the real component boundaries**, with the shell-isolation
   constraint and the transcript-architecture question stated as an unknown.
4. **Drop my `.tsx` reference components for 1 and 2.** Production versions are better; keeping
   mine invites someone to "restore" a worse variant.
