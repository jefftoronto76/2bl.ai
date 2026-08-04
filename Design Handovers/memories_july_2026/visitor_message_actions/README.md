# Handoff — Visitor (user) message actions

Adds **Edit / Copy / Send again** to the visitor's own messages in the chat composer transcript.
Previously only assistant messages carried an action row.

Source of truth: the prototype in `chat-widget.jsx` (`Bubble` component) inside
`Heirloom Lander - CURRENT.html`.

**Related packages:** `design_handoff_message_states_feedback` (the assistant-side action row
and delivery states these sit alongside) · `design_handoff_memories` (the bookmark action that
now leads the assistant row).

## What's in this bundle
- **`UserMessageActions.tsx`** — the three-action row under a user bubble.
- **`EditableUserBubble.tsx`** — the bubble in its editing state.
- **`useEditAndResend.ts`** — the two store handlers, with the sequencing that matters.
- This README.

`lucide-react` icons via the `IconButton` wrapper, semantic Tailwind tokens, no new deps.

---

## Behaviour

An action row appears **below** the user's bubble, right-aligned, on hover (always visible on
touch — see Mobile). Three actions, left to right:

| Action | Icon (lucide) | Behaviour |
|---|---|---|
| Edit message | `pencil` | Bubble is replaced in place by an auto-growing textarea holding the current text, caret at end. |
| Copy | `copy` | Copies message text to clipboard, fires the standard "Copied" toast. |
| Send again | `refresh-cw` | Re-delivers the same message and regenerates the reply. |

### Visibility rules
- Hidden while the message is in `sending` or `failed` state — the existing delivery-status row
  owns that space and must not collide with the actions.
- Hidden while the message is being edited.
- An `Edited` mono label appears at the **start** of the row once a message has been edited.

### Edit
- Enter saves · Shift+Enter newline · Esc cancels · explicit **Cancel** / **Send** buttons.
- Save is a no-op if the text is unchanged or empty.
- On save: the message content is replaced, **every message after it is truncated**, the message
  re-enters `sending`, and a fresh assistant reply is generated. This matches the mental model
  that editing rewrites history from that point forward.
- Any in-flight generation is cancelled first (interval cleared, streaming id nulled, cancel flag set).

### Send again
- Same truncate-and-regenerate flow as Edit, but with the text unchanged.
- Distinct from **Retry** on a `failed` message (tap the bubble) — that is a delivery retry and
  does not truncate.

---

## State contract

Message objects gain one optional field:

```ts
type UserMessage = {
  id: string
  role: 'user'
  content: string
  status: 'sending' | 'sent' | 'failed'
  edited?: boolean   // NEW — renders the "Edited" label
}
```

Two new handlers on the chat store:

```ts
editMessage(id: string, text: string): void   // replace content, truncate after, re-deliver
retryMessage(id: string): void                // truncate after, re-deliver unchanged
```

Both must: clear the stream interval, null the streaming id, set the cancelled flag, truncate
`messages` to `idx + 1`, then re-enter delivery on the next tick.

---

## Tokens

| Prototype var | App token |
|---|---|
| `--hl-surface` | `bg-surface` |
| `--hl-surface-2` | `bg-surface-muted` |
| `--hl-border` | `border-border` |
| `--hl-border-strong` | `border-border-strong` |
| `--hl-text` | `text-text-primary` |
| `--hl-muted` | `text-text-secondary` |
| `--hl-faint` | `text-text-tertiary` |
| `--hl-accent` / `--hl-accent-hover` | `bg-accent` / `hover:bg-accent-hover` |
| `--hl-on-accent` | `text-background` |
| `--font-body` | `font-body` (DM Sans) |
| `--font-mono` | `font-mono` (DM Mono) |

Action buttons: 28×28, radius 8, transparent → `text` @ 8% on hover. Icon 14px, stroke 1.75.
Edit textarea inherits body 15.5px / 1.62 so the text does not shift when the bubble becomes an input.

---

## Mobile

- The row is hover-gated on pointer devices. Under `@media (hover: none)` it is **always visible**
  and buttons grow to **34×34**. Still under the 44px guideline — if eng wants strict compliance,
  bump to 44×44 on coarse pointers and reduce the row to Edit + Copy, moving "Send again" into an
  overflow. Design's call: 34px is acceptable here because the actions are non-destructive and
  the bubble itself is the large retry target.
- Edit textarea: on mobile the keyboard covers the composer. Ensure the edit field scrolls into
  view on focus using the scroll container (never `scrollIntoView`).
- Truncation-on-edit is destructive-feeling on a small screen with no undo. Consider a confirm
  step on mobile only if user testing shows accidental edits.

---

## QA checklist

- [ ] Actions hidden during `sending` and `failed`; delivery row shown instead
- [ ] Edit → textarea prefilled, caret at end, auto-grows with content
- [ ] Enter saves, Shift+Enter newlines, Esc cancels
- [ ] Save with unchanged text is a no-op (no truncation, no regeneration)
- [ ] Save truncates all following messages incl. any memory cards
- [ ] "Edited" label persists after save and across reload
- [ ] Send again truncates and regenerates; does not duplicate the message
- [ ] Editing mid-stream cancels the in-flight reply cleanly (no orphan cursor)
- [ ] Touch: row always visible, targets ≥34px
