# Memory canvas panel — text + image scope handover

**Supersedes nothing** — this is a narrower, atomic addendum to `Memory Canvas - Handover.md` (same folder), written to resolve specific ambiguity between what's been built tonight and the reference prototype (`prototype-reference/story-canvas-panel.jsx`). Read the main handover first for full context (data model, known gaps, rollout plan); this doc only covers the decisions below.

## Scope
Two block types only: **text** and **image**. Drag-and-drop reordering is explicitly **out of scope** — logged as a known gap, not needed for this build.

## Decisions, confirmed

**1. Insert control ("+")**
Reference renders a `BlockInserter` before the first block AND after every block — a 2-block memory (image + text) gets 3 inserter slots: top, between the two blocks, bottom. Keep this even with drag-and-drop cut; inserters are independent of reordering.

Picker UI: click "+" expands a floating row of icon buttons anchored below the line. For this scope, only 2 buttons: **text**, **image**. Remove the other 4 entries (gallery, video, quote, divider) from `BLOCK_KINDS` for this build — don't just hide them.

**2. Image + caption — resolved: passage = caption.**
There is no separate caption field. `mem.passage` is the single text field for every memory kind — for a photo memory it doubles as the caption. `buildDefaultBlocks()` reads `mem.passage` once and renders it as a single text block. No merge, no split, no third block.

**3. Default block order on open**
- No linked photo: single **Text block** (passage).
- Linked photo: **Image block first (hero), Text block (passage) second** — image above text.

This is `buildDefaultBlocks()`'s existing order and stays fixed on open since reordering is out of scope.

**4. Save behavior — keystroke, matches reference as-is.**
No deviation. `patchBlock`'s inline `commit()` call fires on every `onChange` (per keystroke), exactly as `story-canvas-panel.jsx` already does. Do not move this to blur.

**5. Scope confirmation — unchanged surfaces.**
This handover is panel-only. `MemoryCard` (draft state, transcript) and `MemorySavedReceipt` (collapsed state, transcript) stay exactly as they are — read-only, no edit affordances added.

## Integration notes
Existing code to integrate with, not replace: `BlockCanvas.tsx` (block renderer) and `MemoryCardView.tsx` (panel) — both already exist and mostly work. This handover refines the interaction pattern on top of them; it is not a rebuild.

## Files in this package
- `production-reference/MemoryCard.tsx`, `memoryKinds.ts`, `useMemories.ts` — verbatim, `main`.
- `prototype-reference/story-canvas-panel.jsx` — reference prototype; `BLOCK_KINDS`, `BlockInserter`, `buildDefaultBlocks`, `CanvasBlock` are the relevant pieces for this scope.
- `Memory Canvas - Handover.md` — full data-model/rollout handover this addendum narrows.
