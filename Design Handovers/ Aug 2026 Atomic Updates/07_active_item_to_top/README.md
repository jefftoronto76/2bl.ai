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

- **Closed (2026-08-14).** The Stories list is now sorted this way too —
  `orderedStories`/`filteredStories` in `components/shells/membership/v2/
  SidebarV2.tsx`, same pattern as `orderedSessions`/`filteredSessions`
  above. "Active story" turned out not to map onto a `selectedStoryId`
  the way this note originally guessed — no such concept existed yet.
  Instead it's `storyViewId` (`ChatHero.tsx`, real-story-view Phase 1a/1b,
  landed the same day as this note): the story whose StoryView pane is
  currently open, same spirit as a session being active while its chat is
  open. Since a story pane isn't chat-store state the way `sessionId` is,
  it's passed down as a new `activeStoryId` prop rather than read off
  `useChatStore()`. Tests: `SidebarV2.activeStoryToTop.test.tsx`, mirroring
  `SidebarV2.activeSessionToTop.test.tsx`'s structure.
- No persistence question here — this is a pure render-order sort on
  existing state, not a schema or API change.
