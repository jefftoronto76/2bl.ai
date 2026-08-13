# Handover — Active conversation/story sorts to the top of its list

The active item in a list (current conversation in Memories, current story in
Stories) should render first, ahead of everything else — on both mobile and
desktop. `SidebarV2` is one shared component for both breakpoints, so this
is a single change, not two.

Source: `production-reference/SidebarV2.tsx` + `types.ts` (fresh pulls from
`main`, 2026-08-13). `prototype-reference/chat-widget-canvas.jsx` has the
conversation-list half of this already built and verified live.

## Built and verified (prototype) — conversation list

`chat-widget-canvas.jsx`, `Sidebar` component:

```js
// BEFORE
const filtered = query ? inStory.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())) : inStory;

// AFTER
const filteredUnsorted = query ? inStory.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())) : inStory;
const filtered = activeId ? [...filteredUnsorted].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0)) : filteredUnsorted;
```

Stable sort — everything else keeps its existing relative order; only the
active conversation moves to index 0. Search filtering runs first; the sort
applies to whatever's already narrowed down.

## Target on `main` — port to `SidebarV2.tsx`

`main`'s conversation list renders `recentSessions` directly, no sort:

```tsx
// SidebarV2.tsx, inside `{isExpanded && convosOpen && (...)}`, current:
recentSessions.map((session) => { ... })
```

Port the same stable-sort pattern, keyed off `state.sessionId` (the active
id, already destructured from `useChatStore()` at the top of the component):

```tsx
const sortedSessions = [...recentSessions].sort((a, b) =>
  a.id === state.sessionId ? -1 : b.id === state.sessionId ? 1 : 0,
);
// ...then .map over sortedSessions instead of recentSessions
```

**Story list is not yet built anywhere** — neither the prototype nor `main`
sorts the Stories section this way today. Same pattern applies once a
"selected/active story" concept exists to sort against:

```tsx
// SidebarV2.tsx, stories.map(...) block — once there's a selectedStoryId to compare against:
const sortedStories = [...stories].sort((a, b) =>
  a.id === selectedStoryId ? -1 : b.id === selectedStoryId ? 1 : 0,
);
```

## Known knowns

- One component, no breakpoint fork (`SidebarV2.tsx` renders the same JSX on
  mobile and desktop; the parent just changes its container) — this ships on
  both automatically.
- Conversation-list sort is proven working in the prototype today. Story-list
  sort is spec only, not built anywhere yet.
- This is a pure render-order change on existing state — no schema, API, or
  persistence implication.

## Known unknowns

- **"Active story" isn't a concept `SidebarV2.tsx` currently has.** The
  Stories section has no analog to `state.sessionId` — no selected/open story
  is tracked in this component today (the prototype tracks it locally as
  `selectedStoryId`, scoped to its own `Sidebar`, not lifted from anywhere
  main-side). Before porting the story sort, confirm where main's real
  "currently open story" state should live.
- Whether the sort should re-run live as the active item changes mid-session
  (it will, automatically, since it derives from render-time state) or only
  on initial load — not raised as a question in the original ask, assumed
  "always live" here.
