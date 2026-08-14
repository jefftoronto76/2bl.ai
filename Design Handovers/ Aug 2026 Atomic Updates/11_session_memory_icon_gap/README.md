# Handover — Session-level memory icon + slide-out: prototype-only, no main equivalent

This is an **investigation writeup**, not a diff — `main` was checked and
nothing regressed. There is a real gap between the prototype and production,
documented here so it can be scoped as new work if wanted.

## What was checked

- `components/shells/membership/v2/SidebarV2.tsx` — the bookmark icon +
  count next to each session/story row (`SidebarMemoryCount`) is a plain
  `<span>`, not a button. No `onClick`. Purely a decorative count, matching
  what shows in the current production screenshot (heirloom.2bl.ai).
- `components/shells/membership/ChatHeader.tsx` — icon cluster is Media,
  Share Heirloom, fullscreen, account, close. No memory-panel toggle icon.
- `components/shells/membership/ChatHero.tsx` + `MessageList.tsx` — the
  memory slide-out (`MemoryCardView`) exists and works, but only opens via
  `renderMemorySlot` — the bookmark receipt on an **individual message**
  inside the chat transcript. It is never wired to a session row, a story
  row, or the sidebar's memory-count badge.

## Conclusion

Main never had a "click a memory icon on a session/chat → slide-out panel
listing that session's memories" flow. That flow only exists in the
prototype (`chat-widget-canvas.jsx`'s `SessionMemoriesPanel`, opened from a
session's memory badge). Nothing was removed from main — this is a
prototype-ahead-of-production gap, not a regression.

## If this should be built on main

Two independent pieces, either or both:

1. **Make `SidebarMemoryCount` clickable** (`SidebarV2.tsx`) — turn the
   `<span>` into a `<button>` per row, firing a new callback (e.g.
   `onOpenSessionMemories(sessionId)`) up to `ChatHero.tsx`.
2. **A session-scoped memory list panel** — main has no component that lists
   *all* memories for one session; `MemoryCardView` renders exactly one
   memory. Closest reference is the prototype's `SessionMemoriesPanel`
   (`chat-widget-canvas.jsx`), which lists a session's memories as rows you
   can open individually. This would be new, not a port of an existing
   main component.

Both would slot into `ChatHero.tsx`'s existing third-pane pattern
(`openMemory`/`mediaOpen`/`adminStoryId` — mutually exclusive panes sharing
one resizable slot) rather than needing a new layout mechanism.

## Open questions

- Is the desired entry point the sidebar's bookmark badge, a new icon in
  `ChatHeader`, or both?
- Should the session-list panel let you jump from a listed memory straight
  into the single-memory `MemoryCardView`, or is it read-only/navigate-only?
