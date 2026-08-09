# Memory canvas — handover

**Prototype:** `Heirloom Lander - Summer 2026 - Story Canvas.html` → `story-canvas-panel.jsx` (`CardView`, block canvas).
**Compared against:** `jefftoronto76/2bl.ai` @ `main`, read 2026-08-08.
**Included in this package:** verbatim production source for the three files this compares against (`production-reference/`), and the current prototype file (`prototype-reference/`) — diff directly against these, not against memory/paraphrase.

## What changed in the prototype
- `CardView`'s body (between the fixed header and footer) is now a reorderable **block canvas**: text, image, photo grid, video, quote, divider blocks. Drag-to-reorder (grip handle), hover `+` inserters between blocks, per-block remove.
- Existing content (media, passage, photo slots) loads as default blocks on open, seeded from `source_kind` the same way `memoryKinds.ts` seeds today.
- Mobile: the memory panel now opens as a bottom sheet (slide up), not a side panel. Layout-only, no data implications, not covered further below.

## The two surfaces, and why editability differs between them
Production has **no open memory-panel content today** — only the trigger (`MemorySavedReceipt.onOpen`, panel-layout "Stage A"). The block canvas lives entirely in that not-yet-built panel. This means there are two surfaces in play, each with its own posture:

- **Inline transcript** (`MemoryCard.tsx`'s `MemoryCard` draft state, and `MemorySavedReceipt`) — **stays exactly as it is.** The module doc's rule stands: *"The PASSAGE is READ-ONLY by design... Do not add inline editing to the passage without a design conversation."* Title editing here also stays as-is (draft card only; `MemorySavedReceipt` had its edit affordance removed 2026-08-08).
- **The opened panel** (`CardView`, this prototype) — a surface main doesn't have, so it can carry its own rules: content is editable here. This isn't a reversal of the transcript's read-only rule, it's a different surface getting its own posture.

Two supporting facts, confirmed in the code:
- Title editing in the panel is cheap — `useMemories.ts` still exports a working `rename(memoryId, title)` → `PATCH /api/sessions/:id/memories/:memoryId { action: 'retitle' }`. It's simply unused by the transcript UI today, not missing infrastructure.
- Passage/block content editing in the panel has **no existing backend path** — the old archivist-backed revision call is gone (`useMemories.ts`'s module doc: *"there is no rewrite() anymore... Rewrite is unwired to a local stub"*). This needs new work, described below.

## Known knowns (confirmed by reading the code)
- `MemoryRow` (`useMemories.ts`) is flat: one `title` string, one `body` string, no ordering, no block concept.
- `useMemories.ts`'s mutations are `create`, `keep`, `discard`, `rename` — three of four map to PATCH actions `keep` / `discard` / `retitle` on `/api/sessions/:id/memories/:memoryId`. There is no `revise`/content-edit action today.
- `memoryKinds.ts`'s `MEMORY_KINDS` table is the single source of truth for a kind's default media/slots/eyebrow/icon — `MemoryCard` reads only from it, never hardcodes per-kind logic itself.
- The action spine (`Keep this · Rewrite · Discard`) on the draft card is explicitly documented as fixed — "must NEVER vary... built directly into MemoryCard, not driven from this table."
- Rewrite is already a dead stub in production (fires a toast, does nothing) — this is true independent of anything in this prototype.
- `MemorySavedReceipt.onOpen` exists and is wired to open a panel — confirming the panel trigger is real, current infrastructure, not speculative.

## Known unknowns (real gaps, acknowledged but unresolved on either side)
- What a `revise`-content mutation should look like (request/response shape, validation, rate limiting) — doesn't exist yet, needs its own design.
- Whether reordering/adding/removing blocks needs to persist at all in v1, or whether the panel could ship read-only-but-reorderable-in-session first.
- Whether new block types (video, quote, divider, extra text/image/gallery) are wanted by users at all — nothing in the product docs specifies them; they were added in this exploration, not requested.
- How media blocks (image/video/gallery) would ever get real content — no upload/storage path exists for memory media in production today (all memory media is a placeholder box, both here and in `MemoryCard`).

## Unknown unknowns (flagged so the team can watch for them, not because we have answers)
- No one has scoped how a block collection interacts with the archivist/model pipeline if content editing is ever model-assisted again — the old rewrite path is gone, and it's not known whether its replacement (if any) would want structured blocks or a flat string.
- No stress-test of what "reorder a block" means once memories can link to more than one story (mentioned as a future possibility in `MemoryCard.tsx`'s doc) — ordering could become story-relative, not just memory-relative, and that hasn't been thought through anywhere.

## Data / schema changes (proposed, additive — not implemented)
Current (`useMemories.ts`):
```ts
export interface MemoryRow {
  id: string
  session_id: string
  anchor_message_id: string
  source_kind: MemorySourceKind
  title: string
  body: string          // ← today's single flat passage
  status: MemoryStatus
  created_at: string
  updated_at: string
}
```
Proposed addition:
```ts
export interface MemoryBlock {
  id: string
  type: 'text' | 'image' | 'gallery' | 'video' | 'quote' | 'divider'
  content?: string
  media_ref?: string   // future: a real upload/asset id, once blocks can hold real media
}

export interface MemoryRow {
  // ...existing fields unchanged
  body_blocks?: MemoryBlock[] | null   // null/absent = legacy row, render `body` as today
}
```
- `body` stays the source of truth for the transcript (`MemoryCard`/`MemorySavedReceipt`) — kept in sync as a flattened mirror of the blocks' text content.
- New mutation, parallel to the existing ones: `PATCH /api/sessions/:id/memories/:memoryId { action: 'revise_blocks', blocks: MemoryBlock[] }`.
- Old rows with `body_blocks: null` render exactly as today — no migration, no backfill required to ship.
- `memoryKinds.ts` still seeds the *default* blocks for a new memory; once a row has its own `body_blocks`, kind stops being consulted live.

## Is it destructive?
No, to what's shipped. Nothing in `main` is touched — this is an unmerged prototype.

If built as proposed: still not destructive to data. `body_blocks` is additive/nullable, legacy rows are untouched, `body`/`title` remain populated as a fallback for the transcript. The transcript's read-only posture is untouched; the panel's edit posture is new surface, not a reversal of an existing decision.

Within the prototype today: block edits beyond the single primary passage block (reordering, added blocks) don't persist across a close/reopen — `buildDefaultBlocks` rebuilds from `mem` every time the card is opened. Nothing durable exists yet to lose.

## Suggested rollout
1. Keep the transcript cards (`MemoryCard`, `MemorySavedReceipt`) exactly as they are — the panel is the only surface that changes.
2. Ship `body_blocks` as additive/nullable — no migration, no backfill.
3. Build the panel's `revise_blocks` mutation (new, not the old archivist path) before turning on passage/block editing there.
4. Treat real media-in-blocks (upload, storage) as a separate, later workstream — nothing here unblocks or requires it.

## Files in this package
- `production-reference/MemoryCard.tsx` — verbatim, `main`.
- `production-reference/memoryKinds.ts` — verbatim, `main`.
- `production-reference/useMemories.ts` — verbatim, `main`.
- `prototype-reference/story-canvas-panel.jsx` — current prototype source, `CardView` block canvas starts at the `BLOCK_KINDS` constant.

Diff each `production-reference/*` file against its live repo counterpart at the same path to confirm nothing has drifted since this was written.
