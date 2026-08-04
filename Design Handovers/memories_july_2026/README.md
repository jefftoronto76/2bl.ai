# Heirloom chat — handoff index

Three packages, written against the prototype in `chat-widget.jsx`
(loaded by `Heirloom Lander - CURRENT.html`). Read them in this order — each assumes the one
before it.

| # | Package | What it covers |
|---|---|---|
| 1 | `design_handoff_message_states_feedback` | Delivery states · Stop + regenerate · Thumbs and feedback reasons. The assistant action row. |
| 2 | `design_handoff_visitor_message_actions` | Edit · Copy · Send again on the visitor's own messages. |
| 3 | `design_handoff_memories` | The memory object, the tool that creates it, the card, the rewrite-as-conversation flow, and the sidebar counts. |

## The shape of the thing

The chat has two action rows and one artifact.

- **Assistant messages** carry a row of icon actions: `bookmark` (keep as a memory) · copy ·
  regenerate · version arrows · thumbs. The bookmark leads because, in this product, *the guide's
  response is generally the opportunity to save something* — that's the whole motion.
- **Visitor messages** carry their own row: edit · copy · send again. Editing rewrites history
  forward from that point.
- **Memories** are neither — they are tool messages, rendered as cards, sitting in the same
  ordered transcript so they keep their place and truncate correctly.

## Three cross-cutting rules

**1. Never nag.** The guide offers to write a memory at most once per conversation, and any
decline or discard disarms it permanently. The persistent bookmark is always there instead.
Design will push back hard on anything that re-arms an automatic prompt.

**2. Reconcile async state on load.** Every one of these features has an in-flight state that,
if persisted and rehydrated, produces permanently stuck UI: a memory card frozen on
"Gathering this memory…", a message with an eternal blinking cursor, a bubble stuck on "Sending…".
On load, map `running → discarded`, `streaming → false`, `sending → failed`, and drop empty
orphaned assistant messages.

**3. Nothing important is hover-only.** This was a real bug across all three features. Every
action row is now always visible on coarse pointers. Any new affordance must clear the same bar.

## Mobile, in one place

The drawer goes full-width under 768px and the sidebar becomes an overlay behind a menu button.
Beyond that:

| Element | State | Action |
|---|---|---|
| All action rows | Fixed — visible on touch, 34×34 | Optional: 44px + overflow for strict compliance |
| Memory story chips | ~30px tall | **Raise to 44px on touch** |
| Memory card actions | ~300px wide at 375px | Verify Keep / Rewrite / Discard don't wrap; stack Discard if they do |
| Feedback popover chips | Wrap correctly, short targets | Raise to 44px on touch |
| Sidebar ⋯ menu | Small target on the overlay sidebar | Raise to 44px |
| Photo slots | Non-interactive, fine at 52px | Needs a camera/library picker path when upload ships — not drag-and-drop |
| Edit textarea | Keyboard can cover it | Scroll the nearest scrollable ancestor on focus; never `scrollIntoView` |

The **Rewrite flow is the best-behaved thing here on mobile** — because the card unmounts and the
interaction becomes ordinary chat, there is no modal or inline field fighting the keyboard.
Preserve that property; it is a design decision, not an implementation shortcut.

## Fidelity

These are **design references, not diffs against production**. `MessageBubble` / `ChatWindow` in
`components/shells/membership/` weren't available to the sessions that produced them. The
components are props-only and free of store coupling — adapt them. The behaviour specs, state
contracts, and QA checklists are the part to treat as authoritative.
