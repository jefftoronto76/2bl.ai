# Stage 3 \u2014 Icon actions & workflows

Footer action row on every `MediaCard`, left to right: **+ (add to memory)**, **pen (edit, stub)**, then right-aligned **trash (delete)**. A Download button existed earlier and was explicitly removed \u2014 don't re-add without checking with the team first (production's real `MediaGallery.tsx` still has one; this is a deliberate prototype divergence).

## Add to memory (the "+" icon)
- **Not** wired to the chat drawer's memory panel \u2014 that was tried first and explicitly rejected: "the media page is the primary canvas... independent of chat."
- Instead, `MediaItemsList` owns a **self-contained slide-in panel** from the right edge (`position: fixed; right: 0`, `width: min(400px, 100vw)`, slides via `translateX`). It reuses `SessionMemoriesPanel` in `selectMode` \u2014 the same select-multiple UI/list styling used in chat, just re-hosted here instead of handed off there.
- Works identically whether Media is the standalone page or the in-chat panel \u2014 both pass `memories`/`stories`/`flash` down to `MediaItemsList` for this panel to use.
- On confirm: shows a toast via the passed-down `flash` function, then closes after a short delay. No real persistence \u2014 this is UI-only.

## Edit (pen icon)
Explicit stub. Calls `onEditStub`, which both render sites wire to `() => flash('Editing media is coming soon')`. No edit surface exists yet.

## Delete (trash icon)
- Opens a confirmation dialog first \u2014 required per explicit request ("we need a confirmation dialogue for any delete action").
- Reuses `ConfirmDeleteModal` (previously chat-deletion-only), generalized with optional `heading`/`body`/`confirmLabel` props so it can carry file-specific copy ("Delete this file?" / filename in italics) instead of the hardcoded chat copy. Confirming removes the item from local state only (`setItems` filter) \u2014 no backend call.

## Upload (header button, standalone page only)
Explicit stub. Filled accent button, upload icon, calls `flash('Upload is coming soon')`. No file picker or upload flow wired.
