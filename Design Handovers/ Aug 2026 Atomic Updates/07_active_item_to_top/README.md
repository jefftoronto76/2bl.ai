# Handover — Active conversation sorts to the top of its list

Source: `chat-widget-canvas.jsx`, `Sidebar` component (shared by mobile and
desktop — one component, no breakpoint fork), verified live in the
prototype.

## Diff

```js
// BEFORE
const filtered = query ? inStory.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())) : inStory;

// AFTER
const filteredUnsorted = query ? inStory.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())) : inStory;
const filtered = activeId ? [...filteredUnsorted].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0)) : filteredUnsorted;
```

`filtered` is what the Memories/conversations list renders (`convOpen &&
filtered.map((s) => ...)`, same file). The sort is stable — everything else
keeps its existing relative order; only the active conversation moves to
index 0.

## Known

- Applies identically on mobile and desktop — `Sidebar` is one shared
  component, rendered directly (desktop, docked) and inside the slide-in
  drawer (mobile); this change lives above both render paths.
- Only affects the **conversations/Memories list** inside a story. Search
  filtering (`query`) still runs first; the active-to-top sort applies to
  whatever the search already narrowed down to.
- `main`'s equivalent is `SidebarV2.tsx`'s conversation list (own state,
  currently no active-pinning sort as far as this session confirmed) —
  same sort logic ports directly: find the active session id, stable-sort
  so it's first.

## Open / not yet done

- **Stories list itself is NOT sorted this way yet.** The ask named
  "messages/stories" — this handover only covers the conversations
  (Memories) list. The Stories list (`stories.map(...)`, same file, header
  row above Memories) still renders in whatever order `stories` state holds,
  with no active-story-to-top behavior. If that's wanted too, it's the same
  pattern: sort by `st.id === selectedStoryId` before mapping.
- No persistence question here — this is a pure render-order sort on
  existing state, not a schema or API change.
