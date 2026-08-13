# Phase 1 — Real Story View (story pages and flows)

Source: `production-reference/story-canvas-panel.jsx` (`function Deck`) and `production-reference/chat-widget-canvas.jsx` (`canvas` state, the two `<Deck>` render call sites).

## What this is
Opening a story (from the sidebar's story-switcher dropdown, the collapsed sidebar's rail icons, or a row in the Stories list) shows a full-screen view of that story as an ordered sequence of memories — a real page-through structure, not a flat title list. The list itself (`deck`) is computed live by filtering the full memories array down to the ones tagged with that story's id — there's no separate "table of contents" record kept anywhere; the order and membership come straight from each memory's own data.

## What's in it
- A header: book icon, the story's name, a small line of stats ("N memories · you own this story"), and a row of actions — "All stories" (a shortcut back to the picker, appears only once there's more than one story), a "+" for pulling existing memories into this story, "Share this story," and "Publish this story."
- Below that, an instruction line, then the ordered list of memory rows — each showing its kind icon, title, and date, draggable to reorder (or nudge with arrows), with reordering written straight back to the memory objects.
- A closing hint that new memories will show up here automatically as they're kept.
- Tapping any row swaps the list view for that memory's own editor panel, with paging arrows to move to the next/previous chapter without backing out to the list.

## Known-knowns
- The reordering and membership behavior is real, not decorative — it persists for the session by mutating the actual memory records.
- "Share this story" and the "+" button both open working panels now (see Phases 2 and 4).

## Unknown-knowns
- "Publish this story" does nothing when clicked — no handler exists. What publishing should mean (exporting, freezing edits, something else) has never been discussed.
- "You own this story" is fixed text, not the result of checking anything — there's no concept of roles or permissions anywhere in this build.
- We don't know what the real backend looks like for stories or memories — how they're actually stored, keyed, or related in production. Everything driving this view is local, made-up sample data shaped only to make the screen demonstrable. Don't treat any of it — field names, id formats, relationships — as a stand-in for the real schema.
- There's no designed empty state for a story with nothing in it yet.
