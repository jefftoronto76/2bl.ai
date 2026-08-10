# Phase 4 — Add Memories (mirrors the existing Add Photos pattern)

Source: `production-reference/chat-widget-canvas.jsx` (new panel triggered from the story view's "+" button).

## What this is
A new panel, opened by clicking the "+" inside a story's full view. It slides in from the right and shows a checklist of memories you could pull into the story you're currently looking at — pick one or several, and a button at the bottom confirms adding them. Visually and behaviorally, it deliberately looks and feels like the panel that already exists for attaching a photo to a memory elsewhere in this build (same list-of-cards-with-checkmarks layout, same footer that tracks how many you've picked) — but it's its own separate piece, built fresh for this purpose rather than the old one repurposed, because the two do slightly different things underneath.

## How it's different from the photo one
- It leaves out anything already sitting in the story you're adding to — no point offering to add something that's already there. If nothing qualifies, it says so plainly instead of showing an empty list.
- The confirm button reads "Add to story" rather than "Save," since that's the actual action being taken.
- Confirming it moves each selected memory into the story — it doesn't attach a photo to anything, it reassigns which story the memory belongs to.

## Known-knowns
- Copying the shape of the photo-attachment panel here was a deliberate choice, made explicitly, not an accident or a shortcut — the two panels share a look on purpose.
- Reassigning a memory to a new story happens the moment you confirm, with no extra confirmation step — consistent with how moving a memory between stories already worked elsewhere in this build.

## Unknown-knowns
- Right now, a memory can only belong to one story at a time — adding it here means it leaves wherever it was before. Whether the real product should allow a memory to belong to more than one story at once is an open question we can't answer from this prototype.
- We don't know how any of this is actually modeled in the real backend. The idea of a memory having a single "which story is it in" field is something invented to make this screen work, not a confirmed fact about how the real data is structured — don't build against it as if it were.
- There's no thought given yet to what happens if someone has a very long list of memories to choose from — no search, no pagination, nothing beyond a plain scrolling list.
