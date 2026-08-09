# Handover two \u2014 "Add to memories," wired to two places

Source: `production-reference/chat-widget-canvas.jsx`. Two independent implementations of the same underlying idea (pick one or more existing memories to attach something to) \u2014 they are **not** the same function, and were deliberately kept separate. Read both sections before assuming they can be merged.

## Place 1 \u2014 Chat upload thumbnail ("+" icon, `UploadThumb`)
- Button: `<ActBtn label="Add to a memory" icon="plus" onClick={onAddToMemory} />` inside `UploadThumb`, wired at the `Messages` call site (~line 1063): `onAddToMemory={() => onAddUploadToMemory(m.id)}`.
- Handler `onAddUploadToMemory` (~line 1778): guards against zero memories existing yet (`flash('Bookmark a memory first')` and bail), otherwise sets `addToMemoryUpload` to the upload's id and opens `sessionListOpen` \u2014 **reusing the chat drawer's own third-pane slot**, the same one the memory panel (`CardView`) occupies. `SessionMemoriesPanel` renders there in `selectMode`.
- Confirm: `confirmAddToMemory` (~line 1783) bumps a `photoCount` on each selected memory, flashes a toast naming the memory/memories, then closes both `addToMemoryUpload` and `sessionListOpen` after a short delay.
- **This one is chat-native** \u2014 it makes sense for it to use the chat drawer's own panel slot, since the upload thumbnail lives inside a chat message to begin with.

## Place 2 \u2014 Media card ("+" icon, `MediaCard`, inside `MediaItemsList`)
- Button: same visual pattern (plus icon), but **does not** call `onAddUploadToMemory` or touch `sessionListOpen`/the chat drawer at all. This was tried first and explicitly rejected: "the media page is the primary canvas... independent of chat."
- Instead, `MediaItemsList` (~line 1237) owns its own local `addTarget` state and renders a **self-contained slide-in panel** (~line 1262\u20131272): `position: fixed; right: 0`, `width: min(400px, 100vw)`, sliding via `translateX`. It hosts the same `SessionMemoriesPanel` component in `selectMode`, just re-parented here instead of handed off to chat.
- Works identically whether Media is the standalone page or the in-chat Media panel \u2014 both pass `memories`/`stories`/`flash` down as props so this panel has what it needs without reaching into chat-specific state.
- Confirm: shows a toast via the passed-down `flash`, closes after a short delay. **No `photoCount` bump, no persistence** \u2014 purely UI at this point (see Known-knowns).

## Known-knowns
- Both places reuse the exact same `SessionMemoriesPanel` component (list styling, checkboxes, "N selected \u2014 Save" footer) \u2014 intentional, so the interaction feels identical even though the surrounding chrome differs (chat third-pane vs. Media's own right-side overlay).
- Place 2's confirm does not actually persist anything (no memory object is mutated) \u2014 Place 1's does (`photoCount` increment). This asymmetry is real, not an oversight to silently fix \u2014 flag before unifying, since Media items and chat memories aren't the same underlying data type yet.

## Unknown-knowns
- Whether Place 2 should eventually also mutate something (e.g. link the media item's id onto the memory) is undecided \u2014 no schema exists for that relationship yet.
- Whether these two implementations should be consolidated into one shared component (vs. two call sites of `SessionMemoriesPanel` with different hosting chrome, as today) hasn't been discussed with the team.
