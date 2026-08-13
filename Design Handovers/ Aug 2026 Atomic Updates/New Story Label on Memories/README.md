# Handover — "Featured in [Story]" label on memory cards

Two places: the detail page for an individual memory (Story Canvas), and the
horizontal memory-list cards used in the "Memories from this chat" panel and
the "Add memories to this story" picker.

Source: `production-reference/MemoryCard.tsx` (fresh pull from `main`,
2026-08-13). `prototype-reference/story-canvas-panel.jsx` +
`chat-widget-canvas.jsx` (not copied separately here — see the other
handovers in this batch for a full snapshot) have this built and verified.

## Built and verified (prototype)

**1. Memory detail page** (`story-canvas-panel.jsx`, `CardView`) — a filled
green checkmark button next to the "+" (add-to-story) button, only rendered
when the memory has a `storyId`:
```jsx
const memStory = stories && mem.storyId ? stories.find((s) => s.id === mem.storyId) : null;
// ...
{memStory && (
  <button title={'In "' + memStory.name + '" — click to change or remove'} onClick={() => setMoveOpen((v) => !v)}
    style={{ width: 30, height: 30, borderRadius: 99, background: '#2E7D4F', color: '#fff', display: 'grid', placeItems: 'center' }}>
    <SIcon n="check" s={17} sw={2.4} />
  </button>
)}
```
Clicking it opens the same story-picker menu as "+", which now also has a
"Remove from '[Story]'" option at the top when connected. (An earlier
version of this put the story name directly in the eyebrow row next to the
date — explicitly rejected as visually weak/cramped; this button is the
shipped version.)

**2. Horizontal list cards** (`chat-widget-canvas.jsx`,
`SessionMemoriesPanel` + `AddMemoriesToStoryPanel` — same card markup in
both):
```jsx
const story = stories.find((s) => s.id === k.storyId);
// ...
<span>{k.title}</span><span>{k.date}</span>
{story && <span style={{ color: 'var(--hl-accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Featured in {story.name}</span>}
<span>{k.passage}</span>
```
Its own line, between the title/date row and the passage preview — replaces
what used to be an inline `"· {story.name}"` suffix tacked onto the date.

## Known knowns

- Both cards read from the same `stories`/memory shape (`memory.storyId` →
  lookup in a `stories` array) — no new data model, purely presentational.
- The checkmark button reuses the *same* story-picker menu the "+" button
  already opens (`setMoveOpen`) — not a second, separate menu. Removing the
  connection is a menu item inside that same dropdown, not a distinct control.
- Rejected alternative (memory detail page): putting the story name in the
  eyebrow/meta row as plain text. Kept for the record so it isn't
  re-proposed — "looked horrible," per direct feedback, given how little
  horizontal room that row has.

## Known unknowns

- **`main`'s `MemoryCard.tsx` has no story-linkage concept at all** — no
  `storyId` on `MemoryRow`, and the component's own doc comment states this
  is deliberate: *"No story chips — memories don't require a story to be
  saved... a memory may connect to nothing, or to more than one thing,
  later."* This handover cannot be ported until that data relationship is
  designed on `main` — there's no `stories` prop, no join table, nothing to
  read from.
- If/when that relationship exists, whether a memory can belong to more than
  one story (per that same doc comment's "or more than one thing") changes
  the design here — the prototype's `storyId` is singular; "Featured in
  [Story]" as built only handles one.
- No production API surface exists for "remove this memory from its story"
  either — same gap the Admin-panel-member-removal handover already flagged
  for a related but different relationship.
