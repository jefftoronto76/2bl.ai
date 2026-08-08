# Handoff — Memory processing & saved states

Atomic, single-piece follow-up to `design_handoff_memories/` — do not re-open the rest of that
package. Two changes only, both already built and confirmed in the prototype
(`chat-widget-canvas.jsx`'s `UploadingCard` and the `saved` branch of its `MemoryCard`), neither
built on `main` yet.

**Direction of travel: prototype → main.** These are not main's current behavior; main should be
brought up to match the prototype, not the reverse.

---

## 1. Running state: pill → full card

**Main today** (`components/shells/membership/memory/MemoryCard.tsx`, `MemoryRunningPill`): a bare
pill — pulsing kind icon + one line of copy, no card chrome.

**Prototype / target** (`MemoryRunningCard.tsx` in this folder): a full card, same shape as the
eventual draft card (radius 16, max-width 520, 1px `border-strong`, same shadow) so the card
doesn't change size when it resolves from running → draft. Contents:

1. Header — kind icon + eyebrow (same eyebrow the draft card's header will show).
2. Media placeholder, kind-dependent — a pulsing glow behind the kind icon (photo/video: full
   media-block-shaped placeholder; audio/document: a shimmering bar next to a pulsing icon badge).
3. A crossfading status ticker cycling through 2-4 kind-specific phrases every ~1.3s
   (`RUNNING_STEPS` in the component — e.g. photo: "Uploading your photo" → "Looking closely" →
   "Remembering the moment" → "Almost there").
4. A thin progress bar easing toward 92% (deliberately never 100% — real completion time is
   unknown; see `design_handoff_memories/README.md` §2, "How long does the tool call actually
   take?", which is still unanswered).

Swap `MemoryRunningPill` for `MemoryRunningCard` at the one call site
(`renderMemorySlot` in `MessageList.tsx`, the `memories.isPending(anchorId)` branch) — same props
shape, just pass `sourceKind`/`kind` and the kind's `eyebrow` through instead of the pill's copy.

## 2. Saved state: receipt copy

**Main today** (`MemorySavedReceipt`): title is the raw, truncated first line of the anchor
message (`deriveFallbackMemoryTitle` or a `[MEMORY_TITLE:]` marker); subtitle is a plain "Kept".

**Prototype / target:** title is always the memory's own generated short title (2-6 words,
chapter-like — same title the draft card shows, just not re-derived from raw text); subtitle
reads **"Kept in {story name}"** (falls back to "Kept in your book" if no story is attached).

No new component needed for this half — it's a copy/data-source change inside the existing
`MemorySavedReceipt`:

```diff
- <span>{memory.title}</span>
+ <span>{memory.title}</span>   {/* unchanged element — the fix is upstream: never overwrite
+                                   memory.title with a raw-text fallback; keep whatever title
+                                   the archivist call (or the visitor's own edit) produced */}
- Kept
+ Kept in {story?.name ?? 'your book'}
```

This does assume a memory can resolve which story it belongs to at render time — main's `Memory`
row may not currently carry a `story_id`/join today. If it doesn't, that's a small schema/query
addition, not a UI question — flag it back rather than shipping "Kept" as a silent partial.

---

## Out of scope

Everything else in `design_handoff_memories/README.md` — draft card layout, Keep/Rewrite/Discard
spine, photo slots, sidebar counts — is unchanged and already matches main. Don't touch it as part
of this piece.
