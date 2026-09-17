# Handover — Story deck redesign, cover/back pages, preview, and a sidenav fix

Source: `prototype-reference/story-canvas-panel.jsx` (`Deck`, `DeckRow`, `DeckGridTile`, `DeckEndRow`/`DeckEndTile`, `AddMenu`, `CoverBackPanel`, `PreviewModal`, `CardView`) and `prototype-reference/chat-widget-canvas.jsx` (wiring, plus the one sidenav bug fix). Prototype entry point: `Heirloom Lander - Page Flip.html` in this folder — open a story from the sidebar ("A Life in Full") to reach everything below.

## What changed, in the order you'd hit it

**1. Deck (story page) card layout.** Rows are now a uniform height regardless of content. A thumbnail only renders when the memory actually has photo/video content (`kind.media === 'still' | 'video'`) — text, audio, and document memories show just title, date, and passage text, no icon box. A memory that could hold mixed content types (`mem.kinds`, if ever populated) shows one dominant icon by priority (photo > video > audio > document > text) rather than trying to represent every type present.

**2. "Add" menu.** Replaces the old bare "+" — now a menu with three options: **Memory** (opens the existing "add existing memories to this story" panel, unchanged), **Cover page**, **Back page**.

**3. Cover / back pages.** New concept, not in production at all. Picking "Cover page" or "Back page" opens `CoverBackPanel`: 3 predefined templates each (cover: Photo cover / Classic title / Title + line; back: Closing note / Photo + line / Blank), a heading field, an optional short text field, and an image slot when the template calls for one. Saved cover/back render as a distinct dashed-border row (list view) or a matching-size tile pinned first/last (grid view) in the deck.

**4. List/Grid toggle.** New segmented control in the Deck header (icon-only, between Add and Preview). Grid uses a CSS grid with fixed-width tracks (`repeat(auto-fill, minmax(220px, 1fr))`) — deliberately not flex-wrap with flex-grow, which stretched tiles in a short trailing row. Grid tiles: image-forward when there's real media, text-only (no image area) otherwise. Drag-and-drop reorder works the same way in both views.

**5. Preview.** New "Preview" button opens a full book-view reader — cover → memories → back, paginated. Novel/Landscape toggle is locked to the real trims from Lulu print research: Novel (6×9) = 0.667 ratio, Landscape (9×7) = 1.286 ratio, shown with a safe-margin inset and a thin bleed line. This is view-only; it does not persist a print size anywhere.

**6. Share — stub only.** A disabled Share button now sits on both the Deck header and the Preview modal header, using the share/export tray icon (not the collaborators/people icon — that's a different, existing action). It does nothing on click. No share/publish behavior is designed or built anywhere in this package.

**7. "All stories" removed** from the Deck header — redundant with the sidebar's own story switcher, which was always the real entry point.

**8. Mobile.** Drag-and-drop reorder becomes up/down chevrons per row (native HTML5 drag doesn't work on touch). Preview's button still shows, but tapping it surfaces a toast ("Preview looks best on a bigger screen — open Heirloom on your computer to see the finished book.") instead of opening the reader — no mobile book-reading experience was designed this round.

**9. Sidenav bug fix (not story-specific).** The main sidebar (`chat-widget-canvas.jsx`'s `Sidebar`) was hard-forced to a 60px collapsed width any time the memory panel was open (`width: panelOpen ? 60 : sideW`), so its own "Expand menu" toggle silently did nothing while a memory was open. Fixed: the sidebar now always follows `sideW` state; the memory-panel width clamp math (`cardW`'s min/max) now reads the live sidebar width instead of a hardcoded `60`.

**10. `CardView` (the memory editor panel) reverted to production parity.** This one wasn't a new feature — it was a correction. The prototype's `CardView` had drifted from production (`MemoryCardView.tsx` + `BlockCanvas.tsx`): a Novel/Landscape format toggle, multi-memory prev/next paging with a page-flip animation, and a 6-block-type canvas (text/image/gallery/video/quote/divider) with drag-reorder. None of that exists in production. `CardView` now matches production's real shape: editable title, story-picker (+/checkmark), read-only date/eyebrow meta (no page controls at all), a text+image-only block canvas with a "+" inserter before/after every block (no reorder), and an icon-only footer (Talk about this / Use as a base / Remove). Text commits on every keystroke, matching production exactly.

**11. Slide-from-right transition.** Opening a memory card from the deck now slides in from the right (`sc-slide-right` / `sc-slide-right-in`), replacing the old rise/pop-in (`sc-slide-up`) for that one transition. The deck and story-menu views still use the original rise-in.

## Known-knowns

- The Deck's drag-and-drop reorder (desktop) writes back to the actual memory order in local state immediately — not decorative, same as before this session.
- `CardView`'s block canvas now behaves exactly like production's: text commits every keystroke via `onEdit`/`commit`, image blocks are removable but a memory's last non-empty text block cannot be removed (mirrors `canRemoveBlock` in `BlockCanvas.tsx`).
- The Preview modal's trim ratios (0.667 / 1.286) are hard constants, not derived from anything configurable — confirmed against the Lulu research given for this round.
- Cover/back data lives on the `story` object itself (`story.cover`, `story.backPage`) in this prototype's local state — not a new memory, not part of the `memories` array.

## Known-unknowns

- **Share/Publish has no defined behavior anywhere** — not in this prototype, not in production. The button existing (disabled) is scope marking, not a decision about what sharing/publishing a story should actually do (export? a public link? something else?).
- **Cover/back pages have no production counterpart at all** — no schema, no API, nothing. Field set (heading, optional short text, optional image, 3 templates each) is this session's proposal, not confirmed against any backend design.
- **Whether cover/back should support more than one image, or richer template fields**, hasn't been asked — kept deliberately minimal per this round's brief ("small, fixed set of predefined templates").
- **List/Grid view preference isn't persisted** anywhere (resets to List on reopen) — whether it should remember per-story or globally hasn't been decided.
- **Mobile Preview's "bigger screen" toast is a placeholder decision**, not a confirmed direction — the brief allowed either hiding the entry point entirely or showing a message; this round picked the message.
- **The sidenav bug fix scope was intentionally narrow** — it makes the existing "Expand menu" toggle work again; it does not address whether the sidebar *should* auto-collapse when the memory panel opens in the first place (that behavior — forcing collapse on open — is unchanged, only the ability to manually re-expand afterward was broken and is now fixed).
- **No print-size selection beyond Novel/Landscape exists** — the brief flagged that multiple print trims may be offered later; Preview only ever shows these two fixed shapes.
