# Handoff — Memories

Introduces the **memory** as a first-class object: the guide shapes a conversation into a written
passage, the visitor keeps it, and it accumulates into a story.

Source of truth: the prototype in `chat-widget.jsx` (`MemoryCard`, `MemoryOffer`, `Sidebar`)
inside `Heirloom Lander - CURRENT.html`.

**Related packages:** `design_handoff_message_states_feedback` (the assistant action row the
bookmark joins) · `design_handoff_visitor_message_actions` (edit truncation, which must also
remove memory cards).

## What's in this bundle
- **`types.ts`** — `Memory`, `MemoryToolMessage`, `Story`.
- **`MemoryCard.tsx`** — all four card states.
- **`MemoryOffer.tsx`** — the inline "Write it up / Not yet" chips.
- **`SidebarMemoryCount.tsx`** — the one count mark, used in three places.
- **`createMemory.ts`** — the archivist system prompt and the tool call.
- This README.

`lucide-react` icons, semantic Tailwind tokens, no new deps.

---

## The object

```ts
type Memory = {
  id: string
  title: string        // 2–6 words, evocative, chapter-like
  passage: string      // 90–150 words, FIRST PERSON, their voice
  sessionId: string    // conversation it came from
  storyId: string      // story it was filed into
  photos: Photo[]      // empty at creation — filled later
  createdAt: string
}
```

In the transcript a memory lives as a **tool message**:

```ts
type ToolMessage = {
  id: string
  role: 'tool'
  kind: 'memory'
  state: 'running' | 'draft' | 'saved' | 'discarded'
  title?: string
  passage?: string
  storyId?: string     // set on save
}
```

---

## Three ways a card surfaces

1. **Persistent** — a `bookmark` action in the action row of **every** assistant message.
   Always available. Goes accent-active (`suggestKeep`) once 3+ exchanges have happened, and the
   whole action row stops dimming, so the guide signals "there's something here" without interrupting.
2. **Offered** — at the 3rd exchange the guide appends inline chips under its reply:
   **Write it up** / **Not yet**.
3. **Tool-invoked** — the guide calls `create_memory` itself. In the prototype this is a
   turn-count heuristic (5+ exchanges, nothing kept). **In production this is a real tool in the
   model's tool list** — the model decides the moment. The card, states, and save path are
   identical either way.

**Arming rule:** #2 and #3 fire at most once per conversation. Any tool message in the transcript,
or an explicit Discard / "Not yet", disarms them permanently for that conversation. #1 is never
disarmed. This is deliberate — the product must never nag.

---

## Card states

### `running`
Compact pill on the assistant rail: pulsing `sparkles` + "Gathering this memory…". Radius 99,
surface background, 1px border. No actions — not cancellable in v1.

### `draft`
Full card, max-width 520, radius 16, 1px `border-strong`, shadow `0 18px 44px -26px`.
Enters with `hl-modal-in` (opacity + 10px rise + 0.98 scale, 260ms).

- **Header** — 11×16 padding, bottom border: `bookmark` 12px accent + mono eyebrow "A MEMORY, WRITTEN UP"
- **Title** — display serif (Cormorant Garamond) 23/1.16, weight 500
- **Passage** — body 14.5/1.68, `text-secondary`, `text-wrap: pretty`
- **Photos** — mono eyebrow + "— add them whenever you find them", then 3 × 52px dashed slots,
  radius 10, `image-plus` glyph. **Non-interactive in v1** — they are a promise, not an upload.
- **Keep it in** — story chips, pill, single-select, accent-soft when active. Defaults to first story.
- **Actions** — `Keep this` (accent, bookmark icon) · `Rewrite` (ghost) · `Discard` (borderless,
  right-aligned, → danger on hover)

The card is **read-only**. Title and passage cannot be edited inline — revision happens through
conversation (see Rewrite).

### `saved`
Card collapses to a slim receipt: accent check in a soft circle + title (display 15.5) +
mono sub-line "Kept in {story name}". Whole row is a button → story view. Hover raises border.

### `discarded`
A single faint mono line: "Memory discarded". Nothing else. No undo in v1.

---

## Rewrite — the important interaction

Rewrite is **not** a form. Clicking it:

1. **Unmounts the card entirely** from the transcript.
2. The guide picks the thread back up as a normal streamed assistant message:
   *"Of course — it's yours, not mine. Tell me what you'd like changed: where it should begin,
   what to leave out, or anything that doesn't sound like you."*
3. The visitor answers **in the composer**, like any other message.
4. That reply routes to `create_memory` instead of a normal completion — the running pill appears
   and a fresh card mounts with the revision.

The previous draft is passed to the model as context so it **revises rather than starts cold**.
Implementation: a `rewritePending` ref holding `{title, passage}`; the delivery handler checks it
before calling the normal reply path and clears it.

---

## The model call

Two distinct system prompts. The **guide** (conversational, one question at a time) is unchanged.
The **archivist** is new:

- First person, their voice, **only details they actually gave** — never invent facts, names, places
- Warm, plain, unhurried. 90–150 words. No markdown, no lists
- Returns strict JSON: `{"title": "...", "passage": "..."}`
- Title is 2–6 words, evocative and plain — a chapter name, not a headline

Parse defensively (the prototype regex-extracts the first `{...}` block) and fall back gracefully.

---

## Sidebar

Three additions, all sharing one visual mark: **accent `bookmark` 11px + mono 10.5px numeral**.

1. **Conversation rows** — rows holding memories get the mark left of the ⋯ menu; right padding
   grows 34 → 58. Rows with none stay clean, so marked rows are the signal.
2. **Story rows** — same mark, right-aligned.
3. **MEMORIES section** — appears only when memories exist. Eyebrow + `bookmark` + total count at
   right. Rows: accent check + title in display serif, truncated, tooltip shows the story.

Counts derive from the memory list, not stored separately:
`memories.filter(m => m.sessionId === id).length` and the same on `storyId`.

**Live conversations:** a memory saved before the conversation is archived tags
`sessionId: 'live'` and is remapped to the real session id when the conversation is archived.
In production, sessions have ids from the start and this is unnecessary.

---

## Persistence & reconcile

Memories persist with the transcript. **On load, reconcile async states** — otherwise a reload
mid-generation leaves permanently stuck UI:

- `role === 'tool' && state === 'running'` → `discarded` (or a retryable error state)
- `streaming: true` → `streaming: false`
- `status: 'sending'` → `failed` (tappable retry)
- drop empty orphaned assistant messages

---

## Tokens

Same map as the message-actions handoff. Memory-specific:

| Element | Value |
|---|---|
| Card radius | 16 |
| Card shadow | `0 18px 44px -26px var(--hl-shadow)` |
| Card max-width | 520 |
| Title | `font-display` 23 / 1.16 / 500 / `-.01em` |
| Passage | `font-body` 14.5 / 1.68 / `text-secondary` |
| Eyebrow | `font-mono` 10 / `.16em` / uppercase / `text-tertiary` |
| Photo slot | 52×52, radius 10, 1px dashed `border-strong`, `bg-surface-muted` |
| Chip | radius 99, 6×12, 12.5 / 500 |
| Sidebar count | `font-mono` 10.5, accent |

---

## Mobile

The drawer is full-width under 768px and the sidebar becomes an overlay behind a menu button.
Specific to memories:

- **Card width** — `max-width: 520` plus the 44px assistant rail indent. On a 375px screen the card
  is ~300px wide. Verify the three action buttons (Keep this / Rewrite / Discard) do not wrap;
  if they do, stack Discard onto its own line rather than shrinking the primary.
- **Action row** — the bookmark on assistant messages is hover-gated on desktop. Under
  `@media (hover: none)` action rows are **always visible** and buttons grow to 34×34.
  The bookmark is the most important action in the row and must never be hover-only.
- **Story chips** — wrap to 2 lines on narrow screens; already `flex-wrap`. Verify tap targets:
  currently ~30px tall, **should be raised to 44px on touch**.
- **Photo slots** — non-interactive, fine at 52px. When upload ships, they become the drop target
  and need a mobile-native picker path (camera / library), not drag-and-drop.
- **Sidebar counts** — the count sits at `right: 32` next to the ⋯ button. On the mobile overlay
  sidebar this is unchanged, but the ⋯ target should be ≥44px there.
- **Rewrite flow** — this is the strongest part on mobile: the card unmounts and the interaction
  becomes plain chat, which is already fully mobile-native. No modal, no inline field fighting
  the keyboard. Preserve this.

---

## QA checklist

- [ ] Bookmark action present on every assistant message; accent-active after 3 exchanges
- [ ] Offer chips appear once, at the 3rd exchange, and never again after "Not yet"
- [ ] Auto-invocation fires once and is disarmed by Discard
- [ ] Running pill → draft card transition; card enters with the rise animation
- [ ] Card is read-only; no inline editing of title or passage
- [ ] Rewrite unmounts the card, guide asks in chat, next reply re-runs the tool with prior context
- [ ] Keep this → receipt collapse, sidebar MEMORIES appears, counts increment on both conversation and story
- [ ] Discard → faint line, no card, no count change
- [ ] Bookmark hidden while a draft is open or while streaming
- [ ] Reload mid-generation leaves no stuck "Gathering…" card and no orphan cursor
- [ ] Touch: action rows always visible; card actions do not wrap or clip at 375px
