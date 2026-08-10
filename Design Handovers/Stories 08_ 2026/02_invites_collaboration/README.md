# Phase 2 — Invites / Collaboration

Source: `production-reference/chat-widget-canvas.jsx` (the invite modal, the sidebar's Stories header) and `production-reference/story-canvas-panel.jsx` (the story view's share button).

## What changed
There used to be one generic "Invite" button sitting in the sidebar, disconnected from any particular story — click it and you'd get the same invite modal no matter what you were looking at. That's gone now. Invites only make sense in the context of a specific story going forward, and there are two ways to start one:
- A small person icon next to the "Stories" heading in the sidebar, which invites into whichever story is currently selected.
- The "Share this story" button inside the story view itself, which invites into that story specifically.

Both paths lead to the same modal, which now has a way to actually pick or change the story you're inviting people into — a dropdown listing every story, defaulting to whichever one launched it. Picking a different story updates the modal's wording to match.

Separately, a display bug got fixed: both this modal and the "start a new story" modal were positioned in a way that only worked correctly when nothing else was layered on top of them. Once the full-screen story view came along and sat above everything else, these modals started rendering underneath it instead of on top — invisible, effectively. Both now use a positioning approach that keeps them on top regardless of what else is open.

## Known-knowns
- Everything about how the invite link itself behaves — the token, the expiration countdown, the list of people already invited — hasn't changed. Only how you get to the modal, and what it's aware of once you're there.
- Inviting someone to a single conversation (as opposed to a whole story) still works the old way, through a chat's row menu — that's a separate, untouched path.

## Unknown-knowns
- Whether switching stories in the new dropdown should actually change what the link grants access to, or if it's just relabeling the same link — nobody's decided that yet.
- We don't know how invites, collaborators, or story membership actually work behind the scenes in the real product. The link, the token, the list of "already invited" people — all of it is invented for this prototype so the screen has something to show. None of it should be assumed to match how a real invite system would be built or stored.
