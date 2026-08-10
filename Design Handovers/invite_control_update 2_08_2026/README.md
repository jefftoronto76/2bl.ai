# Handover — Updated collaborator invite control

Source: `production-reference/chat-widget-canvas.jsx` (`InviteModal`, `Sidebar`'s per-story rows, `Deck`'s "Share this story" button).

## What changed
The invite control moved from being a single, story-agnostic entry point to a set of per-story triggers, and the modal itself picked up two new fields.

**Trigger locations, before → after:**
- Before: one generic "Invite" button in the sidebar's Stories footer, unrelated to any specific story.
- After: no sidebar-level generic button. Instead, each individual story row in the sidebar's Stories list carries its own small invite icon (a `<button>` sibling inside the row, not nested inside the row's own clickable area — see the DOM-nesting note below). The story view's "Share this story" button also opens the same modal, scoped to whatever story is open.

**Modal additions:**
- A **story picker** (`<select>`) appears whenever more than zero stories exist, defaulting to whichever story triggered the invite. Changing it re-labels the modal's intro copy to reference the newly selected story by name.
- A **custom message** field — a plain `<textarea>`, placeholder "Add a personal note to include with the invite…" — sits below the story picker. Its value lives in the same `invite` state object (`{ storyId, note }`) alongside the story selection.

**Modal layout:** restructured to a fixed-height flex column. Everything above the magic link (header, story picker, custom message, invitee list, author-stays-author disclaimer) scrolls in a body region; the magic link block (link row, expiry, reset) is now a non-scrolling footer pinned to the bottom of the modal at all times.

## Known-knowns
- The magic-link/token/expiry/collaborator-list mechanics are unchanged — only the modal's layout and its two new inputs are new.
- The per-story invite icon had to be built as a sibling `<button>`, not nested inside the story row's own `<button>` — nested interactive elements are invalid HTML and were flagged and fixed during this work.
- `InviteModal` accepts `stories`, `storyId`, `onStoryChange`, `note`, `onNoteChange` as new props on top of its original `link`/`expiry`/`onRegenerate`/`collaborators`/`context`.

## Unknown-knowns
- Whether the custom message is meant to actually get sent/attached to the invite in a real backend, or is prototype-only decoration, hasn't been discussed.
- Whether switching the story picker's selection should change what the underlying link actually grants access to (vs. just changing display copy) is still undecided — flagged in earlier invite-related handovers and still unresolved.
- We don't know the real backend data model for invites, collaborators, or story membership. Everything here — the link, the token format, the collaborator list, the story picker's options — is prototype-local sample data built to make the screen demonstrable, not a reflection of production schema. Don't build against these shapes as if confirmed.
