# Handover \u2014 "Add to a story" button (memory panel)

Source: `production-reference/story-canvas-panel.jsx`, `function CardView` (~line 282), header row.

## Where it is
The filled accent "+" button in the memory panel's header, next to the title field (aria-label "Add to a story"). This is the same visual treatment as the block-canvas "+" (30px filled circle, accent bg) \u2014 kept consistent per an earlier explicit request.

## Current behavior \u2014 existing stories only
Clicking it toggles a small dropdown (`moveOpen` state, ~line 336) anchored below the button, listing **every story** (`stories.map`), each row showing a book icon + story name, with the memory's *current* story highlighted in accent color. Clicking a row calls `onMoveStory(s.id)`, which the two `CardView` call sites in `chat-widget-canvas.jsx` (desktop panel and mobile sheet, search `onMoveStory={(sid) => patchMemory(`) resolve to `patchMemory(mem.id, { storyId: sid })` \u2014 directly reassigning the memory's story, no confirmation step.

The button itself is conditionally rendered only `{stories && stories.length > 0 && (...)}` \u2014 if there are zero stories yet, it doesn't show at all.

## Gap: "or create a new story" is NOT built yet
**This is a real gap, not a documented feature.** Today the dropdown only ever lists existing stories \u2014 there is no row, divider, or "+ New story" option in this menu, and no wiring to `CreateStoryModal`. If the intended behavior is "list existing stories OR create a new one right from this menu, using the same Create Story modal documented in the earlier handover," that still needs to be built. A reasonable approach, for whoever picks this up:
1. Add a "+ New story" row at the bottom of the dropdown (below a divider), styled like the existing rows but with the `plus` icon.
2. On click, close the dropdown and open `CreateStoryModal` (same component the sidebar's "Create" button opens \u2014 see the Create Story & Invite Collaborators handover).
3. On that modal's `onCreate`, the new story needs to end up attached to *this* memory automatically \u2014 mirror the existing `pendingStoryAttachRef` pattern in `chat-widget-canvas.jsx` (`createStory`, ~line 2006) already used for the "start a story from a memory prompt" flow, but keyed to the currently-open memory (`mem.id`) instead of a prompt-originated one.
4. `CardView` would need a new prop (e.g. `onCreateStory`) threaded down from both call sites, since it currently has no path to open that modal.

## Known-knowns
- Existing-stories list, current-story highlighting, and the reassignment-on-click behavior are all built and working.
- Visual treatment intentionally matches the block-canvas "+" button.

## Unknown-knowns
- Whether reassigning a memory's story should require confirmation (currently instant, no undo prompt) hasn't been discussed.
- The "create new story from here" flow described above is unbuilt \u2014 flagging explicitly so it isn't assumed to already exist.
