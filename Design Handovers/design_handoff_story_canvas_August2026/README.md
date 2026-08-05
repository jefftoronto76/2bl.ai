# Handoff — Story Canvas

The **story canvas** is where saved memories live: a story is an ordered deck of
memory cards, shown beside the conversation that produced them.

**Status:** design exploration, revised 4 August 2026 — the canvas was pulled out
of the chat shell into its own standalone page (see §8). Not yet estimated.
**Source of truth:** `Heirloom Lander - Summer 2026 - Story Canvas.html` — the
landing page with the real chat widget embedded, running the current story page.
`chat-widget-canvas.jsx` (drawer + wiring) and `story-canvas-panel.jsx` (`Deck`,
`StoryMenu`, `CardView`, book pagination) are the two files that matter.

**Nothing in the base lander was modified beyond the chat mount.** The
integration lives in `chat-widget-canvas.jsx` / `story-canvas-panel.jsx`, loaded
alongside `icons.jsx`.

**Related packages:** `design_handoff_memories` (the in-transcript memory card
this canvas receives) · `message_states_feedback` · `visitor_message_actions`.

**Scope.** Front-end user experience only: what the owner sees, what they can do,
what state the interface holds. Storage, permissions enforcement, and model
routing are out of scope; where they touch the UX they appear as *considerations*.

---

## 1. Getting there — revised 4 August 2026

The canvas is now its **own standalone page**, not a pane split with the
transcript. It can open from chat, or straight from the lander/sidebar, with or
without chat open — that was the point of pulling it out (see §8).

Entry points:

| # | Entry | Opens at |
|---|---|---|
| 1 | **Sidebar → Stories row** (chat drawer) | that story's deck |
| 2 | **Saved receipt in the transcript** ("Kept in …") | that memory's card |
| 3 | **Story pill in the drawer header** — the story feeding the current conversation, with its count | that story's deck |
| 4 | **"Your Stories" nav link on the lander** | the story menu (table of contents) |

**The story menu is new** — a top-level list of every story, reachable
independent of chat. It exists because entry #4 needed somewhere to land when
no single story is implied yet. `Deck` gained an "All stories" link back to it
when the visitor has more than one.

**The page carries its own sidebar**, collapsed to a 53px icon rail by default
(story icons + count badges, tooltip on hover). Drag its curtain past ~150px and
it snaps back to the rail; past that it opens to a full list, same as the chat
drawer's sidebar — separate width state, so resizing one never affects the other.

**The way back to chat is one button** ("Continue the conversation") in the
page header, next to Close. No live transcript ever shows next to the canvas —
that pairing is what the standalone page removed.

**A story is not bound to one conversation.** Stories span conversations and
conversations feed one story; opening a story from the sidebar rail while in an
unrelated conversation is legitimate.

**Each conversation holds its own thread.** ~~The story pill follows it.~~
**Descoped 2026-08-04** — re-pointing the header pill whenever the visitor
switches conversations asked too much of the UI (two things silently changing
at once). The pill now only changes when the visitor explicitly opens a story
— from the sidebar, a saved receipt, or "Talk about this." Selecting a
conversation swaps the transcript and nothing else.

**Counts are the affordance.** The accent bookmark + mono numeral on conversation
rows, story rows, and rail icons is what tells the visitor there is something in
there to look at. Derived from the memory list, never stored.

**The sidebar's flat MEMORIES list is now redundant** and should be dropped: the
deck does that job better, ordered and openable. (Was in the memories package.)

---

## 2. The shape

**No longer two panes.** The canvas is a full-screen page, at one of **three
levels** (added the story menu 4 August):

- **Story menu** — every story as a row (name, tagline, memory count). Entry
  point when no single story is implied, or reached via "All stories."
- **Deck level** — one story's memories as numbered chapters: index, kind mark,
  title, two-line excerpt, date, lineage. Scrollable, drag-reorderable.
- **Card level** — one memory, now read **as a book**: paginated into pages
  (~300 words on an illustrated first page, ~620 after), with inline media on
  page one only. Page-turn arrows roll continuously from one chapter's last
  page into the next chapter's first page — there is no hard stop at a chapter
  boundary except at the very first/last page of the whole deck. Header reads
  `Chapter 3/12 · Page 2/3`.

**Desktop and mobile now share the same shell** — full screen, own sidebar rail,
no split-pane breakpoint logic left to maintain. The page's own header holds a
fixed 56px box; the sidebar and canvas both scroll independently beneath it.

---

## 3. Known knowns

**The owner is whoever created the story.** Shareable with others; ownership
transfers only by explicit gift. Reordering, editing, removing, and publishing
are owner actions.

**Order is explicit and owner-owned.** Not chronological, not save order. Drag a
card to move it. `Alt + ↑/↓` on a focused card does the same thing — required,
not a nicety, for keyboard users and for anyone whose hands don't drag well.
The deck's order is the story's order and drives the card pager.

**A saved memory is directly editable — at the card level, not the deck row.**
Title and passage become real fields once you open the card. This is a
deliberate split from the in-transcript card:

| Where | Editability | Why |
|---|---|---|
| Draft card, in transcript | Same card re-renders, title inline-editable, still read-only passage + `Rewrite` | The guide wrote it; revision happens by talking, but retitling is yours immediately |
| Saved card, on canvas (card level) | Direct edit + `Talk about this` | The owner has kept it; the words are theirs now |
| Deck row's Edit icon | **Stub only** (4 Aug) — toasts "coming soon," no inline edit from the row | Row-level edit was asked for, then explicitly descoped to a future round rather than duplicating card-level edit |

Direct edit is **silent** — it writes no message into the transcript. Editing
your own sentence is not a conversation.

**The archivist is gone in production (confirmed 4 Aug via `main` audit).**
`Rewrite`/`Talk about this` no longer has a dedicated revision model call to
hang off — production's own `Rewrite` is an unwired stub. Our prototype's
version still works end to end because it reuses the ordinary chat turn: click
Rewrite → the guide asks in the transcript with pills ("Make it shorter," "Add
more detail," "Change the tone," "Start somewhere else") or free text → normal
turn → Keep updates the page in place. **Engineering should treat this as the
spec for what Rewrite must become**, not build a new revision engine.

**"Talk about this" pins, it does not spawn.** The card becomes context in the
*existing* conversation: a chip above the composer, and the guide opens by naming
what it's reading. No second session, no separate thread. On mobile the sheet
closes so the visitor lands in the composer.

**"Use as a base" forks.** A new page is inserted *after* the parent, tagged
`from [parent title]` on both the deck row and the card footer. The parent is
untouched. Lineage is visible, permanently.

**Publish is a story-level action only.** It never appears on a card. A memory is
a page; only the story ships.

**Remove is card-level and quiet** — sits last in the action spine, faint until
hovered, matching the `Discard` treatment on the transcript card.

**Action spine order is fixed** (mirrors the memories package): primary first,
destructive last, one line. Card level: `Edit` · `Talk about this` ·
`Use as a base` … `Remove`.

---

## 4. Known unknowns

Not answered here. Listed so they get decided deliberately.

- **Export.** The story-page header now has an `Export` button (4 Aug) —
  intent is "a printed or PDF keepsake," per the product goal of producing
  something physical. **It is a stub, toast only.** Format (PDF layout, print
  service, ordering flow), what "physical" means concretely, and whether it's
  the whole story or a selection, are all undesigned.
- **"Chapters" grouping.** Production code (`SidebarV2`, kebab menu) has a
  "move to / remove from chapter" concept **we have no design for and did not
  build.** Distinct from the book-pagination "chapter = memory" language used
  in this package — don't conflate the two; confirm with eng which one "chapter"
  means before either ships.
- **Book pagination is word-count pagination, not semantic.** Pages break every
  ~300/620 words regardless of sentence or paragraph boundaries. Untested
  whether that reads naturally; a real implementation likely wants to break on
  paragraph boundaries.
- **Does a fork inherit the parent's media?** Currently no — a fork is always a
  `conversation` kind, blank until the visitor talks. Untested.
- **Is `Alt + ↑/↓` discoverable enough**, or does reorder need visible up/down
  controls for the primary elderly audience? Untested.
- **What does a collaborator see?** The prototype is the owner's view only.
  Whether a collaborator can reorder, edit, or only comment is unspecified.
- **Can a memory move between stories from the canvas?** Not designed.
- **Is there an undo on Remove?** Currently no, same open question as `Discard`.
- **Does direct edit need version history?** The prototype shows a `v2` mark
  after a conversational revision but keeps no history and offers no revert.
- **Zero-memory story.** The empty deck is unhandled beyond one line of copy.
- **How long can a deck get** before it needs sections/chapters? Tested at 5.
- **Does the rail need story names on hover** (tooltip only today), or initials/colour so stories are distinguishable at 32px? Untested with more than three stories.
- **Story menu ordering.** Rows currently render in array order — no sort, no
  pinning, no archive. Untested past ~4 stories.
- **Row-level Edit on the deck.** Stubbed 4 Aug pending its own design round —
  see §3 table. Whatever it becomes should not duplicate card-level edit.

### Considerations for engineering

- **Reorder persistence.** The design needs a stable per-story order field the
  owner mutates; it does not care whether that's an integer index, a fractional
  rank, or a linked list. Rank-based ordering avoids rewriting every row on each
  drag — worth choosing before implementation.
- **Pinned context is a UI concept, not necessarily a stored one.** The design
  requires only that the guide's next turn receives the card's title and passage.
- **Direct edit vs. concurrent conversational revision** can race: the owner
  could be editing a card while a `create_memory` revision for the same card
  lands. The design does not resolve this. Last-write-wins is probably wrong.

---

## 5. Tokens & type

Same system as every other Heirloom prototype — `--hl-*` variables in the HTML,
mapped to the app's semantic Tailwind tokens on implementation (see
`design_handoff_kebab_menu/TOKEN_MAP.md`). **Do not hardcode the hex values.**

Cormorant Garamond (titles, story names) · DM Sans (body, UI) · DM Mono (indices,
eyebrows, meta). Card titles are display; passages are body at 15.5px/1.75.

Icons come from the shared `icons.jsx` (`window.Icon`) → `lucide-react` in the
app. Seven marks are local to this prototype because the shared set lacks them:
`video`, `play`, `grip`, `deck`, `fork`, `send`, `imagePlus`. Add them to the
shared set rather than re-drawing.

---

## 6. How it hangs off the existing widget

The integration is deliberately small — four hooks, all of which already existed:

| Existing thing | Before | Now |
|---|---|---|
| `Sidebar` → `onOpenStory` | opened the Invite modal | opens the story's deck |
| `memOpen` (saved receipt) | flashed "the story view is illustrative" | opens that page's card |
| `rewritePendingRef` machinery | fed the transcript's `Rewrite` | also feeds **Talk about this** and **Use as a base** |
| `memories` state | `{id, title, storyId, sessionId}` | `+ passage, kind, date, version, parentId, msgId` |

Consequences worth noting for estimation:

- **A conversational rewrite reuses the existing tool flow end to end.** Talking
  about a page produces a normal draft card in the transcript; keeping it updates
  the page in place (`pendingMemRef`) instead of adding a second memory. No new
  tool, no second code path.
- **`memories` becomes the deck.** Its array order *is* the story order, so
  reorder writes to the same collection the sidebar counts read from.
- **Opening the canvas no longer touches the drawer's sidebar or full-screen
  state at all** (4 Aug) — that coupling was removed when the canvas became
  its own page. `openCanvas` just sets `canvas` state; the drawer sidebar's
  width persists independently.
- **The story page mounts a second, independent `Sidebar` instance** (`storySideW`
  state), same component as the drawer's, in icon-rail mode by default. Two
  `Sidebar` mounts sharing one component is intentional — don't diverge them.
- **Upstream bug worth fixing in the same pass.** `Composer` and `SaveBar` in
  `chat-widget.jsx` centre their inner wrapper with `max-width: 680` +
  `padding: 0 16px` on a content-box element, so they overflow and clip the send
  button whenever the conversation column is narrower than ~712px. It never showed
  before because nothing narrowed that column; the canvas does. One-line fix:
  `box-sizing: border-box` on both wrappers (done in `chat-widget-canvas.jsx`).
- **Memories kept before this feature have no `passage`.** The deck falls back to
  a line inviting the visitor to open and rewrite it. Real migration is a back-end
  question we have not answered.

---

## 7. Files

| File | Role |
|---|---|
| `Heirloom Lander - Summer 2026 - Story Canvas.html` | **The integrated prototype — start here.** Lander + chat + standalone story page. |
| `chat-widget-canvas.jsx` | Chat drawer, sidebar, and the story page shell (header, sidebar rail, Export/Close). |
| `story-canvas-panel.jsx` | `Deck`, `StoryMenu`, `CardView` (book pagination), `SC_KINDS`, shared. |
| `icons.jsx` | Shared icon set, loaded once for both the lander and the canvas. |

These are design references in HTML/JSX, **not** drop-in production code.
