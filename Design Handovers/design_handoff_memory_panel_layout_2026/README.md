# Handoff — Memory panel layout

New piece. Not on main. Covers ONLY the three-pane layout mechanic that happens when a saved
memory card is opened — not the card's own content (kept separately, see the note at the bottom).

Source of truth: `chat-widget-canvas.jsx`, loaded by
`Heirloom Lander - Summer 2026 - Story Canvas.html`. Search `panelOpen` in that file to see this
mechanic live; `SCCurtain` (the draggable divider) is defined in `story-canvas-panel.jsx`.

## The trigger

Clicking a saved memory card (anywhere it appears — inline in the transcript, or a row in a
memories list) opens it in a side panel. This is the only trigger this doc covers.

## The three-pane layout, before and after

**Before** (no panel open): two panes — a sidebar (nav + conversation/story/memory lists) at its
normal width, and the chat filling the rest.

**After** (panel open): three panes —

| Pane | Before | After |
|---|---|---|
| Sidebar | its normal width, full nav (labels, lists) | collapses to a 60px icon-only rail |
| Chat | fills remaining space | ~40% of the space remaining after the rail |
| Memory panel | doesn't exist | ~60% of the space remaining after the rail |

The 40/60 split is a **starting point, not a lock** — see resizing below. The sidebar's 60px
collapse is not resizable while the panel is open; it only returns to full width when the panel
closes.

The transition between these two layouts animates (width transition on the sidebar, the panel
sliding in from the right) rather than snapping.

## Resizing — the "curtain"

Both the sidebar boundary and the chat/panel boundary are draggable dividers (called "curtains" in
the prototype):

- A thin (9px) invisible hit-zone between panes. On hover or drag, it lights up: a 1px line turns
  accent-colored and thickens visually via a short accent-colored pill (4×30) centered on it, with
  a soft accent-tinted background wash across the hit-zone.
- Drag horizontally to resize the pane it's attached to. Both neighboring panes respect a minimum
  width so neither can be squeezed away entirely.
- Keyboard-operable, not just drag: focus the divider, arrow keys nudge by 16px, **Home resets to
  the default size** (also reachable via double-click). This reset-on-Home/double-click behavior
  is the "curtain reverts to default" behavior — it applies to whichever divider you reset, sidebar
  or panel.
- While the memory panel is open, only ONE divider is visible: the chat/panel boundary (the
  sidebar is collapsed to its fixed 60px rail and isn't user-resizable in that state). The
  sidebar's own resize divider comes back once the panel closes and the sidebar returns to full
  width.

## Closing the panel

Whatever closes the memory panel reverses the whole layout in one motion: sidebar expands back to
its last full width, chat returns to filling the remaining space, panel slides out.

---

**Not covered here:** what the memory card itself looks like inside the panel, what it contains, or
what actions it exposes — those are a separate piece the implementer should keep as simple as
possible to slot into this panel (a single scrollable container is all this layout requires of it;
no special sizing contract beyond fitting its pane's width).
