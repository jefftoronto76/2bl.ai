# Handover one \u2014 saved memory list

Source: `production-reference/chat-widget-canvas.jsx`, `function Sidebar` (~line 306) and its "Memories" section (~line 378\u2013420).

## What this is
The list of saved memories in the sidebar, under the **Memories** collapsible section. This is a tree: a story-name dropdown header at the top of the sidebar picks which story's memories are in view, and the "Memories" section lists that story's **chat sessions** (not individual memory titles) \u2014 each row is a conversation, annotated with a bookmark count for how many memories were kept in it.

This replaced an earlier, incorrect prototype structure (flat "Stories" list + flat "Memories" list of individual memory titles) after comparing directly against production's `SidebarV2.tsx` tree \u2014 see `KNOWN_UNKNOWNS.md` in the Media handover package for that history if useful context.

## Structure, top to bottom
1. **Story switcher** (header row, ~line 337\u2013352): shows the selected story's name + chevron. Click opens a small dropdown menu (`storyMenuOpen` state) listing all stories; picking one sets `selectedStoryId` and calls `onOpenStory`.
2. **Nav rows**: New Chat, Media, Uploads (removed \u2014 see note below), Share Heirloom.
3. **Search** (only shown if `sessions.length >= 6`).
4. **"Memories" section** (~line 378): collapsible (`convOpen` state), label + count badge (`storyCount(selectedStoryId)` if a story is selected, else total `mems.length`) + chevron toggle.
5. **Session rows** (~line 383 onward): filtered to sessions belonging to the selected story (`sessionStoryId` helper matches a session to a story via its memories) or unassigned sessions. Each row: star icon if starred, title (truncated), a bookmark-count badge if the session has kept memories (`memCount(s.id)`), and a "\u22ee" overflow menu (star/rename/invite/move/remove/delete).
6. **"Stories" section** (~line 419 onward, footer-style): just Create + Invite actions now \u2014 no per-story list here anymore, since story switching moved to the header dropdown.

## Data model note
Sessions don't carry a `storyId` directly. A session's story is inferred by looking up the `storyId` of any memory whose `sessionId` matches (`sessionStoryId` helper, ~line 316). This is a prototype simplification \u2014 flag if the real data model should store `storyId` on the session itself instead.

## Known-knowns
- Story switcher and Memories-as-session-tree structure is deliberately matched to production's `SidebarV2.tsx` pattern, not the earlier flat-list prototype.
- "Uploads" nav row was removed per explicit request; only New Chat / Media / Share Heirloom remain as top-level nav rows now.

## Unknown-knowns
- Whether a session can belong to more than one story isn't handled \u2014 `sessionStoryId` returns the first match only.
- No pagination/virtualization on the session list \u2014 fine for prototype seed data (2 sessions), unverified at scale.
