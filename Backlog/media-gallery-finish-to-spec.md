# MediaGallery — Finish to Match Original Spec

**Status:** Deferred. The existing `MediaGallery.tsx` is being wired into
navigation now (2026-08-05) as-is — functional, but simpler than the
original design. This document captures what's still missing so it isn't
lost once the simple version ships and feels "done."

**Date:** 2026-08-05

---

## What shipped (2026-08-05)

`components/shells/membership/MediaGallery.tsx` — a real, working flat
list of every media item: status badges, expandable extracted content,
working download and retry buttons, loading/empty states. Wired into
navigation for the first time today.

## What the original spec envisioned, not yet built

Per `Design Handovers/media-items-spec_updated August 2026.md`'s "Media
Section — Navigation" concept:

- **Grouped by story, not a flat list.** "The Media section is a gallery
  of everything a member has shared — not a file manager. It's organised
  by story... each story has a strip of thumbnails/file rows below its
  title." Files without a `story_id` should appear under "Unassigned."
- **Tappable navigation back to the source chat.** Each item should link
  back to the conversation it came from. Not present in the shipped
  version at all.
- **Actual thumbnails for images**, not a generic type icon.
- The emotional framing from the spec — "the source material shelf" — is
  a real design intent the flat-list version doesn't fully deliver on.

## Not in scope for this document

No implementation plan. This is a placeholder so the gap is visible, not
a scoped feature — pick up when there's room to actually design the
story-grouping and navigation pieces properly.
