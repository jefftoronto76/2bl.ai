# Phase 3 — New Story (sidebar)

Source: `production-reference/chat-widget-canvas.jsx` (the sidebar's Stories section and its "begin a new story" modal).

## What changed
The sidebar used to have a "Stories" section that was mostly empty — just a single "Create" button, with no way to actually see or jump to the stories that already existed. That's fixed: the section now lists every story by name, with a small marker showing how many memories are tucked inside each one, and clicking a name takes you straight into that story's full view.

The "Create" button itself moved — instead of sitting as its own row taking up space, it's now a small plus icon tucked next to the "Stories" label, in the same spot as the invite icon from Phase 2. Clicking it opens the same "begin a new story" form as before: a name field, an optional description, and a submit button that only lights up once you've typed a name.

## Known-knowns
- The story-creation form itself — its fields, its validation, what happens when you submit — hasn't changed at all. Only where the button that opens it lives, and what the section around it looks like now that it actually shows content.
- This build already comes with a couple of sample stories and a good number of sample memories split between them, so the sidebar isn't empty by default — it's meant to look lived-in out of the box.

## Unknown-knowns
- There's no check for duplicate names, no length limit, nothing beyond "you typed something" — whether that's sufficient for a real product hasn't been discussed.
- We don't know what a story actually looks like in the real backend — how it's stored, what fields it really has, how it relates to memories in the database. The sample data here was invented to make the sidebar demonstrable, not to reflect any real schema.
- Nothing here assigns an owner or handles permissions when a story is created — there's no login or account system in this prototype at all, so that question is entirely open.
