# Handoff: Delivery states, Stop/Regenerate, Thumbs + Feedback

## Overview
Three chat-interaction features from the CD brief, prototyped in `chat-widget.jsx` (Legacy lander) and `chat-v2.jsx` (Heirloom.html):

1. **Delivery state indicators** — sending → sent → failed, tap-to-retry.
2. **Stop generation + retry** — stop mid-stream, keep the partial response, regenerate with a version carousel.
3. **Thumbs up/down** — persistent rating + a reason-picker popover for both up and down.

## Fidelity
**Design reference, not a byte-for-byte diff.** Unlike the composer "+" handoff, this bundle doesn't diff against a production file we've read — `MessageBubble`/`ChatWindow` in `components/shells/membership/` weren't available to this session. What's included are three **new, self-contained components** (props-only, no store coupling) plus precise integration notes for where they splice into the existing message list and composer. Treat the components as ready to adapt; treat the integration notes as the spec.

## What's in this bundle
- **`DeliveryStatus.tsx`** — the sending/failed row under a user bubble.
- **`MessageActions.tsx`** — the action row under an assistant bubble: Copy, Regenerate, version prev/next + counter, thumbs up/down (opens `FeedbackPopover`).
- **`FeedbackPopover.tsx`** — reason-chip picker shown after either thumb is tapped.
- This README.

All three use `lucide-react` + the repo's semantic Tailwind tokens (`bg-surface`, `text-text-primary`, `text-text-muted`, `bg-accent`, `border-border`) and the existing `IconButton` wrapper. No new deps.

---

## 1 · Delivery states

**Message type addition:**
```ts
status?: 'sending' | 'sent' | 'failed'; // user messages only
```

**Flow:**
- On send, push the message with `status: 'sending'`.
- Attempt delivery (in the prototype: a timeout stand-in for the real network call). On success → `'sent'`. On failure → `'failed'`.
- `'sent'` renders **no indicator** — don't add persistent "Sent" chrome, it's noise.
- `'sending'` renders a small pulsing dot + "Sending…" under the bubble, bubble at reduced opacity.
- `'failed'` renders a red-tinted bubble outline, a shake on first appearance, and a "Not delivered · Tap to retry" row in `--danger` (repo: use the danger/red token, e.g. `text-red-600` or the project's `--hl-danger` equivalent if one exists in Tailwind config — confirm the token name before wiring).
- **Tap-to-resend:** tapping the bubble *or* the status row re-attempts delivery in place (no menu, no duplicate bubble). Retries always succeed (don't re-roll failure on a retry).

See `DeliveryStatus.tsx` for the row; the bubble-level border/shake/opacity styling is two conditional style branches on the existing bubble, not a new component.

---

## 2 · Stop generation + retry/regenerate

**Message type additions (assistant only):**
```ts
streaming?: boolean;
stopped?: boolean;       // true if the user hit Stop mid-stream
versions?: string[];     // all generated variants, oldest first
versionIdx?: number;     // which version is currently displayed
```

**Streaming:** reveal the reply incrementally (word-by-word in the prototype, ~30–40ms/word). Show a blinking caret at the end of the text while `streaming`.

**Stop button:** lives **in the composer**, replacing Send for the duration of the generation (both the "thinking" dots phase and the streaming phase) — not inline with the message. This keeps one predictable location instead of a button that jumps between message and composer.
```tsx
{isGenerating ? (
  <IconButton icon={Square} aria-label="Stop generating" onClick={onStop} />
) : (
  <IconButton icon={ArrowUp} aria-label="Send" disabled={!canSend} onClick={onSend} />
)}
```
`isGenerating = loading || !!streamingMessageId`.

**Stop behavior:** clears the interval/stream, sets `streaming: false, stopped: true`, and **keeps the partial content** — never discard what's already rendered. If Stop is hit before any tokens arrive (still in the "thinking" phase), cancel the in-flight request and just drop back to an empty composer with nothing added to the transcript.

**Regenerate:** available on any completed (non-streaming) assistant message via `MessageActions`. Fetches a new completion using the same context, appends it to `versions`, and re-streams it. A small "Stopped" label appears in the action row when `stopped` is true, so the user understands why the reply is short.

**Version carousel:** only appears once `versions.length > 1` — a `ChevronLeft` / `n · total` / `ChevronRight` triplet next to Regenerate. Arrows just swap which cached version is displayed; no re-fetch.

---

## 3 · Thumbs up/down + feedback reasons

**Message type additions (assistant only):**
```ts
rating?: 'up' | 'down' | null;
feedbackReasons?: string[];
feedbackNote?: string;
```

**Behavior:**
- Thumbs sit in `MessageActions`, always rendered at ~50% opacity, full opacity on row hover — not hidden entirely, so the affordance is discoverable without cluttering every message.
- Tapping a thumb sets `rating` immediately (icon fills + a quick pop animation) **and** opens `FeedbackPopover` anchored under that message, pre-scoped to that sentiment.
- Tapping the *same* thumb again clears the rating and closes the popover (toggle off).
- Thumbs up and thumbs down are mutually exclusive per message.
- Rating **persists** — it's not a fire-and-forget animation that disappears.

**Feedback popover (`FeedbackPopover.tsx`):**
- Reason chips differ by sentiment:
  - Up: *Felt personal · Great question · Nice pacing · Other*
  - Down: *Too generic · Off tone · Repetitive · Missed the point · Other*
- Multi-select chips + an optional one-line note.
- **Close (×)** top-right, **Skip** (dismiss, keep the rating, discard the draft reasons/note), **Send feedback** (persist `feedbackReasons`/`feedbackNote` on the message, toast confirmation, close).
- Closes on outside-click, `Escape`, or the × — same pattern as the app's other popovers.
- **Positioning gotcha we hit and fixed:** in a long/scrolled conversation, a popover that renders inline in the message list can mount outside the visible scroll area. On open, scroll its nearest scrollable ancestor so the popover is in view — don't rely solely on the transcript's bottom-pinned auto-scroll, which only fires on new messages, not on local UI state changes.

---

## Design tokens
| Role | Prototype `--hl-*` | Tailwind token |
|---|---|---|
| Danger (failed bubble, thumbs-down active) | `--hl-danger` (fallback `#B0432F`) | confirm repo's danger/red token |
| Action icon default | `--hl-muted` | `text-text-muted` |
| Action icon hover | `--hl-text` | `text-text-primary` |
| Rating active fill (up) | `--hl-accent-soft` / `--hl-accent` | `bg-accent-soft` / `text-accent` (confirm soft variant exists) |
| Popover surface | `--hl-surface` | `bg-surface` |
| Popover border | `--hl-border-strong` | `border-border` (strong variant) |
| Chip active | `--hl-accent` border/text | `border-accent text-accent bg-accent-soft` |

## Accessibility
- Delivery status row and failed bubble: `role="button"` + `tabIndex` when tappable for retry.
- Thumbs: `aria-pressed` reflecting `rating`.
- Version arrows: `disabled` at the ends of the array, not just visually dimmed.
- Feedback popover: `role` not strictly modal (doesn't block the page) but should trap `Escape` to close and return focus to the thumb that opened it.
- Respect `prefers-reduced-motion` for the shake/pop/blink animations.

## QA checklist
- [ ] Sending a message shows the pulsing "Sending…" row, then either clears (sent) or shows the failed state.
- [ ] Tapping a failed bubble resends in place and always succeeds on retry.
- [ ] Composer shows Stop for the full duration of generation (thinking + streaming), reverts to Send after.
- [ ] Stop keeps whatever text has streamed in; nothing is discarded.
- [ ] Regenerate adds a new version and the carousel counter appears once ≥2 versions exist.
- [ ] Thumbs are mutually exclusive, persist, and re-tapping the active one clears it.
- [ ] Feedback popover opens on either thumb, reasons are sentiment-specific, Skip vs. Send feedback both close it correctly.
- [ ] Feedback popover is always scrolled into view on open, even deep in a long conversation.
- [ ] All new icons resolve: Check, AlertTriangle, Square (stop), RefreshCw, ChevronLeft/Right, ThumbsUp/Down, Copy, X.
