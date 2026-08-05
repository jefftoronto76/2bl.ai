# Handoff — Memories

Introduces the **memory** as a first-class object: the visitor shares something, the guide helps
shape it, and it gets kept as a passage that accumulates into a story.

Source of truth: the prototype in `chat-widget.jsx` (`MemoryCard`, `MemoryMedia`, `MemoryOffer`,
`MEMORY_KINDS`, `Sidebar`) inside `Heirloom Lander - CURRENT.html`.
A Tweaks panel (`chat-tweaks.jsx`) switches a live card between all five source types and three
states — use it to review the variants rather than reading them off this page.

**Scope of this document.** This is a **front-end user-experience** handoff. It specifies what the
visitor sees, what they can do, and what state the interface must hold. Server-side concerns —
storage, model routing, auth, media pipelines, cost — are **out of scope**; where they touch the
UX, they appear as *considerations*, flagged as such, not as instructions.

**Related packages:** `message_states_feedback` (the assistant action row the bookmark joins) ·
`visitor_message_actions` (edit truncation, which must also remove memory cards).

---

# 1. Known knowns

Things decided, built, and reviewed. Treat these as settled.

**The workflow.** Visitor shares → guide helps shape → kept as a memory. Three paths create one,
and **all three must stay alive**:

| Path | Trigger |
|---|---|
| Manual | A `bookmark` action on **every** message, guide and visitor alike, first in the action row. Always available, never disarmed. |
| Offered | The guide asks inline — "Write it up" / "Not yet" chips under its reply. Once per conversation. |
| Auto | The guide invokes the tool itself once enough has surfaced. |

**The card is typed by its source.** Five kinds — conversation, photo, video, audio, document —
each with its own eyebrow, running copy, media block, and type-specific actions.

**The action spine never changes.** `Keep this` first, `Rewrite` and `Discard` last, one line,
always. Type-specific actions sit on their own row above it. A visitor who has kept a photo memory
must recognise the footer of an audio one.

**The card is read-only, except its title.** No inline editing of the passage.
Revision happens through conversation. **Updated 4 Aug:** clicking `Keep this`
no longer swaps to a receipt — the same card re-renders with the title now
inline-editable (pencil icon) and, if the memory came from uploaded media, that
media shown as a filled thumbnail in the same row as the empty "add more" slots.

**Rewrite is a conversation, not a form.** Clicking it unmounts the card; the guide asks what
should change; the visitor answers in the composer; that reply re-runs the tool with the prior
draft as context.

**Four card states:** `running` → `draft` → `saved` | `discarded`.

**Photos on a card are a promise, not an upload.** Three dashed slots, non-interactive in v1,
shown only on kinds where media isn't already the hero.

**Sidebar counts.** One mark — accent bookmark + mono numeral — on conversation rows, story rows,
and a MEMORIES section. Counts are derived from the memory list, never stored.

**Copy voice.** First person, their words, warm and plain, 90–150 words. Never invents facts,
names, or places.

---

# 2. Known unknowns

Open questions. **We do not have answers to these** — they are listed so they get decided
deliberately rather than by accident during implementation.

### Product decisions we don't have
- **Can a conversation produce more than one memory?** The prototype allows exactly one automatic
  offer per conversation. Whether a long session that wanders into two distinct stories should
  surface a second card is undecided.
- **Can a saved memory be reopened and revised later?** The saved receipt links to a story view
  that does not exist yet. We don't know what that view is or whether it allows revision.
- **Is there an undo on Discard?** Currently no. Whether one is needed is untested.
- **Who else can see a memory?** Stories have collaborators and share links. We have not specified
  whether a memory inherits story permissions, or whether some memories stay private.
- **Can a memory be moved between stories after saving?** Not specified.
- **What happens when a visitor has no stories yet?** The card defaults to the first story in the
  list. The zero-story case is unhandled.

### UX questions we haven't tested
- **Does the automatic invocation feel like insight or intrusion?** Untested with real users. The
  turn-count threshold in the prototype is a placeholder, not a researched value.
- **Is "Keep this" the right verb?** Chosen for warmth over "Save". Not validated.
- **How does a visitor feel about a passage written in their voice that they cannot edit?**
  This is the single biggest untested assumption in the feature. Read-only-plus-Rewrite is a
  deliberate bet; we do not know it survives contact with users.
- **Does the visitor-message bookmark confuse the model of who authored the memory?** Added late,
  unvalidated.
- **How long is too long?** 90–150 words was chosen by eye against the card's proportions, not
  from reading behaviour.

### The architecture question we cannot answer

**Where does a memory card live in the transcript?** This is the biggest unknown in the package
and it blocks estimation.

The prototype models a memory as a **tool message** in the same client-side array as user and
assistant messages — which is what makes it keep its place in the conversation and get truncated
correctly when an earlier visitor message is edited.

Production does not have a client-side array. The transcript lives in `useChatSession`
(`services/chat/ui/v1/core/`), rendered through `ChatThread` with `renderUserMessage` /
`renderAssistantMessage` callbacks. There is no `renderToolMessage`, and `Message` has no
non-user/assistant role.

So a memory card is either:

- **a third message role** in the shared session store — keeps ordering and truncation for free,
  but changes a type used by two shells and the persistence layer; or
- **a parallel collection** keyed to a message id — leaves the transcript untouched, but we then
  own ordering, truncation, and reconciliation by hand, which is exactly where the prototype's
  four state bugs came from.

**We do not have a recommendation.** The design requires only that the card sits inline in
conversation order and disappears when the message it followed is truncated. Which of those two
shapes delivers that is an engineering call. **Please decide it before implementation, not during.**

### Things only the back end can answer
Listed as considerations, not requirements — flagging where a server decision will change the UX
we've drawn, so we can be consulted rather than surprised.

- **How long does the tool call actually take?** The `running` state is designed for roughly 1–3
  seconds. If real latency is 10+, that pill is the wrong pattern and we should redesign it as a
  backgrounded task with a notification. **We need a real number.**
- **Can the tool call be cancelled?** The running state has no cancel affordance because we don't
  know if cancellation is possible. If it is, it needs one.
- **What is the failure mode?** No error state is designed for a failed tool call, because we don't
  know whether failures are retryable, rate-limited, or silent. **This is a real gap** — the QA
  checklist cannot cover it.
- **Media handling.** Every media block on a typed card is a placeholder. We don't know formats,
  size limits, transcode behaviour, thumbnail availability, or whether transcription exists for
  audio and video. The `document` card offers "Check the transcription" on the assumption that
  OCR happens; **that assumption is unverified.**
- **Is the passage generated once or on demand?** Affects whether Rewrite is cheap or expensive,
  and therefore whether we should discourage repeated use.
- **Ordering and pagination.** The sidebar MEMORIES list is unbounded in the prototype. At 200
  memories it needs a different design. We don't know the expected volume.

### Known gaps in what we've built
- Type-specific actions ("Who's in this?", "Choose a still", "Check the transcription") are
  **specified but not built** — they fire a toast. Their flows are undesigned.
- The story view the saved receipt links to does not exist.
- No empty state for a story with zero memories.
- No design for a memory that fails to generate.
- Mobile is specified but **not tested on a real device**.

---

# 3. The object

```ts
type Memory = {
  id: string
  title: string        // 2–6 words, evocative, chapter-like
  passage: string      // 90–150 words, FIRST PERSON, their voice
  kind: MemoryKind     // drives the card's whole presentation
  sessionId: string    // the conversation it came from
  storyId: string      // the story it was filed into
  photos: Photo[]      // empty at creation
  createdAt: string
}

type MemoryKind = 'conversation' | 'photo' | 'video' | 'audio' | 'document'
```

In the transcript a memory is a **tool message**, not a chat bubble — it sits in the same ordered
list so it keeps its place and truncates correctly when an earlier message is edited.

```ts
type MemoryToolMessage = {
  id: string
  role: 'tool'
  kind: 'memory'
  kindKey: MemoryKind
  state: 'running' | 'draft' | 'saved' | 'discarded'
  title?: string
  passage?: string
  storyId?: string     // set on save
}
```

---

# 4. The five kinds

| Kind | Eyebrow | Running copy | Media block | Type actions | Photo slots |
|---|---|---|---|---|---|
| `conversation` | A memory, written up | Gathering this memory… | — | — | yes |
| `photo` | A photograph, remembered | Looking at this photograph… | 16:10 image | Who's in this? · Add another | no |
| `video` | A moment on film | Watching this back… | 16:9 + play + duration | Choose a still | no |
| `audio` | In your own voice | Listening to this… | play + waveform + duration | Keep the recording | yes |
| `document` | From your papers | Reading this over… | paper-tinted page + page count | Check the transcription | yes |

Icons: `feather` · `image` · `video` · `mic` · `file`. The kind's icon is used in all three
places it appears — running pill, card header, saved receipt.

Photo slots appear only where media isn't already the hero.

---

# 5. Card states

### `running`
Pill on the assistant rail: pulsing kind icon + the kind's running copy. Radius 99, surface
background, 1px border. No cancel — see unknowns.

### `draft`
Card, max-width 520, radius 16, 1px `border-strong`, shadow `0 18px 44px -26px`.
Enters with a 260ms rise (opacity + 10px + 0.98 scale).

Order: header (kind icon + eyebrow) → media block, if the kind has one → title → passage →
photo slots, if the kind has them → "Keep it in" story chips → footer.

Footer is two rows: type-specific actions above (smaller, allowed to wrap), then the spine
(`Keep this` · `Rewrite` · `Discard`, `nowrap`, never reordered).

### `saved`
Collapses to a slim receipt: kind icon in an accent-soft circle + title + "Kept in {story}".
Whole row is a button to the story view.

### `discarded`
A single faint mono line: "Memory discarded". Dropped entirely on reload.

---

# 6. State rules that broke in production

These are not theoretical. Each one shipped, and together they made the feature look deleted
during a live demo.

**1. `[]` is truthy.** `saved.memories || SEED` silently discards the fallback once an empty
list persists. Check length.

**2. Reconcile every async state on load.** Map `running → discarded`, **`draft → discarded`**,
`streaming → false`, `sending → failed`; drop empty orphaned assistant messages; **drop
`discarded` cards entirely.** An unreconciled `draft` persists forever and takes all three
creation paths down with it.

**3. Scope the suppress-while-open flag to the newest card.** Computing it across the whole
transcript means one stale draft anywhere silences the bookmark everywhere, permanently.

**4. `hasMemory` must ignore `discarded`.** Otherwise a single "Not yet" disarms the offer and
the auto-invocation for the life of the conversation.

**Rule:** never nag — but never go dead either. The manual bookmark is suppressed only while
streaming or while the newest card is open. Nothing else may hide it.

---

# 7. Where this attaches in the real codebase

Read of `main` on 2026-07-28. Nothing in this package is implemented yet; packages 1 and 2 are.

**The bookmark goes into the existing action rows, not a new one.**

| Add | To | Using |
|---|---|---|
| Bookmark, first in the row | `components/chat/MessageActions.tsx` | `ActionIconButton` |
| Bookmark, first in the row | `components/chat/UserMessageActions.tsx` | `ActionIconButton` |
| The card, the offer chips | `components/shells/membership/` | membership-local |
| Sidebar counts | `components/shells/membership/v2/SidebarV2.tsx` | |

**Shell isolation constrains this.** `components/chat/` is shared with the jefflougheed widget
shell, which has no memories and no stories. So:

- The shared rows take an **optional `onKeep`** that the widget shell simply doesn't pass — the same
  pattern already used for `onRegenerate` and for `showEdit` / `showResend`.
- The **card must not live in `components/chat/`**. It is Heirloom-only and depends on stories.
- Use `ActionIconButton`, **not** the membership `IconButton` — that import would cross the
  boundary. (An earlier version of this handoff named `IconButton`. Wrong.)

**Inherit the conventions already established there,** rather than the ones in this document:
copy state lives inside the component with a 2s `Check` swap; per-message actions are suppressed on
the streaming message via `isActive = isStreaming && isLast`; rows align at `ml-[60px]` on the
assistant side.

**One inherited problem.** Message feedback is keyed by `messageIndex`, not message id. If memories
are stored as a parallel collection keyed by position, they inherit the same drift under truncation.
Key by message id.

# 8. Tokens

| Element | Value |
|---|---|
| Card radius / max-width | 16 · 520 |
| Card shadow | `0 18px 44px -26px var(--hl-shadow)` |
| Title | `font-display` 23 / 1.16 / 500 / `-.01em` |
| Passage | `font-body` 14.5 / 1.68 / `text-secondary` |
| Eyebrow | `font-mono` 10 / `.16em` / uppercase / `text-tertiary` |
| Photo slot | 52 square, radius 10, 1px dashed `border-strong`, `bg-surface-muted` |
| Story chip | radius 99, 6×12, 12.5 / 500 · accent-soft when active |
| Type action | radius 9, 7×11, 12 |
| Spine primary | accent, radius 9, 8×16, 12.5 / 600 |
| Sidebar count | `font-mono` 10.5, accent, `bookmark` 11 |

`--hl-*` → semantic Tailwind: `--hl-surface`→`bg-surface`, `--hl-surface-2`→`bg-surface-muted`,
`--hl-border`→`border-border`, `--hl-text`→`text-text-primary`, `--hl-muted`→`text-text-secondary`,
`--hl-faint`→`text-text-tertiary`, `--hl-accent`→`bg-accent`, `--hl-on-accent`→`text-background`.

---

# 9. Mobile

Specified, **not device-tested**.

| Element | Action |
|---|---|
| Action rows | Production ships **24×24** with invisible hit-area expansion — short of 48px, acknowledged in-code. Adding the bookmark makes the visitor row four targets; this is probably the forcing function for a `gap` increase. |
| Story chips | Raise to 44px on touch |
| Card footer | ~300px content at 375px — verify the spine holds on one line |
| Photo slots | Fine at 52px; needs a camera/library path when upload ships, not drag-and-drop |
| Media blocks | Aspect-ratio based, should scale — unverified |

The **Rewrite flow is the best-behaved thing here on mobile**: the card unmounts and the
interaction becomes ordinary chat, so no modal or inline field fights the keyboard. That is a
design decision, not an implementation shortcut. Preserve it.

---

# 10. QA checklist

- [ ] Bookmark on **every** message, guide and visitor; accent-active after 3 exchanges
- [ ] Bookmark suppressed **only** while streaming or while the newest card is open
- [ ] Offer chips appear once, after streaming completes, never after "Not yet"
- [ ] Auto-invocation fires once; a discarded card does **not** disarm it
- [ ] All five kinds render their own icon, eyebrow, running copy, media block, type actions
- [ ] Photo slots absent on photo and video
- [ ] Spine on one line, in order, for every kind at every width
- [ ] Card read-only — no inline editing
- [ ] Rewrite unmounts the card, guide asks in chat, next reply re-runs with prior context
- [ ] Keep this → receipt with the kind's icon; sidebar counts increment on conversation **and** story
- [ ] Reload mid-generation leaves no stuck card, no orphan cursor, no stack of discarded lines
- [ ] Empty memory list still shows seeded/derived counts correctly (the `[]` bug)
- [ ] Editing an earlier visitor message truncates any memory card after it
- [ ] Touch: action rows visible, spine unbroken at 375px

**Not coverable yet:** tool-call failure, cancellation, real latency, media upload, the story view.
See §2.
