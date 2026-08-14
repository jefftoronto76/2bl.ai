# Handover — "Featured in [Story]" label on memory cards

Two places: the detail page for an individual memory (Story Canvas), and the
horizontal memory-list cards used in the "Memories from this chat" panel and
the "Add memories to this story" picker.

Source: `production-reference/MemoryCard.tsx` (fresh pull from `main`,
2026-08-13). `prototype-reference/story-canvas-panel.jsx` +
`chat-widget-canvas.jsx` (not copied separately here — see the other
handovers in this batch for a full snapshot) have this built and verified.

## Built and verified (prototype)

**1. Memory detail page** (`story-canvas-panel.jsx`, `CardView`) — a filled
green checkmark button next to the "+" (add-to-story) button, only rendered
when the memory has a `storyId`:
```jsx
const memStory = stories && mem.storyId ? stories.find((s) => s.id === mem.storyId) : null;
// ...
{memStory && (
  <button title={'In "' + memStory.name + '" — click to change or remove'} onClick={() => setMoveOpen((v) => !v)}
    style={{ width: 30, height: 30, borderRadius: 99, background: '#2E7D4F', color: '#fff', display: 'grid', placeItems: 'center' }}>
    <SIcon n="check" s={17} sw={2.4} />
  </button>
)}
```
Clicking it opens the same story-picker menu as "+", which now also has a
"Remove from '[Story]'" option at the top when connected. (An earlier
version of this put the story name directly in the eyebrow row next to the
date — explicitly rejected as visually weak/cramped; this button is the
shipped version.)

**2. Horizontal list cards** (`chat-widget-canvas.jsx`,
`SessionMemoriesPanel` + `AddMemoriesToStoryPanel` — same card markup in
both):
```jsx
const story = stories.find((s) => s.id === k.storyId);
// ...
<span>{k.title}</span><span>{k.date}</span>
{story && <span style={{ color: 'var(--hl-accent)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Featured in {story.name}</span>}
<span>{k.passage}</span>
```
Its own line, between the title/date row and the passage preview — replaces
what used to be an inline `"· {story.name}"` suffix tacked onto the date.

## Known knowns

- Both cards read from the same `stories`/memory shape (`memory.storyId` →
  lookup in a `stories` array) — no new data model, purely presentational.
- The checkmark button reuses the *same* story-picker menu the "+" button
  already opens (`setMoveOpen`) — not a second, separate menu. Removing the
  connection is a menu item inside that same dropdown, not a distinct control.
- Rejected alternative (memory detail page): putting the story name in the
  eyebrow/meta row as plain text. Kept for the record so it isn't
  re-proposed — "looked horrible," per direct feedback, given how little
  horizontal room that row has.

## Known unknowns (stale as of 2026-08-13/14 — corrected below)

This section originally described `main` as having no story-linkage concept
at all. That was true when this handover was written but is no longer
current — three passes since then (assign-memory-to-story, 2026-08-13;
session-memories-panel, 2026-08-14; and this one, remove-memory-from-story +
trigger state, 2026-08-14) built the real relationship and most of this
handover's own asks on top of it. Kept here, corrected, rather than deleted,
so this file still explains what shipped and in which order.

- ~~`main`'s `MemoryCard.tsx` has no story-linkage concept at all~~ —
  **resolved.** `MemoryRow.storyId` (`services/chat/ui/v1/useMemories.ts`)
  and real many-to-many linking via `artifact_containments`
  (`services/crm/story-containments.ts`) shipped 2026-08-13
  (assign-memory-to-story), landing first on `MemoryCardView.tsx` (the
  panel/editor chrome) only — at that point `MemoryCard.tsx`/
  `MemorySavedReceipt` (the in-transcript draft card and saved receipt)
  still had their own separate, stubbed "+" (fires a toast, no real
  assignment), since this handover's own scope note (top of this file) only
  ever targeted the memory detail page and the session-memories list, not
  the transcript card. **That gap closed independently the same day**
  (PR #391, memory-receipt-story-picker, 2026-08-14, a separate pass not
  scoped from this handover at all) — `MemorySavedReceipt`'s "+" now renders
  the exact same `StoryPicker` component/popover `MemoryCardView`'s header
  does. Because that PR merged to `main` while the remove-from-story pass
  below was in flight on its own branch, rebasing surfaced a real
  consequence, not just a merge conflict: `MemorySavedReceipt` became a
  fourth real `StoryPicker` caller needing `onRemoveFromStory` threaded to
  it too, alongside the three this repo's own `Known Gaps.md` entry
  originally described — see that entry's own correction paragraph for the
  full wiring.
- ~~Whether a memory can belong to more than one story changes the
  design~~ — moot for what's built: single-story-per-memory is enforced at
  the **application** layer only (`assignMemoryToStory` deletes any existing
  containment before inserting the new one); the schema itself
  (`artifact_containments`'s unique constraint on the
  `(parent_artifact_id, child_artifact_id)` pair, not `child_artifact_id`
  alone) is genuinely many-to-many already, so a future multi-story UI needs
  no schema change, only a different application rule and a different
  `StoryPicker.tsx`/`MemoryCardView.tsx` presentation than the
  singular-checkmark one built here.
- ~~No production API surface exists for "remove this memory from its
  story"~~ — **resolved this pass (2026-08-14).** `removeMemoryFromStory`
  (`services/crm/story-containments.ts`) + `PATCH
  /api/sessions/[id]/memories/[memoryId]` action `'remove_story'`, wired to
  `StoryPicker.tsx`'s new "Remove from '[Story]'" popover item exactly as
  this handover's own "Built and verified (prototype)" section above
  describes. Note the unrelated Admin-panel-member-removal gap this bullet
  used to point at (`revokeStoryCollaborator`) was itself resolved
  separately, 2026-08-13 — see `System Docs/Known Gaps.md`'s "Collaborator
  removal" entry — before this memory-removal gap was closed.

### What this handover's other target still is — not attempted here

This pass built the memory detail page's checkmark/remove flow (this file's
"Built and verified" §1) and confirmed §2's "Featured in [Story]" label
already shipped in production (`SessionMemoriesPanel.tsx`, as part of the
2026-08-14 session-memories-panel pass — PR #385, landed the same day as
this handover, independently of it). **Not attempted:** this handover's
`AddMemoriesToStoryPanel` reference (§2's other half — "same card markup in
both" `SessionMemoriesPanel` **and** `AddMemoriesToStoryPanel`) has no
production counterpart. Bulk-adding several memories to a story from the
story's own view is unbuilt entirely (confirmed in the Phase 1a
investigation, `Design Handovers/.../01_real_story_view`) — out of scope
until that picker exists to receive the same "Featured in" treatment.
