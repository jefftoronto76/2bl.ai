# Stage 1 \u2014 Media page layout

## What this covers
The page shell for both surfaces Media appears in, and the grid that lays out cards.

## Standalone page (`chat-widget-canvas.jsx`, App-level render, search for `aria-label="Media"` near the end of the file)
- Full-screen overlay: `position: fixed; inset: 0`, slides in via `transform: translateX(100%) \u2192 translateX(0)`, `.45s cubic-bezier(.22,1,.36,1)`.
- Backdrop is a separate sibling div (`zIndex: 57`) under the panel (`zIndex: 58`) \u2014 clicking the backdrop closes the page; clicking inside the panel calls `stopPropagation()`.
- Header: Legacy brand mark (left) + Upload button + Close (right). No "back to chat" button \u2014 removed per explicit request; Media is not conceptually tied to any chat session.
- Body: a centered content column, `width: 100%, maxWidth: 780px, padding: 28px 24px`. This 780px cap was chosen specifically so exactly 3 cards fit per row at max width (see grid below) \u2014 don't treat it as an arbitrary reading-width choice.

## In-chat panel (`function MediaGallery`)
- Renders inside the SAME third-pane slot the memory panel (`CardView`) uses \u2014 desktop: a resizable flex-basis column; mobile: a bottom sheet. Mutually exclusive with the memory panel and with itself being open twice; opening one closes the other (`mediaOpen` state, `useEffect` watching `openMemId`/`sessionListOpen`).
- Scoped to the current chat session (`sessionId={activeId}` prop filters `SEED_MEDIA_ITEMS`).
- Simpler header: title + optional back-to-chat chevron (`onBackToChat`/`backLabel` props, currently unused by either call site but built in for future reuse) + close.

## The grid (`function MediaItemsList`)
- **Flex-wrap, not CSS grid** \u2014 changed deliberately per explicit request so columns scale by available width rather than snapping to grid tracks. `display: flex; flexWrap: wrap; gap: 12`.
- Each `MediaCard`: `flex: 1 1 220px; minWidth: 180; maxWidth: 320`.
- At the 780px container cap: 3 \u00d7 220px cards + 2 \u00d7 12px gaps = 756px, leaving room for flex-grow to stretch all 3 evenly \u2014 that's how "3 columns at max width" is achieved. If the container width or gap changes, recheck this math; it's tuned, not automatic.
